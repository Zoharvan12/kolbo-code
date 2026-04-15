---
description: "Explain the desktop app architecture — file paths, how it works, differences from the CLI, shared code, and the deploy process."
---

# Kolbo Code — Desktop App Guide

## Package Map

```
packages/
├── desktop/          ← Tauri wrapper (this IS the desktop app)
│   ├── src/          ← SolidJS frontend (runs inside Tauri WebView)
│   │   ├── index.tsx     ← Entry point + Platform implementation
│   │   ├── bindings.ts   ← Auto-generated Rust→TS IPC stubs (via Specta)
│   │   ├── cli.ts        ← CLI install helper (macOS/Linux)
│   │   ├── menu.ts       ← macOS native menu bar
│   │   ├── updater.ts    ← Auto-update logic
│   │   └── webview-zoom.ts
│   ├── src-tauri/    ← Rust backend
│   │   ├── tauri.conf.json   ← Product name "Kolbo Code", identifier "ai.kolbo.code"
│   │   ├── Cargo.toml        ← Tauri 2.9.5, Specta for codegen
│   │   └── src/
│   │       ├── lib.rs        ← IPC command handlers, plugin setup, sidecar spawn
│   │       ├── main.rs       ← Rust entry point
│   │       ├── windows.rs    ← Window creation (.disable_drag_drop_handler() here)
│   │       ├── server.rs     ← Sidecar spawn + health check
│   │       └── cli.rs        ← CLI subprocess management
│   ├── scripts/
│   │   ├── predev.ts         ← Builds/copies CLI binary before dev starts
│   │   ├── prepare.ts        ← CI: bumps version, downloads artifact
│   │   ├── copy-bundles.ts   ← Copies compiled binaries to sidecars/
│   │   └── utils.ts          ← getCurrentSidecar(), copyBinaryToSidecarFolder()
│   └── vite.config.ts        ← Vite, port 1420 (required by Tauri)
│
├── app/              ← Shared SolidJS app (used by desktop + web)
│   └── src/
│       ├── context/platform.tsx  ← Platform interface (abstraction boundary)
│       └── ...                   ← All core UI, sessions, prompts, settings
│
├── opencode/         ← CLI executable (sidecar inside desktop; npm package for terminal)
├── ui/               ← Shared UI component library
├── sdk/              ← Programmatic SDK
└── util/             ← Shared utilities
```

---

## How It Works

**Startup flow:**

```
Tauri launches
  → lib.rs: loads plugins, spawns CLI sidecar (server.rs)
  → Waits for HTTP health check (sidecar is ready)
  → Sends URL + credentials to WebView via Channel

WebView (index.tsx):
  → commands.awaitInitialization(channel)  ← waits for Rust signal
  → Receives { url, username, password }
  → Renders <AppInterface server={...} />   ← the shared app package
```

**The key design:** `packages/app/` is platform-agnostic. It defines a `Platform` interface in `platform.tsx` that the desktop implements in `packages/desktop/src/index.tsx`. The app never calls Tauri directly — it calls `platform.openFile()`, `platform.readClipboardImage()`, etc.

**IPC mechanism:** Rust commands in `lib.rs` are exposed to TypeScript via `tauri::command` macros + Specta codegen → `bindings.ts`. All async calls go through `invoke("command_name", args)`.

---

## Desktop-Only vs Shared

| Feature | Desktop | Terminal CLI |
|---|---|---|
| Native file open/save dialogs | ✓ `plugin-dialog` | ✗ |
| Clipboard image read | ✓ `plugin-clipboard-manager` | ✗ |
| System notifications | ✓ `plugin-notification` | ✗ |
| macOS native menu bar | ✓ `menu.ts` | ✗ |
| Auto-update (Tauri updater) | ✓ `updater.ts` | ✗ |
| WebView zoom (Cmd/Ctrl +/-) | ✓ `webview-zoom.ts` | ✗ |
| Window state persistence | ✓ `plugin-window-state` | ✗ |
| WSL path conversion | ✓ `commands.wslPath()` | ✗ |
| Deep links (`kolbo-code://`) | ✓ `plugin-deep-link` | ✗ |
| Download folder setting | ✓ `plugin-store` | ✗ |
| Display backend (Wayland) | ✓ Linux only | ✗ |
| Core sessions, AI, terminal | ✓ | ✓ (both use `packages/app/`) |
| File browsing, diffs, settings | ✓ | ✓ |

**Shared packages** (used by both):
- `@opencode-ai/app` — all core logic and UI
- `@opencode-ai/ui` — component library
- `@opencode-ai/sdk` — SDK
- `@opencode-ai/util` — utilities
- `@opencode-ai/opencode` (published as `@kolbo/kolbo-code`) — the CLI, which the desktop bundles as a sidecar binary

---

## Dev Workflow

```bash
# One-time setup
bun install

# Start desktop dev
cd packages/desktop
bun run predev    # builds CLI binary + copies to src-tauri/sidecars/
                  # set SKIP_CLI_BUILD=1 to skip if binary already exists

# In two terminals:
bun run dev       # Vite dev server on port 1420
tauri dev         # Tauri + WebView, connects to Vite HMR
```

**What `predev.ts` does:**
1. Reads `TAURI_ENV_TARGET_TRIPLE` (e.g. `x86_64-pc-windows-msvc`)
2. Maps to binary config (e.g. `opencode-windows-x64-baseline`)
3. Checks if binary exists at `../../packages/opencode/dist/.../bin/kodu`
4. If missing: runs `bun run build --single` (or `--baseline`) to compile CLI
5. Copies result to `src-tauri/sidecars/opencode-cli-<target>`

**Key env vars:**
- `SKIP_CLI_BUILD=1` — skip CLI rebuild, use existing binary
- `TAURI_ENV_TARGET_TRIPLE` — Rust target triple (set automatically by Tauri)
- `TAURI_SIGNING_PRIVATE_KEY` — code signing (CI only)
- `KOLBO_VERSION` — release version (CI only)

---

## Deploy Process

### Desktop release (GitHub Actions — `kolbo-desktop-release.yml`)

Triggered manually with a `version` input. Runs on Windows (macOS/Linux disabled in current config).

```
1. Setup: Bun, Node, Rust toolchain
2. Set version in packages/desktop/package.json
3. Apply Kolbo branding (config, identifiers)
4. Download CLI sidecar binary (from npm or CI artifact)
5. tauri-apps/tauri-action → runs:
     bun run build   (Vite production build)
     tauri build     (Rust compilation + bundling)
6. Outputs: NSIS installer (.exe) for Windows, .dmg for macOS, .deb for Linux
7. Creates GitHub release + uploads binaries
```

**Important — filename convention:**
GitHub converts spaces → dots in uploaded filenames.
`Kolbo Code-Setup-1.0.1.exe` becomes `Kolbo.Code-Setup-1.0.1.exe`
`latest.yml` must use dots or auto-update 404s (downloads ~300KB error page instead of ~175MB installer).

### CLI release (npm — separate from desktop)

Use `/deploy` skill — it handles: commit → upstream sync → version bump → tag → push → trigger `kolbo-release.yml` on `Zoharvan12/kolbo-code`.

### Version locations

| File | What to bump |
|---|---|
| `packages/opencode/package.json` | CLI version (used by `/deploy`) |
| `packages/desktop/package.json` | Desktop app version (used by desktop release CI) |
| `packages/desktop/src-tauri/tauri.conf.json` | Must match desktop package.json |

The two versions are **independent** — CLI and desktop can release separately.
