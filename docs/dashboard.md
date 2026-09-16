# Dashboard

The dashboard is the system home page. It shows host resource usage (CPU, memory, disk), a sortable per-agent stats table with a non-codepods toggle, and a cleanup center for reclaiming disk space from orphaned workspaces, orphaned homes, and unused Docker images.

## TL;DR

- Home page at `/dashboard` — first thing the user sees when opening the web UI.
- 4 compact cards (CPU / Memory / Disk / Cleanup) with resource bars and action buttons anchored to the bottom of each card. Clicking a card header sorts the agent table by that metric and highlights the column.
- Agent stats table: sortable columns (CPU, MEM, DISK, Processes), status colors (running=green, stopped/exited=red, unknown=gray), (i) info icon after the agent name that copies the container ID on click. Non-codepods toggle (shadcn Switch) merges external containers into the table with `N/A` + External badge.
- Cleanup center: three tables (orphaned workspaces, orphaned homes, unused Docker images) with checkboxes, select-all in headers (with indeterminate state), size columns, and a footer with total + selected cleanable space and a delete button with confirmation.
- All data comes from a single `SystemService` that aggregates Docker, agents, workspaces, and homes.

## Endpoints

| Method | Route | Auth | Purpose |
|---|---|---|---|
| GET | `/system/stats` | Admin | Host CPU%/mem/disk + agent/container counts |
| GET | `/system/agents-stats` | Admin | Per-agent Docker stats (CPU%, mem, disk writable + virtual, processes, workspace/home/total sizes, container name + full ID). `?includeNonCodepods=true` merges external containers. |
| GET | `/system/non-codepods-containers` | Admin | Non-codepods Docker containers with stats |
| GET | `/system/cleanup-check` | Admin | Orphaned workspaces (with size), orphaned homes (with size), unused Docker images (with real sizes) |
| DELETE | `/system/docker-image?ref=<ref>` | Admin | Remove unused Docker image (`docker rmi -f`) |
| DELETE | `/system/orphaned-home?agentId=<id>` | Admin | Remove orphaned home directory (`fs.rmSync` recursive) |

Orphaned workspace deletion uses the existing `DELETE /workspaces/:id` endpoint.

## How it works

```
Web UI (Dashboard)
   │
   ├── GET /system/stats ──► SystemService.getSystemStats()
   │                            ├─ os.cpus() delta (CPU%)
   │                            ├─ os.totalmem/freemem (MEM)
   │                            ├─ df -B1 / (DISK)
   │                            └─ agent/container counts
   │
   ├── GET /system/agents-stats ──► SystemService.getAgentStats()
   │                                ├─ per-agent: container.stats({stream:false})
   │                                ├─ batch listContainers({all,size}) for disk sizes
   │                                ├─ workspace size + shared marker + home size + total
   │                                └─ container name + full ID
   │
   └── GET /system/cleanup-check ──► SystemService.getCleanupCheck()
                                   ├─ Orphaned workspaces: DB records with NO agent linked
                                   ├─ Orphaned homes: <dataDir>/homes/<agentId> dirs
                                   │   whose agentId has no DB agent record
                                   └─ Unused Docker images: docker.listImages() minus
                                       those referenced by any container ImageID
```

1. The dashboard loads `getSystemStats()` + `getAgentStats()` on mount, showing a `Loader2` spinner while data loads.
2. The 4 cards show resource bars; clicking a card header sorts the agent table by that metric and highlights the column.
3. The non-codepods Switch toggles `includeNonCodepods=true`, merging external containers into the table with `N/A` values + External badge.
4. The cleanup card links to `/dashboard/cleanup`.
5. Cleanup fetches `getCleanupCheck()` — lists orphaned workspaces (with size + git warnings), orphaned homes (with size), and unused Docker images (with real sizes from `docker images`).

### Cleanup classification

| State | Description | In cleanup? |
|---|---|---|
| **Active** | Agent running, linked to workspace | No |
| **Inactive** | Agent in DB but stopped | No (see limitation below) |
| **Orphaned workspace** | DB workspace record with no agent linked at all | Yes (deletable) |
| **Orphaned home** | `<dataDir>/homes/<agentId>` directory with no matching agent in DB | Yes (deletable) |
| **Unused Docker image** | Docker image not referenced by any container (running or stopped) | Yes (deletable via `docker rmi -f`) |

### Disk size notes

- Container sizes use SI units (1000-based) to match `docker ps -s`: shows `SizeRw` (writable layer) / `SizeRootFs` (virtual total).
- Workspace size excludes `.git` (computed via `du`-equivalent). A `*` marker indicates a shared workspace (>1 agent uses it).
- Home size is computed recursively.
- Total size = container virtual size + workspace size + home size.
- Docker images share layers — `docker rmi` only frees layers not referenced by other images, so actual space freed may be less than the image size shown.

## Current limitations

- **Stopped-agent cleanup not implemented** — workspaces whose agent is stopped (but still in the DB) are NOT shown as orphaned. A future enhancement could add a "stopped agent" category. The `OrphanedWorkspace` type retains a `stoppedAgentCount` field (always 0 for now) for this future use.
- **Phantom workspace folders** — filesystem workspace directories with no DB record are not detected (only DB records are checked). Future enhancement.
- **No real-time updates** — stats are fetched on mount and on manual refresh. No WebSocket/polling for live updates.
- **Image layer sharing** — `docker rmi` frees only unshared layers; the size shown is the image's total size, not the reclaimable space.

## Key files

| File | Role |
|---|---|
| `apps/api/src/system/system.service.ts` | Aggregates Docker, agents, workspaces, and homes data |
| `apps/api/src/system/system.controller.ts` | 4 GET + 2 DELETE endpoints |
| `apps/api/src/system/system.module.ts` | NestJS module wiring |
| `apps/api/src/docker/docker.service.ts` | `listContainerSizes()`, `listImages()`, `removeImage()`, `getContainerStats()` |
| `apps/api/src/homes/homes.service.ts` | `listOrphanedHomes()`, `removeHome()`, `dirSize()` |
| `packages/shared-types/src/dashboard.ts` | Type definitions (SystemStats, AgentStats, CleanupCheckResult, OrphanedWorkspace, OrphanedHome, UnusedDockerImage, etc.) |
| `packages/sdk/src/system.client.ts` | SDK client for system endpoints |
| `apps/web/src/components/dashboard/Dashboard.tsx` | Home page with 4 cards + agent stats table |
| `apps/web/src/components/dashboard/CleanupView.tsx` | Cleanup center with 3 tables, checkboxes, select-all, footer |
| `apps/web/src/hooks/useSystem.ts` | React Query hooks for system endpoints |
| `apps/web/src/index.css` | `--success` + `--warning` CSS variables (light + dark) |