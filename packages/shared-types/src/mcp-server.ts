/** MCP server transport. v1 supports HTTP (streamable-HTTP / SSE); stdio deferred. */
export type McpTransport = 'http' | 'stdio';

/** An MCP server as exposed by the API (secrets never returned). */
export interface McpServer {
  id: number;
  codepodId: number;
  name: string;
  slug: string;
  transport: McpTransport;
  /** Remote MCP endpoint URL (http transport). */
  url: string | null;
  /** Linked credential id (nullable). The proxy injects the credential secret
   * as an Authorization header when forwarding to this server. */
  credentialId: number | null;
  enabled: boolean;
  /** True for the built-in CodePods MCP (open_service/close_service). Not deletable. */
  builtIn: boolean;
  /** When true, this server is automatically connected to every new agent. */
  connectAllAgents: boolean;
  /** Pin/order: 0 = unpinned, 1+ = pinned position. */
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export const MCP_TRANSPORTS: McpTransport[] = ['http', 'stdio'];

/** A single tool offered by an MCP server (subset of the MCP tool schema). */
export interface McpTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

/**
 * The cached tool inventory for one MCP server assigned to an agent, as returned
 * by `GET /agents/:id/mcp-tools`. Built-in tools are returned unprefixed; remote
 * tools are prefixed `<slug>__<tool>` so they can't collide.
 */
export interface AgentMcpTools {
  slug: string;
  builtIn: boolean;
  tools: McpTool[];
}

/**
 * The tool inventory + connection status for a single MCP server, as returned
 * by `GET /mcp-servers/:id/tools` and `POST /mcp-servers/:id/tools/sync`.
 * Tools are NOT prefixed (unlike AgentMcpTools) since this is per-server.
 */
export interface McpServerTools {
  serverId: number;
  slug: string;
  builtIn: boolean;
  tools: McpTool[];
  reachable: boolean;
  error?: string;
}