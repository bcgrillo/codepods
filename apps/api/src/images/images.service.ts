import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { execFile } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { promisify } from 'node:util';
import type {
  AgentServiceType,
  CreateImageTemplateDto,
  ImageTemplate,
  ImageTemplateManifest,
  ImageTemplateManifestService,
  UpdateImageTemplateDto,
} from '@codepods/shared-types';
import { DockerImageBuildError, DockerService } from '../docker/docker.service';
import { ImageTemplateEntity } from './image-template.entity';
import { ImageTemplateInspectorService } from './image-template-inspector.service';

const execFileAsync = promisify(execFile);

export interface EnsureImageResult {
  imageRef: string;
  action: 'existing' | 'built' | 'missing';
  needsUpdate: boolean;
  currentCommit: string;
  currentTag: string | null;
  builtCommit: string | null;
  builtTag: string | null;
  buildOutput: string[];
}

interface EnsureImageForAgentCreationResult {
  imageRef: string;
  services: Array<{ type: AgentServiceType; name: string; port: number }>;
  /** In-container path where the workspace should be bind-mounted (from manifest, default /workspace). */
  workspaceMountPath: string;
  /** In-container path where the agent home should be bind-mounted (from manifest home_path, mandatory). */
  homeMountPath: string;
}

@Injectable()
export class ImagesService {
  constructor(
    @InjectRepository(ImageTemplateEntity)
    private readonly imageTemplateRepo: Repository<ImageTemplateEntity>,
    private readonly inspector: ImageTemplateInspectorService,
    private readonly docker: DockerService,
  ) {}

  async findAll(codepodId = 1): Promise<ImageTemplate[]> {
    const records = await this.imageTemplateRepo.find({
      where: { codepodId },
      order: { createdAt: 'DESC' },
    });
    return records.map((record) => this.toImageTemplate(record));
  }

  async findOne(id: number): Promise<ImageTemplate> {
    const record = await this.imageTemplateRepo.findOne({ where: { id } });
    if (!record) throw new NotFoundException(`Image template ${id} not found`);
    return this.toImageTemplate(record);
  }

  async create(dto: CreateImageTemplateDto): Promise<ImageTemplate> {
    const inspectResult = await this.inspector.inspect({
      repoUrl: dto.repoUrl,
      repoPath: dto.repoPath ?? '.',
      branch: dto.branch ?? 'main',
    });

    const manifest = inspectResult.manifest;
    this.parseManifestServices(manifest);
    const nameFromManifest = this.readManifestString(manifest, 'name');
    const descriptionFromManifest = this.readManifestString(manifest, 'description');
    const iconFromManifest = this.readManifestString(manifest, 'icon');
    const iconDarkFromManifest = this.readManifestString(manifest, 'icon_dark');

    const providedName = dto.name?.trim();
    const finalName =
      (providedName && providedName.length > 0 ? providedName : undefined)
      ?? nameFromManifest
      ?? this.deriveTemplateName(dto.repoUrl, inspectResult.normalizedRepoPath);
    const normalizedName = finalName.trim();
    if (!normalizedName) {
      throw new BadRequestException('Template name is required.');
    }
    if (normalizedName.toLowerCase() === 'new') {
      throw new BadRequestException('"new" is a reserved template name.');
    }

    await this.assertTemplateNameAvailable(dto.codepodId ?? 1, normalizedName);
    const entity = this.imageTemplateRepo.create({
      codepodId: dto.codepodId ?? 1,
      repoUrl: dto.repoUrl,
      repoPath: inspectResult.normalizedRepoPath,
      branch: dto.branch ?? 'main',
      dockerfiles: inspectResult.dockerfiles,
      manifest,
      name: normalizedName,
      description: descriptionFromManifest,
      icon: iconFromManifest,
      iconDark: iconDarkFromManifest,
      lastBuiltAt: null,
      lastBuiltCommit: null,
      lastBuiltTag: null,
      lastBuiltImageRef: null,
      lastBuildOutput: [],
    });

    try {
      const saved = await this.imageTemplateRepo.save(entity);
      return this.toImageTemplate(saved);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'unknown error';
      if (message.includes('UNIQUE')) {
        throw new ConflictException('This image template already exists for the selected codepod.');
      }
      throw error;
    }
  }

