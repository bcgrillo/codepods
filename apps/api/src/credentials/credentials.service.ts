import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CryptoService } from '../secrets/crypto.service';
import { CredentialEntity } from './credential.entity';
import { CreateCredentialDto, UpdateCredentialDto } from './dto/credential.dto';
import type { Credential } from '@codepods/shared-types';

@Injectable()
export class CredentialsService {
  constructor(
    @InjectRepository(CredentialEntity)
    private readonly repo: Repository<CredentialEntity>,
    private readonly crypto: CryptoService,
  ) {}

  async findAll(codepodId = 1): Promise<Credential[]> {
    const list = await this.repo.find({ where: { codepodId }, order: { label: 'ASC' } });
    return list.map((c) => this.toSafe(c));
  }

  async findOne(id: number, codepodId = 1): Promise<Credential> {
    return this.toSafe(await this.findEntity(id, codepodId));
  }

  /** Returns the decrypted secret. Internal use only (e.g. MCP proxy, ai-proxy). */
  async getSecret(id: number, codepodId = 1): Promise<string | null> {
    const entity = await this.findEntity(id, codepodId);
    if (!entity.secret) return null;
    return this.crypto.decrypt(entity.secret);
  }

  async create(dto: CreateCredentialDto, codepodId = 1): Promise<Credential> {
    const entity = this.repo.create({
      codepodId,
      label: dto.label,
      type: dto.type ?? 'key',
      host: dto.host ?? null,
      username: dto.type === 'user_pass' ? dto.username ?? null : null,
      secret: dto.secret ? this.crypto.encrypt(dto.secret) : null,
    });
    const saved = await this.repo.save(entity);
    return this.toSafe(saved);
  }

  async update(id: number, dto: UpdateCredentialDto, codepodId = 1): Promise<Credential> {
    const entity = await this.findEntity(id, codepodId);
    if (dto.label !== undefined) entity.label = dto.label;
    if (dto.type !== undefined) {
      entity.type = dto.type;
      if (dto.type !== 'user_pass') entity.username = null;
    }
    if (dto.host !== undefined) entity.host = dto.host ?? null;
    if (dto.username !== undefined && entity.type === 'user_pass') {
      entity.username = dto.username ?? null;
    }
    if (dto.secret !== undefined) {
      entity.secret = dto.secret && dto.secret.length > 0 ? this.crypto.encrypt(dto.secret) : null;
    }
    const saved = await this.repo.save(entity);
    return this.toSafe(saved);
  }

  async remove(id: number, codepodId = 1): Promise<void> {
    const entity = await this.findEntity(id, codepodId);
    await this.repo.remove(entity);
  }

  // ---- Internal helpers --------------------------------------------------

  private async findEntity(id: number, codepodId = 1): Promise<CredentialEntity> {
    const entity = await this.repo.findOne({ where: { id, codepodId } });
    if (!entity) throw new NotFoundException('Credential not found');
    return entity;
  }

  /** Strip the encrypted secret; expose a `hasSecret` flag for API responses. */
  toSafe(entity: CredentialEntity): Credential {
    return {
      id: entity.id,
      codepodId: entity.codepodId,
      label: entity.label,
      type: entity.type as 'key' | 'user_pass',
      host: entity.host,
      username: entity.username,
      hasSecret: !!entity.secret,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
    };
  }
}