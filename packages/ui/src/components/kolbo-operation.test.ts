import { describe, expect, test } from "bun:test"
import { advertised, card, costOf, parse, player, read, SCHEMA } from "./kolbo-operation"

const SMELL = "https://cdn.example/never-seen.mp3"

describe("kolbo.operation/1 host contract", () => {
  test("a never-seen tool still renders review knobs, a player, and actions", () => {
    const env = parse({
      schema: SCHEMA,
      id: "smell-1",
      kind: "audio",
      route: "text_to_smell",
      phase: "completed",
      title: "Smell",
      model: { id: "nose-1", name: "Nose" },
      prompt: "wet pavement after rain",
      params: [
        { id: "intensity", type: "number", value: 7 },
        { id: "note", type: "enum", options: ["ozone", "rain"], value: "rain" },
      ],
      outputs: [{ url: SMELL, kind: "audio", mime: "audio/mpeg" }],
      actions: [
        { id: "remix", label: "Remix", tool: "remix_smell", args: { id: "smell-1" } },
        { id: "extend", label: "Extend", tool: "extend_smell", args: { id: "smell-1" } },
      ],
    })
    expect(env).toBeDefined()
    const view = card(env!)
    expect(view.params.map((item) => item.id)).toEqual(["intensity", "note"])
    expect(view.params[1]?.options).toEqual(["ozone", "rain"])
    expect(view.player).toBe("audio")
    expect(player(env!)).toBe("audio")
    expect(view.outputs[0]?.url).toBe(SMELL)
    expect(view.actions.map((item) => item.label)).toEqual(["Remix", "Extend"])
    expect(view.title).toBe("Smell")
    expect(view.model.name).toBe("Nose")
  })

  test("review phase walks params without knowing the tool", () => {
    const env = read(undefined, {
      schema: SCHEMA,
      id: "",
      kind: "audio",
      route: "text_to_smell",
      phase: "review",
      title: "Smell",
      model: { id: "nose-1" },
      estimate: 4,
      preview: "https://cdn.example/preview.png",
      params: [
        { id: "intensity", type: "number", value: 3, required: true },
        { id: "note", type: "enum", options: ["ozone", "rain"] },
      ],
      outputs: [],
      actions: [],
    })
    expect(env?.phase).toBe("review")
    expect(env?.estimate).toBe(4)
    expect(env?.preview).toBe("https://cdn.example/preview.png")
    expect(env?.params).toHaveLength(2)
    expect(advertised(env)).toBe(true)
  })

  test("published MCP text result still renders a card", () => {
    const env = read(
      JSON.stringify({
        urls: ["https://cdn.example/cat-1.png", "https://cdn.example/cat-2.png", "https://cdn.example/cat-3.png"],
        credits_used: 3,
        model: "z-image/turbo",
        prompt_used: "orange tabby on a sunny windowsill",
      }),
    )
    expect(env).toBeDefined()
    expect(env?.phase).toBe("completed")
    expect(env?.model.id).toBe("z-image/turbo")
    expect(env?.cost).toBe(3)
    expect(env?.outputs).toHaveLength(3)
    expect(player(env!)).toBe("image")
    expect(advertised(env)).toBe(true)
  })

  test("list widget structuredContent is not a generation operation", () => {
    expect(
      read(undefined, {
        structuredContent: {
          widget: "list",
          title: "Sessions",
          items: [{ id: "s1", title: "Hero", subtitle: "elements" }],
          total: 1,
        },
      }),
    ).toBeUndefined()
  })

  test("widget structuredContent in metadata still renders", () => {
    const env = read(undefined, {
      structuredContent: {
        widget: "generation",
        phase: "completed",
        kind: "image",
        generation_id: "gen_1",
        urls: ["https://cdn.example/out.png"],
        model: "z-image/turbo",
        credits_used: 1,
      },
    })
    expect(env?.id).toBe("gen_1")
    expect(env?.outputs[0]?.url).toBe("https://cdn.example/out.png")
  })

  test("plain json with a url but no generation markers is ignored", () => {
    expect(read(JSON.stringify({ url: "https://example.com", name: "readme" }))).toBeUndefined()
  })

  test("invalid JSON that starts with { does not throw", () => {
    const junk = '{ "aspect": 21:9, "ver": 1.2.3, "n": 148236 }'
    expect(read(junk)).toBeUndefined()
    expect(parse(junk)).toBeUndefined()
    expect(advertised(junk)).toBe(false)
    expect(read(undefined, { operation: junk })).toBeUndefined()
    expect(costOf(undefined, junk)).toBeUndefined()
  })

  test("read prefers output envelope over metadata", () => {
    const env = read(
      JSON.stringify({
        schema: SCHEMA,
        id: "done",
        kind: "video",
        route: "custom",
        phase: "completed",
        title: "Done",
        model: { id: "m" },
        params: [],
        outputs: [{ url: "https://cdn.example/a.mp4", kind: "video" }],
        actions: [],
      }),
      { schema: SCHEMA, id: "meta", kind: "image", route: "x", phase: "running", title: "Meta", model: { id: "" }, params: [], outputs: [], actions: [] },
    )
    expect(env?.id).toBe("done")
    expect(env?.kind).toBe("video")
  })

  test("renderer source never special-cases a tool name", async () => {
    const src = await Bun.file(new URL("./kolbo-operation.ts", import.meta.url)).text()
    expect(src.includes("generate_")).toBe(false)
    expect(src.toLowerCase().includes("smell")).toBe(false)
    expect(src.includes("offerableKnobs")).toBe(false)
    expect(src.includes("generationTypeForTool")).toBe(false)
    expect(src.includes("KOLBO_GENERATION_TOOL_NAMES")).toBe(false)
  })

  test("Code consumers no longer keep per-tool generation maps", async () => {
    const files = [
      new URL("./message-part.tsx", import.meta.url),
      new URL("../../../app/src/pages/session/composer/session-permission-dock.tsx", import.meta.url),
      new URL("../../../app/src/pages/session/session-canvas.tsx", import.meta.url),
    ]
    for (const file of files) {
      const src = await Bun.file(file).text()
      expect(src.includes("offerableKnobs")).toBe(false)
      expect(src.includes("generationTypeForTool")).toBe(false)
      expect(src.includes("KOLBO_GENERATION_TOOL_NAMES")).toBe(false)
      expect(src.includes("KOLBO_IMAGE_TOOLS")).toBe(false)
      expect(src.includes("KOLBO_VIDEO_TOOLS")).toBe(false)
      expect(src.includes("KOLBO_AUDIO_TOOLS")).toBe(false)
    }
  })
})
