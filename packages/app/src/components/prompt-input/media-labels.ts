/**
 * Human handles for composer attachments: `@image1`, `@image2`, `@video1`,
 * `@audio1`.
 *
 * The filename is the wrong label in every place it was being used. Kolbo
 * generations come back as things like
 * `kolbo-api-creative-director-generated-Close-up-shot-of-an-astro-6a0ffe33-nano-banana-2-4.jpeg`
 * — it doesn't fit in a pill, it truncates to nothing on the thumbnail, and it
 * tells the model less than the position does.
 *
 * The numbering is positional and per-kind, and every caller derives it from the
 * SAME attachment order that `build-request-parts` sends, so `@image2` in the
 * prompt text and the second image the model receives are the same file.
 */

export type MediaKind = "image" | "video" | "audio" | "pdf" | "html" | "sheet" | "doc" | "slides" | "file"

export function mediaKind(mime: string, filename?: string): MediaKind {
  if (mime.startsWith("image/") && mime !== "image/svg+xml") return "image"
  if (mime.startsWith("video/")) return "video"
  if (mime.startsWith("audio/")) return "audio"
  if (mime === "application/pdf") return "pdf"
  const name = (filename ?? "").toLowerCase()
  if (name.endsWith(".html") || name.endsWith(".htm") || name.endsWith(".xhtml") || mime === "text/html") return "html"
  if (/\.(xlsx|xls|csv|tsv|numbers)$/.test(name) || mime.includes("spreadsheet")) return "sheet"
  if (/\.(docx|doc|rtf|pages)$/.test(name) || mime.includes("wordprocessing")) return "doc"
  if (/\.(pptx|ppt|key)$/.test(name) || mime.includes("presentation")) return "slides"
  return "file"
}

/** One label per attachment, in order. */
export function mediaLabels(attachments: readonly { mime: string; filename?: string }[]): string[] {
  const seen = new Map<MediaKind, number>()
  return attachments.map((attachment) => {
    const kind = mediaKind(attachment.mime, attachment.filename)
    const n = (seen.get(kind) ?? 0) + 1
    seen.set(kind, n)
    return `${kind}${n}`
  })
}
