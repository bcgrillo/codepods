import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import AdmZip from 'adm-zip';
import archiver from 'archiver';
import { parse } from 'yaml';
import type { Response } from 'express';
import {
  SkillSource,
  Skill,
  CreateSkillSourceDto,
  UpdateSkillSourceDto,
  SkillSourceType,
} from '@codepods/shared-types';
import { ConfigService } from '../config/config.service';
import { SkillSourceEntity } from './skill-source.entity';
import { SkillEntity } from './skill.entity';
import { AgentSkillEntity } from './agent-skill.entity';

const execFileAsync = promisify(execFile);

const BUILT_IN_LOCAL_NAME = 'Local';

/** Parsed YAML frontmatter of a SKILL.md. */
interface Frontmatter {
  name?: string;
  description?: string;
}

@Injectable()
export class SkillsService implements OnModuleInit {
  private readonly logger = new Logger(SkillsService.name);

  constructor(
    @InjectRepository(SkillSourceEntity)
    private readonly sourceRepo: Repository<SkillSourceEntity>,
    @InjectRepository(SkillEntity)
    private readonly skillRepo: Repository<SkillEntity>,
    @InjectRepository(AgentSkillEntity)
    private readonly agentSkillRepo: Repository<AgentSkillEntity>,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.ensureBuiltInLocal();
      await this.scanLocal();
    } catch (e) {
      this.logger.error(`onModuleInit failed: ${e instanceof Error ? e.message : e}`);
    }
  }

  // ---- paths ---------------------------------------------------------------

  private get dataDir(): string {
    return this.config.get('dataDir');
  }

  /** Host directory holding local skill folders (`<dataDir>/skills`). */
  private localDir(): string {
    return path.join(this.dataDir, 'skills');
  }

  /** Cached clone of a remote source (`<dataDir>/skills-cache/<sourceId>`). */
  private remoteCacheDir(sourceId: number): string {
    return path.join(this.dataDir, 'skills-cache', String(sourceId));
  }

  // ---- built-in local source ----------------------------------------------

  private async ensureBuiltInLocal(codepodId = 1): Promise<void> {
    const existing = await this.sourceRepo.findOne({
      where: { codepodId, type: 'local' as unknown as SkillSourceType },
    });
    if (existing) {
      if (!existing.builtIn) {
        existing.builtIn = true;
        existing.enabled = true;
        await this.sourceRepo.save(existing);
      }
      return;
    }
    const entity = this.sourceRepo.create({
      codepodId,
      name: BUILT_IN_LOCAL_NAME,
      type: 'local',
      gitUrl: null,
      subPath: null,
      branch: null,
      enabled: true,
      builtIn: true,
    });
    await this.sourceRepo.save(entity);
    this.logger.log('Seeded built-in local skills source');
  }

  private async findLocalSource(codepodId = 1): Promise<SkillSourceEntity | null> {
    return this.sourceRepo.findOne({ where: { codepodId, type: 'local' as unknown as SkillSourceType } });
  }

  // ---- SKILL.md parsing -----------------------------------------------------

  private parseFrontmatter(md: string): Frontmatter {
    const fmMatch = md.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!fmMatch) return {};
    try {
      const parsed = parse(fmMatch[1]) as Record<string, unknown>;
      const name = typeof parsed.name === 'string' ? parsed.name : undefined;
      const description = typeof parsed.description === 'string' ? parsed.description : undefined;
      return { name, description };
    } catch {
      return {};
    }
  }

  // ---- safe mappers ---------------------------------------------------------

  private async skillCount(sourceId: number): Promise<number> {
    return this.skillRepo.count({ where: { sourceId } });
  }

  private toSafeSource(s: SkillSourceEntity, skillCount: number): SkillSource {
    return {
      id: s.id,
      codepodId: s.codepodId,
      name: s.name,
      type: s.type as SkillSourceType,
      gitUrl: s.gitUrl,
      subPath: s.subPath,
      branch: s.branch,
      commitSha: s.commitSha,
      lastSyncedAt: s.lastSyncedAt ? s.lastSyncedAt.toISOString() : null,
      enabled: s.enabled,
      builtIn: s.builtIn,
      localDir: s.type === 'local' ? this.localDir() : null,
      skillCount,
      sortOrder: s.sortOrder,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
    };
  }

  private toSafeSkill(s: SkillEntity): Skill {
    return {
      id: s.id,
      codepodId: s.codepodId,
      sourceId: s.sourceId,
      sourceType: s.sourceType as Skill['sourceType'],
      name: s.name,
      description: s.description,
      path: s.path,
      skillMd: s.skillMd,
      uploaded: s.uploaded,
      lastSeenAt: s.lastSeenAt.toISOString(),
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
    };
  }

  // ---- source CRUD ----------------------------------------------------------

  async findAll(codepodId = 1): Promise<SkillSource[]> {
    const list = await this.sourceRepo.find({
      where: { codepodId },
      order: { builtIn: 'DESC', name: 'ASC' },
    });
    return Promise.all(list.map(async (s) => this.toSafeSource(s, await this.skillCount(s.id))));
  }

  async findOneSource(id: number): Promise<SkillSource> {
    return this.toSafeSource(await this.findSourceEntity(id), await this.skillCount(id));
  }

  async findSourceEntity(id: number): Promise<SkillSourceEntity> {
    const s = await this.sourceRepo.findOne({ where: { id } });
    if (!s) throw new NotFoundException(`Skill source ${id} not found`);
    return s;
  }

  async createSource(dto: CreateSkillSourceDto, codepodId = 1): Promise<SkillSource> {
    if (dto.type === 'local') {
      throw new BadRequestException('Local source is managed automatically');
    }
    if (!dto.gitUrl || !dto.gitUrl.trim()) {
      throw new BadRequestException('gitUrl is required for repo/skill sources');
    }
    const entity = this.sourceRepo.create({
      codepodId,
      name: dto.name,
      type: dto.type,
      gitUrl: dto.gitUrl.trim(),
      subPath: dto.subPath?.trim() || null,
      branch: dto.branch?.trim() || 'main',
      enabled: dto.enabled ?? true,
      builtIn: false,
    });
    const saved = await this.sourceRepo.save(entity);
    return this.toSafeSource(saved, 0);
  }

  async updateSource(id: number, dto: UpdateSkillSourceDto): Promise<SkillSource> {
    const s = await this.findSourceEntity(id);
    if (s.builtIn) {
      // Only enabled toggle is meaningful for the local source.
      if (dto.enabled !== undefined) {
        s.enabled = dto.enabled;
        await this.sourceRepo.save(s);
      }
      return this.toSafeSource(s, await this.skillCount(id));
    }
    if (dto.name !== undefined) s.name = dto.name;
    if (dto.gitUrl !== undefined) s.gitUrl = dto.gitUrl.trim() || null;
    if (dto.subPath !== undefined) s.subPath = dto.subPath.trim() || null;
    if (dto.branch !== undefined) s.branch = dto.branch.trim() || null;
    if (dto.enabled !== undefined) s.enabled = dto.enabled;
    await this.sourceRepo.save(s);
    return this.toSafeSource(s, await this.skillCount(id));
  }

  async removeSource(id: number): Promise<void> {
    const s = await this.findSourceEntity(id);
    if (s.builtIn) throw new BadRequestException('The local source cannot be deleted');
    // Cascade (FK onDelete: CASCADE removes skills rows); also drop the cache.
    await this.sourceRepo.remove(s);
    const cache = this.remoteCacheDir(id);
    if (fs.existsSync(cache)) {
      fs.rmSync(cache, { recursive: true, force: true });
    }
  }

  async reorderSources(ids: number[], codepodId = 1): Promise<void> {
    await this.sourceRepo.manager.transaction(async (tx) => {
      await tx.update(SkillSourceEntity, { codepodId }, { sortOrder: 0 });
      for (let i = 0; i < ids.length; i++) {
        await tx.update(SkillSourceEntity, { id: ids[i], codepodId }, { sortOrder: i + 1 });
      }
    });
  }

  // ---- local skills ---------------------------------------------------------

  private ensureLocalDir(): void {
    fs.mkdirSync(this.localDir(), { recursive: true });
  }

  /** Re-scan the local skills directory and reconcile DB rows. */
  async scanLocal(): Promise<Skill[]> {
    this.ensureLocalDir();
    const source = await this.findLocalSource();
    if (!source) return [];
    const dir = this.localDir();
    const seen = new Set<string>();
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const mdPath = path.join(dir, e.name, 'SKILL.md');
      if (!fs.existsSync(mdPath)) continue;
      const md = await fs.promises.readFile(mdPath, 'utf8');
      const fm = this.parseFrontmatter(md);
      const name = fm.name || e.name;
      seen.add(name);
      await this.upsertSkill({
        sourceId: source.id,
        codepodId: source.codepodId,
        sourceType: 'local',
        name,
        description: fm.description ?? null,
        path: e.name,
        skillMd: md,
        uploaded: true,
      });
    }
    await this.deleteStaleSkills(source.id, seen);
    const skills = await this.skillRepo.find({ where: { sourceId: source.id }, order: { name: 'ASC' } });
    return skills.map((s) => this.toSafeSkill(s));
  }

  async listLocalSkills(): Promise<Skill[]> {
    const source = await this.findLocalSource();
    if (!source) return [];
    const skills = await this.skillRepo.find({ where: { sourceId: source.id }, order: { name: 'ASC' } });
    return skills.map((s) => this.toSafeSkill(s));
  }

  /** Upload a local skill from a .md or .zip file (multipart). */
  async uploadLocalSkill(name: string, file: { buffer: Buffer; mimetype: string }): Promise<Skill> {
    const safeName = this.sanitizeName(name);
    const source = await this.findLocalSource();
    if (!source) throw new BadRequestException('Local source not initialized');
    this.ensureLocalDir();
    const skillDir = path.join(this.localDir(), safeName);
    // Replace any existing folder.
    if (fs.existsSync(skillDir)) fs.rmSync(skillDir, { recursive: true, force: true });
    fs.mkdirSync(skillDir, { recursive: true });

    const isZip =
      file.mimetype === 'application/zip' ||
      file.mimetype === 'application/x-zip-compressed' ||
      safeName.endsWith('.zip') ||
      file.buffer[0] === 0x50;

    if (isZip) {
      const zip = new AdmZip(file.buffer);
      zip.extractAllTo(skillDir, true);
      // Ensure a SKILL.md exists (some zips wrap a top folder).
      if (!fs.existsSync(path.join(skillDir, 'SKILL.md'))) {
        const inner = fs
          .readdirSync(skillDir, { withFileTypes: true })
          .find((e) => e.isDirectory() && fs.existsSync(path.join(skillDir, e.name, 'SKILL.md')));
        if (inner) {
          // Flatten: move inner contents up.
          const innerPath = path.join(skillDir, inner.name);
          for (const entry of fs.readdirSync(innerPath)) {
            fs.renameSync(path.join(innerPath, entry), path.join(skillDir, entry));
          }
          fs.rmSync(innerPath, { recursive: true, force: true });
        }
      }
    } else {
      // Treat as a SKILL.md markdown file.
      fs.writeFileSync(path.join(skillDir, 'SKILL.md'), file.buffer);
    }

    await this.scanLocal();
    const skill = await this.skillRepo.findOne({ where: { sourceId: source.id, name: safeName } });
    if (!skill) {
      // The uploaded folder name may differ from frontmatter `name`; fall back.
      const byPath = await this.skillRepo.findOne({ where: { sourceId: source.id, path: safeName } });
      if (byPath) return this.toSafeSkill(byPath);
      throw new BadRequestException('Uploaded skill could not be parsed (no SKILL.md found)');
    }
    return this.toSafeSkill(skill);
  }

  async renameLocalSkill(skillId: number, newName: string): Promise<Skill> {
    const skill = await this.getSkillEntity(skillId);
    if (skill.sourceType !== 'local') throw new BadRequestException('Only local skills can be renamed');
    const safe = this.sanitizeName(newName);
    if (!safe) throw new BadRequestException('Invalid skill name');
    const oldDir = path.join(this.localDir(), skill.path || skill.name);
    const newDir = path.join(this.localDir(), safe);
    if (fs.existsSync(oldDir)) {
      fs.renameSync(oldDir, newDir);
    }
    skill.name = safe;
    skill.path = safe;
    await this.skillRepo.save(skill);
    await this.scanLocal();
    const refreshed = await this.skillRepo.findOne({ where: { id: skillId } });
    return this.toSafeSkill(refreshed!);
  }

  async deleteLocalSkill(skillId: number): Promise<void> {
    const skill = await this.getSkillEntity(skillId);
    if (skill.sourceType !== 'local') throw new BadRequestException('Only local skills can be deleted here');
    const dir = path.join(this.localDir(), skill.path || skill.name);
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
    await this.skillRepo.delete(skillId);
  }

  // ---- skills (generic) -----------------------------------------------------

  async listSkillsBySource(sourceId: number): Promise<Skill[]> {
    const skills = await this.skillRepo.find({ where: { sourceId }, order: { name: 'ASC' } });
    return skills.map((s) => this.toSafeSkill(s));
  }

  /** All skills from all enabled sources (for the agent settings "available" list). */
  async listAllSkills(codepodId = 1): Promise<Skill[]> {
    const enabledSources = await this.sourceRepo.find({ where: { codepodId, enabled: true } });
    const sourceIds = enabledSources.map((s) => s.id);
    if (!sourceIds.length) return [];
    const skills = await this.skillRepo.find({
      where: { sourceId: In(sourceIds) },
      order: { name: 'ASC' },
    });
    return skills.map((s) => this.toSafeSkill(s));
  }

  async getSkillEntity(id: number): Promise<SkillEntity> {
    const s = await this.skillRepo.findOne({ where: { id } });
    if (!s) throw new NotFoundException(`Skill ${id} not found`);
    return s;
  }

  async findOneSkill(id: number): Promise<Skill> {
    return this.toSafeSkill(await this.getSkillEntity(id));
  }

  private async upsertSkill(input: {
    sourceId: number;
    codepodId: number;
    sourceType: string;
    name: string;
    description: string | null;
    path: string | null;
    skillMd: string | null;
    uploaded: boolean;
  }): Promise<SkillEntity> {
    let row = await this.skillRepo.findOne({
      where: { sourceId: input.sourceId, name: input.name },
    });
    if (!row) {
      row = this.skillRepo.create({
        codepodId: input.codepodId,
        sourceId: input.sourceId,
        sourceType: input.sourceType,
        name: input.name,
        description: input.description,
        path: input.path,
        skillMd: input.skillMd,
        uploaded: input.uploaded,
        lastSeenAt: new Date(),
      });
    } else {
      row.description = input.description;
      row.path = input.path;
      row.skillMd = input.skillMd;
      row.lastSeenAt = new Date();
    }
    return this.skillRepo.save(row);
  }

  private async deleteStaleSkills(sourceId: number, seenNames: Set<string>): Promise<void> {
    const rows = await this.skillRepo.find({ where: { sourceId } });
    const stale = rows.filter((r) => !seenNames.has(r.name));
    if (stale.length) {
      await this.skillRepo.remove(stale);
    }
  }

  // ---- sync ----------------------------------------------------------------

  async syncSource(id: number): Promise<SkillSource> {
    const s = await this.findSourceEntity(id);
    if (s.type === 'local') {
      await this.scanLocal();
      s.lastSyncedAt = new Date();
      await this.sourceRepo.save(s);
      return this.toSafeSource(s, await this.skillCount(id));
    }
    // repo / skill → fetch + scan
    const { sha } = await this.ensureRemoteRepo(s);
    await this.scanRemote(s);
    s.commitSha = sha;
    s.lastSyncedAt = new Date();
    await this.sourceRepo.save(s);
    return this.toSafeSource(s, await this.skillCount(id));
  }

  // ---- remote git -----------------------------------------------------------

  private async ensureRemoteRepo(source: SkillSourceEntity): Promise<{ dir: string; sha: string }> {
    if (!source.gitUrl) throw new BadRequestException('Source has no git URL');
    const dir = this.remoteCacheDir(source.id);
    const branch = source.branch || 'main';
    const url = source.gitUrl.trim();
    try {
      if (!fs.existsSync(path.join(dir, '.git'))) {
        fs.mkdirSync(path.dirname(dir), { recursive: true });
        if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
        await execFileAsync('git', ['clone', '--depth', '1', '--branch', branch, url, dir]);
      } else {
        await execFileAsync('git', ['-C', dir, 'fetch', 'origin', branch, '--depth', '1']);
        await execFileAsync('git', ['-C', dir, 'reset', '--hard', 'FETCH_HEAD']);
      }
      const { stdout } = await execFileAsync('git', ['-C', dir, 'rev-parse', 'HEAD']);
      return { dir, sha: stdout.trim() };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new BadRequestException(`git operation failed: ${msg}`);
    }
  }

  private async scanRemote(source: SkillSourceEntity): Promise<void> {
    const dir = this.remoteCacheDir(source.id);
    if (source.type === 'repo') {
      await this.scanRemoteRepo(source, dir);
    } else if (source.type === 'skill') {
      await this.scanRemoteSkill(source, dir);
    }
  }

  private async scanRemoteRepo(source: SkillSourceEntity, cacheDir: string): Promise<void> {
    const scanRoot = source.subPath ? path.join(cacheDir, source.subPath) : cacheDir;
    if (!fs.existsSync(scanRoot) || !fs.statSync(scanRoot).isDirectory()) {
      throw new BadRequestException(`subPath "${source.subPath}" not found in repo`);
    }
    const seen = new Set<string>();
    const entries = await fs.promises.readdir(scanRoot, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isDirectory() || e.name === '.git') continue;
      const mdPath = path.join(scanRoot, e.name, 'SKILL.md');
      if (!fs.existsSync(mdPath)) continue;
      const md = await fs.promises.readFile(mdPath, 'utf8');
      const fm = this.parseFrontmatter(md);
      const name = fm.name || e.name;
      seen.add(name);
      await this.upsertSkill({
        sourceId: source.id,
        codepodId: source.codepodId,
        sourceType: 'repo',
        name,
        description: fm.description ?? null,
        path: e.name,
        skillMd: md,
        uploaded: false,
      });
    }
    await this.deleteStaleSkills(source.id, seen);
  }

  private async scanRemoteSkill(source: SkillSourceEntity, cacheDir: string): Promise<void> {
    const skillRoot = source.subPath ? path.join(cacheDir, source.subPath) : cacheDir;
    const mdPath = path.join(skillRoot, 'SKILL.md');
    if (!fs.existsSync(mdPath)) {
      throw new BadRequestException('No SKILL.md found at the repo root / subPath');
    }
    const md = await fs.promises.readFile(mdPath, 'utf8');
    const fm = this.parseFrontmatter(md);
    const name = fm.name || source.name;
    const seen = new Set<string>([name]);
    await this.upsertSkill({
      sourceId: source.id,
      codepodId: source.codepodId,
      sourceType: 'skill',
      name,
      description: fm.description ?? null,
      path: source.subPath || '',
      skillMd: md,
      uploaded: false,
    });
    await this.deleteStaleSkills(source.id, seen);
  }

  // ---- zip streaming --------------------------------------------------------

  /** Resolve the on-disk directory for a skill (cloning remote if needed). */
  private async resolveSkillDir(skill: SkillEntity): Promise<string> {
    const source = await this.findSourceEntity(skill.sourceId);
    if (source.type === 'local') {
      return path.join(this.localDir(), skill.path || skill.name);
    }
    const { dir } = await this.ensureRemoteRepo(source);
    const base = source.subPath ? path.join(dir, source.subPath) : dir;
    // For 'skill' type (single-skill repo), the skill root IS the base
    // (subPath already incorporated; scanRemoteSkill stores skill.path =
    // source.subPath, so appending it again would double the path). For
    // 'repo' type (many-skills repo), skill.path is a subdirectory name
    // relative to base.
    if (source.type === 'skill') {
      return base;
    }
    return skill.path ? path.join(base, skill.path) : base;
  }

  /** Stream a zip of the skill folder to the HTTP response (on the fly). */
  async streamSkillZip(skillId: number, res: Response): Promise<void> {
    const skill = await this.getSkillEntity(skillId);
    const skillDir = await this.resolveSkillDir(skill);
    if (!fs.existsSync(skillDir) || !fs.statSync(skillDir).isDirectory()) {
      throw new NotFoundException(`Skill folder not found on disk: ${skillDir}`);
    }
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(skill.name)}.zip"`);
    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.on('error', (err) => {
      this.logger.error(`zip stream error: ${err.message}`);
      if (!res.headersSent) res.status(500).end();
      else res.end();
    });
    archive.pipe(res);
    archive.directory(skillDir, false);
    await archive.finalize();
  }

  /** Build the host URL the agent fetches the skill zip from. */
  skillZipUrl(skillId: number): string {
    return `http://host.docker.internal:3000/api/skills/${skillId}/zip`;
  }

  // ---- per-agent assignment (N:M) -----------------------------------------

  async assignToAgent(agentId: string, skillId: number): Promise<void> {
    const existing = await this.agentSkillRepo.findOne({ where: { agentId, skillId } });
    if (existing) return;
    await this.agentSkillRepo.save(this.agentSkillRepo.create({ agentId, skillId }));
  }

  async removeFromAgent(agentId: string, skillId: number): Promise<void> {
    await this.agentSkillRepo.delete({ agentId, skillId });
  }

  async listForAgent(agentId: string): Promise<Skill[]> {
    const rows = await this.agentSkillRepo.find({ where: { agentId } });
    if (!rows.length) return [];
    const ids = rows.map((r) => r.skillId);
    const skills = await this.skillRepo.find({ where: { id: In(ids) }, order: { name: 'ASC' } });
    return skills.map((s) => this.toSafeSkill(s));
  }

  // ---- helpers --------------------------------------------------------------

  private sanitizeName(name: string): string {
    const cleaned = name.replace(/[^a-zA-Z0-9._-]/g, '').trim();
    return cleaned || 'skill';
  }
}