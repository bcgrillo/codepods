import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { McpService } from './mcp.service';
import { AgentsService } from '../agents/agents.service';
import { ConfigService } from '../config/config.service';
import { ManagedApisService } from '../managed-apis/managed-apis.service';
import { AgentRequestsService } from '../agents/agent-requests.service';

describe('McpService', () => {
  let service: McpService;
  const agents = {
    findOne: jest.fn(),
    createService: jest.fn(),
    findServiceByName: jest.fn(),
    removeService: jest.fn(),
  };
  const config = { get: jest.fn().mockReturnValue('http://localhost:3000') };
  const managedApis = {
    listAvailable: jest.fn().mockResolvedValue([]),
    callApi: jest.fn(),
  };
  const agentRequests = {
    create: jest.fn(),
    getStatus: jest.fn(),
    waitForResolution: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        McpService,
        { provide: AgentsService, useValue: agents },
        { provide: ConfigService, useValue: config },
        { provide: ManagedApisService, useValue: managedApis },
        { provide: AgentRequestsService, useValue: agentRequests },
      ],
    }).compile();
    service = module.get(McpService);
  });

  describe('getServerInfo', () => {
    it('returns protocol version, capabilities and server info', () => {
      const info = service.getServerInfo();
      expect(info.protocolVersion).toBe('2024-11-05');
      expect(info.capabilities).toEqual({ tools: {} });
      expect(info.serverInfo.name).toBe('codepods-mcp');
    });
  });

  describe('listTools', () => {
    it('exposes open_service and close_service with input schemas', () => {
      const { tools } = service.listTools();
      const names = tools.map((t) => t.name);
      expect(names).toEqual(['open_service', 'close_service', 'get_available_apis', 'call_api_with_credentials', 'request_access', 'check_request']);
      const open = tools[0];
      expect(open.inputSchema.required).toEqual(['name', 'port']);
      const close = tools[1];
      expect(close.inputSchema.required).toEqual(['name']);
    });
  });

  describe('callTool', () => {
    it('returns an error for unknown tools', async () => {
      const res = await service.callTool('nope', {}, 'a1');
      expect(res.isError).toBe(true);
      expect(res.content[0].text).toContain('Unknown tool: nope');
    });

    describe('open_service', () => {
      it('validates required name + port', async () => {
        const res = await service.callTool('open_service', { name: 'x' }, 'a1');
        expect(res.isError).toBe(true);
        expect(res.content[0].text).toContain('Missing required parameters');
      });

      it('errors when the agent is not found', async () => {
        agents.findOne.mockResolvedValue(null);
        const res = await service.callTool('open_service', { name: 'svc', port: 8080 }, 'a1');
        expect(res.isError).toBe(true);
        expect(res.content[0].text).toContain('not found');
      });

      it('creates the service and returns internal + public URLs', async () => {
        agents.findOne.mockResolvedValue({ id: 'a1', name: 'my-agent' });
        agents.createService.mockResolvedValue({ id: 1, name: 'svc', port: 8080, type: 'web' });
        const res = await service.callTool(
          'open_service',
          { name: 'svc', port: 8080, type: 'web' },
          'a1',
        );
        expect(res.isError).toBeUndefined();
        const text = res.content[0].text;
        expect(text).toContain('Internal URL');
        expect(text).toContain('http://host.docker.internal:3000/api/proxy/my-agent/svc/');
        expect(text).toContain('http://localhost:3000/api/proxy/my-agent/svc/');
        expect(agents.createService).toHaveBeenCalledWith('a1', { name: 'svc', port: 8080, type: 'web' });
      });

      it('defaults type to web when omitted', async () => {
        agents.findOne.mockResolvedValue({ id: 'a1', name: 'my-agent' });
        agents.createService.mockResolvedValue({ id: 1, name: 'svc', port: 3000, type: 'web' });
        await service.callTool('open_service', { name: 'svc', port: 3000 }, 'a1');
        expect(agents.createService).toHaveBeenCalledWith('a1', { name: 'svc', port: 3000, type: 'web' });
      });

      it('returns an error when createService throws', async () => {
        agents.findOne.mockResolvedValue({ id: 'a1', name: 'my-agent' });
        agents.createService.mockRejectedValue(new Error('port in use'));
        const res = await service.callTool('open_service', { name: 'svc', port: 8080 }, 'a1');
        expect(res.isError).toBe(true);
        expect(res.content[0].text).toContain('Failed to open service: port in use');
      });
    });

    describe('close_service', () => {
      it('validates required name', async () => {
        const res = await service.callTool('close_service', {}, 'a1');
        expect(res.isError).toBe(true);
        expect(res.content[0].text).toContain('Missing required parameter: name');
      });

      it('errors when the agent is not found', async () => {
        agents.findOne.mockResolvedValue(null);
        const res = await service.callTool('close_service', { name: 'svc' }, 'a1');
        expect(res.isError).toBe(true);
        expect(res.content[0].text).toContain('not found');
      });

      it('returns an error when the service does not exist', async () => {
        agents.findOne.mockResolvedValue({ id: 'a1', name: 'my-agent' });
        agents.findServiceByName.mockResolvedValue(null);
        const res = await service.callTool('close_service', { name: 'nope' }, 'a1');
        expect(res.isError).toBe(true);
        expect(res.content[0].text).toContain('Failed to close service');
        // NotFoundException message surfaces in the wrapped error text
        expect(agents.removeService).not.toHaveBeenCalled();
      });

      it('removes the service and confirms closure', async () => {
        agents.findOne.mockResolvedValue({ id: 'a1', name: 'my-agent' });
        agents.findServiceByName.mockResolvedValue({ id: 9, name: 'svc' });
        agents.removeService.mockResolvedValue(undefined);
        const res = await service.callTool('close_service', { name: 'svc' }, 'a1');
        expect(res.isError).toBeUndefined();
        expect(res.content[0].text).toBe('Service "svc" closed.');
        expect(agents.removeService).toHaveBeenCalledWith('a1', 9);
      });

      it('wraps a thrown NotFoundException as a friendly error', async () => {
        agents.findOne.mockResolvedValue({ id: 'a1', name: 'my-agent' });
        agents.findServiceByName.mockResolvedValue({ id: 9, name: 'svc' });
        agents.removeService.mockRejectedValue(new NotFoundException('gone'));
        const res = await service.callTool('close_service', { name: 'svc' }, 'a1');
        expect(res.isError).toBe(true);
        expect(res.content[0].text).toContain('Failed to close service: gone');
      });
    });

    describe('request_access', () => {
      it('validates required url', async () => {
        const res = await service.callTool('request_access', {}, 'a1');
        expect(res.isError).toBe(true);
        expect(res.content[0].text).toContain('Missing required parameter: url');
      });

      it('rejects an invalid URL', async () => {
        const res = await service.callTool('request_access', { url: 'not-a-url' }, 'a1');
        expect(res.isError).toBe(true);
        expect(res.content[0].text).toContain('Invalid URL');
      });

      it('errors when the agent is not found', async () => {
        agents.findOne.mockResolvedValue(null);
        const res = await service.callTool('request_access', { url: 'https://example.com' }, 'a1');
        expect(res.isError).toBe(true);
        expect(res.content[0].text).toContain('not found');
      });

      it('returns approved message when user approves', async () => {
        agents.findOne.mockResolvedValue({ id: 'a1', name: 'my-agent' });
        agentRequests.create.mockResolvedValue({ id: 42 });
        agentRequests.waitForResolution.mockResolvedValue('approved');
        const res = await service.callTool(
          'request_access',
          { url: 'https://example.com/api', reason: 'need to fetch data' },
          'a1',
        );
        expect(res.isError).toBeUndefined();
        expect(res.content[0].text).toContain('approved');
        expect(res.content[0].text).toContain('request #42');
        expect(res.content[0].text).toContain('https://example.com/api');
        expect(agentRequests.create).toHaveBeenCalledWith(
          'a1',
          'whitelist',
          { url: 'https://example.com/api', host: 'example.com', duration: undefined },
          'need to fetch data',
        );
      });

      it('returns rejected error when user rejects', async () => {
        agents.findOne.mockResolvedValue({ id: 'a1', name: 'my-agent' });
        agentRequests.create.mockResolvedValue({ id: 42 });
        agentRequests.waitForResolution.mockResolvedValue('rejected');
        const res = await service.callTool('request_access', { url: 'https://example.com' }, 'a1');
        expect(res.isError).toBe(true);
        expect(res.content[0].text).toContain('rejected');
      });

      it('returns pending message when timeout expires', async () => {
        agents.findOne.mockResolvedValue({ id: 'a1', name: 'my-agent' });
        agentRequests.create.mockResolvedValue({ id: 42 });
        agentRequests.waitForResolution.mockResolvedValue('pending');
        const res = await service.callTool('request_access', { url: 'https://example.com' }, 'a1');
        expect(res.isError).toBeUndefined();
        expect(res.content[0].text).toContain('still pending');
        expect(res.content[0].text).toContain('check_request');
      });

      it('uses default reason when none provided', async () => {
        agents.findOne.mockResolvedValue({ id: 'a1', name: 'my-agent' });
        agentRequests.create.mockResolvedValue({ id: 42 });
        agentRequests.waitForResolution.mockResolvedValue('approved');
        await service.callTool('request_access', { url: 'https://example.com' }, 'a1');
        expect(agentRequests.create).toHaveBeenCalledWith(
          'a1',
          'whitelist',
          { url: 'https://example.com', host: 'example.com', duration: undefined },
          'Agent needs access to example.com',
        );
      });
    });

    describe('check_request', () => {
      it('validates required requestId', async () => {
        const res = await service.callTool('check_request', {}, 'a1');
        expect(res.isError).toBe(true);
        expect(res.content[0].text).toContain('Missing required parameter: requestId');
      });

      it('returns the request status', async () => {
        agentRequests.getStatus.mockResolvedValue({ id: 42, status: 'approved', expiresAt: null });
        const res = await service.callTool('check_request', { requestId: 42 }, 'a1');
        expect(res.isError).toBeUndefined();
        expect(res.content[0].text).toContain('Request #42');
        expect(res.content[0].text).toContain('approved');
        expect(res.content[0].text).toContain('retry your request');
        expect(agentRequests.getStatus).toHaveBeenCalledWith('a1', 42);
      });

      it('includes expiration when present', async () => {
        agentRequests.getStatus.mockResolvedValue({ id: 42, status: 'approved', expiresAt: '2026-01-01T00:00:00Z' });
        const res = await service.callTool('check_request', { requestId: 42 }, 'a1');
        expect(res.content[0].text).toContain('expires at 2026-01-01T00:00:00Z');
      });

      it('returns error on failure', async () => {
        agentRequests.getStatus.mockRejectedValue(new Error('not found'));
        const res = await service.callTool('check_request', { requestId: 99 }, 'a1');
        expect(res.isError).toBe(true);
        expect(res.content[0].text).toContain('Failed to check request: not found');
      });
    });
  });
});