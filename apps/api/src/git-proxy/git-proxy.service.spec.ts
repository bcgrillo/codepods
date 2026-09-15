import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { EventEmitter } from 'events';
import { spawn, spawnSync } from 'child_process';
import { GitProxyService } from './git-proxy.service';
import { AgentsService } from '../agents/agents.service';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { ConfigService } from '../config/config.service';
import { DEFAULT_GIT_WHITELIST } from '../config/config.util';

jest.mock('child_process', () => ({ spawn: jest.fn(), spawnSync: jest.fn(), execFile: jest.fn() }));
const mockedSpawn = spawn as jest.Mock;
const mockedSpawnSync = spawnSync as jest.Mock;

function fakeProc(stdout: string, exitCode = 0) {
  const proc = new EventEmitter() as any;
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.on = proc.on.bind(proc);
  proc.stdout.on = proc.stdout.on.bind(proc.stdout);
  proc.stderr.on = proc.stderr.on.bind(proc.stderr);
  setImmediate(() => {
    proc.stdout.emit('data', Buffer.from(stdout));
    proc.emit('close', exitCode);
  });
  return proc;
}

describe('GitProxyService', () => {
  let service: GitProxyService;
  const agentsService = { resolveByName: jest.fn(), resolveById: jest.fn() };
  const workspacesService = { findOne: jest.fn() };
  const configService = { getAll: jest.fn() };

  beforeEach(async () => {
    jest.resetAllMocks();
    configService.getAll.mockReturnValue({
      gitSecurity: {
      reuseMainRepoCredentials: false,
      commandWhitelist: DEFAULT_GIT_WHITELIST,
      blockGlobalConfig: true,
      blockForcePush: false,
      protectedBranches: ['main', 'dev'],
      blockRemoteManagement: true,
    },
    });
    const module = await Test.createTestingModule({
      providers: [
        GitProxyService,
        { provide: AgentsService, useValue: agentsService },
        { provide: WorkspacesService, useValue: workspacesService },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();
    service = module.get(GitProxyService);
  });

  it('rejects a git command outside the whitelist', async () => {
    await expect(service.execute({ agentName: 'codepods', args: ['rm -rf /'] }))
      .rejects.toThrow(BadRequestException);
  });

  it('blocks the credential command', async () => {
    await expect(service.execute({ agentName: 'codepods', args: ['credential', 'fill'] }))
      .rejects.toThrow(BadRequestException);
  });

  it('blocks global git config changes', async () => {
    await expect(service.execute({ agentName: 'codepods', args: ['config', '--global', 'user.name', 'x'] }))
      .rejects.toThrow(BadRequestException);
  });

  it('rejects when no args are provided', async () => {
    await expect(service.execute({ agentName: 'codepods', args: [] }))
      .rejects.toThrow(BadRequestException);
  });

  it('rejects an unknown agent', async () => {
    agentsService.resolveById.mockResolvedValue(null);
    await expect(service.execute({ agentId: 'nope', args: ['status'] }))
      .rejects.toThrow(BadRequestException);
  });

  it('rejects an agent without a workspace', async () => {
    agentsService.resolveById.mockResolvedValue({ workspaceId: null });
    await expect(service.execute({ agentId: 'abc123', args: ['status'] }))
      .rejects.toThrow(BadRequestException);
  });

  it('falls back to resolving by name for legacy shims', async () => {
    agentsService.resolveByName.mockResolvedValue({
      workspaceId: 'ws-1',
      codepodId: 1,
      mountPath: '/workspace',
    });
    workspacesService.findOne.mockResolvedValue({ path: '/home/ubuntu/ws' });
    mockedSpawn.mockReturnValue(fakeProc(''));
    await service.execute({ agentName: 'legacy-agent', args: ['status'], cwd: '/workspace' });
    expect(agentsService.resolveByName).toHaveBeenCalledWith('legacy-agent');
    expect(agentsService.resolveById).not.toHaveBeenCalled();
  });

  describe('execute rev-parse --show-toplevel', () => {
    beforeEach(() => {
      agentsService.resolveById.mockResolvedValue({
        workspaceId: 'ws-1',
        codepodId: 1,
        mountPath: '/workspace',
      });
      workspacesService.findOne.mockResolvedValue({
        path: '/home/ubuntu/.codepods/data/workspaces/codepods',
      });
    });

    it('maps the host toplevel path back to the container path', async () => {
      mockedSpawn.mockReturnValue(fakeProc('/home/ubuntu/.codepods/data/workspaces/codepods\n'));
      const result = await service.execute({
        agentId: 'abc123',
        args: ['rev-parse', '--show-toplevel'],
        cwd: '/workspace',
      });
      expect(result.stdout).toBe('/workspace\n');
      expect(mockedSpawn).toHaveBeenCalledWith(
        'git',
        ['rev-parse', '--show-toplevel'],
        expect.objectContaining({ cwd: '/home/ubuntu/.codepods/data/workspaces/codepods' }),
      );
    });

    it('maps a nested toplevel path back to the container path', async () => {
      mockedSpawn.mockReturnValue(fakeProc('/home/ubuntu/.codepods/data/workspaces/codepods/apps/api\n'));
      const result = await service.execute({
        agentId: 'abc123',
        args: ['rev-parse', '--show-toplevel'],
        cwd: '/workspace/apps/api',
      });
      expect(result.stdout).toBe('/workspace/apps/api\n');
    });

    it('leaves non-workspace paths unchanged', async () => {
      mockedSpawn.mockReturnValue(fakeProc('/some/other/path\n'));
      const result = await service.execute({
        agentId: 'abc123',
        args: ['rev-parse', '--show-toplevel'],
        cwd: '/workspace',
      });
      expect(result.stdout).toBe('/some/other/path\n');
    });
  });

  function mockWorkspaceAgent() {
    agentsService.resolveById.mockResolvedValue({
      workspaceId: 'ws-1',
      codepodId: 1,
      mountPath: '/workspace',
    });
    workspacesService.findOne.mockResolvedValue({
      path: '/home/ubuntu/.codepods/data/workspaces/codepods',
    });
  }

  describe('whitelist and option parsing', () => {
    it('allows symbolic-ref so prompts can resolve the branch name', async () => {
      mockWorkspaceAgent();
      mockedSpawn.mockReturnValue(fakeProc('feature/x\n'));
      const result = await service.execute({
        agentId: 'abc123',
        args: ['symbolic-ref', '--short', 'HEAD'],
        cwd: '/workspace',
      });
      expect(result.stdout).toBe('feature/x\n');
    });

    it('skips global options when extracting the subcommand', async () => {
      mockWorkspaceAgent();
      mockedSpawn.mockReturnValue(fakeProc(''));
      await service.execute({ agentId: 'abc123', args: ['-C', '/workspace', 'status'] });
      expect(mockedSpawn).toHaveBeenCalledWith(
        'git',
        ['-C', '/workspace', 'status'],
        expect.any(Object),
      );
    });

    it('skips --no-pager global option when extracting the subcommand', async () => {
      mockWorkspaceAgent();
      mockedSpawn.mockReturnValue(fakeProc('a1b2c3d\n'));
      await service.execute({ agentId: 'abc123', args: ['--no-pager', 'log', '--oneline', '-1'] });
      expect(mockedSpawn).toHaveBeenCalledWith(
        'git',
        ['--no-pager', 'log', '--oneline', '-1'],
        expect.any(Object),
      );
    });

    it('rejects an unknown subcommand behind a global option', async () => {
      await expect(service.execute({ agentId: 'abc123', args: ['-C', '/workspace', 'rm-rf'] }))
        .rejects.toThrow(BadRequestException);
    });

    it('passes git --version through without requiring a workspace', async () => {
      mockedSpawn.mockReturnValue(fakeProc('git version 2.40.0\n'));
      const result = await service.execute({ agentId: 'abc123', args: ['--version'] });
      expect(result.stdout).toContain('git version');
      expect(agentsService.resolveById).not.toHaveBeenCalled();
    });
  });

  describe('identity enforcement', () => {
    beforeEach(() => {
      mockWorkspaceAgent();
    });

    it('rejects a commit when no identity is set and no generic default exists', async () => {
      mockedSpawnSync.mockReturnValue({ status: 1 });
      configService.getAll.mockReturnValue({ useGenericGitIdentity: false, gitSecurity: {
      reuseMainRepoCredentials: false,
      commandWhitelist: DEFAULT_GIT_WHITELIST,
      blockGlobalConfig: true,
      blockForcePush: false,
      protectedBranches: ['main', 'dev'],
      blockRemoteManagement: true,
    } });
      await expect(service.execute({ agentId: 'abc123', args: ['commit', '-m', 'x'] }))
        .rejects.toThrow('Please tell me who you are');
      expect(mockedSpawn).not.toHaveBeenCalled();
    });

    it('uses the agent local identity for commits', async () => {
      mockedSpawnSync
        .mockReturnValueOnce({ status: 0, stdout: 'Agent Name\n' })
        .mockReturnValueOnce({ status: 0, stdout: 'agent@example.com\n' });
      mockedSpawn.mockReturnValue(fakeProc(''));
      await service.execute({ agentId: 'abc123', args: ['commit', '-m', 'x'], cwd: '/workspace' });
      expect(mockedSpawn).toHaveBeenCalledWith(
        'git',
        ['commit', '-m', 'x'],
        expect.objectContaining({
          env: expect.not.objectContaining({ GIT_AUTHOR_NAME: expect.anything() }),
        }),
      );
    });

    it('injects the generic identity via GIT_AUTHOR_*/GIT_COMMITTER_* when enabled', async () => {
      mockedSpawnSync.mockReturnValue({ status: 1 });
      configService.getAll.mockReturnValue({
        useGenericGitIdentity: true,
        gitUserName: 'Generic',
        gitUserEmail: 'gen@example.com',
        gitSecurity: {
      reuseMainRepoCredentials: false,
      commandWhitelist: DEFAULT_GIT_WHITELIST,
      blockGlobalConfig: true,
      blockForcePush: false,
      protectedBranches: ['main', 'dev'],
      blockRemoteManagement: true,
    },
      });
      mockedSpawn.mockReturnValue(fakeProc(''));
      await service.execute({ agentId: 'abc123', args: ['commit', '-m', 'x'], cwd: '/workspace' });
      expect(mockedSpawn).toHaveBeenCalledWith(
        'git',
        ['commit', '-m', 'x'],
        expect.objectContaining({
          env: expect.objectContaining({
            GIT_AUTHOR_NAME: 'Generic',
            GIT_AUTHOR_EMAIL: 'gen@example.com',
            GIT_COMMITTER_NAME: 'Generic',
            GIT_COMMITTER_EMAIL: 'gen@example.com',
          }),
        }),
      );
    });

    it('does not require an identity for read-only commands', async () => {
      mockedSpawnSync.mockReturnValue({ status: 1 });
      mockedSpawn.mockReturnValue(fakeProc('feature/x\n'));
      await service.execute({ agentId: 'abc123', args: ['status'], cwd: '/workspace' });
      expect(mockedSpawn).toHaveBeenCalled();
      expect(mockedSpawnSync).not.toHaveBeenCalled();
    });
  });

  describe('git security config', () => {
    beforeEach(() => {
      mockWorkspaceAgent();
    });

    it('uses the configured command whitelist', async () => {
      // 'config' is in the default whitelist
      mockedSpawn.mockReturnValue(fakeProc(''));
      mockedSpawnSync.mockReturnValue({ status: 1 });
      configService.getAll.mockReturnValue({
        gitSecurity: {
          ...{
      reuseMainRepoCredentials: false,
      commandWhitelist: DEFAULT_GIT_WHITELIST,
      blockGlobalConfig: true,
      blockForcePush: false,
      protectedBranches: ['main', 'dev'],
      blockRemoteManagement: true,
    },
          commandWhitelist: ['status', 'log'],
        },
        useGenericGitIdentity: false,
      });
      // 'config' is NOT in the custom whitelist → should be blocked
      await expect(service.execute({ agentId: 'abc123', args: ['config', '--local', 'user.name'] }))
        .rejects.toThrow(BadRequestException);
    });

    it('blocks global config when blockGlobalConfig is true', async () => {
      mockedSpawn.mockReturnValue(fakeProc(''));
      await expect(service.execute({ agentId: 'abc123', args: ['config', '--global', 'user.name', 'x'] }))
        .rejects.toThrow(BadRequestException);
    });

    it('allows --local config when blockGlobalConfig is true', async () => {
      mockedSpawn.mockReturnValue(fakeProc(''));
      mockedSpawnSync.mockReturnValue({ status: 1 });
      // config --local is allowed (just reading, but it goes through)
      configService.getAll.mockReturnValue({
        gitSecurity: {
          ...{
      reuseMainRepoCredentials: false,
      commandWhitelist: DEFAULT_GIT_WHITELIST,
      blockGlobalConfig: true,
      blockForcePush: false,
      protectedBranches: ['main', 'dev'],
      blockRemoteManagement: true,
    },
          blockGlobalConfig: true,
        },
        useGenericGitIdentity: false,
      });
      await service.execute({ agentId: 'abc123', args: ['config', '--local', 'user.name'], cwd: '/workspace' });
      expect(mockedSpawn).toHaveBeenCalled();
    });

    it('allows global config when blockGlobalConfig is false', async () => {
      mockedSpawn.mockReturnValue(fakeProc(''));
      configService.getAll.mockReturnValue({
        gitSecurity: {
          ...{
      reuseMainRepoCredentials: false,
      commandWhitelist: DEFAULT_GIT_WHITELIST,
      blockGlobalConfig: true,
      blockForcePush: false,
      protectedBranches: ['main', 'dev'],
      blockRemoteManagement: true,
    },
          blockGlobalConfig: false,
        },
      });
      await service.execute({ agentId: 'abc123', args: ['config', '--global', 'user.name', 'x'], cwd: '/workspace' });
      expect(mockedSpawn).toHaveBeenCalled();
    });

    it('blocks force-push when blockForcePush is true', async () => {
      mockedSpawn.mockReturnValue(fakeProc(''));
      configService.getAll.mockReturnValue({
        gitSecurity: {
          ...{
      reuseMainRepoCredentials: false,
      commandWhitelist: DEFAULT_GIT_WHITELIST,
      blockGlobalConfig: true,
      blockForcePush: false,
      protectedBranches: ['main', 'dev'],
      blockRemoteManagement: true,
    },
          blockForcePush: true,
        },
      });
      await expect(service.execute({ agentId: 'abc123', args: ['push', '--force', 'origin', 'main'], cwd: '/workspace' }))
        .rejects.toThrow(BadRequestException);
    });

    it('allows force-push to feature branch when blockForcePush is false', async () => {
      mockedSpawn.mockReturnValue(fakeProc(''));
      configService.getAll.mockReturnValue({
        gitSecurity: {
          ...{
      reuseMainRepoCredentials: false,
      commandWhitelist: DEFAULT_GIT_WHITELIST,
      blockGlobalConfig: true,
      blockForcePush: false,
      protectedBranches: ['main', 'dev'],
      blockRemoteManagement: true,
    },
          blockForcePush: false,
        },
      });
      await service.execute({ agentId: 'abc123', args: ['push', '--force', 'origin', 'feature/x'], cwd: '/workspace' });
      expect(mockedSpawn).toHaveBeenCalled();
    });

    it('blocks force-push to protected branch (main)', async () => {
      mockedSpawn.mockReturnValue(fakeProc(''));
      // blockForcePush is false, but protectedBranches includes 'main'
      await expect(service.execute({ agentId: 'abc123', args: ['push', '--force', 'origin', 'main'], cwd: '/workspace' }))
        .rejects.toThrow('protected');
    });

    it('allows normal push to protected branch (dev)', async () => {
      mockedSpawn.mockReturnValue(fakeProc(''));
      // Normal push (no --force) to 'dev' should be allowed
      await service.execute({ agentId: 'abc123', args: ['push', 'origin', 'dev'], cwd: '/workspace' });
      expect(mockedSpawn).toHaveBeenCalled();
    });

    it('blocks branch -D on protected branch', async () => {
      mockedSpawn.mockReturnValue(fakeProc(''));
      await expect(service.execute({ agentId: 'abc123', args: ['branch', '-D', 'main'], cwd: '/workspace' }))
        .rejects.toThrow('protected');
    });

    it('allows branch -D on non-protected branch', async () => {
      mockedSpawn.mockReturnValue(fakeProc(''));
      await service.execute({ agentId: 'abc123', args: ['branch', '-D', 'feature/x'], cwd: '/workspace' });
      expect(mockedSpawn).toHaveBeenCalled();
    });

    it('blocks push --delete to protected branch', async () => {
      mockedSpawn.mockReturnValue(fakeProc(''));
      await expect(service.execute({ agentId: 'abc123', args: ['push', 'origin', '--delete', 'dev'], cwd: '/workspace' }))
        .rejects.toThrow('protected');
    });

    it('blocks remote add when blockRemoteManagement is true', async () => {
      mockedSpawn.mockReturnValue(fakeProc(''));
      await expect(service.execute({ agentId: 'abc123', args: ['remote', 'add', 'upstream', 'url'], cwd: '/workspace' }))
        .rejects.toThrow(BadRequestException);
    });

    it('allows remote -v when blockRemoteManagement is true', async () => {
      mockedSpawn.mockReturnValue(fakeProc(''));
      await service.execute({ agentId: 'abc123', args: ['remote', '-v'], cwd: '/workspace' });
      expect(mockedSpawn).toHaveBeenCalled();
    });

    it('allows remote add when blockRemoteManagement is false', async () => {
      mockedSpawn.mockReturnValue(fakeProc(''));
      configService.getAll.mockReturnValue({
        gitSecurity: {
          ...{
      reuseMainRepoCredentials: false,
      commandWhitelist: DEFAULT_GIT_WHITELIST,
      blockGlobalConfig: true,
      blockForcePush: false,
      protectedBranches: ['main', 'dev'],
      blockRemoteManagement: true,
    },
          blockRemoteManagement: false,
        },
      });
      await service.execute({ agentId: 'abc123', args: ['remote', 'add', 'upstream', 'url'], cwd: '/workspace' });
      expect(mockedSpawn).toHaveBeenCalled();
    });
  });

  describe('getShimScript', () => {
    it('exports AGENT_ID, AGENT_NAME and CWD so subprocesses can read them', () => {
      const script = service.getShimScript();
      expect(script).toContain('export AGENT_ID');
      expect(script).toContain('export AGENT_NAME');
      expect(script).toContain('export CWD');
      expect(script).toContain("os.environ.get('AGENT_ID')");
      expect(script).toContain("os.environ['CWD']");
    });

    it('fails fast when neither CODEPODS_AGENT_ID nor CODEPODS_AGENT_NAME is set', () => {
      const script = service.getShimScript();
      expect(script).toContain('CODEPODS_AGENT_ID not set');
      expect(script).toContain('exit 1');
    });

    it('posts the agent id to the API git/execute endpoint', () => {
      const script = service.getShimScript();
      expect(script).toContain("'agentId': os.environ.get('AGENT_ID') or None");
      expect(script).toContain('$API_URL/git/execute');
    });

    it('does not include X-Internal-Token fallback (ADR-036 uses proxy HMAC)', () => {
      const script = service.getShimScript();
      expect(script).not.toContain('X-Internal-Token');
      expect(script).not.toContain('INTERNAL_TOKEN');
      expect(script).toContain('$API_URL/git/execute');
    });
  });
});
