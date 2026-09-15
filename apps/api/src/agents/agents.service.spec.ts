import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AgentsService } from './agents.service';
import { AgentEntity } from './agent.entity';
import { AgentServiceEntity } from './agent-service.entity';
import { AgentNoticeEntity } from './agent-notice.entity';
import { ImageTemplateEntity } from '../images/image-template.entity';
import { DockerService } from '../docker/docker.service';
import { ImagesService } from '../images/images.service';
import { AiProvidersService } from '../ai-proxy/ai-providers.service';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { ConfigService } from '../config/config.service';
import { HomesService } from '../homes/homes.service';
import { McpServersService } from '../mcp-servers/mcp-servers.service';
import { SkillsService } from '../skills/skills.service';

const mockMcpServers = {
  findBySlug: jest.fn(),
  findOne: jest.fn(),
  findConnectAll: jest.fn().mockResolvedValue([]),
  assignToAgent: jest.fn(),
  removeFromAgent: jest.fn(),
  removeAllFromAgent: jest.fn(),
  listForAgent: jest.fn().mockResolvedValue([]),
  isAssignedToAgent: jest.fn(),
};

const mockDocker = {
  listContainers: jest.fn(),
  getContainer: jest.fn(),
  startContainer: jest.fn(),
  stopContainer: jest.fn(),
  removeContainer: jest.fn(),
  createContainer: jest.fn(),
  containerExists: jest.fn(),
  getNetworkGateway: jest.fn(),
  getContainerLogs: jest.fn(),
  registerAgentIp: jest.fn().mockResolvedValue(undefined),
  unregisterAgent: jest.fn(),
  mapStatus: jest.fn(),
  mapPorts: jest.fn(),
};

const mockAgentServiceRepo = {
  find: jest.fn(),
  findOne: jest.fn(),
  save: jest.fn(),
  delete: jest.fn(),
};

const mockRepo = {
  find: jest.fn(),
  findOne: jest.fn(),
  save: jest.fn(),
  delete: jest.fn(),
  count: jest.fn(),
  create: jest.fn((entity: Partial<AgentEntity>) => entity as AgentEntity),
};

const mockImages = {
  ensureImageForAgentCreation: jest.fn(),
};

const mockWorkspaces = {
  findOne: jest.fn(),
  findByIds: jest.fn(),
  grantAgentAccess: jest.fn().mockResolvedValue(null),
  revokeAgentAccess: jest.fn().mockResolvedValue(true),
};

const mockAiProviders = {};

const mockImageTemplateRepo = {
  find: jest.fn(),
  findOne: jest.fn(),
};

const makeRecord = (overrides: Partial<AgentEntity> = {}): AgentEntity =>
  ({
    id: 'abc123def456',
    containerId: 'abc123def456full000000000000000000000000000000000000000000000000',
    name: 'test-agent',
    image: 'ubuntu:24.04',
    codepodId: 1,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  } as AgentEntity);

