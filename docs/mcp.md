# MCP (Model Context Protocol)

An MCP server registry and proxy. CodePods exposes a built-in "codepods" MCP server (handled in-process) that gives agents tools for opening service ports, calling managed APIs with injected credentials, and requesting network egress access. Admins can also register external (remote HTTP) MCP servers, assign them to agents, and CodePods acts as a transparent, credential-injecting JSON-RPC proxy — the agent never sees the remote URL or secret.

## TL;DR

- Built-in `codepods` MCP server: 6 tools (open/close service, managed API calls, egress requests).
- External MCP servers: admin registers them with a URL + optional credential; CodePods proxies JSON-RPC, injecting the auth header.
- Each MCP server is exposed to agents at `http://host.docker.internal:3000/api/mcp/<slug>` (ADR-030).
- Agent identity is carried via `Authorization: ****** header.
- N:M assignment: agents can be connected to multiple MCP servers; servers can auto-connect to all agents.

## Architecture

```
Agent container                    Host (NestJS)                    Remote MCP server
     │                                │                                │
     │ POST /api/mcp/<slug>           │                                │
     │ Authorization: ******    │                                │
     ├──────────────────────────────►│                                │
     │                                │                                │
     │                    ┌───────────┴───────────┐                    │
     │                    │                       │                    │
     │              slug = "codepods"       slug = external            │
     │              (built-in, local)       (proxy to remote)          │
     │                    │                       │                    │
     │                    │              inject credential             │
     │                    │              POST <remoteUrl>              │
     │                    │              Authorization: ******   │
     │                    │              ├──────────────────────────────►│
     │                    │              │                                │
     │                    │              ◄──────────────────────────────┤
     │  JSON-RPC response │              │                                │
     │◄───────────────────┤              │                                │
```

## Built-in CodePods MCP tools

| Tool | Purpose |
|---|---|
| `open_service` | Open a proxied port on an agent container (web or terminal); returns internal + public proxy URLs |
| `close_service` | Close a previously opened service port |
| `get_available_apis` | List admin-configured [managed APIs](./managed-apis.md) available to the agent (no keys exposed) |
| `call_api_with_credentials` | Make an HTTP request to a managed API; server injects the auth header |
| `request_access` | Request user approval to access a URL blocked by the egress whitelist. Blocks up to 120s waiting for resolution |
| `check_request` | Check the status of a previously submitted access request |

See [Agents](./agents.md) for the request/approval system and [Network Security](./network-security.md) for egress filtering.

## External MCP proxy

- `proxyExternalRequest(slug, body)`: looks up the server by slug; if enabled + http + url, `fetch`es the remote URL, injecting `Authorization: ****** from the linked credential.
- Handles `text/event-stream` responses by parsing the last `data:` line.
- Returns parsed JSON-RPC; `null` for notifications.
- Remote tool lists are cached per server for 60s.
- For UI display, remote tools are **namespaced** as `<slug>__<tool>` to avoid collisions; built-in tools are unprefixed.

## MCP server management

| Method | Route | Purpose |
|---|---|---|
| GET | `/mcp-servers` | List all servers |
| GET | `/mcp-servers/:id` | Get one |
| POST | `/mcp-servers` | Create (external) server |
| PATCH | `/mcp-servers/:id` | Update |
| DELETE | `/mcp-servers/:id` | Delete (built-in not deletable) |
| POST | `/mcp-servers/reorder` | Pin/reorder |
| GET | `/mcp-servers/:id/tools` | Cached tool list + reachability |
| POST | `/mcp-servers/:id/tools/sync` | Force cache bust + re-fetch |
| GET | `/agents/:id/mcp-tools` | Per-agent: tools from all assigned MCPs |

## Agent ↔ MCP assignment

- N:M via `agent_mcp_servers` junction table.
- `connectAllAgents=true` servers auto-connect to every new agent at creation time.
- The built-in `codepods` server is seeded on module init, not deletable, `connectAllAgents=true` by default (user-editable).
- Update is restricted to name/enabled/credentialId/connectAllAgents for the built-in server (transport/url/slug locked).
- Per-agent endpoints: `GET/POST/DELETE /agents/:id/mcps[/:mcpServerId]`, `POST /agents/:id/mcps/sync`.

## How agents get configured

The `add_mcp_server` manifest command (run at agent creation) writes the proxy URL (`http://host.docker.internal:3000/api/mcp/<slug>`) and the agent id as auth header into the agent's MCP config. The agent never receives the real MCP URL or credentials.

## Current limitations

- **`stdio` transport not supported** — only `http` transport works. stdio is explicitly rejected on create/update.
- **No per-tool enable/disable** — assignment is at the server level; agents see all tools from assigned servers.
- **No request/response rewriting** — the proxy is a transparent pass-through with credential injection only.
- **Agent→API auth is a placeholder** — the `Authorization: ****** header identifies the agent but is not cryptographically verified (see ADR-030 TODO).

## Key files

| File | Role |
|---|---|
| `apps/api/src/mcp/mcp.controller.ts` | JSON-RPC proxy route `POST /mcp/:slug` |
| `apps/api/src/mcp/mcp.service.ts` | Built-in CodePods MCP tools |
| `apps/api/src/mcp/mcp-proxy.service.ts` | External server proxying |
| `apps/api/src/mcp/mcp-cache-bridge.ts` | Cache invalidation indirection |
| `apps/api/src/mcp-servers/mcp-servers.controller.ts` | Server CRUD + reorder |
| `apps/api/src/mcp-servers/mcp-servers.service.ts` | Server management, agent assignment |