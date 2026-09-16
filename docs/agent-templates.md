# Agent Templates

A guide to creating agent templates for CodePods. Templates are Git repositories containing a Dockerfile and an optional `manifest.yml` that declare how the agent is built, configured, and started.

## TL;DR

- A template is a Git repo with at minimum a `Dockerfile`; an optional `manifest.yml` adds metadata, services, commands, and icons.
- `home_path` is a **mandatory** manifest field; `name` is auto-derived from `owner/repo` if omitted.
- Commands (`set_provider`, `set_git_proxy`, `start_agent`, `stop_agent`, `add_mcp_server`, `remove_mcp_server`, `get_mcps`, `add_skill`, `remove_skill`, `get_skills`) are scripts executed in the container at lifecycle points.
- During creation, only `add_mcp_server` is auto-run; other commands are triggered by the UI via `POST /agents/:id/execute-command`.
- Services (`type|name|port`) expose web UIs and terminals through the [Service Proxy](./services.md).
- CodePods injects env vars (`CODEPODS_AGENT_ID`, `CODEPODS_API_URL`, `CODEPODS_INTERNAL_TOKEN`) and substitutes variables in command scripts.
- Icons are inlined as base64 data URIs; templates are pulled from the default branch (no version pinning yet).

## Minimum requirements

A template repository must contain at least one **Dockerfile** at the root (or inside the specified repo path).

## manifest.yml

Place a `manifest.yml` at the root of your repository to declare metadata, services, commands, and the workspace mount path.

```yaml
name: "Codex"
description: "OpenAI Codex CLI configuration"
home_path: "/home/codex"
workspace_path: "/workspace"
icon: "codex-light.svg"
icon_dark: "codex-dark.svg"

services:
  - "terminal|Codex CLI|7681"

commands:
  - set_provider: "/usr/local/bin/set-provider.sh $baseUrl $modelName $apiKey $providerName $providerType"
  - set_git_proxy: "/usr/local/bin/set-git-proxy.sh $downloadUrl"
  - start_agent: "/usr/local/bin/start-agent.sh"
  - stop_agent: "/usr/local/bin/stop-agent.sh"
  - add_mcp_server: "/usr/local/bin/add-mcp.sh $name"
  - remove_mcp_server: "/usr/local/bin/remove-mcp.sh $name"
```

### Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | No | Display name shown in the UI. Auto-derived from `owner/repo` if omitted. |
| `description` | string | No | Short description shown in the UI. |
| `home_path` | string | **Yes** | In-container path for the agent's home directory. Bind-mounted from host. |
| `workspace_path` | string | No | In-container path where the workspace is bind-mounted. Default: `/workspace`. Must be absolute, no `..`. |
| `icon` | string | No | URL or local file path for light-mode icon (PNG/SVG). |
| `icon_dark` | string | No | URL or local file path for dark-mode icon. |
| `services` | array | No | Web or terminal services exposed through the proxy. |
| `commands` | array | No | Supported commands with variable placeholders. |
| `user` | string | No | Container user (validated and ignored — container runs as the configured uid). |

### Services

Each service entry is a string in `type|name|port` format:

```yaml
services:
  - "terminal|Shell|7681"
  - "web|Web UI|3000"
```

- `type`: `terminal` or `web`
- `name`: unique service name (used in the proxy URL `/api/proxy/<agent>/<service>/`)
- `port`: container-internal port (1–65535)

Terminal services support WebSocket upgrades for real-time interaction. Web services are proxied as standard HTTP.

### Icons

Local icon files (referenced by relative path) are inlined as base64 data URIs when the template is inspected. Already-inline SVG, `http(s)://` URLs, and `data:` URIs are used as-is. Use square images (recommended 256×256 or larger).

## Commands

Commands are scripts bundled in the template image that CodePods executes inside the agent container at specific lifecycle points. Each command is a single-key entry in the `commands` list:

```yaml
commands:
  - set_provider: "/usr/local/bin/set-provider.sh $baseUrl $modelName $apiKey $providerName $providerType"
  - set_git_proxy: "/usr/local/bin/set-git-proxy.sh $downloadUrl"
  - start_agent: "/usr/local/bin/start-agent.sh"
  - stop_agent: "/usr/local/bin/stop-agent.sh"
```

Unknown command types are silently skipped (forward-compatible).

### Command types

#### `set_provider`

Configures the AI provider inside the agent container. Triggered by the UI via `POST /agents/:id/execute-command` when the user completes the wizard. Can be re-run from the UI.

**Variables substituted by the host:**

