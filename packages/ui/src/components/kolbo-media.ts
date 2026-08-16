/**
 * Shared Kolbo media utilities. Consumed by markdown chip rendering
 * (`markdown.tsx`), the message-part tool chip (`message-part.tsx`), and
 * the desktop canvas (`packages/app/src/pages/session/session-canvas.tsx`).
 * Centralizing here so the output-field list, video extension regex, and
 * first-frame poster trick don't drift across surfaces.
 */

// Output fields a Kolbo MCP tool result uses for its real generated URLs.
// Order = preference: first match wins so `urls` doesn't fold in echoed
// `image_url` inputs from video tools etc.
export const KOLBO_OUTPUT_FIELDS = [
  "urls",
  "image_urls",
  "video_urls",
  "audio_urls",
  "model_urls",
  "video_url",
  "audio_url",
  "model_url",
  "downloadUrl",
] as const

// Content-identity key for a media URL: path basename, query/hash stripped.
// The same generated file can come back as CDN + origin, or with different
// signed query params. Exact-string matching would keep both and the
// completion chip would render two identical thumbs for one asset.
export function mediaKey(url: string): string {
  try {
    const base = new URL(url).pathname.split("/").filter(Boolean).pop()
    return (base || url).toLowerCase()
  } catch {
    const path = url.split("?")[0].split("#")[0]
    const base = path.split("/").filter(Boolean).pop()
    return (base || url).toLowerCase()
  }
}

