import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import * as http from 'node:http';
import * as net from 'node:net';
import * as crypto from 'node:crypto';
import type { Duplex } from 'node:stream';
import { ConfigService } from '../config/config.service';
import { DockerService } from '../docker/docker.service';
import { InternalTokenService } from '../auth/internal-token.service';

/**
 * Egress proxy for agent containers.
 *
 * Serves two functions, both always active regardless of
 * `networkSecurity.filterInternetEgress`:
 *
 *  1. **API gateway** — forwards container→host API requests, injecting
 *     `X-Agent-Id` (from container source IP) and `X-Agent-Sig` (HMAC-SHA256)
 *     so the auth guard can identify the calling agent without any secret
 *     inside the container. This is the core of ADR-036.
 *
 *  2. **Internet filter** — when `filterInternetEgress` is ON, all outbound
 *     internet traffic is checked against the egress whitelist. When OFF,
 *     internet traffic is forwarded without filtering.
 *
 * Two transport modes:
 *  - CONNECT (HTTPS): the agent sends `CONNECT host:443`. We check the host
 *    against the whitelist, then open a raw TCP tunnel to the target and relay
 *    bytes both ways. No TLS inspection (no MITM) — the SNI/host claimed in the
 *    CONNECT line is the policy input. Domain-fronting is mitigated by keeping
 *    the whitelist narrow (specific service domains, not shared CDNs).
 *  - Plain HTTP: the agent sends `GET http://host/path`. We detect API
 *    requests (host.docker.internal:apiPort) and forward with identity headers.
 *    Other hosts go through whitelist (when enabled) or are forwarded directly.
 *
 * The whitelist is read live from ConfigService so settings changes apply
 * without restarting the proxy.
 */
