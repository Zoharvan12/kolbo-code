import { Show, createEffect, createSignal, onCleanup, untrack } from "solid-js"
import { unwrap } from "solid-js/store"
import { useKolboModels } from "../context/kolbo-models"
import { usePlatformOps } from "../context/platform-ops"
import { read, type Operation } from "./kolbo-operation"
import { openKolboLightbox } from "./kolbo-media"

const GEN = "ui://kolbo/generation.html"

const BY_WIDGET: Record<string, string> = {
  generation: GEN,
  "media-grid": "ui://kolbo/media-grid.html",
  catalog: "ui://kolbo/catalog.html",
  transcript: "ui://kolbo/transcript.html",
  list: "ui://kolbo/list.html",
  upload: "ui://kolbo/upload.html",
}

const BY_TOOL: Record<string, string> = {
  list_sessions: BY_WIDGET.list,
  list_session_generations: BY_WIDGET.list,
  list_projects: BY_WIDGET.list,
  list_project_context: BY_WIDGET.list,
  list_agents: BY_WIDGET.list,
  list_docs: BY_WIDGET.list,
  list_media_folders: BY_WIDGET.list,
  list_visual_dna_folders: BY_WIDGET.list,
  list_models: BY_WIDGET.catalog,
  list_media: BY_WIDGET["media-grid"],
  list_presets: BY_WIDGET.list,
  list_voices: BY_WIDGET["media-grid"],
  list_visual_dnas: BY_WIDGET["media-grid"],
  list_moodboards: BY_WIDGET["media-grid"],
  list_color_palettes: BY_WIDGET["media-grid"],
  transcribe_audio: BY_WIDGET.transcript,
  media_upload_widget: BY_WIDGET.upload,
}

function rec(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object") return
  return value as Record<string, unknown>
}

function appUri(value: unknown): string | undefined {
  return typeof value === "string" && value.startsWith("ui://kolbo/") ? value : undefined
}

export function uri(meta?: Record<string, unknown>, tool?: string, data?: unknown) {
  const ui = rec(meta?.ui)
  const fromMeta =
    appUri(ui?.["ui/resourceUri"]) ||
    appUri(ui?.resourceUri) ||
    appUri(rec(ui?.ui)?.resourceUri) ||
    appUri(rec(ui?.ui)?.["ui/resourceUri"])
  if (fromMeta) return fromMeta
  const widget = rec(meta?.structuredContent)?.widget ?? rec(data)?.widget
  if (typeof widget === "string" && BY_WIDGET[widget]) return BY_WIDGET[widget]
  const toolName = bare(tool)
  // Named preset lookup (`search: "headless"`) is an id fetch — do not mount
  // the 70-tile catalog the user already rejected.
  if (toolName === "list_presets" && presetLookup(data)) return undefined
  if (BY_TOOL[toolName]) {
    // media-grid.html draws a thumbnail-less item as its media-kind icon, so a
    // payload we rebuilt from tool TEXT (no MCP structuredContent — see
    // gridRow) mounted a wall of identical file glyphs where the list widget
    // reads fine. Only downgrade once we can see the items and none has an
    // image; an absent payload still gets the mapped widget.
    if (BY_TOOL[toolName] === BY_WIDGET["media-grid"] && thumbless(data)) return BY_WIDGET.list
    return BY_TOOL[toolName]
  }
  if (toolName.startsWith("list_")) return BY_WIDGET.list
  // A status poll with no media yet is not a second generation card.
  if (statusTool(toolName)) {
    const urls = rec(data)?.urls
    if (!Array.isArray(urls) || urls.length === 0) return undefined
  }
  // Nothing else falls back to the generation card. generation.html boots as a
  // "Generating" spinner and only leaves it once an operation payload arrives,
  // so mounting it for a tool that will never produce one (chat_send_message,
  // get_media, upload_media…) pins a spinner on a result that is already final.
  if (generative(toolName)) return GEN
  return undefined
}

