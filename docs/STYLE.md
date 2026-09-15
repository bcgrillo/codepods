# Documentation Style Guide

This guide defines the structure and conventions for all CodePods technical documentation. Every module doc in `docs/` should follow this template. Deviations are acceptable for non-module docs (guides, architecture overviews), but the core principles apply everywhere.

---

## Core principles

1. **Concise and technical** — write for developers and agents who need to understand the system fast. No marketing language.
2. **TL;DR first** — the most important facts in 5-8 bullet points, before any detail.
3. **Transparent about limitations** — every doc has a "Current limitations" section. If something is beta, coming soon, or temporarily bypassed, say so. This helps track TODOs and builds trust.
4. **No duplication** — if a concept is explained in another doc, link to it (`[See X](./x.md)`) instead of re-explaining.
5. **Diagrams for data flow** — use ASCII diagrams for request/response flows and architecture. A diagram + 3-5 numbered steps beats 3 paragraphs.

---

## Module doc template

```markdown
# <Module Name>

<1-3 sentence description: what the module does, in plain language.>

## TL;DR

- <Key fact 1>
- <Key fact 2>
- <3-8 bullets covering: main features, key constraints, current state>

## Endpoints

| Method | Route | Auth | Purpose |
|---|---|---|---|
| GET | `/path` | Admin | <what it does> |
| ... | ... | ... | ... |

> Skip this section if the module has no HTTP endpoints (e.g. internal services).
> Use sub-tables for CLI-only operations or grouped endpoints if needed.

## How it works

<ASCII diagram showing the request/data flow>

1. <Step 1>
2. <Step 2>
3. <Step 3>

<Topic-specific subsections as needed: "## Authentication", "## Lifecycle", etc.>

## Current limitations

- **<Limitation 1>** — <brief explanation / link to relevant ADR or TODO>.
- **<Limitation 2>** — ...
- Use **bold** for the limitation name, then a dash and explanation.
- If something is "coming soon" or "planned", say so explicitly.

## Key files

| File | Role |
|---|---|
| `path/to/file.ts` | <what this file does> |
| ... | ... |
```

---

## Section-by-section guidance

### Title and description

- `#` is the human-readable module name (e.g. "Authentication", not "auth").
- The description is 1-3 sentences. No headers, no lists — just plain text.
- Mention the most important constraint early (e.g. "single-admin", "encrypted", "reverse proxy").

### TL;DR

- 3-8 bullet points.
- Covers: what it does, key mechanisms, important constraints, current state (beta/planned).
- A reader who only reads the TL;DR should understand the module's purpose and boundaries.

### Endpoints

- Table with columns: `Method | Route | Auth | Purpose`.
- `Auth` column values: `Admin`, `Public`, `Internal`, `Agent` (for container-facing routes).
- If the module has many endpoints, group them logically with sub-headers (`### CRUD`, `### Git operations`, etc.).
- For non-HTTP interfaces (CLI, WebSocket, events), use a separate table with appropriate columns.
- Skip entirely if the module is purely internal (no direct HTTP API).

### How it works / Architecture

- Start with an ASCII diagram. Use `│`, `├`, `─`, `►`, `◄`, `▼` for arrows and connections.
- Follow the diagram with numbered steps (1., 2., 3.) that walk through the flow.
- Keep diagrams under ~25 lines. If the flow is complex, split into multiple diagrams.
- Topic-specific subsections go after this section. Use `##` for major topics, `###` for sub-topics.

### Current limitations

- Always present. Even if the module is "complete", note architectural constraints.
- Format: `- **<Short name>** — <explanation>`.
- Link to relevant ADRs: `(see ADR-026)` or `[Auth](./auth.md)`.
- Use "planned" or "coming soon" for TODO items. Use "deferred" for explicitly punted work.
- Be honest: if there's a temporary bypass, a missing audit log, or no multi-user support, say so.

### Key files

- Table with columns: `File | Role`.
- Use the project-relative path (e.g. `apps/api/src/auth/auth.service.ts`, not absolute).
- List only the files that matter for understanding the module — not every file.
- If the module spans packages, include entries for shared packages too.

---

## Cross-references

- Link to other docs with relative paths: `[Git Proxy](./git-proxy.md)`.
- Reference ADRs inline: `(see ADR-030)` or `[ADR-030](../.context/decisions.md#adr-030-...)`.
- Reference config keys: `` `networkSecurity.filterInternetEgress` `` — link to [Configuration](./config.md) on first mention.
- Never duplicate content from another doc — link instead.

---

## Types of docs

| Type | Example | Structure |
|---|---|---|
| **Module doc** | `auth.md`, `mcp.md` | Full template above |
| **Guide** | `agent-templates.md` | TL;DR + topic sections + limitations (no endpoints/key files unless relevant) |
| **Architecture** | `network-security.md` | TL;DR + architecture diagram + config + troubleshooting + limitations + key files |
| **Reference** | `config.md` | TL;DR + reference tables + limitations |

Not every doc needs every section. Use judgment, but **TL;DR** and **Current limitations** are mandatory for all module docs.

---

## File naming

- Kebab-case: `ai-proxy.md`, `agent-templates.md`, `network-security.md`.
- One doc per module or feature. Don't split a module across multiple files.
- The filename should match the API module's directory name when possible.