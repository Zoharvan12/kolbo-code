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

// Dev launches rebuild the CLI sidecar so backend source changes are included.
// Set SKIP_CLI_BUILD only for intentional frontend-only iteration.
if (!Bun.env.SKIP_CLI_BUILD) {
  // `build` is defined in packages/opencode, NOT at the workspace root — running
  // it from koduRoot fails with `Script not found "build"`. This only bites on a
  // clean tree (no prebuilt binary), which is why it went unnoticed: the branch
  // is skipped entirely whenever dist/ already holds a binary.
  const cliDir = path.join(koduRoot, "packages/opencode")
  const buildCmd = sidecarConfig.ocBinary.includes("-baseline")
    ? $`cd ${cliDir} && bun run build --single --baseline`
    : $`cd ${cliDir} && bun run build --single`
  await buildCmd
}

await copyBinaryToSidecarFolder(binaryPath, RUST_TARGET)