const IMAGE_URL = /\.(png|jpe?g|webp|gif|avif|svg)(\?|$)/i

/**
 * One compact-list row → the field names the widgets actually render.
 *
 * @kolbo/mcp only ships its hand-built grid payload to hosts that advertise
 * MCP Apps, and Kolbo Code doesn't — so tools like list_presets return the
 * compactList JSON instead, whose rows are `{id,name,category,type,…}`: no
 * `title`, no `thumbnail`. media-grid.html renders a missing thumbnail as the
 * media-kind icon, which is why the preset grid came out as 24 identical
 * file glyphs. Map whatever IS on the row; tools whose text carries no image
 * URL at all end up on the list widget instead (see uri()).
 */
export function gridRow(value: unknown) {
  const row = rec(value)
  if (!row) return value
  const pick = (...keys: string[]) => {
    for (const key of keys) {
      const found = row[key]
      if (typeof found === "string" && found) return found
    }
    return undefined
  }
  const url = pick("url")
  const thumbnail =
    pick("thumbnail", "thumbnail_url", "preview_url", "image_url") ?? (url && IMAGE_URL.test(url) ? url : undefined)
  return {
    ...row,
    ...(row.title ? {} : { title: pick("name", "filename", "title") }),
    ...(row.subtitle ? {} : { subtitle: pick("subtitle", "category", "description", "type") }),
    ...(thumbnail ? { thumbnail } : {}),
  }
}

/**
 * Text of a `ui/message` request. The bridge sends MCP-UI's
 * `{ role, content: [{ type: "text", text }] }`; a plain `{ text }` is accepted
 * too so an older or hand-rolled widget isn't silently dropped.
 */
export function messageText(params: unknown): string | undefined {
  const p = rec(params)
  if (!p) return undefined
  if (typeof p.text === "string" && p.text.trim()) return p.text
  const content = Array.isArray(p.content) ? p.content : []
  const joined = content
    .flatMap((item) => {
      const text = rec(item)?.text
      return typeof text === "string" ? [text] : []
    })
    .join("\n")
    .trim()
  return joined || undefined
}

function presetLookup(data: unknown) {
  const row = rec(data)
  if (!row) return false
  if (row._lookup === true || row.lookup === true) return true
  const items = row.items
  return Array.isArray(items) && items.length > 0 && items.length <= 6
}

/** Items are present, and not one of them has an image to show. */
function thumbless(data: unknown) {
  const items = rec(data)?.items
  if (!Array.isArray(items) || items.length === 0) return false
  return !items.some((item) => typeof rec(item)?.thumbnail === "string")
}

function bare(tool?: string) {
  const name = tool || ""
  if (name.startsWith("kolbo_")) return name.slice("kolbo_".length)
  if (name.startsWith("mcp__kolbo__")) return name.slice("mcp__kolbo__".length)
  return name
}

/**
 * Tool name → the model-catalog `type` that tool's models live under. The
 * envelope's `route` falls back to the TOOL name when the operation carries no
 * route of its own (kolbo-operation.ts), and a tool name is not a catalog type
 * — so byType("generate_image_edit") matched nothing and every in-progress card
 * printed a raw identifier next to a first-letter circle. Mirrors the `type`
 * each tool passes to canonicalModelId in kolbo-mcp's generate.js; a tool with
 * several candidate types lists them all and the first hit wins.
 */
const TOOL_TYPES: Record<string, string[]> = {
  generate_image: ["text_to_img"],
  generate_image_edit: ["image_editing"],
  edit_image: ["image_editing"],
  generate_video: ["text_to_video"],
  generate_video_from_image: ["img_to_video"],
  generate_video_from_video: ["video_to_video"],
  edit_video: ["video_to_video"],
  generate_elements: ["elements"],
  generate_first_last_frame: ["firstlastgenerations"],
  generate_lipsync: ["lipsync-image", "lipsync-video"],
  generate_music: ["music_gen"],
  generate_speech: ["text_to_speech"],
  generate_sound: ["text_to_sound"],
  generate_3d: ["3d_text_to_model", "3d_image_to_model", "3d_multi_image_to_model", "3d_world"],
  generate_creative_director: ["text_to_img", "text_to_video"],
}

