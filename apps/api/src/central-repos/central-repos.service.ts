import {
  Injectable,
  BadRequestException,
} from '@nestjs/common';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'yaml';
import {
  CentralRepoConfig,
  DiscoveredTemplate,
  DiscoveredProvider,
  ImageTemplateManifest,
} from '@codepods/shared-types';
import { ConfigService } from '../config/config.service';

const execFileAsync = promisify(execFile);

type RepoKind = 'templates' | 'providers';

export interface ProviderManifest {
  display_name?: string;
  description?: string;
  icon?: string;
  icon_dark?: string;
  base_url?: string;
  doc_url?: string;
  [key: string]: unknown;
}

/** Small in-memory cache of served repo files (icons/logos) keyed by path. */
const fileCache = new Map<string, { buf: Buffer; mime: string }>();

@Injectable()
export class CentralReposService {
  constructor(private readonly configService: ConfigService) {}

  private getDataDir(): string {
    return this.configService.get('dataDir');
  }

  private reposRoot(kind: RepoKind): string {
    return path.join(this.getDataDir(), 'repos', kind);
  }

  private configuredRepos(kind: RepoKind): CentralRepoConfig[] {
    const key = kind === 'templates' ? 'templateRepositories' : 'providerRepositories';
    return (this.configService.get(key) ?? []).map((r) => ({
      url: r.url,
      branch: r.branch ?? 'main',
      cachedRef: r.cachedRef ?? '',
    }));
  }

  /**
   * Ensures a local, cached clone of the given central repo exists and is up to
   * date with its configured branch. Returns the local directory path.
   */
  private async ensureRepo(
    kind: RepoKind,
    repo: CentralRepoConfig,
    index: number,
  ): Promise<string> {
    const dest = path.join(this.reposRoot(kind), String(index));
    const url = repo.url.trim();
    if (!url) {
      throw new BadRequestException('Central repository URL is empty.');
    }

    if (!fs.existsSync(path.join(dest, '.git'))) {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      await execFileAsync('git', ['clone', '--depth', '1', '--branch', repo.branch, url, dest]);
    } else {
      await execFileAsync('git', ['-C', dest, 'fetch', 'origin', repo.branch, '--depth', '1']);
      await execFileAsync('git', ['-C', dest, 'reset', '--hard', 'FETCH_HEAD']);
    }

    const { stdout } = await execFileAsync('git', ['-C', dest, 'rev-parse', 'HEAD']);
    this.updateCachedRef(kind, index, stdout.trim());
    return dest;
  }

  private updateCachedRef(kind: RepoKind, index: number, ref: string): void {
    const key = kind === 'templates' ? 'templateRepositories' : 'providerRepositories';
    const repos = [...this.configuredRepos(kind)];
    if (repos[index]) {
      repos[index].cachedRef = ref;
      const current = this.configService.getAll();
      this.configService.update({ ...current, [key]: repos } as never);
    }
  }

  /**
   * Lists all top-level subdirectories of a cached repo dir.
   */
  private async listFolders(dir: string): Promise<string[]> {
    if (!fs.existsSync(dir)) return [];
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
  }

  private async readManifestYaml(folderDir: string): Promise<Record<string, unknown> | null> {
    const manifestPath = path.join(folderDir, 'manifest.yml');
    if (!fs.existsSync(manifestPath)) return null;
    const content = await fs.promises.readFile(manifestPath, 'utf8');
    const parsed = parse(content);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  }

