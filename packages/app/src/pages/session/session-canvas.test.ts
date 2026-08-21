import { describe, expect, test } from "bun:test"
import type { ToolPart } from "@opencode-ai/sdk/v2"
import { isGenerationPart, stillPending, urlsForCanvas, urlsFromPart } from "./session-canvas-media"

function tool(state: ToolPart["state"]): ToolPart {
  return {
    id: "prt_1",
    sessionID: "ses_1",
    messageID: "msg_1",
    type: "tool",
    callID: "call_1",
    tool: "kolbo_generate_image",
    state,
  }
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

  test("fetched library media is not a canvas generation", () => {
    const listed = {
      id: "prt_media",
      sessionID: "ses_1",
      messageID: "msg_1",
      type: "tool",
      callID: "call_media",
      tool: "kolbo_list_media",
      state: {
        status: "completed",
        input: {},
        output: JSON.stringify({
          media: [
            {
              id: "old1",
              url: "https://media.kolbo.ai/kolboai-media/visual-dna/images/x/environment-sheet.jpg",
              thumbnail_url: "https://media.kolbo.ai/kolboai-media/thumbs/x.jpg",
            },
          ],
        }),
        metadata: {},
        title: "",
        time: { start: 1, end: 2 },
      },
    } as ToolPart
    expect(isGenerationPart(listed)).toBe(false)

    const fetched = {
      ...listed,
      tool: "mcp__kolbo__get_media",
      state: {
        ...listed.state,
        output: JSON.stringify({
          id: "old1",
          url: "https://media.kolbo.ai/kolboai-media/uploads/old.png",
        }),
      },
    } as ToolPart
    expect(isGenerationPart(fetched)).toBe(false)
  })

  test("status recovery of a timed-out generation still lands on canvas", () => {
    const part = {
      id: "prt_status",
      sessionID: "ses_1",
      messageID: "msg_1",
      type: "tool",
      callID: "call_status",
      tool: "get_generation_status",
      state: {
        status: "completed",
        input: { generation_id: "gen_1" },
        output: JSON.stringify({
          state: "completed",
          result: { urls: ["https://cdn.example/recovered.png"] },
        }),
        metadata: {},
        title: "",
        time: { start: 1, end: 2 },
      },
    } as ToolPart
    expect(isGenerationPart(part)).toBe(true)
    expect(urlsFromPart(part)).toEqual(["https://cdn.example/recovered.png"])
  })

  test("a running generate_* tool is a pending canvas cell before urls exist", () => {
    const part = tool({
      status: "running",
      input: { prompt: "orange tabby" },
      metadata: {},
      title: "",
      time: { start: 1 },
    })
    expect(isGenerationPart(part)).toBe(true)
    expect(stillPending(part)).toBe(true)
  })

  test("a timed-out generate_* stays pending until recovered urls arrive", () => {
    const part = tool({
      status: "completed",
      input: { prompt: "orange tabby" },
      output: JSON.stringify({
        state: "processing",
        generation_id: "gen_abc",
        _timed_out: true,
      }),
      metadata: {},
      title: "",
      time: { start: 1, end: 2 },
    })
    expect(isGenerationPart(part)).toBe(true)
    expect(urlsFromPart(part)).toEqual([])
    expect(stillPending(part)).toBe(true)
    expect(urlsForCanvas(part, { gen_abc: ["https://cdn.example/done.mp4"] })).toEqual([
      "https://cdn.example/done.mp4",
    ])
    expect(stillPending(part, { gen_abc: ["https://cdn.example/done.mp4"] })).toBe(false)
  })
})
