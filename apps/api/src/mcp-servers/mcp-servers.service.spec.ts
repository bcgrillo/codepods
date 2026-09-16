import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { McpServersService } from './mcp-servers.service';
import { McpServerEntity } from './mcp-server.entity';
import { AgentMcpServerEntity } from './agent-mcp-server.entity';
import { McpCacheBridge } from '../mcp/mcp-cache-bridge';

describe('McpServersService', () => {
  let service: McpServersService;
  const repo = {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    remove: jest.fn(),
  };

  const assignmentRepo = {
    findOne: jest.fn(),
    find: jest.fn(),
    save: jest.fn(),
    delete: jest.fn(),
  };

  const mcpCacheBridge = { invalidate: jest.fn() };

  const server = (over: Partial<McpServerEntity> = {}): McpServerEntity =>
    ({
      id: 1,
      codepodId: 1,
      name: 'GitHub MCP',
      slug: 'github',
      transport: 'http',
      url: 'https://mcp.github.com/mcp',
      credentialId: null,
      enabled: true,
      builtIn: false,
      connectAllAgents: false,
      createdAt: new Date('2024-01-01T00:00:00Z'),
      updatedAt: new Date('2024-01-01T00:00:00Z'),
      ...over,
    }) as unknown as McpServerEntity;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        McpServersService,
        { provide: getRepositoryToken(McpServerEntity), useValue: repo },
        { provide: getRepositoryToken(AgentMcpServerEntity), useValue: assignmentRepo },
        { provide: McpCacheBridge, useValue: mcpCacheBridge },
      ],
    }).compile();
    service = module.get(McpServersService);
  });

  describe('onModuleInit / ensureBuiltIn', () => {
    it('seeds the built-in CodePods server when absent', async () => {
      repo.findOne.mockResolvedValue(null);
      const created = server({ id: 0, name: 'CodePods', slug: 'codepods', builtIn: true, url: null });
      repo.create.mockReturnValue(created);
      repo.save.mockResolvedValue(server({ id: 1, name: 'CodePods', slug: 'codepods', builtIn: true, url: null }));
      await service.onModuleInit();
      expect(repo.save).toHaveBeenCalled();
      const arg = repo.create.mock.calls[0][0];
      expect(arg.builtIn).toBe(true);
      expect(arg.slug).toBe('codepods');
      expect(arg.enabled).toBe(true);
    });

    it('promotes an existing codepods row to builtIn if needed', async () => {
      const existing = server({ slug: 'codepods', builtIn: false, enabled: false });
      repo.findOne.mockResolvedValue(existing);
      await service.onModuleInit();
      expect(existing.builtIn).toBe(true);
      expect(existing.enabled).toBe(true);
      expect(repo.save).toHaveBeenCalledWith(existing);
    });

    it('does nothing when built-in already correct', async () => {
      repo.findOne.mockResolvedValue(server({ slug: 'codepods', builtIn: true, enabled: true }));
      await service.onModuleInit();
      expect(repo.save).not.toHaveBeenCalled();
    });
  });

  describe('create', () => {
    it('creates an http server with a unique slug', async () => {
      repo.findOne.mockResolvedValue(null);
      const created = server({ id: 0, slug: 'github-mcp' });
      repo.create.mockReturnValue(created);
      repo.save.mockResolvedValue(server({ slug: 'github-mcp' }));
      const result = await service.create({ name: 'GitHub MCP', url: 'https://mcp.github.com/mcp' });
      expect(result.slug).toBe('github-mcp');
      expect(result.builtIn).toBe(false);
      expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ transport: 'http', enabled: true }));
    });

    it('rejects stdio transport (not supported yet)', async () => {
      await expect(
        service.create({ name: 'local', transport: 'stdio', url: null }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects http server without url', async () => {
      await expect(
        service.create({ name: 'no url', url: null }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects reserved slug', async () => {
      await expect(
        service.create({ name: 'CodePods', url: 'https://x' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('deduplicates colliding slugs', async () => {
      repo.findOne
        .mockResolvedValueOnce(server({ id: 9, slug: 'github' })) // first collision
        .mockResolvedValueOnce(null); // github-2 free
      const created = server({ id: 0 });
      repo.create.mockReturnValue(created);
      repo.save.mockResolvedValue(server({ slug: 'github-2' }));
      const result = await service.create({ name: 'github', url: 'https://x' });
      expect(result.slug).toBe('github-2');
    });
  });

  describe('update', () => {
    it('updates normal fields', async () => {
      const existing = server();
      repo.findOne.mockResolvedValue(existing);
      repo.save.mockResolvedValue(server({ name: 'renamed', url: 'https://new' }));
      const result = await service.update(1, { name: 'renamed', url: 'https://new' });
      expect(existing.name).toBe('renamed');
      expect(existing.url).toBe('https://new');
      expect(result.name).toBe('renamed');
      expect(mcpCacheBridge.invalidate).toHaveBeenCalledWith(1);
    });

    it('blocks transport/url/slug changes on built-in', async () => {
      const existing = server({ slug: 'codepods', builtIn: true, url: null });
      repo.findOne.mockResolvedValue(existing);
      await expect(service.update(1, { url: 'https://x' })).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.update(1, { transport: 'stdio' })).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.update(1, { slug: 'other' })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('allows toggling enabled on built-in', async () => {
      const existing = server({ slug: 'codepods', builtIn: true, enabled: true });
      repo.findOne.mockResolvedValue(existing);
      repo.save.mockResolvedValue(existing);
      await service.update(1, { enabled: false });
      expect(existing.enabled).toBe(false);
      expect(mcpCacheBridge.invalidate).toHaveBeenCalledWith(1);
    });

    it('allows toggling connectAllAgents on built-in', async () => {
      const existing = server({ slug: 'codepods', builtIn: true, connectAllAgents: true });
      repo.findOne.mockResolvedValue(existing);
      repo.save.mockResolvedValue(existing);
      await service.update(1, { connectAllAgents: false });
      expect(existing.connectAllAgents).toBe(false);
      expect(mcpCacheBridge.invalidate).toHaveBeenCalledWith(1);
    });
  });

  describe('remove', () => {
    it('removes a normal server', async () => {
      const existing = server();
      repo.findOne.mockResolvedValue(existing);
      await service.remove(1);
      expect(repo.remove).toHaveBeenCalledWith(existing);
      expect(mcpCacheBridge.invalidate).toHaveBeenCalledWith(1);
    });

    it('refuses to delete the built-in server', async () => {
      repo.findOne.mockResolvedValue(server({ builtIn: true }));
      await expect(service.remove(1)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws NotFound when missing', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.remove(99)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('toSafe', () => {
    it('maps entity fields to the safe shape', () => {
      const safe = service.toSafe(server());
      expect(safe.slug).toBe('github');
      expect(safe.transport).toBe('http');
      expect(safe.builtIn).toBe(false);
    });
  });
});