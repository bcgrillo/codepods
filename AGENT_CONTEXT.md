1. Project: Codepods (CodexAgentsManager)
2. Active branch: feature/agent-gateway-mvp
3. Migration mode: full replacement to .NET (no legacy compatibility branches)
   - Sequencing locked: parity first, then Docker SDK migration, then test rollout.
4. Implemented in .NET:
   - Core domain/use-cases (agents, relays, auth bootstrap/login)
   - EF Core persistence (SQLite tables: agent, relay_binding, user, authorized_device)
   - API endpoints for auth, agents, relays, relay bootstrap `/relay`
   - CLI commands for agents/relays/auth
5. Implemented now:
   - Docker runtime reads manifest mounts and prepares env-file from templates
   - Agent lifecycle parity extended: wake/sleep/remove in core + API + CLI
   - Added .NET domain/repository/use-case/API/CLI support for providers, repositories, codepods, variables, and agent-files
   - Added variable secret encryption/decryption in .NET core flow
   - Added interactive `codepods menu` in .NET CLI with arrow-key navigation and per-agent actions
   - Added `codepods web users/devices/login` command family in .NET CLI (shared core logic)
   - Added `codepods web start/stop/status/restart/relays` command flow in .NET CLI
   - Web host process management is now encapsulated behind `IWebHostController` (external integration boundary)
   - Runtime now renders agent template trees and executes shared/type configure scripts during agent creation
   - Added shared agent workspace logic for `next-name`, trash listing, and restore-aware agent creation
   - Added API endpoints `/api/agents/types`, `/api/agents/next-name`, `/api/agents/trash`
   - Aligned key API contracts to snake_case payloads for auth/agents/relays compatibility
   - Added `/api/users` and `/api/devices/{username}` endpoints in .NET API
6. Pending migration work:
   - Relay listener/proxy runtime parity (HTTPS listener on relay ports with cookie enforcement)
   - Agent runtime parity by executing existing agent-type script contract from .NET (`configure.sh`, templates, `start_command`)
   - Users/devices management commands/endpoints parity in .NET CLI/API
   - API/CLI UX parity improvements and parity polish
   - Replace Docker process-based runtime integration with `Docker.DotNet` as single implementation after parity closure
   - Continue dedicated layered testing rollout (unit/integration/api contracts) after Docker SDK migration
   - Parity polishing for new providers/repositories/codepods/variables/agent-files contracts
   - Frontend implementation phase started: seed UI only, API-first integration
7. Testing status:
   - `tests/Codepods.Tests` added to solution.
   - Initial unit tests implemented:
     - `AgentUseCase` lifecycle convergence (create/wake/sleep/remove) with in-memory fakes.
     - `UserDeviceUseCase` add/list/remove flow with in-memory fakes.
   - Initial composition boundary test implemented for `IWebHostController` resolution via runtime DI.
8. Validation status:
   - User environment builds successfully after iterative fixes (`dotnet build` OK reported)
9. Guardrails:
   - CLI and API must call shared core logic directly (no CLI->API internal calls)
   - Creating/removing agents must converge runtime + DB atomically at use-case level
   - `agent-types/*` scripts are not migrated to C#: .NET runtime executes them as contract
10. Frontend bootstrap status:
   - Added reference repo copy at `examples/shadcn-admin-reference` (not product code).
   - Added clean UI seed at `src/Codepods.Frontend` (Vite + React + Tailwind + shadcn).
   - API now serves SPA static files from `wwwroot` when build artifacts are present.
11. Installation/distribution status:
   - `scripts/codepods` now routes to .NET CLI only (published DLL if present, otherwise `dotnet run`).
   - `install.sh` switched to .NET dev install flow (`dotnet publish` + global shim to DLL).
   - Added release installer script (`scripts/install-release.sh`) and GitHub Actions release artifact workflow.
   - Legacy Python sources moved to `legacy/python/` as temporary backup and are no longer default CLI execution path.
   - `install.sh` now builds frontend (`npm ci/install` + `npm run build:api`) and validates `Codepods.Api` build before publishing CLI.
12. Runtime testability status:
   - Introduced `IFileSystem` abstraction in runtime and wired it via DI.
   - Runtime filesystem interaction points (workspace, catalog, file store, Docker runtime render/read/write paths) now depend on the abstraction for mockable tests.
13. Frontend replication protocol (mandatory for current phase):
   - Visual target is `examples/shadcn-admin-reference` with copy-first strategy, not "similar" custom design.
   - For sidebar/header/topbar/profile interactions, reuse original example files whenever possible.
   - Required adaptation rule: make only minimal technical changes (router/session/data wiring), and keep them clearly isolated.
   - Keep `src/Codepods.Frontend/src/styles/index.css` and `theme.css` aligned with example; local changes go only in `styles/overrides.css`.
   - If uncertain between removing or keeping an example control: keep the control (even fake/no-op) and remove later.
   - Any unavoidable deltas must be explicitly documented in commit messages and/or local comments near the changed code.
   - Default workflow before implementing new UI:
     1) locate equivalent file in `examples/shadcn-admin-reference`
     2) copy structure verbatim
     3) patch minimal integration points
     4) verify visual parity manually and with build
14. AgentGateway planning baseline:
   - New planning document: `docs/agent-gateway-mvp-plan.md`.
   - Final-state app code policy: no migration compatibility branches in runtime/application code.
   - One-off transitions must be isolated in `migrate.sh`.
15. Latest delivered summary (recent branches before current planning branch):
   - Frontend moved to Tailwind v4 with style files aligned to reference (`styles/index.css`, `styles/theme.css`), with `styles/overrides.css` as local override layer.
   - Sidebar/topbar refactor moved to copy-first components based on `shadcn-admin-reference` (sidebar primitives, profile dropdown, theme switch, header/team switcher).
   - Agents page now includes side drawer "Create Agent" flow (API-backed).
   - `install.sh` hardened for frontend reliability:
     - incremental frontend caching,
     - recovery for missing `tsc`/toolchain despite cache,
     - Node version guard (`>=20.19`) for Tailwind v4 stack,
     - Linux Tailwind oxide package checks and repair path.
   - Web host control improved:
     - `codepods web stop` now also scans/kills matching `Codepods.Api` dotnet processes when PID file is stale/missing.
