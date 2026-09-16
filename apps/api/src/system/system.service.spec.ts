import { Test, TestingModule } from '@nestjs/testing';
import { SystemService } from './system.service';
import { DockerService } from '../docker/docker.service';
import { AgentsService } from '../agents/agents.service';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { HomesService } from '../homes/homes.service';

const mockDocker = {
  listContainers: jest.fn().mockResolvedValue([
    { Id: 'c1', Names: ['/agent-1'], Image: 'img-1', ImageID: 'sha256:aaa', State: 'running' },
  ]),
  listContainerSizes: jest.fn().mockResolvedValue(new Map([
    ['c1', { sizeRw: 50_000_000, sizeRootFs: 2_650_000_000, name: 'agent-1' }],
    ['c2', { sizeRw: 50_000_000, sizeRootFs: 2_650_000_000, name: 'agent-2' }],
  ])),
  getContainerStats: jest.fn().mockResolvedValue({
    cpuPercent: 12.5,
    memUsed: 100_000_000,
    memLimit: 1_000_000_000,
    processCount: 42,
  }),
  getContainerSize: jest.fn().mockResolvedValue({ sizeRw: 50_000_000, sizeRootFs: 2_650_000_000 }),
  getImageSize: jest.fn().mockResolvedValue(200_000_000),
  listImages: jest.fn().mockResolvedValue([
    { id: 'sha256:aaa', repoTags: ['img-1:latest'], size: 892_000_000 },
    { id: 'sha256:bbb', repoTags: ['img-2:latest'], size: 1_200_000_000 },
    { id: 'sha256:ccc', repoTags: ['unused:latest'], size: 500_000_000 },
  ]),
  removeImage: jest.fn().mockResolvedValue(undefined),
};

const mockAgents = {
  findAll: jest.fn().mockResolvedValue([
    { id: 'c1', name: 'agent-1', image: 'img-1', status: 'running', workspaceId: 1, imageTemplateId: 1 },
    { id: 'c2', name: 'agent-2', image: 'img-2', status: 'stopped', workspaceId: 2, imageTemplateId: null },
  ]),
};

const mockWorkspaces = {
  findAll: jest.fn().mockResolvedValue([
    { id: 1, name: 'ws-1', slug: 'ws-1', type: 'git' },
    { id: 2, name: 'ws-2', slug: 'ws-2', type: 'git' },
    { id: 3, name: 'ws-3', slug: 'ws-3', type: 'git' },
  ]),
  findByIds: jest.fn().mockResolvedValue(new Map([
    [1, { id: 1, slug: 'ws-1', name: 'ws-1' }],
    [2, { id: 2, slug: 'ws-2', name: 'ws-2' }],
  ])),
  getWorkspaceSize: jest.fn().mockReturnValue(30_000_000),
  getInfo: jest.fn().mockResolvedValue({ dirty: false, ahead: 0 }),
};

const mockHomes = {
  getHomeSize: jest.fn().mockReturnValue(10_000_000),
  listOrphanedHomes: jest.fn().mockReturnValue([
    { agentId: 'deadbeef', path: '/data/homes/deadbeef', size: 50_000_000 },
  ]),
};

describe('SystemService', () => {
  let service: SystemService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SystemService,
        { provide: DockerService, useValue: mockDocker },
        { provide: AgentsService, useValue: mockAgents },
        { provide: WorkspacesService, useValue: mockWorkspaces },
        { provide: HomesService, useValue: mockHomes },
      ],
    }).compile();

    service = module.get(SystemService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('getSystemStats', () => {
    it('returns system stats with agent and container counts', async () => {
      const stats = await service.getSystemStats();
      expect(stats.agentCount).toBe(1); // one running agent
      expect(stats.containerCount).toBe(1);
      expect(stats.cpuPercent).toBeGreaterThanOrEqual(0);
      expect(stats.memTotal).toBeGreaterThan(0);
    });
  });

  describe('getAgentStats', () => {
    it('returns stats for all agents including stopped ones', async () => {
      const result = await service.getAgentStats();
      expect(result).toHaveLength(2);

      const running = result.find((a) => a.agentId === 'c1');
      expect(running?.cpuPercent).toBe(12.5);
      expect(running?.processCount).toBe(42);
      expect(running?.diskUsed).toBe(50_000_000);
      expect(running?.diskTotal).toBe(2_650_000_000);
      expect(running?.workspaceSize).toBe(30_000_000);
      expect(running?.homeSize).toBe(10_000_000);
      expect(running?.totalSize).toBe(2_650_000_000 + 30_000_000 + 10_000_000);

      const stopped = result.find((a) => a.agentId === 'c2');
      expect(stopped?.cpuPercent).toBe(0);
      expect(stopped?.processCount).toBe(0);
      // Stopped containers still have a writable layer — disk size should be reported
      expect(stopped?.diskUsed).toBe(50_000_000);
      expect(stopped?.diskTotal).toBe(2_650_000_000);
    });
  });

  describe('getCleanupCheck', () => {
    it('identifies orphaned workspaces, orphaned homes, and unused Docker images', async () => {
      const result = await service.getCleanupCheck();

      // ws-1 has agent c1 (running), ws-2 has agent c2 (stopped) → both linked, not orphaned.
      // ws-3 has no agent at all → orphaned.
      expect(result.orphanedWorkspaces).toHaveLength(1);
      expect(result.orphanedWorkspaces[0].name).toBe('ws-3');
      expect(result.orphanedWorkspaces[0].size).toBe(30_000_000);
      expect(result.orphanedWorkspaces[0].stoppedAgentCount).toBe(0);

      // One orphaned home returned by mockHomes
      expect(result.orphanedHomes).toHaveLength(1);
      expect(result.orphanedHomes[0].agentId).toBe('deadbeef');
      expect(result.orphanedHomes[0].size).toBe(50_000_000);

      // Docker images: sha256:aaa is used by container c1, the other two are unused.
      expect(result.unusedDockerImages).toHaveLength(2);
      expect(result.unusedDockerImages[0].imageRef).toBe('img-2:latest');
      expect(result.unusedDockerImages[0].size).toBe(1_200_000_000);
      expect(result.unusedDockerImages[1].imageRef).toBe('unused:latest');
      expect(result.unusedDockerImages[1].size).toBe(500_000_000);
    });
  });

  describe('removeDockerImage', () => {
    it('delegates to docker.removeImage', async () => {
      await service.removeDockerImage('img-2:latest');
      expect(mockDocker.removeImage).toHaveBeenCalledWith('img-2:latest');
    });
  });
});