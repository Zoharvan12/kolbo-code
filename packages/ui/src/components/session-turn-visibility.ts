import type { AssistantMessage, Part, TextPart } from "@opencode-ai/sdk/v2/client"

/** Compaction / synthetic-continue user turns — keep in history, hide from chat. */
export function internalUser(parts: readonly Part[]): boolean {
  if (parts.length === 0) return false
  return !parts.some((part) => {
    if (part.type === "compaction") return false
    if (part.type === "text") {
      const text = part as TextPart
      return !text.synthetic && !!text.text?.trim()
    }
    return true
  })
}

/** Compaction summary assistants — model context only, not chat UI. */
export function hiddenAssistant(msg: AssistantMessage): boolean {
  return msg.summary === true || msg.agent === "compaction" || msg.mode === "compaction"
}
