# CodePods

> **Beta** — Web-based platform for managing AI coding agents in Docker containers. Run isolated agent containers, access their terminals from the browser, proxy AI providers, manage MCP servers, and more.

CodePods gives you a browser UI to create, start, stop, and manage AI coding agents running in isolated Docker containers. Each agent gets its own home directory, an optional shared workspace, a web terminal (xterm.js over WebSocket), and access to proxied AI providers, MCP servers, and skills — all without ever seeing the real API keys or credentials.

## Requirements

- **Node.js** >= 20 (tested on v22)
- **pnpm** >= 9 (`corepack enable && corepack prepare pnpm@9 --activate`)
- **Docker** (daemon running on `/var/run/docker.sock`)
- **build-essential** (for `node-pty` native module compilation — `apt install build-essential` on Debian/Ubuntu)
- **setfacl** (for per-agent filesystem ACLs — `apt install acl` on Debian/Ubuntu; needed when `forceNonRootUser` is ON)

## Quick Start

```bash
# 1. Clone
git clone https://github.com/bcgrillo/codepods.git
cd codepods

# 2. Install dependencies
pnpm install

# 3. Build everything
pnpm build

# 4. First-run setup (creates the admin user)
cd apps/api
node dist/cli.js setup
# You'll be prompted to set a password (or one will be generated and shown once)

# 5. Start the server
cd ../..
pnpm --filter @codepods/api start
```

Then open http://localhost:3000 in your browser. The backend serves the frontend SPA at `/` in production mode.

### Development mode

For development with hot reload:

```bash
pnpm install
pnpm dev
```

- Frontend: http://localhost:5173 (Vite dev server with HMR)
- API: http://localhost:3000/api
- Vite proxies `/api` and `/socket.io` to the backend automatically.

## First Run

1. **Build**: `pnpm build` compiles all packages and apps.
2. **Setup**: `node dist/cli.js setup` (from `apps/api/`) creates the admin user. You'll set or receive a password.
3. **Start**: `node dist/main.js` (from `apps/api/`) or `pnpm --filter @codepods/api start`.
4. **Login**: Open http://localhost:3000, log in with the admin credentials.
5. **First device**: On first login from a new browser/device, you'll get a 6-char approval code. Approve it from the host: `node dist/cli.js approve <code>` (from `apps/api/`).
6. **Create an agent**: Navigate to Agents → New, pick a template from the marketplace, and create your first agent.

## Configuration

Config file: `~/.codepods/config.json` (auto-created with defaults, mode 0600).

Key settings:

| Setting | Default | Description |
|---|---|---|
| `dataDir` | `./data/` | Data directory (SQLite DB, repos, keys, skills) |
| `port` | `3000` | HTTP API port |
| `docker.forceNonRootUser` | `false` | Per-agent dedicated uid with ACL isolation |
| `networkSecurity.filterInternetEgress` | `true` | Filter agent internet traffic through egress proxy whitelist. API gateway always active. |
| `tlsEnabled` | `false` | Enable HTTPS |

See [Configuration](docs/config.md) for the full reference. Environment variables (`DATA_DIR`, `PORT`, `TLS_ENABLED`, etc.) override file values.

## Project Structure

```
apps/
  web/               # React 18 + Vite 5 frontend
  api/               # NestJS 10 backend
packages/
  shared-types/      # Shared TypeScript interfaces and DTOs
  shared-config/     # Shared app configuration types
  shared-validation/ # Zod validation schemas
  sdk/               # Type-safe HTTP client
```

Package manager: pnpm 9+ with workspaces.

## Scripts

```bash
pnpm dev          # Start all apps in parallel (watch mode)
pnpm build        # Build all apps and packages
pnpm test         # Run all unit tests
pnpm type-check   # TypeScript type check across all packages
pnpm lint         # ESLint all packages
```

## Data

- SQLite database: `<dataDir>/codepods.db` (default: `apps/api/data/codepods.db`)
- Encryption keys: `<dataDir>/keys/master.key`
- Agent homes: `<dataDir>/homes/<agentId>/`
- Skills: `<dataDir>/skills/`
- Discovered repos: `<dataDir>/repos/`

Override the data directory: `DATA_DIR=/path/to/dir`

## Current Limitations (Beta)

CodePods is in beta. Here's what to be aware of:

- **Single CodePod**: only `id=1` ("default") exists. Multi-tenant support is coming.
- **Single user**: only one admin account. Multi-user with roles is planned.
- **Container→API auth**: agent identity is established via egress proxy (source IP + HMAC, ADR-036). No shared secret in containers. See [Agent Gateway](docs/agent-gateway.md).
- **No DB migrations**: TypeORM `synchronize: true` is used. Migrations needed before production.
- **No audit logging**: critical actions (container start, credential access, git push) are not yet logged.
- **Credential usage tracking**: removing a credential in use leaves a dangling reference; the UI doesn't yet show where credentials are used.
- **stdio MCP transport**: only HTTP MCP transport is supported; stdio is coming.

## Documentation

- [Documentation Style Guide](docs/STYLE.md) — Structure, conventions, and template for all docs

### Architecture & Systems

- [Frontend Architecture](docs/frontend.md) — React 18, Tailwind v4, shadcn/ui, 3-pane layout, design system
- [SDK](docs/sdk.md) — Type-safe HTTP client, auth token plumbing
- [System Configuration](docs/config.md) — Config file, env overrides, all settings
- [Network Security](docs/network-security.md) — Egress filtering, host firewall (ufw) requirements

### Modules

- [Agents](docs/agents.md) — Agent lifecycle, creation, command execution, requests
- [Console](docs/console.md) — WebSocket terminal (node-pty + xterm.js)
- [Authentication](docs/auth.md) — Admin auth, device approval, token mechanism
- [AI Proxy](docs/ai-proxy.md) — Provider proxy with key injection
- [MCP](docs/mcp.md) — Model Context Protocol server registry and proxy
- [Managed APIs](docs/managed-apis.md) — External HTTP API registry with credential injection
- [Skills](docs/skills.md) — Skill sources, SKILL.md format, agent delivery
- [Credentials](docs/credentials.md) — Encrypted credential vault (AES-256-GCM)
- [Agent Templates](docs/agent-templates.md) — Template manifest, Dockerfile, commands
- [Central Repositories](docs/central-repos.md) — Template and provider discovery
- [Workspaces](docs/workspaces.md) — Workspaces, git integration
- [Git Proxy](docs/git-proxy.md) — Git command whitelist, identity enforcement
- [Services](docs/services.md) — Agent web service proxy
- [AGENTS.md](docs/agents-md.md) — Versioned agent operative guides
