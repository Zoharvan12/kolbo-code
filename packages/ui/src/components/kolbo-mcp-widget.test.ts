import { describe, expect, test } from "bun:test"
import { createStore } from "solid-js/store"
import { catalogTypes, matchModel, referenceUrls, serializeForWidget } from "./kolbo-mcp-widget"

describe("serializeForWidget", () => {
  test("resolves a live store Proxy to a plain, deep-equal object", () => {
    // `structured()` can hand `payload()` a store value straight off the
    // session store, still wrapped in a Solid Proxy — e.g. `build()` returning
    // `metadata.structuredContent` directly. Chromium's structured-clone
    // algorithm (what WebView2's postMessage uses) refuses a Proxy outright
    // with "DataCloneError: ... could not be cloned" — that is the bug this
    // guards. Bun's own structuredClone does not reproduce that throw on this
    // shape (engines differ on Proxy handling), so this test asserts the
    // portable, actually-meaningful contract instead: the Proxy is gone and
    // the data survives intact — not the browser-specific throw.
    const [store] = createStore({ widget: "generation", settings: { visual_dna_ids: ["vdna_1"] } })
    const safe = serializeForWidget(store)
    expect(safe).toEqual({ widget: "generation", settings: { visual_dna_ids: ["vdna_1"] } })
    expect(safe).not.toBe(store)
    expect(Object.getPrototypeOf(safe)).toBe(Object.prototype)
  })

  test("passes plain data through unchanged", () => {
    expect(serializeForWidget({ a: 1, b: [1, 2, 3] })).toEqual({ a: 1, b: [1, 2, 3] })
  })

  test("degrades to undefined instead of throwing on a non-serializable value", () => {
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    expect(serializeForWidget(cyclic)).toBeUndefined()
  })
})

describe("in-progress generation card", () => {
  // On this host the MCP tool BLOCKS for the whole generation, so nothing the
  // server resolves (model name, avatar, reference thumbnails) exists yet — the
  // in-progress card is built here, from the tool input, and these two gaps are
  // why it showed a raw identifier and no source images while the finished card
  // showed both.
  test("maps a tool name to its model-catalog type", () => {
    // `route` legitimately falls back to the tool name upstream, and a tool name
    // is not a catalog type — byType() matched nothing on every generation tool.
    expect(catalogTypes("generate_image_edit", "generate_image_edit")).toEqual(["image_editing"])
    expect(catalogTypes("", "mcp__kolbo__generate_video_from_image")).toEqual(["img_to_video"])
    // A real route on a tool we don't map still gets used.
    expect(catalogTypes("text_to_img", "some_future_tool")).toEqual(["text_to_img"])
    expect(catalogTypes("", "some_future_tool")).toEqual([])
  })

  test("resolves the model the agent named to the catalog's own identifier", () => {
    const editors = [
      { id: "nano-banana-2-image-editing", name: "Nano Banana 2" },
      { id: "gpt-image-2/edit", name: "GPT Image 2" },
    ]
    // What the agent passes ("gpt-image-2") is not what the catalog keys the
    // EDITOR under ("gpt-image-2/edit"), so an exact match missed and the chip
    // fell back to printing the raw id.
    expect(matchModel(editors, "gpt-image-2")?.name).toBe("GPT Image 2")
    expect(matchModel(editors, "nano banana 2")?.id).toBe("nano-banana-2-image-editing")
    expect(matchModel(editors, "")).toBeUndefined()
    expect(matchModel(editors, "veo-3")).toBeUndefined()
  })

  test("collects every reference the generation was given, skipping unreachable paths", () => {
    expect(
      referenceUrls({
        source_images: ["https://cdn.kolbo.ai/a.png", "https://cdn.kolbo.ai/b.png"],
        image_url: "https://cdn.kolbo.ai/a.png", // deduped against source_images
        audio: "C:/Users/z/voice.mp3", // local path — the iframe cannot load it
        prompt: "not a reference",
        num_images: 4,
      }),
    ).toEqual(["https://cdn.kolbo.ai/a.png", "https://cdn.kolbo.ai/b.png"])
    expect(referenceUrls(undefined)).toEqual([])
  })
})