export function catalogTypes(route: string, tool: string): string[] {
  const mapped = TOOL_TYPES[bare(tool)]
  if (mapped) return mapped
  // An operation that DID carry a real route keeps using it.
  return route ? [route] : []
}

/**
 * Status checks are follow-ups, not a second generation. While they are still
 * waiting they used to mount another full "Generating" card on top of the
 * original generate_* card (title "Kolbo Generations", kind defaulting to
 * image). Only show a result card once there is media to display.
 */
export function statusTool(tool?: string) {
  const name = bare(tool)
  return name === "get_generation_status" || name === "get_creative_director_status"
}

/**
 * In-progress payloads often have no urls yet, and lift() then defaults kind
 * to "image". Elements / lipsync / first-last-frame are video tools — the
 * picture-frame chip on those cards was that default, not the real output.
 */
export function kindFromTool(tool?: string): "image" | "video" | "audio" | "model3d" | undefined {
  const name = bare(tool)
  if (!name) return
  if (name.includes("3d")) return "model3d"
  if (/music|speech|sound/.test(name)) return "audio"
  if (/video|elements|lipsync|first_last_frame/.test(name)) return "video"
  if (name.includes("image")) return "image"
}

export function resolveKind(kind: string | undefined, tool?: string, urls?: string[]) {
  const first = (urls?.[0] || "").split("?")[0].toLowerCase()
  if (/\.(mp4|mov|webm|mkv)$/.test(first) || /video-elements-results|generated-videos/.test(first)) return "video"
  if (/\.(mp3|wav|m4a|aac|ogg|flac)$/.test(first)) return "audio"
  if (kind === "video" || kind === "audio" || kind === "model3d" || kind === "scenes" || kind === "3d") {
    return kind === "3d" ? "model3d" : kind === "scenes" ? "video" : kind
  }
  return kindFromTool(tool) || kind || "image"
}

const OWNED_HOST = /(?:^|\.)kolbo\.ai$|digitaloceanspaces\.com$/i

export function preferKolbo(urls: string[]) {
  const list = urls.filter((item) => typeof item === "string" && item)
  const ours = list.filter((item) => {
    try {
      return OWNED_HOST.test(new URL(item).hostname)
    } catch {
      return false
    }
  })
  return ours.length ? ours : list
}

/**
 * Separator-insensitive id match, the same leniency canonicalModelId applies
 * server-side. The card is built from the tool INPUT, where the model is
 * whatever the agent typed ("gpt-image-2"), while the catalog keys the editor
 * under its own identifier ("gpt-image-2/edit") — an exact match misses.
 */
function normId(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "")
}

export function matchModel<T extends { id: string; name?: string }>(models: T[], id: string): T | undefined {
  const want = normId(id)
  if (!want) return undefined
  return (
    models.find((m) => m.id === id) ??
    models.find((m) => normId(m.id) === want || normId(m.name ?? "") === want) ??
    models.find((m) => normId(m.id).startsWith(want))
  )
}

// Every input key across the generation tools that names media the user
// supplied. The card's own collectRefs() classifies each url by extension and
// dedups, so they can all arrive in one list.
const REF_INPUT_KEYS = [
  "source_images",
  "reference_images",
  "reference_videos",
  "reference_audio_urls",
  "additional_images",
  "image_url",
  "mask_image_url",
  "first_frame",
  "last_frame",
  "source",
  "source_video",
  "audio",
  "audio_url",
]

/**
 * References the generation was given, pulled off the tool input. The MCP ships
 * these itself, but only in the payload that lands when the tool RETURNS — on
 * this host the tool blocks for the whole generation, so the in-progress card is
 * ours alone and showed no thumbnails at all. Local paths are skipped: the
 * iframe can only load http(s).
 */
