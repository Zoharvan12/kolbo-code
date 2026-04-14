#!/usr/bin/env node
// Applies Kolbo Code branding to tauri.conf.json and source files.
// Called from CI (avoids PowerShell quote-escaping issues with inline node -e).
const fs = require("fs")
const path = require("path")

const root = path.resolve(__dirname, "..")

// 1. tauri.conf.json
const confPath = path.join(root, "src-tauri/tauri.conf.json")
const conf = JSON.parse(fs.readFileSync(confPath, "utf8"))
conf.productName = "Kolbo Code"
conf.identifier = "ai.kolbo.code"
conf.mainBinaryName = "Kolbo Code"
if (conf.plugins?.["deep-link"]?.desktop) {
  conf.plugins["deep-link"].desktop.schemes = ["kolbo-code"]
}
fs.writeFileSync(confPath, JSON.stringify(conf, null, 2) + "\n")
console.log("tauri.conf.json updated")

// 2. Source files: __OPENCODE__ → __KOLBO_CODE__, title("OpenCode") → title("Kolbo Code")
const files = ["src/index.tsx", "src/updater.ts", "src-tauri/src/windows.rs"]
for (const rel of files) {
  const f = path.join(root, rel)
  try {
    let c = fs.readFileSync(f, "utf8")
    c = c.replace(/__OPENCODE__/g, "__KOLBO_CODE__")
    c = c.replace(/\.title\("OpenCode"\)/g, '.title("Kolbo Code")')
    fs.writeFileSync(f, c)
    console.log(`patched ${rel}`)
  } catch {
    // file may not exist on all platforms
  }
}
console.log("Branding applied.")