@Injectable()
export class EgressProxyService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EgressProxyService.name);
  private server: http.Server | null = null;

  /** Temporary exceptions: host → { expiresAt (ms), agentId } */
  private readonly tempExceptions = new Map<string, { expiresAt: number; agentId: string }>();

  constructor(
    private readonly configService: ConfigService,
    private readonly dockerService: DockerService,
    private readonly internalTokenService: InternalTokenService,
  ) {}

  onModuleInit(): void {
    // The proxy always starts — it serves as the API gateway (identity
    // injection) regardless of whether internet filtering is enabled.
    const netCfg = this.configService.get('networkSecurity');
    this.start(netCfg.proxyPort);
  }

  onModuleDestroy(): void {
    this.stop();
  }

  private start(port: number): void {
    this.server = http.createServer((req, res) => this.handleRequest(req, res));
    this.server.on('connect', (req, socket, head) => this.handleConnect(req, socket, head));
    this.server.on('error', (err) => this.logger.error(`Proxy server error: ${err.message}`));
    this.server.listen(port, '0.0.0.0', () => {
      this.logger.log(`Egress proxy listening on 0.0.0.0:${port}`);
    });
  }

  private stop(): void {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }

  /** Restarts the proxy so config changes (port) take effect. */
  reload(): void {
    const netCfg = this.configService.get('networkSecurity');
    this.stop();
    // Proxy always starts — API gateway function is always active.
    this.start(netCfg.proxyPort);
  }

  // --- Whitelist ----------------------------------------------------------

  /** Current whitelist entries (trimmed, non-empty). */
  whitelist(): string[] {
    return (this.configService.get('networkSecurity').egressWhitelist ?? [])
      .map((s) => s.trim())
      .filter(Boolean);
  }

  /**
   * Checks whether `host` is allowed.
   * Supports exact matches (`api.anthropic.com`) and wildcard suffixes
   * (`*.npmjs.org` matches `registry.npmjs.org`).
   * Also checks temporary exceptions (time-limited approvals).
   */
  isAllowed(host: string): boolean {
    if (this.hasTempException(host)) return true;
    const lower = host.toLowerCase();
    return this.whitelist().some((entry) => {
      const e = entry.toLowerCase();
      if (e === lower) return true;
      if (e.startsWith('*.')) {
        const base = e.slice(2);
        return lower === base || lower.endsWith('.' + base);
      }
      return false;
    });
  }

  // --- Temporary exceptions ------------------------------------------------

  /** Check if a host has an active (non-expired) temporary exception. */
  private hasTempException(host: string): boolean {
    const lower = host.toLowerCase();
    // Cleanup expired entries lazily
    for (const [key, val] of this.tempExceptions) {
      if (Date.now() >= val.expiresAt) {
        this.tempExceptions.delete(key);
      }
    }
    return this.tempExceptions.has(lower);
  }

  /** Add a temporary exception for a host. Duration in milliseconds. */
  addTempException(host: string, durationMs: number, agentId: string = 'manual'): void {
    const lower = host.toLowerCase();
    const expiresAt = Date.now() + durationMs;
    this.tempExceptions.set(lower, { expiresAt, agentId });
    this.logger.log(`[egress] Temp exception added for "${lower}" (${Math.round(durationMs / 1000)}s) by ${agentId}`);
  }

  /** Remove a temporary exception for a host. */
  removeTempException(host: string): void {
    this.tempExceptions.delete(host.toLowerCase());
  }

  /** List all active temporary exceptions (for debugging/inspection). */
  listTempExceptions(): { host: string; expiresAt: number; agentId: string }[] {
    const now = Date.now();
    for (const [key, val] of this.tempExceptions) {
      if (now >= val.expiresAt) this.tempExceptions.delete(key);
    }
    return [...this.tempExceptions.entries()].map(([host, val]) => ({ host, ...val }));
  }

  // --- CONNECT (HTTPS tunneling) ------------------------------------------

  handleConnect(req: http.IncomingMessage, socket: Duplex, head: Buffer): void {
    const target = req.url ?? '';
    const idx = target.lastIndexOf(':');
    const host = idx > 0 ? target.slice(0, idx) : target;
    const port = idx > 0 ? Number(target.slice(idx + 1)) : 443;

    const filterEnabled = this.configService.get('networkSecurity').filterInternetEgress;
    if (filterEnabled && !this.isAllowed(host)) {
      this.logger.warn(`[egress] DENY CONNECT ${target}`);
      const reason = `Forbidden - Codepods egress: "${host}" is not in the whitelist. Ask your administrator to add it if it is safe.`;
      socket.write(`HTTP/1.1 403 ${reason}\r\nX-Codepods-Egress: denied; host=${host}\r\n\r\n`);
      socket.destroy();
      return;
    }

    this.logger.log(`[egress] ALLOW CONNECT ${target}`);
    const upstream = net.connect(port, host);
    upstream.on('connect', () => {
      socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head.length > 0) upstream.write(head);
      socket.pipe(upstream);
      upstream.pipe(socket);
    });
    upstream.on('error', (err) => {
      this.logger.warn(`[egress] upstream error for ${target}: ${err.message}`);
      if (!socket.destroyed) {
        socket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
        socket.destroy();
      }
    });
    socket.on('error', () => upstream.destroy());
  }

  // --- API forwarding (agent identity injection) -----------------------------

  /**
   * Checks whether a request targets the host API (host.docker.internal:apiPort
   * or 127.0.0.1:apiPort). These requests are forwarded with agent identity
   * headers — no whitelist check.
   */
  private isApiTarget(url: URL): boolean {
    const apiPort = String(this.configService.get('port'));
    const host = url.hostname;
    const port = url.port || '80';
    return (
      (host === 'host.docker.internal' || host === '127.0.0.1' || host === 'localhost') &&
      port === apiPort
    );
  }

  /**
   * Computes the HMAC-SHA256 signature of `agentId` using the internal token
   * as the shared secret. The auth guard verifies this to detect bugs in the
   * source IP check (defense in depth — see ADR-036).
   */
  private signAgentId(agentId: string): string {
    const secret = this.internalTokenService.getToken();
    return crypto.createHmac('sha256', secret).update(agentId).digest('hex');
  }

  /**
   * Forwards an API request from an agent container to the host API, injecting
   * X-Agent-Id and X-Agent-Sig headers based on the container's source IP.
   * The request is sent to 127.0.0.1:<apiPort> (same process, different server).
   */
  private async forwardApiRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    url: URL,
  ): Promise<void> {
    const apiPort = this.configService.get('port');
    const sourceIp = req.socket.remoteAddress?.replace(/^::ffff:/, '') ?? '';
    const agentId = this.dockerService.getAgentIdByIp(sourceIp);

    if (!agentId) {
      this.logger.warn(`[egress] API request from unknown IP ${sourceIp} — denying`);
      res.writeHead(403, { 'Content-Type': 'text/plain' }).end(
        'Codepods egress: could not identify agent for this request.',
      );
      return;
    }

    const signature = this.signAgentId(agentId);
    const targetUrl = `http://127.0.0.1:${apiPort}${url.pathname}${url.search}`;

    this.logger.debug(`[egress] API forward ${req.method} ${url.pathname} (agent: ${agentId})`);

    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const body = Buffer.concat(chunks);

    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(req.headers)) {
      const lower = k.toLowerCase();
      if (lower === 'host' || lower === 'connection' || lower === 'proxy-connection') continue;
      if (lower === 'x-agent-id' || lower === 'x-agent-sig' || lower === 'x-internal-token') continue;
      if (v != null) headers[k] = Array.isArray(v) ? v.join(', ') : String(v);
    }
    headers['host'] = `127.0.0.1:${apiPort}`;
    headers['x-agent-id'] = agentId;
    headers['x-agent-sig'] = signature;

    let upstream: Response;
    try {
      upstream = await fetch(targetUrl, {
        method: req.method ?? 'GET',
        headers,
        body: body.length > 0 ? body : undefined,
        redirect: 'manual',
      });
    } catch (err) {
      this.logger.warn(`[egress] API forward error: ${(err as Error).message}`);
      res.writeHead(502).end('Upstream error');
      return;
    }

    const outHeaders: Record<string, string> = {};
    upstream.headers.forEach((value, key) => {
      if (key.toLowerCase() === 'transfer-encoding') return;
      outHeaders[key] = value;
    });
    res.writeHead(upstream.status, outHeaders);
    if (upstream.body) {
      const { Readable } = await import('node:stream');
      const nodeStream = Readable.fromWeb(upstream.body as unknown as import('stream/web').ReadableStream<Uint8Array>);
      nodeStream.on('data', (c: Buffer) => res.write(c));
      nodeStream.on('end', () => res.end());
      nodeStream.on('error', () => res.end());
    } else {
      res.end();
    }
  }

  // --- Plain HTTP ----------------------------------------------------------

  async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    let url: URL;
    try {
      url = new URL(req.url ?? '');
    } catch {
      res.writeHead(400).end('Bad proxy request');
      return;
    }

    // API requests → forward with agent identity (no whitelist check).
    if (this.isApiTarget(url)) {
      return this.forwardApiRequest(req, res, url);
    }

    // Internet traffic — check whitelist only when filtering is enabled.
    const filterEnabled = this.configService.get('networkSecurity').filterInternetEgress;
    if (filterEnabled && !this.isAllowed(url.hostname)) {
      this.logger.warn(`[egress] DENY ${req.method} ${url.hostname}`);
      res.writeHead(403, { 'Content-Type': 'text/plain', 'X-Codepods-Egress': `denied; host=${url.hostname}` });
      res.end(`Codepods egress: "${url.hostname}" is not in the whitelist. Ask your administrator to add it if it is safe.`);
      return;
    }

    this.logger.log(`[egress] ALLOW ${req.method} ${url.hostname}`);
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const body = Buffer.concat(chunks);

    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(req.headers)) {
      const lower = k.toLowerCase();
      if (lower === 'host' || lower === 'connection' || lower === 'proxy-connection') continue;
      if (v != null) headers[k] = Array.isArray(v) ? v.join(', ') : String(v);
    }
    headers['host'] = url.host;

    let upstream: Response;
    try {
      upstream = await fetch(url.toString(), {
        method: req.method ?? 'GET',
        headers,
        body: body.length > 0 ? body : undefined,
        redirect: 'manual',
      });
    } catch (err) {
      this.logger.warn(`[egress] upstream error for ${url.hostname}: ${(err as Error).message}`);
      res.writeHead(502).end('Upstream error');
      return;
    }

    const outHeaders: Record<string, string> = {};
    upstream.headers.forEach((value, key) => {
      if (key.toLowerCase() === 'transfer-encoding') return;
      outHeaders[key] = value;
    });
    res.writeHead(upstream.status, outHeaders);
    if (upstream.body) {
      const { Readable } = await import('node:stream');
      const nodeStream = Readable.fromWeb(upstream.body as unknown as import('stream/web').ReadableStream<Uint8Array>);
      nodeStream.on('data', (c: Buffer) => res.write(c));
      nodeStream.on('end', () => res.end());
      nodeStream.on('error', () => res.end());
    } else {
      res.end();
    }
  }
}