export function referenceUrls(input?: Record<string, unknown>): string[] {
  if (!input) return []
  const out: string[] = []
  for (const key of REF_INPUT_KEYS) {
    const value = input[key]
    for (const item of Array.isArray(value) ? value : [value]) {
      if (typeof item !== "string" || !/^https?:\/\//i.test(item)) continue
      if (!out.includes(item)) out.push(item)
    }
  }
  return out
}

/**
 * Tools that produce media, and so warrant a generation card before any result
 * exists. Tool-name routing lives here — the envelope reader stays name-free.
 */
export function generative(tool?: string): boolean {
  const name = bare(tool)
  return name.startsWith("generate_") || name === "edit_image" || name === "edit_video"
}

function listed(output?: string) {
  if (!output) return
  try {
    const obj = JSON.parse(output) as Record<string, unknown>
    if (Array.isArray(obj.items)) return { ...obj, items: obj.items.map(gridRow) }
    const key = (["sessions", "projects", "generations", "agents", "docs", "folders", "sources"] as const).find((name) =>
      Array.isArray(obj[name]),
    )
    if (!key) return
    const rows = obj[key] as Record<string, unknown>[]
    const titles: Record<string, string> = {
      sessions: "Sessions",
      projects: "Projects",
      generations: "Generations",
      agents: "Agents",
      docs: "Docs",
      folders: "Folders",
      sources: "Knowledge Base",
    }
    return {
      widget: "list",
      title: typeof obj.title === "string" ? obj.title : titles[key],
      items: rows.map((row) => {
        const types = Array.isArray(row.types)
          ? (row.types as unknown[]).filter((x): x is string => typeof x === "string")
          : String(row.type || "")
              .split("|")
              .filter(Boolean)
        const id = row.session_id || row.id || row.generation_id || row.file_key
        const prompt = typeof row.prompt === "string" ? row.prompt.slice(0, 80) : ""
        return {
          id,
          title: row.name || row.title || prompt || types[0] || "Item",
          subtitle: [
            types.join(", ") || row.role || row.status || row.description,
            id,
            row.project_id ? "project " + row.project_id : null,
            row.updated_at ? String(row.updated_at).slice(0, 10) : null,
            row.output_count ? String(row.output_count) + " outputs" : null,
          ]
            .filter(Boolean)
            .join(" · "),
          badge: types[0] || row.role || row.status,
        }
      }),
      total: rows.length,
    }
  } catch {
    return
  }
}

/**
 * The payload is postMessage'd into the widget iframe, and `metadata` / `input`
 * come straight off the session store — where every nested object is a Proxy.
 * Structured clone refuses a Proxy outright ("#<Object> could not be cloned"),
 * and that throw inside the push effect took the whole app down. unwrap() is
 * deep, so one call here covers structuredContent and the settings arrays alike.
 */
/**
 * Guaranteed structured-clone safety net for the widget postMessage payload.
 *
 * `structured()` already runs solid-js/store's `unwrap()`, but that unwrap is
 * only reliably deep when the value it is CALLED ON is plain: it recurses
 * through plain objects/arrays fine, but the moment it hits a value that is
 * ITSELF already a store Proxy, it returns that Proxy's raw value immediately
 * — without recursing into THAT raw's own children (solid-js/store/dist:
 * `if (result = item != null && item[$RAW]) return result;`, no further walk).
 * So a Proxy assigned two levels deep — e.g. withModelChip's `{ ...data,
 * model_name, model_icon }` spread, or a resolved Operation handed in from a
 * different store — survives. postMessage's structured-clone algorithm
 * refuses a Proxy outright ("DataCloneError: ... could not be cloned"), and
 * that throw inside the push effect took the whole app down.
 *
 * JSON is the actual proxy-stripper: JSON.stringify transparently forwards
 * every Proxy trap (get/ownKeys/…), so it can only ever emit plain values —
 * there is no way for a Proxy's identity to survive a JSON round-trip.
 */
export function serializeForWidget<T>(value: T): T | undefined {
  try {
    return JSON.parse(JSON.stringify(value)) as T
  } catch {
    return undefined
  }
}

export function structured(
  output?: string,
  metadata?: Record<string, unknown>,
  input?: Record<string, unknown>,
  tool?: string,
  resolved?: Operation,
) {
  const data = build(output, metadata, input, tool, resolved)
  return data && typeof data === "object" ? unwrap(data) : data
}

function build(
  output?: string,
  metadata?: Record<string, unknown>,
  input?: Record<string, unknown>,
  tool?: string,
  // A generation the card resolved by polling after the tool call gave up
  // waiting. It is newer than anything in output/metadata, so it wins.
  resolved?: Operation,
) {
  if (!resolved) {
    const fromMeta = metadata?.structuredContent
    if (fromMeta && typeof fromMeta === "object") return shaped(fromMeta, tool)
    const fromText = listed(output)
    if (fromText) return fromText
  }
  const op = resolved ?? read(output, metadata)
  if (!op) return
  const urls = preferKolbo(op.outputs.map((item) => item.url).filter(Boolean))
  return shaped({
    widget: "generation",
    // "review" is this app's own pre-flight envelope (describe(), sent before
    // the tool call even runs) — Kolbo Code auto-approves every tool call
    // (patterns:["*"]) and never shows a review/knobs UI, so the widget should
    // never see it. Left unmapped, it fell through the widget's phase switch
    // to the completed-result renderer with no media yet, flashing an
    // error/empty card for the ~1-2s until the MCP server's first progress
    // ping overwrites phase with "generating". Same fix already applied
    // one-off for generate_character_sheet (kolbo-mcp visual_dna.js) — this
    // is the general case, at the one place every tool's phase passes through.
    phase: op.phase === "running" || op.phase === "review" ? "generating" : op.phase,
    kind: resolveKind(typeof op.kind === "string" ? op.kind : undefined, tool, urls),
    tool: bare(tool),
    generation_id: op.id,
    urls,
    model: op.model.id,
    // Generation type ("text_to_img", "image_editing", …) — the key the model
    // chip needs to resolve a generation model's name + avatar.
    route: op.route,
    // What the user actually handed this generation. The card renders these as
    // thumbnails beside the chips; without them an in-progress edit showed no
    // sign of its own source images.
    reference_images: referenceUrls(input),
    credits_used: op.cost,
    prompt: op.prompt || (typeof input?.prompt === "string" ? input.prompt : ""),
    // Rebuilt from the tool INPUT, because this path is reached when the MCP's
    // own structuredContent isn't available (a generation resolved by polling
    // after the tool call gave up). Anything omitted here is a chip the card
    // silently loses on that path.
    settings: {
      aspect_ratio: input?.aspect_ratio,
      resolution: input?.resolution,
      quality: input?.quality,
      duration: input?.duration,
      visual_dna_ids: input?.visual_dna_ids,
      moodboard_id: input?.moodboard_id,
      moodboard_ids: input?.moodboard_ids,
      preset_id: input?.preset_id,
    },
  }, tool)
}

function shaped(data: unknown, tool?: string) {
  const obj = rec(data)
  if (!obj || (obj.widget && obj.widget !== "generation")) return data
  const raw = Array.isArray(obj.urls) ? obj.urls.filter((item): item is string => typeof item === "string") : []
  const urls = preferKolbo(raw)
  const named = typeof obj.tool === "string" ? obj.tool : tool
  return {
    ...obj,
    ...(raw.length ? { urls } : {}),
    kind: resolveKind(typeof obj.kind === "string" ? obj.kind : undefined, named, urls),
  }
}

export function KolboMcpWidget(props: {
  tool: string
  output?: string
  metadata?: Record<string, unknown>
  input?: Record<string, unknown>
  resolved?: Operation
  onReady?: () => void
}) {
  const ops = usePlatformOps()
  const kolboModels = useKolboModels()
  const [src, setSrc] = createSignal<string>()
  const [h, setH] = createSignal(280)
  const [live, setLive] = createSignal(false)
  let frame: HTMLIFrameElement | undefined

  /**
   * The widget draws its model chip from `model_name` + `model_icon`, which an
   * MCP Apps host gets from the server. We build the payload ourselves, so
   * without this the chip shows a raw identifier ("gpt-image-2/edit") next to a
   * first-letter circle instead of the model's name and avatar. The catalog is
   * already loaded for the fallback chip; the icon goes through the same proxy,
   * because WebView2 cannot fetch api.kolbo.ai avatars directly.
   */
  const withModelChip = (data: Record<string, unknown>) => {
    if (data.widget !== "generation" || (data.model_icon && data.model_name)) return data
    const id = typeof data.model === "string" ? data.model : ""
    if (!id) return data
    // lookup() only knows the CHAT catalog (/kolbo/v1/models filters `type:
    // "code"`), so a generation model like "nano-banana-2" misses it entirely
    // and the chip degrades to the raw identifier next to a first-letter
    // circle. byType() is the catalog that has them — same source the approval
    // card's model picker already uses.
    const route = typeof data.route === "string" ? data.route : ""
    let typed: { id: string; name: string; avatar?: string | null } | undefined
    for (const type of catalogTypes(route, props.tool)) {
      typed = matchModel(kolboModels.byType(type), id)
      if (typed) break
    }
    const info = kolboModels.lookup(id)
    const name = typed?.name ?? info.name
    const avatar = typed?.avatar ?? info.avatar
    const icon = avatar ? (ops.imageProxyUrl?.(avatar) ?? avatar) : undefined
    if (!name && !icon) return data
    return {
      ...data,
      ...(!data.model_name && name ? { model_name: name } : {}),
      ...(!data.model_icon && icon ? { model_icon: icon } : {}),
    }
  }

  const payload = () => {
    const data = structured(props.output, props.metadata, props.input, props.tool, props.resolved)
    const chipped = data && typeof data === "object" ? withModelChip(data as Record<string, unknown>) : data
    return chipped === undefined ? chipped : serializeForWidget(chipped)
  }

  // Push even with no structuredContent. A widget that never receives a
  // tool-result sits on its initial "Loading…" forever with no way out; one
  // that receives an empty result can fall back to the text or collapse. That
  // silence is what stranded the models catalog on every non-Apps host.
  const push = () => {
    const win = frame?.contentWindow
    if (!win) return
    win.postMessage(
      {
        jsonrpc: "2.0",
        method: "ui/notifications/tool-result",
        params: {
          ...(payload() ? { structuredContent: payload() } : {}),
          content: [{ type: "text", text: props.output || "" }],
        },
      },
      "*",
    )
  }

  createEffect(() => {
    const htmlFn = ops.mcpWidget
    const preview = ops.htmlPreviewUrl
    const target = uri(props.metadata, props.tool, untrack(payload))
    if (!htmlFn || !preview || !target) return
    let gone = false
    void htmlFn(target).then(async (html) => {
      if (gone || !html) return
      const url = await preview(html)
      if (!gone && url) {
        setSrc(url)
        props.onReady?.()
      }
    })
    onCleanup(() => {
      gone = true
    })
  })

  const onMsg = (ev: MessageEvent) => {
    const win = frame?.contentWindow
    if (!win || ev.source !== win) return
    const msg = ev.data
    if (!msg || msg.jsonrpc !== "2.0") return
    const reply = (id: unknown, result: unknown) => {
      win.postMessage({ jsonrpc: "2.0", id, result }, "*")
    }
    if (msg.method === "ui/initialize") {
      reply(msg.id, {
        protocolVersion: "2026-01-26",
        hostContext: {
          toolInfo: {
            tool: { name: bare(props.tool) },
            result: { structuredContent: payload() },
          },
        },
      })
      return
    }
    if (msg.method === "ui/notifications/initialized") {
      setLive(true)
      push()
      return
    }
    if (msg.method === "ui/notifications/size-changed") {
      const next = Number(msg.params?.height)
      // 720 was below what a completed image card actually needs (header +
      // prompt + chips + preview + actions + footer), so every finished
      // generation got an inner scrollbar. The widget already clamps itself
      // against the screen; this is just a runaway guard.
      if (Number.isFinite(next) && next > 0) setH(Math.min(Math.max(next, 180), 1400))
      return
    }
    if (msg.method === "ui/message") {
      // window.kolbo.sendMessage() — every "Use" button on a media-grid /
      // catalog / list card, plus the grid's "Load more". The bridge posts
      // ui/message and awaits the reply; this host had no case for it, so the
      // request fell through to the bare ack below without ever reaching the
      // session and the buttons did nothing at all. A widget is a sandboxed
      // cross-origin iframe, so the text goes to the composer over a document
      // event, exactly like ui/attach-media hands over a URL (listener:
      // prompt-input.tsx handleWidgetMessage).
      const text = messageText(msg.params)
      if (text) document.dispatchEvent(new CustomEvent("kolbo:send-message", { detail: { text } }))
      if (msg.id != null) reply(msg.id, {})
      return
    }
    if (msg.method === "ui/attach-media") {
      // The widget can't drag its media out — it's a sandboxed cross-origin
      // iframe, so a native drag never hands dataTransfer to this document.
      // It posts the URL instead and the composer attaches it (see
      // attachments.ts handleWidgetAttach).
      const url = msg.params?.url
      if (typeof url === "string" && /^https?:\/\//.test(url)) {
        document.dispatchEvent(new CustomEvent("kolbo:attach-media", { detail: { url } }))
      }
      if (msg.id != null) reply(msg.id, {})
      return
    }
    if (msg.method === "ui/open-link") {
      const href = msg.params?.url
      if (typeof href === "string") {
        // A media URL from a result card opens the IN-APP lightbox, not the
        // browser. The widget only sends these as a fallback: clicking an
        // image calls requestDisplayMode('fullscreen') first, this host never
        // grants it, and the fallback used to punt every click to an external
        // browser window. Download links (/mcp/download) and everything else
        // (app.kolbo.ai deep links) still open externally on purpose.
        const isDownload = href.includes("/mcp/download")
        const isMedia = /\.(png|jpe?g|webp|gif|avif|mp4|mov|webm|mkv)(\?|$)/i.test(href)
        if (isMedia && !isDownload) openKolboLightbox(href)
        else ops.openLink?.(href)
      }
      if (msg.id != null) reply(msg.id, {})
      return
    }
    if (msg.id != null) reply(msg.id, {})
  }

  createEffect(() => {
    window.addEventListener("message", onMsg)
    onCleanup(() => window.removeEventListener("message", onMsg))
  })

  createEffect(() => {
    if (!live()) return
    payload()
    props.output
    props.metadata
    push()
  })

  return (
    <Show when={src()}>
      <iframe
        ref={frame}
        src={src()}
        title="Kolbo"
        sandbox="allow-scripts allow-same-origin allow-popups"
        // Without these the <video> element's fullscreen button is inert: the
        // Fullscreen API is gated per-frame, so a cross-origin iframe has to be
        // granted it explicitly. `allow` is the modern form, `allowfullscreen`
        // the legacy attribute some webviews still key on — send both.
        allow="fullscreen; clipboard-write"
        allowfullscreen
        style={{
          width: "100%",
          height: `${h()}px`,
          border: "0",
          "border-radius": "16px",
          background: "transparent",
        }}
      />
    </Show>
  )
}
