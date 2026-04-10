import type { Argv, InferredOptionTypes } from "yargs"
import { Config } from "../config/config"
import { Flag } from "../flag/flag"

const options = {
  port: {
    type: "number" as const,
    describe: "port to listen on",
    default: 0,
  },
  hostname: {
    type: "string" as const,
    describe: "hostname to listen on",
    default: "127.0.0.1",
  },
  mdns: {
    type: "boolean" as const,
    describe: "enable mDNS service discovery (defaults hostname to 0.0.0.0)",
    default: false,
  },
  "mdns-domain": {
    type: "string" as const,
    describe: "custom domain name for mDNS service (default: kolbo.local)",
    default: "kolbo.local",
  },
  cors: {
    type: "string" as const,
    array: true,
    describe: "additional domains to allow for CORS",
    default: [] as string[],
  },
}

export type NetworkOptions = InferredOptionTypes<typeof options>

export function withNetworkOptions<T>(yargs: Argv<T>) {
  return yargs.options(options)
}

export async function resolveNetworkOptions(args: NetworkOptions) {
  const config = await Config.getGlobal()
  const portExplicitlySet = process.argv.includes("--port")
  const hostnameExplicitlySet = process.argv.includes("--hostname")
  const mdnsExplicitlySet = process.argv.includes("--mdns")
  const mdnsDomainExplicitlySet = process.argv.includes("--mdns-domain")
  const corsExplicitlySet = process.argv.includes("--cors")

  const mdns = mdnsExplicitlySet ? args.mdns : (config?.server?.mdns ?? args.mdns)
  const mdnsDomain = mdnsDomainExplicitlySet ? args["mdns-domain"] : (config?.server?.mdnsDomain ?? args["mdns-domain"])
  const port = portExplicitlySet ? args.port : (config?.server?.port ?? args.port)
  const hostname = hostnameExplicitlySet
    ? args.hostname
    : mdns && !config?.server?.hostname
      ? "0.0.0.0"
      : (config?.server?.hostname ?? args.hostname)
  const configCors = config?.server?.cors ?? []
  const argsCors = Array.isArray(args.cors) ? args.cors : args.cors ? [args.cors] : []
  const cors = [...configCors, ...argsCors]

  // Safety gate: binding to a non-loopback interface without authentication
  // exposes the full kolbo API (file ops, bash execution, session control)
  // to anyone on the network. Require KOLBO_SERVER_PASSWORD whenever we're
  // listening on something other than loopback.
  //
  // Exception: `0.0.0.0` is legal if the user has explicitly set a password.
  const isLoopback =
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "localhost" ||
    hostname === "localhost."
  if (!isLoopback && !Flag.KOLBO_SERVER_PASSWORD) {
    throw new Error(
      `Refusing to start kolbo server on ${hostname} without authentication.\n` +
        `Listening on a non-loopback interface would expose the kolbo API ` +
        `(including bash execution and file access) to anyone on the network.\n\n` +
        `Either:\n` +
        `  - remove --mdns / --hostname and let the server bind to 127.0.0.1, or\n` +
        `  - set KOLBO_SERVER_PASSWORD (and optionally KOLBO_SERVER_USERNAME) ` +
        `in the environment to enable basic-auth.`,
    )
  }

  return { hostname, port, mdns, mdnsDomain, cors }
}