describe('AgentsService', () => {
  let service: AgentsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentsService,
        { provide: DockerService, useValue: mockDocker },
        { provide: ImagesService, useValue: mockImages },
        { provide: getRepositoryToken(AgentEntity), useValue: mockRepo },
        { provide: getRepositoryToken(AgentServiceEntity), useValue: mockAgentServiceRepo },
        { provide: getRepositoryToken(ImageTemplateEntity), useValue: mockImageTemplateRepo },
        { provide: getRepositoryToken(AgentNoticeEntity), useValue: { find: jest.fn().mockResolvedValue([]), save: jest.fn(), findOne: jest.fn() } },
        { provide: AiProvidersService, useValue: mockAiProviders },
        { provide: McpServersService, useValue: mockMcpServers },
        { provide: SkillsService, useValue: {} },
        { provide: WorkspacesService, useValue: mockWorkspaces },
        {
          provide: HomesService,
          useValue: {
            createHome: jest.fn(() => '/tmp/homes/test-id'),
            getHomePath: jest.fn(() => '/tmp/homes/test-id'),
            removeHome: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'docker') {
                return {
                  autoRemove: false,
                  readOnly: true,
                  tmpfsSize: '100m',
                  capDropAll: true,
                  dropNetRaw: true,
                  noNewPrivileges: true,
                  pidsLimit: 128,
                  memoryLimit: '',
                  cpuLimit: 0,
                  runtime: '',
                  forceNonRootUser: true,
                  agentUidRange: { start: 55001, end: 65000 },
                  customArgs: '',
                };
              }
              if (key === 'networkSecurity') {
                return {
                  filterInternetEgress: false,
                  egressWhitelist: ['api.anthropic.com'],
                  proxyPort: 8888,
                };
              }
              return undefined;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<AgentsService>(AgentsService);
    jest.clearAllMocks();
    mockImageTemplateRepo.find.mockResolvedValue([]);
    mockImageTemplateRepo.findOne.mockResolvedValue(null);
    mockAgentServiceRepo.find.mockResolvedValue([]);
    mockImages.ensureImageForAgentCreation.mockResolvedValue({
      imageRef: 'ubuntu:24.04',
      services: [],
      workspaceMountPath: '/workspace',
      homeMountPath: '/home/agent',
    });
    mockWorkspaces.findByIds.mockResolvedValue(new Map());
    mockWorkspaces.findOne.mockResolvedValue(null);
    mockDocker.containerExists.mockResolvedValue(true);
    // By default no uid collision: assignAgentUid succeeds on the first random pick.
    mockRepo.count.mockResolvedValue(0);
  });

  describe('findAll', () => {
    it('merges DB records with live Docker status', async () => {
      const rec = makeRecord();
      mockDocker.listContainers.mockResolvedValue([
        { Id: rec.containerId, State: 'running', Ports: [] },
      ]);
      mockRepo.find.mockResolvedValue([rec]);
      mockDocker.mapStatus.mockReturnValue('running');
      mockDocker.mapPorts.mockReturnValue([]);

      const result = await service.findAll();

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('test-agent');
      expect(result[0].status).toBe('running');
      expect(mockDocker.listContainers).toHaveBeenCalledWith(true);
    });

    it('returns unknown status when container not found in Docker', async () => {
      mockDocker.listContainers.mockResolvedValue([]);
      mockRepo.find.mockResolvedValue([makeRecord()]);

      const result = await service.findAll();

      expect(result[0].status).toBe('unknown');
    });

    it('filters by codepodId', async () => {
      mockDocker.listContainers.mockResolvedValue([]);
      mockRepo.find.mockResolvedValue([]);

      await service.findAll(2);

      expect(mockRepo.find).toHaveBeenCalledWith({ where: { codepodId: 2 } });
    });
  });

  describe('findOne', () => {
    it('returns agent with unknown status when container no longer exists', async () => {
      const rec = makeRecord();
      mockRepo.findOne.mockResolvedValue(rec);
      mockDocker.getContainer.mockReturnValue({
        inspect: jest.fn().mockRejectedValue(new Error('no such container')),
      });
      mockDocker.mapStatus.mockReturnValue('unknown');
      mockAgentServiceRepo.find.mockResolvedValue([]);

      const result = await service.findOne(rec.id);

      expect(result.status).toBe('unknown');
      expect(result.name).toBe('test-agent');
    });

    it('returns live status when container exists', async () => {
      const rec = makeRecord();
      mockRepo.findOne.mockResolvedValue(rec);
      mockDocker.getContainer.mockReturnValue({
        inspect: jest.fn().mockResolvedValue({
          State: { Status: 'running' },
          NetworkSettings: { Ports: {} },
        }),
      });
      mockDocker.mapStatus.mockReturnValue('running');
      mockAgentServiceRepo.find.mockResolvedValue([]);

      const result = await service.findOne(rec.id);

      expect(result.status).toBe('running');
    });

    it('throws NotFoundException when agent does not exist', async () => {
      mockRepo.findOne.mockResolvedValue(null);

      await expect(service.findOne('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('start', () => {
    it('starts the container by containerId', async () => {
      const rec = makeRecord();
      mockRepo.findOne.mockResolvedValue(rec);
      mockDocker.startContainer.mockResolvedValue(undefined);

      await service.start(rec.id);

      expect(mockDocker.startContainer).toHaveBeenCalledWith(rec.containerId);
      expect(mockDocker.registerAgentIp).toHaveBeenCalledWith(rec.containerId, rec.id);
    });

    describe('create', () => {
      it('creates agent and seeds services from template manifest defaults', async () => {
        mockImages.ensureImageForAgentCreation.mockResolvedValue({
          imageRef: 'codepods/org-template:v1.2.3',
          services: [
            { type: 'terminal', name: 'ttyd', port: 7681 },
            { type: 'web', name: 'opencode ui', port: 4096 },
          ],
          workspaceMountPath: '/workspace',
          homeMountPath: '/home/agent',
        });
        const containerId = 'ct-abc123def456ct-abc123def456ct-abc123def456ct-abcd';
        const container = {
          start: jest.fn().mockResolvedValue(undefined),
          inspect: jest.fn().mockResolvedValue({ Id: containerId, State: { Running: true, Status: 'running' } }),
        };
        mockDocker.createContainer.mockResolvedValue(container);
        mockRepo.save.mockResolvedValue(undefined);
        mockAgentServiceRepo.save.mockResolvedValue(undefined);
        mockRepo.findOne.mockResolvedValue(makeRecord({ id: 'generated-id', containerId, image: 'codepods/org-template:v1.2.3' }));
        mockDocker.getContainer.mockReturnValue({
          inspect: jest.fn().mockResolvedValue({
            State: { Status: 'running' },
            NetworkSettings: { Ports: {} },
          }),
        });
        mockDocker.mapStatus.mockReturnValue('running');

        await service.create({
          name: 'agent-from-template',
          imageTemplateId: 1,
        });

        expect(mockImages.ensureImageForAgentCreation).toHaveBeenCalledWith(1, false, false);

        // The agent id is a stable, generated id (not the container short id) so
        // it can be baked into the container env and survive renames.
        const saved = mockRepo.save.mock.calls[0][0];
        expect(saved.id).toMatch(/^[0-9a-f]{12}$/);
        expect(saved.containerId).toBe(containerId);
        expect(saved.name).toBe('agent-from-template');
        expect(saved.image).toBe('codepods/org-template:v1.2.3');
        expect(saved.codepodId).toBe(1);
        expect(saved.imageTemplateId).toBe(1);
        // A per-agent logical uid is assigned (random in the configured range) and
        // persisted; gid mirrors uid (no separate group).
        expect(saved.agentUid).toBeGreaterThanOrEqual(55001);
        expect(saved.agentUid).toBeLessThanOrEqual(65000);
        expect(saved.agentGid).toBe(saved.agentUid);

        // The stable id is injected into the container env as CODEPODS_AGENT_ID.
        const createOpts = mockDocker.createContainer.mock.calls[0][0];
        expect(createOpts.Env).toContain(`CODEPODS_AGENT_ID=${saved.id}`);
        expect(createOpts.Env).toContain('CODEPODS_AGENT_NAME=agent-from-template');
        // --user is the assigned logical uid:gid (never the manifest user).
        expect(createOpts.User).toBe(`${saved.agentUid}:${saved.agentUid}`);

        expect(mockAgentServiceRepo.save).toHaveBeenCalledWith([
          { agentId: saved.id, codepodId: 1, type: 'terminal', name: 'ttyd', port: 7681 },
          { agentId: saved.id, codepodId: 1, type: 'web', name: 'opencode ui', port: 4096 },
        ]);

        // The persisted home is ACL-granted to the agent uid (not chowned — no root);
        // no workspace here so only the home grant runs.
        expect(mockWorkspaces.grantAgentAccess).toHaveBeenCalledWith('/tmp/homes/test-id', saved.agentUid);
        expect(mockWorkspaces.grantAgentAccess).toHaveBeenCalledTimes(1);
      });

      it('grants the agent ACL access to home and workspace bind-mounts', async () => {
        mockImages.ensureImageForAgentCreation.mockResolvedValue({
          imageRef: 'codepods/org-template:v1.2.3',
          services: [],
          workspaceMountPath: '/workspace',
          homeMountPath: '/home/agent',
        });
        mockWorkspaces.findOne.mockResolvedValue({ path: '/tmp/ws/test-repo' });
        const container = {
          start: jest.fn().mockResolvedValue(undefined),
          inspect: jest.fn().mockResolvedValue({ Id: 'c'.repeat(64), State: { Running: true, Status: 'running' } }),
        };
        mockDocker.createContainer.mockResolvedValue(container);
        mockRepo.save.mockResolvedValue(undefined);
        mockAgentServiceRepo.save.mockResolvedValue(undefined);
        mockRepo.findOne.mockResolvedValue(makeRecord({ image: 'codepods/org-template:v1.2.3' }));
        mockDocker.getContainer.mockReturnValue({
          inspect: jest.fn().mockResolvedValue({ State: { Status: 'running' }, NetworkSettings: { Ports: {} } }),
        });
        mockDocker.mapStatus.mockReturnValue('running');

        await service.create({ name: 'ws-agent', imageTemplateId: 1, workspaceId: 7 });

        const saved = mockRepo.save.mock.calls[0][0];
        // ACL grant on the home AND the workspace bind-mount, both as the agent uid.
        expect(mockWorkspaces.grantAgentAccess).toHaveBeenCalledWith('/tmp/homes/test-id', saved.agentUid);
        expect(mockWorkspaces.grantAgentAccess).toHaveBeenCalledWith('/tmp/ws/test-repo', saved.agentUid);
        expect(mockWorkspaces.grantAgentAccess).toHaveBeenCalledTimes(2);
      });

      it('retries uid assignment on collision and persists the assigned uid', async () => {
        // First random pick collides (count=1), second succeeds (count=0).
        mockRepo.count
          .mockResolvedValueOnce(1)
          .mockResolvedValueOnce(0);
        mockImages.ensureImageForAgentCreation.mockResolvedValue({
          imageRef: 'codepods/org-template:v1.2.3',
          services: [],
          workspaceMountPath: '/workspace',
          homeMountPath: '/home/agent',
        });
        const container = {
          start: jest.fn().mockResolvedValue(undefined),
          inspect: jest.fn().mockResolvedValue({ Id: 'e'.repeat(64), State: { Running: true, Status: 'running' } }),
        };
        mockDocker.createContainer.mockResolvedValue(container);
        mockRepo.save.mockResolvedValue(undefined);
        mockAgentServiceRepo.save.mockResolvedValue(undefined);
        mockRepo.findOne.mockResolvedValue(makeRecord({ image: 'codepods/org-template:v1.2.3' }));

        await service.create({ name: 'collision-agent', imageTemplateId: 1 });

        const saved = mockRepo.save.mock.calls[0][0];
        // assignAgentUid probed twice (one collision, one success).
        expect(mockRepo.count).toHaveBeenCalledTimes(2);
        expect(saved.agentUid).toBeGreaterThanOrEqual(55001);
        expect(saved.agentUid).toBeLessThanOrEqual(65000);
        const createOpts = mockDocker.createContainer.mock.calls[0][0];
        expect(createOpts.User).toBe(`${saved.agentUid}:${saved.agentUid}`);
      });

      it('runs as the API uid and skips ACL grants when the toggle is off', async () => {
        // forceNonRootUser off: agent runs as process.getuid(), no ACL, agentUid null.
        (service as any).configService.get = jest.fn((key: string) => {
          if (key === 'docker') {
            return {
              autoRemove: false,
              readOnly: true,
              tmpfsSize: '100m',
              capDropAll: true,
              noNewPrivileges: true,
              pidsLimit: 128,
              memoryLimit: '',
              cpuLimit: 0,
              runtime: '',
              forceNonRootUser: false,
              agentUidRange: { start: 55001, end: 65000 },
              customArgs: '',
            };
          }
          if (key === 'networkSecurity') {
            return { filterInternetEgress: false, egressWhitelist: [], proxyPort: 8888 };
          }
          return undefined;
        });
        mockImages.ensureImageForAgentCreation.mockResolvedValue({
          imageRef: 'codepods/org-template:v1.2.3',
          services: [],
          workspaceMountPath: '/workspace',
          homeMountPath: '/home/agent',
        });
        mockWorkspaces.findOne.mockResolvedValue({ path: '/tmp/ws/test-repo' });
        const container = {
          start: jest.fn().mockResolvedValue(undefined),
          inspect: jest.fn().mockResolvedValue({ Id: 'f'.repeat(64), State: { Running: true, Status: 'running' } }),
        };
        mockDocker.createContainer.mockResolvedValue(container);
        mockRepo.save.mockResolvedValue(undefined);
        mockAgentServiceRepo.save.mockResolvedValue(undefined);
        mockRepo.findOne.mockResolvedValue(makeRecord({ image: 'codepods/org-template:v1.2.3' }));

        await service.create({ name: 'api-uid-agent', imageTemplateId: 1, workspaceId: 7 });

        const saved = mockRepo.save.mock.calls[0][0];
        expect(saved.agentUid).toBeNull();
        const createOpts = mockDocker.createContainer.mock.calls[0][0];
        // --user is the API process uid:gid (native writes as the dir owner).
        expect(createOpts.User).toBe(`${process.getuid?.() ?? 0}:${process.getgid?.() ?? 0}`);
        // No ACL grants in toggle-off mode.
        expect(mockWorkspaces.grantAgentAccess).not.toHaveBeenCalled();
      });

      it('binds host.docker.internal to the internal network gateway IP when egress is on', async () => {
        // filterInternetEgress on: the agent runs on the internal network where the
        // host-gateway token is unreliable, so host.docker.internal is bound to
        // the network's explicit gateway IP (queried from Docker).
        (service as any).configService.get = jest.fn((key: string) => {
          if (key === 'docker') {
            return {
              autoRemove: false, readOnly: true, tmpfsSize: '100m', capDropAll: true,
              noNewPrivileges: true, pidsLimit: 128, memoryLimit: '', cpuLimit: 0,
              runtime: '', forceNonRootUser: true, agentUidRange: { start: 55001, end: 65000 },
              customArgs: '',
            };
          }
          if (key === 'networkSecurity') {
            return { filterInternetEgress: true, egressWhitelist: ['api.anthropic.com'], proxyPort: 8888 };
          }
          return undefined;
        });
        mockDocker.getNetworkGateway.mockResolvedValue('172.20.0.1');
        mockImages.ensureImageForAgentCreation.mockResolvedValue({
          imageRef: 'codepods/org-template:v1.2.3',
          services: [],
          workspaceMountPath: '/workspace',
          homeMountPath: '/home/agent',
        });
        const container = {
          start: jest.fn().mockResolvedValue(undefined),
          inspect: jest.fn().mockResolvedValue({ Id: 'a'.repeat(64), State: { Running: true, Status: 'running' } }),
        };
        mockDocker.createContainer.mockResolvedValue(container);
        mockRepo.save.mockResolvedValue(undefined);
        mockAgentServiceRepo.save.mockResolvedValue(undefined);
        mockRepo.findOne.mockResolvedValue(makeRecord({ image: 'codepods/org-template:v1.2.3' }));
        mockDocker.getContainer.mockReturnValue({
          inspect: jest.fn().mockResolvedValue({ State: { Status: 'running' }, NetworkSettings: { Ports: {} } }),
        });
        mockDocker.mapStatus.mockReturnValue('running');

        await service.create({ name: 'egress-agent', imageTemplateId: 1 });

        expect(mockDocker.getNetworkGateway).toHaveBeenCalledWith('codepods-agents', true);
        const createOpts = mockDocker.createContainer.mock.calls[0][0];
        // host.docker.internal bound to the queried gateway IP, not host-gateway.
        expect(createOpts.HostConfig.ExtraHosts).toContain('host.docker.internal:172.20.0.1');
        expect(createOpts.HostConfig.NetworkMode).toBe('codepods-agents');
        // Proxy env vars point at host.docker.internal (resolved via the bind).
        expect(createOpts.Env).toContain('HTTP_PROXY=http://host.docker.internal:8888');
      });

      it('detects container exit after start and logs exit code + container logs', async () => {
        mockImages.ensureImageForAgentCreation.mockResolvedValue({
          imageRef: 'codepods/org-template:v1.2.3',
          services: [],
          workspaceMountPath: '/workspace',
          homeMountPath: '/home/agent',
        });
        const container = {
          start: jest.fn().mockResolvedValue(undefined),
          inspect: jest.fn().mockResolvedValue({
            Id: 'x'.repeat(64),
            State: { Running: false, ExitCode: 137, Status: 'exited', Error: '' },
          }),
        };
        mockDocker.createContainer.mockResolvedValue(container);
        mockDocker.getContainerLogs.mockResolvedValue('OOM killed: out of memory');
        mockDocker.getContainer.mockReturnValue({
          inspect: jest.fn().mockResolvedValue({ State: { Status: 'exited' }, NetworkSettings: { Ports: {} } }),
        });
        mockDocker.mapStatus.mockReturnValue('exited');
        mockRepo.save.mockResolvedValue(undefined);
        mockAgentServiceRepo.save.mockResolvedValue(undefined);
        mockRepo.findOne.mockResolvedValue(makeRecord({ image: 'codepods/org-template:v1.2.3' }));

        await service.create({ name: 'oom-agent', imageTemplateId: 1 });

        expect(mockDocker.getContainerLogs).toHaveBeenCalledWith('x'.repeat(64), 50);
        // The exit diagnostic was appended to the activity log.
        const logCalls = mockRepo.save.mock.calls.filter(
          (c) => (c[0] as AgentEntity).creationLog?.includes('Container exited immediately'),
        );
        expect(logCalls.length).toBeGreaterThan(0);
        expect((logCalls[0][0] as AgentEntity).creationLog).toContain('exit code: 137');
        expect((logCalls[0][0] as AgentEntity).creationLog).toContain('OOM killed: out of memory');
      });
    });

    it('throws NotFoundException when agent does not exist', async () => {
      mockRepo.findOne.mockResolvedValue(null);

      await expect(service.start('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('stop', () => {
    it('stops the container by containerId', async () => {
      const rec = makeRecord();
      mockRepo.findOne.mockResolvedValue(rec);
      mockDocker.stopContainer.mockResolvedValue(undefined);

      await service.stop(rec.id);

      expect(mockDocker.stopContainer).toHaveBeenCalledWith(rec.containerId);
    });

    it('throws NotFoundException when agent does not exist', async () => {
      mockRepo.findOne.mockResolvedValue(null);

      await expect(service.stop('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getContainerLogs', () => {
    it('returns the tail of the container logs', async () => {
      const rec = makeRecord();
      mockRepo.findOne.mockResolvedValue(rec);
      mockDocker.getContainerLogs.mockResolvedValue('line1\nline2');

      const logs = await service.getContainerLogs(rec.id, 100);

      expect(mockDocker.getContainerLogs).toHaveBeenCalledWith(rec.containerId, 100);
      expect(logs).toBe('line1\nline2');
    });

    it('clamps tail into the 1..5000 range', async () => {
      const rec = makeRecord();
      mockRepo.findOne.mockResolvedValue(rec);
      mockDocker.getContainerLogs.mockResolvedValue('');

      await service.getContainerLogs(rec.id, 99999);
      expect(mockDocker.getContainerLogs).toHaveBeenCalledWith(rec.containerId, 5000);

      await service.getContainerLogs(rec.id, -5);
      expect(mockDocker.getContainerLogs).toHaveBeenCalledWith(rec.containerId, 1);

      // 0 / NaN fall back to the default of 500 lines.
      await service.getContainerLogs(rec.id, 0);
      expect(mockDocker.getContainerLogs).toHaveBeenCalledWith(rec.containerId, 500);
    });

    it('throws NotFoundException when agent does not exist', async () => {
      mockRepo.findOne.mockResolvedValue(null);

      await expect(service.getContainerLogs('nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('wraps docker errors in a BadRequestException', async () => {
      const rec = makeRecord();
      mockRepo.findOne.mockResolvedValue(rec);
      mockDocker.getContainerLogs.mockRejectedValue(new Error('container gone'));

      await expect(service.getContainerLogs(rec.id)).rejects.toThrow(BadRequestException);
    });
  });

  describe('remove', () => {
    it('removes container and deletes DB record', async () => {
      const rec = makeRecord();
      mockRepo.findOne.mockResolvedValue(rec);
      mockDocker.removeContainer.mockResolvedValue(undefined);
      mockRepo.delete.mockResolvedValue({ affected: 1 });

      await service.remove(rec.id);

      expect(mockDocker.removeContainer).toHaveBeenCalledWith(rec.containerId);
      expect(mockMcpServers.removeAllFromAgent).toHaveBeenCalledWith(rec.id);
      expect(mockRepo.delete).toHaveBeenCalledWith(rec.id);
    });

    it('throws NotFoundException when agent does not exist', async () => {
      mockRepo.findOne.mockResolvedValue(null);

      await expect(service.remove('nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('deletes the DB record even when the container no longer exists', async () => {
      const rec = makeRecord();
      mockRepo.findOne.mockResolvedValue(rec);
      // Container already gone (e.g. --rm auto-removed or never started).
      mockDocker.removeContainer.mockRejectedValue(new Error('no such container'));
      mockRepo.delete.mockResolvedValue({ affected: 1 });

      await service.remove(rec.id);

      expect(mockDocker.removeContainer).toHaveBeenCalledWith(rec.containerId);
      expect(mockRepo.delete).toHaveBeenCalledWith(rec.id);
    });

    it('revokes the agent workspace ACL when no co-tenant shares the uid', async () => {
      const rec = makeRecord({ workspaceId: 7, agentUid: 1000 });
      mockRepo.findOne.mockResolvedValue(rec);
      mockDocker.removeContainer.mockResolvedValue(undefined);
      mockRepo.delete.mockResolvedValue({ affected: 1 });
      // After the agent is gone, no other agent on workspace 7 has uid 1000.
      mockRepo.count.mockResolvedValue(0);
      mockWorkspaces.findOne.mockResolvedValue({ path: '/tmp/ws/shared' });

      await service.remove(rec.id);

      expect(mockWorkspaces.revokeAgentAccess).toHaveBeenCalledWith('/tmp/ws/shared', 1000);
    });

    it('keeps the workspace ACL when a co-tenant shares the uid', async () => {
      const rec = makeRecord({ workspaceId: 7, agentUid: 1000 });
      mockRepo.findOne.mockResolvedValue(rec);
      mockDocker.removeContainer.mockResolvedValue(undefined);
      mockRepo.delete.mockResolvedValue({ affected: 1 });
      // Another remaining agent on workspace 7 still uses uid 1000.
      mockRepo.count.mockResolvedValue(1);
      mockWorkspaces.findOne.mockResolvedValue({ path: '/tmp/ws/shared' });

      await service.remove(rec.id);

      expect(mockWorkspaces.revokeAgentAccess).not.toHaveBeenCalled();
    });

    it('deletes the workspace and skips ACL revoke when no other agent references it', async () => {
      const rec = makeRecord({ workspaceId: 7, agentUid: 1000 });
      mockRepo.findOne.mockResolvedValue(rec);
      mockDocker.removeContainer.mockResolvedValue(undefined);
      mockRepo.delete.mockResolvedValue({ affected: 1 });
      // deleteWorkspace=true and no other agents → workspace removed entirely.
      mockRepo.count.mockResolvedValue(0);
      mockWorkspaces.findOne.mockResolvedValue({ path: '/tmp/ws/shared' });
      const wsRemove = jest.fn().mockResolvedValue(undefined);
      (service as any).workspacesService.remove = wsRemove;

      await service.remove(rec.id, true);

      expect(wsRemove).toHaveBeenCalledWith(7, rec.codepodId);
      // Workspace dir is gone, so no ACL revoke is needed.
      expect(mockWorkspaces.revokeAgentAccess).not.toHaveBeenCalled();
    });
  });
});
