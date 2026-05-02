import { $ } from "bun"
import path from "path"

import { copyBinaryToSidecarFolder, getCurrentSidecar, windowsify } from "./utils"

const RUST_TARGET = Bun.env.TAURI_ENV_TARGET_TRIPLE

const sidecarConfig = getCurrentSidecar(RUST_TARGET)

// Support monorepo layout: kodu repo may be the workspace root (two levels up)
// or a sibling directory. Detect which exists.
const monoroot = path.resolve(import.meta.dir, "../../..")
const siblingKodu = path.resolve(import.meta.dir, "../../..") // same in monorepo
const koduRoot = Bun.file(path.join(monoroot, "packages/opencode/package.json")).size > 0
  ? monoroot
  : path.resolve(import.meta.dir, "../../../kodu")

const binaryPath = windowsify(`${koduRoot}/packages/opencode/dist/${sidecarConfig.ocBinary}/bin/kolbo`)

// Skip the CLI rebuild if SKIP_CLI_BUILD is set or if the binary already exists
if (!Bun.env.SKIP_CLI_BUILD && !Bun.file(binaryPath.replace(/\.exe$/, "") + (process.platform === "win32" ? ".exe" : "")).size) {
  const buildCmd = sidecarConfig.ocBinary.includes("-baseline")
    ? $`cd ${koduRoot} && bun run build --single --baseline`
    : $`cd ${koduRoot} && bun run build --single`
  await buildCmd
}

await copyBinaryToSidecarFolder(binaryPath, RUST_TARGET)
