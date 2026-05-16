import { $ } from "bun"

export const SIDECAR_BINARIES: Array<{ rustTarget: string; ocBinary: string; assetExt: string }> = [
  {
    rustTarget: "aarch64-apple-darwin",
    ocBinary: "@kolbo/kolbo-code-darwin-arm64",
    assetExt: "zip",
  },
  {
    rustTarget: "x86_64-apple-darwin",
    ocBinary: "@kolbo/kolbo-code-darwin-x64",
    assetExt: "zip",
  },
  {
    // Universal Mac sidecar — CI builds this by lipo-merging arm64 + x64.
    // For local dev / one-off use, fall back to arm64 (host arch on M-series).
    rustTarget: "universal-apple-darwin",
    ocBinary: "@kolbo/kolbo-code-darwin-arm64",
    assetExt: "zip",
  },
  {
    rustTarget: "aarch64-pc-windows-msvc",
    ocBinary: "@kolbo/kolbo-code-windows-arm64",
    assetExt: "zip",
  },
  {
    rustTarget: "x86_64-pc-windows-msvc",
    ocBinary: "@kolbo/kolbo-code-windows-x64",
    assetExt: "zip",
  },
  {
    rustTarget: "x86_64-unknown-linux-gnu",
    ocBinary: "@kolbo/kolbo-code-linux-x64",
    assetExt: "tar.gz",
  },
  {
    rustTarget: "aarch64-unknown-linux-gnu",
    ocBinary: "@kolbo/kolbo-code-linux-arm64",
    assetExt: "tar.gz",
  },
]

export const RUST_TARGET = Bun.env.RUST_TARGET

export function getCurrentSidecar(target = RUST_TARGET) {
  if (!target && !RUST_TARGET) throw new Error("RUST_TARGET not set")

  const binaryConfig = SIDECAR_BINARIES.find((b) => b.rustTarget === target)
  if (!binaryConfig) throw new Error(`Sidecar configuration not available for Rust target '${RUST_TARGET}'`)

  return binaryConfig
}

export async function copyBinaryToSidecarFolder(source: string, target = RUST_TARGET) {
  await $`mkdir -p src-tauri/sidecars`
  const dest = windowsify(`src-tauri/sidecars/opencode-cli-${target}`)
  await $`cp ${source} ${dest}`
  if (process.platform === "win32" && process.env.GITHUB_ACTIONS === "true") {
    await $`pwsh -NoLogo -NoProfile -ExecutionPolicy Bypass -File ../../script/sign-windows.ps1 ${dest}`
  }
  // macOS kills unsigned Mach-O binaries on launch (SIGKILL). Ad-hoc sign for local dev so
  // the sidecar passes Gatekeeper. CI replaces this with a real Developer ID signature.
  if (process.platform === "darwin" && process.env.GITHUB_ACTIONS !== "true") {
    await $`codesign --remove-signature ${dest}`.nothrow().quiet()
    await $`codesign --force --deep -s - ${dest}`
  }

  console.log(`Copied ${source} to ${dest}`)
}

export function windowsify(path: string) {
  if (path.endsWith(".exe")) return path
  return `${path}${process.platform === "win32" ? ".exe" : ""}`
}
