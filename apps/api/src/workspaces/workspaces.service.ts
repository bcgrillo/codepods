import { Injectable, BadRequestException, NotFoundException, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import * as path from 'path';
import * as fs from 'fs';
import { spawn } from 'child_process';
import { CredentialsService } from '../credentials/credentials.service';
import { GitProvidersService } from '../git-providers/git-providers.service';
import { ConfigService } from '../config/config.service';
import { AgentsMdService } from '../agents-md/agents-md.service';
import { WorkspaceEntity } from './workspace.entity';
import { CreateWorkspaceBodyDto, UpdateWorkspaceBodyDto, InlineWorkspaceCredentialDto } from './dto/workspace.dto';
import type { Workspace, Credential, WorkspaceFileEntry, UploadOverwriteMode, UploadResult, GitStatus, GitFileChange, GitBranchesResult, GitBranch, GitStashResult, GitCommitResult, GitSyncResult } from '@codepods/shared-types';

/** Absolute path to the custom git credential helper script. */
const CREDENTIAL_HELPER = path.join(__dirname, '..', '..', 'scripts', 'git-credential-codepods.js');

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

/** Extract a repo name slug from a git URL. e.g. https://github.com/user/repo.git → "repo" */
function slugFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const parts = u.pathname.replace(/\.git$/, '').split('/').filter(Boolean);
    return slugify(parts[parts.length - 1] ?? u.hostname);
  } catch {
    const base = url.replace(/\.git$/, '').split('/').pop() ?? url;
    return slugify(base);
  }
}

