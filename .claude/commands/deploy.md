---
description: "Commit local changes, sync safe upstream updates, bump versions for kolbo-code (CLI+desktop) and @kolbo/mcp, tag, push, and trigger all release workflows."
argument-hint: "[patch|minor|major] [--skip-upstream] [--skip-mcp] [--skip-desktop]"
---

You are running the Kolbo release pipeline. Follow each phase in order. Stop and report to the user if any phase fails — never skip a failure silently.

The arguments provided (if any) are: $ARGUMENTS
Default bump level is `patch` unless the user specified `minor` or `major`.
- `--skip-upstream` → skip Phase 2
- `--skip-mcp` → don't bump/publish `@kolbo/mcp`
- `--skip-desktop` → don't trigger desktop installer build

**Three independently-versioned npm packages are released by this pipeline:**
- `@kolbo/kolbo-code` — CLI (versioned in `packages/opencode/package.json`)
- desktop installer — versioned in `packages/desktop/package.json`; **must stay in sync with CLI**
- `@kolbo/mcp` — MCP server (versioned in `packages/kolbo-mcp/package.json`, **independent track**)

**Hard rule:** never try to publish a version that is `<=` the current npm `latest`. npm rejects with a misleading `404`. ALWAYS query the registry in Phase 3 to find the floor.

---

## Phase 1 — Commit local changes

1. Run `git status` to see what is uncommitted.
2. If the working tree is clean, note that and skip to Phase 2.
3. Run `git diff --stat` so you can write a meaningful commit message.
4. Stage all tracked changes: `git add -u`
5. Also stage any new files that belong to the project (use judgment — skip build artifacts, `.env`, `node_modules`, etc.).
6. Commit with a concise message that describes what changed. Follow the style of recent commits (`git log --oneline -10`). End the commit message with:
   ```
   Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
   ```
7. Report: "Phase 1 done — committed: `<message>`"

---

## Phase 2 — Sync safe upstream changes (skip if --skip-upstream)

Goal: pull in upstream bug-fixes and improvements that do NOT touch Kolbo branding.

1. Ensure upstream remote exists:
   ```bash
   git remote get-url upstream 2>/dev/null || git remote add upstream https://github.com/anomalyco/opencode.git
   ```
2. Fetch upstream silently:
   ```bash
   git fetch upstream --quiet
   ```
3. Show what's new:
   ```bash
   git log dev..upstream/dev --oneline
   ```
   If there are no new commits, note that and skip to Phase 3.

4. For each incoming commit, check if it touches branding-sensitive paths:
   ```bash
   git log dev..upstream/dev --oneline --name-only
   ```
   Branding-sensitive paths (skip any commit that touches these):
   - `packages/opencode/src/plugin/kolbo.ts`
   - `packages/opencode/src/provider/models.ts`
   - `packages/opencode/src/cli/logo.ts`
   - `packages/opencode/src/flag/flag.ts`
   - `packages/opencode/src/installation/`
   - `packages/opencode/src/i18n/`
   - `packages/opencode/package.json`
   - `.github/workflows/`
   - `packages/desktop/`
   - Any file named `kolbo*`
   - Any file with `opencode.ai` or `anomalyco` URLs

5. **Before merging — check for dangerous upstream package changes:**
   ```bash
   git show upstream/dev:package.json | grep -E '"effect"|"ai":|"@effect/'
   ```
   Compare against current `package.json`. Flag any bumps to:
   - `effect` — beta versions have Bun incompatibilities. New beta may remove exports from main index (e.g. `ServiceMap`, `Context`) that break at runtime under Bun even if TypeScript compiles fine.
   - `ai` — npm publishes sometimes ship WITHOUT `dist/` folder, causing "Cannot find package 'ai'" at runtime.
   - `@effect/language-service` — must stay in sync with `effect` version. Newer versions reference exports that older effect betas don't have.
   - `@effect/platform-node` / `@effect/platform-node-shared` — all `@effect/*` packages must be pinned to the SAME beta version as `effect`.

   If any of these changed, **stop and warn the user** before proceeding. Do NOT blindly merge a large upstream sync (100+ commits) — these are the most dangerous.

   **Lesson (April 2026):** A single upstream sync brought in `effect@beta.46` + `ai@6.0.158` both broken under Bun on Windows. Recovery required a full rollback of 140 upstream commits. Always checkpoint with a commit BEFORE syncing upstream.

6. **Commit current state as a safety checkpoint BEFORE merging:**
   ```bash
   git add -u && git commit -m "chore: pre-upstream-sync checkpoint" || true
   ```

7. If safe commits exist, attempt the merge:
   ```bash
   git merge upstream/dev --no-commit --no-ff
   ```
