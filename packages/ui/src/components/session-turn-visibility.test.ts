import { describe, expect, test } from "bun:test"
import { hiddenAssistant, internalUser } from "./session-turn-visibility"
import type { AssistantMessage, Part } from "@opencode-ai/sdk/v2/client"

const base = { id: "p1", sessionID: "s1", messageID: "m1" }

describe("internalUser", () => {
  test("compaction-only is internal", () => {
    const parts = [{ ...base, type: "compaction", auto: true }] as Part[]
    expect(internalUser(parts)).toBe(true)
  })

  test("synthetic continue text is internal", () => {
    const parts = [{ ...base, type: "text", text: "Continue if you have next steps", synthetic: true }] as Part[]
    expect(internalUser(parts)).toBe(true)
  })

  test("real user text is visible", () => {
    const parts = [{ ...base, type: "text", text: "fix the floors" }] as Part[]
    expect(internalUser(parts)).toBe(false)
  })

  test("mixed compaction + real text is visible", () => {
    const parts = [
      { ...base, type: "compaction", auto: true },
      { ...base, id: "p2", type: "text", text: "keep going" },
    ] as Part[]
    expect(internalUser(parts)).toBe(false)
  })

  test("empty parts are not internal", () => {
    expect(internalUser([])).toBe(false)
  })
})

describe("hiddenAssistant", () => {
  test("summary compaction assistant is hidden", () => {
    const msg = {
      role: "assistant",
      summary: true,
      agent: "compaction",
      mode: "compaction",
    } as AssistantMessage
    expect(hiddenAssistant(msg)).toBe(true)
  })

  test("normal assistant is visible", () => {
    const msg = {
      role: "assistant",
      agent: "build",
      mode: "build",
    } as AssistantMessage
    expect(hiddenAssistant(msg)).toBe(false)
  })
})
