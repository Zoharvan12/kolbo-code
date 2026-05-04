---
description: "Commit local changes, sync safe upstream updates, bump version, tag, push, and trigger npm publish."
argument-hint: "[patch|minor|major] [--skip-upstream]"
---

You are running the Kolbo CLI deploy pipeline. Follow each phase in order. Stop and report to the user if any phase fails — never skip a failure silently.

The arguments provided (if any) are: $ARGUMENTS
Default bump level is `patch` unless the user specified `minor` or `major`.
If `--skip-upstream` is in the arguments, skip Phase 2.

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

## Phase 3 — Bump version

1. Read current version from `packages/opencode/package.json`.
2. Apply the bump level (patch / minor / major) using semver rules.
3. Edit `packages/opencode/package.json` — update only the `"version"` field.
4. Commit:
   ```bash
   git add packages/opencode/package.json
   git commit -m "release: v<new_version>

   Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
   ```
5. Report: "Phase 3 done — version bumped to v`<new_version>`"

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

## Phase 5 — Trigger npm publish

Trigger both workflows in parallel:
```bash
gh workflow run kolbo-release.yml \
  --repo Zoharvan12/kolbo-code \
  --ref dev \
  --field tag=latest \
  --field version=<new_version>

gh workflow run kolbo-whitelabels.yml \
  --repo Zoharvan12/kolbo-code \
  --ref dev
```

Wait ~5 seconds then confirm both are queued:
```bash
gh run list --repo Zoharvan12/kolbo-code --limit 5
```

---

## Phase 6 — Sync legacy desktop updater endpoint (desktop releases only)

Skip this phase if no desktop build was triggered.

After a desktop release to `kolbo-releases`, old installs (pre-1.0.28) check a different URL: `https://github.com/Zoharvan12/kolbo-code/releases/download/updater/latest.json`. Without this step those users never see the update.

```bash
# Download manifests from kolbo-releases and push to legacy kolbo-code endpoint
curl -sL "https://github.com/Zoharvan12/kolbo-releases/releases/download/updater/latest.json" > /tmp/latest.json
gh release delete-asset updater latest.json --yes -R Zoharvan12/kolbo-code 2>/dev/null || true
gh release upload updater /tmp/latest.json -R Zoharvan12/kolbo-code

curl -sL "https://github.com/Zoharvan12/kolbo-releases/releases/download/updater/sapir-latest.json" > /tmp/sapir-latest.json
gh release delete-asset updater sapir-latest.json --yes -R Zoharvan12/kolbo-code 2>/dev/null || true
gh release upload updater /tmp/sapir-latest.json -R Zoharvan12/kolbo-code
```

Verify: `curl -sL "https://github.com/Zoharvan12/kolbo-code/releases/download/updater/latest.json" | head -3` — should show the new version.

Report: "Phase 6 done — legacy updater endpoint synced"

---

## Final summary

Print a clean summary:
```
✓ Phase 1 — Local changes committed
✓ Phase 2 — Upstream synced (N commits merged, M skipped)
✓ Phase 3 — Version bumped to vX.Y.Z
✓ Phase 4 — Pushed to origin/dev + tagged vX.Y.Z
✓ Phase 5 — Publish workflows queued (main CLI + whitelabels)

Install when CI completes:
  npm i -g @kolbo/kolbo-code     # main CLI
  npm i -g @kolbo/sapir          # Sapir whitelabel
  npm i -g @kolbo/nakedjim       # NakedJim whitelabel
```