function unique(urls: string[]): string[] {
  const seen = new Set<string>()
  return urls.filter((url) => {
    const key = mediaKey(url)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

// Pull generated URLs from one object using the known output fields (first
// match wins, so echoed input URLs from a later field don't fold in), with a
// final fallback to a singular `url` for per-item media records.
function urlsFromFields(obj: Record<string, unknown>): string[] {
  for (const field of KOLBO_OUTPUT_FIELDS) {
    const value = obj[field]
    if (Array.isArray(value)) {
      const urls = value.filter((v): v is string => typeof v === "string" && /^https?:\/\//.test(v))
      if (urls.length > 0) return unique(urls)
    } else if (typeof value === "string" && /^https?:\/\//.test(value)) {
      return [value]
    }
  }
  const single = obj.url
  if (typeof single === "string" && /^https?:\/\//.test(single)) return [single]
  return []
}

/**
 * Pull the real generated URLs from a Kolbo MCP tool result. Prefers
 * structured output fields (so echoed input URLs / poster URLs /
 * `_followup_hint` text don't pollute the result), falls back to a
 * regex scan of the raw text only when the output isn't JSON.
 */
export function extractKolboUrls(output: string | undefined): string[] {
  if (!output) return []
  try {
    const obj = JSON.parse(output)
    if (obj && typeof obj === "object") {
      // 1. Direct output fields on the root (generate_image → { urls: [...] }).
      const rec = obj as Record<string, unknown>
      if (rec.schema === "kolbo.operation/1" && Array.isArray(rec.outputs)) {
        const fromOp = rec.outputs.flatMap((item) => {
          if (!item || typeof item !== "object") return []
          const url = (item as { url?: unknown }).url
          return typeof url === "string" && /^https?:\/\//.test(url) ? [url] : []
        })
        if (fromOp.length > 0) return unique(fromOp)
      }

      const direct = urlsFromFields(rec)
      if (direct.length > 0) return direct

      // 2. Nested `result` object. get_generation_status recovers a timed-out
      //    generation as { state, result: { urls: [...] } } — the urls live one
      //    level down, so the flat scan above misses them.
      const result = (obj as Record<string, unknown>).result
      if (result && typeof result === "object") {
        const nested = urlsFromFields(result as Record<string, unknown>)
        if (nested.length > 0) return nested
      }

      // 3. Batch / multi-item shapes: an array of per-item objects, each with
      //    output fields directly or under `result` (batch get_generation_status,
      //    creative_director scenes). Collect across every item.
      const batchKeys = ["generations", "results", "scenes", "data"] as const
      for (const key of batchKeys) {
        const arr = (obj as Record<string, unknown>)[key]
        if (!Array.isArray(arr)) continue
        const collected: string[] = []
        for (const item of arr) {
          if (!item || typeof item !== "object") continue
          collected.push(...urlsFromFields(item as Record<string, unknown>))
          const itemResult = (item as Record<string, unknown>).result
          if (itemResult && typeof itemResult === "object") {
            collected.push(...urlsFromFields(itemResult as Record<string, unknown>))
          }
        }
        if (collected.length > 0) return unique(collected)
      }
    }
  } catch {
    /* fall through */
  }
  const all: string[] = []
  const mdRe = /\[([^\]]*)\]\((https?:\/\/[^)]+)\)/g
  let m: RegExpExecArray | null
  while ((m = mdRe.exec(output)) !== null) all.push(m[2].trim())
  const bareRe = /(?<!\()(https?:\/\/[^\s"'<>)]+)/g
  while ((m = bareRe.exec(output)) !== null) all.push(m[1].trim())
  return unique(all)
}

// Single canonical video extension regex. Includes `ogv` (canvas's old
// `classifyUrl` was missing it) and tolerates both bare `?query` and
// fragment `#hash` suffixes.
export const KOLBO_VIDEO_EXT_RE = /\.(mp4|webm|mov|m4v|mkv|avi|ogv)(?=$|[?#])/i

export function isVideoUrl(url: string): boolean {
  return KOLBO_VIDEO_EXT_RE.test(url)
}

/**
 * Append `#t=0.05` to a video URL so a `<video preload="auto"
 * autoplay muted playsinline>` decodes the first frame instead of
 * sitting on black. Combine with `pauseOnFirstFrame()` for a freeze-
 * frame poster effect. No-op if the URL already has a `#` fragment.
 */
export function firstFramePosterSrc(url: string): string {
  return url.includes("#") ? url : `${url}#t=0.05`
}

/**
 * Attach to a `<video>` element to pause it on the first decoded
 * frame. Pairs with `firstFramePosterSrc()` to render the video as
 * a still poster (no continuous decoding).
 */
export function pauseOnFirstFrame(video: HTMLVideoElement): void {
  video.addEventListener(
    "loadeddata",
    () => {
      try { video.pause() } catch {}
    },
    { once: true },
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Lightbox
// ────────────────────────────────────────────────────────────────────────────

/**
 * Full-screen overlay for previewing an image or video URL. Click the
 * backdrop or press Escape to close. Detects video by extension.
 *
 * Imperative (document.body.appendChild) by design — used from contexts
 * that don't have a Solid render scope (markdown's manually-built chip
 * DOM, plus the canvas cell click handler).
 */
export function openKolboLightbox(src: string): void {
  if (typeof document === "undefined") return
  const isVideo = isVideoUrl(src)

  const backdrop = document.createElement("div")
  backdrop.style.cssText =
    "position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;" +
    "background:rgba(0,0,0,0.85);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);" +
    "cursor:zoom-out;animation:_kolbo-lb-in 0.15s ease"

  if (!document.getElementById("_kolbo-lb-style")) {
    const s = document.createElement("style")
    s.id = "_kolbo-lb-style"
    s.textContent =
      "@keyframes _kolbo-lb-in{from{opacity:0}to{opacity:1}}" +
      "@keyframes _kolbo-lb-media-in{from{opacity:0;transform:scale(0.92)}to{opacity:1;transform:scale(1)}}"
    document.head.appendChild(s)
  }

  let media: HTMLElement
  if (isVideo) {
    const video = document.createElement("video")
    video.src = src
    video.controls = true
    video.autoplay = true
    video.playsInline = true
    video.style.cssText =
      "max-width:90vw;max-height:90vh;border-radius:8px;background:#000;" +
      "box-shadow:0 24px 64px rgba(0,0,0,0.7);cursor:default;" +
      "animation:_kolbo-lb-media-in 0.18s ease"
    media = video
  } else {
    const img = document.createElement("img")
    img.src = src
    img.style.cssText =
      "max-width:90vw;max-height:90vh;object-fit:contain;border-radius:8px;" +
      "box-shadow:0 24px 64px rgba(0,0,0,0.7);cursor:default;" +
      "animation:_kolbo-lb-media-in 0.18s ease"
    media = img
  }
  media.addEventListener("click", (e) => e.stopPropagation())

  backdrop.appendChild(media)
  document.body.appendChild(backdrop)

  const close = () => {
    // For video: explicitly pause + clear src so WebKit releases the
    // decoder + buffered bytes instead of holding them until GC.
    if (media instanceof HTMLVideoElement) {
      try {
        media.pause()
        media.removeAttribute("src")
        media.load()
      } catch {}
    }
    backdrop.remove()
    document.removeEventListener("keydown", onKey)
  }
  const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close() }

  backdrop.addEventListener("click", close)
  document.addEventListener("keydown", onKey)
}
