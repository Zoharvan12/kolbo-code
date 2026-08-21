import { describe, expect, test } from "bun:test"
import { hydratePromptUrls, rememberAttachmentUrl, resetAttachmentUrls } from "./attachment-urls"
import { attachmentMime, hosted, mimeFromUrl, ready, texted } from "./files"
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

  test("accepts unknown binary as octet-stream", async () => {
    const file = new File([Uint8Array.of(0, 255, 1, 2)], "blob.bin", { type: "application/octet-stream" })
    expect(await attachmentMime(file)).toBe("application/octet-stream")
  })

  test("accepts excel, html, and markdown", async () => {
    const xlsx = new File([Uint8Array.of(0x50, 0x4b, 3, 4)], "cast.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    })
    expect(await attachmentMime(xlsx)).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    const html = new File(["<html><body>hi</body></html>"], "page.html", { type: "text/html" })
    expect(await attachmentMime(html)).toBe("text/plain")
    const md = new File(["# note\n"], "brief.md", { type: "text/markdown" })
    expect(await attachmentMime(md)).toBe("text/plain")
    expect(mimeFromUrl("cast.xlsx")).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    expect(mimeFromUrl("page.html")).toBe("text/plain")
  })

  test("accepts video files by mime and by extension", async () => {
    const file = new File(["fake"], "clip.mp4", { type: "video/mp4" })
    expect(await attachmentMime(file)).toBe("video/mp4")
    expect(mimeFromUrl("https://media.kolbo.ai/generated-videos/shot.mp4")).toBe("video/mp4")
    expect(mimeFromUrl("https://cdn.example/clip.webm?sig=1")).toBe("video/webm")
    expect(mimeFromUrl("weird.xyz")).toBe("application/octet-stream")
  })
})

describe("attachment ready / hosted", () => {
  test("treats html as text and excel as a local-path file", () => {
    expect(texted("text/plain")).toBe(true)
    expect(texted("text/html")).toBe(true)
    expect(hosted("text/html")).toBe(false)
    expect(hosted("application/pdf")).toBe(true)
    expect(hosted("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")).toBe(false)
    expect(ready({ mime: "text/plain" })).toBe(true)
    expect(ready({ mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", localPath: "C:\\cast.xlsx" })).toBe(true)
    expect(ready({ mime: "image/png", uploading: true })).toBe(false)
    expect(ready({ mime: "image/png", publicUrl: "https://media.kolbo.ai/a.png" })).toBe(true)
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
