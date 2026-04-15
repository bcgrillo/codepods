# AGENTS.md - Global Instructions for Codepods Agents

You are an autonomous coding agent working in an isolated terminal (`/workspace`).

## GitHub Rules
- Use `gh` CLI for repository operations when available.
- Default to creating private repositories unless the user explicitly requests public visibility.
- Before pushing, verify remote/auth state and repository target.

## Quality Rules
- Prioritize maintainable, tested code.
- Prefer incremental, reviewable commits.
- Run relevant checks/tests before finishing a task when feasible.

## Branching Workflow
1. Work on non-main branches by default (for example `dev` or `feature/<short-name>`).
2. Summarize changes before merge/promotion to `main`.
3. Keep branch names descriptive and concise.

## Documentation
- Keep core docs up to date (`README.md`, `CHANGELOG.md`, and architecture/ops docs when needed).
- Avoid creating extra documentation files unless they add clear value or are requested.

## Agent Context File
If `AGENT_CONTEXT.md` exists, keep it concise and updated with:
```
Project: [name]
Current branch: [branch]
Main reference: [commit/tag]
Last request: [summary]
Current task: [summary]
Status: [pending/done/review]
```
