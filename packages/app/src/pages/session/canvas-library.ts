export const TYPE_OPTIONS = ["all", "image", "video", "audio"] as const
export const CATEGORY_OPTIONS = ["all", "ai", "uploaded", "edited", "favorites", "trash"] as const
export type TypeFilter = (typeof TYPE_OPTIONS)[number]
export type CategoryFilter = (typeof CATEGORY_OPTIONS)[number]

export type LibraryFolder = {
  id: string
  name: string
  description: string | null
  color: string | null
  icon: string | null
  item_count: number
  is_owner: boolean
  shared_with_count: number
  project_id: string | null
}

export type LibraryProject = {
  id: string
  name: string
  thumbnail: string | null
}

export function parseFolders(raw: unknown): LibraryFolder[] {
  const body = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}
  const list = Array.isArray(raw)
    ? raw
    : Array.isArray(body.folders)
      ? body.folders
      : Array.isArray(body.data)
        ? body.data
        : []
  return list.flatMap((row) => {
    if (!row || typeof row !== "object") return []
    const f = row as Record<string, unknown>
    const id = f.id ?? f._id
    if (id == null || id === "") return []
    const shared = f.shared_with ?? f.sharedWith
    return [
      {
        id: String(id),
        name: typeof f.name === "string" && f.name.trim() ? f.name.trim() : "Untitled",
        description: typeof f.description === "string" && f.description ? f.description : null,
        color: typeof f.color === "string" && f.color ? f.color : null,
        icon: typeof f.icon === "string" && f.icon ? f.icon : null,
        item_count: Number(f.item_count ?? f.itemCount ?? 0) || 0,
        is_owner: f.is_owner === false || f.isOwner === false ? false : true,
        shared_with_count: Number(f.shared_with_count ?? (Array.isArray(shared) ? shared.length : 0)) || 0,
        project_id: f.project_id != null ? String(f.project_id) : f.projectId != null ? String(f.projectId) : null,
      },
    ]
  })
}

// The API's denormalized itemCount drifts (adds via folder APIs only).
// Only print a count when the caller has a live total from /v1/media.
export function folderLabel(folder: LibraryFolder, live?: number) {
  const bits = [folder.name]
  if (typeof live === "number") bits.push(`(${live})`)
  if (!folder.is_owner || folder.shared_with_count > 0) bits.push("· shared")
  return bits.join(" ")
}

export function folderTitle(folder: LibraryFolder, live?: number) {
  const bits = [folder.name]
  if (folder.description) bits.push(folder.description)
  if (typeof live === "number") bits.push(`${live} items`)
  if (!folder.is_owner) bits.push("shared with you")
  else if (folder.shared_with_count > 0) bits.push(`shared with ${folder.shared_with_count}`)
  return bits.join(" — ")
}

function str(v: unknown) {
  return typeof v === "string" && v.trim() ? v.trim() : ""
}

function coverUrl(raw: unknown): string | null {
  if (typeof raw === "string" && raw) return raw
  if (!raw || typeof raw !== "object") return null
  const c = raw as Record<string, unknown>
  if (str(c.url)) return str(c.url)
  if (str(c.thumbnail_url)) return str(c.thumbnail_url)
  const manual = c.manual
  if (manual && typeof manual === "object") {
    const u = (manual as Record<string, unknown>).url
    if (str(u)) return str(u)
  }
  const mosaic = c.mosaic ?? c.auto
  if (Array.isArray(mosaic) && mosaic[0]) {
    const first = mosaic[0]
    if (typeof first === "string" && first) return first
    if (first && typeof first === "object") {
      const u = (first as Record<string, unknown>).url
      if (str(u)) return str(u)
    }
  }
  return null
}

export function parseProjects(raw: unknown): LibraryProject[] {
  const body = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}
  const list = Array.isArray(raw)
    ? raw
    : Array.isArray(body.data)
      ? body.data
      : Array.isArray(body.projects)
        ? body.projects
        : []
  return list.flatMap((row) => {
    if (!row || typeof row !== "object") return []
    const p = row as Record<string, unknown>
    const id = p.id ?? p._id
    if (id == null || id === "") return []
    return [
      {
        id: String(id),
        name: str(p.name) || str(p.title) || "Untitled",
        thumbnail: str(p.thumbnail) || str(p.thumbnail_url) || coverUrl(p.cover) || null,
      },
    ]
  })
}

export function buildQuery(filters: {
  projectId: string
  type: TypeFilter
  category: CategoryFilter
  folderId: string | null
  page: number
  pageSize: number
  sessionIds?: string[]
}): string {
  const p = new URLSearchParams()
  if (filters.projectId && filters.projectId !== "all") p.set("project_id", filters.projectId)
  if (filters.folderId) p.set("folder_id", filters.folderId)
  if (filters.type !== "all") p.set("type", filters.type)
  if (filters.category !== "all" && filters.category !== "trash") p.set("category", filters.category)
  if (filters.sessionIds?.length) p.set("session_ids", filters.sessionIds.join(","))
  p.set("sort", "created_desc")
  p.set("page", String(filters.page))
  p.set("page_size", String(filters.pageSize))
  return p.toString()
}

const OBJECT_ID = /^[a-f0-9]{24}$/i

/** True when the URL looks like a still image (not a video/audio file). */
export function isImageThumb(u: string | undefined): boolean {
  return !!(u && /\.(webp|jpg|jpeg|png|gif|avif)(\?|$)/i.test(u))
}

/**
 * Best still for a library tile — prefer small/optimized thumbs (same fields
 * UnifiedMediaCard / showcase use) over the full media URL.
 */
export function thumbOf(item: {
  type: string
  url?: string
  thumbnail_url?: string
  metadata?: Record<string, unknown>
}): string | undefined {
  const md = item.metadata ?? {}
  const cands = [
    md.thumbnailSmallUrl,
    md.thumbnail_small_url,
    md.thumbnailUrl,
    md.thumbnail_url,
    item.thumbnail_url,
    md.poster,
    md.poster_url,
    md.preview_url,
  ]
  for (const c of cands) {
    if (typeof c === "string" && isImageThumb(c)) return c
  }
  if (item.type === "image" && item.url) return item.url
  return undefined
}

/** Keep only library rows that belong to this Code chat (Kolbo session ids or URL keys). */
export function matchSession(
  item: { session_id?: string | null; url?: string },
  sessions: Set<string>,
  keys: Set<string>,
  keyOf: (url: string) => string,
) {
  if (item.session_id && sessions.has(item.session_id)) return true
  if (item.url && keys.size > 0 && keys.has(keyOf(item.url))) return true
  return false
}

export function isObjectId(id: string) {
  return OBJECT_ID.test(id)
}
