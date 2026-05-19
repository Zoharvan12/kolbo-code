import z from "zod"
import { Tool } from "./tool"
import { MCP } from "../mcp"
import { Log } from "../util/log"

const log = Log.create({ service: "invalid-tool" })

// Kolbo MCP tool surface — keep in sync with @kolbo/mcp tool registrations.
// We use a prefix check first ("mcp__kolbo__*", "kolbo_*") and fall back to a
// known-name list so models that drop the prefix still get healed.
const KOLBO_MCP_TOOL_NAMES = new Set([
  "list_models",
  "check_credits",
  "list_voices",
  "list_presets",
  "list_moodboards",
  "get_moodboard",
  "list_visual_dnas",
  "get_visual_dna",
  "create_visual_dna",
  "delete_visual_dna",
  "generate_image",
  "generate_image_edit",
  "generate_video",
  "generate_video_from_image",
  "generate_video_from_video",
  "generate_elements",
  "generate_first_last_frame",
  "generate_lipsync",
  "generate_creative_director",
  "generate_music",
  "generate_speech",
  "generate_sound",
  "generate_3d",
  "transcribe_audio",
  "get_generation_status",
  "chat_send_message",
  "chat_list_conversations",
  "chat_get_messages",
  "upload_media",
  "list_media",
  "get_media",
  "delete_media",
  "restore_media",
])

function looksLikeKolboMcpTool(name: string): boolean {
  if (!name) return false
  if (name.startsWith("mcp__kolbo__")) return true
  if (name.startsWith("kolbo_")) return true
  return KOLBO_MCP_TOOL_NAMES.has(name)
}

export const InvalidTool = Tool.define("invalid", {
  description: "Do not use",
  parameters: z.object({
    tool: z.string(),
    error: z.string(),
  }),
  async execute(params) {
    // Self-heal: if the model tried to call a Kolbo MCP tool that wasn't
    // available (typical cause: the kolbo MCP server is in `failed` state),
    // kick off a reconnect right now. The next tool call in this same turn —
    // or the next user message — will see the recovered tool list. Without
    // this branch the model would parrot the kolbo-identity prompt at the
    // user, which is the wrong UX for desktop/web users who have no terminal.
    if (looksLikeKolboMcpTool(params.tool)) {
      const status = await MCP.status().catch(() => undefined)
      const kolbo = status?.kolbo
      const isDown = !kolbo || (kolbo.status !== "connected" && kolbo.status !== "disabled")
      if (isDown) {
        log.warn("kolbo MCP tool called while server down — triggering reconnect", {
          tool: params.tool,
          mcpStatus: kolbo?.status,
        })

        // Fire-and-forget reconnect with a short bounded wait so the model
        // doesn't sit idle for the full MCP connect timeout. We surface a
        // deterministic instruction either way; the model handles the rest.
        const reconnect = MCP.connect("kolbo").catch((err) => {
          log.error("kolbo MCP reconnect failed", { err: err?.message })
        })
        await Promise.race([reconnect, new Promise((r) => setTimeout(r, 4000))])

        const post = await MCP.status().catch(() => undefined)
        const recovered = post?.kolbo?.status === "connected"

        return {
          title: "Kolbo MCP reconnect in progress",
          output: recovered
            ? `[KOLBO_MCP_RECONNECTED] The Kolbo MCP server was disconnected and has now reconnected. Retry the same tool call ("${params.tool}") with the same arguments — it should succeed. Do NOT tell the user to open a terminal, run any CLI command, or restart the editor — those are wrong for desktop/web users and the in-app flow handles reconnection.`
            : `[KOLBO_MCP_RECONNECTING] The Kolbo MCP server is currently not connected. A reconnect attempt is in progress in the background. Reply with one short sentence telling the user the Kolbo connection dropped and is reconnecting; do not call any other kolbo_* tool until they reply. Do NOT tell them to open a terminal, run "kolbo auth login", restart the editor, or copy an API key — none of those are correct for desktop or web users. If reconnect still fails after they reply, the in-app reconnect dialog will appear and they just need to click Reconnect.`,
          metadata: { reconnected: recovered, attemptedTool: params.tool },
        }
      }
    }

    return {
      title: "Invalid Tool",
      output: `The arguments provided to the tool are invalid: ${params.error}`,
      metadata: { reconnected: false, attemptedTool: params.tool },
    }
  },
})
