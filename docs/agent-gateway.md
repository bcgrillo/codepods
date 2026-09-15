# Agent Gateway

The egress proxy doubles as an **authenticated API gateway** between agent containers and the host API. Instead of trusting a shared secret inside containers, the proxy identifies each agent by its container source IP and injects a signed identity header that the auth guard verifies. This eliminates the risk of token leakage from containers while preserving per-agent identification.

## TL;DR

- Agent containers no longer receive `CODEPODS_INTERNAL_TOKEN` — no shared secret lives inside the container.
- The egress proxy maps each container's source IP to an agent ID (via `DockerService` IP→agentId map), then forwards API requests to `127.0.0.1:<apiPort>` with `X-Agent-Id` + `X-Agent-Sig` headers.
- The auth guard trusts requests from `127.0.0.1` with a valid HMAC signature; direct container→API requests (from non-loopback IPs) are rejected.
- The API gateway function is **always active** — it cannot be disabled. Only internet filtering is toggleable via `filterInternetEgress` (see [Network Security](./network-security.md)).
- `CAP_NET_RAW` is dropped by default (`networkSecurity.dropNetRaw`) to prevent IP spoofing from inside containers.
- The HMAC shared secret is the host-side `InternalTokenService` token — it never leaves the host process.

## How it works

```
Agent container (172.20.0.x)
  │  HTTP request → host.docker.internal:3000/api/...
  │  (routed through proxy via HTTP_PROXY env var)
  │
  ▼
Egress proxy (0.0.0.0:8888)
  │  1. Detect: target is host.docker.internal:<apiPort> → API request
  │  2. Lookup: source IP 172.20.0.x → agentId (DockerService.agentIpMap)
  │  3. Sign: HMAC-SHA256(agentId, internalToken) → X-Agent-Sig
  │  4. Forward to 127.0.0.1:<apiPort> with X-Agent-Id + X-Agent-Sig
  │
  ▼
Auth guard (NestJS API, port 3000)
  │  5. Check: source IP is 127.0.0.1? → yes (from proxy)
  │  6. Verify: HMAC-SHA256(X-Agent-Id, internalToken) == X-Agent-Sig?
  │  7. Set request.agentId = X-Agent-Id → route handler runs as that agent
  │
  ▼
Response flows back: API → proxy → agent container
```

1. **Container sends request** — agent containers have `HTTP_PROXY`/`HTTPS_PROXY` set to `http://host.docker.internal:8888`. All HTTP traffic, including API calls, goes through the egress proxy.
2. **Proxy detects API target** — `isApiTarget()` checks if the destination is `host.docker.internal:<apiPort>` (or `127.0.0.1`/`localhost` on the API port). API requests bypass the whitelist.
3. **Source IP → agent ID** — `DockerService` maintains an in-memory `Map<containerIp, {agentId, containerId}>`. When a container starts, `registerAgentIp()` inspects the container's network settings and records its IP on the `codepods-agents` network. When a container stops or is removed, `unregisterAgent()` cleans up the entry.
4. **HMAC signing** — the proxy computes `X-Agent-Sig = HMAC-SHA256(agentId, internalToken)`. The `internalToken` is the host-side `InternalTokenService` token — it never enters any container.
5. **Forward to localhost** — the proxy sends the request to `http://127.0.0.1:<apiPort>` (same host, loopback). The auth guard sees `remoteAddress = 127.0.0.1`.
6. **Auth guard verifies** — `AuthGuard` checks: (a) source IP is `127.0.0.1`, (b) `X-Agent-Id` is present, (c) `X-Agent-Sig` matches `HMAC-SHA256(X-Agent-Id, internalToken)` using `crypto.timingSafeEqual`. If all pass, `request.agentId` is set and the request proceeds.
7. **Direct access rejected** — if a container bypasses the proxy and hits the API port directly, the request arrives from the container IP (e.g., `172.20.0.x`), not `127.0.0.1`. The auth guard rejects it.

### Auth guard access matrix

See [Authentication](./auth.md) for the full auth guard access matrix and the list of public endpoints.

### Threat model

| Threat | Mitigation |
|---|---|
| Container token leaked or extracted | No token in container — `CODEPODS_INTERNAL_TOKEN` removed from container env |
| Agent spoofs source IP to impersonate another agent | `CAP_NET_RAW` dropped → cannot send raw IP packets; proxy maps by actual TCP source IP |
| Direct container→API bypass (skipping proxy) | Auth guard rejects non-`127.0.0.1` sources; API port not exposed to container subnet |
| External attacker reaches API port from internet | API port (`3000`) is not exposed externally; only HTTPS (443) is exposed via CodePods' own TLS handler |
| HMAC secret compromised | Secret is the `InternalTokenService` token, stored host-side only (file-backed, never sent to containers) |

### Backward compatibility

- `X-Internal-Token` header (old `CODEPODS_INTERNAL_TOKEN` mechanism) is still accepted by the auth guard via `isInternalRequest()`. This allows old agent containers with the token env var to continue working during migration.
- Git proxy shim: keeps a fallback path that uses the internal token for old shims already deployed in containers. New shims operate without the token.
- MCP controller: accepts `X-Agent-Id` (from proxy) as primary, with `Bearer` token as fallback.

## Current limitations

- **In-memory IP map** — the IP→agentId map lives in `DockerService` and is lost on API restart. Containers running during a restart will have stale mappings until they are restarted. In practice, the API process and containers start/stop together.
- **No iptables enforcement** — direct container→API access is blocked by the auth guard (not `127.0.0.1`), not by a firewall rule. An iptables rule on the `codepods-agents` bridge could provide defense-in-depth but is not implemented (dynamic subnets make it fragile).
- **Single admin session** — the host API uses a single-admin model. Agent identity is per-container, not per-user; there is no multi-tenant agent isolation at the API level.
- **HMAC is defense-in-depth** — the primary identity mechanism is source IP (non-falsifiable without `CAP_NET_RAW`). The HMAC detects bugs in the source IP check but does not add a separate trust channel.

## Key files

| File | Role |
|---|---|
| `apps/api/src/egress-proxy/egress-proxy.service.ts` | `EgressProxyService` — `isApiTarget()`, `signAgentId()`, `forwardApiRequest()` |
| `apps/api/src/docker/docker.service.ts` | `agentIpMap`, `registerAgentIp()`, `unregisterAgent()`, `getAgentIdByIp()` |
| `apps/api/src/auth/auth.guard.ts` | `AuthGuard` — verifies `X-Agent-Id` + `X-Agent-Sig` from `127.0.0.1` |
| `apps/api/src/auth/internal-token.service.ts` | `InternalTokenService` — provides the HMAC shared secret (host-side only) |
| `apps/api/src/agents/agents.service.ts` | Registers/unregisters IP mappings at container lifecycle; removed `CODEPODS_INTERNAL_TOKEN` from env |
| `apps/api/src/mcp/mcp.controller.ts` | Uses `X-Agent-Id` from proxy with `Bearer` token fallback |
| `apps/api/src/git-proxy/git-proxy.service.ts` | Git shim works without internal token (fallback for old shims) |
| `packages/shared-types/src/config.ts` | `NetworkSecurityConfig` — `filterInternetEgress`, `dropNetRaw` |