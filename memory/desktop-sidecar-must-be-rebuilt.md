---
name: desktop-sidecar-must-be-rebuilt
description: kolbo-code desktop runs a COMPILED opencode sidecar binary — engine/skill changes (packages/opencode) don't apply until the sidecar is rebuilt+swapped; only frontend (app/ui) changes hot-reload
metadata:
  type: project
---

The Kolbo Code desktop app spawns a **compiled sidecar binary** (`opencode-cli.exe`), NOT the opencode source. `cli.rs get_sidecar_path` → `<app-dir>/opencode-cli`. Installed location on Windows: `%LOCALAPPDATA%\Kolbo Code\opencode-cli.exe`.

Consequence: changes to `packages/opencode/**` (permission gating in `agent.ts`, `session/prompt.ts`, the Kolbo SKILL.md, MCP wiring) DO NOT take effect from `tauri dev` or reopening the app. `packages/desktop/scripts/predev.ts` even **skips the CLI rebuild if a built binary already exists**, so a stale `packages/opencode/dist/.../bin/kolbo` gets reused. Only `packages/app` + `packages/ui` (Vite frontend) hot-reload.

To make engine/skill changes live:
- Installed app: `cd packages/desktop && bun run swap-installed-sidecar` (builds `bun run build --single` in packages/opencode, kills running Kolbo Code, copies the fresh binary over `%LOCALAPPDATA%\Kolbo Code\opencode-cli.exe`).
- `tauri dev`: delete the stale `packages/opencode/dist/@kolbo/kolbo-code-windows-x64/bin/kolbo.exe` first (or set nothing so predev rebuilds), then run dev; predev copies the fresh binary into `src-tauri/sidecars`.

**Why:** I shipped engine-level generation gating + a skill rule and told Zohar to "rebuild", but the desktop kept running the May-built sidecar, so generations still fired without the approval card — it looked like my changes did nothing. The frontend changes (icons, rail, dock) DID show because those are the Vite bundle.

**How to apply:** After ANY `packages/opencode` change meant to affect the desktop app, rebuild+swap the sidecar and tell the user to reopen — never just "rebuild the frontend". Related: [[confirm-brief-before-generating]].
