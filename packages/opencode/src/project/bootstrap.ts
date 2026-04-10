import { Plugin } from "../plugin"
import { Format } from "../format"
import { LSP } from "../lsp"
import { File } from "../file"
import { FileWatcher } from "../file/watcher"
import { Snapshot } from "../snapshot"
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
}
