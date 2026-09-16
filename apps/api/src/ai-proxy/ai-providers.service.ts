import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OnModuleInit } from '@nestjs/common';
import { CredentialsService } from '../credentials/credentials.service';
import { AiProviderEntity } from './ai-provider.entity';
import { AiModelEntity } from './ai-model.entity';
import { CreateAiProviderDto, UpdateAiProviderDto, CreateAiModelDto, UpdateAiModelDto } from './dto/ai-provider.dto';
import { DEFAULT_MODEL_SENTINEL } from '@codepods/shared-types';

const RESERVED_SLUGS = new Set(['proxy', 'default']);

const DEFAULT_MODEL_CACHE_TTL_MS = 60_000; // 60s

@Injectable()
export class AiProvidersService implements OnModuleInit {
  // Cache for getDefaultModelName: providerId → { name, expiresAt }
  private defaultModelCache = new Map<number, { name: string; expiresAt: number }>();

  constructor(
    @InjectRepository(AiProviderEntity)
    private readonly providers: Repository<AiProviderEntity>,
    @InjectRepository(AiModelEntity)
    private readonly models: Repository<AiModelEntity>,
    private readonly credentials: CredentialsService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensureDefaultProvider();
  }

  /** Promote the first enabled provider to default if none is set. */
  private async ensureDefaultProvider(codepodId = 1): Promise<void> {
    const existing = await this.findDefault(codepodId);
    if (existing) return;
    const first = await this.providers.findOne({ where: { codepodId, enabled: true }, order: { id: 'ASC' } });
    if (first) {
      first.isDefault = true;
      await this.providers.save(first);
    }
  }

  // ---- Providers -------------------------------------------------------

  async findAll(codepodId = 1): Promise<AiProviderEntity[]> {
    return this.providers.find({ where: { codepodId }, order: { name: 'ASC' } });
  }

  async findOne(id: number, codepodId = 1): Promise<AiProviderEntity> {
    const entity = await this.providers.findOne({ where: { id, codepodId } });
    if (!entity) throw new NotFoundException('AI provider not found');
    return entity;
  }

  async findBySlug(slug: string, codepodId = 1): Promise<AiProviderEntity | null> {
    if (slug === 'default') return this.findDefault(codepodId);
    const entity = await this.providers.findOne({ where: { slug, codepodId } });
    if (entity && !entity.enabled) return null;
    return entity;
  }

  async findDefault(codepodId = 1): Promise<AiProviderEntity | null> {
    const entity = await this.providers.findOne({ where: { codepodId, isDefault: true } });
    if (entity && !entity.enabled) return null;
    return entity;
  }

  async create(dto: CreateAiProviderDto, codepodId = 1): Promise<AiProviderEntity> {
    const slug = await this.ensureUniqueSlug(dto.name, codepodId);
    const count = await this.providers.count({ where: { codepodId } });
    const isFirst = count === 0;
    const entity = this.providers.create({
      codepodId,
      name: dto.name,
      slug,
      type: dto.type ?? 'openai',
      baseUrl: dto.baseUrl.replace(/\/$/, ''),
      apiKeyEnvVar: dto.apiKeyEnvVar ?? null,
      credentialId: dto.credentialId ?? null,
      fallbackModelId: dto.fallbackModelId ?? null,
      isDefault: isFirst || dto.isDefault === true,
      iconUrl: dto.iconUrl ?? null,
      iconDarkUrl: dto.iconDarkUrl ?? null,
    });
    const saved = await this.providers.save(entity);
    if (dto.isDefault) await this.makeDefaultProvider(saved.id, codepodId);
    if (dto.models && dto.models.length > 0) {
      for (const m of dto.models) {
        await this.createModel(saved.id, m, codepodId);
      }
      return this.findOne(saved.id, codepodId);
    }
    return saved;
  }

