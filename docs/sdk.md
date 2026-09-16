# SDK (`@codepods/sdk`)

A type-safe HTTP client library shared between the frontend and backend. One client class per backend domain, a shared `request()` wrapper, and module-level bearer-token plumbing with a global 401 handler.

## TL;DR

- One client class per domain: `AgentsClient`, `AiProvidersClient`, `AuthClient`, `CentralReposClient`, `ConfigClient`, `CredentialsClient`, `McpServersClient`, `SkillsClient`, `ManagedApisClient`, `WorkspacesClient`.
- Shared `request()` wrapper: attaches JSON content-type + auth headers, handles 401 globally, parses JSON.
- Module-level token holder: `setAuthToken` / `getAuthToken` / `authHeaders` — the token is attached to every request automatically.
- Global 401 handler: `setOnUnauthorized(handler)` / `notifyUnauthorized()` — decouples the SDK from React/Router.
- DTO types co-exported from each client.

## Structure pattern

Every client follows the same template:

```typescript
export class XxxClient {
  constructor(private readonly baseUrl: string) {}  // e.g. new AgentsClient('/api')

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      headers: { 'Content-Type': 'application/json', ...authHeaders(), ...init?.headers },
      ...init,
    });
    if (!res.ok) {
      if (res.status === 401) notifyUnauthorized();
      throw new Error(`API ${res.status}: ${text}`);
    }
    return JSON.parse(text) as T;  // handles 204 / empty bodies
  }

  // domain methods: listXxx, getXxx, createXxx, updateXxx, removeXxx, ...
}
```

## Auth token handling (`auth.ts`)

Module-level singleton (not per-client):
- `authToken: string | null` — in-memory holder, set by the web app on login.
- `setAuthToken(token)` / `getAuthToken()` — mutators.
- `authHeaders()` — returns `{ Authorization: '******' }` or `{}`. Spread into every request.
- `setOnUnauthorized(handler)` / `notifyUnauthorized()` — callback registry. When any client gets a 401, it fires the app-registered handler (clear token + redirect to `/login`).

> Auth endpoints (`AuthClient`) do **not** attach `authHeaders()` (login happens before a token exists), but still call `notifyUnauthorized()` on 401.

## Notable clients

| Client | Highlights |
|---|---|
| `AgentsClient` | Largest client. Agents CRUD, start/stop/restart, env vars, execute-command, services, MCP connect/disconnect/sync/tools, skills, notices, requests (approve/reject), image templates (CRUD + reorder + `ensureImageTemplateStream` — SSE via fetch ReadableStream for live build logs), setup status, proxy URL builder. |
| `AuthClient` | `login`, `logout` (clears HttpOnly cookie), `reset`, `listDevices`, `revokeDevice`, `changePassword`. |
| `WorkspacesClient` | Workspaces CRUD + reorder, repo info/test, AGENTS.md copy, file management (list/read/delete/upload via FormData), git operations (status, branches, fetch, stash, commit, sync). Detects `FormData` to skip JSON content-type. |

## Shared packages

| Package | Purpose |
|---|---|
| `shared-types` | Barrel re-export of domain types (agent, auth, config, credential, discovery, etc.) shared between frontend, SDK, and backend. |
| `shared-config` | `AppConfig { apiUrl, wsUrl }` + `defaultConfig`. Centralizes API/WebSocket base paths. |
| `shared-validation` | Zod schemas shared between client and server (single source of truth). Currently: `portBindingSchema`, `createAgentSchema`. |

## Key files

| File | Role |
|---|---|
| `packages/sdk/src/index.ts` | Barrel export of all clients + auth helpers |
| `packages/sdk/src/auth.ts` | Token holder, `authHeaders()`, 401 handler |
| `packages/sdk/src/agents.client.ts` | Agents client (largest) |
| `packages/sdk/src/auth.client.ts` | Auth client |
| `packages/sdk/src/workspaces.client.ts` | Workspaces client (FormData, git ops) |
| `packages/shared-types/src/index.ts` | Shared domain types |
| `packages/shared-config/src/index.ts` | App config types |
| `packages/shared-validation/src/index.ts` | Zod validation schemas |

## Current limitations

- **No retry/backoff** — failed requests throw immediately; TanStack Query `retry: 1` is the only retry layer.
- **No typed errors** — all errors are `Error` with a message string; no error code taxonomy.
- **No request cancellation** — `AbortController` is not wired into the shared `request()` wrapper.
- **Auth token is module-level** — not scoped per-request; sufficient for single-admin but won't scale to multi-user without rework.