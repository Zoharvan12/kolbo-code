import { describe, expect, test } from "bun:test"
import { extractKolboUrls, startMediaDrag } from "./kolbo-media"

const IMG = "https://kolboai-production.ams3.digitaloceanspaces.com/kolboai-media/generated-images/a/b/one.png"
const IMG2 = "https://kolboai-production.ams3.digitaloceanspaces.com/kolboai-media/generated-images/a/b/two.png"

describe("extractKolboUrls", () => {
  test("generate_image success shape (top-level urls)", () => {
    const out = JSON.stringify({ credits_used: 12, urls: [IMG] })
    expect(extractKolboUrls(out)).toEqual([IMG])
  })

  test("get_generation_status recovery shape (nested result.urls)", () => {
    // A timed-out generation is recovered here — the URLs live under result.urls,
    // not at the top level. Regression guard for the canvas media fix.
    const out = JSON.stringify({
      success: true,
      generation_id: "abc",
      type: "image",
      state: "completed",
      result: { urls: [IMG], prompt_used: "a mascot" },
    })
    expect(extractKolboUrls(out)).toEqual([IMG])
  })

  test("batch get_generation_status (array of per-item results)", () => {
    const out = JSON.stringify({
      generations: [{ result: { urls: [IMG] } }, { result: { urls: [IMG2] } }],
    })
    expect(extractKolboUrls(out)).toEqual([IMG, IMG2])
  })

  test("timeout message carries no urls", () => {
    const out =
      "Generation timed out after 60s of polling. The generation is STILL RUNNING on the server — " +
      'call get_generation_status with generation_id="abc".'
    expect(extractKolboUrls(out)).toEqual([])
  })

  test("creative_director scenes shape (nested image_urls)", () => {
    const out = JSON.stringify({ scenes: [{ image_urls: [IMG] }, { image_urls: [IMG2] }] })
    expect(extractKolboUrls(out)).toEqual([IMG, IMG2])
  })

  test("does not fold echoed input url when real urls present", () => {
    // `urls` wins over `image_url` (an echoed input), preserving preference order.
    const out = JSON.stringify({ urls: [IMG], image_url: IMG2 })
    expect(extractKolboUrls(out)).toEqual([IMG])
  })

  test("collapses the same asset served from CDN and origin", () => {
    const cdn = "https://media.kolbo.ai/kolboai-media/generated-videos/a/b/shot.mp4"
    const origin = "https://kolboai-production.ams3.digitaloceanspaces.com/kolboai-media/generated-videos/a/b/shot.mp4"
    const out = JSON.stringify({ urls: [cdn, origin] })
    expect(extractKolboUrls(out)).toEqual([cdn])
  })

  test("collapses the same asset with different signed query params", () => {
    const a = `${IMG}?X-Amz-Signature=one`
    const b = `${IMG}?X-Amz-Signature=two`
    const out = JSON.stringify({ urls: [a, b] })
    expect(extractKolboUrls(out)).toEqual([a])
  })

  test("keeps distinct assets that share a host", () => {
    const out = JSON.stringify({ urls: [IMG, IMG2] })
    expect(extractKolboUrls(out)).toEqual([IMG, IMG2])
  })

  test("regex fallback skips model icons and branding assets", () => {
    // Non-JSON output falls through to the blind URL sweep. A Kolbo logo or a
    // model avatar riding along in the text is UI furniture, not an output —
    // it used to render as a generated image next to the real one.
    const out =
      `Here is your sheet: ${IMG}\n` +
      "model icon https://kolbo-general-media.fra1.cdn.digitaloceanspaces.com/models_icons/kolbo-ai.png\n" +
      "logo https://api.kolbo.ai/assets/kolbo-ai.png"
    expect(extractKolboUrls(out)).toEqual([IMG])
  })

  test("reads urls from a kolbo.operation/1 envelope", () => {
    const out = JSON.stringify({
      schema: "kolbo.operation/1",
      outputs: [{ url: IMG, kind: "image" }, { url: IMG2, kind: "image" }],
    })
    expect(extractKolboUrls(out)).toEqual([IMG, IMG2])
  })
})

describe("startMediaDrag", () => {
  test("writes uri-list and plain text so the prompt can attach by reference", () => {
    const url = "https://media.kolbo.ai/kolboai-media/generated-videos/a/b/shot.mp4"
    const data: Record<string, string> = {}
    const transfer = {
      setData: (type: string, value: string) => {
        data[type] = value
      },
      effectAllowed: "none",
    }
    startMediaDrag(transfer as unknown as DataTransfer, url)
    expect(data["text/uri-list"]).toBe(url)
    expect(data["text/plain"]).toBe(url)
    expect(transfer.effectAllowed).toBe("copy")
  })

  test("no-ops without a transfer or url", () => {
    expect(() => startMediaDrag(null, "https://x/a.mp4")).not.toThrow()
    expect(() => startMediaDrag({} as DataTransfer, "")).not.toThrow()
  })
})
