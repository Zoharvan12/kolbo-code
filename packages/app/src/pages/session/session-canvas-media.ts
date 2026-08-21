import type { ToolPart } from "@opencode-ai/sdk/v2"
import { extractKolboUrls as extractUrls } from "@opencode-ai/ui/kolbo-media"
import { generative } from "@opencode-ai/ui/kolbo-mcp-widget"
import { read, urlsOf, type Operation } from "@opencode-ai/ui/kolbo-operation"

export function partOp(part: ToolPart): Operation | undefined {
  const state = part.state as { output?: string; metadata?: Record<string, unknown> }
  return read(state.output, state.metadata)
}

export function urlsFromPart(part: ToolPart): string[] {
  const state = part.state as { output?: string; metadata?: Record<string, unknown> }
  const fromOp = urlsOf(read(state.output, state.metadata))
  if (fromOp.length) return fromOp
  return extractUrls(state.output)
}

/** URLs on the part, or ones recovered after generate_* timed out. */
export function urlsForCanvas(part: ToolPart, recovered?: Record<string, string[]>) {
  const op = partOp(part)
  const extra = op?.id ? recovered?.[op.id] : undefined
  if (extra?.length) return extra
  return urlsFromPart(part)
}

/** Still waiting on the server — including a timed-out tool with a generation id. */
export function stillPending(part: ToolPart, recovered?: Record<string, string[]>) {
  if (urlsForCanvas(part, recovered).length) return false
  if (part.state.status === "error") return false
  if (part.state.status === "completed") return !!partOp(part)?.id
  return true
}

function recovery(tool: string) {
  const name = tool.replace(/^kolbo_/, "").replace(/^mcp__kolbo__/, "")
  return name === "get_generation_status" || name === "get_creative_director_status"
}

export function isGenerationPart(part: ToolPart): boolean {
  // Canvas Session is "made this turn", not "mentioned a URL". list_media /
  // get_media / Visual DNA listings carry thumbnail URLs and used to land
  // here as if the agent had just generated them.
  if (!generative(part.tool) && !recovery(part.tool)) return false
  const status = part.state.status
  if (status !== "completed" && status !== "error") return true
  if (status === "error") return false
  return !!partOp(part) || urlsFromPart(part).length > 0
}