  async update(id: number, dto: UpdateImageTemplateDto): Promise<ImageTemplate> {
    const record = await this.imageTemplateRepo.findOne({ where: { id } });
    if (!record) throw new NotFoundException(`Image template ${id} not found`);

    if (dto.name !== undefined) {
      const nextName = dto.name.trim();
      if (!nextName) {
        throw new BadRequestException('Template name is required.');
      }
      if (nextName.toLowerCase() === 'new') {
        throw new BadRequestException('"new" is a reserved template name.');
      }
      await this.assertTemplateNameAvailable(record.codepodId, nextName, id);
      record.name = nextName;
    }

    if (dto.enabled !== undefined) {
      record.enabled = dto.enabled;
    }

    const saved = await this.imageTemplateRepo.save(record);
    return this.toImageTemplate(saved);
  }

  async remove(id: number): Promise<void> {
    const record = await this.imageTemplateRepo.findOne({ where: { id } });
    if (!record) throw new NotFoundException(`Image template ${id} not found`);
    await this.imageTemplateRepo.delete(id);
  }

  async ensureImageForAgentCreation(
    imageTemplateId: number,
    updateIfOutdated: boolean,
    allowOutdated = false,
  ): Promise<EnsureImageForAgentCreationResult> {
    const record = await this.imageTemplateRepo.findOne({ where: { id: imageTemplateId } });
    if (!record) {
      throw new NotFoundException(`Image template ${imageTemplateId} not found`);
    }

    const inspectResult = await this.inspector.inspect({
      repoUrl: record.repoUrl,
      repoPath: record.repoPath,
      branch: record.branch,
    });
    const services = this.parseManifestServices(inspectResult.manifest);
    const workspaceMountPath = this.readWorkspaceMountPath(inspectResult.manifest);
    const homeMountPath = this.readHomeMountPath(inspectResult.manifest);
    const result = await this.ensureImage(record, updateIfOutdated, inspectResult, undefined, allowOutdated);
    return { imageRef: result.imageRef, services, workspaceMountPath, homeMountPath };
  }

