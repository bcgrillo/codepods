import { BadRequestException, Injectable } from '@nestjs/common';
import { execFile } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { promisify } from 'node:util';
import { parse } from 'yaml';
import type { ImageTemplateManifest, ManifestCommand, ManifestCommandType } from '@codepods/shared-types';

const execFileAsync = promisify(execFile);
const MANIFEST_STANDARD_KEYS = new Set(['name', 'description', 'icon', 'icon_dark', 'workspace_path']);

interface InspectInput {
  repoUrl: string;
  repoPath: string;
  branch: string;
}

interface InspectResult {
  normalizedRepoPath: string;
  dockerfiles: string[];
  manifest: ImageTemplateManifest | null;
  commit: string;
  repoTag: string | null;
}

@Injectable()
export class ImageTemplateInspectorService {
  async inspect(input: InspectInput): Promise<InspectResult> {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'codepods-image-template-'));
    const repoDir = path.join(tempRoot, 'repo');

    try {
      await execFileAsync('git', [
        'clone',
        '--depth',
        '1',
        '--single-branch',
        '--branch',
        input.branch,
        input.repoUrl,
        repoDir,
      ]);
    } catch (error) {
      throw new BadRequestException(
        `Unable to clone repository ${input.repoUrl} on branch ${input.branch}: ${this.toErrorMessage(error)}`,
      );
    }

    try {
      const normalizedRepoPath = this.normalizeRepoPath(input.repoPath);
      const targetPath = this.resolveSafePath(repoDir, normalizedRepoPath);

      try {
        const stat = await fs.stat(targetPath);
        if (!stat.isDirectory()) {
          throw new BadRequestException(
            `Repository path "${normalizedRepoPath}" is not a directory in ${input.branch}.`,
          );
        }
      } catch (error) {
        if (error instanceof BadRequestException) throw error;
        throw new BadRequestException(
          `Repository path "${normalizedRepoPath}" does not exist in branch ${input.branch}.`,
        );
      }

      const dockerfiles = await this.findDockerfiles(targetPath);
      if (dockerfiles.length === 0) {
        throw new BadRequestException(
          `Path "${normalizedRepoPath}" must contain at least one Dockerfile.`,
        );
      }

      const manifest = await this.loadManifest(targetPath);
      if (manifest) {
        await this.resolveIconFiles(manifest, targetPath);
      }
      const commit = await this.readHeadCommit(repoDir);
      const repoTag = await this.readHeadTag(repoDir);

      return {
        normalizedRepoPath,
        dockerfiles,
        manifest,
        commit,
        repoTag,
      };
    } finally {
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  }

  private normalizeRepoPath(repoPath: string): string {
    const raw = repoPath.trim();
    if (raw === '' || raw === '/' || raw === '.') return '.';
    const withoutLeadingSlash = raw.replace(/^\/+/, '');
    const normalized = path.posix.normalize(withoutLeadingSlash);
    if (normalized.startsWith('..')) {
      throw new BadRequestException('Repository path cannot escape repository root.');
    }
    return normalized;
  }

  private resolveSafePath(repoRoot: string, repoPath: string): string {
    const candidate = path.resolve(repoRoot, repoPath === '.' ? '' : repoPath);
    if (candidate !== repoRoot && !candidate.startsWith(`${repoRoot}${path.sep}`)) {
      throw new BadRequestException('Repository path is outside repository root.');
    }
    return candidate;
  }

  private async findDockerfiles(baseDir: string): Promise<string[]> {
    const results: string[] = [];
    await this.walk(baseDir, '', results);
    return results.sort();
  }

  private async walk(absoluteDir: string, relativeDir: string, accumulator: string[]): Promise<void> {
    const entries = await fs.readdir(absoluteDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === '.git') continue;
      const absPath = path.join(absoluteDir, entry.name);
      const relPath = relativeDir ? `${relativeDir}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        await this.walk(absPath, relPath, accumulator);
      } else if (entry.isFile() && entry.name.toLowerCase().startsWith('dockerfile')) {
        accumulator.push(relPath);
      }
    }
  }

  private async loadManifest(baseDir: string): Promise<ImageTemplateManifest | null> {
    const manifestPath = path.join(baseDir, 'manifest.yml');
    try {
      await fs.access(manifestPath);
    } catch {
      return null;
    }

    const yamlContent = await fs.readFile(manifestPath, 'utf8');
    const parsed = parse(yamlContent);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new BadRequestException('manifest.yml must contain a YAML object at root level.');
    }

    const manifestRecord = parsed as Record<string, unknown>;
    const manifest = {
      ...manifestRecord,
    } as ImageTemplateManifest;

    for (const key of MANIFEST_STANDARD_KEYS) {
      const value = manifestRecord[key];
      if (value !== undefined && typeof value !== 'string') {
        throw new BadRequestException(`manifest.yml field "${key}" must be a string.`);
      }
    }

    // Normalize commands from YAML format [{ set_provider: "..." }] to [{ type, command }]
    if (manifestRecord['commands'] !== undefined) {
      manifest.commands = this.parseManifestCommands(manifestRecord['commands']);
    }

    // Validate workspace_path (must be an absolute container path without traversal)
    const wp = manifestRecord['workspace_path'];
    if (wp !== undefined) {
      if (typeof wp !== 'string') {
        throw new BadRequestException('manifest.yml field "workspace_path" must be a string.');
      }
      const trimmed = wp.trim();
      if (!trimmed.startsWith('/')) {
        throw new BadRequestException('manifest.yml field "workspace_path" must be an absolute path (start with "/").');
      }
      if (trimmed.includes('..')) {
        throw new BadRequestException('manifest.yml field "workspace_path" must not contain "..".');
      }
    }

    // Validate home_path (mandatory, must be an absolute container path without traversal)
    const hp = manifestRecord['home_path'];
    if (hp === undefined || (typeof hp === 'string' && hp.trim() === '')) {
      throw new BadRequestException('manifest.yml field "home_path" is mandatory.');
    }
    if (typeof hp !== 'string') {
      throw new BadRequestException('manifest.yml field "home_path" must be a string.');
    }
    const hpTrimmed = hp.trim();
    if (!hpTrimmed.startsWith('/')) {
      throw new BadRequestException('manifest.yml field "home_path" must be an absolute path (start with "/").');
    }
    if (hpTrimmed.includes('..')) {
      throw new BadRequestException('manifest.yml field "home_path" must not contain "..".');
    }

    // Validate user (OPTIONAL — ignored by CodePods. Manifests may still declare a
    // `user` for documentation; we accept-and-ignore it (agents run as a per-agent
    // logical uid assigned by the API, never the manifest user). Extra manifest fields
    // are tolerated harmlessly.
    const mu = manifestRecord['user'];
    if (mu !== undefined && mu !== null) {
      if (typeof mu !== 'string') {
        throw new BadRequestException('manifest.yml field "user" must be a string if present.');
      }
    }

    return {
      ...manifest,
      home_path: hpTrimmed,
    };
  }

  private parseManifestCommands(raw: unknown): ManifestCommand[] {
    if (!Array.isArray(raw)) {
      throw new BadRequestException('manifest.yml field "commands" must be a list.');
    }
    const knownTypes = new Set<ManifestCommandType>([
      'set_provider', 'start_agent', 'stop_agent', 'set_git_proxy',
      'add_mcp_server', 'remove_mcp_server', 'get_mcps',
      'add_skill', 'remove_skill', 'get_skills',
    ]);
    const commands: ManifestCommand[] = [];
    for (const entry of raw) {
      if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
        throw new BadRequestException('Each command entry must be a YAML object.');
      }
      const record = entry as Record<string, unknown>;
      for (const [key, value] of Object.entries(record)) {
        if (!knownTypes.has(key as ManifestCommandType)) {
          // Skip unknown command types — they may be future commands not yet supported
          continue;
        }
        if (typeof value !== 'string') {
          throw new BadRequestException(`Command "${key}" must have a string value.`);
        }
        commands.push({ type: key as ManifestCommandType, command: value });
      }
    }
    return commands;
  }

  private async readHeadCommit(repoDir: string): Promise<string> {
    const { stdout } = await execFileAsync('git', ['-C', repoDir, 'rev-parse', 'HEAD']);
    return stdout.trim();
  }

  private async readHeadTag(repoDir: string): Promise<string | null> {
    try {
      const { stdout } = await execFileAsync('git', ['-C', repoDir, 'describe', '--tags', '--exact-match', 'HEAD']);
      const tag = stdout.trim();
      return tag === '' ? null : tag;
    } catch {
      return null;
    }
  }

  private async resolveIconFiles(manifest: ImageTemplateManifest, baseDir: string): Promise<void> {
    for (const key of ['icon', 'icon_dark']) {
      const value = manifest[key];
      if (typeof value !== 'string') continue;
      const trimmed = value.trim();
      if (this.isInlineOrRemoteIcon(trimmed)) continue;

      const relativePath = trimmed.replace(/^[/\\.]+/, '');
      const resolved = path.resolve(baseDir, relativePath);
      if (!resolved.startsWith(`${baseDir}${path.sep}`)) continue;

      try {
        const data = await fs.readFile(resolved);
        const mime = this.mimeTypeFromName(relativePath);
        manifest[key] = `data:${mime};base64,${data.toString('base64')}`;
      } catch {
        // Keep the original value if the referenced file cannot be read.
      }
    }
  }

  private isInlineOrRemoteIcon(value: string): boolean {
    return (
      /^(https?:\/\/|data:)/i.test(value) ||
      value.startsWith('<svg') ||
      value.includes('xmlns=')
    );
  }

  private mimeTypeFromName(value: string): string {
    const lower = value.toLowerCase();
    if (lower.endsWith('.svg')) return 'image/svg+xml';
    if (lower.endsWith('.png')) return 'image/png';
    if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
    if (lower.endsWith('.gif')) return 'image/gif';
    if (lower.endsWith('.webp')) return 'image/webp';
    return 'application/octet-stream';
  }

  private toErrorMessage(error: unknown): string {
    if (error instanceof Error && error.message.trim()) {
      const message = error.message.trim();
      if (message.includes('git-lfs filter-process')) {
        return (
          'This repository uses Git LFS, but git-lfs is not installed. ' +
          'Install git-lfs and try again. See https://git-lfs.com.'
        );
      }
      return message;
    }
    return 'unknown error';
  }
}
