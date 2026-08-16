import { describe, expect, test } from "bun:test"
import { hydratePromptUrls, rememberAttachmentUrl, resetAttachmentUrls } from "./attachment-urls"
import { attachmentMime, mimeFromUrl } from "./files"
import { pasteMode } from "./paste"

describe("attachmentMime", () => {
  test("keeps PDFs when the browser reports the mime", async () => {
    const file = new File(["%PDF-1.7"], "guide.pdf", { type: "application/pdf" })
    expect(await attachmentMime(file)).toBe("application/pdf")
  })

  test("normalizes structured text types to text/plain", async () => {
    const file = new File(['{"ok":true}\n'], "data.json", { type: "application/json" })
    expect(await attachmentMime(file)).toBe("text/plain")
  })

  test("accepts text files even with a misleading browser mime", async () => {
    const file = new File(["export const x = 1\n"], "main.ts", { type: "video/mp2t" })
    expect(await attachmentMime(file)).toBe("text/plain")
  })

  test("rejects binary files", async () => {
    const file = new File([Uint8Array.of(0, 255, 1, 2)], "blob.bin", { type: "application/octet-stream" })
    expect(await attachmentMime(file)).toBeUndefined()
  })

  test("accepts video files by mime and by extension", async () => {
    const file = new File(["fake"], "clip.mp4", { type: "video/mp4" })
    expect(await attachmentMime(file)).toBe("video/mp4")
    expect(mimeFromUrl("https://media.kolbo.ai/generated-videos/shot.mp4")).toBe("video/mp4")
    expect(mimeFromUrl("https://cdn.example/clip.webm?sig=1")).toBe("video/webm")
  })
})

describe("hydratePromptUrls", () => {
  test("fills a queued snapshot from a later CDN upload", () => {
    resetAttachmentUrls()
    rememberAttachmentUrl("att_1", "https://media.kolbo.ai/clip.mp4")
    const next = hydratePromptUrls([
      { type: "image", id: "att_1", filename: "clip.mp4", mime: "video/mp4" },
      { type: "text", content: "what you see here?" },
    ])
    expect(next[0]).toMatchObject({ publicUrl: "https://media.kolbo.ai/clip.mp4", uploading: false })
    expect(next[1]).toEqual({ type: "text", content: "what you see here?" })
  })

  test("leaves an already-public URL untouched", () => {
    resetAttachmentUrls()
    rememberAttachmentUrl("att_1", "https://media.kolbo.ai/new.mp4")
    const next = hydratePromptUrls([
      { type: "image", id: "att_1", publicUrl: "https://media.kolbo.ai/old.mp4" },
    ])
    expect(next[0].publicUrl).toBe("https://media.kolbo.ai/old.mp4")
  })
})

describe("pasteMode", () => {
  test("uses native paste for short single-line text", () => {
    expect(pasteMode("hello world")).toBe("native")
  })

  test("uses manual paste for multiline text", () => {
    expect(
      pasteMode(`{
  "ok": true
}`),
    ).toBe("manual")
    expect(pasteMode("a\r\nb")).toBe("manual")
  })

  test("uses manual paste for large text", () => {
    expect(pasteMode("x".repeat(8000))).toBe("manual")
  })
})
