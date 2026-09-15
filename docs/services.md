# Service Proxy

Agent containers expose services (web UIs, terminals) on internal ports. The service proxy exposes them externally through a single host endpoint, so agents are reachable without publishing individual container ports.

## TL;DR

- Single catch-all route proxies all HTTP methods + WebSocket upgrades to agent containers.
- Services are declared in the template manifest (`type|name|port` format) and persisted as `agent_services` rows.
- WebSocket support is built-in — terminals (xterm.js) and live-reloading UIs work transparently.
- The proxy runs in the same NestJS process as the API (single-instance deployment).

## How it works

```
Browser/Client                     Host (NestJS)                    Agent container
     │                                  │                                │
     │  GET /api/proxy/<agent>/<service>/   │                                │
     ├──────────────────────────────────►│                                │
     │                                  │  resolve agent by name         │
     │                                  │  resolve service by name      │
     │                                  │  get container internal IP    │
     │                                  │  rewrite path (strip prefix)  │
     │                                  │  proxy to <ip>:<port>/...     │
     │                                  ├───────────────────────────────►│
     │                                  │                                │
     │                                  │  response                      │
     │◄──────────────────────────────────┤◄───────────────────────────────┤
```

The proxy resolves the agent by name, finds the service by name, gets the container's internal IP, and forwards the request via `http-proxy` with `changeOrigin: true`.

## WebSocket support

WebSocket upgrades on `/api/proxy/` are handled by the same proxy, enabling real-time services like terminals (xterm.js) and live-reloading web UIs.

For SSE (`text/event-stream`) responses, the proxy rewrites headers (`x-accel-buffering: no`, `cache-control: no-cache`, `connection: keep-alive`, strips `content-length`) and disables timeouts to keep long-lived connections alive. Timeouts are also disabled for WebSocket and large uploads.

Custom `x-codepods-agent-id` and `x-codepods-service-id` headers are injected upstream for traceability.

## Service declaration

Services are declared in the template manifest in `type|name|port` string format:

```yaml
services:
  - "terminal|Codex CLI|7681"
  - "web|Web UI|3000"
```

- `type`: `terminal` or `web`
- `name`: unique service name (used in the proxy URL)
- `port`: container-internal port

Services are persisted as `agent_services` rows at container creation time, so the proxy can resolve them by name.

## Key files

| File | Role |
|---|---|
| `apps/api/src/proxy/proxy.controller.ts` | `@All(':agentName/:serviceName*')` catch-all route |
| `apps/api/src/proxy/proxy.service.ts` | Resolves agent+service, rewrites path, proxies via `http-proxy`, SSE header rewriting, timeout disabling |
| `apps/api/src/main.ts` | WebSocket upgrade handler for `/api/proxy/` |
| `apps/api/src/agents/agent-service.entity.ts` | `agent_services` entity (persisted at container creation) |

## Current limitations

- **No auth gate**: the proxy does not yet require authentication before forwarding (deferred — tracked in TODO).
- **No audit log**: proxied service requests are not logged.
- **No allow-list/deny-list**: all declared services are proxyable; no filtering by service type or port.
- Services can also be opened dynamically by agents via the MCP `open_service` tool (see [MCP](./mcp.md)).