  async ensureImage(
    input: number | ImageTemplateEntity,
    updateIfOutdated: boolean,
    preInspected?: Awaited<ReturnType<ImageTemplateInspectorService['inspect']>>,
    onProgress?: (line: string) => void,
    allowOutdated = false,
    checkOnly = false,
  ): Promise<EnsureImageResult> {
    const record =
      typeof input === 'number'
        ? await this.imageTemplateRepo.findOne({ where: { id: input } })
        : input;

    if (!record) throw new NotFoundException('Image template not found');

    const inspectResult = preInspected ?? await this.inspector.inspect({
      repoUrl: record.repoUrl,
      repoPath: record.repoPath,
      branch: record.branch,
    });

    // Sync metadata (description, icons, dockerfiles) even when the image is already up to date.
    record.repoPath = inspectResult.normalizedRepoPath;
    record.dockerfiles = inspectResult.dockerfiles;
    record.manifest = inspectResult.manifest;
    this.applyManifestMetadata(record, inspectResult.manifest);
    await this.imageTemplateRepo.save(record);

    const imageRepository = this.deriveImageRepository(record);
    const tag = inspectResult.repoTag ?? inspectResult.commit.slice(0, 12);
    const imageRef = `${imageRepository}:${tag}`;
    const exists = await this.docker.imageExists(imageRef);
    const needsUpdate =
      record.lastBuiltCommit !== inspectResult.commit || record.lastBuiltTag !== inspectResult.repoTag;

    // Check if the previous build's image still exists under its own ref.
    // When using commit-hash-based tags (no git tag on HEAD), the imageRef
    // changes with every commit, so `exists` is false even though an older
    // image is available. We detect this via lastBuiltImageRef.
    const prevImageRef = record.lastBuiltImageRef;
    const prevExists = prevImageRef ? await this.docker.imageExists(prevImageRef) : false;

    if (exists && !needsUpdate) {
      return {
        imageRef,
        action: 'existing',
        needsUpdate: false,
        currentCommit: inspectResult.commit,
        currentTag: inspectResult.repoTag,
        builtCommit: record.lastBuiltCommit,
        builtTag: record.lastBuiltTag,
        buildOutput: [],
      };
    }

    // Outdated: either the current ref exists but is stale (moving tag scenario)
    // or the current ref doesn't exist but a previous build's image does.
    if ((exists || prevExists) && needsUpdate && !updateIfOutdated) {
      const existingRef = exists ? imageRef : prevImageRef!;
      if (allowOutdated) {
        return {
          imageRef: existingRef,
          action: 'existing',
          needsUpdate: true,
          currentCommit: inspectResult.commit,
          currentTag: inspectResult.repoTag,
          builtCommit: record.lastBuiltCommit,
          builtTag: record.lastBuiltTag,
          buildOutput: [],
        };
      }
      throw new ConflictException({
        message: 'Image is outdated compared to repository head.',
        code: 'IMAGE_OUTDATED',
        imageTemplateId: record.id,
        currentCommit: inspectResult.commit,
        currentTag: inspectResult.repoTag,
        builtCommit: record.lastBuiltCommit,
        builtTag: record.lastBuiltTag,
        imageRef: existingRef,
      });
    }

    // checkOnly mode: report status without triggering a build.
    // Only reached when no image exists at all (neither current nor previous).
    if (checkOnly) {
      return {
        imageRef,
        action: 'missing',
        needsUpdate: true,
        currentCommit: inspectResult.commit,
        currentTag: inspectResult.repoTag,
        builtCommit: record.lastBuiltCommit,
        builtTag: record.lastBuiltTag,
        buildOutput: [],
      };
    }

    try {
      await this.buildAndStore(record, inspectResult.commit, inspectResult.repoTag, imageRef, inspectResult.manifest, onProgress);
    } catch (error: unknown) {
      if (error instanceof DockerImageBuildError) {
        throw new BadRequestException({
          message: 'Image build failed.',
          code: 'IMAGE_BUILD_FAILED',
          imageTemplateId: record.id,
          imageRef,
          buildOutput: error.output,
        });
      }
      throw error;
    }
    return {
      imageRef,
      action: 'built',
      needsUpdate,
      currentCommit: inspectResult.commit,
      currentTag: inspectResult.repoTag,
      builtCommit: inspectResult.commit,
      builtTag: inspectResult.repoTag,
      buildOutput: record.lastBuildOutput ?? [],
    };
  }

