# Authentication

A single-admin authentication system for the CodePods host API. Implements first-run admin setup, password-based login with per-device approval gating, encrypted bearer tokens bound to both the password hash and a validated device, and an agent identity mechanism via the egress proxy (source IP + HMAC) so agent containers can call the API without any shared secret inside the container.

## TL;DR

- One admin user (`owner` role), seeded on first run via CLI.
- Login requires password + a validated device. New devices get a 6-char approval code that must be approved from the host CLI.
- Tokens are encrypted JSON (`{ sub, h: passwordHash, d: deviceId }`) — changing the password or revoking a device invalidates tokens automatically.
- Agent containers authenticate via the egress proxy (source IP + HMAC, ADR-036) — no secret inside the container.
- The `InternalTokenService` token is now host-side only (used as HMAC shared secret); it is no longer injected into containers.
- **Currently only one user exists.** Multi-user support is coming.

## Endpoints

| Method | Route | Auth | Purpose |
|---|---|---|---|
| POST | `/auth/login` | Public | Login; returns token (validated device) or approval code (pending/new device) |
| POST | `/auth/logout` | Admin | Clears the `codepods_token` cookie |
| POST | `/auth/reset` | Admin | Generates a new random admin password (shown once) |
| POST | `/auth/change-password` | Admin | Change password (requires current password) |
| GET | `/auth/devices` | Admin | Lists all devices (`isCurrent` flag) |
| DELETE | `/auth/devices/:deviceId` | Admin | Revokes a device |

### CLI-only operations (not HTTP)

| Command | Purpose |
|---|---|
| `node dist/cli.js setup` | First-run admin setup (set password) |
| `node dist/cli.js reset` | Reset admin password |
| `node dist/cli.js approve <code>` | Approve a pending device |

## Login flow

```
Browser                         Host (NestJS)
   │                                │
   │ POST /auth/login               │
   │ { username, password }         │
   ├───────────────────────────────►│
   │                                │ verify password (scrypt)
   │                                │ check codepods_device cookie
   │                                │
   │                    ┌───────────┴───────────┐
   │                    │                       │
   │              validated device         new/pending device
   │                    │                       │
   │  token + cookie    │              6-char code (hashed, 15-min TTL)
   │◄───────────────────┤              { devicePending, code }
   │                    │                       │
   │                    │          admin runs: cli.js approve <code>
   │                    │                       │
   │                    │              device → validated
   │                    │                       │
   │  POST /auth/login (again)                 │
   ├───────────────────────────────►│           │
   │  token + cookie                │           │
   │◄───────────────────────────────┤           │
```

1. Verify username (defaults to `admin`) + password via scrypt `timingSafeEqual`.
2. If the request carries a `codepods_device` cookie:
   - **Validated device** → issue encrypted token immediately, update `lastLoginAt`.
   - **Pending device** → refresh its 6-char code, return `{ devicePending, code }` (no token).
3. **New/revoked/unknown device** → create a `pending` device row with a hashed code (15-min TTL), return the code. The admin must run `node dist/cli.js approve <code>` on the host.

## Token mechanism

- **Payload**: encrypted JSON `{ sub: userId, h: passwordHash, d: deviceId }` (encrypted via `CryptoService`).
- **Validation**: re-decrypts and checks:
  - The stored `passwordHash` still matches `h` → password change invalidates all tokens.
  - Device `d` is present and still `validated` → revoking a device kills its tokens.
- **Delivery**: `codepods_token` HttpOnly cookie (SameSite=Lax, 30-day max-age) **and** `Authorization: Bearer` header.

## Auth guard

Global `AuthGuard` protects all HTTP routes. A request is allowed if any of these checks pass, evaluated in order:

