# Git Proxy

The git proxy allows agent containers to run git commands safely. A shim script replaces the real `git` binary inside the container and forwards every invocation to the host API, which runs the real `git` in the workspace directory with credentials the agent never sees.

## TL;DR

- A POSIX `/bin/sh` shim replaces `git` inside the container; all calls are forwarded to the host.
- The host validates against a ~50-subcommand whitelist, maps the container cwd to the host workspace path, and spawns the real `git`.
- Credentials (`credential` subcommand) and global config changes are explicitly blocked.
- Git identity is injected via `GIT_AUTHOR_*`/`GIT_COMMITTER_*` env vars — agents never see credentials or identity.
- Agent identification uses a stable `CODEPODS_AGENT_ID` (survives renames), with name as legacy fallback.

## Endpoints

| Method | Route | Auth | Purpose |
|---|---|---|---|
| POST | `/git/execute` | Internal | Execute a whitelisted git command in the agent's workspace |
| GET | `/git/shim` | Public | Download the git shim script (fetched before container has a token) |

## Architecture

```
Agent container                        Host (NestJS)                    Host git
     │                                     │                              │
     │  git status                         │                              │
     │  (shim at /usr/local/bin/git)       │                              │
     │                                     │                              │
     │  POST /api/git/execute                  │                              │
     │  X-Internal-Token: ******          │                              │
     │  { agentId, agentName, args, cwd } │                              │
     ├────────────────────────────────────►│                              │
     │                                     │  resolve agent by id/name   │
     │                                     │  map cwd → host path        │
     │                                     │  validate against whitelist  │
     │                                     │  spawn("git", args, {cwd})  │
     │                                     ├─────────────────────────────►│
     │                                     │                              │
     │                                     │  stdout / stderr / exitCode │
     │                                     │◄─────────────────────────────┤
     │  { stdout, stderr, exitCode }       │                              │
     │◄────────────────────────────────────┤                              │
     │  prints stdout/stderr, exits        │                              │
```

## The shim

A POSIX `/bin/sh` script served at `GET /api/git/shim` (public endpoint — fetched before the container has a token). It:

1. Reads `CODEPODS_AGENT_ID` (falling back to `CODEPODS_AGENT_NAME` for agents created before the id existed) and `CODEPODS_API_URL` from the environment.
2. Reads `CODEPODS_INTERNAL_TOKEN` and sends it as `X-Internal-Token` header for auth.
3. Captures `$(pwd)` as the in-container working directory.
4. Builds a JSON array of the command arguments (using `python3` or `node` for proper JSON escaping — requires one of them in the container image).
5. POSTs `{ agentId, agentName, args, cwd }` to `$API_URL/git/execute` via `curl`.
6. Parses the JSON response (prefers `python3`, falls back to `node`, then `cat` raw).
7. Writes `stdout`/`stderr` and exits with the returned `exitCode`.

## Installation

The `set_git_proxy` manifest command installs the shim. A typical script (`set-git-proxy.sh`, bundled in the template image) receives `$downloadUrl` and:

1. Backs up the original git binary to `/usr/local/bin/git.original`.
2. Downloads the shim from `$downloadUrl` (resolves to `http://host.docker.internal:3000/api/git/shim`).
3. Installs it at `/usr/local/bin/git` with `chmod +x`.

From that point, every `git` call in the container goes through the proxy.

## Command whitelist

~50 subcommands are allowed (`add`, `commit`, `push`, `pull`, `clone`, `status`, `log`, `diff`, `rebase`, `stash`, `worktree`, etc.), including `symbolic-ref` so branch-detection prompts (`starship`, `powerlevel10k`, custom shell prompts) can resolve the current branch name instead of falling back to a short hash.

The whitelist is configurable via `gitSecurity.commandWhitelist` in the config file (falls back to `DEFAULT_GIT_WHITELIST` when the list is empty).

Explicitly blocked:
- `credential` — never expose credentials to agents.
- `config --global` / `config --system` — global config changes are blocked; agents may only set repo-local `user.name`/`user.email` (any `config` without `--local` is rejected).
- **Force-push** (`--force`, `--force-with-lease`, `-f`) — blocked when `gitSecurity.blockForcePush` is on (default: true).
- **Protected branches** (`main`, `dev` by default, configurable via `gitSecurity.protectedBranches`) — force-push, branch deletion, and `reset --hard` targeting a protected branch are blocked. Regular pushes to protected branches are allowed.
- **Remote management** (`remote add`, `remote remove`, `remote rm`, `remote set-url`, `remote rename`) — blocked when `gitSecurity.blockRemoteManagement` is on (default: true).

### Global option handling

The proxy validates the subcommand by extracting the first non-option argument, so common global options are skipped before the whitelist check:

- `-C <dir>` / `-c <key>=<value>` (and their value arguments)
- `--no-pager`, `--paginate`, `--git-dir=<path>`, `--work-tree=<path>`, `--namespace=<name>`
- `--version`, `--help` and other bare flags

