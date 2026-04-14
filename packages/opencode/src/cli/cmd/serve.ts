import { Server } from "../../server/server"
import { cmd } from "./cmd"
import { withNetworkOptions, resolveNetworkOptions } from "../network"
import { Flag } from "../../flag/flag"
import { Workspace } from "../../control-plane/workspace"
import { Project } from "../../project/project"
import { Installation } from "../../installation"
import { EOL } from "os"

export const ServeCommand = cmd({
  command: "serve",
  builder: (yargs) => withNetworkOptions(yargs),
  describe: "starts a headless kolbo server",
  handler: async (args) => {
    if (!Flag.KOLBO_SERVER_PASSWORD) {
      console.log("Warning: KOLBO_SERVER_PASSWORD is not set; server is unsecured.")
    }
    const opts = await resolveNetworkOptions(args)
    const server = await Server.listen(opts)
    // Signal Tauri desktop that DB is ready (no migration needed in serve mode)
    process.stderr.write(`sqlite-migration:done${EOL}`)
    console.log(`kolbo server listening on http://${server.hostname}:${server.port}`)

    await new Promise(() => {})
    await server.stop()
  },
})
