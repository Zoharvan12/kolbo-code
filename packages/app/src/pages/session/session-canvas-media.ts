import type { ToolPart } from "@opencode-ai/sdk/v2"
import { extractKolboUrls as extractUrls } from "@opencode-ai/ui/kolbo-media"
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

export function isGenerationPart(part: ToolPart): boolean {
  if (partOp(part)) return true
  return urlsFromPart(part).length > 0
}
