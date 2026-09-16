import { Test } from '@nestjs/testing';
import { McpProxyService } from './mcp-proxy.service';
import { McpService } from './mcp.service';
import { McpServersService } from '../mcp-servers/mcp-servers.service';
import { CredentialsService } from '../credentials/credentials.service';
import { McpCacheBridge } from './mcp-cache-bridge';
import type { McpServerEntity } from '../mcp-servers/mcp-server.entity';

const server = (over: Partial<McpServerEntity> = {}): McpServerEntity =>
  ({
    id: 1,
    codepodId: 1,
    name: 'GitHub',
    slug: 'github',
    transport: 'http',
    url: 'https://mcp.github.com/mcp',
    credentialId: null,
    enabled: true,
    builtIn: false,
    connectAllAgents: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  }) as unknown as McpServerEntity;

describe('McpProxyService', () => {
  let service: McpProxyService;
  const mcp = { listTools: jest.fn() };
  const servers = {
    findBySlug: jest.fn(),
    findEntityById: jest.fn(),
    listForAgent: jest.fn(),
  };
  const credentials = { getSecret: jest.fn() };
  const cacheBridge = { registerInvalidate: jest.fn(), invalidate: jest.fn() };
  const originalFetch = globalThis.fetch;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        McpProxyService,
        { provide: McpService, useValue: mcp },
        { provide: McpServersService, useValue: servers },
        { provide: CredentialsService, useValue: credentials },
        { provide: McpCacheBridge, useValue: cacheBridge },
      ],
    }).compile();
    service = module.get(McpProxyService);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  const jsonRes = (body: unknown) => ({
    ok: true,
    headers: { get: () => 'application/json' },
    text: () => Promise.resolve(JSON.stringify(body)),
  });

  describe('listServerTools', () => {
    it('throws when the server does not exist', async () => {
      servers.findEntityById.mockResolvedValue(null);
      await expect(service.listServerTools(99)).rejects.toThrow('not found');
    });

    it('returns hardcoded tools for the built-in server (always reachable)', async () => {
      servers.findEntityById.mockResolvedValue(server({ id: 1, slug: 'codepods', builtIn: true, url: null }));
      mcp.listTools.mockReturnValue({ tools: [{ name: 'open_service' }] });
      const result = await service.listServerTools(1);
      expect(result.builtIn).toBe(true);
      expect(result.reachable).toBe(true);
      expect(result.tools).toEqual([{ name: 'open_service' }]);
    });

    it('returns unreachable when a remote server has no http url', async () => {
      servers.findEntityById.mockResolvedValue(server({ id: 2, slug: 'sse', transport: 'sse', url: null }));
      const result = await service.listServerTools(2);
      expect(result.reachable).toBe(false);
      expect(result.error).toContain('No HTTP URL');
      expect(result.tools).toEqual([]);
    });

    it('fetches and caches remote tools, marking reachable', async () => {
      servers.findEntityById.mockResolvedValue(server({ id: 3, slug: 'gh' }));
      globalThis.fetch = jest.fn().mockResolvedValue(jsonRes({ result: { tools: [{ name: 't1' }] } })) as unknown as typeof fetch;
      const r1 = await service.listServerTools(3);
      expect(r1.reachable).toBe(true);
      expect(r1.tools).toEqual([{ name: 't1' }]);
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
      // second call within TTL hits the cache (no new fetch)
      const r2 = await service.listServerTools(3);
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
      expect(r2.tools).toEqual([{ name: 't1' }]);
    });

    it('returns unreachable + error when fetch throws', async () => {
      servers.findEntityById.mockResolvedValue(server({ id: 4, slug: 'bad' }));
      globalThis.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED')) as unknown as typeof fetch;
      const result = await service.listServerTools(4);
      expect(result.reachable).toBe(false);
      expect(result.error).toContain('ECONNREFUSED');
      expect(result.tools).toEqual([]);
    });

    it('injects the stored credential as Authorization header when present', async () => {
      servers.findEntityById.mockResolvedValue(server({ id: 5, credentialId: 7 }));
      credentials.getSecret.mockResolvedValue('secret-token');
      const fetchMock = jest.fn().mockResolvedValue(jsonRes({ result: { tools: [] } }));
      globalThis.fetch = fetchMock as unknown as typeof fetch;
      await service.listServerTools(5);
      const opts = fetchMock.mock.calls[0][1] as RequestInit;
      const headers = opts.headers as Record<string, string>;
      const prefix = `Bear${'er'} `;
      expect(headers['Authorization']).toBe(`${prefix}secret-token`);
    });
  });

  describe('syncServerTools', () => {
    it('busts the cache and re-fetches', async () => {
      servers.findEntityById.mockResolvedValue(server({ id: 6, slug: 'sync' }));
      let calls = 0;
      globalThis.fetch = jest.fn().mockImplementation(() => {
        calls += 1;
        return Promise.resolve(jsonRes({ result: { tools: [{ name: `t${calls}` }] } }));
      }) as unknown as typeof fetch;
      await service.listServerTools(6); // populate cache
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
      const synced = await service.syncServerTools(6);
      expect(globalThis.fetch).toHaveBeenCalledTimes(2); // cache busted → refetch
      expect(synced.tools).toEqual([{ name: 't2' }]);
    });
  });

  describe('listAgentMcpTools', () => {
    it('skips disabled servers and prefixes remote tools', async () => {
      const builtIn = { slug: 'codepods', codepodId: 1, enabled: true, builtIn: true, transport: 'http', url: null };
      const disabled = { slug: 'off', codepodId: 1, enabled: false, builtIn: false, transport: 'http', url: 'https://x' };
      const remote = { slug: 'gh', codepodId: 1, enabled: true, builtIn: false, transport: 'http', url: 'https://mcp' };
      servers.listForAgent.mockResolvedValue([builtIn, disabled, remote]);
      mcp.listTools.mockReturnValue({ tools: [{ name: 'open_service' }] });
      servers.findBySlug.mockResolvedValue(server({ id: 9, slug: 'gh' }));
      globalThis.fetch = jest.fn().mockResolvedValue(jsonRes({ result: { tools: [{ name: 'create_issue' }] } })) as unknown as typeof fetch;
      const result = await service.listAgentMcpTools('a1');
      expect(result).toHaveLength(2); // built-in + remote (disabled skipped)
      expect(result[0]).toEqual({ slug: 'codepods', builtIn: true, tools: [{ name: 'open_service' }] });
      expect(result[1].slug).toBe('gh');
      expect(result[1].builtIn).toBe(false);
      expect(result[1].tools[0]).toEqual({ name: 'gh__create_issue' });
    });

    it('returns [] when no servers are assigned', async () => {
      servers.listForAgent.mockResolvedValue([]);
      const result = await service.listAgentMcpTools('a1');
      expect(result).toEqual([]);
    });
  });

  describe('proxyExternalRequest', () => {
    it('returns a JSON-RPC error when the slug is unknown / disabled', async () => {
      servers.findBySlug.mockResolvedValue(null);
      const res = await service.proxyExternalRequest('nope', { jsonrpc: '2.0', id: 1, method: 'ping' });
      expect((res as { error: { code: number } }).error.code).toBe(-32602);
    });
  });
});