# Kolbo CLI — Claude Instructions

> Memory pointer: `C:\Users\Zohar\.claude\projects\G--Projects-Kolbo-AI-github-kodu\memory\MEMORY.md`

## Project Overview
This is `@kolbo-cli/kolbo` — a fork of [anomalyco/opencode](https://github.com/anomalyco/opencode) rebranded as Kolbo's AI coding CLI. It routes managed inference through kolbo-api so usage is billed against the user's Kolbo.AI credit balance.

**Repo:** `Zoharvan12/kolbo-cli` | **Package:** `packages/opencode/` | **Branch:** `dev`

## Dev Workflow
1. Always verify plan before writing code
2. Minimal changes only — no scope creep
3. Test locally with `bun run dev` from `packages/opencode/` before pushing
4. Never push without explicit user confirmation
5. Run `bun turbo typecheck` to verify before committing

## Local Dev Environment
```bash
cd packages/opencode
# Use .env for local overrides (gitignored):
# KOLBO_API_BASE=http://localhost:5050/api
# KOLBO_APP_BASE=http://localhost:8080
bun run dev
```

## Branding Rules
This is a fork — upstream uses `opencode` branding, we use `kolbo`. When merging upstream or editing files, always maintain:

| Upstream | Ours |
|----------|------|
| `OPENCODE_*` flags | `KOLBO_*` flags |
| `opencode.db` | `kolbo.db` |
| `opencode.ai` URLs | `kolbo.ai` URLs |
| `opencode` package name | `@kolbo-cli/kolbo` |
| `anomalyco/opencode` repo | `Zoharvan12/kolbo-cli` |

## Syncing Upstream Updates
Use `/sync-upstream` to automatically fetch, merge, and verify upstream changes.

**Manual steps (what the skill does):**
```bash
git fetch upstream
git log dev..upstream/dev --oneline        # preview incoming commits
git merge upstream/dev --no-commit

# Conflict resolution strategy:
git checkout --ours .github/workflows/publish.yml
git checkout --theirs bun.lock
git checkout --ours packages/opencode/package.json
git checkout --ours packages/desktop/scripts/finalize-latest-json.ts
git checkout --ours packages/extensions/zed/extension.toml
git checkout --ours sdks/vscode/package.json
# For source file conflicts: fix OPENCODE_* → KOLBO_* flag names

bun turbo typecheck   # must pass before committing
git commit -m "chore: merge upstream/dev ..."
# DO NOT push — user reviews first
```

**Upstream remote:** `https://github.com/anomalyco/opencode.git`

## Key Files
- `packages/opencode/src/plugin/kolbo.ts` — Kolbo device-code OAuth plugin
- `packages/opencode/src/provider/models.ts` — Kolbo provider definition
- `packages/opencode/src/cli/logo.ts` — Kolbo ASCII logo
- `packages/opencode/src/flag/flag.ts` — All KOLBO_* feature flags
- `packages/opencode/src/cli/cmd/tui/routes/session/dialog-rewind.tsx` — Rewind panel (inline, above prompt)
- `.github/workflows/publish.yml` — CI publish (repo guard: `Zoharvan12/kolbo-cli`)

## Release Process
```bash
# Bump version in packages/opencode/package.json
git add packages/opencode/package.json
git commit -m "release: vX.Y.Z"
git tag -a vX.Y.Z -m "Release vX.Y.Z - description"
git push origin dev && git push origin vX.Y.Z
```
