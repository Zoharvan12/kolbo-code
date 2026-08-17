/**
 * Kolbo media extraction — the pure half, with no DOM dependency, so the server
 * can use it too. `packages/ui/src/components/kolbo-media.ts` re-exports these
 * alongside its browser-only helpers (drag, lightbox, first-frame poster).
 *
 * Consumers: markdown chip rendering (`markdown.tsx`), the message-part tool chip
 * (`message-part.tsx`), the desktop canvas (`session-canvas.tsx`), and the shared
 * session page (`opencode/src/share/kolbo-share.ts`). Centralized here so the
 * output-field list and video extension regex don't drift across surfaces.
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
 * Did this result actually PRODUCE media? Stricter than extractKolboUrls on
 * purpose, and used to decide whether a tool gets a generation card at all.
 *
 * extractKolboUrls is deliberately generous — it ends with a bare `url`
 * fallback and walks `data`/`results`/`generations` rows applying it per item,
 * which is right for pulling every asset out of a batch result. Using that same
 * generosity to ANSWER "is this a generation?" is what made unrelated tools
 * render as big image cards: any list row or doc result carrying a `url` looked
 * like generated output, so `update_doc` and friends mounted a media card and
 * rendered a Kolbo logo as if it were the result.
 *
 * Only two things count here: the operation envelope, or a real output field
 * (`urls` / `image_urls` / … — never a bare `url`, never a per-row url).
 */
export function hasGeneratedOutput(output: string | undefined): boolean {
  if (!output) return false
  let obj: unknown
  try {
    obj = JSON.parse(output)
  } catch {
    return false
  }
  if (!obj || typeof obj !== "object") return false
  const rec = obj as Record<string, unknown>
  if (rec.schema === "kolbo.operation/1" && Array.isArray(rec.outputs)) return rec.outputs.length > 0
  const fromFields = (o: Record<string, unknown>) =>
    KOLBO_OUTPUT_FIELDS.some((field) => {
      const value = o[field]
      if (Array.isArray(value)) return value.some((v) => typeof v === "string" && /^https?:\/\//.test(v))
      return typeof value === "string" && /^https?:\/\//.test(value)
    })
  if (fromFields(rec)) return true
  // get_generation_status recovers a timed-out generation as
  // { state, result: { urls: [...] } } — a real generation, one level down.
  const result = rec.result
  if (result && typeof result === "object" && fromFields(result as Record<string, unknown>)) return true
  return false
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
  return unique(all.filter((url) => !isChrome(url)))
}

// UI furniture, not generated media. The regex scan above is a blind sweep of
// every URL in the text, so any model avatar or Kolbo logo that rides along in
// a tool result gets promoted to "generated image" and shows up in the chip
// strip next to the real outputs.
const CHROME_RE = /\/models_icons\/|\/assets\/[^/]+\.(png|jpe?g|svg|webp|avif)(?=$|[?#])|\/chat-agent-icons\//i

function isChrome(url: string): boolean {
  return CHROME_RE.test(url)
}

// Single canonical video extension regex. Includes `ogv` (canvas's old
// `classifyUrl` was missing it) and tolerates both bare `?query` and
// fragment `#hash` suffixes.
export const KOLBO_VIDEO_EXT_RE = /\.(mp4|webm|mov|m4v|mkv|avi|ogv)(?=$|[?#])/i

export function isVideoUrl(url: string): boolean {
  return KOLBO_VIDEO_EXT_RE.test(url)
}
