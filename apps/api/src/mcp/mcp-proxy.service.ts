import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { McpService } from './mcp.service';
import { McpServersService } from '../mcp-servers/mcp-servers.service';
import { CredentialsService } from '../credentials/credentials.service';
import { McpCacheBridge } from './mcp-cache-bridge';
import type { McpToolResult } from './mcp.service';
import type { McpServerEntity } from '../mcp-servers/mcp-server.entity';

const TOOL_SEP = '__';
const REMOTE_TOOLS_TTL_MS = 60_000;

interface CachedTools {
  tools: unknown[];
  fetchedAt: number;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id?: string | number | null;
  result?: { tools?: unknown[] } | McpToolResult;
  error?: { code: number; message: string; data?: unknown };
}

/**
 * Per-slug MCP proxy.
 *
 * Each MCP server is exposed to agents at `http://host.docker.internal:3000/api/mcp/<slug>`.
 * The built-in `codepods` server is handled locally by {@link McpService}; every other
 * (remote, http) server is a transparent JSON-RPC pass-through: CodePods forwards the
 * request body to the server's real URL, injecting its stored credential, and returns
 * the response. The agent never learns the real URL or credential.
 *
 * `listAgentMcpTools` powers the CodePods UI ("view an agent → see its MCP tools") and
 * caches remote tool lists per server for {@link REMOTE_TOOLS_TTL_MS}.
 */
@Injectable()
export class McpProxyService implements OnModuleInit {
  private readonly logger = new Logger(McpProxyService.name);
  private readonly cache = new Map<number, CachedTools>();

  constructor(
    private readonly mcp: McpService,
    private readonly servers: McpServersService,
    private readonly credentials: CredentialsService,
    private readonly cacheBridge: McpCacheBridge,
  ) {}

  onModuleInit(): void {
    this.cacheBridge.registerInvalidate((serverId: number) => this.invalidate(serverId));
  }

  /** Invalidate cached tool list for a server (call after create/update/delete). */
  invalidate(serverId: number): void {
    this.cache.delete(serverId);
  }

  // ---- External MCP pass-through ----------------------------------------

  /**
   * Forward a raw JSON-RPC request (single object or batch array) to the remote
   * MCP server identified by `slug`, injecting its stored credential. Returns the
   * parsed JSON-RPC response, or `null` for notifications (no id).
   */
  async proxyExternalRequest(
    slug: string,
    body: unknown,
    codepodId = 1,
  ): Promise<JsonRpcResponse | JsonRpcResponse[] | null> {
    const server = await this.servers.findBySlug(slug, codepodId);
    if (!server || !server.enabled) {
      return this.rpcError(body, -32602, `MCP server "${slug}" not found or disabled`);
    }
    if (server.transport !== 'http' || !server.url) {
      return this.rpcError(body, -32602, `MCP server "${slug}" has no http url`);
    }
    try {
      return await this.forwardRaw(server, body);
    } catch (err) {
      this.logger.warn(`Proxy to "${slug}" (${server.url}) failed: ${this.errMsg(err)}`);
      return this.rpcError(body, -32603, `Failed to reach MCP server "${slug}"`);
    }
  }

