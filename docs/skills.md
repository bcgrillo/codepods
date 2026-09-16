# Skills

A registry and management system for agent "skills" — reusable instructions packaged as a folder containing a `SKILL.md` (with YAML frontmatter for name/description). Skills come from three source types: a built-in **local** directory on disk, a **remote repo** of many skills, or a **remote single-skill repo**. Admins manage sources and upload local skills; skills are assigned to agents (N:M) and delivered to agent containers as a zip the agent fetches and installs.

## TL;DR

- Three source types: `local` (on-disk directory), `repo` (remote repo with many skills), `skill` (remote single-skill repo).
- Each skill is a folder with a `SKILL.md` file (YAML frontmatter: `name`, `description`).
- Skills are assigned to agents N:M; delivery is via a zip download URL the agent fetches.
- Local skills can be uploaded, renamed, and deleted. Remote skills are read-only (sync from their source).
- The built-in local source points at `<dataDir>/skills` and cannot be deleted.

## Skill source endpoints

| Method | Route | Purpose |
|---|---|---|
| GET | `/skill-sources` | List sources |
| GET | `/skill-sources/:id` | Get one source |
| POST | `/skill-sources` | Create (`repo` or `skill` type) |
| PATCH | `/skill-sources/:id` | Update |
| DELETE | `/skill-sources/:id` | Delete (built-in local not deletable) |
| POST | `/skill-sources/reorder` | Pin/reorder |
| POST | `/skill-sources/:id/sync` | Re-scan / re-clone + reconcile DB |
| GET | `/skill-sources/:id/skills` | List skills discovered in a source |

## Skill endpoints

| Method | Route | Purpose |
|---|---|---|
| GET | `/skills` | All skills from all enabled sources |
| GET | `/skills/local` | Local skills only |
| POST | `/skills/local/upload` | Upload a `.md` or `.zip` local skill (multipart, 20MB cap) |
| GET | `/skills/:id` | Get one skill |
| PATCH | `/skills/:id/rename` | Rename a local skill (filesystem + DB) |
| DELETE | `/skills/:id` | Delete a local skill (folder + DB) |
| GET | `/skills/:id/zip` | Stream the skill folder as a zip download |

> Per-agent assignment endpoints live on the **agents** controller: `GET/POST/DELETE /agents/:id/skills[/:skillId]`, `POST /agents/:id/skills/sync`.

## Source types

| Type | Description | Scan behavior |
|---|---|---|
| `local` | Built-in, on-disk at `<dataDir>/skills` | Each subdirectory with a `SKILL.md` is a skill |
| `repo` | Remote git repo with many skills | Shallow-clone; scan `subPath` (or root) subdirectories for `SKILL.md` |
| `skill` | Remote git repo that IS a single skill | Shallow-clone; the repo root (or `subPath`) itself is the skill |

## SKILL.md format

```markdown
---
name: code-review
description: Systematic code review with best practices
---

# Code Review Skill

Instructions for the agent on how to perform code reviews...
```

- YAML frontmatter (`---` fenced) provides `name` and `description`.
- Falls back to the folder name if no frontmatter.

## Agent delivery flow

1. Agent is assigned a skill via `POST /agents/:id/skills/:skillId`.
2. The API runs an `add_skill` command inside the container (via `docker exec`), passing the skill name and the zip URL (`http://host.docker.internal:3000/api/skills/<id>/zip`).
3. The agent container fetches the zip, extracts it, and installs the skill.
4. Removal runs a `remove_skill` command.
5. `get_skills` runs inside the container and parses JSON output to verify installed skills.

## Current limitations

- **Remote skills are read-only** — rename/delete only work for local skills. Remote skills can only be removed by deleting their source.
- **No auto-refresh** — syncing is manual via `POST /skill-sources/:id/sync`; no scheduled polling.
- **Agent-side installation is a shell command** — relies on the container's own tooling; results parsed from stdout JSON.
- **Per-agent skill management** routes are under the agents resource, not the skills resource.
- **Single codepod** — `codepodId` defaults to 1 everywhere.

## Key files

| File | Role |
|---|---|
| `apps/api/src/skills/skills.controller.ts` | Source + skill endpoints |
| `apps/api/src/skills/skills.service.ts` | Scan, sync, upload, zip delivery |
| `apps/api/src/skills/skill-source.entity.ts` | Source entity |
| `apps/api/src/skills/skill.entity.ts` | Skill entity |
| `apps/api/src/skills/agent-skill.entity.ts` | N:M junction |