This means `git -C /workspace status`, `git --no-pager log`, etc. are allowed, and `--version`/`--help` are treated as read-only info invocations that do not require a workspace.

### Error messages

Commands that are not allowed return a clear, English error explaining that the agent runs behind a restricted git proxy and does not have full access to git, and (when applicable) pointing at the settings to enable the missing capability. The message is delivered to the agent as git `stderr` (exit code 1).

## Git identity (user.name / user.email)

Commit-creating commands (`commit`, `merge`, `rebase`, `cherry-pick`, `revert`, `am`) require a git identity. Because the agent runs git through the proxy, the identity resolution is handled by the proxy:

1. **Per-agent / per-workspace identity** — if the agent has set `user.name` and `user.email` locally (repo-local `git config`, allowed through the proxy), those values are used. Local config is per-workspace, so each agent keeps its own identity.
2. **Generic default** — if the local identity is missing but a generic git identity is configured in the CodePods settings (`gitUserName`, `gitUserEmail`) and enabled (`useGenericGitIdentity`), the proxy injects it into the commit via `GIT_AUTHOR_*`/`GIT_COMMITTER_*` environment variables, so the agent never sees the credentials/identity.
3. **Error** — if neither an agent identity nor an enabled generic default exists, the proxy returns an error analogous to git's *"Please tell me who you are"*, telling the agent to set its own `user.name`/`user.email` or configure a default in CodePods settings.

**Abort bypass**: identity enforcement is skipped for `--abort` and `--quit` flags (e.g. `git rebase --abort`). Recovery from a failed operation is never blocked.

Read-only commands (`status`, `log`, `diff`, `branch`, …) never require an identity and are unaffected.

## CWD mapping

The shim sends the in-container `cwd`. The host maps it to the workspace's real path by stripping the agent's mount path (e.g. `/workspace`) and joining the remainder onto the workspace's host directory:

```
Container:  /workspace/src/app
Host:       /home/user/.codepods/workspaces/my-project/src/app
```

If the cwd doesn't start with the mount path, the proxy returns a `400 Bad Request` error (it no longer silently falls back to the workspace root).

## Additional behaviors

- **`rev-parse --show-toplevel` remapping**: `git rev-parse --show-toplevel` is intercepted and the host path is remapped back to the in-container path, so tools inside the container can correctly detect the repo root.
- **Credential reuse for clone**: when `gitSecurity.reuseMainRepoCredentials` is enabled and the workspace has a credential, the proxy injects `--config credential.helper=...` into `clone` commands so the agent can clone private repos.
- **`GIT_TERMINAL_PROMPT=0`**: forced in the spawned git environment to prevent interactive credential prompts from hanging.

## Environment variables

Set at container creation time:

| Variable | Value | Used by |
|---|---|---|
| `CODEPODS_AGENT_ID` | Stable agent id (12-char hex, generated at creation) | Shim — identifies the agent to the host. Stable across renames, so the proxy keeps working after an agent is renamed. |
| `CODEPODS_AGENT_NAME` | Agent's name (e.g. `copilot-1`) | Shim — legacy fallback for agents created before `CODEPODS_AGENT_ID` existed. |
| `CODEPODS_API_URL` | `http://host.docker.internal:3000/api` | Shim — endpoint to reach the host API |
| `CODEPODS_INTERNAL_TOKEN` | 32-byte hex token | Shim — sent as `X-Internal-Token` header to authenticate to the host API |

> **Why id instead of name?** Renaming an agent changes its name. If the shim identified the agent by name, a rename would break the proxy's agent lookup. The id is generated before the container is created and baked into the container env, so it never changes. The proxy resolves the agent by `agentId` first, and only falls back to `agentName` for shims installed before this change.

## Key files

| File | Role |
|---|---|
| `apps/api/src/git-proxy/git-proxy.controller.ts` | `POST /api/git/execute` + `GET /api/git/shim` (`@Public`) |
| `apps/api/src/git-proxy/git-proxy.service.ts` | Whitelist (incl. `symbolic-ref`), global-option parsing, CWD mapping, identity enforcement, force-push/protected-branch/remote checks, spawns real git, generates shim script |
| `apps/api/src/git-proxy/git-proxy.module.ts` | Imports `AgentsModule` + `WorkspacesModule` (`ConfigModule` is `@Global`, not imported directly) |
| `packages/shared-types/src/config.ts` | Git security settings (`blockForcePush`, `protectedBranches`, `blockRemoteManagement`, `commandWhitelist`, `reuseMainRepoCredentials`) |

## Current limitations

- **No UI for whitelist editing** — the whitelist is configurable via the config file (`gitSecurity.commandWhitelist`) but not yet editable from the Settings UI (planned).
- **No merge approval flow** — protected branches (`main`, `dev`) block force-push/delete/`reset --hard` but there's no approval mechanism for agents to request these operations.
- **No audit log** — git operations executed through the proxy are not logged.
- The git proxy operates at the subcommand level; complex pipelines or aliases that bypass the shim are not intercepted.