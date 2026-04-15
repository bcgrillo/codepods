# Codepods AgentGateway MVP Plan

## 1) Product Scope (Initial Version)

This document defines the initial public version scope, with final-state code in runtime/application layers.

Migration/transition logic is **not** allowed in regular app code.
If one-off transitions are needed during development, they must live in `migrate.sh`.

## 2) MVP Objectives

1. Agent orchestration:
   - Create/render/build agent containers from templates/manifests.
2. CLI/Web operational access:
   - Access agents from CLI and Web.
3. Shared configuration management:
   - CLI/Web management for shared runtime configuration.
4. Minimal proxy-gateway:
   - Keep secrets out of agents.
   - Resolve/inject secrets at host/gateway side.
5. Global security:
   - Login with username + password + device ID.
   - Device authorization manually approved by admin.

## 3) Non-Goals (Current Phase)

1. Providers/models management UX:
   - Keep provider area present but out of scope for now.
   - Use variables + proxy rules as the current mechanism.
2. Multi-codepod runtime isolation in production:
   - Planned later, not in MVP implementation.
3. Advanced user/role/profile administration:
   - Planned later.

## 4) Architecture Direction

1. New internal service: `Codepods.AgentGateway`.
   - Internal-only exposure.
   - Responsibilities:
     - egress proxy policy enforcement,
     - secret-based header transformations,
     - credential-helper backend for Git.
2. `Codepods.Api` remains public control-plane.
   - CRUD/config endpoints.
   - No public exposure of gateway secrets.
3. `Codepods.Core` remains shared business logic.
   - CLI and API must continue using shared use-cases directly.

## 5) Data Model Decisions

1. `codepod` as mandatory ownership key:
   - `agent.codepod_id` must be `NOT NULL`.
   - New gateway config tables must also use `codepod_id NOT NULL`.
   - Bootstrap default codepod:
     - `id = 1`, `name = "Default"`.
2. Proxy policies table (minimal):
   - `proxy_policy`:
     - `id`, `codepod_id`, `name`, `enabled`, `priority`,
     - `match_host`, `match_path_prefix`,
     - `action` (`allow` | `deny`),
     - `header_ops_json`,
     - timestamps.
3. Secrets:
   - Keep credentials in `variable` (`is_secret = true` when needed).
   - Proxy header operations support token replacement:
     - example: `Bearer {{var:OPENAI_API_KEY}}`.
4. Repositories:
   - `repository` remains catalog for credential-helper targeting.
   - repository auth references should point to variable names/keys, not raw secrets.

## 6) Implementation Tasks

### A. Foundation
1. Add `Codepods.AgentGateway` project to solution.
2. Define internal contracts:
   - policy resolver,
   - secret resolver,
   - request transformation pipeline.

### B. Database / Storage
1. Add `codepod_id` mandatory relations where required.
2. Add `proxy_policy` entity/repository.
3. Add repository-auth variable reference fields.
4. Place one-off transition scripts in `migrate.sh` only.

### C. Gateway MVP Runtime
1. Implement minimal HTTP(S) egress policy evaluation.
2. Implement `allow/deny` + ordered policy priority.
3. Implement header add/update with `{{var:...}}` resolution.
4. Redact sensitive values in logs.

### D. Credential Helper MVP
1. Implement internal helper endpoint/service in AgentGateway.
2. Generate/distribute a lightweight `git-credential-codepods` helper from the same `Codepods.AgentGateway` project (no separate project in MVP).
3. Validate repository access by policy + codepod.
4. Resolve credentials from secret variables at runtime.
5. Avoid persistence of credentials in agent files/env.

### E. CLI/Web Control Plane
1. Add CLI commands for proxy policies and shared config.
2. Add Web/API endpoints for proxy policy CRUD.
3. Add minimal status/health visibility for AgentGateway.

## 7) Future Work Lines (Post-MVP)

1. Multiple codepods:
   - isolated workspaces, optional dedicated gateway per codepod.
2. Provider/model management:
   - CLI/Web UX, integrated with variables/proxy policies.
3. User profiles and codepod-level access control.
