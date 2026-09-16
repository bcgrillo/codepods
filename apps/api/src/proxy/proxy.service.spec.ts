/* eslint-disable @typescript-eslint/no-explicit-any */
import { EventEmitter } from 'events';
import { NotFoundException } from '@nestjs/common';
import { ProxyService } from './proxy.service';
import { AgentsService } from '../agents/agents.service';
import { DockerService } from '../docker/docker.service';

jest.mock('http-proxy', () => ({
  createProxyServer: jest.fn(() => {
    const emitter: any = new EventEmitter();
    emitter.web = jest.fn();
    emitter.ws = jest.fn();
    return emitter;
  }),
}));

describe('ProxyService', () => {
  let service: ProxyService;
  let agents: { findByName: jest.Mock; findServiceByName: jest.Mock };
  let docker: { getContainerInternalIp: jest.Mock };

  beforeEach(() => {
    agents = { findByName: jest.fn(), findServiceByName: jest.fn() };
    docker = { getContainerInternalIp: jest.fn() };
    service = new ProxyService(agents as unknown as AgentsService, docker as unknown as DockerService);
  });

  it('resolve returns target URL from agent + service + container IP', async () => {
    agents.findByName.mockResolvedValue({ id: 'a1', containerId: 'c1' });
    agents.findServiceByName.mockResolvedValue({ id: 7, port: 7681 });
    docker.getContainerInternalIp.mockResolvedValue('172.17.0.2');

    const target = await service.resolve('my-agent', 'ttyd');
    expect(target).toEqual({
      targetUrl: 'http://172.17.0.2:7681',
      agentId: 'a1',
      serviceId: 7,
    });
  });

  it('resolve throws NotFound when agent missing', async () => {
    agents.findByName.mockResolvedValue(null);
    await expect(service.resolve('nope', 'ttyd')).rejects.toThrow(NotFoundException);
  });

  it('resolve throws NotFound when service missing', async () => {
    agents.findByName.mockResolvedValue({ id: 'a1', containerId: 'c1' });
    agents.findServiceByName.mockResolvedValue(null);
    await expect(service.resolve('my-agent', 'nope')).rejects.toThrow(NotFoundException);
  });

  it('resolve throws NotFound when container has no internal IP', async () => {
    agents.findByName.mockResolvedValue({ id: 'a1', containerId: 'c1' });
    agents.findServiceByName.mockResolvedValue({ id: 7, port: 7681 });
    docker.getContainerInternalIp.mockResolvedValue(null);
    await expect(service.resolve('my-agent', 'ttyd')).rejects.toThrow(NotFoundException);
  });

  it('proxyRequest rewrites path and forwards to target', async () => {
    agents.findByName.mockResolvedValue({ id: 'a1', containerId: 'c1' });
    agents.findServiceByName.mockResolvedValue({ id: 7, port: 7681 });
    docker.getContainerInternalIp.mockResolvedValue('172.17.0.2');

    const req = {
      url: '/api/proxy/my-agent/ttyd/some/path',
      headers: { accept: 'text/html' },
      setTimeout: jest.fn(),
      socket: { setNoDelay: jest.fn() },
    } as any;
    const res = { setTimeout: jest.fn() } as any;
    const next = jest.fn();

    await service.proxyRequest(req, res, next);

    expect(req.url).toBe('/some/path');
    expect(req.headers['x-codepods-agent-id']).toBe('a1');
    expect(req.headers['x-codepods-service-id']).toBe('7');
    expect(req.setTimeout).toHaveBeenCalledWith(0);
    expect(res.setTimeout).toHaveBeenCalledWith(0);
    expect((service as any).proxy.web).toHaveBeenCalledWith(
      req,
      res,
      { target: 'http://172.17.0.2:7681', changeOrigin: true },
      next,
    );
  });

  it('proxyRequest enables no-delay for SSE requests', async () => {
    agents.findByName.mockResolvedValue({ id: 'a1', containerId: 'c1' });
    agents.findServiceByName.mockResolvedValue({ id: 7, port: 7681 });
    docker.getContainerInternalIp.mockResolvedValue('172.17.0.2');

    const req = {
      url: '/api/proxy/my-agent/ttyd/stream',
      headers: { accept: 'text/event-stream' },
      setTimeout: jest.fn(),
      socket: { setNoDelay: jest.fn() },
    } as any;
    const res = { setTimeout: jest.fn() } as any;

    await service.proxyRequest(req, res, jest.fn());
    expect(req.socket.setNoDelay).toHaveBeenCalledWith(true);
  });

  it('proxyRequest throws NotFound for malformed route', async () => {
    const req = { url: '/api/proxy/only-agent', headers: {}, setTimeout: jest.fn(), socket: {} } as any;
    await expect(service.proxyRequest(req, {} as any, jest.fn())).rejects.toThrow(NotFoundException);
  });
});
