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

  // DISABLED: previously auto-fired the `/init` command on every brand-new
  // empty project, which spawned a session titled "Project initialization"
  // and dumped the multi-paragraph initialize.txt prompt into the chat as
  // a visible user message. Two bad side effects:
  //   1. Users opening a new dir saw a wall of technical instructions
  //      pretending to be their own input — terrifying first impression.
  //   2. The /init prompt asks the agent to "read existing instruction
  //      files including KOLBO.md, CLAUDE.md, …" — the agent over-read
  //      `~/.claude/CLAUDE.md` (the USER's global / personal config) and
  //      transcribed its contents into the project's KOLBO.md. Personal
  //      preferences ("respond in Hebrew", "never commit without asking")
  //      were leaked into a per-project file.
  // session/instruction.ts already auto-creates a clean placeholder
  // KOLBO.md (empty `<!-- comment -->` sections) on first session in any
  // workspace that doesn't have one, so no auto-init is needed for the
  // file to exist. Users can run `/init` manually when they actually want
  // the AI to scan and fill the project sections.
  if (!Instance.project.time.initialized) {
    // Mark the project as initialized anyway so we don't try this again,
    // even though we don't actually fire the auto-init session.
    Project.setInitialized(Instance.project.id)
  }
}
