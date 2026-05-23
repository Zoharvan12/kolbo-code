import {
  Accessor,
  createEffect,
  createMemo,
  createResource,
  createSignal,
  For,
  Index,
  Match,
  onCleanup,
  onMount,
  Show,
  Switch,
} from "solid-js"
import { useLanguage } from "@/context/language"
import { useServer } from "@/context/server"
import { useSessionLayout } from "@/pages/session/session-layout"
import { AudioWavePlayer, fmt as formatDurationSec } from "@/pages/session/audio-wave-player"
import { showToast } from "@opencode-ai/ui/toast"
import { MediaCard } from "@opencode-ai/ui/media-card"
import { openKolboLightbox, firstFramePosterSrc, pauseOnFirstFrame } from "@opencode-ai/ui/kolbo-media"
import { Icon } from "@opencode-ai/ui/icon"
import { useKolboModels } from "@opencode-ai/ui/context"
import { Mark } from "@opencode-ai/ui/logo"
import { usePlatformOps } from "@opencode-ai/ui/context/platform-ops"

// Defensive constants — lifted from kolbo-desktop (Electron app)'s
// MEDIA_TAB_SCROLL_IMPROVEMENTS.md after they shipped real-world scroll
// freezes. The 200px rootMargin, the cooldown gate, the empty-response
// counter, and the absolute page cap together kept their list stable
// under fast scrolling. Same patterns here.
const SCROLL_DEBOUNCE_MS = 250
const SCROLL_COOLDOWN_MS = 500
const MAX_EMPTY_RESPONSES = 3
const MAX_PAGES_LIMIT = 100
const SENTINEL_ROOT_MARGIN = "200px"

const TYPE_OPTIONS = ["all", "image", "video", "audio"] as const
const CATEGORY_OPTIONS = ["all", "ai", "uploaded", "favorites", "trash"] as const
type TypeFilter = (typeof TYPE_OPTIONS)[number]
type CategoryFilter = (typeof CATEGORY_OPTIONS)[number]

// Inline 12×12 chip icons. We use raw SVG so we don't have to plumb the full
// UI Icon component through the chip layout (it'd add wrapper divs that mess
// with the underline-on-active indicator).
const ICON_PATHS = {
  type: {
    all: <><rect x="2" y="2" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.4"/><rect x="9" y="2" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.4"/><rect x="2" y="9" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.4"/><rect x="9" y="9" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.4"/></>,
    image: <><rect x="2" y="3" width="12" height="10" rx="1.5" stroke="currentColor" stroke-width="1.4"/><circle cx="6" cy="7" r="1.2" fill="currentColor"/><path d="M2.5 12l3.5-3.5 3 3 2.5-2 2 2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" fill="none"/></>,
    video: <><rect x="2" y="3.5" width="9" height="9" rx="1.4" stroke="currentColor" stroke-width="1.4" fill="none"/><path d="M11 6l3-1.5v7L11 10z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" fill="none"/></>,
    audio: <><path d="M5 13V5l6-2v8" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" fill="none"/><circle cx="4" cy="13" r="1.6" stroke="currentColor" stroke-width="1.4" fill="none"/><circle cx="10" cy="11" r="1.6" stroke="currentColor" stroke-width="1.4" fill="none"/></>,
  },
  category: {
    all: <><circle cx="8" cy="8" r="5.5" stroke="currentColor" stroke-width="1.4"/><path d="M3 8h10M8 3v10" stroke="currentColor" stroke-width="1.4"/></>,
    ai: <><path d="M8 2l1.5 3.5L13 7l-3.5 1.5L8 12 6.5 8.5 3 7l3.5-1.5z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" fill="none"/></>,
    uploaded: <><path d="M8 13V4M5 7l3-3 3 3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" fill="none"/><path d="M3 13h10" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></>,
    favorites: <path d="M8 2l1.9 4 4.4.6-3.2 3.1.8 4.4L8 12 4.1 14.1l.8-4.4L1.7 6.6l4.4-.6z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" fill="none"/>,
    trash: <path d="M2.5 4.5h11M6 4.5V3a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1.5M4.5 4.5l.6 9a1.5 1.5 0 0 0 1.5 1.4h2.8a1.5 1.5 0 0 0 1.5-1.4l.6-9M7 7.5v4.5M9 7.5v4.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" fill="none"/>,
  },
} as const

type MediaItemMetadata = {
  modelName?: string
  modelThumbnail?: string
  model?: any
  model_id?: string
  generationModel?: string
  voiceName?: string
  voiceProvider?: string
  musicStyle?: string
  instrumentalMode?: boolean
  s3Metadata?: any
  s3Tags?: any
  metadata?: { modelName?: string; [k: string]: any }
  [key: string]: any
}

type MediaItem = {
  id: string
  url: string
  thumbnail_url?: string
  type: "image" | "video" | "audio"
  is_favorited?: boolean
  nsfw_detected?: boolean
  source_type?: "uploaded" | "generated" | "chat-generated"
  filename?: string
  prompt?: string
  created_at?: string
  width?: number
  height?: number
  duration?: number
  metadata?: MediaItemMetadata
}

type Pagination = {
  current_page?: number
  has_next?: boolean
  page_size?: number
  total_items?: number
}

// Shape returned by GET /favorite-items — different from /v1/media's MediaItem.
// Mirrors kolbo-map's FavoriteItem interface (favoritesApi.ts:56-86).
type FavoriteItemRaw = {
  id: string
  url: string
  mediaType: "image" | "video" | "audio" | "3d_model" | "document"
  sourceType?: "uploaded" | "generated" | "chat-generated"
  isFavorited: true
  createdAt: string
  projectId?: string
  width?: number
  height?: number
  duration?: number
  metadata?: {
    prompt?: string
    thumbnail_url?: string
    width?: number
    height?: number
    duration?: number
    modelName?: string
    modelThumbnail?: string
    voiceName?: string
    voiceProvider?: string
    musicStyle?: string
    instrumentalMode?: boolean
    [key: string]: any
  }
}

type Project = {
  _id: string
  name?: string
  title?: string
}

// Module-scoped one-shot projects cache so switching back and forth between
// Library and Session doesn't re-fetch the project list on every entry.
// Keyed by serverBase so different sidecar instances don't share cache.
const projectsCache = new Map<string, Promise<Project[]>>()
function loadProjects(serverBase: string): Promise<Project[]> {
  const cached = projectsCache.get(serverBase)
  if (cached) return cached
  const p = (async () => {
    try {
      const res = await fetch(`${serverBase}/global/kolbo-projects`, { headers: { Accept: "application/json" } })
      if (!res.ok) return []
      const data = (await res.json()) as { data?: Project[] } | Project[]
      return Array.isArray(data) ? data : (data.data ?? [])
    } catch {
      return []
    }
  })()
  projectsCache.set(serverBase, p)
  return p
}

const PROJECT_LS_KEY = "kolbo.canvas.library.projectId"

// Module-scoped batch selection state for the Library — same pattern as
// session-canvas. Selection persists while the user navigates between
// Session and Library tabs; an explicit Exit clears it.
const [libraryBatchMode, setLibraryBatchMode] = createSignal(false)
const [librarySelected, setLibrarySelected] = createSignal<Set<string>>(new Set<string>())

function toggleLibrarySelected(id: string) {
  setLibrarySelected((prev) => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })
  if (librarySelected().size === 0) setLibraryBatchMode(false)
}

function clearLibrarySelection() {
  setLibrarySelected(new Set<string>())
  setLibraryBatchMode(false)
}

// Media-generation models (fal-ai/flux-pro, bytedance/seedance, etc.) live in
// kolbo-api's /models catalog — NOT the /kolbo/v1/models catalog that the
// shared KolboModelsProvider context reads. So for media-library badges we
// need our own fetch of /models?format=detailed; the context is used as a
// fallback for LLM ids.
type RegistryModel = {
  _id?: string
  id?: string
  identifier?: string
  name?: string
  avatar?: string
  imageUrl?: string
  subModels?: string[]
  identifierToNameMap?: Record<string, string>
  identifierToAvatarMap?: Record<string, string>
}
// Indexed registry: O(1) lookup keyed by every searchable field. Built once
// when the registry resource resolves; reused by every cell.
type RegistryData = {
  models: RegistryModel[]
  assetsBase: string
  byKey: Map<string, { model: RegistryModel; subKey?: string }>
}

