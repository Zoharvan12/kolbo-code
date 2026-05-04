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

## MCP & Skill Sync Rule (CRITICAL)
Whenever you edit MCP tool logic, skill behavior, rate limits, cost rules, or install instructions — you MUST update ALL three places in the same session:

| What changed | Update here |
|---|---|
| MCP tool behavior / parameters | `packages/opencode/skills/kolbo/SKILL.md` |
| User-facing docs (install, auth, usage) | `G:\Projects\Kolbo.AI\github\kolbo-docs\content\docs\kolbo-code\` |
| MCP server implementation | `G:\Projects\Kolbo.AI\github\kolbo-mcp\` (if it exists) |

Never update just one. Push all three repos before marking the task done.

## Key Files
- `packages/opencode/src/plugin/kolbo.ts` — Kolbo device-code OAuth plugin
- `packages/opencode/src/provider/models.ts` — Kolbo provider definition
- `packages/opencode/src/cli/logo.ts` — Kolbo ASCII logo
- `packages/opencode/src/flag/flag.ts` — All KOLBO_* feature flags
- `.github/workflows/publish.yml` — CI publish (repo guard: `Zoharvan12/kolbo-cli`)
- `packages/opencode/skills/kolbo/SKILL.md` — MCP tool workflow + prompt rules (keep in sync with kolbo-docs + kolbo-mcp)

## Release Process
```bash
# Bump version in packages/opencode/package.json
git add packages/opencode/package.json
git commit -m "release: vX.Y.Z"
git tag -a vX.Y.Z -m "Release vX.Y.Z - description"
git push origin dev && git push origin vX.Y.Z
```

## Desktop Auto-Updater Rule (CRITICAL)

After every desktop release to `kolbo-releases`, you MUST also update the legacy updater endpoint in `kolbo-code` so that users on older versions (which still check the old URL) can receive the update.

**Why:** Versions before `1.0.28` have this hardcoded updater endpoint:
`https://github.com/Zoharvan12/kolbo-code/releases/download/updater/latest.json`

Starting from `1.0.28` the endpoint is `kolbo-releases`, but old installs will never switch unless we serve the new `latest.json` at the old URL too.

**After every desktop release:**
```bash
# 1. Download the new manifest from kolbo-releases
curl -sL "https://github.com/Zoharvan12/kolbo-releases/releases/download/updater/latest.json" > /tmp/latest.json

# 2. Push it to the legacy endpoint in kolbo-code
gh release delete-asset updater latest.json --yes -R Zoharvan12/kolbo-code 2>/dev/null || true
gh release upload updater /tmp/latest.json --clobber -R Zoharvan12/kolbo-code

# 3. Repeat for Sapir whitelabel
curl -sL "https://github.com/Zoharvan12/kolbo-releases/releases/download/updater/sapir-latest.json" > /tmp/sapir-latest.json
gh release delete-asset updater sapir-latest.json --yes -R Zoharvan12/kolbo-code 2>/dev/null || true
gh release upload updater /tmp/sapir-latest.json --clobber -R Zoharvan12/kolbo-code
```
