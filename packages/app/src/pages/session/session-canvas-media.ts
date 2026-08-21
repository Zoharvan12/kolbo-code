import type { ToolPart } from "@opencode-ai/sdk/v2"
import { extractKolboUrls as extractUrls, mediaKey } from "@opencode-ai/ui/kolbo-media"
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
export function stillPending(
  part: ToolPart,
  recovered?: Record<string, string[]>,
  dead?: Record<string, true>,
) {
  if (urlsForCanvas(part, recovered).length) return false
  if (part.state.status === "error") return false
  const op = partOp(part)
  if (op?.phase === "failed") return false
  if (op?.id && dead?.[op.id]) return false
  if (part.state.status === "completed") return !!op?.id
  return true
}

/** Cap for spinner cells. Past this the job is treated as abandoned. */
export const PENDING_STUCK_MS = 10 * 60 * 1000

export function pendingStartedAt(part: ToolPart): number | undefined {
  const time = (part.state as { time?: { start?: number; end?: number } }).time
  if (typeof time?.start === "number") return time.start
  if (typeof time?.end === "number") return time.end
  return undefined
}

/**
 * Drop a pending canvas/library spinner when the tool is abandoned.
 * Completed generate_* without URLs stay visible while status recovery runs,
 * but never past PENDING_STUCK_MS — and never forever when timestamps are missing.
 */
export function pendingStuck(
  part: ToolPart,
  opts: {
    messageDone: boolean
    now?: number
    recovered?: Record<string, string[]>
    startedAt?: number
    dead?: Record<string, true>
  },
): boolean {
  if (!stillPending(part, opts.recovered, opts.dead)) return true
  const now = opts.now ?? Date.now()
  const status = part.state.status
  if (status !== "completed" && opts.messageDone) return true
  const start = opts.startedAt ?? pendingStartedAt(part)
  if (start == null) return status === "completed" || opts.messageDone
  return now - start > PENDING_STUCK_MS
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

const OBJECT_ID = /^[a-f0-9]{24}$/i

function takeSessionId(value: unknown, out: Set<string>) {
  if (typeof value !== "string" || !OBJECT_ID.test(value)) return
  out.add(value)
}

function walkSessions(value: unknown, out: Set<string>, depth = 0) {
  if (depth > 8 || value == null) return
  if (typeof value === "string") {
    const text = value.trim()
    if (text.startsWith("{") || text.startsWith("[")) {
      try {
        walkSessions(JSON.parse(text), out, depth + 1)
      } catch {
        /* ignore */
      }
    }
    return
  }
  if (Array.isArray(value)) {
    for (const item of value) walkSessions(item, out, depth + 1)
    return
  }
  if (typeof value !== "object") return
  const obj = value as Record<string, unknown>
  takeSessionId(obj.session_id, out)
  takeSessionId(obj.sessionId, out)
  for (const child of Object.values(obj)) walkSessions(child, out, depth + 1)
}

/** Kolbo platform session ids + media URL keys produced in this Code chat. */
export function sessionScope(parts: Iterable<ToolPart | { type: string }>) {
  const sessions = new Set<string>()
  const keys = new Set<string>()
  for (const part of parts) {
    if (part.type !== "tool") continue
    const tool = part as ToolPart
    const state = tool.state as { output?: string; metadata?: Record<string, unknown> }
    walkSessions(state.output, sessions)
    walkSessions(state.metadata, sessions)
    for (const url of urlsFromPart(tool)) {
      const key = mediaKey(url)
      if (key) keys.add(key)
    }
  }
  return { sessions, keys }
}
