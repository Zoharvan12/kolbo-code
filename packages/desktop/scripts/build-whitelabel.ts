#!/usr/bin/env bun
/**
 * Builds the desktop app for a specific whitelabel.
 *
 * Usage:
 *   bun run scripts/build-whitelabel.ts <slug> [-- <extra tauri args>]
 *
 * Example:
 *   bun run scripts/build-whitelabel.ts sapir
 *   bun run scripts/build-whitelabel.ts sapir -- --target x86_64-pc-windows-msvc --bundles nsis
 */

import { parseArgs } from "node:util"
import { readFileSync, writeFileSync, existsSync } from "node:fs"
import { resolve } from "node:path"
import { $ } from "bun"

const { positionals, values } = parseArgs({
  args: Bun.argv.slice(2),
  allowPositionals: true,
  options: {},
  strict: false,
})

const slug = positionals[0]
if (!slug) {
  console.error("Usage: build-whitelabel.ts <slug>")
  process.exit(1)
}

const root = resolve(import.meta.dir, "..")
const configPath = resolve(root, "whitelabels", slug, "config.json")

if (!existsSync(configPath)) {
  console.error(`Whitelabel config not found: ${configPath}`)
  process.exit(1)
}

type WhitelabelConfig = {
  productName: string
  identifier: string
  mainBinaryName: string
  deepLinkScheme: string
  splashImage: string
  logoImage?: string
  faviconImage?: string
  brandName?: string
  apiBase?: string
  appBase?: string
}

const config: WhitelabelConfig = JSON.parse(readFileSync(configPath, "utf8"))
console.log(`Building whitelabel: ${config.productName} (${slug})`)

const tauriConfPath = resolve(root, "src-tauri/tauri.conf.json")
const original = readFileSync(tauriConfPath, "utf8")
const conf = JSON.parse(original)

// Patch tauri.conf.json for this whitelabel
conf.productName = config.productName
conf.identifier = config.identifier
conf.mainBinaryName = config.mainBinaryName

conf.bundle.icon = [
  `icons/${slug}/32x32.png`,
  `icons/${slug}/128x128.png`,
  `icons/${slug}/128x128@2x.png`,
  `icons/${slug}/icon.icns`,
  `icons/${slug}/icon.ico`,
]

if (!conf.bundle.windows) conf.bundle.windows = {}
if (!conf.bundle.windows.nsis) conf.bundle.windows.nsis = {}
conf.bundle.windows.nsis.installerIcon = `icons/${slug}/icon.ico`
conf.bundle.windows.nsis.headerImage = `assets/${slug}-nsis-header.bmp`
conf.bundle.windows.nsis.sidebarImage = `assets/${slug}-nsis-sidebar.bmp`

if (conf.plugins?.["deep-link"]?.desktop) {
  conf.plugins["deep-link"].desktop.schemes = [config.deepLinkScheme]
}

writeFileSync(tauriConfPath, JSON.stringify(conf, null, 2) + "\n")
console.log("✓ Patched tauri.conf.json")

try {
  const doubleDashIdx = Bun.argv.indexOf("--")
  const extraArgs = doubleDashIdx >= 0 ? Bun.argv.slice(doubleDashIdx + 1) : []

  const buildEnv: Record<string, string> = {
    ...process.env as Record<string, string>,
    VITE_WHITELABEL_SPLASH: config.splashImage,
    VITE_WHITELABEL_NAME: config.brandName ?? config.productName,
  }
  if (config.logoImage) {
    buildEnv.VITE_WHITELABEL_LOGO = config.logoImage
    buildEnv.VITE_WHITELABEL_FAVICON = config.faviconImage ?? config.logoImage
  }
  if (config.faviconImage) buildEnv.VITE_WHITELABEL_FAVICON = config.faviconImage
  if (config.apiBase) buildEnv.KOLBO_WHITELABEL_API_BASE = config.apiBase
  if (config.appBase) buildEnv.KOLBO_WHITELABEL_APP_BASE = config.appBase

  await $`bunx tauri build ${extraArgs}`.env(buildEnv).cwd(root)

  console.log(`\n✓ Build complete for ${config.productName}`)
} catch (err) {
  console.error("Build failed:", err)
  process.exitCode = 1
} finally {
  writeFileSync(tauriConfPath, original)
  console.log("✓ Restored tauri.conf.json")
}