| Variable | Value | Description |
|---|---|---|
| `$baseUrl` | `http://host.docker.internal:3000/api/ai-proxy/<slug>` | AI proxy URL. Routes the agent through the host proxy, which injects the real API key. |
| `$modelName` | Resolved model name | The model to use (`default` → provider's default model). |
| `$apiKey` | `123456` | **Fake** placeholder. The real key is injected by the proxy at request time. Never the real key. |
| `$providerName` | Provider display name | e.g. `OpenAI`, `Ollama Local`. |
| `$providerType` | `openai` / `azure` / `anthropic` | The provider's type. |

The script typically writes these values into the agent's config files (e.g. environment variables, config files) so the agent's HTTP client points at the proxy instead of the real provider.

#### `set_git_proxy`

Installs the git proxy shim inside the agent container. Triggered by the UI via `POST /agents/:id/execute-command` (typically after `set_provider`, before `start_agent`).

**Variables substituted by the host:**

| Variable | Value | Description |
|---|---|---|
| `$downloadUrl` | `http://host.docker.internal:3000/api/git/shim` | URL to download the git shim script from the host. |

The script (bundled in the template image) typically:
1. Backs up the original `git` binary to `/usr/local/bin/git.original`.
2. Downloads the shim from `$downloadUrl`.
3. Installs it at `/usr/local/bin/git` with `chmod +x`.

From that point, all `git` calls in the container are forwarded to the host. See [Git Proxy](./git-proxy.md) for details.

#### `start_agent`

Starts the agent's main process. Triggered by the UI via `POST /agents/:id/execute-command` (last step in the wizard) and automatically on agent start/restart.

No variables are substituted. The command is executed detached (fire-and-forget) since it typically launches a long-running process.

#### `stop_agent`

Stops the agent's main process. Executed automatically on agent stop/restart (before the container is stopped).

No variables are substituted.

#### `add_mcp_server`

Adds an MCP server configuration to the agent. Auto-run during creation for each selected MCP (autoConnectMcps).

**Variables substituted by the host:**

| Variable | Value | Description |
|---|---|---|
| `$name` | MCP server name | The MCP server to add. |

#### `remove_mcp_server`

Removes an MCP server configuration from the agent.

**Variables:** `$name` — MCP server name.

#### `get_mcps`

Lists currently configured MCP servers (JSON output).

#### `add_skill`

Adds a skill file to the agent.

**Variables substituted by the host:**

| Variable | Value | Description |
|---|---|---|
| `$name` | Skill name | The skill to add. |

#### `remove_skill`

Removes a skill from the agent.

**Variables:** `$name` — Skill name.

#### `get_skills`

Lists currently configured skills (JSON output).

## Environment variables

CodePods sets these environment variables in every agent container at creation time:

| Variable | Value | Used by |
|---|---|---|
| `CODEPODS_AGENT_ID` | Stable agent id (12-char hex, generated at creation) | Git proxy shim — identifies the agent to the host. Stable across renames. |
| `CODEPODS_AGENT_NAME` | Agent's name (e.g. `copilot-1`) | Git proxy shim — legacy fallback for agents created before `CODEPODS_AGENT_ID` existed. |
| `CODEPODS_API_URL` | `http://host.docker.internal:3000/api` | Base URL for the host API (git shim, AI proxy, etc.). |
| `CODEPODS_INTERNAL_TOKEN` | Internal token (generated at startup) | Git proxy shim — sent as `X-Internal-Token` header for authentication. |

User-supplied environment variables (set via the API) are also injected.

## Execution order

During agent creation, `create()`:

1. **Ensure image** — clone template repo, parse manifest, build Docker image if needed.
2. **Create container** — start container with workspace bind-mount (if any) and env vars.
3. **`add_mcp_server`** — auto-run for each selected MCP (autoConnectMcps). This is the **only** command auto-run during creation.

The `set_provider`, `set_git_proxy`, and `start_agent` commands are **not** auto-run during creation. They are triggered individually by the UI via `POST /agents/:id/execute-command` when the user completes the wizard.

On agent restart: `stop_agent` → `start_agent` (no container restart).

## Example: minimal template

```
my-template/
├── Dockerfile
├── manifest.yml      # name, home_path (required), workspace_path, commands, services
└── scripts/
    ├── set-provider.sh
    ├── set-git-proxy.sh
    └── start-agent.sh
```

```yaml
# manifest.yml
display_name: "My Agent"
description: "A custom agent template"
workspace_path: "/workspace"

services:
  - "terminal|Shell|7681"

commands:
  - set_provider: "/scripts/set-provider.sh $baseUrl $modelName $apiKey $providerName $providerType"
  - set_git_proxy: "/scripts/set-git-proxy.sh $downloadUrl"
  - start_agent: "/scripts/start-agent.sh"
```

```dockerfile
# Dockerfile
FROM node:20-slim

RUN apt-get update && apt-get install -y git curl python3 && rm -rf /var/lib/apt/lists/*

COPY scripts/ /scripts/
RUN chmod +x /scripts/*.sh

WORKDIR /workspace
```

## Current limitations

- **No template versioning** — templates are pulled from the default branch; there's no pinning to a specific commit or tag.
- **No template marketplace UI** — templates are added via central-repo discovery or direct Git URL; browsing/searching is minimal.
- **Limited manifest validation** — unknown fields are silently ignored; service port collisions are not pre-checked.
- **No health-check command** — the manifest supports `start_agent`/`stop_agent` but has no `healthcheck` hook for readiness probes.

## Key files

| File | Role |
|---|---|
| `apps/api/src/agents/agents.service.ts` | Template repo cloning, manifest parsing, image building |
| `apps/api/src/central-repos/` | Template discovery from central repositories |
| `apps/api/src/images/image-template.entity.ts` | `image_template` entity (cached template metadata) |