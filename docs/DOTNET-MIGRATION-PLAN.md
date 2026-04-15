# .NET Migration Plan (Full Replacement, No Compatibility Layer)

## Decision
- This is a full migration to .NET.
- No legacy compatibility paths.
- No Python/.NET coexistence in runtime.
- Python code will be removed after migration validation.

## Scope
- Replace all Python modules with .NET equivalents:
  - CLI
  - API
  - Auth/session/token logic
  - Relay runtime and bootstrap
  - Agent runtime orchestration (Docker)
  - SQLite persistence
  - Install/start scripts

## Target Solution
- `Codepods.Core` (domain + use-cases)
- `Codepods.Runtime` (Docker + relay runtime + filesystem/template rendering)
- `Codepods.Infrastructure` (SQLite/EF Core)
- `Codepods.Api` (ASP.NET Core)
- `Codepods.Cli` (console, Spectre.Console UI)

## Implementation Order (Single Migration Track)
1. Scaffold .NET solution and projects.
2. Implement DB schema in EF Core (matching current data model).
3. Port core business logic:
   - agents lifecycle
   - users/devices
   - relays
4. Port runtime layer:
   - manifest parsing
   - Docker operations
   - relay listeners/proxy
5. Implement API surface in ASP.NET Core:
   - auth/login/me
   - agents
   - relays
   - users/devices admin ops
   - `/relay/?relay_token=...` bootstrap flow
6. Implement CLI with same command model:
   - `menu`
   - `web start/stop/status/login`
   - `web users/devices/relays`
7. Replace installer and command shims to point only to .NET binaries.
8. Run migration validation test pass.
9. Delete Python runtime code from repository.

## Security Requirements (Must Keep)
- Relay port access requires valid relay cookie; otherwise `401`.
- Relay bootstrap token short TTL; relay session cookie longer TTL.
- Token claims bound to relay_id/agent_id/service_kind/relay_port.
- HTTPS-only relay exposure.

## Acceptance Criteria
- .NET CLI and API are fully operational end-to-end.
- Agent lifecycle works (create/sleep/wake/remove) against Docker.
- Relay workflow works:
  - issue relay token
  - bootstrap URL sets cookie and redirects cleanly
  - relay port denies unauthenticated access
- Installer works from any directory.
- Python code removed from active runtime path.
