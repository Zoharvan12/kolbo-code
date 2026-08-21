import { describe, expect, test } from "bun:test"
import { createStore } from "solid-js/store"
import {
  applyChips,
  catalogTypes,
  chipIcon,
  chipNeed,
  gridRow,
  matchModel,
  messageText,
  clipText,
  toolCall,
  callId,
  preferKolbo,
  referenceUrls,
  resolveKind,
  serializeForWidget,
  statusTool,
  structured,
  uri,
} from "./kolbo-mcp-widget"

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

  test("rewrites bare and api.kolbo.ai avatars onto the public icon CDN", () => {
    expect(chipIcon("chatgpt-icon.svg")).toBe(
      "https://kolbo-general-media.fra1.cdn.digitaloceanspaces.com/models_icons/chatgpt-icon.svg",
    )
    expect(chipIcon("https://api.kolbo.ai/assets/chatgpt-icon.svg")).toBe(
      "https://kolbo-general-media.fra1.cdn.digitaloceanspaces.com/models_icons/chatgpt-icon.svg",
    )
    expect(chipIcon("https://kolbo-general-media.fra1.cdn.digitaloceanspaces.com/models_icons/chatgpt-icon.svg")).toBe(
      "https://kolbo-general-media.fra1.cdn.digitaloceanspaces.com/models_icons/chatgpt-icon.svg",
    )
  })

  test("fills DNA thumbs and the preset name on the in-progress card payload", () => {
    const raw = {
      widget: "generation",
      settings: { visual_dna_ids: ["dna_1"], preset_id: "bible-1" },
    }
    expect(chipNeed(raw)).toEqual({ dnas: ["dna_1"], preset: "bible-1" })
    expect(
      applyChips(raw, {
        dnas: [{ id: "dna_1", name: "Rock Lead", thumbnail: "https://media.kolbo.ai/rock.jpg" }],
        preset: { id: "bible-1", name: "Character Bible" },
      }),
    ).toMatchObject({
      visual_dnas: [{ id: "dna_1", name: "Rock Lead", thumbnail: "https://media.kolbo.ai/rock.jpg" }],
      settings: { preset_id: "bible-1", preset_name: "Character Bible" },
    })
    expect(chipNeed(applyChips(raw, { dnas: [{ id: "dna_1", name: "Rock Lead" }], preset: { id: "bible-1", name: "Bible" } }))).toBeUndefined()
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

describe("generation card kind + urls", () => {
  test("elements / video tools are not labeled image", () => {
    expect(resolveKind("image", "generate_elements")).toBe("video")
    expect(resolveKind("image", "mcp__kolbo__generate_video")).toBe("video")
    expect(resolveKind("image", "generate_image")).toBe("image")
    expect(resolveKind("image", "get_generation_status", ["https://media.kolbo.ai/kolboai-media/video-elements-results/abc/clip"])).toBe(
      "video",
    )
  })

  test("drops provider origin urls when a Kolbo copy exists", () => {
    const kolbo = "https://media.kolbo.ai/kolboai-media/video-elements-results/abc/6"
    const pika = "https://cdn.pika.art/v2/media/media_cce899c9/output.mp4"
    expect(preferKolbo([kolbo, pika])).toEqual([kolbo])
    expect(preferKolbo([pika])).toEqual([pika])
  })

  test("status polls are follow-ups, not a second generation", () => {
    expect(statusTool("get_generation_status")).toBe(true)
    expect(statusTool("generate_elements")).toBe(false)
    // Even with urls, status tools must not mount generation.html — that was
    // the Elements Video + Generations duplicate in chat.
    expect(
      uri(
        undefined,
        "get_generation_status",
        { urls: ["https://media.kolbo.ai/kolboai-media/video-elements-results/abc/clip"] },
      ),
    ).toBeUndefined()
    expect(uri(undefined, "generate_elements", { urls: ["https://media.kolbo.ai/x.mp4"] })).toBe(
      "ui://kolbo/generation.html",
    )
  })

  test("finished tool output beats a stale generating envelope", () => {
    // MCP's last progress ping stays on the part as structuredContent after
    // the call returns. The card used to keep that spinner and never show
    // the video that was already in the tool result.
    const data = structured(
      JSON.stringify({
        state: "completed",
        generation_id: "gen_1",
        urls: ["https://media.kolbo.ai/kolboai-media/video-elements-results/abc/clip"],
      }),
      {
        structuredContent: {
          widget: "generation",
          phase: "generating",
          kind: "video",
          urls: [],
          generation_id: "gen_1",
        },
      },
      { prompt: "walk" },
      "generate_video",
    )
    expect(data).toMatchObject({
      phase: "completed",
      urls: ["https://media.kolbo.ai/kolboai-media/video-elements-results/abc/clip"],
    })
  })

  test("rebuilds Open in Kolbo from the session_id on the tool text", () => {
    const data = structured(
      JSON.stringify({
        state: "completed",
        generation_id: "gen_1",
        session_id: "64cccccccccccccccccccccc",
        project_id: "proj_1",
        urls: ["https://media.kolbo.ai/kolboai-media/video-elements-results/abc/clip.mp4"],
      }),
      {
        structuredContent: {
          widget: "generation",
          phase: "generating",
          kind: "video",
          urls: [],
          generation_id: "gen_1",
        },
      },
      { prompt: "walk" },
      "generate_elements",
    )
    expect(data).toMatchObject({
      phase: "completed",
      session_id: "64cccccccccccccccccccccc",
      open_url:
        "https://app.kolbo.ai/video-tools?session=64cccccccccccccccccccccc&tool=image-to-video&mode=elements&project=proj_1",
    })
  })

  test("keeps an existing open_url on a finished envelope", () => {
    const href =
      "https://app.kolbo.ai/video-tools?session=64dddddddddddddddddddddd&tool=image-to-video&mode=elements"
    const data = structured(
      undefined,
      {
        structuredContent: {
          widget: "generation",
          phase: "completed",
          kind: "video",
          tool: "generate_elements",
          session_id: "64dddddddddddddddddddddd",
          open_url: href,
          urls: ["https://media.kolbo.ai/clip.mp4"],
        },
      },
      undefined,
      "generate_elements",
    )
    expect(data).toMatchObject({ open_url: href })
  })
})

describe("widget → host bridge", () => {
  test("reads the text out of a ui/message request", () => {
    // window.kolbo.sendMessage() posts MCP-UI's role/content envelope. The host
    // had no case for ui/message at all, so every "Use" button was inert; this
    // guards the shape the bridge actually sends.
    expect(messageText({ role: "user", content: [{ type: "text", text: "Use preset X" }] })).toBe("Use preset X")
    expect(messageText({ text: "plain" })).toBe("plain")
    expect(messageText({ role: "user", content: [] })).toBeUndefined()
    expect(messageText(undefined)).toBeUndefined()
  })

  test("reads the text out of a ui/copy-text request", () => {
    expect(clipText({ text: "full prompt" })).toBe("full prompt")
    expect(clipText({ text: "" })).toBeUndefined()
    expect(clipText(undefined)).toBeUndefined()
  })

  test("reads name and id out of a tools/call request", () => {
    // Stop used to empty-ack tools/call, so the card showed cancelled while the
    // job kept running in the Kolbo app. Guard the shape the bridge actually sends.
    expect(toolCall({ name: "cancel_generation", arguments: { generation_id: "gen_1" } })).toEqual({
      name: "cancel_generation",
      args: { generation_id: "gen_1" },
    })
    expect(callId({ generation_id: "gen_1" })).toBe("gen_1")
    expect(callId({ job_id: "job_1" })).toBe("job_1")
    expect(toolCall({ arguments: { generation_id: "gen_1" } })).toBeUndefined()
    expect(callId({})).toBeUndefined()
  })
})

describe("list_presets widget", () => {
  test("named lookup does not mount the catalog grid", () => {
    expect(uri(undefined, "list_presets", { _lookup: true, items: [{ id: "1", name: "Headless" }] })).toBeUndefined()
    expect(
      uri(undefined, "list_presets", {
        items: [
          { id: "1", name: "Headless Character Sheet" },
          { id: "2", name: "Character Bible" },
        ],
      }),
    ).toBeUndefined()
  })

  test("browse without search uses the compact list, not the media grid", () => {
    const items = Array.from({ length: 12 }, (_, i) => ({ id: String(i), name: `Preset ${i}` }))
    expect(uri(undefined, "list_presets", { items })).toBe("ui://kolbo/list.html")
  })
})

describe("text-derived list rows", () => {
  test("maps compact-list field names onto the ones the widgets render", () => {
    // Kolbo Code doesn't advertise MCP Apps, so @kolbo/mcp returns compactList
    // JSON instead of its grid payload — rows keyed `name`/`filename`, and for
    // list_presets no image at all. media-grid draws a missing thumbnail as the
    // kind icon, which is the wall of file glyphs this maps away from.
    expect(gridRow({ id: "1", name: "Storyboard", category: "layout" })).toMatchObject({
      title: "Storyboard",
      subtitle: "layout",
    })
    expect(gridRow({ id: "2", filename: "shot.png", url: "https://cdn.kolbo.ai/shot.png" })).toMatchObject({
      title: "shot.png",
      thumbnail: "https://cdn.kolbo.ai/shot.png",
    })
    // A non-image url is not a thumbnail.
    expect(gridRow({ id: "3", name: "clip", url: "https://cdn.kolbo.ai/clip.mp4" })).not.toHaveProperty("thumbnail")
    // Anything the MCP already shaped is left alone.
    expect(gridRow({ id: "4", title: "Kept", thumbnail: "https://cdn.kolbo.ai/a.png" })).toMatchObject({
      title: "Kept",
      thumbnail: "https://cdn.kolbo.ai/a.png",
    })
  })
})
