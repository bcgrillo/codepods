import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ManagedApiEntity } from './managed-api.entity';
import { CreateManagedApiDto, UpdateManagedApiDto } from './dto/managed-api.dto';
import { CredentialsService } from '../credentials/credentials.service';
import type { ManagedApi } from '@codepods/shared-types';

export interface CallApiRequest {
  apiName: string;
  method: string;
  path: string;
  queryParams?: Record<string, string>;
  headers?: Record<string, string>;
  body?: string;
}

export interface CallApiResult {
  status: number;
  headers: Record<string, string>;
  body: string;
}

@Injectable()
export class ManagedApisService {
  constructor(
    @InjectRepository(ManagedApiEntity)
    private readonly repo: Repository<ManagedApiEntity>,
    private readonly credentials: CredentialsService,
  ) {}

  async findAll(codepodId = 1): Promise<ManagedApi[]> {
    const list = await this.repo.find({ where: { codepodId }, order: { name: 'ASC' } });
    return list.map((e) => this.toSafe(e));
  }

  async findOne(id: number, codepodId = 1): Promise<ManagedApi> {
    return this.toSafe(await this.findEntity(id, codepodId));
  }

  async create(dto: CreateManagedApiDto, codepodId = 1): Promise<ManagedApi> {
    const entity = this.repo.create({
      codepodId,
      name: dto.name,
      description: dto.description ?? null,
      baseUrl: dto.baseUrl.replace(/\/$/, ''),
      credentialId: dto.credentialId ?? null,
      headerPattern: dto.headerPattern,
      enabled: dto.enabled ?? true,
    });
    const saved = await this.repo.save(entity);
    return this.toSafe(saved);
  }

  async update(id: number, dto: UpdateManagedApiDto, codepodId = 1): Promise<ManagedApi> {
    const entity = await this.findEntity(id, codepodId);
    if (dto.name !== undefined) entity.name = dto.name;
    if (dto.description !== undefined) entity.description = dto.description;
    if (dto.baseUrl !== undefined) entity.baseUrl = dto.baseUrl.replace(/\/$/, '');
    if (dto.credentialId !== undefined) entity.credentialId = dto.credentialId;
    if (dto.headerPattern !== undefined) entity.headerPattern = dto.headerPattern;
    if (dto.enabled !== undefined) entity.enabled = dto.enabled;
    const saved = await this.repo.save(entity);
    return this.toSafe(saved);
  }

  async remove(id: number, codepodId = 1): Promise<void> {
    const entity = await this.findEntity(id, codepodId);
    await this.repo.remove(entity);
  }

  /** Return the list of enabled APIs without exposing credentials (for the
   *  built-in MCP tool get_available_apis). */
  async listAvailable(codepodId = 1): Promise<{ name: string; baseUrl: string; description: string | null }[]> {
    const list = await this.repo.find({ where: { codepodId, enabled: true }, order: { name: 'ASC' } });
    return list.map((e) => ({ name: e.name, baseUrl: e.baseUrl, description: e.description }));
  }

  /** Execute an HTTP request against a managed API, injecting the credential
   *  into the auth header. The agent never sees the actual secret. */
  async callApi(req: CallApiRequest, codepodId = 1): Promise<CallApiResult> {
    const entity = await this.repo.findOne({ where: { name: req.apiName, codepodId } });
    if (!entity) throw new NotFoundException(`Managed API "${req.apiName}" not found`);
    if (!entity.enabled) throw new BadRequestException(`Managed API "${req.apiName}" is disabled`);

    const method = req.method.toUpperCase();
    if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].includes(method)) {
      throw new BadRequestException(`Unsupported HTTP method: ${method}`);
    }

    // Build URL: baseUrl + path + query string
    const cleanPath = req.path.startsWith('/') ? req.path : `/${req.path}`;
    let url = `${entity.baseUrl}${cleanPath}`;
    if (req.queryParams && Object.keys(req.queryParams).length > 0) {
      const qs = new URLSearchParams(req.queryParams).toString();
      url += `?${qs}`;
    }

    // Build headers: start with the auth header pattern, then add any
    // extra headers from the agent (agent cannot override the auth header).
    const headers: Record<string, string> = {};
    if (entity.credentialId) {
      const secret = await this.credentials.getSecret(entity.credentialId, codepodId);
      if (secret) {
        const [key, ...rest] = entity.headerPattern.split(':');
        const value = rest.join(':').replace('{key}', secret).trim();
        headers[key.trim()] = value;
      }
    }
    if (req.headers) {
      for (const [k, v] of Object.entries(req.headers)) {
        // Prevent the agent from overriding the auth header.
        const authKey = entity.headerPattern.split(':')[0].trim().toLowerCase();
        if (k.toLowerCase() === authKey) continue;
        headers[k] = v;
      }
    }

    // Default Content-Type to application/json when a body is present, but
    // only if the caller hasn't already specified one (e.g. application/json-patch+json).
    if (req.body && !Object.keys(headers).some((k) => k.toLowerCase() === 'content-type')) {
      headers['Content-Type'] = 'application/json';
    }

    const res = await fetch(url, {
      method,
      headers,
      body: req.body || undefined,
    });

    const responseHeaders: Record<string, string> = {};
    res.headers.forEach((v, k) => { responseHeaders[k] = v; });
    const body = await res.text();

    return { status: res.status, headers: responseHeaders, body };
  }

  // ---- Internal helpers --------------------------------------------------

  private async findEntity(id: number, codepodId = 1): Promise<ManagedApiEntity> {
    const entity = await this.repo.findOne({ where: { id, codepodId } });
    if (!entity) throw new NotFoundException('Managed API not found');
    return entity;
  }

  private toSafe(entity: ManagedApiEntity): ManagedApi {
    return {
      id: entity.id,
      codepodId: entity.codepodId,
      name: entity.name,
      description: entity.description,
      baseUrl: entity.baseUrl,
      credentialId: entity.credentialId,
      headerPattern: entity.headerPattern,
      enabled: entity.enabled,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
    };
  }
}