function hostFromUrl(url: string): string | null {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

  @Injectable()
export class WorkspacesService implements OnApplicationBootstrap {
  private readonly logger = new Logger(WorkspacesService.name);
  /** null = unchecked, true/false = result of the startup ACL probe. */
  private aclSupported: boolean | null = null;

  constructor(
    @InjectRepository(WorkspaceEntity)
    private readonly workspaces: Repository<WorkspaceEntity>,
    private readonly credentials: CredentialsService,
    private readonly gitProviders: GitProvidersService,
    private readonly config: ConfigService,
    private readonly agentsMd: AgentsMdService,
  ) {}

  private get workspacesDir(): string {
    return path.join(this.config.get('dataDir'), 'workspaces');
  }

  /**
   * Run once at startup: verify the host can enforce the agent/workspace ACL
   * grants. Without `setfacl` or filesystem ACL support, agents cannot write
   * their shared workspace bind-mount, so surface an actionable warning early.
   */
  async onApplicationBootstrap(): Promise<void> {
    await this.checkAclSupport();
  }

  /** Cached result of the startup ACL probe (null = not yet checked). */
  isAclSupported(): boolean | null {
    return this.aclSupported;
  }

  private async checkAclSupport(): Promise<void> {
    // 1. setfacl binary present?
    const hasSetfacl = await this.binaryAvailable('setfacl');
    if (!hasSetfacl) {
      this.aclSupported = false;
      this.logger.warn(
        'setfacl is not installed on the host. Agent workspaces require POSIX ACLs so the container user can write the shared bind-mount. Install it with: sudo apt install acl',
      );
      return;
    }
    // 2. filesystem supports POSIX ACLs? probe with a named entry on a temp dir.
    let probe: string | null = null;
    try {
      fs.mkdirSync(this.workspacesDir, { recursive: true });
      probe = path.join(this.workspacesDir, `.acl-probe-${Date.now()}`);
      fs.mkdirSync(probe);
      // u:65534 (nobody) is just a probe uid; a successful setfacl proves the
      // filesystem accepts named user ACL entries.
      await this.runSetfacl(['-m', 'u:65534:rwX', probe]);
      this.aclSupported = true;
    } catch {
      this.aclSupported = false;
      this.logger.warn(
        `POSIX ACLs are not supported on the filesystem holding "${this.workspacesDir}". Agent workspaces will not be writable by the container user. Remount with the "acl" option or move the data directory to an ACL-capable filesystem (ext4/xfs/btrfs).`,
      );
    } finally {
      if (probe) {
        try {
          await this.runSetfacl(['-x', 'u:65534', probe]);
        } catch {
          /* best-effort cleanup */
        }
        try {
          fs.rmSync(probe, { recursive: true, force: true });
        } catch {
          /* ignore */
        }
      }
    }
  }

  /** Resolve to true if the binary exists (any exit code counts as present; only ENOENT means missing). */
  private binaryAvailable(bin: string): Promise<boolean> {
    return new Promise((resolve) => {
      const proc = spawn(bin, ['--version'], {});
      proc.on('error', () => resolve(false));
      proc.on('close', () => resolve(true));
    });
  }

  private get dataDirAbs(): string {
    return path.resolve(this.config.get('dataDir'));
  }

  // --- Workspaces ---

  async findAll(codepodId = 1): Promise<Workspace[]> {
    const list = await this.workspaces.find({ where: { codepodId }, order: { name: 'ASC' } });
    return list.map((w) => this.toSafe(w));
  }

  async findOne(id: number, codepodId = 1): Promise<Workspace> {
    const ws = await this.workspaces.findOne({ where: { id, codepodId } });
    if (!ws) throw new NotFoundException('Workspace not found');
    return this.toSafe(ws);
  }

  /** Batch-load workspaces by ID (scoped to codepodId). Returns a map keyed by id. */
  async findByIds(ids: number[], codepodId = 1): Promise<Map<number, Workspace>> {
    if (ids.length === 0) return new Map();
    const list = await this.workspaces.find({ where: { id: In(ids), codepodId } });
    return new Map(list.map((w) => [w.id, this.toSafe(w)]));
  }

  async create(dto: CreateWorkspaceBodyDto, codepodId = 1): Promise<Workspace> {
    // --- New-remote: create repo on provider, then proceed as remote clone ---
    let effectiveType: 'local' | 'remote' = dto.type;
    let effectiveRemoteUrl = dto.remoteUrl;

    if (dto.gitProvider && dto.repoName) {
      const token = await this.resolveToken(dto, codepodId);
      const result = await this.gitProviders.createRepo(dto.gitProvider, {
        token,
        repoName: dto.repoName,
        private: dto.repoPrivate ?? true,
      });
      effectiveType = 'remote';
      effectiveRemoteUrl = result.url;
    }

    if (effectiveType === 'remote' && !effectiveRemoteUrl) {
      throw new BadRequestException('remoteUrl is required for remote workspaces');
    }

    // --- Deduce slug & name if not provided ---
    let slug = (dto.slug ?? '').trim();
    let name = (dto.name ?? '').trim();
    if (!slug) {
      slug = effectiveType === 'remote' && effectiveRemoteUrl
        ? slugFromUrl(effectiveRemoteUrl)
        : slugify(name || 'workspace');
    }
    if (!name) name = slug;
    // Auto-suffix slug on collision
    slug = await this.ensureUniqueSlug(slug, codepodId);

    // --- Credential resolution ---
    let credentialId: number | null = dto.credentialId ?? null;
    if (dto.credential) {
      const cred = await this.createCredentialFromInline(dto.credential, effectiveRemoteUrl ?? '', codepodId);
      credentialId = cred.id;
    }

    const ws = this.workspaces.create({
      codepodId,
      slug,
      name,
      type: effectiveType,
      remoteUrl: effectiveRemoteUrl ?? null,
      credentialId,
      branch: null,
    });
    await this.workspaces.save(ws);

    // Create the directory: clone or init
    const wsPath = this.getWorkspacePath(ws);
    fs.mkdirSync(this.workspacesDir, { recursive: true });

    if (effectiveType === 'remote') {
      await this.cloneRepo(ws, effectiveRemoteUrl!, credentialId);
    } else {
      await this.initRepo(wsPath);
    }

    // Detect branch
    const branch = await this.detectBranch(wsPath);
    if (branch) {
      ws.branch = branch;
      await this.workspaces.save(ws);
    }

    // Optionally copy AGENTS.md into the workspace
    if (dto.copyAgentsMd) {
      await this.copyAgentsMdInto(wsPath, codepodId, dto.agentsMdId);
    }

    // Seed empty repos (newly created on provider) so they're immediately
    // usable: make an initial commit and push to create the remote branch.
    await this.seedEmptyRepo(wsPath, ws, credentialId);

    return this.toSafe(ws);
  }

  async update(id: number, dto: UpdateWorkspaceBodyDto, codepodId = 1): Promise<Workspace> {
    const ws = await this.workspaces.findOne({ where: { id, codepodId } });
    if (!ws) throw new NotFoundException('Workspace not found');

    const wsPath = this.getWorkspacePath(ws);
    // Effective credential id for the resulting remote (null for local).
    const effCredId = dto.credentialId !== undefined ? dto.credentialId : ws.credentialId;

    // --- New-remote conversion: create repo on provider, set origin, push ---
    if (dto.gitProvider && dto.repoName) {
      const token = await this.getDecryptedToken(effCredId ?? ws.credentialId ?? 0);
      if (!token) throw new NotFoundException('Git credential not found');
      const result = await this.gitProviders.createRepo(dto.gitProvider, {
        token,
        repoName: dto.repoName,
        private: dto.repoPrivate ?? true,
      });

      // Set origin to the new repo URL and push
      await this.setRemoteOrigin(wsPath, result.url, effCredId ?? ws.credentialId);
      ws.type = 'remote';
      ws.remoteUrl = result.url;
      if (effCredId !== undefined) ws.credentialId = effCredId;

      // Push current branch to the new remote
      const branch = await this.detectBranch(wsPath);
      if (branch) {
        await this.runGit(['push', '-u', 'origin', branch], wsPath).catch(() => {
          // Ignore push errors — repo is created, user can push manually
        });
      }

      if (dto.name !== undefined) ws.name = dto.name;
      await this.workspaces.save(ws);
      return this.toSafe(ws);
    }

    // --- Type / remoteUrl conversion (local ↔ remote) ---
    if (dto.type !== undefined && dto.type !== ws.type) {
      if (dto.type === 'remote') {
        // local → remote: need a remoteUrl
        const url = (dto.remoteUrl ?? ws.remoteUrl ?? '').trim();
        if (!url) throw new BadRequestException('remoteUrl is required to convert to remote');
        await this.setRemoteOrigin(wsPath, url, effCredId);
        ws.type = 'remote';
        ws.remoteUrl = url;
        ws.credentialId = effCredId;
      } else {
        // remote → local: remove origin
        await this.removeRemoteOrigin(wsPath);
        ws.type = 'local';
        ws.remoteUrl = null;
        ws.credentialId = null;
      }
    } else if (dto.remoteUrl !== undefined) {
      // remoteUrl changed (type untouched)
      const newUrl = dto.remoteUrl?.trim() || null;
      if (newUrl && ws.type === 'remote') {
        await this.setRemoteOrigin(wsPath, newUrl, effCredId);
        ws.remoteUrl = newUrl;
        ws.credentialId = effCredId;
      } else if (newUrl && ws.type === 'local') {
        // Add origin to a local repo, promote to remote
        await this.setRemoteOrigin(wsPath, newUrl, effCredId);
        ws.type = 'remote';
        ws.remoteUrl = newUrl;
        ws.credentialId = effCredId;
      } else if (!newUrl && ws.type === 'remote') {
        // Clear remoteUrl → demote to local
        await this.removeRemoteOrigin(wsPath);
        ws.type = 'local';
        ws.remoteUrl = null;
        ws.credentialId = null;
      }
    } else if (dto.credentialId !== undefined && ws.type === 'remote') {
      // Only the credential changed (same origin) → rewire the helper.
      await this.configureCredentialHelper(wsPath, effCredId);
      ws.credentialId = effCredId;
    }

    if (dto.name !== undefined) ws.name = dto.name;

    await this.workspaces.save(ws);
    return this.toSafe(ws);
  }

  async remove(id: number, codepodId = 1): Promise<void> {
    const ws = await this.workspaces.findOne({ where: { id, codepodId } });
    if (!ws) throw new NotFoundException('Workspace not found');

    // Remove the directory
    const wsPath = this.getWorkspacePath(ws);
    if (fs.existsSync(wsPath)) {
      fs.rmSync(wsPath, { recursive: true, force: true });
    }

    await this.workspaces.remove(ws);
  }

  /** Live repo inspection via git commands. */
  async getInfo(id: number, codepodId = 1): Promise<import('@codepods/shared-types').WorkspaceRepoInfo> {
    const ws = await this.workspaces.findOne({ where: { id, codepodId } });
    if (!ws) throw new NotFoundException('Workspace not found');
    const wsPath = this.getWorkspacePath(ws);
    if (!fs.existsSync(wsPath) || !fs.existsSync(path.join(wsPath, '.git'))) {
      return {
        branch: null,
        head: { hash: null, shortHash: null, message: null, author: null, date: null },
        lastTag: null,
        remotes: [],
        dirty: false,
        ahead: null,
        behind: null,
      };
    }

    const branch = (await this.runGitSafe(['symbolic-ref', '--short', 'HEAD'], wsPath)).trim()
      || (await this.runGitSafe(['rev-parse', '--abbrev-ref', 'HEAD'], wsPath)).trim()
      || null;
    const log = await this.runGitSafe(
      ['log', '-1', '--format=%H%n%h%n%s%n%an%n%aI'],
      wsPath,
    );
    let head = { hash: null, shortHash: null, message: null, author: null, date: null } as {
      hash: string | null; shortHash: string | null; message: string | null; author: string | null; date: string | null;
    };
    if (log) {
      const [hash, shortHash, message, author, date] = log.split('\n');
      head = { hash: hash ?? null, shortHash: shortHash ?? null, message: message ?? null, author: author ?? null, date: date ?? null };
    }

    const lastTag = await this.runGitSafe(['describe', '--tags', '--abbrev=0'], wsPath);

    const remotesRaw = await this.runGitSafe(['remote', '-v'], wsPath);
    const remotes: { name: string; url: string }[] = [];
    if (remotesRaw) {
      for (const line of remotesRaw.split('\n')) {
        const m = line.match(/^(\S+)\s+(\S+)\s+\(/);
        if (m && !remotes.find((r) => r.name === m[1])) {
          remotes.push({ name: m[1], url: m[2] });
        }
      }
    }

    const status = await this.runGitSafe(['status', '--porcelain'], wsPath);
    const dirty = !!status?.trim();

    let ahead: number | null = null;
    let behind: number | null = null;
    const counts = await this.runGitSafe(['rev-list', '--left-right', '--count', '@{upstream}...HEAD'], wsPath);
    if (counts) {
      const [b, a] = counts.split('\n')[0].split(/\s+/).map((n) => parseInt(n, 10));
      if (!Number.isNaN(b)) behind = b;
      if (!Number.isNaN(a)) ahead = a;
    }

    return {
      branch: branch?.trim() || null,
      head,
      lastTag: lastTag?.trim() || null,
      remotes,
      dirty,
      ahead,
      behind,
    };
  }

  /** Test the remote connection via `git ls-remote` (uses the repo's helper). */
  async testRemote(id: number, codepodId = 1): Promise<import('@codepods/shared-types').WorkspaceTestResult> {
    const ws = await this.workspaces.findOne({ where: { id, codepodId } });
    if (!ws) throw new NotFoundException('Workspace not found');
    if (!ws.remoteUrl) {
      return { ok: false, message: 'No remote configured', latencyMs: 0 };
    }

    const wsPath = this.getWorkspacePath(ws);
    if (!fs.existsSync(wsPath) || !fs.existsSync(path.join(wsPath, '.git'))) {
      return { ok: false, message: 'Repository not initialized', latencyMs: 0 };
    }

    const start = Date.now();
    try {
      // `ls-remote origin` runs in the workspace dir, so git uses the
      // configured credential helper to authenticate (clean URL).
      await this.runGit(['ls-remote', 'origin'], wsPath);
      return { ok: true, message: null, latencyMs: Date.now() - start };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : 'Test failed', latencyMs: Date.now() - start };
    }
  }

  /** Copy an AGENTS.md version into an existing workspace. */
  async copyAgentsMd(
    id: number,
    agentsMdId: number | null,
    codepodId = 1,
  ): Promise<{ ok: true; renamed: boolean; backupName?: string }> {
    const ws = await this.workspaces.findOne({ where: { id, codepodId } });
    if (!ws) throw new NotFoundException('Workspace not found');
    const wsPath = this.getWorkspacePath(ws);
    const result = await this.copyAgentsMdInto(wsPath, codepodId, agentsMdId);
    return { ok: true, ...result };
  }

  // --- File upload ---

  /**
   * Write uploaded files into the workspace directory.
   * Filenames are sanitized to prevent path traversal; only the basename is kept.
   * An optional relative subPath (e.g. "/imagenes") targets a subfolder, which is
   * created if it does not exist. Empty subPath means the workspace root.
   */
  async uploadFiles(
    id: number,
    files: { originalname: string; buffer: Buffer }[],
    codepodId = 1,
    subPath = '',
  ): Promise<{ ok: true; written: string[]; overwritten: { name: string; backup: string }[] }> {
    const ws = await this.workspaces.findOne({ where: { id, codepodId } });
    if (!ws) throw new NotFoundException('Workspace not found');
    if (!files || files.length === 0) {
      throw new BadRequestException('No files provided');
    }

    const wsPath = this.getWorkspacePath(ws);
    if (!fs.existsSync(wsPath)) {
      throw new BadRequestException('Workspace directory does not exist yet');
    }

    const relPath = this.sanitizeSubPath(subPath);
    const destDir = relPath ? path.join(wsPath, relPath) : wsPath;
    await fs.promises.mkdir(destDir, { recursive: true });

    const written: string[] = [];
    const overwritten: { name: string; backup: string }[] = [];
    const used = new Set<string>();
    for (const file of files) {
      const safeName = path.basename(file.originalname || '').replace(/[\\/]/g, '');
      if (!safeName || safeName === '.' || safeName === '..') {
        throw new BadRequestException(`Invalid file name: ${file.originalname}`);
      }
      // Deduplicate against names already written earlier in this batch, so
      // pasting multiple screenshots all named "image.png" keeps them all
      // distinct (image.png, image-1.png, ...).
      const batchName = this.uniqueBatchName(safeName, used);
      const dest = path.join(destDir, batchName);
      // Guard against any residual traversal even after basename sanitization.
      if (!dest.startsWith(wsPath + path.sep)) {
        throw new BadRequestException(`Invalid file name: ${file.originalname}`);
      }
      // Never silently overwrite an existing file: rename it to a timestamped
      // backup first (same convention as AGENTS.md) so the caller can warn.
      if (fs.existsSync(dest)) {
        const backup = `${batchName}.bak-${Date.now()}`;
        fs.renameSync(dest, path.join(destDir, backup));
        overwritten.push({ name: batchName, backup });
      }
      await fs.promises.writeFile(dest, file.buffer);
      written.push(relPath ? `${relPath.replace(/\\/g, '/')}/${batchName}` : batchName);
    }
    return { ok: true, written, overwritten };
  }

  /**
   * Return a file name that does not collide with any other name already used
   * in this upload batch (`used`). For repeated names like "image.png" this
   * produces "image-1.png", "image-2.png", and so on. Does not consider the
   * filesystem: collisions with existing files are handled via backups.
   */
  private uniqueBatchName(name: string, used: Set<string>): string {
    const ext = path.extname(name);
    const base = path.basename(name, ext);
    let candidate = name;
    let i = 1;
    while (used.has(candidate)) {
      candidate = `${base}-${i}${ext}`;
      i += 1;
    }
    used.add(candidate);
    return candidate;
  }

  /**
   * Normalize a user-supplied relative path for uploads. Rejects traversal
   * ("..") and empty segments; returns '' for the workspace root.
   */
  private sanitizeSubPath(subPath: string | undefined): string {
    if (!subPath) return '';
    const cleaned = subPath.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
    if (!cleaned) return '';
    const segments = cleaned.split('/');
    if (segments.some((s) => s === '..' || s === '.' || s === '')) {
      throw new BadRequestException('Invalid upload path');
    }
    return segments.join(path.sep);
  }

  // --- Git Credentials (unified) ---
  // Inline credential creation during workspace create/update. Delegates to
  // the unified CredentialsService with type='user_pass'.
  private async createCredentialFromInline(
    inline: InlineWorkspaceCredentialDto,
    remoteUrl: string,
    codepodId: number,
  ): Promise<Credential> {
    const label = inline.label?.trim() || await this.ensureUniqueCredentialLabel(inline.username, codepodId);
    const host = hostFromUrl(remoteUrl) || 'unknown';

    return this.credentials.create(
      { label, type: 'user_pass', host, username: inline.username, secret: inline.token },
      codepodId,
    );
  }

  /** Decrypt the token for internal use (never exposed via API). */
  getDecryptedToken(credentialId: number): Promise<string | null> {
    return this.credentials.getSecret(credentialId);
  }

  /** Resolve a token from inline credential or existing credentialId. */
  private async resolveToken(dto: CreateWorkspaceBodyDto, _codepodId: number): Promise<string> {
    if (dto.credentialId) {
      const token = await this.getDecryptedToken(dto.credentialId);
      if (!token) throw new NotFoundException('Git credential not found');
      return token;
    }
    if (dto.credential) {
      return dto.credential.token;
    }
    throw new BadRequestException('A credential is required to create a new remote repo');
  }

  // --- Uniqueness helpers ---

  private async ensureUniqueSlug(base: string, codepodId: number, excludeId?: number): Promise<string> {
    const root = slugify(base) || 'workspace';
    let candidate = root;
    let n = 2;
    for (;;) {
      const existing = await this.workspaces.findOne({ where: { codepodId, slug: candidate } });
      if (!existing || (excludeId !== undefined && existing.id === excludeId)) break;
      candidate = `${root}-${n++}`;
    }
    return candidate;
  }

  private async ensureUniqueCredentialLabel(base: string, codepodId: number): Promise<string> {
    const root = base.trim() || 'credential';
    const existing = await this.credentials.findAll(codepodId);
    const labels = new Set(existing.map((c) => c.label));
    let candidate = root;
    let n = 2;
    while (labels.has(candidate)) candidate = `${root}-${n++}`;
    return candidate;
  }

  // --- Helpers ---

  getWorkspacePath(ws: WorkspaceEntity): string {
    return path.join(this.workspacesDir, ws.slug);
  }

  /** Returns the size of a workspace directory in bytes (0 if not found). */
  getWorkspaceSize(ws: { slug: string }): number {
    const wsPath = path.join(this.workspacesDir, ws.slug);
    if (!fs.existsSync(wsPath)) return 0;
    return this.dirSize(wsPath);
  }

  /** Recursively computes the size of a directory in bytes (skips .git). */
  private dirSize(dirPath: string): number {
    let total = 0;
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name === '.git' && entry.isDirectory()) continue;
        const full = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
          total += this.dirSize(full);
        } else if (entry.isFile()) {
          try {
            total += fs.statSync(full).size;
          } catch {
            // symlink or permission issue — skip
          }
        }
      }
    } catch {
      // permission issue — return 0
    }
    return total;
  }

  /**
   * Grant the container agent user rwx access to the workspace bind-mount via
   * POSIX ACLs. The workspace stays owned by the API (host) process; the agent
   * (a different uid) only gets an ACL entry, keeping the bind a shared resource
   * the host still fully owns. Applies recursively to existing files and as a
   * default ACL so files the agent creates later inherit the grant.
   *
   * Returns true on success, false if setfacl is unavailable or ACLs are not
   * supported on the filesystem — without it the agent cannot write the
   * workspace, so the caller should surface the failure.
   */
  async grantAgentAccess(workspacePath: string, agentUid: number): Promise<string | null> {
    // Access entry on all files+dirs. Capital X grants execute only on dirs (or
    // already-executable files), so regular source files don't become executable.
    // The access entry is valid on both files and dirs, so this must succeed.
    try {
      await this.runSetfacl(['-R', '-m', `u:${agentUid}:rwX`, workspacePath]);
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
    // Default entry (inherited by newly created files) is only valid on dirs, so
    // scope it with `find -type d`. Best-effort: a failure here still leaves the
    // access grant intact, so the agent can write existing paths — but new files
    // created by the host (e.g. git pull) won't inherit the grant, causing
    // permission errors for the agent. We log a warning if this step fails.
    const defaultOk = await this.runFindSetfacl(workspacePath, ['-m', `d:u:${agentUid}:rwX`]);
    if (!defaultOk) {
      // Fallback: setfacl -R -m d:u:<uid>:rwX recurses over files AND dirs.
      // It errors on regular files (default ACL is dir-only) but succeeds on
      // directories, so the non-zero exit is expected and harmless.
      const fallbackOk = await this.runSetfaclDefault(workspacePath, agentUid);
      if (!fallbackOk) {
        this.logger.warn(
          `Could not set default ACL for agent uid ${agentUid} on ${workspacePath}. ` +
          'New files created by the host will not be writable by the agent. ' +
          'Check that setfacl and find are available on the host.',
        );
      }
    }
    return null;
  }

  /**
   * Revoke the agent's workspace ACL entry (the mirror of grantAgentAccess).
   * Called on agent removal, but only when no other remaining agent on the same
   * workspace shares this uid (the caller decides that). Best-effort and
   * tolerant of non-zero exits: `setfacl -x` errors on files that never had the
   * entry ("Cannot remove an entry which doesn't exist") but still removes it
   * from files/dirs that did.
   */
  async revokeAgentAccess(workspacePath: string, agentUid: number): Promise<boolean> {
    // Access entry, recursively. Tolerate non-zero (some entries may not exist).
    const ran = await this.runSetfaclBestEffort(['-R', '-x', `u:${agentUid}`, workspacePath]);
    // Default entry on dirs only (invalid on regular files).
    await this.runFindSetfacl(workspacePath, ['-x', `d:u:${agentUid}`]);
    return ran;
  }

  private runSetfacl(args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const proc = spawn('setfacl', args, {});
      let stderr = '';
      proc.stderr.on('data', (d) => (stderr += d.toString()));
      proc.on('close', (code) =>
        code === 0 ? resolve() : reject(new Error(stderr || `setfacl exited with code ${code}`)),
      );
      proc.on('error', reject);
    });
  }

  /** Like runSetfacl but never rejects: resolves true if setfacl ran (binary
   *  present), false on ENOENT. Non-zero exit codes are ignored (used by revoke,
   *  where missing entries are expected and harmless). */
  private runSetfaclBestEffort(args: string[]): Promise<boolean> {
    return new Promise((resolve) => {
      const proc = spawn('setfacl', args, {});
      proc.on('error', () => resolve(false));
      proc.on('close', () => resolve(true));
    });
  }

  /** Run `setfacl <setfaclArgs>` over every directory under `root` via
   *  `find <root> -type d -exec setfacl ... {} +`. Used for default ACL entries,
   *  which are only valid on directories. Returns true on success, false on
   *  failure (binary missing, non-zero exit). Errors are logged for diagnosis. */
  private runFindSetfacl(root: string, setfaclArgs: string[]): Promise<boolean> {
    return new Promise((resolve) => {
      const proc = spawn('find', [root, '-type', 'd', '-exec', 'setfacl', ...setfaclArgs, '{}', '+'], {});
      let stderr = '';
      proc.stderr?.on('data', (d: Buffer) => (stderr += d.toString()));
      proc.on('error', (e) => {
        this.logger.warn(`runFindSetfacl: spawn error: ${e.message}`);
        resolve(false);
      });
      proc.on('close', (code) => {
        if (code !== 0) {
          this.logger.warn(
            `runFindSetfacl: find/setfacl exited with code ${code}` +
            (stderr ? `: ${stderr.trim().split('\n')[0]}` : ''),
          );
          resolve(false);
        } else {
          resolve(true);
        }
      });
    });
  }

  /** Fallback for default ACL: `setfacl -R -m d:u:<uid>:rwX <path>`.
   *  Recurses over files and dirs. Errors on regular files (default ACL is
   *  dir-only) but succeeds on directories. Returns true if setfacl ran
   *  (even with non-zero exit), false if the binary is missing. */
  private runSetfaclDefault(workspacePath: string, agentUid: number): Promise<boolean> {
    return new Promise((resolve) => {
      const proc = spawn('setfacl', ['-R', '-m', `d:u:${agentUid}:rwX`, workspacePath], {
        stdio: ['ignore', 'ignore', 'pipe'], // suppress stdout/stderr noise from file errors
      });
      proc.on('error', () => resolve(false));
      proc.on('close', () => resolve(true)); // non-zero is expected (file errors)
    });
  }

  private async cloneRepo(ws: WorkspaceEntity, remoteUrl: string, credentialId: number | null): Promise<void> {
    const wsPath = this.getWorkspacePath(ws);
    // Keep the clone URL clean (no embedded credentials). When a credential is
    // configured, the custom helper supplies it to git during the fetch phase
    // of the clone and is persisted in the new repo's config.
    const args = ['clone'];
    if (credentialId) {
      args.push('--config', `credential.helper=${this.credentialHelperConfig(credentialId)}`);
    }
    args.push(remoteUrl, wsPath);
    await this.runGit(args);
    // Mark the repo as safe regardless of which UID/path accesses it (host
    // process vs. agent container with a different mount path). Local config
    // only affects this repo and is read by both the host git and the in-container
    // git (via bind-mount), so it doesn't "leak" to the agent's global config.
    await this.runGit(['config', 'safe.directory', '*'], wsPath);
  }

  private async initRepo(wsPath: string): Promise<void> {
    fs.mkdirSync(wsPath, { recursive: true });
    await this.runGit(['init', '-b', 'main'], wsPath);
    // See cloneRepo for rationale on safe.directory.
    await this.runGit(['config', 'safe.directory', '*'], wsPath);
  }

  /** Copy an AGENTS.md version into a freshly created workspace.
   *  Uses a specific version when `agentsMdId` is provided, otherwise the default.
   *  If an AGENTS.md already exists it is renamed to a timestamped backup first
   *  (so the caller can surface a notice) and the new content is written. */
  private async copyAgentsMdInto(
    wsPath: string,
    codepodId: number,
    agentsMdId?: number | null,
  ): Promise<{ renamed: boolean; backupName?: string }> {
    const md = agentsMdId
      ? await this.agentsMd.findOne(agentsMdId, codepodId)
      : await this.agentsMd.getDefault(codepodId);
    if (!md) return { renamed: false }; // nothing to copy if no version configured
    const target = path.join(wsPath, 'AGENTS.md');
    if (fs.existsSync(target)) {
      const backupName = `AGENTS.md.bak-${Date.now()}`;
      fs.renameSync(target, path.join(wsPath, backupName));
      fs.writeFileSync(target, md.content, 'utf8');
      return { renamed: true, backupName };
    }
    fs.writeFileSync(target, md.content, 'utf8');
    return { renamed: false };
  }

  /** Build the per-repo credential.helper config value pointing at our helper. */
  private credentialHelperConfig(credentialId: number): string {
    return `${CREDENTIAL_HELPER} --credential-id=${credentialId} --data-dir=${this.dataDirAbs}`;
  }

  /** Wire (or clear) the custom credential helper for a repo. */
  private async configureCredentialHelper(wsPath: string, credentialId: number | null): Promise<void> {
    if (credentialId) {
      await this.runGit(['config', 'credential.helper', this.credentialHelperConfig(credentialId)], wsPath);
    } else {
      await this.runGitSafe(['config', '--unset', 'credential.helper'], wsPath);
    }
  }

  /** Set or replace the `origin` remote with a CLEAN url (no embedded creds).
   *  When a credential is configured, the custom helper is wired into the
   *  repo's local config so git can authenticate on demand. */
  private async setRemoteOrigin(wsPath: string, remoteUrl: string, credentialId: number | null): Promise<void> {
    const existing = await this.runGit(['remote'], wsPath).catch(() => '');
    if (existing.split('\n').map((s) => s.trim()).includes('origin')) {
      await this.runGit(['remote', 'set-url', 'origin', remoteUrl], wsPath);
    } else {
      await this.runGit(['remote', 'add', 'origin', remoteUrl], wsPath);
    }
    await this.configureCredentialHelper(wsPath, credentialId);
  }

  /** Remove the `origin` remote (no-op if absent) and clear the credential helper. */
  private async removeRemoteOrigin(wsPath: string): Promise<void> {
    const existing = await this.runGit(['remote'], wsPath).catch(() => '');
    if (existing.split('\n').map((s) => s.trim()).includes('origin')) {
      await this.runGit(['remote', 'remove', 'origin'], wsPath);
    }
    await this.runGitSafe(['config', '--unset', 'credential.helper'], wsPath);
  }

  /** When a freshly cloned repo has no commits (e.g. newly created on GitHub),
   *  make an initial commit so the repo is immediately usable. If a remote
   *  origin exists, push to create the remote branch — avoids the agent's
   *  first `git pull` failing with "no such ref was fetched". */
  private async seedEmptyRepo(wsPath: string, ws: WorkspaceEntity, credentialId: number | null): Promise<void> {
    // Skip if the repo already has commits.
    const head = await this.runGitSafe(['rev-parse', 'HEAD'], wsPath);
    if (head.trim()) return;

    // Resolve a git identity for the commit. Prefer repo-local config, then
    // the generic identity from settings, falling back to a CodePods default.
    const cfg = this.config.getAll();
    let env: Record<string, string> = {};
    const localName = (await this.runGitSafe(['config', '--local', '--get', 'user.name'], wsPath)).trim();
    const localEmail = (await this.runGitSafe(['config', '--local', '--get', 'user.email'], wsPath)).trim();
    if (!localName || !localEmail) {
      if (cfg.useGenericGitIdentity && cfg.gitUserName && cfg.gitUserEmail) {
        env = {
          GIT_AUTHOR_NAME: cfg.gitUserName,
          GIT_AUTHOR_EMAIL: cfg.gitUserEmail,
          GIT_COMMITTER_NAME: cfg.gitUserName,
          GIT_COMMITTER_EMAIL: cfg.gitUserEmail,
        };
      } else {
        env = {
          GIT_AUTHOR_NAME: 'CodePods',
          GIT_AUTHOR_EMAIL: 'noreply@codepods.dev',
          GIT_COMMITTER_NAME: 'CodePods',
          GIT_COMMITTER_EMAIL: 'noreply@codepods.dev',
        };
      }
    }

    // Stage any files that may have been copied (e.g. AGENTS.md).
    await this.runGit(['add', '-A'], wsPath).catch(() => {});
    await this.runGit(['commit', '--allow-empty', '-m', 'Initial commit'], wsPath, env);

    // Push to create the remote branch (only for remote workspaces with origin).
    if (ws.type === 'remote' && ws.remoteUrl) {
      const branch = await this.detectBranch(wsPath);
      if (branch) {
        await this.runGit(['push', '-u', 'origin', branch], wsPath).catch(() => {
          // Ignore push errors — repo is seeded locally, user can push manually.
        });
      }
    }
  }

  /** Detect the current branch name. Uses `symbolic-ref` which works even on
   *  an unborn branch (freshly-init'd repo with no commits yet); falls back to
   *  `rev-parse --abbrev-ref` for detached-HEAD states. */
  private async detectBranch(wsPath: string): Promise<string | null> {
    try {
      const out = await this.runGit(['symbolic-ref', '--short', 'HEAD'], wsPath);
      const name = out.trim();
      if (name) return name;
    } catch {
      // detached HEAD or other — fall through
    }
    try {
      const out = await this.runGit(['rev-parse', '--abbrev-ref', 'HEAD'], wsPath);
      return out.trim() || null;
    } catch {
      return null;
    }
  }

  private runGit(args: string[], cwd?: string, extraEnv?: Record<string, string>): Promise<string> {
    return new Promise((resolve, reject) => {
      const proc = spawn('git', args, {
        cwd: cwd ?? this.workspacesDir,
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0', ...(extraEnv ?? {}) },
      });
      let stdout = '';
      let stderr = '';
      proc.stdout.on('data', (d) => (stdout += d.toString()));
      proc.stderr.on('data', (d) => (stderr += d.toString()));
      proc.on('close', (code) => {
        if (code === 0) resolve(stdout);
        else reject(new Error(stderr || `git ${args[0]} exited with code ${code}`));
      });
      proc.on('error', reject);
    });
  }

  /** Like runGit but resolves to '' on failure (for non-critical inspection commands). */
  private runGitSafe(args: string[], cwd?: string): Promise<string> {
    return this.runGit(args, cwd).catch(() => '');
  }

  private toSafe(ws: WorkspaceEntity): Workspace {
    return {
      id: ws.id,
      codepodId: ws.codepodId,
      slug: ws.slug,
      name: ws.name,
      type: ws.type,
      remoteUrl: ws.remoteUrl,
      credentialId: ws.credentialId,
      credentialLabel: null,
      path: this.getWorkspacePath(ws),
      branch: ws.branch,
      sortOrder: ws.sortOrder ?? 0,
      createdAt: ws.createdAt.toISOString(),
      updatedAt: ws.updatedAt.toISOString(),
    };
  }

  /** Batch-update manual sort order. Assigns sequential sortOrder (1-based). */
  async reorder(ids: number[], codepodId = 1): Promise<void> {
    await this.workspaces.manager.transaction(async (tx) => {
      await tx.update(WorkspaceEntity, { codepodId }, { sortOrder: 0 });
      for (let i = 0; i < ids.length; i++) {
        await tx.update(WorkspaceEntity, { id: ids[i], codepodId }, { sortOrder: i + 1 });
      }
    });
  }

  // --- File management ---

  /** List files and subdirectories at the given relative path within the workspace. */
  async listFiles(id: number, codepodId: number, relPath = ''): Promise<WorkspaceFileEntry[]> {
    const ws = await this.workspaces.findOne({ where: { id, codepodId } });
    if (!ws) throw new NotFoundException('Workspace not found');
    const wsPath = this.getWorkspacePath(ws);
    const target = this.resolveWithinWorkspace(wsPath, relPath);
    if (!fs.existsSync(target)) throw new NotFoundException('Path not found');

    const entries = await fs.promises.readdir(target, { withFileTypes: true });
    const result: WorkspaceFileEntry[] = [];
    for (const entry of entries) {
      // Skip .git directory
      if (entry.name === '.git' && entry.isDirectory()) continue;
      const entryPath = path.join(target, entry.name);
      const stat = await fs.promises.stat(entryPath);
      const rel = path.relative(wsPath, entryPath).replace(/\\/g, '/');
      result.push({
        name: entry.name,
        path: rel,
        type: entry.isDirectory() ? 'dir' : 'file',
        size: stat.size,
        modified: stat.mtime.toISOString(),
      });
    }
    result.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    return result;
  }

  /** Read a single file's content as a Buffer (for download). */
  async readFile(id: number, codepodId: number, relPath: string): Promise<{ buffer: Buffer; filename: string; size: number }> {
    const ws = await this.workspaces.findOne({ where: { id, codepodId } });
    if (!ws) throw new NotFoundException('Workspace not found');
    const wsPath = this.getWorkspacePath(ws);
    const target = this.resolveWithinWorkspace(wsPath, relPath);
    if (!fs.existsSync(target) || fs.statSync(target).isDirectory()) {
      throw new NotFoundException('File not found');
    }
    const buffer = await fs.promises.readFile(target);
    return { buffer, filename: path.basename(target), size: buffer.length };
  }

  /** Create a new directory (recursively) at the given relative path. */
  async createFolder(id: number, codepodId: number, relPath: string): Promise<WorkspaceFileEntry> {
    const ws = await this.workspaces.findOne({ where: { id, codepodId } });
    if (!ws) throw new NotFoundException('Workspace not found');
    const wsPath = this.getWorkspacePath(ws);
    const clean = this.sanitizeSubPath(relPath);
    if (!clean) throw new BadRequestException('Folder name required');
    const target = this.resolveWithinWorkspace(wsPath, clean);
    if (fs.existsSync(target)) throw new BadRequestException('A file or folder with that name already exists');
    await fs.promises.mkdir(target, { recursive: true });
    const stat = await fs.promises.stat(target);
    const rel = path.relative(wsPath, target).replace(/\\/g, '/');
    return {
      name: path.basename(target),
      path: rel,
      type: 'dir',
      size: stat.size,
      modified: stat.mtime.toISOString(),
    };
  }

  /** Delete a single file (not directories). */
  async deleteFile(id: number, codepodId: number, relPath: string): Promise<void> {
    const ws = await this.workspaces.findOne({ where: { id, codepodId } });
    if (!ws) throw new NotFoundException('Workspace not found');
    const wsPath = this.getWorkspacePath(ws);
    const target = this.resolveWithinWorkspace(wsPath, relPath);
    if (!fs.existsSync(target)) throw new NotFoundException('File not found');
    if (fs.statSync(target).isDirectory()) {
      throw new BadRequestException('Cannot delete directories');
    }
    await fs.promises.unlink(target);
  }

  /**
   * Upload files with configurable overwrite behavior.
   * - 'error': reject if any file already exists
   * - 'replace': overwrite in place
   * - 'backup': rename existing to .bak-<ts> before writing (same convention as AGENTS.md)
   */
  async uploadFilesEx(
    id: number,
    files: { originalname: string; buffer: Buffer }[],
    codepodId: number,
    subPath = '',
    overwrite: UploadOverwriteMode = 'error',
  ): Promise<UploadResult> {
    const ws = await this.workspaces.findOne({ where: { id, codepodId } });
    if (!ws) throw new NotFoundException('Workspace not found');
    if (!files || files.length === 0) throw new BadRequestException('No files provided');

    const wsPath = this.getWorkspacePath(ws);
    if (!fs.existsSync(wsPath)) throw new BadRequestException('Workspace directory does not exist yet');

    const relPath = this.sanitizeSubPath(subPath);
    const destDir = relPath ? path.join(wsPath, relPath) : wsPath;
    await fs.promises.mkdir(destDir, { recursive: true });

    const written: string[] = [];
    const overwritten: { name: string; backup: string }[] = [];
    const used = new Set<string>();

    for (const file of files) {
      const safeName = path.basename(file.originalname || '').replace(/[\\/]/g, '');
      if (!safeName || safeName === '.' || safeName === '..') {
        throw new BadRequestException(`Invalid file name: ${file.originalname}`);
      }
      const batchName = this.uniqueBatchName(safeName, used);
      const dest = path.join(destDir, batchName);
      if (!dest.startsWith(wsPath + path.sep)) {
        throw new BadRequestException(`Invalid file name: ${file.originalname}`);
      }

      if (fs.existsSync(dest)) {
        if (overwrite === 'error') {
          throw new BadRequestException(`File already exists: ${batchName}`);
        }
        if (overwrite === 'backup') {
          const backup = `${batchName}.bak-${Date.now()}`;
          fs.renameSync(dest, path.join(destDir, backup));
          overwritten.push({ name: batchName, backup });
        }
        // 'replace' = just overwrite
      }
      await fs.promises.writeFile(dest, file.buffer);
      written.push(relPath ? `${relPath.replace(/\\/g, '/')}/${batchName}` : batchName);
    }
    return { ok: true, written, overwritten };
  }

  /** Resolve a relative path within the workspace root, rejecting traversal. */
  private resolveWithinWorkspace(wsPath: string, relPath: string): string {
    const clean = this.sanitizeSubPath(relPath);
    const target = clean ? path.join(wsPath, clean) : wsPath;
    if (!target.startsWith(wsPath + path.sep) && target !== wsPath) {
      throw new BadRequestException('Invalid path');
    }
    return target;
  }

  // --- Git management ---

  /** Detailed git status for the workspace file manager. */
  async gitStatus(id: number, codepodId: number): Promise<GitStatus> {
    const wsPath = await this.resolveWorkspacePath(id, codepodId);
    const branch = (await this.runGitSafe(['symbolic-ref', '--short', 'HEAD'], wsPath)).trim() || '(detached)';

    const upstreamRaw = await this.runGitSafe(['rev-parse', '--abbrev-ref', '@{upstream}'], wsPath);
    const upstream = upstreamRaw.trim() || null;

    let ahead = 0;
    let behind = 0;
    if (upstream) {
      const counts = await this.runGitSafe(['rev-list', '--left-right', '--count', '@{upstream}...HEAD'], wsPath);
      const parts = counts.split('\n')[0].split(/\s+/).map((n) => parseInt(n, 10));
      if (!Number.isNaN(parts[0])) behind = parts[0];
      if (!Number.isNaN(parts[1])) ahead = parts[1];
    }

    const porcelain = await this.runGitSafe(['status', '--porcelain=v1'], wsPath);
    const staged: GitFileChange[] = [];
    const unstaged: GitFileChange[] = [];
    const untracked: GitFileChange[] = [];

    for (const line of porcelain.split('\n')) {
      if (!line) continue;
      const x = line[0];
      const y = line[1];
      const filePath = line.slice(3);
      if (x === '?' && y === '?') {
        untracked.push({ status: '??', path: filePath });
        continue;
      }
      // Renamed/copied: "R  old -> new"
      if (x === 'R' || x === 'C') {
        const [oldPath, newPath] = filePath.split(' -> ');
        staged.push({ status: x as GitFileChange['status'], path: newPath, oldPath: oldPath });
        if (y !== ' ' && y !== '?') unstaged.push({ status: y as GitFileChange['status'], path: newPath, oldPath: oldPath });
        continue;
      }
      if (x !== ' ' && x !== '?') staged.push({ status: x as GitFileChange['status'], path: filePath });
      if (y !== ' ' && y !== '?') unstaged.push({ status: y as GitFileChange['status'], path: filePath });
    }

    return {
      branch,
      upstream,
      ahead,
      behind,
      clean: staged.length === 0 && unstaged.length === 0 && untracked.length === 0,
      staged,
      unstaged,
      untracked,
    };
  }

  /** List local and remote branches. */
  async gitBranches(id: number, codepodId: number): Promise<GitBranchesResult> {
    const wsPath = await this.resolveWorkspacePath(id, codepodId);

    const localRaw = await this.runGitSafe(['branch', '--list', '--format=%(HEAD)%(refname:short)'], wsPath);
    const local: GitBranch[] = localRaw.split('\n').filter(Boolean).map((line) => ({
      name: line.replace(/^\*/, '').trim(),
      current: line.startsWith('*'),
      remote: false,
    }));

    const remoteRaw = await this.runGitSafe(['branch', '--list', '--remotes', '--format=%(refname:short)'], wsPath);
    const remote: GitBranch[] = remoteRaw.split('\n').filter(Boolean).map((line) => ({
      name: line.trim(),
      current: false,
      remote: true,
    }));

    return { local, remote };
  }

  /** Fetch from remote. */
  async gitFetch(id: number, codepodId: number): Promise<{ ok: true; message: string }> {
    const wsPath = await this.resolveWorkspacePath(id, codepodId);
    await this.runGit(['fetch', '--all', '--prune'], wsPath);
    return { ok: true, message: 'Fetch completed' };
  }

  /** Stash push or pop. */
  async gitStash(id: number, codepodId: number, action: 'push' | 'pop'): Promise<GitStashResult> {
    const wsPath = await this.resolveWorkspacePath(id, codepodId);
    if (action === 'push') {
      const output = await this.runGit(['stash', 'push', '-u'], wsPath);
      const listRaw = await this.runGitSafe(['stash', 'list'], wsPath);
      const stashes = listRaw.split('\n').filter(Boolean).length;
      const message = output.trim() === 'No local changes to save' ? 'No changes to stash' : 'Changes stashed';
      return { ok: true, message, stashes };
    }
    // pop
    await this.runGit(['stash', 'pop'], wsPath);
    const listRaw = await this.runGitSafe(['stash', 'list'], wsPath);
    const stashes = listRaw.split('\n').filter(Boolean).length;
    return { ok: true, message: 'Stash popped', stashes };
  }

  /** Commit all staged (or all changes if nothing staged) with a message. */
  async gitCommit(id: number, codepodId: number, message: string): Promise<GitCommitResult> {
    if (!message.trim()) throw new BadRequestException('Commit message is required');
    const wsPath = await this.resolveWorkspacePath(id, codepodId);

    // Check if anything is staged
    const stagedRaw = await this.runGitSafe(['diff', '--cached', '--name-only'], wsPath);
    if (!stagedRaw.trim()) {
      // Nothing staged — stage all tracked changes + untracked files
      await this.runGit(['add', '-A'], wsPath);
    }

    // Apply git identity if needed (same as git-proxy identity enforcement)
    const extraEnv = await this.buildGitIdentityEnv(wsPath);
    await this.runGit(['commit', '-m', message.trim()], wsPath, extraEnv);

    const log = await this.runGitSafe(['log', '-1', '--format=%H%n%h%n%s'], wsPath);
    const [hash, shortHash, commitMsg] = log.split('\n');
    return { ok: true, hash: hash ?? '', shortHash: shortHash ?? '', message: commitMsg ?? '' };
  }

  /** Sync: pull then push. */
  async gitSync(id: number, codepodId: number): Promise<GitSyncResult> {
    const wsPath = await this.resolveWorkspacePath(id, codepodId);
    const extraEnv = await this.buildGitIdentityEnv(wsPath);

    let pulled = 0;
    const upstreamRaw = await this.runGitSafe(['rev-parse', '--abbrev-ref', '@{upstream}'], wsPath);
    if (upstreamRaw.trim()) {
      try {
        const pullOut = await this.runGit(['pull'], wsPath, extraEnv);
        // Count files changed in pull (merge or fast-forward)
        const diffCount = await this.runGitSafe(['rev-list', '--count', 'HEAD..@{upstream}'], wsPath);
        // Actually after pull HEAD is up to date, so count from reflog
        pulled = pullOut.includes('up to date') ? 0 : 1;
      } catch {
        // Pull might fail if no upstream; continue to push
      }
    }

    let pushed = 0;
    try {
      const pushOut = await this.runGit(['push'], wsPath, extraEnv);
      pushed = pushOut.includes('Everything up-to-date') ? 0 : 1;
    } catch {
      // No upstream or nothing to push
    }

    return { ok: true, pulled, pushed, message: `Synced (pulled: ${pulled}, pushed: ${pushed})` };
  }

  /** Resolve workspace path and verify .git exists. */
  private async resolveWorkspacePath(id: number, codepodId: number): Promise<string> {
    const ws = await this.workspaces.findOne({ where: { id, codepodId } });
    if (!ws) throw new NotFoundException('Workspace not found');
    const wsPath = this.getWorkspacePath(ws);
    if (!fs.existsSync(wsPath)) throw new BadRequestException('Workspace directory does not exist');
    if (!fs.existsSync(path.join(wsPath, '.git'))) {
      throw new BadRequestException('Workspace is not a git repository');
    }
    return wsPath;
  }

  /** Build git identity env for commit operations. Prefers repo-local config, then generic identity. */
  private async buildGitIdentityEnv(wsPath: string): Promise<Record<string, string>> {
    const env: Record<string, string> = {};
    const localName = await this.runGitSafe(['config', '--local', 'user.name'], wsPath);
    const localEmail = await this.runGitSafe(['config', '--local', 'user.email'], wsPath);
    if (localName.trim() && localEmail.trim()) return env;

    // Try generic identity from settings
    try {
      const genericName = await this.runGitSafe(['config', '--global', 'user.name'], wsPath);
      const genericEmail = await this.runGitSafe(['config', '--global', 'user.email'], wsPath);
      if (genericName.trim() && genericEmail.trim()) return env;
    } catch {
      // ignore
    }

    // Fall back to a default identity
    env.GIT_AUTHOR_NAME = 'CodePods';
    env.GIT_AUTHOR_EMAIL = 'codepods@localhost';
    env.GIT_COMMITTER_NAME = 'CodePods';
    env.GIT_COMMITTER_EMAIL = 'codepods@localhost';
    return env;
  }
}