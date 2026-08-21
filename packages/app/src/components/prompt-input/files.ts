import { ACCEPTED_AUDIO_TYPES, ACCEPTED_FILE_TYPES, ACCEPTED_IMAGE_TYPES, ACCEPTED_VIDEO_TYPES } from "@/constants/file-picker"

export { ACCEPTED_FILE_TYPES }

const IMAGE_MIMES = new Set(ACCEPTED_IMAGE_TYPES)
const AUDIO_MIMES = new Set(ACCEPTED_AUDIO_TYPES)
const VIDEO_MIMES = new Set(ACCEPTED_VIDEO_TYPES)

const IMAGE_EXTS = new Map([
  ["avif", "image/avif"],
  ["bmp", "image/bmp"],
  ["gif", "image/gif"],
  ["heic", "image/heic"],
  ["heif", "image/heif"],
  ["jpeg", "image/jpeg"],
  ["jpg", "image/jpeg"],
  ["png", "image/png"],
  ["tif", "image/tiff"],
  ["tiff", "image/tiff"],
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
  ["ogv", "video/ogg"],
])
const TEXT_MIMES = new Set([
  "application/json",
  "application/ld+json",
  "application/toml",
  "application/x-toml",
  "application/x-yaml",
  "application/xml",
  "application/yaml",
  "text/html",
  "text/markdown",
  "text/csv",
  "text/xml",
  "image/svg+xml",
  "application/xhtml+xml",
])

const TEXT_EXTS = new Set([
  "txt",
  "text",
  "md",
  "markdown",
  "mdx",
  "log",
  "csv",
  "tsv",
  "html",
  "htm",
  "xhtml",
  "svg",
  "xml",
  "json",
  "jsonl",
  "yaml",
  "yml",
  "toml",
  "ini",
  "env",
  "srt",
  "vtt",
  "css",
  "js",
  "ts",
  "tsx",
  "jsx",
  "py",
  "rb",
  "rs",
  "go",
  "sql",
  "sh",
])

const DOC_EXTS = new Map([
  ["pdf", "application/pdf"],
  ["doc", "application/msword"],
  ["docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  ["xls", "application/vnd.ms-excel"],
  ["xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  ["ppt", "application/vnd.ms-powerpoint"],
  ["pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation"],
  ["rtf", "application/rtf"],
  ["pages", "application/vnd.apple.pages"],
  ["numbers", "application/vnd.apple.numbers"],
  ["key", "application/vnd.apple.keynote"],
  ["zip", "application/zip"],
  ["gz", "application/gzip"],
  ["tgz", "application/gzip"],
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

/** Detect mime type from a URL by its file extension. Unknown binaries stay attachable. */
export function mimeFromUrl(url: string): string | undefined {
  const clean = url.split("?")[0].split("#")[0]
  const lastDot = clean.lastIndexOf(".")
  if (lastDot === -1) return undefined
  const suffix = clean.slice(lastDot + 1).toLowerCase()
  if (TEXT_EXTS.has(suffix)) return "text/plain"
  return IMAGE_EXTS.get(suffix) ?? AUDIO_EXTS.get(suffix) ?? VIDEO_EXTS.get(suffix) ?? DOC_EXTS.get(suffix) ?? "application/octet-stream"
}

export function texted(mime: string) {
  return mime === "text/plain" || mime.startsWith("text/")
}

/** Goes to the Kolbo CDN. HTML/SVG stay local text so they never execute on the CDN. */
export function hosted(mime: string) {
  if (mime === "image/svg+xml") return false
  return mime.startsWith("image/") || mime.startsWith("audio/") || mime.startsWith("video/") || mime === "application/pdf"
}

/** Ready to send: CDN URL, inlined text, or a remembered local path. */
export function ready(part: { mime: string; publicUrl?: string; localPath?: string; uploading?: boolean }) {
  if (part.uploading) return false
  if (part.publicUrl && /^https?:\/\//.test(part.publicUrl)) return true
  if (part.localPath) return true
  return texted(part.mime)
}

export async function attachmentMime(file: File) {
  const type = kind(file.type)
  if (IMAGE_MIMES.has(type)) return type
  if (AUDIO_MIMES.has(type)) return type
  if (VIDEO_MIMES.has(type)) return type
  if (type === "application/pdf") return type

  const suffix = ext(file.name)
  if (TEXT_EXTS.has(suffix) || textMime(type)) return "text/plain"

  const fallback =
    IMAGE_EXTS.get(suffix) ??
    AUDIO_EXTS.get(suffix) ??
    VIDEO_EXTS.get(suffix) ??
    DOC_EXTS.get(suffix)
  if (fallback) return fallback

  const bytes = new Uint8Array(await file.slice(0, SAMPLE).arrayBuffer())
  if (textBytes(bytes)) return "text/plain"
  return type || "application/octet-stream"
}
