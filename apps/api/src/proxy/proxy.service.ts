import { Injectable, NotFoundException } from '@nestjs/common';
import httpProxy = require('http-proxy');
import type { Request, Response, NextFunction } from 'express';
import type { Socket } from 'net';
import { AgentsService } from '../agents/agents.service';
import { DockerService } from '../docker/docker.service';

export interface ProxyTarget {
  targetUrl: string;
  agentId: string;
  serviceId: number;
}

@Injectable()
export class ProxyService {
  private readonly proxy: httpProxy = httpProxy.createProxyServer({
    changeOrigin: true,
    secure: false,
    followRedirects: false,
  });

  constructor(
    private readonly agentsService: AgentsService,
    private readonly docker: DockerService,
  ) {
    // When the upstream sends an SSE response, modify the upstream headers
    // so http-proxy propagates them correctly (don't touch res directly —
    // calling res.flushHeaders() prematurely breaks http-proxy's internal
    // writeHead call, which causes the browser to see a TypeError).
    this.proxy.on('proxyRes', ((proxyRes: import('http').IncomingMessage) => {
      const contentType = proxyRes.headers['content-type'] ?? '';
      if (contentType.includes('text/event-stream')) {
        // Disable buffering so SSE chunks are flushed immediately.
        proxyRes.headers['x-accel-buffering'] = 'no';
        proxyRes.headers['cache-control'] = 'no-cache';
        proxyRes.headers['connection'] = 'keep-alive';
        // Remove Content-Length so the client expects chunked/streaming data.
        delete proxyRes.headers['content-length'];
      }
    }) as (...args: unknown[]) => void);

    this.proxy.on(
      'error',
      ((err: Error, req: Request, res: Response | Socket) => {
        if (res && typeof (res as Response).status === 'function' && !(res as Response).headersSent) {
          (res as Response).status(502).json({ message: `Proxy error: ${err.message}` });
        } else if (res && typeof (res as Socket).destroy === 'function') {
          (res as Socket).destroy();
        }
      }) as (...args: unknown[]) => void,
    );
  }

  async resolve(agentName: string, serviceName: string): Promise<ProxyTarget> {
    const agent = await this.agentsService.findByName(agentName);
    if (!agent) {
      throw new NotFoundException(`Agent "${agentName}" not found`);
    }

    const service = await this.agentsService.findServiceByName(agent.id, serviceName);
    if (!service) {
      throw new NotFoundException(`Service "${serviceName}" not found for agent "${agentName}"`);
    }

    const containerIp = await this.docker.getContainerInternalIp(agent.containerId);
    if (!containerIp) {
      throw new NotFoundException(`Agent "${agentName}" is not running or has no internal IP`);
    }

    return {
      targetUrl: `http://${containerIp}:${service.port}`,
      agentId: agent.id,
      serviceId: service.id,
    };
  }

  async proxyRequest(req: Request, res: Response, next: NextFunction): Promise<void> {
    const target = await this.resolveFromRequest(req);
    this.rewriteProxyPath(req, target);
    this.setCodepodsHeaders(req, target);

    // Disable timeouts for proxied requests so long-lived connections
    // (SSE, WebSocket-upgrade-over-HTTP, large uploads) are not killed.
    req.setTimeout(0);
    res.setTimeout(0);

    // Detect SSE requests to apply streaming-friendly settings.
    const isSse = req.headers['accept']?.includes('text/event-stream');
    if (isSse) {
      // Disable Nagle's algorithm for lower latency on small SSE chunks.
      req.socket.setNoDelay(true);
    }

    this.proxy.web(req, res, { target: target.targetUrl, changeOrigin: true }, next);
  }

  async proxyUpgrade(req: Request, socket: Socket, head: Buffer): Promise<void> {
    const target = await this.resolveFromRequest(req);
    this.rewriteProxyPath(req, target);
    this.setCodepodsHeaders(req, target);
    this.proxy.ws(req, socket, head, { target: target.targetUrl, changeOrigin: true });
  }

  private async resolveFromRequest(req: Request): Promise<ProxyTarget> {
    const params = this.extractProxyParams(req.url);
    if (!params.agentName || !params.serviceName) {
      throw new NotFoundException('Proxy route must be /api/proxy/:agentName/:serviceName');
    }
    // Make params available to the rest of the pipeline even on raw upgrade requests.
    req.params = { ...req.params, ...params };
    return this.resolve(params.agentName, params.serviceName);
  }

  private extractProxyParams(
    url: string | undefined,
  ): { agentName?: string; serviceName?: string } {
    if (!url) return {};
    const parts = url.split('?')[0]?.split('/') ?? [];
    // Expected path: ['', 'api', 'proxy', ':agentName', ':serviceName', ...]
    return {
      agentName: parts[3] ? decodeURIComponent(parts[3]) : undefined,
      serviceName: parts[4] ? decodeURIComponent(parts[4]) : undefined,
    };
  }

  private rewriteProxyPath(req: Request, _target: ProxyTarget): void {
    const { agentName, serviceName } = this.extractProxyParams(req.url);
    const prefix = `/api/proxy/${encodeURIComponent(agentName ?? '')}/${encodeURIComponent(serviceName ?? '')}`;
    if (agentName && serviceName && req.url?.startsWith(prefix)) {
      req.url = req.url.slice(prefix.length) || '/';
    }
  }

  private setCodepodsHeaders(req: Request, target: ProxyTarget): void {
    const targetUrl = new URL(target.targetUrl);
    req.headers['host'] = targetUrl.host;
    req.headers['x-codepods-agent-id'] = target.agentId;
    req.headers['x-codepods-service-id'] = String(target.serviceId);
  }
}
