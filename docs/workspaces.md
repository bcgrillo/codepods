# Workspaces

A workspace is a git repository on the host filesystem that can be bind-mounted into an agent container. Workspaces persist across agent restarts and allow agents to work on real code without credentials leaving the host.

## TL;DR

- Two types: `local` (fresh `git init`) and `remote` (cloned from a URL with stored credentials).
- Git credentials (PATs) are stored encrypted (AES-256-GCM) in the unified [Credentials](./credentials.md) store — never returned in API responses.
- A custom git credential helper (`scripts/git-credential-codepods.js`) authenticates on demand using the stored token.
- The agent creation wizard offers clone, create-new, select-existing, or no-workspace options.
- Workspaces live at `data/workspaces/<slug>/` and are bind-mounted at the manifest's `workspace_path` (default `/workspace`).

## Endpoints

| Method | Route | Auth | Purpose |
|---|---|---|---|
| GET | `/api/workspaces` | Admin | List all workspaces |
| GET | `/api/workspaces/:id` | Admin | Get one workspace |
| POST | `/api/workspaces` | Admin | Create (local or remote) |
| PATCH | `/api/workspaces/:id` | Admin | Update (rename, convert type) |
| DELETE | `/api/workspaces/:id` | Admin | Delete workspace + files |
| POST | `/api/workspaces/reorder` | Admin | Reorder sort index |
| GET | `/api/workspaces/:id/info` | Admin | Repo inspection (HEAD hash/message/author, branches, last tag, remotes, dirty, ahead/behind) |
| POST | `/api/workspaces/:id/test` | Admin | Test remote connectivity |
| POST | `/api/workspaces/:id/copy-agents-md` | Admin | Copy AGENTS.md into workspace |
| POST | `/api/workspaces/:id/upload` | Admin | Upload file(s) to workspace (supports overwrite modes: `error`/`replace`/`backup`) |
| GET | `/api/workspaces/:id/files` | Admin | List files in workspace |
| GET | `/api/workspaces/:id/files/content` | Admin | Read file content (download) |
| DELETE | `/api/workspaces/:id/files` | Admin | Delete file from workspace |
| GET | `/api/workspaces/:id/git/status` | Admin | Git status of workspace |
| GET | `/api/workspaces/:id/git/branches` | Admin | List branches |
| POST | `/api/workspaces/:id/git/fetch` | Admin | Fetch from remote |
| POST | `/api/workspaces/:id/git/stash` | Admin | Stash changes |
| POST | `/api/workspaces/:id/git/commit` | Admin | Commit changes |
| POST | `/api/workspaces/:id/git/sync` | Admin | Sync (pull/push) with remote |

## Types

| Type | Description |
|---|---|
| `local` | Fresh `git init` on the host. No remote. Push to a remote later. |
| `remote` | Cloned from a URL using stored credentials. Tracks the remote. |

Workspaces can be converted between types at any time (local → remote by adding a remote URL; remote → local by removing it).

## Storage

Each workspace lives at `data/workspaces/<slug>/` on the host. This path is bind-mounted into the container at the manifest's `workspace_path` (default `/workspace`).

## Credential handling

Git credentials (PATs) are stored encrypted (AES-256-GCM) in the unified [Credentials](./credentials.md) store. The API never returns tokens in responses.

A custom git credential helper (`scripts/git-credential-codepods.js`) is wired into each workspace's local git config. This lets the host's git authenticate on demand using the stored token, while keeping clone URLs clean (no embedded credentials).

## Creating a workspace from the agent wizard

The agent creation wizard offers several workspace options:

- **Clone an existing remote** — provides a URL + credentials; the repo is cloned into a new workspace. Supports GitHub and GitLab.
- **Create new remote (GitHub)** — creates a new repo on GitHub using stored credentials, then clones it. Requires a GitHub PAT with repo permissions. The repo name can be `owner/repo` (organization) or just `repo` (personal account).
- **Create new remote (GitLab)** — same flow for GitLab; requires a GitLab PAT with project creation permissions.
- **Create a new local repository** — starts empty on disk. You can push to a remote later.
- **Select an existing workspace** — reuse a workspace already managed by CodePods.
- **Do not mount a workspace** — the agent runs without a mounted workspace. Work is not persisted.

## Key files

| File | Role |
|---|---|
| `apps/api/src/workspaces/workspaces.controller.ts` | REST: CRUD workspaces + repo inspection, remote testing, file management, git operations |
| `apps/api/src/workspaces/workspaces.service.ts` | Create/update/remove, clone/init, credential helper wiring, ACL grants |
| `apps/api/src/workspaces/workspace.entity.ts` | `workspaces` entity (includes `branch` field to persist the workspace's default branch) |
| `apps/api/scripts/git-credential-codepods.js` | Custom git credential helper (queries the unified credentials store) |

## Current limitations

- Credential injection uses the unified credentials store (ADR-031); the old `git_credentials` table was removed.
- Re-running `setfacl` after host-side file operations (upload, git) as a safety net is not yet automatic — tracked in TODO.
- No workspace file browser with preview/edit (planned).

See [Git Proxy](./git-proxy.md) for the git command whitelist and identity enforcement.
See [Credentials](./credentials.md) for the unified credential store.