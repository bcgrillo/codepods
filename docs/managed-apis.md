# Managed APIs

A registry of external HTTP APIs that AI agents can call through a server-side proxy. The backend injects the decrypted credential into the request — the agent never sees the raw key. Exposed to agents as built-in MCP tools (`get_available_apis` + `call_api_with_credentials`).

## TL;DR

- Each managed API has a `name`, `baseUrl`, a `headerPattern` (e.g. `Authorization: ****** secret), and an optional linked `Credential`.
- Agents discover available APIs via the `get_available_apis` MCP tool (returns name + description only — no credentials).
- Agents call APIs via `call_api_with_credentials` — the backend injects the secret and blocks the agent from overriding the auth header.
- This is the bridge between the [Credentials vault](./credentials.md) and the [MCP built-in tools](./mcp.md).

## Endpoints

| Method | Route | Purpose |
|---|---|---|
| GET | `/managed-apis` | List (safe view) |
| GET | `/managed-apis/:id` | Get one |
| POST | `/managed-apis` | Create |
| PATCH | `/managed-apis/:id` | Update |
| DELETE | `/managed-apis/:id` | Remove |

> `listAvailable` and `callApi` are internal methods invoked by the MCP tool layer — they are not HTTP routes.

## How `callApi` works

1. Agent calls the `call_api_with_credentials` MCP tool with `{ apiName, method, path, queryParams, body, headers }`.
2. Backend looks up the managed API by `name` + codepodId, validates `enabled`.
3. Builds the URL: `baseUrl + path + queryParams`.
4. Injects the credential: splits `headerPattern` on the first `:`, replaces `{key}` with the decrypted secret.
5. Blocks the agent from overriding the auth header (case-insensitive compare).
6. Defaults `Content-Type: application/json` when a body is present and no content-type is set.
7. Calls `fetch()` and returns `{ status, headers, body }`.

## Entity

| Column | Type | Notes |
|---|---|---|
| `name` | string | Unique per codepod |
| `description` | string (optional) | Shown to agents in `get_available_apis` |
| `baseUrl` | string | Trailing slash stripped on save |
| `credentialId` | FK → `credentials` (nullable) | Linked credential |
| `headerPattern` | text | e.g. `Authorization: ****** secret) |
| `enabled` | boolean | Default `true` |

## Current limitations

- **No rate-limiting, retry, or caching** — straight pass-through `fetch`.
- **No request/response size limits or timeout** configured.
- **No multi-value query params** — `queryParams` is `Record<string, string>`.
- The `host` reuse hint from credentials is not used; linkage is explicit per-API.

## Key files

| File | Role |
|---|---|
| `apps/api/src/managed-apis/managed-apis.controller.ts` | CRUD endpoints |
| `apps/api/src/managed-apis/managed-apis.service.ts` | `listAvailable()` + `callApi()` (internal) |
| `apps/api/src/managed-apis/managed-api.entity.ts` | Entity definition |