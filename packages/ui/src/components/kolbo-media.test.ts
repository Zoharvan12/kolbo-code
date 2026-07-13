import { describe, expect, test } from "bun:test"
import { extractKolboUrls } from "./kolbo-media"

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
})