  private async buildAndStore(
    record: ImageTemplateEntity,
    commit: string,
    repoTag: string | null,
    imageRef: string,
    manifest: Record<string, unknown> | null,
    onProgress?: (line: string) => void,
  ): Promise<void> {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'codepods-image-build-'));
    const repoDir = path.join(tempRoot, 'repo');
    try {
      await execFileAsync('git', [
        'clone',
        '--depth',
        '1',
        '--single-branch',
        '--branch',
        record.branch,
        record.repoUrl,
        repoDir,
      ]);

      const contextPath = path.resolve(repoDir, record.repoPath === '.' ? '' : record.repoPath);
      const sourceFiles = await this.collectSourceFiles(contextPath);
      if (sourceFiles.length === 0) {
        throw new BadRequestException('Image build context is empty.');
      }

      const dockerfile = record.dockerfiles.includes('Dockerfile')
        ? 'Dockerfile'
        : record.dockerfiles[0];
      const buildArgs = this.extractBuildArgs(manifest);
      const labels: Record<string, string> = {
        'org.opencontainers.image.created': new Date().toISOString(),
        'org.opencontainers.image.source': record.repoUrl,
        'org.opencontainers.image.revision': commit,
        'io.codepods.template_id': String(record.id),
        'io.codepods.template_manifest': JSON.stringify(manifest ?? {}),
        'io.codepods.template_services': JSON.stringify(this.parseManifestServices(manifest)),
      };
      if (repoTag) {
        labels['org.opencontainers.image.version'] = repoTag;
      }

      const buildOutput = await this.docker.buildImageFromContext({
        contextPath,
        sourceFiles,
        dockerfile,
        imageRef,
        labels,
        buildArgs,
        onProgress,
      });

      record.lastBuiltAt = new Date();
      record.lastBuiltCommit = commit;
      record.lastBuiltTag = repoTag;
      record.lastBuiltImageRef = imageRef;
      record.lastBuildOutput = buildOutput;
      record.manifest = manifest as ImageTemplateManifest | null;
      this.applyManifestMetadata(record, manifest);
      await this.imageTemplateRepo.save(record);
    } finally {
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  }

  private async collectSourceFiles(baseDir: string): Promise<string[]> {
    const results: string[] = [];
    await this.walkSource(baseDir, '', results);
    return results;
  }

  private async walkSource(baseDir: string, relativeDir: string, acc: string[]): Promise<void> {
    const entries = await fs.readdir(path.join(baseDir, relativeDir), { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === '.git') continue;
      const relPath = relativeDir ? `${relativeDir}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        await this.walkSource(baseDir, relPath, acc);
      } else if (entry.isFile()) {
        acc.push(relPath);
      }
    }
  }

  private extractBuildArgs(manifest: Record<string, unknown> | null): Record<string, string> {
    if (!manifest) return {};
    const ignored = new Set(['name', 'description', 'icon', 'icon_dark', 'services', 'commands']);
    const buildArgs: Record<string, string> = {};
    for (const [key, value] of Object.entries(manifest)) {
      if (ignored.has(key) || value === null || value === undefined) continue;
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        buildArgs[key] = String(value);
      }
    }
    return buildArgs;
  }

  private deriveTemplateName(repoUrl: string, repoPath: string): string {
    const { owner, repo } = this.parseRepoOwnerAndName(repoUrl);
    const repoPathPart = repoPath === '.' ? '' : `-${repoPath.replace(/[\\/]+/g, '-').replace(/^-+|-+$/g, '')}`;
    return `${owner}/${repo}${repoPathPart}`;
  }

  private deriveImageRepository(record: ImageTemplateEntity): string {
    const slug = this.slugifyName(record.name);
    return `codepods/cp${record.codepodId}-${slug}-t${record.id}`;
  }

  private parseRepoOwnerAndName(repoUrl: string): { owner: string; repo: string } {
    const normalized = repoUrl
      .replace(/^git@[^:]+:/, '')
      .replace(/\.git$/i, '')
      .replace(/\/+$/, '');
    const parts = normalized.split(/[/:]/).filter(Boolean);
    const owner = (parts[parts.length - 2] ?? 'repo').toLowerCase().replace(/[^a-z0-9._-]/g, '-');
    const repo = (parts[parts.length - 1] ?? 'template').toLowerCase().replace(/[^a-z0-9._-]/g, '-');
    return { owner, repo };
  }

  private slugifyName(name: string): string {
    const base = name
      .toLowerCase()
      .replace(/[^a-z0-9._/-]/g, '-')
      .replace(/[\\/]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    return base.length > 80 ? base.slice(0, 80) : base || 'template';
  }

  private async assertTemplateNameAvailable(
    codepodId: number,
    name: string,
    excludeId?: number,
  ): Promise<void> {
    const qb = this.imageTemplateRepo
      .createQueryBuilder('template')
      .where('template.codepodId = :codepodId', { codepodId })
      .andWhere('LOWER(template.name) = LOWER(:name)', { name });

    if (excludeId !== undefined) {
      qb.andWhere('template.id != :excludeId', { excludeId });
    }

    const existing = await qb.getOne();
    if (existing) {
      throw new ConflictException(
        `Template name "${name}" already exists in this codepod. Choose a unique name.`,
      );
    }
  }

  private applyManifestMetadata(
    record: ImageTemplateEntity,
    manifest: Record<string, unknown> | null,
  ): void {
    record.description = this.readManifestString(manifest, 'description');
    record.icon = this.readManifestString(manifest, 'icon');
    record.iconDark = this.readManifestString(manifest, 'icon_dark');
  }

  private readManifestString(manifest: Record<string, unknown> | null, key: string): string | null {
    if (!manifest) return null;
    const value = manifest[key];
    if (value === undefined || value === null) return null;
    return typeof value === 'string' ? value : null;
  }

  private readWorkspaceMountPath(manifest: Record<string, unknown> | null): string {
    if (!manifest) return '/workspace';
    const value = manifest['workspace_path'];
    if (typeof value === 'string' && value.trim() !== '') return value.trim();
    return '/workspace';
  }

  private readHomeMountPath(manifest: Record<string, unknown> | null): string {
    if (!manifest) return '';
    const value = manifest['home_path'];
    if (typeof value === 'string' && value.trim() !== '') return value.trim();
    return '';
  }

  private parseManifestServices(manifest: Record<string, unknown> | null): ImageTemplateManifestService[] {
    if (!manifest) return [];
    const raw = manifest['services'];
    if (raw === undefined) return [];
    if (!Array.isArray(raw)) {
      throw new BadRequestException('manifest.yml field "services" must be an array.');
    }

    return raw.map((item, index) => this.parseManifestServiceItem(item, index));
  }

  private parseManifestServiceItem(item: unknown, index: number): ImageTemplateManifestService {
    if (typeof item !== 'string') {
      throw new BadRequestException(
        `manifest.yml services[${index}] must be a string in format "type|name|port".`,
      );
    }
    const [typeRaw, nameRaw, portRaw] = item.split('|').map((part) => part.trim());
    if (!typeRaw || !nameRaw || !portRaw) {
      throw new BadRequestException(
        `manifest.yml services[${index}] must match "type|name|port".`,
      );
    }
    if (typeRaw !== 'terminal' && typeRaw !== 'web') {
      throw new BadRequestException(
        `manifest.yml services[${index}] type must be "terminal" or "web".`,
      );
    }
    const port = Number.parseInt(portRaw, 10);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new BadRequestException(
        `manifest.yml services[${index}] port must be an integer between 1 and 65535.`,
      );
    }
    return { type: typeRaw, name: nameRaw, port };
  }

  private toImageTemplate(record: ImageTemplateEntity): ImageTemplate {
    return {
      id: record.id,
      codepodId: record.codepodId,
      repoUrl: record.repoUrl,
      repoPath: record.repoPath,
      branch: record.branch,
      dockerfiles: record.dockerfiles,
      manifest: record.manifest,
      name: record.name,
      description: record.description,
      icon: record.icon,
      iconDark: record.iconDark,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
      lastBuiltAt: record.lastBuiltAt ? record.lastBuiltAt.toISOString() : null,
      lastBuiltCommit: record.lastBuiltCommit,
      lastBuiltTag: record.lastBuiltTag,
      lastBuiltImageRef: record.lastBuiltImageRef,
      lastBuildOutput: record.lastBuildOutput ?? [],
      enabled: record.enabled,
      sortOrder: record.sortOrder ?? 0,
    };
  }

  /** Batch-update manual sort order. Assigns sequential sortOrder (1-based). */
  async reorder(ids: number[], codepodId = 1): Promise<void> {
    await this.imageTemplateRepo.manager.transaction(async (tx) => {
      await tx.update(ImageTemplateEntity, { codepodId }, { sortOrder: 0 });
      for (let i = 0; i < ids.length; i++) {
        await tx.update(ImageTemplateEntity, { id: ids[i], codepodId }, { sortOrder: i + 1 });
      }
    });
  }
}