function indexRegistry(models: RegistryModel[], assetsBase: string): RegistryData {
  const byKey = new Map<string, { model: RegistryModel; subKey?: string }>()
  const put = (k: string | undefined, model: RegistryModel, subKey?: string) => {
    if (!k) return
    const lc = k.toLowerCase()
    if (!byKey.has(lc)) byKey.set(lc, { model, subKey })
  }
  for (const m of models) {
    put(m.identifier, m)
    put(m.id, m)
    if (typeof m._id === "string") put(m._id, m)
    put(m.name, m)
    if (m.identifierToNameMap) {
      for (const k of Object.keys(m.identifierToNameMap)) put(k, m, k)
    }
    if (m.subModels) for (const s of m.subModels) put(s, m, s)
  }
  return { models, assetsBase, byKey }
}

const registryCache = new Map<string, Promise<RegistryData>>()
function loadModelRegistry(serverBase: string): Promise<RegistryData> {
  const cached = registryCache.get(serverBase)
  if (cached) return cached
  const p = (async () => {
    try {
      const res = await fetch(`${serverBase}/global/kolbo-models?format=detailed`, {
        headers: { Accept: "application/json" },
      })
      if (!res.ok) return indexRegistry([], "")
      const raw = (await res.json()) as {
        data?: { models?: RegistryModel[] }
        assetsBase?: string
      }
      const models = raw.data?.models ?? []
      if (models.length === 0) {
        // Loud warning so a future backend shape change can't silently kill
        // every model badge in the library (the prior bug). Inspect `raw`
        // in DevTools to see the actual shape that needs handling.
        console.warn(
          "[canvas-library] /global/kolbo-models returned 0 models — unrecognized response shape?",
          raw,
        )
      }
      return indexRegistry(models, raw.assetsBase ?? "")
    } catch {
      return indexRegistry([], "")
    }
  })()
  registryCache.set(serverBase, p)
  return p
}

function resolveRegistryModel(
  rawId: string | undefined,
  registry: RegistryData,
): { name?: string; avatar?: string } {
  if (!rawId || !registry.models.length) return {}
  const absolutize = (a: string | undefined) => {
    if (!a) return undefined
    if (a.startsWith("http://") || a.startsWith("https://") || a.startsWith("data:")) return a
    if (!registry.assetsBase) return undefined
    return `${registry.assetsBase}/${a.replace(/^\/+/, "")}`
  }
  const hit = registry.byKey.get(rawId.toLowerCase())
  if (hit) {
    const { model, subKey } = hit
    // Submodel-specific avatar/name if the matched key is a submodel id.
    const avatar = (subKey && model.identifierToAvatarMap?.[subKey]) || model.avatar || model.imageUrl
    const name = (subKey && model.identifierToNameMap?.[subKey]) || model.name
    return { name, avatar: absolutize(avatar) }
  }
  // Partial contains fallback — rare path, scan when no exact key hit.
  const q = rawId.toLowerCase()
  if (q.length >= 8) {
    for (const m of registry.models) {
      const id = (m.identifier || m.id || "").toLowerCase()
      if (id.length >= 8 && (q.includes(id) || id.includes(q))) {
        return { name: m.name, avatar: absolutize(m.avatar || m.imageUrl) }
      }
    }
  }
  return {}
}

// Pretty-print a raw model identifier (e.g. "fal-ai/flux-pro/v1.1-ultra" or
// "google/nano-banana-edit") into something human-readable. We don't have the
// MongoDB model registry that kolbo-map uses, so we just take the last
// meaningful segment, strip vendor prefixes, and title-case.
const VENDOR_PREFIXES = new Set([
  "fal-ai",
  "fal",
  "bytedance",
  "google",
  "openai",
  "anthropic",
  "replicate",
  "stability-ai",
  "stability",
  "runway",
  "luma",
  "kling",
  "minimax",
  "elevenlabs",
  "deepdub",
  "suno",
])

function prettifyModelId(raw: string): string {
  if (!raw) return raw
  if (/^[0-9a-fA-F]{24}$/.test(raw)) return raw
  let s = raw.trim()
  if (s.includes("/")) {
    // Drop the leading vendor segment if it's a known vendor, then join the
    // remaining segments. Keeps the full model identity (e.g.
    // "fal-ai/flux-pro/v1.1-ultra" → "flux-pro v1.1-ultra"), instead of
    // dropping everything but the last path segment.
    const parts = s.split("/").filter(Boolean)
    if (parts.length > 1 && VENDOR_PREFIXES.has(parts[0].toLowerCase())) parts.shift()
    s = parts.join(" ")
  }
  s = s.replace(/[-_]+/g, " ").trim()
  // Title-case while preserving short uppercase tokens (4K, v1, numbers).
  return s
    .split(/\s+/)
    .filter(Boolean)
    .map((w) =>
      w.length <= 1
        ? w.toUpperCase()
        : /^v?\d/i.test(w) || /^\d+k$/i.test(w)
          ? w
          : w[0].toUpperCase() + w.slice(1),
    )
    .join(" ")
}

// Extract the raw model identifier (path-style or display-name, whatever the
// backend stored) without prettifying. This is what gets matched against the
// model registry; the registry response carries the friendly display name.
function extractRawModelId(item: MediaItem): string | undefined {
  const m: any = item.metadata || {}
  const top: any = item
  const tryField = (v: any): string | undefined => {
    if (!v) return undefined
    if (typeof v === "string") return v
    if (typeof v === "object") return v.identifier || v.id || v._id || v.name || v.displayName
    return undefined
  }
  const trained = tryField(m.trainedModelName)
  if (trained) return trained
  if (typeof m.modelName === "string" && m.modelName) return m.modelName
  if (typeof m.metadata?.modelName === "string" && m.metadata.modelName) return m.metadata.modelName
  const s3m = m.s3Metadata
  if (s3m && typeof s3m === "object") {
    const v = s3m.model || s3m.Model || s3m.modelname || s3m.modelName
    if (typeof v === "string" && v) return v
  }
  if (typeof s3m === "string" && s3m) return s3m
  const s3t = m.s3Tags
  if (s3t && typeof s3t === "object") {
    const v = s3t["Model"] || s3t.Model || s3t["Model-Name"] || s3t["model-name"]
    if (typeof v === "string" && v) return v
  }
  const metaModel = tryField(m.model) || m.model_id
  if (metaModel) return metaModel
  return tryField(top.model) || tryField(top.generationModel) || tryField(m.generationModel)
}

// Mirrors the priority chain kolbo-map's ModelBadge uses in
// `extractModelName()` (UnifiedMediaCard / ModelBadge.tsx). Most backend
// items don't set `metadata.modelName` directly — the identifier lives in
// `metadata.model`, `s3Metadata.model`, `s3Tags["Model"]`, `generationModel`,
// or on the top-level item. Without the MongoDB model registry we can't
// resolve identifiers to friendly display names; we just prettify the raw id.
function extractMediaModelName(item: MediaItem): string | undefined {
  const m: any = item.metadata || {}
  const top: any = item

  const tryField = (v: any): string | undefined => {
    if (!v) return undefined
    if (typeof v === "string") return v
    if (typeof v === "object") {
      return v.name || v.displayName || v.identifier || v.id || v._id
    }
    return undefined
  }

  // 1. trainedModelName (training lab)
  const trained = tryField(m.trainedModelName)
  if (trained) return trained
  // 2. metadata.modelName (display name)
  if (typeof m.modelName === "string" && m.modelName) return m.modelName
  // 2b. nested metadata.metadata.modelName
  if (typeof m.metadata?.modelName === "string" && m.metadata.modelName) return m.metadata.modelName
  // 3. s3Metadata.model / modelname / modelName
  const s3m = m.s3Metadata
  if (s3m && typeof s3m === "object") {
    const v = s3m.model || s3m.Model || s3m.modelname || s3m.modelName
    if (typeof v === "string" && v) return prettifyModelId(v)
  }
  if (typeof s3m === "string" && s3m) return prettifyModelId(s3m)
  // 4. s3Tags['Model'] / 'Model-Name'
  const s3t = m.s3Tags
  if (s3t && typeof s3t === "object") {
    const v = s3t["Model"] || s3t.Model || s3t["Model-Name"] || s3t["model-name"]
    if (typeof v === "string" && v) return prettifyModelId(v)
  }
  // 5. metadata.model (string or object)
  const metaModel = tryField(m.model) || m.model_id
  if (metaModel) return prettifyModelId(metaModel)
  // 6. item.model / item.generationModel / metadata.generationModel
  const direct = tryField(top.model) || tryField(top.generationModel) || tryField(m.generationModel)
  if (direct) return prettifyModelId(direct)
  return undefined
}