  async update(id: number, dto: UpdateAiProviderDto, codepodId = 1): Promise<AiProviderEntity> {
    const entity = await this.findOne(id, codepodId);
    if (dto.name !== undefined) {
      entity.name = dto.name;
      entity.slug = await this.ensureUniqueSlug(dto.name, codepodId, entity.id);
    }
    if (dto.type !== undefined) entity.type = dto.type;
    if (dto.baseUrl !== undefined) entity.baseUrl = dto.baseUrl.replace(/\/$/, '');
    if (dto.fallbackModelId !== undefined) entity.fallbackModelId = dto.fallbackModelId;
    if (dto.enabled !== undefined) entity.enabled = dto.enabled;
    if (dto.apiKeyEnvVar !== undefined) entity.apiKeyEnvVar = dto.apiKeyEnvVar;
    if (dto.credentialId !== undefined) entity.credentialId = dto.credentialId;
    if (dto.iconUrl !== undefined) entity.iconUrl = dto.iconUrl;
    if (dto.iconDarkUrl !== undefined) entity.iconDarkUrl = dto.iconDarkUrl;
    const saved = await this.providers.save(entity);
    if (dto.isDefault === true) await this.makeDefaultProvider(saved.id, codepodId);
    return saved;
  }

  async remove(id: number, codepodId = 1): Promise<void> {
    const entity = await this.findOne(id, codepodId);
    const wasDefault = entity.isDefault;
    await this.providers.remove(entity);
    if (wasDefault) {
      // Promote the next enabled provider to default.
      const next = await this.providers.findOne({ where: { codepodId, enabled: true }, order: { id: 'ASC' } });
      if (next) {
        next.isDefault = true;
        await this.providers.save(next);
      }
    }
  }

  async makeDefaultProvider(id: number, codepodId = 1): Promise<void> {
    await this.providers.update({ codepodId }, { isDefault: false });
    await this.providers.update({ id, codepodId, enabled: true }, { isDefault: true });
  }

  // ---- Models ----------------------------------------------------------

  async listModels(providerId: number, codepodId = 1): Promise<AiModelEntity[]> {
    await this.findOne(providerId, codepodId);
    return this.models.find({ where: { providerId }, order: { name: 'ASC' } });
  }

  /** Returns the name of the default model for a provider, or null if none.
   * Used by the AI proxy to resolve `"model":"default"` sentinel values.
   * Results are cached for 60s to avoid a DB query on every proxied request. */
  async getDefaultModelName(providerId: number, codepodId = 1): Promise<string | null> {
    const cached = this.defaultModelCache.get(providerId);
    if (cached && cached.expiresAt > Date.now()) return cached.name;

    const model = await this.models.findOne({ where: { providerId, isDefault: true } });
    const name = model?.name ?? null;
    this.defaultModelCache.set(providerId, { name: name ?? '', expiresAt: Date.now() + DEFAULT_MODEL_CACHE_TTL_MS });
    return name;
  }

  /** Invalidate the cached default model name for a provider. Call when models
   * change (create/update/delete/makeDefault). */
  private invalidateDefaultModelCache(providerId: number): void {
    this.defaultModelCache.delete(providerId);
  }

  async createModel(providerId: number, dto: CreateAiModelDto, codepodId = 1): Promise<AiModelEntity> {
    if (dto.name.toLowerCase() === DEFAULT_MODEL_SENTINEL) {
      throw new BadRequestException('"default" is a reserved model name and cannot be used');
    }
    await this.findOne(providerId, codepodId);
    const count = await this.models.count({ where: { providerId } });
    const isFirst = count === 0;
    const model = this.models.create({
      providerId,
      name: dto.name,
      displayName: dto.displayName ?? null,
      isDefault: isFirst || (dto.isDefault ?? false),
    });
    const saved = await this.models.save(model);
    if (saved.isDefault) await this.makeDefault(saved.id, providerId, codepodId);
    this.invalidateDefaultModelCache(providerId);
    return saved;
  }

  async updateModel(
    providerId: number,
    modelId: number,
    dto: UpdateAiModelDto,
    codepodId = 1,
  ): Promise<AiModelEntity> {
    await this.findOne(providerId, codepodId);
    if (dto.name !== undefined && dto.name.toLowerCase() === DEFAULT_MODEL_SENTINEL) {
      throw new BadRequestException('"default" is a reserved model name and cannot be used');
    }
    const model = await this.models.findOne({ where: { id: modelId, providerId } });
    if (!model) throw new NotFoundException('AI model not found');
    if (dto.name !== undefined) model.name = dto.name;
    if (dto.displayName !== undefined) model.displayName = dto.displayName;
    if (dto.isDefault !== undefined) model.isDefault = dto.isDefault;
    const saved = await this.models.save(model);
    if (saved.isDefault) await this.makeDefault(saved.id, providerId, codepodId);
    this.invalidateDefaultModelCache(providerId);
    return saved;
  }

