import { existsSync } from "fs"
import path from "path"
import { Plugin } from "../plugin"
import { Format } from "../format"
import { LSP } from "../lsp"
import { File } from "../file"
import { FileWatcher } from "../file/watcher"
import { Snapshot } from "../snapshot"
import { Session } from "../session"
import { SessionPrompt } from "../session/prompt"
import { Project } from "./project"
import { Vcs } from "./vcs"
import { Bus } from "../bus"
import { Command } from "../command"
import { Instance } from "./instance"
import { Log } from "@/util/log"
import { ShareNext } from "@/share/share-next"

export async function InstanceBootstrap() {
  Log.Default.info("bootstrapping", { directory: Instance.directory })
  // Fire non-blocking inits immediately (they all initialize lazily on first use)
  ShareNext.init()
  Format.init()
  LSP.init() // don't await — initializes lazily on first file touch
  File.init()
  FileWatcher.init()
  Vcs.init()
  Snapshot.init()
  // Plugin.init() must complete before TUI is usable (auth, model loading)
  await Plugin.init()

  Bus.subscribe(Command.Event.Executed, async (payload) => {
    if (payload.properties.name === Command.Default.INIT) {
      Project.setInitialized(Instance.project.id)
    }
  })

  // Auto-run /init only on brand-new empty projects (no instruction file AND no existing code)
  // Existing repos opened for the first time should not get a surprise /init session.
  if (!Instance.project.time.initialized) {
    const dir = Instance.directory
    const hasInstructionFile =
      existsSync(path.join(dir, "KOLBO.md")) ||
      existsSync(path.join(dir, "AGENTS.md")) ||
      existsSync(path.join(dir, "CLAUDE.md"))
    const hasExistingCode =
      existsSync(path.join(dir, "package.json")) ||
      existsSync(path.join(dir, "Cargo.toml")) ||
      existsSync(path.join(dir, "pyproject.toml")) ||
      existsSync(path.join(dir, "go.mod")) ||
      existsSync(path.join(dir, ".git"))
    if (!hasInstructionFile && !hasExistingCode) {
      Session.create({ title: "Project initialization" })
        .then((session) =>
          SessionPrompt.command({
            sessionID: session.id,
            command: Command.Default.INIT,
            arguments: "",
          }),
        )
        .catch((err) => {
          Log.Default.warn("auto-init failed", { error: err })
        })
    }
  }
}