function buildQuery(filters: {
  projectId: string
  type: TypeFilter
  category: CategoryFilter
  folderId: string | null
  page: number
  pageSize: number
}): string {
  const p = new URLSearchParams()
  if (filters.projectId && filters.projectId !== "all") p.set("project_id", filters.projectId)
  if (filters.folderId) p.set("folder_id", filters.folderId)
  if (filters.type !== "all") p.set("type", filters.type)
  if (filters.category !== "all") p.set("category", filters.category)
  p.set("page", String(filters.page))
  p.set("page_size", String(filters.pageSize))
  return p.toString()
}

// Viewport-based page size — ported from kolbo-desktop's main.js:1986-1989.
// Loads enough to fill viewport + 2-row buffer, not a fixed 50.
function viewportPageSize(): number {
  if (typeof window === "undefined") return 24
  const itemsPerRow = Math.max(2, Math.floor(window.innerWidth / 220))
  const rowsVisible = Math.ceil(window.innerHeight / 200)
  return Math.min(96, Math.max(16, itemsPerRow * (rowsVisible + 2)))
}

export function CanvasLibraryView(props: { sessionID: Accessor<string | undefined> }) {
  const lang = useLanguage()
  const server = useServer()
  const ops = usePlatformOps()
  const { view } = useSessionLayout()
  const cols = createMemo(() => view().canvas.gridCols())
  // Absolute sidecar URL. In `bun tauri dev` the WebView is served by Vite on
  // :1420, which doesn't proxy `/global/*` to the opencode sidecar (different
  // port). Relative fetches 404. Always prefix with the sidecar base.
  const serverBase = createMemo(() => server.current?.http.url ?? "")

  const [projectId, setProjectId] = createSignal<string>(
    typeof localStorage !== "undefined" ? localStorage.getItem(PROJECT_LS_KEY) ?? "all" : "all",
  )
  const [type, setType] = createSignal<TypeFilter>("all")
  const [category, setCategory] = createSignal<CategoryFilter>("all")
  // Folders intentionally removed from v1 — UX wasn't ready.
  const folderId = () => null as string | null

  const persistProject = (id: string) => {
    setProjectId(id)
    try {
      localStorage.setItem(PROJECT_LS_KEY, id)
    } catch {}
  }

  const [projects] = createResource(serverBase, (base) => (base ? loadProjects(base) : Promise.resolve([] as Project[])))
  const [registry] = createResource(serverBase, (base) =>
    base ? loadModelRegistry(base) : Promise.resolve(indexRegistry([], "")),
  )

  // Filters tuple — any change resets pagination and replaces the page list.
  // serverBase is included so the fetch re-fires once the sidecar URL is
  // resolved (Solid contexts populate asynchronously — first render may see
  // serverBase()="" which would fall through to Vite's SPA fallback returning
  // index.html instead of JSON).
  const filtersKey = createMemo(() =>
    JSON.stringify({
      base: serverBase(),
      projectId: projectId(),
      type: type(),
      category: category(),
      folderId: folderId(),
    }),
  )

  const [pages, setPages] = createSignal<MediaItem[][]>([])
  const [page, setPage] = createSignal(1)
  const [hasNext, setHasNext] = createSignal(false)
  const [loading, setLoading] = createSignal(false)
  const [loadingMore, setLoadingMore] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)
  const [signedOut, setSignedOut] = createSignal(false)
  let emptyResponseCount = 0
  let lastLoadAt = 0
  let inFlight: AbortController | undefined

  // Optimistic favorite-state overrides — applied on top of server values
  // so the star flips instantly on click and rolls back on error.
  const [favoriteOverrides, setFavoriteOverrides] = createSignal<Record<string, boolean>>({})
  const isFavorited = (item: MediaItem) => favoriteOverrides()[item.id] ?? !!item.is_favorited

  // Per-session NSFW reveal tracking — not persisted, resets on reload.
  const [revealedNsfw, setRevealedNsfw] = createSignal<Set<string>>(new Set())
  const reveal = (id: string) =>
    setRevealedNsfw((prev) => {
      if (prev.has(id)) return prev
      const next = new Set(prev)
      next.add(id)
      return next
    })

  async function fetchPage(append: boolean, retryCount = 0) {
    const base = serverBase()
    if (!base) {
      // Server context not yet resolved (or no sidecar). filtersKey includes
      // base, so this will re-trigger as soon as serverBase populates. Bail
      // out silently — no error toast, no loading spinner.
      return
    }
    const now = Date.now()
    if (append && now - lastLoadAt < SCROLL_COOLDOWN_MS) return
    if (append && page() >= MAX_PAGES_LIMIT) return
    if (inFlight) inFlight.abort()
    inFlight = new AbortController()
    lastLoadAt = now
    const target = append ? page() + 1 : 1
    if (!append) {
      setLoading(true)
      setError(null)
      setSignedOut(false)
      emptyResponseCount = 0
    } else {
      setLoadingMore(true)
    }
    try {
      // Favorites use a dedicated endpoint (mirrors kolbo-map). /v1/media?
      // category=favorites collides with project_id semantics; /favorite-items
      // is the canonical path. We map FavoriteItem → MediaItem locally.
      const isFavorites = category() === "favorites"
      const isTrash = category() === "trash"
      let fetchUrl: string
      if (isTrash) {
        const tp = new URLSearchParams()
        tp.set("page", String(target))
        tp.set("pageSize", String(viewportPageSize()))
        fetchUrl = `${base}/global/kolbo-trash?${tp.toString()}`
      } else if (isFavorites) {
        const fp = new URLSearchParams()
        // One call per request — when type=all and on favorites, the backend
        // returns all media types for that user. Pass item_type only when
        // a specific type is selected.
        if (type() !== "all") fp.set("item_type", type())
        const pid = projectId()
        if (pid && pid !== "all") fp.set("project_id", pid)
        fp.set("limit", "1000")
        fetchUrl = `${base}/global/kolbo-favorites?${fp.toString()}`
      } else {
        const qs = buildQuery({
          projectId: projectId(),
          type: type(),
          category: category(),
          folderId: folderId(),
          page: target,
          pageSize: viewportPageSize(),
        })
        fetchUrl = `${base}/global/kolbo-media?${qs}`
      }
      const res = await fetch(fetchUrl, {
        signal: inFlight.signal,
        headers: { Accept: "application/json" },
      })
      // Defensive: if Content-Type isn't JSON, the request landed on the wrong
      // server (e.g. Vite's SPA fallback returning index.html with 200). Treat
      // as a respawn-window error and retry once.
      const ct = res.headers.get("content-type") || ""
      if (res.ok && !ct.includes("json")) {
        throw new Error(`Got ${ct || "non-JSON"} from ${fetchUrl} — wrong origin`)
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        if (res.status === 401 || body?.error?.type === "auth") {
          setSignedOut(true)
          setPages([])
          setHasNext(false)
          return
        }
        throw new Error(body?.error?.message ?? `HTTP ${res.status}`)
      }
      let items: MediaItem[]
      let nextHasNext: boolean
      if (isTrash) {
        // /media/db/trash response shape: { data: { items: TrashItem[], pagination: {...} } }
        // TrashItem has shape similar to MediaItem but lives in a separate collection.
        const data = (await res.json()) as {
          data?: { items?: any[]; pagination?: { hasMore?: boolean; has_next?: boolean; totalItems?: number } }
        }
        const raw = data.data?.items ?? []
        items = raw
          .filter((f: any) => {
            const t = f.type || f.mediaType
            if (type() !== "all" && t !== type()) return false
            return t === "image" || t === "video" || t === "audio"
          })
          .map((f: any) => ({
            id: f._id || f.id,
            url: f.url || f.cdnUrl,
            thumbnail_url: f.thumbnail_url || f.metadata?.thumbnail_url,
            type: (f.type || f.mediaType) as "image" | "video" | "audio",
            source_type: f.source_type || f.sourceType,
            prompt: f.prompt || f.metadata?.prompt,
            filename: f.filename,
            created_at: f.created_at || f.createdAt,
            width: f.width ?? f.metadata?.width,
            height: f.height ?? f.metadata?.height,
            duration: f.duration ?? f.metadata?.duration,
            metadata: f.metadata,
          }))
        nextHasNext = data.data?.pagination?.hasMore ?? data.data?.pagination?.has_next ?? false
      } else if (isFavorites) {
        const data = (await res.json()) as {
          data?: { favorites?: FavoriteItemRaw[]; pagination?: Pagination }
          favorites?: FavoriteItemRaw[]
          pagination?: Pagination
        }
        const raw = data.data?.favorites ?? data.favorites ?? []
        items = raw
          .filter((f) => f.mediaType === "image" || f.mediaType === "video" || f.mediaType === "audio")
          .map((f) => ({
            id: f.id,
            url: f.url,
            thumbnail_url: f.metadata?.thumbnail_url,
            type: f.mediaType as "image" | "video" | "audio",
            is_favorited: true,
            source_type: f.sourceType,
            prompt: f.metadata?.prompt,
            created_at: f.createdAt,
            width: f.width ?? f.metadata?.width,
            height: f.height ?? f.metadata?.height,
            duration: f.duration ?? f.metadata?.duration,
            metadata: f.metadata,
          }))
        // /favorite-items returns everything up to limit (1000). Treat single
        // response as the full result — no second-page fetch.
        nextHasNext = false
      } else {
        const data = (await res.json()) as { media?: MediaItem[]; pagination?: Pagination }
        items = data.media ?? []
        nextHasNext = data.pagination?.has_next ?? false
      }
      if (append) {
        if (items.length === 0 && nextHasNext) {
          emptyResponseCount++
          if (emptyResponseCount >= MAX_EMPTY_RESPONSES) {
            setHasNext(false)
            return
          }
        } else {
          emptyResponseCount = 0
        }
        setPages((prev) => [...prev, items])
        setPage(target)
      } else {
        setPages([items])
        setPage(1)
      }
      setHasNext(nextHasNext)
    } catch (e) {
      if ((e as Error).name === "AbortError") return
      // The sidecar binary occasionally Bun-panics and is auto-respawned by
      // the Tauri shell within ~2-3s. Network errors that happen exactly in
      // that window manifest as TypeError: network error / ERR_CONNECTION_RESET.
      // Single silent retry covers the respawn window.
      const msg = (e as Error).message || ""
      const looksLikeRespawn =
        (e as Error).name === "TypeError" ||
        (e as Error).name === "SyntaxError" ||
        /network error|connection (reset|refused)|fetch failed|wrong origin|is not valid JSON/i.test(msg)
      if (looksLikeRespawn && retryCount === 0) {
        await new Promise((r) => setTimeout(r, 2500))
        return fetchPage(append, 1)
      }
      setError(msg)
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }

  // Reset + fetch whenever filters change. createEffect runs eagerly on
  // mount AND whenever any tracked signal in filtersKey changes — so the
  // fetch retries automatically the moment serverBase populates, which
  // arrives a tick after mount.
  let lastKey = ""
  createEffect(() => {
    const k = filtersKey()
    if (k === lastKey) return
    lastKey = k
    setPage(1)
    setPages([])
    void fetchPage(false)
  })

  onCleanup(() => {
    if (inFlight) inFlight.abort()
  })

  async function toggleFavorite(item: MediaItem) {
    const current = isFavorited(item)
    const next = !current
    setFavoriteOverrides((prev) => ({ ...prev, [item.id]: next }))
    // When viewing the Favorites tab, unfavoriting should immediately drop
    // the item from the visible grid (the server-side list would no longer
    // include it). Snapshot the prior pages so we can roll back on error.
    const dropFromList = !next && category() === "favorites"
    const priorPages = dropFromList ? pages() : null
    if (dropFromList) {
      setPages((prev) => prev.map((p) => p.filter((it) => it.id !== item.id)))
    }
    try {
      const base = serverBase()
      if (!base) throw new Error("sidecar URL unavailable")
      const res = await fetch(`${base}/global/kolbo-media/${encodeURIComponent(item.id)}/favorite`, {
        method: next ? "POST" : "DELETE",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
    } catch (e) {
      // Roll back the optimistic flip + the removal from Favorites grid.
      setFavoriteOverrides((prev) => ({ ...prev, [item.id]: current }))
      if (priorPages) setPages(priorPages)
      showToast({
        variant: "error",
        title: next ? lang.t("canvas.library.favorite.add") : lang.t("canvas.library.favorite.remove"),
        description: (e as Error).message,
      })
    }
  }

  // Batch action: download every selected item. Mirrors session-canvas's
  // downloadAllSelected — uses platform's downloadFile when available, else
  // falls back to opening each URL in a new tab. Toast surfaces "Open in
  // folder" + "Change folder" actions when the platform supports them.
  const [batchDownloading, setBatchDownloading] = createSignal(false)
  const selectedItems = (): MediaItem[] => {
    const ids = librarySelected()
    if (ids.size === 0) return []
    return items().filter((it) => ids.has(it.id))
  }
  const downloadSelected = async () => {
    if (batchDownloading()) return
    const list = selectedItems()
    if (list.length === 0) return
    setBatchDownloading(true)
    let saved = 0
    let failed = 0
    const savedPaths: string[] = []
    try {
      if (ops.downloadFile) {
        const results = await Promise.allSettled(list.map((it) => ops.downloadFile!(it.url)))
        for (const r of results) {
          if (r.status === "fulfilled") {
            savedPaths.push(r.value)
            saved++
          } else failed++
        }
      } else {
        const open = ops.openLink ?? ((u: string) => window.open(u, "_blank", "noopener,noreferrer"))
        for (const it of list) {
          try {
            open(it.url)
            saved++
          } catch {
            failed++
          }
        }
      }
    } finally {
      setBatchDownloading(false)
    }
    const toastActions: { label: string; onClick: () => void }[] = []
    const lastPath = savedPaths[savedPaths.length - 1]
    if (lastPath && ops.revealFile)
      toastActions.push({ label: lang.t("ui.download.openInFolder"), onClick: () => void ops.revealFile!(lastPath) })
    if (ops.changeDownloadFolder)
      toastActions.push({ label: lang.t("ui.download.changeFolder"), onClick: () => void ops.changeDownloadFolder!() })
    showToast({
      variant: failed > 0 ? "error" : "success",
      icon: failed > 0 ? undefined : "circle-check",
      title:
        failed > 0
          ? lang.t("canvas.downloadSelected.partialFailed", { count: failed })
          : lang.t("canvas.downloadSelected.toast", { count: saved }),
      description:
        saved > 0 && failed === 0
          ? lang.t("canvas.downloadSelected.toastDescription", { count: saved })
          : undefined,
      actions: toastActions.length > 0 ? toastActions : undefined,
    })
    clearLibrarySelection()
  }

  // Delete media (single or batch) — sends items to Trash. Single hits
  // DELETE /media/files/:id; batch hits POST /media/files/bulk/delete with
  // { fileIds: [...] }. Both via the sidecar proxy. Optimistic remove with
  // rollback on failure.
  const [batchDeleting, setBatchDeleting] = createSignal(false)
  const deleteSelected = async () => {
    if (batchDeleting()) return
    const list = selectedItems()
    if (list.length === 0) return
    setBatchDeleting(true)
    const priorPages = pages()
    const ids = list.map((it) => it.id)
    const idSet = new Set(ids)
    setPages((prev) => prev.map((p) => p.filter((it) => !idSet.has(it.id))))
    let ok = false
    try {
      const base = serverBase()
      if (!base) throw new Error("sidecar URL unavailable")
      const res = await fetch(`${base}/global/kolbo-media/bulk/delete`, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ fileIds: ids }),
      })
      ok = res.ok
    } catch {
      ok = false
    } finally {
      setBatchDeleting(false)
    }
    if (!ok) {
      setPages(priorPages)
      showToast({ variant: "error", title: "Delete failed" })
    } else {
      showToast({ variant: "success", icon: "circle-check", title: `Moved ${list.length} item(s) to Trash` })
    }
    clearLibrarySelection()
  }
  const deleteSingle = async (item: MediaItem) => {
    const priorPages = pages()
    setPages((prev) => prev.map((p) => p.filter((it) => it.id !== item.id)))
    try {
      const base = serverBase()
      if (!base) throw new Error("sidecar URL unavailable")
      const res = await fetch(`${base}/global/kolbo-media/${encodeURIComponent(item.id)}`, {
        method: "DELETE",
        headers: { Accept: "application/json" },
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
    } catch {
      setPages(priorPages)
      showToast({ variant: "error", title: "Delete failed" })
    }
  }

  // Restore (from Trash). Single only — backend doesn't expose a bulk restore.
  const [batchRestoring, setBatchRestoring] = createSignal(false)
  const restoreOne = async (item: MediaItem): Promise<boolean> => {
    const base = serverBase()
    if (!base) return false
    try {
      const res = await fetch(`${base}/global/kolbo-media/${encodeURIComponent(item.id)}/restore`, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
      })
      return res.ok
    } catch {
      return false
    }
  }
  const restoreSelected = async () => {
    if (batchRestoring()) return
    const list = selectedItems()
    if (list.length === 0) return
    setBatchRestoring(true)
    const priorPages = pages()
    const ids = new Set(list.map((it) => it.id))
    setPages((prev) => prev.map((p) => p.filter((it) => !ids.has(it.id))))
    let failed = 0
    try {
      const results = await Promise.allSettled(list.map((it) => restoreOne(it)))
      for (const r of results) if (r.status !== "fulfilled" || !r.value) failed++
    } finally {
      setBatchRestoring(false)
    }
    if (failed > 0) {
      setPages(priorPages)
      showToast({ variant: "error", title: "Restore failed", description: `${failed} of ${list.length} item(s) couldn't be restored` })
    } else {
      showToast({ variant: "success", icon: "circle-check", title: `Restored ${list.length} item(s)` })
    }
    clearLibrarySelection()
  }

  // IntersectionObserver sentinel for infinite scroll. The sentinel element
  // lives inside a <Match when={items().length > 0}> branch, so it doesn't
  // exist at component mount — only after the first page loads. Using a
  // signal-backed ref + createEffect lets the observer attach the moment
  // the sentinel mounts (and re-attach if the items list ever empties + repopulates).
  const [sentinelEl, setSentinelEl] = createSignal<HTMLDivElement | null>(null)
  createEffect(() => {
    const el = sentinelEl()
    if (!el || typeof IntersectionObserver === "undefined") return
    let scrollDebounceTimer: ReturnType<typeof setTimeout> | undefined
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue
          if (loading() || loadingMore() || !hasNext()) continue
          if (scrollDebounceTimer) clearTimeout(scrollDebounceTimer)
          scrollDebounceTimer = setTimeout(() => void fetchPage(true), SCROLL_DEBOUNCE_MS)
        }
      },
      { rootMargin: SENTINEL_ROOT_MARGIN },
    )
    io.observe(el)
    onCleanup(() => {
      io.disconnect()
      if (scrollDebounceTimer) clearTimeout(scrollDebounceTimer)
    })
  })

  // Flat row-major distribution into N columns — matches the masonry shape
  // Session mode uses, so the visual feel is identical.
  const items = createMemo(() => pages().flat())
  const columnBuckets = createMemo<MediaItem[][]>(() => {
    const n = Math.max(1, cols())
    const all = items()
    const buckets: MediaItem[][] = Array.from({ length: n }, () => [])
    for (let i = 0; i < all.length; i++) buckets[i % n].push(all[i])
    return buckets
  })

  const projectName = createMemo(() => {
    const id = projectId()
    if (id === "all") return lang.t("canvas.library.project.all")
    const found = projects()?.find((p) => p._id === id)
    return found?.name || found?.title || lang.t("canvas.library.project.pick")
  })

  return (
    <div class="flex flex-col h-full overflow-hidden">
      <style>{`
        .kolbo-fav-btn:hover svg[stroke="rgba(255,255,255,0.85)"] {
          stroke: #fbbf24;
          filter: drop-shadow(0 0 3px rgba(251, 191, 36, 0.4));
        }
      `}</style>
      {/* Header — swaps between filter rows (idle) and batch action bar.
          Matches the visual language of session-canvas's main toolbar so
          users get an identical UX regardless of which tab they're on. */}
      <Show
        when={libraryBatchMode() || librarySelected().size > 0}
        fallback={
          <div class="px-3 pt-2 pb-2 flex flex-col gap-2 border-b border-border-base">
            {/* Row 2: project picker */}
            <div class="flex items-center gap-2">
          <select
            class="text-12-regular bg-surface-base border border-border-base rounded-md px-2 py-1 max-w-full truncate"
            value={projectId()}
            onChange={(e) => persistProject(e.currentTarget.value)}
            aria-label={lang.t("canvas.library.project.pick")}
            title={projectName()}
          >
            <option value="all">{lang.t("canvas.library.project.all")}</option>
            <For each={projects() ?? []}>
              {(p) => <option value={p._id}>{p.name || p.title || p._id}</option>}
            </For>
          </select>
        </div>
        {/* Row 3: type + category chips + folder */}
        <div class="flex items-center gap-1 overflow-x-auto" role="group">
          <div role="radiogroup" aria-label="Type" class="flex items-center gap-0.5">
            <For each={TYPE_OPTIONS}>
              {(opt) => (
                <button
                  type="button"
                  role="radio"
                  aria-checked={type() === opt}
                  onClick={() => setType(opt)}
                  class="text-11-regular px-2 py-0.5 rounded-md transition-colors whitespace-nowrap inline-flex items-center gap-1"
                  classList={{
                    "text-text-strong underline underline-offset-4 decoration-1": type() === opt,
                    "text-text-weak hover:text-text-base": type() !== opt,
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true">{ICON_PATHS.type[opt]}</svg>
                  {lang.t(("canvas.library.filter.type." + (opt === "image" ? "images" : opt === "video" ? "videos" : opt)) as any)}
                </button>
              )}
            </For>
          </div>
          <span class="w-px h-3 bg-border-base mx-1" aria-hidden="true" />
          <div role="radiogroup" aria-label="Category" class="flex items-center gap-0.5">
            <For each={CATEGORY_OPTIONS}>
              {(opt) => (
                <button
                  type="button"
                  role="radio"
                  aria-checked={category() === opt}
                  onClick={() => setCategory(opt)}
                  class="text-11-regular px-2 py-0.5 rounded-md transition-colors whitespace-nowrap inline-flex items-center gap-1"
                  classList={{
                    "text-text-strong underline underline-offset-4 decoration-1": category() === opt,
                    "text-text-weak hover:text-text-base": category() !== opt,
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true">{ICON_PATHS.category[opt]}</svg>
                  {lang.t(("canvas.library.filter.category." + opt) as any)}
                </button>
              )}
            </For>
          </div>
        </div>
          </div>
        }
      >
        {/* Batch action bar — mirrors session-canvas's toolbar in batch state.
            Left: X to exit + count.  Right: Clear · Delete · Download. */}
        <div
          class="flex items-center justify-between px-4 py-2.5 gap-3 border-b border-border-base"
          style="background:color-mix(in srgb, var(--background-base) 85%, transparent);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)"
        >
          <div class="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={() => clearLibrarySelection()}
              title={lang.t("canvas.cancelSelection")}
              aria-label={lang.t("canvas.cancelSelection")}
              class="flex items-center justify-center transition-colors hover:bg-background-stronger"
              style="width:22px;height:22px;border-radius:6px;background:transparent;color:var(--text-weak)"
            >
              <Icon name="close" size="small" />
            </button>
            <span class="text-text-strong" style="font-size:12px;font-weight:600;letter-spacing:-0.005em">
              {lang.t("canvas.selected.count", { count: librarySelected().size })}
            </span>
          </div>

          <div class="flex items-center gap-1">
            <Show when={librarySelected().size > 0}>
              <button
                type="button"
                onClick={() => clearLibrarySelection()}
                disabled={batchDownloading() || batchDeleting()}
                class="transition-colors hover:text-text-base disabled:opacity-50"
                style="height:24px;padding:0 8px;border-radius:6px;background:transparent;color:var(--text-weak);font-size:11px;font-weight:500"
              >
                {lang.t("canvas.clearSelection")}
              </button>
            </Show>
            <Show when={librarySelected().size > 0 && category() === "trash"}>
              <button
                type="button"
                disabled={batchDownloading() || batchRestoring()}
                onClick={() => void restoreSelected()}
                class="flex items-center justify-center transition-colors hover:text-text-base disabled:opacity-50"
                style="height:24px;padding:0 10px;border-radius:6px;background:transparent;color:var(--text-weak);font-size:11px;font-weight:500;display:inline-flex;gap:6px;align-items:center"
                title="Restore selected"
              >
                <Show
                  when={batchRestoring()}
                  fallback={<Icon name="reset" size="small" />}
                >
                  <span aria-hidden="true" style="display:inline-block;width:11px;height:11px;border-radius:50%;border:1.5px solid currentColor;border-top-color:transparent;animation:kolbo-spin 0.85s linear infinite" />
                </Show>
                Restore
              </button>
            </Show>
            <Show when={librarySelected().size > 0 && category() !== "trash"}>
              <button
                type="button"
                disabled={batchDownloading() || batchDeleting()}
                onClick={() => void deleteSelected()}
                class="flex items-center justify-center transition-colors hover:text-text-base disabled:opacity-50"
                style="height:24px;padding:0 10px;border-radius:6px;background:transparent;color:var(--text-weak);font-size:11px;font-weight:500;display:inline-flex;gap:6px;align-items:center"
                title="Delete selected"
              >
                <Show
                  when={batchDeleting()}
                  fallback={<Icon name="trash" size="small" />}
                >
                  <span
                    aria-hidden="true"
                    style="display:inline-block;width:11px;height:11px;border-radius:50%;border:1.5px solid currentColor;border-top-color:transparent;animation:kolbo-spin 0.85s linear infinite"
                  />
                </Show>
                Delete
              </button>
            </Show>
            <button
              type="button"
              disabled={librarySelected().size === 0 || batchDownloading() || batchDeleting()}
              onClick={() => void downloadSelected()}
              class="flex items-center justify-center transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110"
              style="height:24px;padding:0 10px;border-radius:6px;background:var(--surface-info-base);color:var(--text-on-info-base, #fff);font-size:11px;font-weight:600;letter-spacing:0.01em;display:inline-flex;gap:6px;align-items:center;box-shadow:0 1px 2px color-mix(in srgb, var(--surface-info-base) 30%, transparent), 0 4px 10px color-mix(in srgb, var(--surface-info-base) 22%, transparent)"
            >
              <Show
                when={batchDownloading()}
                fallback={<Icon name="download" size="small" />}
              >
                <span
                  aria-hidden="true"
                  style="display:inline-block;width:11px;height:11px;border-radius:50%;border:1.5px solid currentColor;border-top-color:transparent;animation:kolbo-spin 0.85s linear infinite"
                />
              </Show>
              {lang.t("canvas.downloadSelected")}
            </button>
          </div>
        </div>
      </Show>

      {/* Body */}
      <div class="flex-1 overflow-y-auto px-3 py-3">
        <Switch>
          <Match when={signedOut()}>
            <div class="flex flex-col items-center justify-center h-full text-center gap-2 px-6">
              <div class="text-text-strong text-13-regular">{lang.t("canvas.library.signedOut")}</div>
            </div>
          </Match>
          <Match when={error()}>
            <div class="flex flex-col items-center justify-center h-full text-center gap-2 px-6">
              <div class="text-text-strong text-13-regular">{lang.t("canvas.library.error")}</div>
              <div class="text-text-weak text-11-regular max-w-full break-words">{error()}</div>
              <button
                type="button"
                onClick={() => void fetchPage(false)}
                class="mt-2 text-12-regular px-3 py-1 rounded-md bg-surface-info-base text-white"
              >
                {lang.t("canvas.library.retry")}
              </button>
            </div>
          </Match>
          <Match when={loading()}>
            <div
              class="flex flex-col items-center justify-center h-full gap-3"
              aria-busy="true"
              aria-live="polite"
            >
              <div class="relative flex items-center justify-center" style="width:56px;height:56px">
                <span
                  aria-hidden="true"
                  style="position:absolute;inset:0;border-radius:50%;border:2px solid color-mix(in srgb, var(--text-base) 12%, transparent);border-top-color:var(--text-base);animation:kolbo-spin 0.95s cubic-bezier(0.65,0,0.35,1) infinite"
                />
                <Mark class="w-7 h-7 opacity-90" />
              </div>
            </div>
          </Match>
          <Match when={items().length === 0}>
            <div class="flex flex-col items-center justify-center h-full text-center gap-2 px-6">
              <div class="text-text-strong text-13-regular">{lang.t("canvas.library.empty.title")}</div>
              <div class="text-text-weak text-11-regular">
                {type() !== "all" || category() !== "all" || folderId()
                  ? lang.t("canvas.library.empty.caption.filtered")
                  : lang.t("canvas.library.empty.caption.default")}
              </div>
            </div>
          </Match>
          <Match when={items().length > 0}>
            <div class="flex gap-3">
              <Index each={columnBuckets()}>
                {(bucket) => (
                  <div class="flex-1 min-w-0 flex flex-col gap-3">
                    <For each={bucket()}>{(item) => <LibraryCell item={item} isFavorited={isFavorited(item)} onToggleFavorite={() => void toggleFavorite(item)} revealed={revealedNsfw().has(item.id)} onReveal={() => reveal(item.id)} onDelete={() => void deleteSingle(item)} getSelectedUrls={() => selectedItems().map((it) => it.url)} registry={registry()} />}</For>
                  </div>
                )}
              </Index>
            </div>
            <div ref={setSentinelEl} class="h-8 flex items-center justify-center pt-4">
              <Show when={loadingMore()}>
                <span
                  aria-hidden="true"
                  style="display:inline-block;width:12px;height:12px;border-radius:50%;border:1.5px solid currentColor;border-top-color:transparent;animation:kolbo-spin 0.85s linear infinite;color:var(--text-weak)"
                />
              </Show>
            </div>
          </Match>
        </Switch>
      </div>
    </div>
  )
}

function LibraryCell(props: {
  item: MediaItem
  isFavorited: boolean
  onToggleFavorite: () => void
  revealed: boolean
  onReveal: () => void
  onDelete: () => void
  getSelectedUrls: () => string[]
  registry: RegistryData | undefined
}) {
  const lang = useLanguage()
  const m = props.item
  const previewSrc = createMemo(() => m.thumbnail_url || m.url)

  // For videos: only treat `thumbnail_url` as a real <img>-able poster if it
  // points to an actual image (webp/jpg/png/...). Sometimes the backend echoes
  // the video URL itself into thumbnail_url, which would render as a broken
  // image. Mirrors kolbo-map's `isVideoImageThumb` guard.
  const isImageThumb = (u: string | undefined): boolean =>
    !!(u && /\.(webp|jpg|jpeg|png|gif|avif)(\?|$)/i.test(u))
  const videoPoster = createMemo(() => {
    if (m.type !== "video") return undefined
    const t = m.thumbnail_url
    return isImageThumb(t) ? t : undefined
  })
  const [videoLoadFailed, setVideoLoadFailed] = createSignal(false)
  const [imageLoadFailed, setImageLoadFailed] = createSignal(false)
  const filename = m.filename || (m.prompt ? m.prompt.slice(0, 60) : m.id)
  const blurred = createMemo(() => m.nsfw_detected === true && !props.revealed)

  // Aspect ratio for the outer cell. When width/height are missing (older media,
  // backend not returning them), fall back to undefined so CSS leaves the cell
  // to flow naturally instead of forcing a wrong square.
  const aspectRatio = (() => {
    const w = m.width
    const h = m.height
    if (m.type === "audio") return undefined
    if (!w || !h || w <= 0 || h <= 0) return undefined
    return `${w} / ${h}`
  })()

  const durationLabel = m.duration && m.duration > 0 ? formatDurationSec(m.duration) : undefined

  // Audio label: prefer voice + provider for TTS, music style for music tracks,
  // fall back to prompt → filename → translated placeholder.
  const audioLabel = (() => {
    const md = m.metadata
    if (md?.voiceName) {
      const parts = [md.voiceName]
      if (md.voiceProvider) parts.push(md.voiceProvider)
      return parts.join(" · ")
    }
    if (md?.musicStyle) {
      return md.instrumentalMode ? `${md.musicStyle} · instrumental` : md.musicStyle
    }
    return m.prompt || m.filename || lang.t("canvas.library.empty.title")
  })()

  // Two-tier lookup: heavy /models registry first (covers image/video/audio
  // generation models — fal-ai/flux, bytedance/seedance, etc.), then the
  // shared KolboModels context (covers LLM ids that aren't in /models).
  // Both are memoized so the badge updates when either resource resolves.
  const rawModelId = extractRawModelId(m)
  const platformOpsForThumb = usePlatformOps()
  const kolboModels = useKolboModels()
  const resolved = createMemo(() => {
    if (!rawModelId) return {} as { name?: string; avatar?: string }
    const fromRegistry = props.registry ? resolveRegistryModel(rawModelId, props.registry) : {}
    if (fromRegistry.name || fromRegistry.avatar) return fromRegistry
    const fromContext = kolboModels.lookup(rawModelId)
    return fromContext
  })
  const modelName = createMemo(() => resolved().name || extractMediaModelName(m))
  const modelThumbnail = createMemo(() => {
    const raw = resolved().avatar || m.metadata?.modelThumbnail
    if (!raw) return undefined
    return platformOpsForThumb.imageProxyUrl?.(raw) ?? raw
  })

  const isSelected = createMemo(() => librarySelected().has(m.id))

  const openInLightbox = () => {
    if (libraryBatchMode()) {
      toggleLibrarySelected(m.id)
      return
    }
    if (blurred()) {
      props.onReveal()
      return
    }
    openKolboLightbox(m.url)
  }

  // Video state — local to each cell, mirrors session-canvas.tsx behavior.
  // `playing` = whether the user has clicked play (controls visible state).
  // `paused` = the <video> element's actual paused state — needed so the
  // hover overlay swaps the icon when the user pauses/plays via native controls.
  const [playing, setPlaying] = createSignal(false)
  const [paused, setPaused] = createSignal(false)
  let videoRef: HTMLVideoElement | undefined

  return (
    <div
      class="group relative rounded-xl overflow-hidden bg-background-base kolbo-canvas-cell"
      classList={{ "kolbo-canvas-cell-selected": isSelected() }}
      style={aspectRatio ? { "aspect-ratio": aspectRatio } : undefined}
      draggable={true}
      onDragStart={(e) => {
        if (!e.dataTransfer) return
        // If the user is in batch mode and this cell is among the selected,
        // drag the entire selection. Otherwise drag just this single URL.
        // text/uri-list is newline-separated per RFC 2483 — the existing drop
        // handler in attachments.ts splits on \n and short-circuits each http
        // URL to a by-reference attachment (no re-upload of bytes).
        const sel = librarySelected()
        const urls = sel.has(m.id) && sel.size > 1 ? props.getSelectedUrls() : [m.url]
        e.dataTransfer.setData("text/uri-list", urls.join("\n"))
        e.dataTransfer.setData("text/plain", urls.join("\n"))
        e.dataTransfer.effectAllowed = "copy"
      }}
      // Right-click → copy the public CDN URL. Audio cells in particular
      // had no other way to grab the link (the AudioWavePlayer intercepts
      // the native context menu). Override at the cell level so all media
      // kinds behave identically. In batch mode this copies the whole
      // selection separated by newlines.
      onContextMenu={(e) => {
        e.preventDefault()
        const sel = librarySelected()
        const urls = sel.has(m.id) && sel.size > 1 ? props.getSelectedUrls() : [m.url]
        const text = urls.join("\n")
        void navigator.clipboard
          .writeText(text)
          .then(() =>
            showToast({
              variant: "success",
              icon: "circle-check",
              title: "Link copied",
              description: urls.length > 1 ? `${urls.length} URLs` : undefined,
            }),
          )
          .catch(() => showToast({ variant: "error", title: "Couldn't copy link" }))
      }}
    >
      <MediaCard
        src={m.url}
        path={m.url}
        filename={filename}
        hideHoverButtons={m.type === "audio"}
        onRemove={() => props.onDelete()}
        removeLabel="Delete from library"
      >
        <Show when={m.type === "image"}>
          <button
            type="button"
            onClick={openInLightbox}
            aria-label={filename}
            class="block size-full p-0 m-0 border-0 bg-transparent cursor-zoom-in"
          >
            <Show
              when={!imageLoadFailed()}
              fallback={
                <div
                  style={{
                    display: "flex",
                    "align-items": "center",
                    "justify-content": "center",
                    width: "100%",
                    height: "100%",
                    background: "var(--surface-recess-base)",
                  }}
                >
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--text-weak)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <circle cx="9" cy="9" r="1.5" fill="currentColor" stroke="none" />
                    <path d="M3 17l5-5 4 4 3-3 6 6" />
                  </svg>
                </div>
              }
            >
              <img
                src={previewSrc()}
                alt={filename}
                loading="lazy"
                onError={() => setImageLoadFailed(true)}
                style={{
                  display: "block",
                  width: "100%",
                  height: "100%",
                  "object-fit": "cover",
                  background: "var(--surface-recess-base)",
                  filter: blurred() ? "blur(24px)" : "none",
                  transition: "transform 0.4s cubic-bezier(0.22,1,0.36,1), filter 0.2s ease",
                }}
                class="group-hover:scale-[1.03]"
              />
            </Show>
          </button>
        </Show>
        <Show when={m.type === "video"}>
          <Show
            when={playing()}
            children={
              // Playback state: video element with custom overlay on hover.
              // Clicking outside the center icon opens the lightbox; clicking
              // the icon pauses/plays inline. Native controls below remain
              // usable when the cursor is over the bottom edge.
              <div class="relative size-full">
                <video
                  ref={videoRef}
                  src={m.url}
                  autoplay
                  playsinline
                  controls
                  disablepictureinpicture
                  controlslist="nodownload nofullscreen noremoteplayback noplaybackrate"
                  onLoadedData={(e) => {
                    const v = e.currentTarget
                    v.muted = false
                    void v.play().catch(() => {
                      v.muted = true
                      void v.play().catch(() => {})
                    })
                  }}
                  onPlay={() => setPaused(false)}
                  onPause={() => setPaused(true)}
                  style={{
                    display: "block",
                    width: "100%",
                    height: "100%",
                    "object-fit": "cover",
                    background: "var(--surface-recess-base)",
                    filter: blurred() ? "blur(24px)" : "none",
                  }}
                />
                {/* Hover overlay — click outside the center icon → lightbox.
                    Bottom 56px reserved for the native controls so the
                    overlay doesn't swallow scrubber/volume/fullscreen clicks. */}
                <div
                  class="absolute inset-x-0 top-0 opacity-0 transition-opacity duration-150 hover:opacity-100 cursor-zoom-in"
                  style="bottom:56px"
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    openInLightbox()
                  }}
                >
                  <span
                    role="button"
                    tabindex={0}
                    aria-label={paused() ? "Play" : "Pause"}
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      const v = videoRef
                      if (!v) return
                      if (v.paused) void v.play().catch(() => {})
                      else v.pause()
                    }}
                    class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center transition-transform duration-150 ease-out hover:scale-110 cursor-pointer"
                    style="width:56px;height:56px;border-radius:50%;background:color-mix(in srgb, #000 55%, transparent);backdrop-filter:blur(4px);box-shadow:0 4px 18px color-mix(in srgb, #000 35%, transparent);border:1px solid color-mix(in srgb, #fff 18%, transparent)"
                  >
                    <Show
                      when={paused()}
                      fallback={
                        <svg width="20" height="20" viewBox="0 0 22 22" fill="#fff" aria-hidden="true">
                          <rect x="6" y="4" width="3.5" height="14" rx="1" />
                          <rect x="12.5" y="4" width="3.5" height="14" rx="1" />
                        </svg>
                      }
                    >
                      <svg width="22" height="22" viewBox="0 0 22 22" fill="#fff" style="margin-left:3px" aria-hidden="true">
                        <path d="M5 3.5v15l13-7.5L5 3.5Z" />
                      </svg>
                    </Show>
                  </span>
                </div>
              </div>
            }
            fallback={
              // Pre-play state — mirrors kolbo-map's UnifiedMediaCard:
              //   1. Always render <video preload="metadata"> so the browser
              //      fetches just enough bytes to decode the first frame, then
              //      we seek to currentTime=0 on `loadedmetadata` to display it.
              //   2. ONLY overlay an <img> on top when thumbnail_url is a real
              //      image (webp/jpg/png/...) — never use the video URL itself
              //      as an <img src>, which is what was producing the broken
              //      image icon. If the <img> 404s, hide it and fall back to
              //      the video's first frame underneath.
              //   3. Click the surface → lightbox; click the center play
              //      button → switch to playing state (full <video> + controls).
              <button
                type="button"
                onClick={openInLightbox}
                aria-label={filename}
                class="block size-full p-0 m-0 border-0 bg-transparent cursor-zoom-in relative"
              >
                <Show
                  when={!videoLoadFailed()}
                  fallback={
                    // Last-resort fallback when both the thumbnail image AND
                    // the <video> element fail to render — dark placeholder
                    // with a film icon so the cell isn't blank.
                    <div
                      style={{
                        display: "flex",
                        "align-items": "center",
                        "justify-content": "center",
                        width: "100%",
                        height: "100%",
                        background: "var(--surface-recess-base)",
                      }}
                    >
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--text-weak)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <rect x="2" y="4" width="20" height="16" rx="2" />
                        <path d="M2 9h4M2 15h4M18 9h4M18 15h4M7 4v16M17 4v16" />
                      </svg>
                    </div>
                  }
                >
                  <video
                    src={firstFramePosterSrc(m.url)}
                    poster={videoPoster()}
                    preload="metadata"
                    playsinline
                    muted
                    ref={(el) => pauseOnFirstFrame(el)}
                    onError={() => setVideoLoadFailed(true)}
                    style={{
                      display: "block",
                      width: "100%",
                      height: "100%",
                      "object-fit": "cover",
                      background: "var(--surface-recess-base)",
                      filter: blurred() ? "blur(24px)" : "none",
                    }}
                  />
                </Show>
                {/* Center play button — only this hit-area starts playback.
                    Clicks outside it bubble to the outer button → lightbox. */}
                <span
                  role="button"
                  tabindex={0}
                  aria-label={`Play ${filename}`}
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    if (blurred()) {
                      props.onReveal()
                      return
                    }
                    setPlaying(true)
                  }}
                  class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center transition-transform duration-150 ease-out hover:scale-110 cursor-pointer z-10"
                  style="width:56px;height:56px;border-radius:50%;background:color-mix(in srgb, #000 55%, transparent);backdrop-filter:blur(4px);box-shadow:0 4px 18px color-mix(in srgb, #000 35%, transparent);border:1px solid color-mix(in srgb, #fff 18%, transparent)"
                >
                  <svg width="22" height="22" viewBox="0 0 22 22" fill="#fff" style="margin-left:3px">
                    <path d="M5 3.5v15l13-7.5L5 3.5Z" />
                  </svg>
                </span>
              </button>
            }
          />
        </Show>
        <Show when={m.type === "audio"}>
          <div class="flex flex-col gap-1">
            <div
              class="text-text-strong text-11-regular truncate px-2 pt-1.5"
              title={audioLabel}
            >
              {audioLabel}
            </div>
            <AudioWavePlayer
              src={m.url}
              onDownload={() => {
                const a = document.createElement("a")
                a.href = m.url
                a.download = filename
                a.rel = "noopener noreferrer"
                a.target = "_blank"
                document.body.appendChild(a)
                a.click()
                document.body.removeChild(a)
              }}
            />
          </div>
        </Show>

        {/* NSFW reveal overlay (sits above the media; intercepts clicks until revealed) */}
        <Show when={blurred()}>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              props.onReveal()
            }}
            class="absolute inset-0 flex items-center justify-center bg-black/30 text-white text-11-regular cursor-pointer z-20"
          >
            <span class="px-2 py-1 rounded-md bg-black/60">{lang.t("canvas.library.nsfw.hidden")}</span>
          </button>
        </Show>

        {/* Batch-selection checkbox — top-right. Always visible in batch mode or
            when already selected; fades in on cell hover otherwise. */}
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            if (!libraryBatchMode()) setLibraryBatchMode(true)
            toggleLibrarySelected(m.id)
          }}
          aria-label={isSelected() ? "Deselect" : "Select"}
          aria-pressed={isSelected()}
          class="absolute top-2 left-2 z-20 flex items-center justify-center size-[22px] rounded-md transition-all duration-150"
          classList={{
            "opacity-100": libraryBatchMode() || isSelected(),
            "opacity-0 group-hover:opacity-100": !libraryBatchMode() && !isSelected(),
          }}
          style={isSelected()
            ? "background:var(--surface-info-base);color:var(--text-on-info-base, #fff);border:1px solid color-mix(in srgb, var(--surface-info-base) 50%, #fff);box-shadow:0 1px 2px rgba(0,0,0,0.06), 0 6px 14px color-mix(in srgb, var(--surface-info-base) 35%, transparent)"
            : "background:rgba(28,28,32,0.78);color:rgba(255,255,255,0.92);border:1px solid rgba(255,255,255,0.18);backdrop-filter:blur(8px) saturate(140%);-webkit-backdrop-filter:blur(8px) saturate(140%);box-shadow:0 1px 2px rgba(0,0,0,0.30), 0 6px 16px rgba(0,0,0,0.40)"}
        >
          <Show when={isSelected()}>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M3.5 8.5l3 3 6-6" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </Show>
        </button>

        {/* Favorite star — round dark-glass button, mirrors kolbo-map's
            FavoriteToggle (variant="overlay" → glass-play-btn). Star outline
            with white stroke when not favorited (hover → amber); fully filled
            yellow star when favorited. Always-on if favorited, hover-reveal
            otherwise. */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            props.onToggleFavorite()
          }}
          class="kolbo-fav-btn absolute top-2 left-[36px] z-10 flex items-center justify-center size-[28px] rounded-full transition-all duration-150"
          classList={{
            "opacity-100": props.isFavorited,
            "opacity-0 group-hover:opacity-100": !props.isFavorited,
          }}
          style="background:rgba(0,0,0,0.78);border:1px solid rgba(255,255,255,0.18);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);box-shadow:0 4px 16px rgba(0,0,0,0.4),0 1px 4px rgba(0,0,0,0.25),inset 0 1px 0 rgba(255,255,255,0.18)"
          title={props.isFavorited ? lang.t("canvas.library.favorite.remove") : lang.t("canvas.library.favorite.add")}
          aria-pressed={props.isFavorited}
        >
          <Show
            when={props.isFavorited}
            fallback={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.85)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
            }
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="#eab308" stroke="none">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
          </Show>
        </button>

        {/* Duration badge — bottom-left, video only.
            Audio cells already show duration inside the wave player. */}
        <Show when={durationLabel && m.type === "video"}>
          <div
            class="absolute bottom-2 left-2 z-10 text-11-regular px-1.5 py-0.5 rounded-md pointer-events-none transition-opacity duration-150"
            classList={{
              "opacity-100": libraryBatchMode(),
              "opacity-0 group-hover:opacity-100": !libraryBatchMode(),
            }}
            style="background:rgba(0,0,0,0.65);color:#fff;font-variant-numeric:tabular-nums;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)"
          >
            {durationLabel}
          </div>
        </Show>

        {/* Model badge — bottom-right, image + video only.
            Hidden until hover (or batch selection) so it doesn't clutter the grid. */}
        <Show when={modelName() && (m.type === "image" || m.type === "video")}>
          <div
            class="absolute bottom-2 right-2 z-10 flex items-center gap-1 text-11-regular px-1.5 py-0.5 rounded-md max-w-[70%] pointer-events-none transition-opacity duration-150"
            classList={{
              "opacity-100": libraryBatchMode(),
              "opacity-0 group-hover:opacity-100": !libraryBatchMode(),
            }}
            style="background:rgba(0,0,0,0.65);color:#fff;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)"
            title={modelName()}
          >
            <Show when={modelThumbnail()}>
              <img
                src={modelThumbnail()}
                alt=""
                aria-hidden="true"
                style="width:12px;height:12px;border-radius:3px;object-fit:cover;flex-shrink:0"
                referrerpolicy="no-referrer"
                onError={(e) => {
                  ;(e.currentTarget as HTMLImageElement).style.display = "none"
                }}
              />
            </Show>
            <span class="truncate">{modelName()}</span>
          </div>
        </Show>

      </MediaCard>
    </div>
  )
}
