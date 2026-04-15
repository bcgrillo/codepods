# TODO - .NET Full Migration

Reference plan:
- `docs/agent-gateway-mvp-plan.md` (current MVP scope and AgentGateway tasks)

Current execution context:
- Active implementation branch for next phase: `feature/agent-gateway-mvp`.
- Planning and requirements baseline is now tracked in `docs/agent-gateway-mvp-plan.md`.
- Frontend parity and install hardening were recently delivered in `feature/frontend-shadcn-bootstrap`; this branch now continues with AgentGateway MVP design/implementation.

0. Migration sequencing (agreed)
- First: complete 100% Python functionality parity in .NET (single .NET runtime path).
- Second: replace Docker CLI process integration with `Docker.DotNet` as the only Docker communication implementation (no dual runtime implementation).
- Third: start test rollout by layers, with dedicated TODO and progressive coverage.

1. Relay runtime parity in .NET
- Implement HTTPS relay listeners per enabled `relay_binding`.
- Enforce relay cookie on every proxied request.
- Keep `/relay/?relay_token=...` as bootstrap-only URL and redirect to clean relay URL.

2. Agent runtime parity in .NET
- Validate and harden execution of existing agent-type scripts (`shared/configure.sh` + `<type>/configure.sh`) from .NET runtime.
- Validate full template render tree behavior from `templates/*/files/**/*.template` under real agent types.
- Keep manifest-driven behavior as single source of truth (do not rewrite agent-type scripts to C#).

3. API parity expansion
- Polish users/devices management endpoints parity and contracts.
- Polish providers/repositories/codepods/variables/agent-files response parity.
- Keep OpenAPI docs aligned with runtime behavior and auth rules.
- Added host settings API surface (`GET/PUT /api/settings/config`, `POST /api/settings/reload`) backed by shared core logic.

4. CLI parity expansion
- Polish `web` command group parity (`start/stop/status/restart/relays/users/devices/login`) and UX details.
- Polish command parity for providers/repositories/codepods/variables/agent-files.
- Polish interactive `menu` UX parity (styling/details) and add missing actions where needed.
- Preserve direct core use-cases (no internal API calls).
- Add equivalent `agents types/next-name/trash` command UX polishing and docs.
- Added `codepods web reload|reload-config` using the same shared settings/reload use-case as API.

5. End-to-end validation
- Run `dotnet restore/build/test` in a network-enabled environment.
- Validate Docker create/sleep/wake/remove + relay ensure/token/bootstrap flow.

6. Cutover cleanup
- Replace installer/shim to point to .NET runtime only.
- Remove active Python runtime path once .NET parity is confirmed.
- Keep legacy Python sources in backup path (`legacy/python`) during transition, but never used by default execution path.

7. Device fingerprint UX note
- Keep device IDs non-recoverable by design.
- Expose only fingerprint (and a short version in CLI output) as operational identifier.

8. Docker integration migration
- Replace `DockerAgentRuntime` process-based Docker calls with `Docker.DotNet` in a single implementation path.
- Keep `IAgentRuntime` contract stable while moving internals to Docker SDK.
- Validate agent lifecycle and relay dependencies after SDK migration.

9. Testing roadmap (specific TODO)
- Unit tests for use-cases (`AgentUseCase`, `AuthUseCase`, `RelayUseCase`, `UserDeviceUseCase`, CRUD use-cases).
- Integration tests for repositories/SQLite mappings (`CodepodsDbContext` + repository behavior).
- Integration tests for runtime adapters (Docker-dependent tests separated by profile/tag).
- Integration tests for external web-host controller boundary (`IWebHostController`) with process lifecycle scenarios.
- API contract tests for critical endpoints/auth flows/relay bootstrap.
- Status update (now): `tests/Codepods.Tests` scaffold created and added to solution; initial unit tests added for `AgentUseCase` and `UserDeviceUseCase`; initial DI boundary test added for `IWebHostController` resolution.
- Runtime filesystem interactions are being centralized behind `IFileSystem` to enable mock-based runtime tests.

10. Frontend bootstrap (new)
- Keep backend-first contract: frontend consumes API only, no business logic duplicated in UI.
- Added clean seed project `src/Codepods.Frontend` (Vite + React + Tailwind + shadcn init).
- Added reference-only source `examples/shadcn-admin-reference` to copy selected UI patterns.
- Added build sync flow so API can serve SPA from `src/Codepods.Api/wwwroot`.
- `install.sh` must always build frontend and sync `wwwroot` as part of installation.
- Settings page now includes host runtime config management UI backed by `/api/settings/*`.

11. Distribution and installation
- Publish multi-platform .NET CLI artifacts via GitHub Actions (release assets).
- Provide release installer script for users outside package managers.
- Keep `install.sh` as dev installer (publish local repo and register shim).
- Add future `self-update` command after first release pipeline is stable.

12. Frontend parity operating mode (locked)
- Use copy-first replication from `examples/shadcn-admin-reference` for layout/UI pieces.
- Prioritize literal cloning over reinterpretation for sidebar/header/topbar/profile behaviors.
- Keep unavoidable adaptations minimal, isolated, and explicitly documented.
- Prefer temporary fake/no-op controls over visual divergence from reference.

13. Templates file manager (new)
- UX target:
- Add full file management UI per agent type with a flattened table style (like Variables table).
- File names shown as relative paths, e.g. `folder1/folder2/file.txt`.
- Keep parent menu item (`Templates`) non-active when a sub-item is active; only the selected sub-item should be highlighted.
- Sidebar submenu behavior should keep visual parity with example settings submenu interactions.
- Frontend scope (phased):
- Phase 1 (MVP): list files + create file + edit content + delete file.
- Phase 2: rename/move file path (single action flow, separate from content editing flow).
- Phase 3: quality improvements (search/filter, extension badges, unsaved changes guard, keyboard shortcuts).
- Editor UX:
- Use right-side drawer (same pattern as Variables/New Agent), but wider than current drawers.
- Include a simple code-like editor: monospace font, line numbers, vertical scroll, preserve whitespace.
- No heavy IDE integration required in MVP.
- API/Core/Runtime changes needed:
- Current template file API only supports read/write; this is not enough for full CRUD.
- Add endpoints:
- `GET /api/templates` -> list template folders.
- `GET /api/templates/{templateName}/files` -> flattened list of relative file paths + metadata (size/updated_at/is_text_editable).
- `POST /api/templates/{templateName}/files` -> create file (text or base64 payload).
- `PUT /api/templates/{templateName}/files/{*filePath}` -> update file (text or base64 payload).
- `POST /api/templates/{templateName}/files/rename` -> rename/move path (`from_path`, `to_path`).
- `DELETE /api/templates/{templateName}/files/{*filePath}` -> delete file.
- Extend `IAgentTypeFileStore` + `AgentFileUseCase` to support list/create/delete/rename and binary-safe write paths with traversal protection.
- Extend `IFileSystem` with file operations currently missing for this scope:
- file delete, file move, file length/last-write-time (optional metadata).
- Delivery order:
- 1) Backend contracts + use-case + runtime file store tests.
- 2) Frontend table + drawer with edit/create/delete.
- 3) Frontend rename/move flow (separate action to avoid mixed state complexity).
- Status update (now):
- Implemented end-to-end CRUD+rename baseline:
- API: list/read/create/update/delete/rename endpoints under `/api/templates/*`.
- Core/Runtime: `IAgentTypeFileStore` + `AgentFileUseCase` + filesystem adapter support list/create/delete/rename + binary writes.
- Frontend: `Templates` pages render flattened files table with actions, upload support, and wide drawer editor (text files only).

14. Frontend parity polish (requested)
- Icons in `/agents` cards aligned to example app-card visual style.
- `/variables` and `/templates/{name}` use shared reusable table shell + compact row/header spacing.
- Filter bars in `/variables` and `/templates/{name}` migrated to shared toolbar matching example compact pattern.
- Mobile drawers now open full-width; desktop widths preserved (`/templates` editor keeps wider panel).
- Drawer footer actions normalized to side-by-side button layout like Settings.
- Context menu options in table row actions now consistently include icons.
- Sidebar team menu text adjusted (`Codepods`, `Default`, `Add codepod`) and profile menu simplified.
- Added sidebar `Help` entry + build version (git tag or commit short hash) and new `/help` page scaffold.
- Added backend endpoints for help/version: `GET /api/system/version`, `GET /api/help/about`.
