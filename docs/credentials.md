# Credentials & Secrets

A unified, encrypted credential vault. AI providers, MCP servers, managed APIs, and git workspaces all reference credentials from this single store. Secrets are encrypted at rest with AES-256-GCM and never returned in API responses.

## TL;DR

- One `credentials` table replaces the old separate `git_credentials` table and inline AI provider keys (ADR-031).
- Each credential has a `type` (`key` for bare tokens, `user_pass` for username + password) and an optional `host` hint.
- The `secret` column stores AES-256-GCM ciphertext; API responses expose only `hasSecret: boolean`.
- Internal services (AI proxy, MCP proxy, managed APIs, git credential helper) decrypt on demand via `getSecret(id)` — never exposed as an HTTP route.

## Endpoints

| Method | Route | Purpose |
|---|---|---|
| GET | `/credentials` | List credentials for a codepod (sorted by label) |
| GET | `/credentials/:id` | Get one credential (safe view, no secret) |
| POST | `/credentials` | Create (encrypts `secret` server-side) |
| PATCH | `/credentials/:id` | Update (omit `secret` to preserve; empty/null to clear) |
| DELETE | `/credentials/:id` | Remove |

## Encryption

- **Algorithm**: AES-256-GCM with a 12-byte random IV.
- **Format**: single base64 blob = `iv ‖ authTag(16B) ‖ ciphertext`.
- **Master key**: 32-byte file at `data/keys/master.key` (mode 0600), auto-generated on first use. Legacy hex-encoded 64-char keys are also accepted.
- **Key rotation** (re-encrypting all secrets on master-key change) is not yet implemented.

## Entity

| Column | Type | Notes |
|---|---|---|
| `label` | string | Unique per codepod |
| `type` | `'key'` \| `'user_pass'` | Bare token vs username+password |
| `host` | string (optional) | Scope/reuse hint (e.g. `github.com`) |
| `username` | string (optional) | Only for `user_pass` |
| `secret` | text | AES-256-GCM ciphertext |
| `codepodId` | FK → `codepods` | Currently always `1` |

## Consumers

| Consumer | How it uses credentials |
|---|---|
| **AI Proxy** | `credentialId` on the provider; `resolveApiKey` decrypts on each request |
| **MCP Proxy** | `credentialId` on the MCP server; injected as auth header when forwarding JSON-RPC |
| **Managed APIs** | `credentialId` on the managed API; injected into `headerPattern` on `callApi` |
| **Git workspaces** | Inline credentials create `type='user_pass'` records; `git-credential-codepods.js` helper queries this store |

## Current limitations

- **No credential usage tracking**: removing a credential in use leaves a dangling `credentialId` FK. The UI does not yet show which records reference a credential. Planned: `GET /credentials/:id/usage` + safe-delete with replacement option.
- **No key rotation**: changing the master key does not re-encrypt existing secrets.
- **Single codepod**: `codepodId` is hardcoded to `1`; multi-pod scoping is plumbed through but not driven from auth.

## Key files

| File | Role |
|---|---|
| `apps/api/src/credentials/credentials.controller.ts` | CRUD endpoints |
| `apps/api/src/credentials/credentials.service.ts` | CRUD + `getSecret()` (internal decrypt) |
| `apps/api/src/credentials/credential.entity.ts` | Entity definition |
| `apps/api/src/secrets/crypto.service.ts` | AES-256-GCM encrypt/decrypt |
| `apps/api/src/secrets/secrets.module.ts` | Global module, factory-builds `CryptoService` |