import path from "path"
import fsp from "fs/promises"
import { Effect } from "effect"
import type { Tool } from "./tool"
import { Instance } from "../project/instance"
import { AppFileSystem } from "../filesystem"

type Kind = "file" | "directory"

type Options = {
  bypass?: boolean
  kind?: Kind
}

export async function assertExternalDirectory(ctx: Tool.Context, target?: string, options?: Options) {
  if (!target) return

  if (options?.bypass) return

  const full = process.platform === "win32" ? AppFileSystem.normalizePath(target) : target
  if (Instance.containsPath(full)) return

  const kind = options?.kind ?? "file"
  const dir = kind === "directory" ? full : path.dirname(full)
  const glob =
    process.platform === "win32"
      ? AppFileSystem.normalizePathPattern(path.join(dir, "*"))
      : path.join(dir, "*").replaceAll("\\", "/")

  await ctx.ask({
    permission: "external_directory",
    patterns: [glob],
    always: [glob],
    metadata: {
      filepath: full,
      parentDir: dir,
    },
  })
}

export const assertExternalDirectoryEffect = Effect.fn("Tool.assertExternalDirectory")(function* (
  ctx: Tool.Context,
  target?: string,
  options?: Options,
) {
  yield* Effect.promise(() => assertExternalDirectory(ctx, target, options))
})

/**
 * Resolve a target path to its real on-disk location, following symlinks.
 *
 * Used to defeat symlink-based TOCTOU escapes where a file inside the
 * project (which `assertExternalDirectory` would otherwise wave through)
 * actually points at `/etc/shadow` or similar. Call the assertion on the
 * resolved path so the external-directory prompt fires correctly.
 *
 * For paths that don't exist yet (new files being written), we resolve the
 * parent directory instead — this is still enough to catch a symlinked
 * parent directory pointing outside the project.
 */
export async function resolveRealPath(target: string): Promise<string> {
  try {
    return await fsp.realpath(target)
  } catch {
    const parent = path.dirname(target)
    try {
      const realParent = await fsp.realpath(parent)
      return path.join(realParent, path.basename(target))
    } catch {
      return target
    }
  }
}
