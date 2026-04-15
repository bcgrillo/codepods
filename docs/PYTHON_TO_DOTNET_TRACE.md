# Python -> .NET Migration Trace

Status legend:
- `PORTED`: implemented in `src/*` and wired.
- `PARTIAL`: implemented but missing behavior/parity details.
- `PENDING`: not ported yet.

## 1) Runtime / Agents

Decision:
- `templates/*` artifacts are part of the runtime contract and stay as-is (Dockerfiles, `configure.sh`, `start.sh`, templates).
- Migration target is the manager/orchestrator logic (Python -> .NET), not rewriting type scripts to C#.

1. `legacy/python/codepods/agent_manager.py` -> `Codepods.Runtime/Docker/DockerAgentRuntime.cs`
- Status: `PARTIAL`
- Ported:
  - `list/create/wake/sleep/remove` container lifecycle
  - manifest mounts for `docker run`
  - env-file generation from templates + `.env` fallback
  - rendered config tree from `templates/*/files/**/*.template`
  - execution of `shared` + type-specific `configure.sh`
- Missing parity:
  - trash/restore and runtime metadata-file lifecycle
  - `enter_agent_shell` / `enter_agent_start_command` runtime helpers

2. `legacy/python/codepods/type_manifest.py` + `legacy/python/codepods/metadata.py` -> `Codepods.Runtime/Catalog/FileSystemAgentTypeCatalog.cs`
- Status: `PARTIAL`
- Ported:
  - basic `manifest.yml` parsing (`services`, `mounts`, display fields, scripts, start command)
- Missing parity:
  - robust/strict validation and richer compatibility with previous parser rules

3. `legacy/python/codepods/services/unified_agents.py` -> `Codepods.Core/UseCases/AgentUseCase.cs`
- Status: `PARTIAL`
- Ported:
  - create/list/wake/sleep/remove with DB+runtime convergence
  - `next-name`, trash listing, restore path integration
- Missing parity:
  - explicit rollback semantics coverage tests

## 2) Relay / Security

4. `legacy/python/codepods/services/relays.py` -> `Codepods.Core/UseCases/RelayUseCase.cs`
- Status: `PORTED` (core allocation/ensure/disable logic)

5. `legacy/python/codepods/relay_runtime.py` -> `Codepods.Api/Relay/RelayRuntimeHostedService.cs`
- Status: `PARTIAL`
- Ported:
  - HTTPS listeners per enabled relay
  - cookie token checks on every request
  - relay reconciliation from DB
- Missing parity:
  - explicit readiness wait for target port (`_wait_for_target`)
  - hardened HTTP parsing/proxy edge cases

6. `legacy/python/codepods/auth.py` + `legacy/python/codepods/identity.py` + `legacy/python/codepods/device_auth.py` -> `Codepods.Core/Security/*` + `Codepods.Core/UseCases/AuthUseCase.cs`
- Status: `PARTIAL`
- Ported:
  - bootstrap superadmin from env
  - password hashing/verification
  - login auth + optional approved-device validation
  - JWT-like signed token codec
  - user/device admin use-case and CLI/API operations (list/add/remove)
- Missing parity:
  - full claim/error parity details

## 3) API Surface

7. `legacy/python/web/main.py` + `legacy/python/codepods/api/auth.py` -> `Codepods.Api/Program.cs`
- Status: `PARTIAL`
- Ported:
  - `/health`
  - `/api/auth/login`, `/api/auth/me`
  - `/relay?relay_token=...` bootstrap -> cookie -> redirect
  - response/request contract alignment in snake_case for core auth payloads
- Missing parity:
  - logout endpoint semantics (if desired)

8. `legacy/python/codepods/api/agents.py` -> `Codepods.Api/Program.cs`
- Status: `PARTIAL`
- Ported:
  - list/create/wake/sleep/delete
  - `types`, `next-name`, `trash`, `get-by-id`, `resume`
- Missing parity:
  - response contract polishing vs Python schemas

9. `legacy/python/codepods/api/relays.py` -> `Codepods.Api/Program.cs` + relay hosted service
- Status: `PARTIAL`
- Ported:
  - list/ensure/delete/token + bootstrap flow
  - `list relays by agent` endpoint compatibility
  - snake_case relay response contracts (`RelayRead`, ensure/token payloads)
- Missing parity:
  - readiness wait parity and runtime edge-case hardening

10. `legacy/python/codepods/api/providers.py` + `repositories.py` + `codepods.py` + `variables.py` + `agent_files.py`
- Status: `PARTIAL`
- Ported:
  - domain models + repositories + use-cases + API endpoints
  - variable secret encryption/decryption behavior
  - agent file read/write endpoints
- Missing:
  - parity polishing and response contract alignment with Python schemas

## 4) Data Model

11. `legacy/python/codepods/models.py` -> `Codepods.Core/Domain/*` + `Codepods.Infrastructure/Persistence/CodepodsDbContext.cs`
- Status: `PARTIAL`
- Ported tables:
  - `agent`, `relay_binding`, `user`, `authorized_device`
- `provider`, `repository`, `codepod`, `variable`

## 5) CLI

12. `legacy/python/codepods/cli.py` -> `Codepods.Cli/Program.cs`
- Status: `PARTIAL`
- Ported:
  - command-based agents/relays/auth basics
  - command-based providers/repositories/codepods/variables/agent-files basics
  - interactive `menu` with arrow-key selection and per-agent actions
- Missing parity:
  - full UX parity polish vs legacy Python menu
  - `web` command group UX parity polish (`start/stop/status/restart/relays/users/devices/login` behavior details)
  - localization/formatting parity from current Python CLI

16. External web-host lifecycle boundary
- Status: `PORTED`
- Ported:
  - `IWebHostController` port in core
  - runtime process-based implementation for start/stop/status/restart
  - CLI wired through the boundary (no direct process lifecycle code in command handlers)

## 6) Cutover

13. Installer and entrypoint replacement
- Status: `PENDING`
- Missing:
  - `install.sh` and global shim pointing to .NET binaries only
  - retirement of Python runtime path

## 7) Post-parity technical upgrade (agreed)

14. Docker transport migration (`docker` CLI -> Docker SDK)
- Status: `PENDING`
- Plan:
  - complete feature parity first
  - migrate runtime internals to `Docker.DotNet` as single implementation
  - avoid dual runtime code paths to reduce test duplication

15. Testing rollout
- Status: `PARTIAL`
- Scope:
  - unit tests (application/use-cases)
  - integration tests (SQLite repositories + runtime adapters)
  - API contract tests (auth/agents/relays/bootstrap + CRUD)
- Implemented now:
  - test project scaffold `tests/Codepods.Tests`
  - unit tests for `AgentUseCase` and `UserDeviceUseCase` using in-memory test doubles
  - runtime DI boundary test for `IWebHostController` resolution
