import { ACCEPTED_AUDIO_TYPES, ACCEPTED_FILE_TYPES, ACCEPTED_IMAGE_TYPES, ACCEPTED_VIDEO_TYPES } from "@/constants/file-picker"

export { ACCEPTED_FILE_TYPES }

const IMAGE_MIMES = new Set(ACCEPTED_IMAGE_TYPES)
const AUDIO_MIMES = new Set(ACCEPTED_AUDIO_TYPES)
const VIDEO_MIMES = new Set(ACCEPTED_VIDEO_TYPES)

const IMAGE_EXTS = new Map([
  ["gif", "image/gif"],
  ["jpeg", "image/jpeg"],
  ["jpg", "image/jpeg"],
  ["png", "image/png"],
  ["webp", "image/webp"],
])

const AUDIO_EXTS = new Map([
  ["mp3", "audio/mpeg"],
  ["wav", "audio/wav"],
  ["ogg", "audio/ogg"],
  ["m4a", "audio/mp4"],
  ["aac", "audio/aac"],
  ["flac", "audio/flac"],
  ["opus", "audio/ogg"],
  ["wma", "audio/x-ms-wma"],
])

const VIDEO_EXTS = new Map([
  ["mp4", "video/mp4"],
  ["webm", "video/webm"],
  ["mov", "video/quicktime"],
  ["avi", "video/x-msvideo"],
  ["mkv", "video/x-matroska"],
  ["m4v", "video/mp4"],
])
const TEXT_MIMES = new Set([
  "application/json",
  "application/ld+json",
  "application/toml",
  "application/x-toml",
  "application/x-yaml",
  "application/xml",
  "application/yaml",
])

const SAMPLE = 4096

function kind(type: string) {
  return type.split(";", 1)[0]?.trim().toLowerCase() ?? ""
}

function ext(name: string) {
  const idx = name.lastIndexOf(".")
  if (idx === -1) return ""
  return name.slice(idx + 1).toLowerCase()
}

function textMime(type: string) {
  if (!type) return false
  if (type.startsWith("text/")) return true
  if (TEXT_MIMES.has(type)) return true
  if (type.endsWith("+json")) return true
  return type.endsWith("+xml")
}

function textBytes(bytes: Uint8Array) {
  if (bytes.length === 0) return true
  let count = 0
  for (const byte of bytes) {
    if (byte === 0) return false
    if (byte < 9 || (byte > 13 && byte < 32)) count += 1
  }
  return count / bytes.length <= 0.3
}

/** Max file size (bytes) allowed for audio/video attachments (200 MB). */
export const MAX_MEDIA_BYTES = 200 * 1024 * 1024

/** Detect mime type from a URL by its file extension. Returns undefined if unrecognized. */
export function mimeFromUrl(url: string): string | undefined {
  const clean = url.split("?")[0].split("#")[0]
  const lastDot = clean.lastIndexOf(".")
  if (lastDot === -1) return undefined
  const suffix = clean.slice(lastDot + 1).toLowerCase()
  return IMAGE_EXTS.get(suffix) ?? AUDIO_EXTS.get(suffix) ?? VIDEO_EXTS.get(suffix)
}

export async function attachmentMime(file: File) {
  const type = kind(file.type)
  if (IMAGE_MIMES.has(type)) return type
  if (AUDIO_MIMES.has(type)) return type
  if (VIDEO_MIMES.has(type)) return type
  if (type === "application/pdf") return type

  const suffix = ext(file.name)
  const fallback =
    IMAGE_EXTS.get(suffix) ??
    AUDIO_EXTS.get(suffix) ??
    VIDEO_EXTS.get(suffix) ??
    (suffix === "pdf" ? "application/pdf" : undefined)
  if ((!type || type === "application/octet-stream") && fallback) return fallback

  if (textMime(type)) return "text/plain"
  const bytes = new Uint8Array(await file.slice(0, SAMPLE).arrayBuffer())
  if (!textBytes(bytes)) return
  return "text/plain"
}
