# Agents

The core module of CodePods: manages the full lifecycle of AI coding agents, each running in an isolated Docker container. Handles agent creation from image templates, start/stop/restart/rename/remove, per-agent environment variables, command execution, MCP server & skill wiring, user-visible notices, and a human-in-the-loop request/approval system.

## TL;DR

- Each agent = a DB record + a Docker container with bind-mounted home and workspace.
- Agents are created from image templates (which define the Dockerfile, services, and setup commands) or from a raw image string.
- The API controls `--user` (dedicated logical uid per agent when `forceNonRootUser` is on), network isolation, and environment injection.
- Template manifest commands (`set_provider`, `add_mcp_server`, `start_agent`, etc.) are executed via `docker exec` at creation time and on lifecycle events.
- A request/approval system lets agents ask the user for things (currently: egress whitelist additions).

## Endpoints

### Lifecycle

| Method | Route | Purpose |
|---|---|---|
| GET | `/agents` | List all agents (Docker state + template + services + workspaces) |
| GET | `/agents/:id` | Single agent detail |
| POST | `/agents` | Create agent (name, image or imageTemplateId, ports, env, workspaceId) |
| POST | `/agents/:id/start` | Start (recreates if container was auto-removed) |
| POST | `/agents/:id/stop` | Stop (runs `stop_agent` command if defined) |
| POST | `/agents/:id/restart` | Restart (runs `stop_agent` + `start_agent` commands only — does not restart Docker) |
| PATCH | `/agents/:id/rename` | Rename (also renames the Docker container) |
| DELETE | `/agents/:id` | Remove (optionally `?deleteWorkspace=true`) |
| POST | `/agents/reorder` | Batch drag-and-drop sort order |

### Config & inspection

| Method | Route | Purpose |
|---|---|---|
| PATCH | `/agents/:id/env-vars` | Update env vars (stored, applied on next recreate) |
| GET | `/agents/:id/container-env` | Live `printenv` inside the running container |
| POST | `/agents/:id/execute-command` | Run a template manifest command by type |

### Services, MCPs, Skills, Notices, Requests

| Method | Route | Purpose |
|---|---|---|
| GET/POST/PATCH/DELETE | `/agents/:id/services[/:serviceId]` | Per-agent services CRUD |
| GET/POST/DELETE | `/agents/:id/mcps[/:mcpServerId]` | Connect/disconnect MCP servers |
| POST | `/agents/:id/mcps/sync` | Sync MCP server assignments |
| GET/POST/DELETE | `/agents/:id/skills[/:skillId]` | Connect/disconnect skills |
| POST | `/agents/:id/skills/sync` | Sync skill assignments |
| GET | `/agents/:id/notices` | List agent notices |
| POST | `/agents/:id/notices/:noticeId/dismiss` | Dismiss a notice |
| GET | `/agents/:id/requests` | List pending requests |
| POST | `/agents/:id/requests/:requestId/approve` | Approve (optional `durationMinutes` for temporary) |
| POST | `/agents/:id/requests/:requestId/reject` | Reject |

## Agent entity

| Field | Type | Notes |
|---|---|---|
| `id` | string (12-char hex) | Random, stable across renames |
| `containerId` | string | Full Docker container ID |
| `name` | string | Unique per codepod |
| `image` | string | Docker image reference |
| `imageTemplateId` | FK (nullable) | Linked image template |
| `envVars` | JSON | Stored environment variables |
| `commandMeta` | JSON | Template command metadata |
| `dockerRunConfig` | JSON | Snapshot of Docker config at creation |
| `portBindings` | JSON | Port mappings |
| `homePath` | string | Bind-mounted home directory |
| `agentUid` / `agentGid` | int (nullable) | Dedicated host uid:gid (ADR-029) |
| `workspaceId` | FK (nullable) | Linked workspace |
| `sortOrder` | int | Drag-and-drop order (0 = unpinned) |

## Creation flow

