import z from "zod"
import path from "path"
import { modify, applyEdits } from "jsonc-parser"
import { Tool } from "./tool"
import DESCRIPTION from "./mcp-add.txt"
import { MCP } from "../mcp"
import type { Config } from "../config/config"
import { Instance } from "../project/instance"
import { Global } from "../global"
import { Filesystem } from "../util/filesystem"
import { Flag } from "@/flag/flag"

const Parameters = z.object({
  name: z
    .string()
    .min(1)
    .regex(/^[a-zA-Z0-9_-]+$/, "name must be alphanumeric with - or _")
    .describe("Short identifier for the MCP server, e.g. 'stripe' or 'github'."),
  type: z.enum(["remote", "local"]).describe("Transport type. Prefer 'remote' (https/sse). 'local' runs an arbitrary command."),
  url: z.string().optional().describe("For type='remote': the MCP server URL (https://...)."),
  headers: z
    .record(z.string(), z.string())
    .optional()
    .describe("For type='remote': optional request headers, e.g. { Authorization: 'Bearer ...' }."),
  oauth: z
    .boolean()
    .optional()
    .describe("For type='remote': set true if the server requires OAuth (user will need to run `kolbo mcp auth <name>` afterwards)."),
  command: z
    .array(z.string())
    .optional()
    .describe("For type='local': command + args to spawn, e.g. ['npx','-y','@modelcontextprotocol/server-filesystem','/some/dir']."),
  environment: z
    .record(z.string(), z.string())
    .optional()
    .describe("For type='local': environment variables to set on the spawned process."),
  scope: z
    .enum(["project", "global"])
    .optional()
    .describe("Where to persist the entry. Defaults to 'project' if inside a project worktree, otherwise 'global'."),
})

async function resolveConfigPath(baseDir: string, global: boolean) {
  const candidates = [path.join(baseDir, "kolbo.json"), path.join(baseDir, "kolbo.jsonc")]
  if (!global) {
    candidates.push(path.join(baseDir, ".kolbo", "kolbo.json"), path.join(baseDir, ".kolbo", "kolbo.jsonc"))
  }
  for (const candidate of candidates) {
    if (await Filesystem.exists(candidate)) return candidate
  }
  return candidates[0]
}

async function writeMcpEntry(name: string, mcp: Config.Mcp, configPath: string) {
  let text = "{}"
  if (await Filesystem.exists(configPath)) text = await Filesystem.readText(configPath)
  const edits = modify(text, ["mcp", name], mcp, { formattingOptions: { tabSize: 2, insertSpaces: true } })
  await Filesystem.write(configPath, applyEdits(text, edits))
}

export const McpAddTool = Tool.define("mcp_add", {
  description: DESCRIPTION,
  parameters: Parameters,
  async execute(params, ctx) {
    if (params.type === "remote") {
      if (!params.url) throw new Error("`url` is required when type='remote'")
      if (!/^https?:\/\//i.test(params.url)) throw new Error("`url` must start with http:// or https://")
    }
    if (params.type === "local") {
      if (!Flag.KOLBO_ALLOW_AGENT_ADD_STDIO_MCP) {
        throw new Error(
          "Adding local (stdio) MCP servers from chat is disabled. The user must run `kolbo mcp add` manually, or set KOLBO_ALLOW_AGENT_ADD_STDIO_MCP=true to enable.",
        )
      }
      if (!params.command || params.command.length === 0) {
        throw new Error("`command` is required when type='local'")
      }
    }

    const useGlobal =
      params.scope === "global" || (params.scope === undefined && !Instance.worktree)
    const configPath = await resolveConfigPath(
      useGlobal ? Global.Path.config : Instance.worktree,
      useGlobal,
    )

    await ctx.ask({
      permission: "mcp_add",
      patterns: [params.name],
      always: [],
      metadata: {
        name: params.name,
        type: params.type,
        url: params.url,
        command: params.command,
        scope: useGlobal ? "global" : "project",
        configPath,
        oauth: params.oauth,
      },
    })

    let mcp: Config.Mcp
    if (params.type === "remote") {
      mcp = {
        type: "remote",
        url: params.url!,
        enabled: false,
        ...(params.headers && { headers: params.headers }),
        ...(params.oauth && { oauth: {} }),
      }
    } else {
      mcp = {
        type: "local",
        command: params.command!,
        enabled: false,
        ...(params.environment && { environment: params.environment }),
      }
    }

    await writeMcpEntry(params.name, mcp, configPath)

    // Live-connect for this session only. `enabled: false` was persisted above so
    // the server will NOT auto-start on next kolbo launch — the user must turn it
    // on explicitly. We pass enabled:true here so the in-memory connect proceeds.
    const result = await MCP.add(params.name, { ...mcp, enabled: true } as Config.Mcp)
    const statusMap = result.status as Record<string, { status: string } | undefined>
    const connectionState = statusMap[params.name]?.status ?? "unknown"

    const lines: string[] = []
    lines.push(`Added MCP server "${params.name}" (${params.type}) to ${configPath}.`)
    lines.push(`Live connection status: ${connectionState}.`)
    lines.push(`Persisted with enabled=false — user must enable it (edit kolbo.json or use the CLI) for it to start on next launch.`)
    if (params.type === "remote" && params.oauth) {
      lines.push(`This server requires OAuth. The user should now run: kolbo mcp auth ${params.name}`)
    }

    return {
      title: `mcp:add ${params.name}`,
      output: lines.join("\n"),
      metadata: {
        name: params.name,
        configPath,
        connectionState,
      },
    }
  },
})
