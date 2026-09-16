# System Configuration

The system-wide configuration store for a CodePods instance. Loads, merges, and saves a JSON config file at `~/.codepods/config.json`, with env-var overrides for containerized deployments. Governs networking, TLS, Docker container hardening, git security, and central repository discovery.

## TL;DR

- Config file: `~/.codepods/config.json` (mode 0600, auto-created with defaults if missing).
- Deep-merges nested `docker`, `networkSecurity`, and `gitSecurity` sections so partial files don't wipe defaults.
- Env vars override file values for a subset of keys (highest priority).
- `PATCH /config` persists changes and hot-reloads the egress proxy; `POST /config/reload` re-reads from disk.

## Endpoints

| Method | Route | Purpose |
|---|---|---|
| GET | `/config` | Return full config |
| PATCH | `/config` | Partial update (persists to file), then reloads egress proxy |
| POST | `/config/reload` | Re-read config from disk (discard in-memory), then reload egress proxy |

## Configuration sections

### Core

| Key | Default | Description |
|---|---|---|
| `dataDir` | `./data/` | Data directory (SQLite DB, repos, keys) |
| `port` | `3000` | HTTP API port |
| `corsOrigin` | — | Allowed CORS origin |
| `swaggerEnabled` | `false` | Enable Swagger UI at `/api/docs` |
| `publicUrl` | — | Public-facing URL (for callbacks, links) |
| `buildKit` | `true` | Use Docker BuildKit |

### Git identity

| Key | Default | Description |
|---|---|---|
| `gitUserName` | — | Git commit author name |
| `gitUserEmail` | — | Git commit author email |
| `useGenericGitIdentity` | `false` | Use a generic identity for all agents |

### Central repos

| Key | Default | Description |
|---|---|---|
| `templateRepositories` | `[{ url: 'codepods-templates.git', branch: 'main' }]` | Template discovery repos |
| `providerRepositories` | `[{ url: 'codepods-providers.git', branch: 'main' }]` | AI provider discovery repos |

### TLS

| Key | Default | Description |
|---|---|---|
| `tlsEnabled` | `false` | Enable HTTPS |
| `tlsCertPath` | — | Path to TLS certificate |
| `tlsKeyPath` | — | Path to TLS private key |
| `tlsPort` | `3443` | HTTPS port |

### Docker hardening (`docker`)

| Key | Default | Description |
|---|---|---|
| `autoRemove` | `false` | Remove container on stop |
| `readOnly` | `true` | Read-only root filesystem |
| `tmpfsSize` | `64m` | tmpfs size for `/tmp` |
| `capDropAll` | `true` | Drop all Linux capabilities |
| `noNewPrivileges` | `true` | Prevent privilege escalation |
| `pidsLimit` | `512` | Max processes per container |
| `memoryLimit` | `2g` | Memory limit |
| `cpuLimit` | `2` | CPU quota |
| `runtime` | — | Container runtime (e.g. `runsc` for gVisor) |
| `forceNonRootUser` | `false` | Assign dedicated host uid per agent (ADR-029) |
| `agentUidRange` | `{ start: 55001, end: 65000 }` | UID range for per-agent isolation |
| `customArgs` | `[]` | Extra `docker run` arguments |

### Network security (`networkSecurity`)

| Key | Default | Description |
|---|---|---|
| `filterInternetEgress` | `true` | Filter agent internet traffic through egress whitelist. API gateway always active regardless. |
| `egressWhitelist` | (from `default-egress-whitelist.txt`) | Allowed outbound domains |
| `proxyPort` | `8888` | Egress proxy port |
| `dropNetRaw` | `true` | Drop `CAP_NET_RAW` from agent containers (prevent IP spoofing) |

See [Network Security](./network-security.md) for the full architecture.

### Git security (`gitSecurity`)

| Key | Default | Description |
|---|---|---|
| `reuseMainRepoCredentials` | `false` | Reuse the main repo credentials for agent git operations |
| `commandWhitelist` | `DEFAULT_GIT_WHITELIST` | Allowed git subcommands |
| `blockGlobalConfig` | `true` | Block `git config --global` from agent containers |
| `blockForcePush` | `true` | Block force-push from agent containers |
| `protectedBranches` | `['main', 'dev']` | Branches protected from agent pushes |
| `blockRemoteManagement` | `true` | Block `git remote add/remove` from agent containers |

See [Git Proxy](./git-proxy.md) for the git security architecture.

## Environment variable overrides

These env vars take precedence over file values:

| Env var | Overrides |
|---|---|
| `DATA_DIR` | `dataDir` |
| `PORT` | `port` |
| `CORS_ORIGIN` | `corsOrigin` |
| `SWAGGER_ENABLED` | `swaggerEnabled` |
| `CODEPODS_PUBLIC_URL` | `publicUrl` |
| `DOCKER_BUILDKIT` | `buildKit` |
| `TLS_ENABLED` | `tlsEnabled` |
| `TLS_CERT_PATH` | `tlsCertPath` |
| `TLS_KEY_PATH` | `tlsKeyPath` |
| `TLS_PORT` | `tlsPort` |

> Env-only values are not written back to the file on save — `saveConfigSync` persists file values without env overrides.

## Legacy migration

- Old `docker.user` string → `forceNonRootUser` boolean (empty string = OFF, any value = ON). See ADR-027/ADR-029.
- Deep-merge handles partial config files gracefully.

## Key files

| File | Role |
|---|---|
| `apps/api/src/config/config.controller.ts` | Endpoints |
| `apps/api/src/config/config.service.ts` | In-memory config + `update`/`reload` |
| `apps/api/src/config/config.util.ts` | `loadConfigSync`, deep-merge, env overrides, legacy migration |
| `packages/shared-config/` | `CodepodsConfig` type definition |

## Current limitations

- **No schema validation on save** — `PATCH /config` accepts any shape; invalid values may cause runtime errors instead of a clean validation error.
- **Env overrides are not persisted** — `saveConfigSync` writes file values only; env-set values are lost on save.
- **No config versioning** — there's no migration system for config file schema changes beyond the legacy `docker.user` → `forceNonRootUser` conversion.
- **Git command whitelist is not editable via config** — `gitSecurity.commandWhitelist` is defined in code, not configurable from the UI (planned).