  async removeModel(providerId: number, modelId: number, codepodId = 1): Promise<void> {
    const model = await this.models.findOne({ where: { id: modelId, providerId } });
    if (!model) throw new NotFoundException('AI model not found');
    if (model.isDefault) {
      // Promote another model to default if any remains.
      const remaining = await this.models.find({
        where: { providerId },
        order: { id: 'ASC' },
      });
      const next = remaining.find((m) => m.id !== modelId);
      if (next) {
        next.isDefault = true;
        await this.models.save(next);
      }
    }
    await this.models.remove(model);
    this.invalidateDefaultModelCache(providerId);
    // Clear provider fallback if it pointed at the removed model.
    const provider = await this.findOne(providerId, codepodId);
    if (provider.fallbackModelId === modelId) {
      provider.fallbackModelId = nextId(provider.models, modelId);
      await this.providers.save(provider);
    }
  }

  async makeDefault(modelId: number, providerId: number, codepodId = 1): Promise<void> {
    await this.findOne(providerId, codepodId);
    await this.models.update({ providerId }, { isDefault: false });
    await this.models.update({ id: modelId, providerId }, { isDefault: true });
    this.invalidateDefaultModelCache(providerId);
  }

  // ---- Key resolution ---------------------------------------------------

  /** Returns the plaintext API key for a provider, or null when none configured.
   * Resolution order: linked credential → apiKeyEnvVar. */
  async resolveApiKey(entity: AiProviderEntity): Promise<string | null> {
    if (entity.credentialId) {
      try {
        const secret = await this.credentials.getSecret(entity.credentialId);
        if (secret) return secret;
      } catch {
        // fall through to env var
      }
    }
    if (entity.apiKeyEnvVar) {
      return process.env[entity.apiKeyEnvVar] ?? null;
    }
    return null;
  }

  // ---- Slug helpers -----------------------------------------------------

  private async ensureUniqueSlug(name: string, codepodId: number, excludeId?: number): Promise<string> {
    const base = slugify(name);
    if (!base) throw new BadRequestException('Provider name must contain alphanumeric characters');
    if (RESERVED_SLUGS.has(base)) throw new BadRequestException(`Name "${name}" produces a reserved slug`);
    let candidate = base;
    let n = 2;
    for (;;) {
      const existing = await this.findBySlug(candidate, codepodId);
      if (!existing || (excludeId !== undefined && existing.id === excludeId)) break;
      candidate = `${base}-${n++}`;
    }
    return candidate;
  }

  // ---- Serialization ---------------------------------------------------

  /** Strip secrets and expose status flags for API responses. */
  toSafe(entity: AiProviderEntity): Omit<AiProviderEntity, never> & {
    hasApiKey: boolean;
    hasCredential: boolean;
  } {
    return {
      ...entity,
      sortOrder: entity.sortOrder ?? 0,
      hasApiKey: (!!entity.apiKeyEnvVar && !!process.env[entity.apiKeyEnvVar]) || !!entity.credentialId,
      hasCredential: !!entity.credentialId,
    };
  }

  /** Batch-update manual sort order. Assigns sequential sortOrder (1-based). */
  async reorder(ids: number[], codepodId = 1): Promise<void> {
    await this.providers.manager.transaction(async (tx) => {
      await tx.update(AiProviderEntity, { codepodId }, { sortOrder: 0 });
      for (let i = 0; i < ids.length; i++) {
        await tx.update(AiProviderEntity, { id: ids[i], codepodId }, { sortOrder: i + 1 });
      }
    });
  }
}

function nextId(models: AiModelEntity[], removedId: number): number | null {
  const next = models.find((m) => m.id !== removedId);
  return next ? next.id : null;
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}