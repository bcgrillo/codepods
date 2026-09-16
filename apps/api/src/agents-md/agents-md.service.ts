import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import { AgentsMdEntity } from './agents-md.entity';
import type { AgentsMd, CreateAgentsMdDto, UpdateAgentsMdDto } from '@codepods/shared-types';

@Injectable()
export class AgentsMdService {
  constructor(
    @InjectRepository(AgentsMdEntity)
    private readonly repo: Repository<AgentsMdEntity>,
  ) {}

  async findAll(codepodId = 1): Promise<AgentsMd[]> {
    const list = await this.repo.find({ where: { codepodId }, order: { alias: 'ASC' } });
    return list.map((e) => this.toSafe(e));
  }

  async findOne(id: number, codepodId = 1): Promise<AgentsMd> {
    const entity = await this.repo.findOne({ where: { id, codepodId } });
    if (!entity) throw new NotFoundException('AGENTS.md version not found');
    return this.toSafe(entity);
  }

  async getDefault(codepodId = 1): Promise<AgentsMd | null> {
    const entity = await this.repo.findOne({ where: { codepodId, isDefault: true } });
    return entity ? this.toSafe(entity) : null;
  }

  async create(dto: CreateAgentsMdDto, codepodId = 1): Promise<AgentsMd> {
    const entity = this.repo.create({ ...dto, codepodId });
    const saved = await this.repo.save(entity);
    if (dto.isDefault) await this.setDefaultInternal(saved.id, codepodId);
    const reloaded = await this.repo.findOneBy({ id: saved.id });
    if (!reloaded) throw new NotFoundException('AGENTS.md version not found after save');
    return this.toSafe(reloaded);
  }

  async update(id: number, dto: UpdateAgentsMdDto, codepodId = 1): Promise<AgentsMd> {
    const entity = await this.repo.findOne({ where: { id, codepodId } });
    if (!entity) throw new NotFoundException('AGENTS.md version not found');
    Object.assign(entity, dto);
    const saved = await this.repo.save(entity);
    if (dto.isDefault) await this.setDefaultInternal(saved.id, codepodId);
    return this.toSafe(saved);
  }

  async remove(id: number, codepodId = 1): Promise<void> {
    const entity = await this.repo.findOne({ where: { id, codepodId } });
    if (!entity) throw new NotFoundException('AGENTS.md version not found');
    if (entity.isDefault) throw new BadRequestException('Cannot delete the default AGENTS.md version');
    await this.repo.delete(id);
  }

  async setDefault(id: number, codepodId = 1): Promise<AgentsMd> {
    await this.setDefaultInternal(id, codepodId);
    const entity = await this.repo.findOneBy({ id });
    if (!entity) throw new NotFoundException('AGENTS.md version not found');
    return this.toSafe(entity);
  }

  private async setDefaultInternal(id: number, codepodId: number): Promise<void> {
    await this.repo.update({ codepodId, isDefault: true }, { isDefault: false });
    await this.repo.update({ id, codepodId }, { isDefault: true });
  }

  /**
   * Seeds the default AGENTS.md on first run (when no records exist).
   */
  async seedIfEmpty(codepodId = 1): Promise<void> {
    const count = await this.repo.count({ where: { codepodId } });
    if (count > 0) return;

    const defaultContent = fs.readFileSync(
      path.join(__dirname, 'default-agents.md'),
      'utf8',
    );

    await this.repo.save(
      this.repo.create({
        codepodId,
        alias: 'Default',
        content: defaultContent,
        isDefault: true,
      }),
    );
  }

  private toSafe(e: AgentsMdEntity): AgentsMd {
    return {
      id: e.id,
      codepodId: e.codepodId,
      alias: e.alias,
      content: e.content,
      isDefault: e.isDefault,
      createdAt: e.createdAt.toISOString(),
      updatedAt: e.updatedAt.toISOString(),
    };
  }
}