  /** Forward an arbitrary JSON-RPC body to the remote server and parse the reply. */
  private async forwardRaw(
    server: McpServerEntity,
    body: unknown,
  ): Promise<JsonRpcResponse | JsonRpcResponse[] | null> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    };
    if (server.credentialId) {
      const secret = await this.credentials.getSecret(server.credentialId);
      if (secret) headers['Authorization'] = `Bearer ${secret}`;
    }
    const res = await fetch(server.url as string, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${await res.text().catch(() => '')}`);
    }
    const contentType = res.headers.get('content-type') ?? '';
    if (contentType.includes('text/event-stream')) {
      const text = await res.text();
      return this.parseSse(text);
    }
    const text = await res.text();
    if (!text) return null;
    return JSON.parse(text) as JsonRpcResponse | JsonRpcResponse[];
  }

  // ---- UI: per-server tools (cached, connection check) -------------------

  /**
   * List tools for a single MCP server, for display in the MCP server detail page.
   * Built-in servers return their hardcoded tool list; remote servers use the
   * 60s TTL cache. Also serves as a connection check (`reachable` flag).
   */
  async listServerTools(serverId: number, codepodId = 1): Promise<{
    serverId: number;
    slug: string;
    builtIn: boolean;
    tools: unknown[];
    reachable: boolean;
    error?: string;
  }> {
    const entity = await this.servers.findEntityById(serverId, codepodId);
    if (!entity) throw new Error(`MCP server ${serverId} not found`);
    return this.collectServerTools(entity);
  }

  /**
   * Force a cache bust + re-fetch of tools for a server (the "Sync" button).
   * Returns the fresh tool list and reachability status.
   */
  async syncServerTools(serverId: number, codepodId = 1): Promise<{
    serverId: number;
    slug: string;
    builtIn: boolean;
    tools: unknown[];
    reachable: boolean;
    error?: string;
  }> {
    this.invalidate(serverId);
    return this.listServerTools(serverId, codepodId);
  }

  /** Build the tool-list result for a single server entity. */
  private async collectServerTools(server: McpServerEntity): Promise<{
    serverId: number;
    slug: string;
    builtIn: boolean;
    tools: unknown[];
    reachable: boolean;
    error?: string;
  }> {
    if (server.builtIn) {
      const { tools } = this.mcp.listTools();
      return { serverId: server.id, slug: server.slug, builtIn: true, tools, reachable: true };
    }
    if (server.transport !== 'http' || !server.url) {
      return { serverId: server.id, slug: server.slug, builtIn: false, tools: [], reachable: false, error: 'No HTTP URL configured' };
    }
    const result = await this.fetchRemoteToolsWithStatus(server);
    return {
      serverId: server.id,
      slug: server.slug,
      builtIn: false,
      tools: result.tools,
      reachable: result.reachable,
      ...(result.error ? { error: result.error } : {}),
    };
  }

  // ---- UI: per-agent MCP tools (cached) ----------------------------------

  /**
   * List the tools of every MCP server *assigned* to an agent, for display in the
   * CodePods UI. Built-in tools are returned unprefixed (as the agent sees them);
   * remote tools are prefixed `<slug>__<tool>` and cached per server.
   */
  async listAgentMcpTools(agentId: string): Promise<{ slug: string; builtIn: boolean; tools: unknown[] }[]> {
    const assigned = await this.servers.listForAgent(agentId);
    const out: { slug: string; builtIn: boolean; tools: unknown[] }[] = [];
    for (const s of assigned) {
      if (!s.enabled) continue;
      if (s.builtIn) {
        const { tools } = this.mcp.listTools();
        out.push({ slug: s.slug, builtIn: true, tools });
        continue;
      }
      if (s.transport !== 'http' || !s.url) continue;
      const entity = await this.servers.findBySlug(s.slug, s.codepodId);
      if (!entity) continue;
      const tools = await this.fetchRemoteTools(entity);
      out.push({
        slug: s.slug,
        builtIn: false,
        tools: tools.map((t) => this.prefixTool(s.slug, t as Record<string, unknown>)),
      });
    }
    return out;
  }

  private async fetchRemoteTools(server: McpServerEntity): Promise<unknown[]> {
    return (await this.fetchRemoteToolsWithStatus(server)).tools;
  }

  private async fetchRemoteToolsWithStatus(server: McpServerEntity): Promise<{
    tools: unknown[];
    reachable: boolean;
    error?: string;
  }> {
    const cached = this.cache.get(server.id);
    if (cached && Date.now() - cached.fetchedAt < REMOTE_TOOLS_TTL_MS) {
      return { tools: cached.tools, reachable: true };
    }
    try {
      const res = await this.forwardRaw(server, { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} });
      const tools = (res as JsonRpcResponse | undefined)?.result as { tools?: unknown[] } | undefined;
      const list = tools?.tools ?? [];
      this.cache.set(server.id, { tools: list, fetchedAt: Date.now() });
      return { tools: list, reachable: true };
    } catch (err) {
      this.logger.warn(`Failed to list tools from "${server.slug}" (${server.url}): ${this.errMsg(err)}`);
      return { tools: [], reachable: false, error: this.errMsg(err) };
    }
  }

  // ---- helpers ----------------------------------------------------------

  private parseSse(text: string): JsonRpcResponse | null {
    const lines = text.split('\n');
    let lastData = '';
    for (const line of lines) {
      const m = line.match(/^data:\s?(.*)$/);
      if (m) lastData = m[1];
    }
    if (!lastData) return null;
    try {
      return JSON.parse(lastData) as JsonRpcResponse;
    } catch {
      return null;
    }
  }

  private prefixTool(slug: string, tool: Record<string, unknown>): Record<string, unknown> {
    const name = (tool.name as string) ?? '';
    return { ...tool, name: `${slug}${TOOL_SEP}${name}` };
  }

  /** Build a JSON-RPC error response mirroring the request id(s). */
  private rpcError(body: unknown, code: number, message: string): JsonRpcResponse | JsonRpcResponse[] {
    if (Array.isArray(body)) {
      return body
        .filter((r): r is { id?: string | number | null } => typeof r === 'object' && r !== null && 'id' in r)
        .map((r) => ({ jsonrpc: '2.0' as const, id: r.id ?? null, error: { code, message } }));
    }
    const id = (body as { id?: string | number | null } | undefined)?.id ?? null;
    return { jsonrpc: '2.0', id, error: { code, message } };
  }

  private errMsg(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
  }
}