1. **Resolve image**: if `imageTemplateId` given, `imagesService.ensureImageForAgentCreation()` builds/ensures the image and returns mount paths + declared services. Otherwise uses raw `image` string with defaults (`/workspace`, `/home/agent`).
2. Generate stable 12-char hex `agentId` and create a persisted home directory.
3. Build bind mounts: home (mandatory) + workspace path (if `workspaceId`).
4. **UID assignment**: if `forceNonRootUser` is on, assign a random logical uid from `agentUidRange` (default 55001–65000), collision-checked in DB. Otherwise run as the API process's own uid.
5. **Egress config**: always attach to internal `codepods-agents` network (no internet route), set `HTTP(S)_PROXY` env, bind `host.docker.internal` to the network gateway. The proxy serves as API gateway (always on) + internet filter (when `filterInternetEgress` is on).
6. Inject env vars (`CODEPODS_AGENT_NAME`, `CODEPODS_AGENT_ID`, `CODEPODS_API_URL`) + port bindings. No internal token is injected — the egress proxy identifies agents by source IP (see [Agent Gateway](./agent-gateway.md)).
7. `docker.createContainer()` → `container.start()`.
8. **POSIX ACL grants** to home + workspace for the agent uid (before start so entrypoint can write). Failures become user-visible notices.
9. **Immediate-exit detection**: if container isn't running after start, capture exit code + last 50 log lines as an error notice.
10. Save agent record + template-declared services; auto-connect MCP servers flagged `connectAllAgents`.

## Command execution

Template manifest commands are executed via `docker exec` as the agent's uid with `HOME` set. Variable substitution supports `$baseUrl`, `$modelName`, `$apiKey`, `$name`, `$url`, `$downloadUrl`, etc. (shell-escaped).

| Command type | Behavior |
|---|---|
| `set_provider` | Resolves AI provider, substitutes proxy URL with fake key. Real key injected by proxy at request time. `modelName="default"` resolved lazily. |
| `add_mcp_server` | Exposes MCP at `/api/mcp/<slug>`. Agent never sees real URL/credentials. Prepends `remove_mcp_server` for idempotency. |
| `start_agent` | Launched detached (long-running, not awaited). |
| `stop_agent` | Short, captured via `execCapture`. |
| `add_skill` / `remove_skill` | Short, captured. |
| `get_mcps` / `get_skills` | Parse JSON array output. |

## Request/approval system

Agents can create requests (currently type `whitelist` — egress host requests) that require user approval. `waitForResolution(requestId, timeoutMs)` uses an in-memory waiters map so an agent (via MCP) can block until the user approves/rejects or the timeout (default 120s) expires.

- **Approve (permanent)**: adds host to `networkSecurity.egressWhitelist` config.
- **Approve (temporary)**: adds a temp exception to the egress proxy with `expiresAt`.
- **Expired temporary approvals**: lazily flipped to `expired` status on next list/status query.
- **Statuses**: `pending → approved | rejected | expired`

See [Network Security](./network-security.md) for the egress proxy architecture.

## Current limitations

- **`restart` does not restart the Docker container** — only runs template `stop_agent`/`start_agent` commands. Skipped if neither is defined or the container isn't running.
- **Env var updates are not applied live** — they take effect on next container (re)create, not on a running container.
- **Non-root UID mode is "experimental"** when `forceNonRootUser` is off — the agent runs as the API process's own uid (no isolation).
- **UID assignment** uses random + DB collision check; stale ACL entries from deleted agents aren't cleaned up until a cleanup process exists.
- **Only `whitelist` request type** is implemented; the framework is generic but only egress whitelist is wired.
- **`waitForResolution` is in-memory per-instance** — no cross-instance/cluster pubsub.
- The manifest `user` field is intentionally ignored in favor of CodePods-controlled `--user`.

## Key files

| File | Role |
|---|---|
| `apps/api/src/agents/agents.controller.ts` | All agent endpoints |
| `apps/api/src/agents/agents.service.ts` | Lifecycle, creation, command execution |
| `apps/api/src/agents/agent.entity.ts` | Agent entity |
| `apps/api/src/agents/agent-requests.service.ts` | Request/approval system |
| `apps/api/src/agents/agent-notice.entity.ts` | Notices |
| `apps/api/src/agents/agent-service.entity.ts` | Per-agent services |