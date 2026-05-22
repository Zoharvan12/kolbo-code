#!/usr/bin/env bun
/**
 * Build the kolbo-code CLI sidecar from local source and copy it over the
 * binary that the *installed* Kolbo Code desktop app runs. Lets you iterate
 * on server-side fixes (prompt.ts, MCP tools, session pipeline) and see them
 * in the released desktop app without waiting for a full installer release.
 *
 * Limitation: this swaps ONLY the sidecar. Frontend changes (canvas / chips /
 * RTL / spinner CSS) live in the bundled Vite build inside Kolbo Code.exe and
 * cannot be hot-swapped — those still require `bun tauri dev` or a full
 * installer release.
 *
 * Usage:
 *   bun run swap-installed-sidecar         # from packages/desktop
 *   bun ./scripts/swap-installed-sidecar.ts --no-build  # skip rebuild
 *   KOLBO_INSTALL_DIR=... bun ...          # override install location
 */

import { $ } from "bun"
import path from "path"
import { existsSync, statSync } from "fs"
import { platform, homedir } from "os"

const skipBuild = process.argv.includes("--no-build")

function defaultInstallDir(): string {
  if (process.env.KOLBO_INSTALL_DIR) return process.env.KOLBO_INSTALL_DIR
  const home = homedir()
  switch (platform()) {
    case "win32":
      return path.join(process.env.LOCALAPPDATA ?? path.join(home, "AppData", "Local"), "Kolbo Code")
    case "darwin":
      // Tauri macOS app bundle — sidecar lives inside Contents/Resources/sidecars.
      return "/Applications/Kolbo Code.app/Contents/Resources/sidecars"
    default:
      return path.join(home, ".local", "share", "kolbo-code")
  }
}

function sidecarFilename(): string {
  return platform() === "win32" ? "opencode-cli.exe" : "opencode-cli"
}

function distSidecarPath(repoRoot: string): string {
  const targets: Record<string, string> = {
    "win32-x64": "@kolbo/kolbo-code-windows-x64/bin/kolbo.exe",
    "darwin-arm64": "@kolbo/kolbo-code-darwin-arm64/bin/kolbo",
    "darwin-x64": "@kolbo/kolbo-code-darwin-x64/bin/kolbo",
    "linux-x64": "@kolbo/kolbo-code-linux-x64/bin/kolbo",
  }
  const key = `${platform()}-${process.arch}`
  const rel = targets[key]
  if (!rel) throw new Error(`No sidecar binary mapping for ${key}`)
  return path.join(repoRoot, "packages/opencode/dist", rel)
}

async function killRunning() {
  const names = ["Kolbo Code.exe", "opencode-cli.exe", "opencode-desktop.exe"]
  for (const name of names) {
    if (platform() === "win32") {
      // taskkill exits non-zero when the process isn't running — that's fine.
      await $`taskkill /F /IM ${name} /T`.nothrow().quiet()
    } else if (platform() === "darwin") {
      await $`pkill -f ${name}`.nothrow().quiet()
    }
  }
}

const repoRoot = path.resolve(import.meta.dir, "../../..")
const installDir = defaultInstallDir()
const dest = path.join(installDir, sidecarFilename())
const source = distSidecarPath(repoRoot)

if (!existsSync(installDir)) {
  console.error(`✗ Install dir not found: ${installDir}`)
  console.error("  Set KOLBO_INSTALL_DIR=... to override, or install Kolbo Code first.")
  process.exit(1)
}

if (!skipBuild) {
  console.log("→ Building sidecar (packages/opencode)…")
  await $`bun run build --single`.cwd(path.join(repoRoot, "packages/opencode"))
} else {
  console.log("→ Skipping build (--no-build).")
}

if (!existsSync(source)) {
  console.error(`✗ Built binary not found: ${source}`)
  console.error("  Run without --no-build, or check packages/opencode/script/build.ts output.")
  process.exit(1)
}

const sourceSize = statSync(source).size
const sourceMtime = statSync(source).mtime

console.log("→ Stopping installed Kolbo Code processes…")
await killRunning()
// Brief settle so Windows releases the file lock on the .exe.
await new Promise((r) => setTimeout(r, 750))

console.log(`→ Copying ${source} → ${dest}`)
await $`cp ${source} ${dest}`

const got = statSync(dest)
console.log(
  `✓ Sidecar swapped (${(got.size / 1024 / 1024).toFixed(1)} MB, built ${sourceMtime.toISOString()}). ` +
    `Reopen Kolbo Code to pick it up.`,
)