1. **`@Public()` decorator** — route is marked public (login, git shim, repo-file icons).
2. **OPTIONS preflight** — CORS preflight requests pass without auth.
3. **`X-Internal-Token`** — backward compatibility for old containers that still have `CODEPODS_INTERNAL_TOKEN` (see [Migration](#migration-from-internal-token)).
4. **Swagger `/api/docs`** — API docs UI is public so login can happen from the docs page.
5. **Bearer token** — admin `Authorization: Bearer <token>`, verified via `AuthService.validateToken()`.
6. **Auth cookie** — `codepods_token` HttpOnly cookie (fallback for requests that can't set a header, e.g. iframe).
7. **Egress proxy identity** — source IP is `127.0.0.1` + valid `X-Agent-Id` + `X-Agent-Sig` (HMAC-SHA256). The proxy injects these based on the container's source IP (ADR-036, see [Agent Gateway](./agent-gateway.md)). After HMAC verification, the route must also be marked `@AgentAllowed()` or the request is rejected with `403 Forbidden`.
8. **None match** → `401 Unauthorized`.

### Access matrix

| Origen | remoteAddress | Check que pasa | ¿Resultado? |
|---|---|---|---|
| Admin desde navegador (HTTPS 443) | IP pública real | Bearer token o cookie HttpOnly | ✅ Acepta |
| Egress proxy (contenedor → proxy → API) | `127.0.0.1` | X-Agent-Id + X-Agent-Sig (HMAC) | ✅ Acepta |
| Contenedor directo a API (bypass) | `172.20.0.x` | Ninguno coincide | ❌ 401 |
| Internet externo a API (sin token) | IP pública real | Ningún token válido | ❌ 401 |
| Internet externo a API (token admin legítimo) | IP pública real | Bearer token válido | ✅ Acepta |

### Public endpoints (no auth required)

| Method | Route | Why public |
|---|---|---|
| POST | `/auth/login` | Login — must be accessible without a token |
| GET | `/api/docs` (and assets) | Swagger UI — only when `swaggerEnabled` is true (default off). The login endpoint is public, so you can obtain a token from the docs page |
| OPTIONS | any route | CORS preflight |

All other routes require authentication. Formerly public endpoints (`/git/shim`, `/central-repos/repo-file`) are now authenticated:
- **`/git/shim`** — agent containers download the shim through the egress proxy, which injects `X-Agent-Id` + `X-Agent-Sig` (ADR-036).
- **`/central-repos/repo-file`** — icons are loaded via same-origin `<img>` tags; the HttpOnly `codepods_token` cookie is sent automatically by the browser.

### Adding new endpoints — security rule

**All new HTTP routes are authenticated by default.** The global `AuthGuard` protects every route unless explicitly exempted. To make a route public:

1. Add `@Public()` from `src/auth/public.decorator.ts` to the handler.
2. Add the route to `EXPECTED_PUBLIC_ROUTES` in `src/auth/public-endpoints.spec.ts` with a justification.
3. Document it in the [Public endpoints](#public-endpoints-no-auth-required) table above.

The security audit test (`public-endpoints.spec.ts`) fails if `@Public()` appears on any route not in the expected list. This prevents accidental exposure of new endpoints — if a developer forgets to add auth, the route is protected by default; if they add `@Public()` without registering it, the test catches it.

**Guidelines for `@Public()`:**
- Login and token-issuance endpoints: yes.
- CORS preflight (OPTIONS): handled in the guard, no decorator needed.
- Swagger UI: handled in the guard, conditional on `swaggerEnabled`.
- Agent container endpoints: no — use the egress proxy (HMAC identity, ADR-036).
- Browser asset endpoints (`<img>`, `<iframe>`): no — the HttpOnly auth cookie is sent automatically with same-origin requests.

### Agent authorization

Agents authenticate via the egress proxy (HMAC, step 7 above), which sets `request.agentId`. After authentication, the auth guard checks whether the route is marked with `@AgentAllowed()` (`src/auth/agent-allowed.decorator.ts`). If the route is **not** agent-allowed, the guard throws `ForbiddenException` (403) — the agent is authenticated but not authorized to access that endpoint.

This means agents can only access a restricted set of endpoints. All other routes — including admin-only configuration, credential management, and agent lifecycle endpoints — return 403 for agent requests.

| Method | Route | Why agent-allowed |
|---|---|---|
| POST | `/git/execute` | Agent runs git commands through the proxy |
| GET | `/git/shim` | Agent downloads the git shim script via the proxy |
| ALL | `/ai-proxy/:slug*` | Agent AI requests forwarded to the upstream provider |
| POST | `/mcp/:slug` | Agent MCP JSON-RPC calls (built-in + external servers) |

The security audit test (`public-endpoints.spec.ts`) also scans all controllers for `@AgentAllowed()` metadata and verifies only these expected routes have the decorator. To add a new agent-accessible route:

1. Add `@AgentAllowed()` from `src/auth/agent-allowed.decorator.ts` to the handler.
2. Add the route to `EXPECTED_AGENT_ALLOWED_ROUTES` in `src/auth/public-endpoints.spec.ts` with a justification.
3. Document it in the table above.

### Non-HTTP surfaces

- **WebSocket `/console`** — the console terminal gateway verifies the `codepods_token` HttpOnly cookie in the WS handshake (`handleConnection`). NestJS `APP_GUARD` does not apply to WS gateways, so auth is checked manually. Unauthenticated connections are rejected. The cookie is sent automatically by the browser when `withCredentials: true` is set on the Socket.IO client.

## Internal token (HMAC shared secret)

- 32-byte hex token, generated on first use, persisted to `<dataDir>/.internal-token` (mode 0600, outside the DB).
- Used as the **HMAC shared secret** for agent identity: the egress proxy signs `X-Agent-Id` with `HMAC-SHA256(agentId, token)`, and the auth guard verifies the signature.
- This token never leaves the host process — it is not sent to any container or client.
- On API startup, `AgentsService.onApplicationBootstrap` re-registers IPs of all running agent containers so the proxy can identify them after a restart.

## Device approval security

- 6-char code from an ambiguity-free alphabet (`ABCDEFGHJKLMNPQRSTUVWXYZ23456789`).
- Codes hashed with scrypt + random salt; approval verifies against all pending rows (can't lookup by hash).
- Per-device lockout after 5 failed attempts (15-min lock).
- In-memory global rate limiter (10 fails / 15 min).

## Current limitations

- **Only one user** (admin/owner). Multi-user support is planned.
- **Device approval is CLI-only** — no HTTP endpoint to approve from the web UI.
- **WebSocket `/console`** — the console terminal gateway verifies the `codepods_token` HttpOnly cookie in the WS handshake (`handleConnection`). Unauthenticated connections are rejected. The cookie is sent automatically by the browser when `withCredentials: true` is set on the Socket.IO client.
- **No mTLS** between containers and the API — replaced by source IP + HMAC (ADR-036). mTLS is deferred.
- **No audit logging** for auth events (login, device approval, password changes).

## Key files

| File | Role |
|---|---|
| `apps/api/src/auth/auth.controller.ts` | Login, logout, reset, change-password, devices |
| `apps/api/src/auth/auth.service.ts` | Password verification, token issuance, `isInternalRequest` |
| `apps/api/src/auth/auth.guard.ts` | Global auth guard — bearer/cookie + source IP + HMAC (ADR-036) |
| `apps/api/src/auth/device.service.ts` | Device management, approval flow |
| `apps/api/src/auth/internal-token.service.ts` | Host-side HMAC shared secret (no longer injected into containers) |
| `apps/api/src/egress-proxy/egress-proxy.service.ts` | Signs `X-Agent-Id` + `X-Agent-Sig` for API forwarding |
| `apps/api/src/cli.ts` | CLI commands (setup, reset, approve) |