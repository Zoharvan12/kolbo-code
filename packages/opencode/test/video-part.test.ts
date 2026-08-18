import { describe, expect, test } from "bun:test"
import { ProviderTransform } from "../src/provider/transform"

/**
 * Attaching a video crashed the turn outright: @ai-sdk/openai-compatible's
 * message converter serializes only image/*, application/pdf and text/*, and
 * hard-throws `file part media type video/mp4` on anything else. kolbo-api has
 * accepted video all along, so ProviderTransform parks the public URL in a
 * sentinel text part (past the converter) and restoreVideoParts swaps it back
 * into a real `video_url` part on the serialized body.
 *
 * These cover the swap-back half, which is the parser and the part that can
 * silently corrupt a request if it gets the offsets wrong.
 */

const sentinel = (url: string, filename?: string) =>
  `<<<KOLBO_VIDEO:${Buffer.from(JSON.stringify({ url, filename }), "utf8").toString("base64")}>>>`

const bodyWith = (...content: unknown[]) => JSON.stringify({ messages: [{ role: "user", content }] })

const partsOf = (raw: string) => JSON.parse(raw).messages[0].content

describe("ProviderTransform.restoreVideoParts", () => {
  test("swaps a lone sentinel for the video_url shape kolbo-api recognizes", () => {
    const url = "https://media.kolbo.ai/a.mp4"
    const parts = partsOf(ProviderTransform.restoreVideoParts(bodyWith({ type: "text", text: sentinel(url) })))
    expect(parts).toEqual([{ type: "video_url", video_url: { url } }])
  })

  test("keeps surrounding prose and ordering when the converter merged text", () => {
    const url = "https://media.kolbo.ai/b.mp4"
    const parts = partsOf(
      ProviderTransform.restoreVideoParts(bodyWith({ type: "text", text: `look at ${sentinel(url)} and tell me` })),
    )
    expect(parts).toEqual([
      { type: "text", text: "look at " },
      { type: "video_url", video_url: { url } },
      { type: "text", text: " and tell me" },
    ])
  })

  test("restores every video in a multi-attachment message", () => {
    const a = "https://media.kolbo.ai/1.mp4"
    const b = "https://media.kolbo.ai/2.mp4"
    const parts = partsOf(
      ProviderTransform.restoreVideoParts(bodyWith({ type: "text", text: `${sentinel(a)}${sentinel(b)}` })),
    )
    expect(parts).toEqual([
      { type: "video_url", video_url: { url: a } },
      { type: "video_url", video_url: { url: b } },
    ])
  })

  test("leaves image parts and ordinary text untouched", () => {
    const image = { type: "image_url", image_url: { url: "https://media.kolbo.ai/x.png" } }
    const url = "https://media.kolbo.ai/c.mp4"
    const parts = partsOf(
      ProviderTransform.restoreVideoParts(bodyWith(image, { type: "text", text: sentinel(url) }, { type: "text", text: "hi" })),
    )
    expect(parts).toEqual([image, { type: "video_url", video_url: { url } }, { type: "text", text: "hi" }])
  })

  test("a body with no sentinel is returned byte-identical", () => {
    const raw = bodyWith({ type: "text", text: "no video here" })
    expect(ProviderTransform.restoreVideoParts(raw)).toBe(raw)
  })

  test("undecodable sentinel degrades to visible text, never a thrown request", () => {
    const raw = bodyWith({ type: "text", text: "<<<KOLBO_VIDEO:!!!not-base64!!!>>>" })
    expect(ProviderTransform.restoreVideoParts(raw)).toBe(raw)
  })

  test("malformed JSON body is passed through rather than crashing the turn", () => {
    expect(ProviderTransform.restoreVideoParts("<<<KOLBO_VIDEO: not json at all")).toBe(
      "<<<KOLBO_VIDEO: not json at all",
    )
  })
})
