import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { WorkspacesService } from './workspaces.service';
import { WorkspaceEntity } from './workspace.entity';
import { CredentialsService } from '../credentials/credentials.service';
import { GitProvidersService } from '../git-providers/git-providers.service';
import { ConfigService } from '../config/config.service';
import { AgentsMdService } from '../agents-md/agents-md.service';

describe('WorkspacesService copyAgentsMd', () => {
  let service: WorkspacesService;
  const workspaces = { findOne: jest.fn() };
  const credentials = { findAll: jest.fn(), getSecret: jest.fn(), create: jest.fn() };
  const agentsMd = { getDefault: jest.fn(), findOne: jest.fn() };
  const config = { get: jest.fn() };
  let dataDir: string;

  beforeEach(async () => {
    jest.resetAllMocks();
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codepods-ws-spec-'));
    config.get.mockImplementation((key: string) => {
      if (key === 'dataDir') return dataDir;
      return undefined;
    });

    const module = await Test.createTestingModule({
      providers: [
        WorkspacesService,
        { provide: getRepositoryToken(WorkspaceEntity), useValue: workspaces },
        { provide: CredentialsService, useValue: credentials },
        { provide: GitProvidersService, useValue: {} },
        { provide: ConfigService, useValue: config },
        { provide: AgentsMdService, useValue: agentsMd },
      ],
    }).compile();
    service = module.get(WorkspacesService);
  });

  afterEach(() => {
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  it('writes AGENTS.md when none exists (no backup)', async () => {
    workspaces.findOne.mockResolvedValue({ id: 1, slug: 'ws-a', codepodId: 1 });
    agentsMd.getDefault.mockResolvedValue({ content: 'hello' });
    const wsPath = path.join(dataDir, 'workspaces', 'ws-a');
    fs.mkdirSync(wsPath, { recursive: true });

    const result = await service.copyAgentsMd(1, null, 1);

    expect(result.renamed).toBe(false);
    expect(fs.readFileSync(path.join(wsPath, 'AGENTS.md'), 'utf8')).toBe('hello');
  });

  it('renames an existing AGENTS.md to a backup and writes the new one', async () => {
    workspaces.findOne.mockResolvedValue({ id: 1, slug: 'ws-a', codepodId: 1 });
    agentsMd.getDefault.mockResolvedValue({ content: 'new content' });
    const wsPath = path.join(dataDir, 'workspaces', 'ws-a');
    fs.mkdirSync(wsPath, { recursive: true });
    fs.writeFileSync(path.join(wsPath, 'AGENTS.md'), 'old content', 'utf8');

    const result = await service.copyAgentsMd(1, null, 1);

    expect(result.renamed).toBe(true);
    expect(result.backupName).toMatch(/^AGENTS\.md\.bak-\d+$/);
    // Original content preserved in the backup
    expect(fs.readFileSync(path.join(wsPath, result.backupName!), 'utf8')).toBe('old content');
    // New content written to AGENTS.md
    expect(fs.readFileSync(path.join(wsPath, 'AGENTS.md'), 'utf8')).toBe('new content');
  });

  it('returns renamed:false when no AGENTS.md version is configured', async () => {
    workspaces.findOne.mockResolvedValue({ id: 1, slug: 'ws-a', codepodId: 1 });
    agentsMd.getDefault.mockResolvedValue(null);
    const wsPath = path.join(dataDir, 'workspaces', 'ws-a');
    fs.mkdirSync(wsPath, { recursive: true });

    const result = await service.copyAgentsMd(1, null, 1);

    expect(result.renamed).toBe(false);
    expect(fs.existsSync(path.join(wsPath, 'AGENTS.md'))).toBe(false);
  });
});

describe('WorkspacesService uploadFiles', () => {
  let service: WorkspacesService;
  const workspaces = { findOne: jest.fn() };
  const credentials = { findAll: jest.fn(), getSecret: jest.fn(), create: jest.fn() };
  const agentsMd = {};
  const config = { get: jest.fn() };
  let dataDir: string;

  beforeEach(async () => {
    jest.resetAllMocks();
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codepods-upload-spec-'));
    config.get.mockImplementation((key: string) => {
      if (key === 'dataDir') return dataDir;
      return undefined;
    });

    const module = await Test.createTestingModule({
      providers: [
        WorkspacesService,
        { provide: getRepositoryToken(WorkspaceEntity), useValue: workspaces },
        { provide: CredentialsService, useValue: credentials },
        { provide: GitProvidersService, useValue: {} },
        { provide: ConfigService, useValue: config },
        { provide: AgentsMdService, useValue: agentsMd },
      ],
    }).compile();
    service = module.get(WorkspacesService);
  });

  afterEach(() => {
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  it('writes uploaded files into the workspace directory', async () => {
    const wsPath = path.join(dataDir, 'workspaces', 'ws-a');
    fs.mkdirSync(wsPath, { recursive: true });
    workspaces.findOne.mockResolvedValue({ id: 1, slug: 'ws-a', codepodId: 1 });

    const result = await service.uploadFiles(1, [
      { originalname: 'hello.txt', buffer: Buffer.from('hi') },
    ], 1);

    expect(result.written).toEqual(['hello.txt']);
    expect(fs.readFileSync(path.join(wsPath, 'hello.txt'), 'utf8')).toBe('hi');
  });

  it('sanitizes path traversal in file names', async () => {
    const wsPath = path.join(dataDir, 'workspaces', 'ws-a');
    fs.mkdirSync(wsPath, { recursive: true });
    workspaces.findOne.mockResolvedValue({ id: 1, slug: 'ws-a', codepodId: 1 });

    const result = await service.uploadFiles(1, [
      { originalname: '../../evil.txt', buffer: Buffer.from('x') },
    ], 1);

    expect(result.written).toEqual(['evil.txt']);
    expect(fs.existsSync(path.join(wsPath, 'evil.txt'))).toBe(true);
    expect(fs.existsSync(path.join(dataDir, 'evil.txt'))).toBe(false);
  });

  it('throws when the workspace directory does not exist', async () => {
    workspaces.findOne.mockResolvedValue({ id: 1, slug: 'ws-a', codepodId: 1 });
    await expect(service.uploadFiles(1, [{ originalname: 'a.txt', buffer: Buffer.from('x') }], 1))
      .rejects.toThrow('Workspace directory does not exist yet');
  });

  it('writes into a subPath and creates the folder', async () => {
    const wsPath = path.join(dataDir, 'workspaces', 'ws-a');
    fs.mkdirSync(wsPath, { recursive: true });
    workspaces.findOne.mockResolvedValue({ id: 1, slug: 'ws-a', codepodId: 1 });

    const result = await service.uploadFiles(
      1,
      [{ originalname: 'shot.png', buffer: Buffer.from('img') }],
      1,
      '/imagenes',
    );

    expect(result.written).toEqual(['imagenes/shot.png']);
    expect(fs.readFileSync(path.join(wsPath, 'imagenes', 'shot.png'), 'utf8')).toBe('img');
  });

  it('rejects traversal in subPath', async () => {
    const wsPath = path.join(dataDir, 'workspaces', 'ws-a');
    fs.mkdirSync(wsPath, { recursive: true });
    workspaces.findOne.mockResolvedValue({ id: 1, slug: 'ws-a', codepodId: 1 });

    await expect(
      service.uploadFiles(1, [{ originalname: 'a.txt', buffer: Buffer.from('x') }], 1, '../../etc'),
    ).rejects.toThrow('Invalid upload path');
    expect(fs.existsSync(path.join(dataDir, 'etc'))).toBe(false);
  });

  it('deduplicates repeated file names within one batch (e.g. pasted screenshots)', async () => {
    const wsPath = path.join(dataDir, 'workspaces', 'ws-a');
    fs.mkdirSync(wsPath, { recursive: true });
    workspaces.findOne.mockResolvedValue({ id: 1, slug: 'ws-a', codepodId: 1 });

    const result = await service.uploadFiles(1, [
      { originalname: 'image.png', buffer: Buffer.from('a') },
      { originalname: 'image.png', buffer: Buffer.from('b') },
      { originalname: 'image.png', buffer: Buffer.from('c') },
    ], 1);

    expect(result.written).toEqual(['image.png', 'image-1.png', 'image-2.png']);
    expect(fs.readFileSync(path.join(wsPath, 'image.png'), 'utf8')).toBe('a');
    expect(fs.readFileSync(path.join(wsPath, 'image-1.png'), 'utf8')).toBe('b');
    expect(fs.readFileSync(path.join(wsPath, 'image-2.png'), 'utf8')).toBe('c');
  });

  it('backs up an existing file on disk before overwriting it', async () => {
    const wsPath = path.join(dataDir, 'workspaces', 'ws-a');
    fs.mkdirSync(wsPath, { recursive: true });
    fs.writeFileSync(path.join(wsPath, 'shot.png'), 'old');
    workspaces.findOne.mockResolvedValue({ id: 1, slug: 'ws-a', codepodId: 1 });

    const result = await service.uploadFiles(1, [
      { originalname: 'shot.png', buffer: Buffer.from('new') },
    ], 1);

    expect(result.written).toEqual(['shot.png']);
    expect(result.overwritten).toHaveLength(1);
    expect(result.overwritten[0].name).toBe('shot.png');
    expect(result.overwritten[0].backup).toMatch(/^shot\.png\.bak-\d+$/);
    // New content is written to shot.png; the old content lives in the backup.
    expect(fs.readFileSync(path.join(wsPath, 'shot.png'), 'utf8')).toBe('new');
    expect(fs.readFileSync(path.join(wsPath, result.overwritten[0].backup), 'utf8')).toBe('old');
  });
});

// ---------------------------------------------------------------------------
// File management: listFiles, readFile, deleteFile, uploadFilesEx
// ---------------------------------------------------------------------------
describe('WorkspacesService file management', () => {
  let service: WorkspacesService;
  const workspaces = { findOne: jest.fn() };
  const credentials = { findAll: jest.fn(), getSecret: jest.fn(), create: jest.fn() };
  const agentsMd = {};
  const config = { get: jest.fn() };
  let dataDir: string;

  beforeEach(async () => {
    jest.resetAllMocks();
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codepods-fm-spec-'));
    config.get.mockImplementation((key: string) => {
      if (key === 'dataDir') return dataDir;
      return undefined;
    });

    const module = await Test.createTestingModule({
      providers: [
        WorkspacesService,
        { provide: getRepositoryToken(WorkspaceEntity), useValue: workspaces },
        { provide: CredentialsService, useValue: credentials },
        { provide: GitProvidersService, useValue: {} },
        { provide: ConfigService, useValue: config },
        { provide: AgentsMdService, useValue: agentsMd },
      ],
    }).compile();
    service = module.get(WorkspacesService);
  });

  afterEach(() => {
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  function mockWs(slug = 'ws-fm') {
    workspaces.findOne.mockResolvedValue({ id: 1, slug, codepodId: 1 });
    const wsPath = path.join(dataDir, 'workspaces', slug);
    fs.mkdirSync(wsPath, { recursive: true });
    return wsPath;
  }

  describe('listFiles', () => {
    it('lists files and directories sorted (dirs first)', async () => {
      const wsPath = mockWs();
      fs.mkdirSync(path.join(wsPath, 'subdir'), { recursive: true });
      fs.writeFileSync(path.join(wsPath, 'a.txt'), 'hello');
      fs.writeFileSync(path.join(wsPath, 'b.txt'), 'world');

      const result = await service.listFiles(1, 1, '');

      expect(result).toHaveLength(3);
      // Directories should come first
      expect(result[0].name).toBe('subdir');
      expect(result[0].type).toBe('dir');
      expect(result[1].name).toBe('a.txt');
      expect(result[2].name).toBe('b.txt');
      expect(result[1].size).toBe(5);
      expect(result[1].modified).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('skips the .git directory', async () => {
      const wsPath = mockWs();
      fs.mkdirSync(path.join(wsPath, '.git'), { recursive: true });
      fs.writeFileSync(path.join(wsPath, '.git/config'), 'x');
      fs.writeFileSync(path.join(wsPath, 'file.txt'), 'y');

      const result = await service.listFiles(1, 1, '');

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('file.txt');
    });

    it('lists files in a subdirectory', async () => {
      const wsPath = mockWs();
      fs.mkdirSync(path.join(wsPath, 'src'), { recursive: true });
      fs.writeFileSync(path.join(wsPath, 'src', 'index.ts'), 'code');

      const result = await service.listFiles(1, 1, 'src');

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('index.ts');
      expect(result[0].path).toBe('src/index.ts');
    });

    it('throws NotFound for non-existent path', async () => {
      mockWs();
      await expect(service.listFiles(1, 1, 'nonexistent')).rejects.toThrow('Path not found');
    });
  });

  describe('readFile', () => {
    it('reads file content as buffer', async () => {
      const wsPath = mockWs();
      fs.writeFileSync(path.join(wsPath, 'doc.txt'), 'hello world');

      const result = await service.readFile(1, 1, 'doc.txt');

      expect(result.buffer.toString()).toBe('hello world');
      expect(result.filename).toBe('doc.txt');
      expect(result.size).toBe(11);
    });

    it('throws NotFound for missing file', async () => {
      mockWs();
      await expect(service.readFile(1, 1, 'missing.txt')).rejects.toThrow('File not found');
    });

    it('throws NotFound for directory', async () => {
      const wsPath = mockWs();
      fs.mkdirSync(path.join(wsPath, 'folder'), { recursive: true });

      await expect(service.readFile(1, 1, 'folder')).rejects.toThrow('File not found');
    });
  });

  describe('deleteFile', () => {
    it('deletes a file', async () => {
      const wsPath = mockWs();
      const filePath = path.join(wsPath, 'trash.txt');
      fs.writeFileSync(filePath, 'bye');

      await service.deleteFile(1, 1, 'trash.txt');

      expect(fs.existsSync(filePath)).toBe(false);
    });

    it('throws NotFound for missing file', async () => {
      mockWs();
      await expect(service.deleteFile(1, 1, 'ghost.txt')).rejects.toThrow('File not found');
    });

    it('rejects deletion of directories', async () => {
      const wsPath = mockWs();
      fs.mkdirSync(path.join(wsPath, 'keep'), { recursive: true });

      await expect(service.deleteFile(1, 1, 'keep')).rejects.toThrow('Cannot delete directories');
    });
  });

  describe('createFolder', () => {
    it('creates a new directory at the root', async () => {
      const wsPath = mockWs();

      const result = await service.createFolder(1, 1, 'newdir');

      expect(result.name).toBe('newdir');
      expect(result.path).toBe('newdir');
      expect(result.type).toBe('dir');
      expect(fs.existsSync(path.join(wsPath, 'newdir'))).toBe(true);
    });

    it('creates nested directories under a subpath', async () => {
      const wsPath = mockWs();
      fs.mkdirSync(path.join(wsPath, 'src'), { recursive: true });

      const result = await service.createFolder(1, 1, 'src/components');

      expect(result.path).toBe('src/components');
      expect(fs.statSync(path.join(wsPath, 'src', 'components')).isDirectory()).toBe(true);
    });

    it('rejects an empty folder name', async () => {
      mockWs();
      await expect(service.createFolder(1, 1, '')).rejects.toThrow('Folder name required');
    });

    it('rejects when the target already exists', async () => {
      const wsPath = mockWs();
      fs.mkdirSync(path.join(wsPath, 'dup'), { recursive: true });

      await expect(service.createFolder(1, 1, 'dup')).rejects.toThrow('already exists');
    });

    it('rejects path traversal', async () => {
      mockWs();
      await expect(service.createFolder(1, 1, '../escape')).rejects.toThrow('Invalid upload path');
    });
  });

  describe('uploadFilesEx', () => {
    it('writes files in error mode when no conflict', async () => {
      mockWs();
      const result = await service.uploadFilesEx(1, [
        { originalname: 'new.txt', buffer: Buffer.from('data') },
      ], 1);

      expect(result.written).toEqual(['new.txt']);
      expect(result.overwritten).toHaveLength(0);
    });

    it('rejects existing file in error mode', async () => {
      const wsPath = mockWs();
      fs.writeFileSync(path.join(wsPath, 'exists.txt'), 'old');

      await expect(service.uploadFilesEx(1, [
        { originalname: 'exists.txt', buffer: Buffer.from('new') },
      ], 1, '', 'error')).rejects.toThrow('File already exists');
    });

    it('overwrites in replace mode', async () => {
      const wsPath = mockWs();
      fs.writeFileSync(path.join(wsPath, 'file.txt'), 'old');

      const result = await service.uploadFilesEx(1, [
        { originalname: 'file.txt', buffer: Buffer.from('new') },
      ], 1, '', 'replace');

      expect(result.written).toEqual(['file.txt']);
      expect(result.overwritten).toHaveLength(0);
      expect(fs.readFileSync(path.join(wsPath, 'file.txt'), 'utf8')).toBe('new');
    });

    it('creates backup in backup mode', async () => {
      const wsPath = mockWs();
      fs.writeFileSync(path.join(wsPath, 'file.txt'), 'old');

      const result = await service.uploadFilesEx(1, [
        { originalname: 'file.txt', buffer: Buffer.from('new') },
      ], 1, '', 'backup');

      expect(result.written).toEqual(['file.txt']);
      expect(result.overwritten).toHaveLength(1);
      expect(result.overwritten[0].name).toBe('file.txt');
      expect(result.overwritten[0].backup).toMatch(/^file\.txt\.bak-\d+$/);
      expect(fs.readFileSync(path.join(wsPath, 'file.txt'), 'utf8')).toBe('new');
      expect(fs.readFileSync(path.join(wsPath, result.overwritten[0].backup), 'utf8')).toBe('old');
    });

    it('writes into a subPath', async () => {
      mockWs();
      const result = await service.uploadFilesEx(1, [
        { originalname: 'data.json', buffer: Buffer.from('{}') },
      ], 1, 'config');

      expect(result.written).toEqual(['config/data.json']);
    });

    it('rejects empty files array', async () => {
      mockWs();
      await expect(service.uploadFilesEx(1, [], 1)).rejects.toThrow('No files provided');
    });

    it('deduplicates batch file names', async () => {
      mockWs();
      const result = await service.uploadFilesEx(1, [
        { originalname: 'img.png', buffer: Buffer.from('a') },
        { originalname: 'img.png', buffer: Buffer.from('b') },
      ], 1);

      expect(result.written).toEqual(['img.png', 'img-1.png']);
    });
  });
});

// ---------------------------------------------------------------------------
// Git management: gitStatus, gitBranches, gitFetch, gitStash, gitCommit, gitSync
// Uses mocked spawn to simulate git responses (no real git binary needed).
// ---------------------------------------------------------------------------
import { EventEmitter } from 'events';

// Mock child_process.spawn — this module-level mock applies to the git section.
// The file-management tests above don't use spawn so they are unaffected.
jest.mock('child_process', () => {
  const actual = jest.requireActual('child_process');
  return { ...actual, spawn: jest.fn(), execFileSync: jest.fn() };
});
const { spawn: mockedSpawnMod } = require('child_process') as { spawn: jest.Mock };

/** Create a fake child process that emits stdout and closes with exitCode. */
function fakeProc(stdout: string, exitCode = 0, stderr = ''): any {
  const proc = new EventEmitter() as any;
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  setImmediate(() => {
    if (stderr) proc.stderr.emit('data', Buffer.from(stderr));
    proc.stdout.emit('data', Buffer.from(stdout));
    proc.emit('close', exitCode);
  });
  return proc;
}

/**
 * Configures mock responses keyed by the first git arg (the subcommand).
 * Each handler receives the full args array and returns { stdout, exitCode, stderr }.
 */
function mockGitResponses(handlers: Record<string, (args: string[]) => { stdout: string; exitCode?: number; stderr?: string }>): void {
  mockedSpawnMod.mockImplementation((_cmd: string, args: string[]) => {
    const sub = args[0];
    const handler = handlers[sub];
    if (handler) {
      const { stdout, exitCode, stderr } = handler(args);
      return fakeProc(stdout, exitCode ?? 0, stderr);
    }
    // Default: empty success
    return fakeProc('', 0);
  });
}

describe('WorkspacesService git management', () => {
  let service: WorkspacesService;
  const workspaces = { findOne: jest.fn() };
  const credentials = { findAll: jest.fn(), getSecret: jest.fn(), create: jest.fn() };
  const agentsMd = {};
  const config = { get: jest.fn() };
  let dataDir: string;

  beforeEach(async () => {
    jest.resetAllMocks();
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codepods-git-spec-'));
    config.get.mockImplementation((key: string) => {
      if (key === 'dataDir') return dataDir;
      if (key === 'gitUserName') return '';
      if (key === 'gitUserEmail') return '';
      if (key === 'useGenericGitIdentity') return false;
      return undefined;
    });

    const module = await Test.createTestingModule({
      providers: [
        WorkspacesService,
        { provide: getRepositoryToken(WorkspaceEntity), useValue: workspaces },
        { provide: CredentialsService, useValue: credentials },
        { provide: GitProvidersService, useValue: {} },
        { provide: ConfigService, useValue: config },
        { provide: AgentsMdService, useValue: agentsMd },
      ],
    }).compile();
    service = module.get(WorkspacesService);
  });

  afterEach(() => {
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  /** Create a workspace dir with an empty .git/ so resolveWorkspacePath passes. */
  function mockGitWs(slug = 'ws-git'): string {
    const wsPath = path.join(dataDir, 'workspaces', slug);
    fs.mkdirSync(wsPath, { recursive: true });
    fs.mkdirSync(path.join(wsPath, '.git'), { recursive: true });
    workspaces.findOne.mockResolvedValue({ id: 1, slug, codepodId: 1 });
    return wsPath;
  }

  describe('gitStatus', () => {
    it('returns clean status on a fresh repo', async () => {
      mockGitWs();
      mockGitResponses({
        'symbolic-ref': () => ({ stdout: 'main\n' }),
        'rev-parse': () => ({ stdout: '' }), // no upstream
        'status': () => ({ stdout: '' }), // clean porcelain
      });

      const status = await service.gitStatus(1, 1);

      expect(status.branch).toBe('main');
      expect(status.clean).toBe(true);
      expect(status.staged).toHaveLength(0);
      expect(status.unstaged).toHaveLength(0);
      expect(status.untracked).toHaveLength(0);
      expect(status.upstream).toBeNull();
      expect(status.ahead).toBe(0);
      expect(status.behind).toBe(0);
    });

    it('detects untracked files', async () => {
      mockGitWs();
      mockGitResponses({
        'symbolic-ref': () => ({ stdout: 'main\n' }),
        'rev-parse': () => ({ stdout: '' }),
        'status': () => ({ stdout: '?? new.txt\n' }),
      });

      const status = await service.gitStatus(1, 1);

      expect(status.clean).toBe(false);
      expect(status.untracked).toHaveLength(1);
      expect(status.untracked[0].path).toBe('new.txt');
      expect(status.untracked[0].status).toBe('??');
    });

    it('detects staged and unstaged changes', async () => {
      mockGitWs();
      mockGitResponses({
        'symbolic-ref': () => ({ stdout: 'main\n' }),
        'rev-parse': () => ({ stdout: '' }),
        'status': () => ({ stdout: 'M  README.md\n M README.md\n' }),
      });

      const status = await service.gitStatus(1, 1);

      expect(status.clean).toBe(false);
      expect(status.staged).toHaveLength(1);
      expect(status.staged[0].path).toBe('README.md');
      expect(status.unstaged).toHaveLength(1);
      expect(status.unstaged[0].path).toBe('README.md');
    });

    it('throws when workspace is not a git repo', async () => {
      const wsPath = path.join(dataDir, 'workspaces', 'no-git');
      fs.mkdirSync(wsPath, { recursive: true }); // no .git dir
      workspaces.findOne.mockResolvedValue({ id: 1, slug: 'no-git', codepodId: 1 });

      await expect(service.gitStatus(1, 1)).rejects.toThrow('not a git repository');
    });
  });

  describe('gitBranches', () => {
    it('lists local and remote branches', async () => {
      mockGitWs();
      mockGitResponses({
        'branch': (args: string[]) => {
          if (args.includes('--remotes')) {
            return { stdout: 'origin/main\norigin/dev\n' };
          }
          return { stdout: '* main\n  feature/test\n' };
        },
      });

      const result = await service.gitBranches(1, 1);

      expect(result.local).toHaveLength(2);
      const main = result.local.find((b) => b.name === 'main');
      const feature = result.local.find((b) => b.name === 'feature/test');
      expect(main).toBeDefined();
      expect(main!.current).toBe(true);
      expect(feature).toBeDefined();
      expect(feature!.current).toBe(false);
      expect(result.remote).toHaveLength(2);
      expect(result.remote[0].name).toBe('origin/main');
      expect(result.remote[0].remote).toBe(true);
    });
  });

  describe('gitStash', () => {
    it('stashes uncommitted changes', async () => {
      mockGitWs();
      let stashList = '';
      mockGitResponses({
        'stash': (args: string[]) => {
          if (args[1] === 'push') {
            stashList = 'stash@{0}: WIP on main: abc123\n';
            return { stdout: 'Saved working directory and index state WIP on main\n' };
          }
          if (args[1] === 'list') return { stdout: stashList };
          return { stdout: '' };
        },
      });

      const result = await service.gitStash(1, 1, 'push');

      expect(result.ok).toBe(true);
      expect(result.stashes).toBe(1);
      expect(result.message).toBe('Changes stashed');
    });

    it('pops stashed changes', async () => {
      mockGitWs();
      let stashList = 'stash@{0}: WIP on main: abc123\n';
      mockGitResponses({
        'stash': (args: string[]) => {
          if (args[1] === 'pop') {
            stashList = '';
            return { stdout: 'On branch main\nChanges not staged for commit:\n' };
          }
          if (args[1] === 'list') return { stdout: stashList };
          return { stdout: '' };
        },
      });

      const result = await service.gitStash(1, 1, 'pop');

      expect(result.ok).toBe(true);
      expect(result.stashes).toBe(0);
      expect(result.message).toBe('Stash popped');
    });

    it('reports no changes to stash when clean', async () => {
      mockGitWs();
      mockGitResponses({
        'stash': (args: string[]) => {
          if (args[1] === 'push') return { stdout: 'No local changes to save\n' };
          if (args[1] === 'list') return { stdout: '' };
          return { stdout: '' };
        },
      });

      const result = await service.gitStash(1, 1, 'push');
      expect(result.ok).toBe(true);
      expect(result.message).toBe('No changes to stash');
      expect(result.stashes).toBe(0);
    });
  });

  describe('gitCommit', () => {
    it('commits staged changes', async () => {
      mockGitWs();
      mockGitResponses({
        'diff': () => ({ stdout: 'new.txt\n' }), // something staged
        'config': () => ({ stdout: 'Test User\ntest@test.com\n' }), // local identity exists
        'commit': () => ({ stdout: '[main abc1234] Add new file\n' }),
        'log': () => ({ stdout: 'abcdef1234567890\nabc1234\nAdd new file\n' }),
      });

      const result = await service.gitCommit(1, 1, 'Add new file');

      expect(result.ok).toBe(true);
      expect(result.message).toBe('Add new file');
      expect(result.hash).toBe('abcdef1234567890');
      expect(result.shortHash).toBe('abc1234');
    });

    it('auto-stages all changes when nothing is staged', async () => {
      mockGitWs();
      const addCalls: string[][] = [];
      mockGitResponses({
        'diff': () => ({ stdout: '' }), // nothing staged
        'add': (args: string[]) => { addCalls.push(args); return { stdout: '' }; },
        'config': () => ({ stdout: 'Test User\ntest@test.com\n' }),
        'commit': () => ({ stdout: '[main def5678] Auto-stage commit\n' }),
        'log': () => ({ stdout: 'defghij123456\ndef5678\nAuto-stage commit\n' }),
      });

      const result = await service.gitCommit(1, 1, 'Auto-stage commit');

      expect(result.ok).toBe(true);
      expect(result.message).toBe('Auto-stage commit');
      // Should have called git add -A
      expect(addCalls.length).toBeGreaterThan(0);
      expect(addCalls[0]).toContain('-A');
    });

    it('rejects empty commit message', async () => {
      mockGitWs();
      await expect(service.gitCommit(1, 1, '  ')).rejects.toThrow('Commit message is required');
    });
  });

  describe('gitFetch', () => {
    it('completes fetch successfully', async () => {
      mockGitWs();
      mockGitResponses({
        'fetch': () => ({ stdout: 'Fetching origin\n' }),
      });

      const result = await service.gitFetch(1, 1);
      expect(result.ok).toBe(true);
      expect(result.message).toContain('Fetch');
    });
  });

  describe('gitSync', () => {
    it('reports synced result when no upstream', async () => {
      mockGitWs();
      mockGitResponses({
        'rev-parse': () => ({ stdout: '' }), // no upstream
        'config': () => ({ stdout: '' }),
        'push': () => ({ stdout: 'Everything up-to-date\n' }),
      });

      const result = await service.gitSync(1, 1);
      expect(result.ok).toBe(true);
      expect(result.pulled).toBe(0);
      expect(result.pushed).toBe(0);
    });
  });
});
