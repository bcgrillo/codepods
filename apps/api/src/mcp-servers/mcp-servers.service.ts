import { Injectable, BadRequestException, NotFoundException, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { McpServerEntity } from './mcp-server.entity';
import { AgentMcpServerEntity } from './agent-mcp-server.entity';
import { CreateMcpServerDto, UpdateMcpServerDto } from './dto/mcp-server.dto';
import { McpCacheBridge } from '../mcp/mcp-cache-bridge';
import type { McpServer } from '@codepods/shared-types';

const RESERVED_SLUGS = new Set(['codepods', 'builtin', 'default']);
const BUILT_IN_SLUG = 'codepods';

@Injectable()
export class McpServersService implements OnModuleInit {
  private readonly logger = new Logger(McpServersService.name);

  constructor(
    @InjectRepository(McpServerEntity)
    private readonly repo: Repository<McpServerEntity>,
    @InjectRepository(AgentMcpServerEntity)
    private readonly assignmentRepo: Repository<AgentMcpServerEntity>,
    private readonly cacheBridge: McpCacheBridge,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensureBuiltIn();
  }

  /** Ensure the built-in CodePods MCP server row exists (not deletable). */
  private async ensureBuiltIn(codepodId = 1): Promise<void> {
    const existing = await this.repo.findOne({ where: { codepodId, slug: BUILT_IN_SLUG } });
    if (existing) {
      if (!existing.builtIn) {
        existing.builtIn = true;
        existing.enabled = true;
        await this.repo.save(existing);
      }
      return;
    }
    const entity = this.repo.create({
      codepodId,
      name: 'CodePods',
      slug: BUILT_IN_SLUG,
      transport: 'http',
      url: null,
      credentialId: null,
      enabled: true,
      builtIn: true,
      connectAllAgents: true,
    });
    await this.repo.save(entity);
    this.logger.log('Seeded built-in CodePods MCP server');
  }

  async findAll(codepodId = 1): Promise<McpServer[]> {
    const list = await this.repo.find({ where: { codepodId }, order: { builtIn: 'DESC', name: 'ASC' } });
    return list.map((s) => this.toSafe(s));
  }

  async findOne(id: number, codepodId = 1): Promise<McpServer> {
    return this.toSafe(await this.findEntity(id, codepodId));
  }

  /** Returns enabled server entities (for proxy use; includes built-in). */
  async findEnabled(codepodId = 1): Promise<McpServerEntity[]> {
    return this.repo.find({ where: { codepodId, enabled: true }, order: { builtIn: 'DESC', name: 'ASC' } });
  }

  async findBySlug(slug: string, codepodId = 1): Promise<McpServerEntity | null> {
    return this.repo.findOne({ where: { slug, codepodId } });
  }

  /** Find a server entity by ID (includes sensitive fields like url/credentialId). */
  async findEntityById(id: number, codepodId = 1): Promise<McpServerEntity | null> {
    return this.repo.findOne({ where: { id, codepodId } });
  }

  async create(dto: CreateMcpServerDto, codepodId = 1): Promise<McpServer> {
    const slug = await this.ensureUniqueSlug(dto.slug ?? dto.name, codepodId);
    if ((dto.transport ?? 'http') === 'stdio') {
      throw new BadRequestException('stdio transport is not supported yet');
    }
    if (!dto.url && (dto.transport ?? 'http') === 'http') {
      throw new BadRequestException('URL is required for http transport');
    }
    const entity = this.repo.create({
      codepodId,
      name: dto.name,
      slug,
      transport: dto.transport ?? 'http',
      url: dto.url ?? null,
      credentialId: dto.credentialId ?? null,
      enabled: dto.enabled ?? true,
      builtIn: false,
      connectAllAgents: dto.connectAllAgents ?? false,
    });
    const saved = await this.repo.save(entity);
    return this.toSafe(saved);
  }

  async update(id: number, dto: UpdateMcpServerDto, codepodId = 1): Promise<McpServer> {
    const entity = await this.findEntity(id, codepodId);
    if (entity.builtIn) {
      // Built-in: only allow toggling enabled; reject transport/url/slug changes.
      if (dto.transport !== undefined || dto.url !== undefined || dto.slug !== undefined) {
        throw new BadRequestException('Built-in MCP server transport/url/slug cannot be changed');
      }
      if (dto.name !== undefined) entity.name = dto.name;
      if (dto.enabled !== undefined) entity.enabled = dto.enabled;
      if (dto.credentialId !== undefined) entity.credentialId = dto.credentialId ?? null;
      if (dto.connectAllAgents !== undefined) entity.connectAllAgents = dto.connectAllAgents;
      const saved = await this.repo.save(entity);
      this.cacheBridge.invalidate(saved.id);
      return this.toSafe(saved);
    }
    if (dto.name !== undefined) entity.name = dto.name;
    if (dto.slug !== undefined && dto.slug !== entity.slug) {
      entity.slug = await this.ensureUniqueSlug(dto.slug, codepodId, id);
    }
    if (dto.transport !== undefined) {
      if (dto.transport === 'stdio') throw new BadRequestException('stdio transport is not supported yet');
      entity.transport = dto.transport;
    }
    if (dto.url !== undefined) entity.url = dto.url ?? null;
    if (dto.credentialId !== undefined) entity.credentialId = dto.credentialId ?? null;
    if (dto.enabled !== undefined) entity.enabled = dto.enabled;
    if (dto.connectAllAgents !== undefined) entity.connectAllAgents = dto.connectAllAgents;
    const saved = await this.repo.save(entity);
    this.cacheBridge.invalidate(saved.id);
    return this.toSafe(saved);
  }

  async remove(id: number, codepodId = 1): Promise<void> {
    const entity = await this.findEntity(id, codepodId);
    if (entity.builtIn) throw new BadRequestException('Built-in MCP server cannot be deleted');
    // Cascade: remove all agent assignments for this server.
    await this.assignmentRepo.delete({ mcpServerId: id });
    await this.repo.remove(entity);
    this.cacheBridge.invalidate(id);
  }

  async reorder(ids: number[], codepodId = 1): Promise<void> {
    await this.repo.manager.transaction(async (tx) => {
      await tx.update(McpServerEntity, { codepodId }, { sortOrder: 0 });
      for (let i = 0; i < ids.length; i++) {
        await tx.update(McpServerEntity, { id: ids[i], codepodId }, { sortOrder: i + 1 });
      }
    });
  }

  // ---- Per-agent assignment (N:M) ----------------------------------------

  /** Connect an MCP server to an agent (idempotent — skips if already assigned). */
  async assignToAgent(agentId: string, mcpServerId: number): Promise<McpServer> {
    const server = await this.findEntity(mcpServerId);
    const existing = await this.assignmentRepo.findOne({ where: { agentId, mcpServerId } });
    if (!existing) {
      await this.assignmentRepo.save({ agentId, mcpServerId });
    }
    return this.toSafe(server);
  }

  /** Disconnect an MCP server from an agent (no-op if not assigned). */
  async removeFromAgent(agentId: string, mcpServerId: number): Promise<void> {
    await this.assignmentRepo.delete({ agentId, mcpServerId });
  }

  /** Disconnect all MCP servers from an agent. Called during agent deletion
   *  to avoid FK constraint violations on the junction table. */
  async removeAllFromAgent(agentId: string): Promise<void> {
    await this.assignmentRepo.delete({ agentId });
  }

  /** List all MCP servers assigned to an agent. */
  async listForAgent(agentId: string): Promise<McpServer[]> {
    const rows = await this.assignmentRepo.find({ where: { agentId } });
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.mcpServerId);
    const servers = await this.repo.find({ where: { id: In(ids) }, order: { builtIn: 'DESC', name: 'ASC' } });
    return servers.map((s) => this.toSafe(s));
  }

  /** Find server entities with connectAllAgents=true (for auto-connect on creation). */
  async findConnectAll(codepodId = 1): Promise<McpServerEntity[]> {
    return this.repo.find({ where: { codepodId, connectAllAgents: true, enabled: true }, order: { builtIn: 'DESC', name: 'ASC' } });
  }

  /** Check whether a server slug is assigned to an agent. */
  async isAssignedToAgent(agentId: string, slug: string): Promise<boolean> {
    const server = await this.findBySlug(slug);
    if (!server) return false;
    const row = await this.assignmentRepo.findOne({ where: { agentId, mcpServerId: server.id } });
    return !!row;
  }

  // ---- Internal helpers --------------------------------------------------

  private async findEntity(id: number, codepodId = 1): Promise<McpServerEntity> {
    const entity = await this.repo.findOne({ where: { id, codepodId } });
    if (!entity) throw new NotFoundException('MCP server not found');
    return entity;
  }

  private async ensureUniqueSlug(candidate: string, codepodId: number, excludeId?: number): Promise<string> {
    const base = slugify(candidate);
    if (!base) throw new BadRequestException('Name/slug must contain alphanumeric characters');
    if (RESERVED_SLUGS.has(base)) throw new BadRequestException(`Slug "${base}" is reserved`);
    let slug = base;
    let n = 2;
    for (;;) {
      const existing = await this.findBySlug(slug, codepodId);
      if (!existing || (excludeId !== undefined && existing.id === excludeId)) break;
      slug = `${base}-${n++}`;
    }
    return slug;
  }

  toSafe(entity: McpServerEntity): McpServer {
    return {
      id: entity.id,
      codepodId: entity.codepodId,
      name: entity.name,
      slug: entity.slug,
      transport: entity.transport as 'http' | 'stdio',
      url: entity.url,
      credentialId: entity.credentialId,
      enabled: entity.enabled,
      builtIn: entity.builtIn,
      connectAllAgents: entity.connectAllAgents,
      sortOrder: entity.sortOrder,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
    };
  }
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}