8. Check for conflicts: `git status`. If conflicts exist:
   - For files where ours must win: `git checkout --ours <file>`
   - Always keep ours for: `package.json`, `flag.ts`, `logo.ts`, `models.ts`, `kolbo.ts`, all `.github/workflows/`
   - For source file conflicts: apply upstream logic but preserve `KOLBO_*` flag names (not `OPENCODE_*`)
   - After resolving, `git add` the resolved files.
9. **Smoke-test before committing the merge:**
   ```bash
   rm -rf node_modules packages/opencode/node_modules
   bun install
   timeout 15 bun run dev 2>&1 | head -5
   ```
   - If `bun install` fails or `bun run dev` shows a `SyntaxError` or `Cannot find package` error → **abort the merge** (`git merge --abort`) and report. Do NOT commit a broken state.
   - Common Bun-on-Windows failure modes: missing `dist/` in a package (broken npm publish), missing export from effect main index, UTF-16 encoded source files.
10. Run typecheck: `bun turbo typecheck`
    - If it fails, abort the merge (`git merge --abort`) and report the error. Skip to Phase 3.
11. Commit the merge:
   ```bash
   git commit -m "chore: merge upstream/dev <short hash range>

   Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
   ```
9. Report a summary: how many upstream commits were included, which (if any) were skipped and why.

---

## Phase 3 — Bump versions

Bump TWO version tracks together. Always pick the next semver based on `max(local file version, npm latest)` so we never try to publish below what's already on npm (which returns a confusing 404).

### 3a — CLI + desktop (synced)

1. Read local: `node -p "require('./packages/opencode/package.json').version"`
2. Read npm: `curl -s https://registry.npmjs.org/@kolbo%2fkolbo-code | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d)['dist-tags'].latest))"`
3. Pick the higher of the two as the floor, then apply the bump level → `<new_cli_version>`.
4. Edit `packages/opencode/package.json` and `packages/desktop/package.json` — update only the `"version"` field to `<new_cli_version>`. Both MUST match.

### 3b — @kolbo/mcp (independent track)

Skip this whole section if `--skip-mcp` is in arguments.

1. Read local: `node -p "require('./packages/kolbo-mcp/package.json').version"`
2. Read npm: `curl -s https://registry.npmjs.org/@kolbo%2fmcp | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d)['dist-tags'].latest))"`
3. Pick the higher of the two, then bump (default `patch` for bug fixes / additive arg; `minor` for new tools per `packages/kolbo-mcp/CLAUDE.md`; never `major` without explicit user confirmation) → `<new_mcp_version>`.
4. Edit `packages/kolbo-mcp/package.json` — update `"version"` to `<new_mcp_version>`.

### 3c — Commit both bumps in one commit

```bash
git add packages/opencode/package.json packages/desktop/package.json packages/kolbo-mcp/package.json
git commit -m "release: kolbo-code v<new_cli_version> + @kolbo/mcp v<new_mcp_version>

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

Report: "Phase 3 done — CLI+desktop → v`<new_cli_version>`, @kolbo/mcp → v`<new_mcp_version>`"

---

## Phase 4 — Tag and push

1. Create an annotated tag:
   ```bash
   git tag -a v<new_version> -m "Release v<new_version>"
   ```
2. Push the branch:
   ```bash
   git push origin dev
   ```
3. Push the tag:
   ```bash
   git push origin v<new_version>
   ```
4. Report: "Phase 4 done — pushed branch and tag v`<new_version>`"

---

## Phase 5 — Trigger publish workflows

Trigger all four workflows in parallel. The desktop release is the long pole (~20 min). The two CLI workflows + kolbo-mcp finish in 1–5 min.

Substitute `<new_cli_version>` and `<new_mcp_version>` from Phase 3.

```bash
# 1. Main CLI to npm — publishes @kolbo/kolbo-code + per-platform binary packages
gh workflow run kolbo-release.yml \
  --repo Zoharvan12/kolbo-code \
  --ref dev \
  --field tag=latest \
  --field version=<new_cli_version>

# 2. Whitelabel CLIs to npm (Sapir, NakedJim, …)
gh workflow run kolbo-whitelabels.yml \
  --repo Zoharvan12/kolbo-code \
  --ref dev

# 3. Desktop apps (Kolbo Code + Sapir desktop, mac arm64 + win x64).
# REQUIRED for any release the user described as "desktop app" or
# "for whitelabels and desktop". MUST pass --field version=… — the
# child workflows used to default to 1.0.0 which silently overwrote
# kolbo-releases "latest" with bogus artifacts (May 2026 incident).
# Skip this step entirely if --skip-desktop is in arguments.
gh workflow run kolbo-release-all.yml \
  --repo Zoharvan12/kolbo-code \
  --ref dev \
  --field version=<new_cli_version> \
  --field sign=true \
  --field draft=false

