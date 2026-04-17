import type { FilePart } from "@opencode-ai/sdk/v2"

function isMedia(part: FilePart) {
  return part.mime.startsWith("image/") || part.mime.startsWith("video/") || part.mime.startsWith("audio/")
}

export function attached(part: FilePart) {
  // data: URLs are always shown as attachments
  // Media file parts (image/video/audio) are also shown as attachments regardless of URL scheme
  return part.url.startsWith("data:") || isMedia(part)
}

export function inline(part: FilePart) {
  if (attached(part)) return false
  return part.source?.text?.start !== undefined && part.source?.text?.end !== undefined
}

export function kind(part: FilePart) {
  if (part.mime.startsWith("image/")) return "image"
  if (part.mime.startsWith("video/")) return "video"
  if (part.mime.startsWith("audio/")) return "audio"
  return "file"
}
