import { describe, expect, test } from "bun:test"
import type { ToolPart } from "@opencode-ai/sdk/v2"
import { isGenerationPart, urlsFromPart } from "./session-canvas-media"

function tool(state: ToolPart["state"]): ToolPart {
  return {
    id: "prt_1",
    sessionID: "ses_1",
    messageID: "msg_1",
    type: "tool",
    tool: "kolbo_generate_image",
    state,
  } as ToolPart
}

describe("session canvas media", () => {
  test("published MCP text with urls still counts as a generation", () => {
    const part = tool({
      status: "completed",
      input: { prompt: "orange tabby" },
      output: JSON.stringify({
        urls: ["https://cdn.example/cat-1.png", "https://cdn.example/cat-2.png"],
        model: "z-image/turbo",
        credits_used: 2,
      }),
      metadata: {},
      title: "",
      time: { start: 1, end: 2 },
    })
    expect(isGenerationPart(part)).toBe(true)
    expect(urlsFromPart(part)).toEqual(["https://cdn.example/cat-1.png", "https://cdn.example/cat-2.png"])
  })

  test("urls in output still land when metadata is a running envelope with no outputs", () => {
    const part = tool({
      status: "completed",
      input: { prompt: "orange tabby" },
      output: JSON.stringify({
        urls: ["https://cdn.example/cat-1.png"],
      }),
      metadata: {
        schema: "kolbo.operation/1",
        id: "",
        kind: "image",
        route: "generate_image",
        phase: "running",
        title: "Generate image",
        model: { id: "z-image/turbo" },
        params: [],
        outputs: [],
        actions: [],
      },
      title: "",
      time: { start: 1, end: 2 },
    })
    expect(isGenerationPart(part)).toBe(true)
    expect(urlsFromPart(part)).toEqual(["https://cdn.example/cat-1.png"])
  })

  test("plain tool output without media is ignored", () => {
    const part = tool({
      status: "completed",
      input: {},
      output: JSON.stringify({ ok: true, name: "readme" }),
      metadata: {},
      title: "",
      time: { start: 1, end: 2 },
    })
    expect(isGenerationPart(part)).toBe(false)
    expect(urlsFromPart(part)).toEqual([])
  })
})