  /**
   * Serves a cached file (e.g. icon/logo) from a discovered repo folder by
   * searching all cached repo clones of the given kind.
   */
  repoFile(
    kind: string,
    repoPath: string,
    file: string,
    _index: string | undefined,
    res: { set: (h: Record<string, string>) => void; send: (b: Buffer) => void; status: (c: number) => unknown },
  ): void {
    const allowedKinds: RepoKind[] = ['templates', 'providers'];
    const normalizedKind = allowedKinds.includes(kind as RepoKind) ? (kind as RepoKind) : null;
    if (!normalizedKind) {
      (res.status(400) as { send: (b: string) => void }).send('Invalid kind');
      return;
    }
    // Guard against path traversal.
    const safePath = (part: string): string | null =>
      part && !part.includes('..') && !part.includes('/') && !part.includes('\\') ? part : null;
    const folder = safePath(repoPath);
    const filename = safePath(file);
    if (!folder || !filename) {
      (res.status(400) as { send: (b: string) => void }).send('Invalid path');
      return;
    }

    const root = this.reposRoot(normalizedKind);
    if (!fs.existsSync(root)) {
      (res.status(404) as { send: (b: string) => void }).send('Not found');
      return;
    }
    const indexDirs = fs.readdirSync(root).filter((d) => /^\d+$/.test(d));
    const cacheKey = `${normalizedKind}/${folder}/${filename}`;
    const cached = fileCache.get(cacheKey);
    if (cached) {
      res.set({ 'Content-Type': cached.mime, 'Cache-Control': 'public, max-age=3600' });
      res.send(cached.buf);
      return;
    }
    for (const indexDir of indexDirs) {
      const candidate = path.join(root, indexDir, folder, filename);
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        const ext = path.extname(filename).toLowerCase();
        const mime =
          ext === '.svg' ? 'image/svg+xml' : ext === '.png' ? 'image/png' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'application/octet-stream';
        const buf = fs.readFileSync(candidate);
        // Bound the cache to avoid unbounded growth with many repos.
        if (fileCache.size > 256) {
          const oldest = fileCache.keys().next().value;
          if (oldest !== undefined) fileCache.delete(oldest);
        }
        fileCache.set(cacheKey, { buf, mime });
        res.set({ 'Content-Type': mime, 'Cache-Control': 'public, max-age=3600' });
        res.send(buf);
        return;
      }
    }
    (res.status(404) as { send: (b: string) => void }).send('Not found');
  }

  /**
   * Discovers agent templates from all configured central templates repos.
   * Nothing is persisted — discovered templates exist only in this response.
   */
  async discoverTemplates(): Promise<DiscoveredTemplate[]> {
    const repos = this.configuredRepos('templates');
    const results: DiscoveredTemplate[] = [];
    for (let i = 0; i < repos.length; i++) {
      const repo = repos[i];
      const repoDir = await this.ensureRepo('templates', repo, i);
      const folders = await this.listFolders(repoDir);
      for (const folder of folders) {
        const folderDir = path.join(repoDir, folder);
        const manifest = await this.readManifestYaml(folderDir);
        if (!manifest) continue;
        const parsed = manifest as unknown as ImageTemplateManifest;
        results.push({
          slug: folder,
          repoUrl: repo.url,
          repoPath: folder,
          branch: repo.branch,
          displayName: (parsed as ImageTemplateManifest & { display_name?: string }).display_name
            ?? parsed.name
            ?? folder,
          description: parsed.description ?? '',
          icon: parsed.icon ?? null,
          iconDark: parsed.icon_dark ?? null,
          workspacePath: parsed.workspace_path ?? null,
          services: parsed.services ?? [],
          commands: parsed.commands ?? [],
        });
      }
    }
    return results;
  }

  /**
   * Discovers AI providers from all configured central providers repos.
   * Nothing is persisted — discovered providers exist only in this response.
   */
  async discoverProviders(): Promise<DiscoveredProvider[]> {
    const repos = this.configuredRepos('providers');
    const results: DiscoveredProvider[] = [];
    for (let i = 0; i < repos.length; i++) {
      const repo = repos[i];
      const repoDir = await this.ensureRepo('providers', repo, i);
      const folders = await this.listFolders(repoDir);
      for (const folder of folders) {
        const folderDir = path.join(repoDir, folder);
        const manifest = await this.readManifestYaml(folderDir);
        if (!manifest) continue;
        const parsed = manifest as unknown as ProviderManifest;
        results.push({
          slug: folder,
          repoUrl: repo.url,
          repoPath: folder,
          branch: repo.branch,
          displayName: parsed.display_name ?? folder,
          description: parsed.description ?? '',
          icon: parsed.icon ?? null,
          iconDark: parsed.icon_dark ?? null,
          baseUrl: parsed.base_url ?? '',
          docUrl: parsed.doc_url ?? null,
        });
      }
    }
    return results;
  }
}
