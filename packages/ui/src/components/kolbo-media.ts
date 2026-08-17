/**
 * Kolbo media utilities for the browser. The pure extraction half now lives in
 * `@opencode-ai/util/kolbo-media` so the server can share it; it is re-exported
 * here so existing importers keep working unchanged.
 */
import { isVideoUrl } from "@opencode-ai/util/kolbo-media"

export {
  KOLBO_OUTPUT_FIELDS,
  KOLBO_VIDEO_EXT_RE,
  extractKolboUrls,
  isVideoUrl,
  mediaKey,
} from "@opencode-ai/util/kolbo-media"

/** Put a public media URL on a drag so dropping on the prompt attaches by reference. */
export function startMediaDrag(transfer: DataTransfer | null | undefined, url: string) {
  if (!transfer || !url) return
  transfer.setData("text/uri-list", url)
  transfer.setData("text/plain", url)
  transfer.effectAllowed = "copy"
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
