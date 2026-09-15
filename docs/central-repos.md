# Central Repositories (Template & Provider Discovery)

Discovers agent **templates** and AI **providers** from configured central (marketplace) git repositories. Clones each repo shallowly, reads `manifest.yml` from each top-level subfolder, and returns parsed metadata on the fly. Nothing discovered is persisted to the DB — discovery results are ephemeral; persistence happens only when a user materializes a template or creates a provider.

## TL;DR

- Template and provider repos are configured in Settings → Central repositories (`templateRepositories`, `providerRepositories`).
- Each repo is shallow-cloned into `dataDir/repos/<kind>/<index>/` and kept current via `git fetch + reset --hard`.
- Discovery reads `manifest.yml` from every top-level folder; results are returned on every API call (no DB persistence).
- Icons/logos are served via a public endpoint (no auth) so `<img>` tags can load them.

## Endpoints

| Method | Route | Purpose |
|---|---|---|
| GET | `/central-repos/templates` | Discover + return all templates from configured repos |
| GET | `/central-repos/providers` | Discover + return all providers from configured repos |
| GET | `/central-repos/repo-file/:kind/:repoPath/:file` | Serve a cached icon/logo asset (`@Public()`) |

## Discovery flow

```
Config templateRepositories[]          Config providerRepositories[]
         │                                       │
         ▼                                       ▼
  ensureRepo (clone / fetch+reset)      ensureRepo (clone / fetch+reset)
         │                                       │
         ▼                                       ▼
  listFolders (top-level dirs)          listFolders (top-level dirs)
         │                                       │
         ▼                                       ▼
  readManifestYaml per folder           readManifestYaml per folder
         │                                       │
         ▼                                       ▼
  DiscoveredTemplate[]                  DiscoveredProvider[]
```

1. For each configured repo: `ensureRepo` — clones with `git clone --depth 1 --branch <branch>` if missing, or `git fetch --depth 1` + `git reset --hard FETCH_HEAD` to update. The resolved HEAD is saved to config as `cachedRef`.
2. `listFolders` scans top-level directories (sorted).
3. For each folder, `readManifestYaml` parses `manifest.yml`. Folders without a manifest are skipped.
4. Results are returned directly — no DB write.

## Template manifest

```yaml
# manifest.yml (template)
display_name: "Claude Code Agent"
description: "Agent with Claude Code CLI pre-installed"
icon: icon.svg
icon_dark: icon-dark.svg
workspace_path: workspace
services:
  - terminal|ttyd|7681
commands:
  - set_provider|anthropic|ANTHROPIC_API_KEY
```

→ `DiscoveredTemplate`: `slug` (folder name), `repoUrl`, `repoPath`, `branch`, `displayName`, `description`, `icon`/`iconDark`, `workspacePath`, `services[]`, `commands[]`.

## Provider manifest

```yaml
# manifest.yml (provider)
display_name: "OpenAI"
description: "GPT-4, GPT-3.5, and other OpenAI models"
icon: openai.svg
icon_dark: openai-dark.svg
base_url: https://api.openai.com/v1
doc_url: https://platform.openai.com/docs/api-keys
```

→ `DiscoveredProvider`: `slug`, `repoUrl`, `repoPath`, `branch`, `displayName`, `description`, `icon`/`iconDark`, `baseUrl`, `docUrl`.

## Asset serving (`repoFile`)

- Route: `GET /central-repos/repo-file/:kind/:repoPath/:file` — `@Public()` (no auth) because `<img>` tags cannot send auth headers.
- `kind` ∈ `{ templates, providers }`.
- Path-traversal guard: rejects `..`, `/`, `\` in path segments.
- Scans all numeric index dirs under the repos root for a matching `folder/file`.
- MIME guessed from extension (svg/png/jpg).
- In-memory `fileCache` (Map, bounded to 256 entries, LRU-evict oldest).
- Served with `Cache-Control: public, max-age=3600`.

## Current limitations

- **Synchronous and blocking**: repos are processed sequentially; a large/slow repo stalls the whole request.
- **No parsed-result caching**: every call re-clones/updates and re-reads manifests (icon-level cache exists, but manifest results are recomputed).
- **`repoFile` ignores the `index` param**: searches all index dirs, so duplicate folder names across repos resolve to "first found".
- `cachedRef` is written to config on every sync (a write-per-discovery side effect).

## Key files

| File | Role |
|---|---|
| `apps/api/src/central-repos/central-repos.controller.ts` | Discovery + asset endpoints |
| `apps/api/src/central-repos/central-repos.service.ts` | `ensureRepo`, `discoverTemplates`, `discoverProviders`, `repoFile` |
| `packages/shared-types/discovery.ts` | `DiscoveredTemplate`, `DiscoveredProvider` types |
| `packages/shared-types/config.ts` | `CentralRepoConfig` type |