# AGENTS.md Versioning

Manages versioned `AGENTS.md` documents — the "operative guide" files that instruct AI agents how to work inside a repository (workflow rules, document structure, branch rules, git proxy usage). Multiple named versions (aliases) can coexist per codepod; exactly one is the **default** that gets copied into new workspaces.

## TL;DR

- Multiple `AGENTS.md` versions can exist, each with a human-friendly alias.
- Exactly one version is the default; it gets copied into new workspaces automatically.
- A built-in default is seeded on first run (from `default-agents.md`).
- The default version cannot be deleted — you must set another as default first.

## Endpoints

| Method | Route | Purpose |
|---|---|---|
| GET | `/agents-md` | List all versions (ordered by alias) |
| GET | `/agents-md/default` | Get the current default version |
| GET | `/agents-md/:id` | Get one version |
| POST | `/agents-md` | Create a version |
| PATCH | `/agents-md/:id` | Update a version |
| POST | `/agents-md/:id/set-default` | Set a version as the default |
| DELETE | `/agents-md/:id` | Delete (forbidden if it's the default) |

## How it works

- **Entity**: `agents_md` table. Fields: `id`, `codepodId`, `alias`, `content` (full markdown), `isDefault`, timestamps. The file is always named `AGENTS.md` inside workspaces, but multiple versions with different aliases coexist in the DB.
- **Seeding**: `seedIfEmpty()` runs on module init. If no records exist, reads the bundled `default-agents.md` and inserts it as the "Default" version with `isDefault=true`.
- **Default management**: `setDefaultInternal` ensures exactly one default by clearing all `isDefault` for the codepod, then setting the chosen id.
- **Delete guard**: cannot delete the version that is currently the default.
- **Copy-into-workspace**: the actual copying of the default `AGENTS.md` into new workspaces is handled by the Workspaces module, not this module.

## The default AGENTS.md content

The seeded content is a comprehensive agent operative guide covering:
- **About CodePods**: the agent runs inside an isolated Docker container, interacts with the host via the CodePods MCP server.
- **Git proxy**: all git commands go through a restricted host proxy (whitelisted subset only); agents must not touch `.git` directly.
- **Mandatory document structure**: `.context/` folder with `design.md`, `todo.md`, `task.md`, `decisions.md`, `changelog.md`.
- **Branch rules**: no direct work on `main`/`dev`; work on `feature/task-name` branches; confirm with user before merging.
- **`task.md` discipline**: always read/update it; keep it compact.
- **Per-interaction flow**: read `task.md` → execute → update `task.md` → update other docs → confirm important changes with user.

## Current limitations

- **No version history/diffing** — editing a version overwrites it (no revision trail beyond `updatedAt`).
- **Seeding only on empty table** — updates to the bundled `default-agents.md` won't propagate to existing installations.
- **No auto-fallback** — if the only version is somehow unset as default, there's no automatic recovery.
- **Single codepod** — `codepodId` defaults to 1 everywhere; multi-codepod is structurally present but not exposed via routes.

## Key files

| File | Role |
|---|---|
| `apps/api/src/agents-md/agents-md.controller.ts` | CRUD + set-default endpoints |
| `apps/api/src/agents-md/agents-md.service.ts` | CRUD, seeding, default management |
| `apps/api/src/agents-md/agents-md.entity.ts` | Entity definition |
| `apps/api/src/agents-md/default-agents.md` | Bundled default content |