# 4. @kolbo/mcp to npm — publishes the MCP server.
# Skip this step entirely if --skip-mcp is in arguments OR Phase 3b was skipped.
gh workflow run kolbo-mcp-release.yml \
  --repo Zoharvan12/kolbo-code \
  --ref dev \
  --field tag=latest \
  --field version=<new_mcp_version>
```

Wait ~5 seconds then confirm all are queued:
```bash
gh run list --repo Zoharvan12/kolbo-code --limit 6
```

**Common failure mode** — npm returns `404 Not Found - PUT https://registry.npmjs.org/@kolbo%2f...` on publish. Two real causes (npm hides both behind 404):
- The version being published is `<=` the current `dist-tags.latest` → Phase 3 should have prevented this. If it slipped through, re-bump and retry.
- The `NPM_TOKEN` secret has expired or lost scope access → cannot self-fix here, ask the user to refresh the token in repo secrets.

`kolbo-release-all` takes ~20 min — its `publish-updater` job is what writes `latest.json` and `sapir-latest.json` on `Zoharvan12/kolbo-releases/releases/download/updater/`. Phase 6 below must run AFTER that job succeeds (or it will sync stale manifests).

---

## Phase 6 — Sync legacy desktop updater endpoint (desktop releases only)

Skip this phase if no desktop build was triggered.

After a desktop release to `kolbo-releases`, old installs (pre-1.0.28) check a different URL: `https://github.com/Zoharvan12/kolbo-code/releases/download/updater/latest.json`. Without this step those users never see the update.

**6a — Wait for `kolbo-release-all` to finish** (publishes the manifests we mirror; running too early syncs stale 1-version-back data):

If you can schedule a wake-up (e.g. ScheduleWakeup in Claude Code), defer ~20–25 min then resume. Otherwise poll:

```bash
# `<run_id>` is the kolbo-release-all run id from Phase 5's `gh run list` output.
gh run view <run_id> --repo Zoharvan12/kolbo-code --json status,conclusion
```
Continue when `"status":"completed","conclusion":"success"`. If it failed, report and stop — do NOT proceed to 6b (would mirror broken or missing manifests).

**6b — Mirror manifests:**

```bash
curl -sL "https://github.com/Zoharvan12/kolbo-releases/releases/download/updater/latest.json" > /tmp/latest.json
gh release delete-asset updater latest.json --yes -R Zoharvan12/kolbo-code 2>/dev/null || true
gh release upload updater /tmp/latest.json -R Zoharvan12/kolbo-code

curl -sL "https://github.com/Zoharvan12/kolbo-releases/releases/download/updater/sapir-latest.json" > /tmp/sapir-latest.json
gh release delete-asset updater sapir-latest.json --yes -R Zoharvan12/kolbo-code 2>/dev/null || true
gh release upload updater /tmp/sapir-latest.json -R Zoharvan12/kolbo-code
```

**6c — Verify both mirrors show the version you just released** (not a stale one):

```bash
curl -sL "https://github.com/Zoharvan12/kolbo-code/releases/download/updater/latest.json" | head -3
curl -sL "https://github.com/Zoharvan12/kolbo-code/releases/download/updater/sapir-latest.json" | head -3
```
Both `version` fields must equal `<new_cli_version>`. If either still shows the prior version, the `kolbo-releases` manifest hasn't been written yet (the desktop workflow's `publish-updater` step lags the rest by a minute or two) — wait 30s and retry the curl+upload sequence.

Report: "Phase 6 done — legacy updater endpoint synced (verified v`<new_cli_version>` in both manifests)"

---

## Final summary

Print a clean summary, substituting the actual versions and listing every workflow you triggered:
```
✓ Phase 1 — Local changes committed
✓ Phase 2 — Upstream synced (N merged, M skipped)
✓ Phase 3 — CLI+desktop → vX.Y.Z   @kolbo/mcp → vA.B.C
✓ Phase 4 — Pushed to origin/dev + tagged vX.Y.Z
✓ Phase 5 — Workflows queued: kolbo-release, kolbo-whitelabels, kolbo-release-all, kolbo-mcp-release
✓ Phase 6 — (post-desktop) legacy updater endpoint synced

Install when CI completes:
  npm i -g @kolbo/kolbo-code         # main CLI
  npm i -g @kolbo/sapir              # Sapir whitelabel
  npx -y @kolbo/mcp@latest           # MCP server (no global install needed)
```

Tail the runs:
```bash
gh run list --repo Zoharvan12/kolbo-code --limit 6
```
