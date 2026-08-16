// Survives `prompt.reset()` after a follow-up is queued. The queued draft is
// a snapshot; uploads finish against the live prompt (now empty) and write
// here so flush can attach by CDN URL instead of getting stuck.

const published = new Map<string, string>()

export function rememberAttachmentUrl(id: string, url: string) {
  if (!id || !/^https?:\/\//.test(url)) return
  published.set(id, url)
}

export function hydratePromptUrls<T extends { type: string; id?: string; publicUrl?: string }>(parts: T[]): T[] {
  return parts.map((part) => {
    if (part.type !== "image") return part
    if (part.publicUrl && /^https?:\/\//.test(part.publicUrl)) return part
    const url = part.id ? published.get(part.id) : undefined
    if (!url) return part
    return { ...part, publicUrl: url, uploading: false }
  })
}

export function resetAttachmentUrls() {
  published.clear()
}
