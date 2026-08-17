import { Show, createEffect, createSignal, onCleanup, untrack } from "solid-js"
import { unwrap } from "solid-js/store"
import { useKolboModels } from "../context/kolbo-models"
import { usePlatformOps } from "../context/platform-ops"
import { read, type Operation } from "./kolbo-operation"

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
  list_presets: BY_WIDGET["media-grid"],
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

function uri(meta?: Record<string, unknown>, tool?: string, data?: unknown) {
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
  if (BY_TOOL[toolName]) return BY_TOOL[toolName]
  if (toolName.startsWith("list_")) return BY_WIDGET.list
  // Nothing else falls back to the generation card. generation.html boots as a
  // "Generating" spinner and only leaves it once an operation payload arrives,
  // so mounting it for a tool that will never produce one (chat_send_message,
  // get_media, upload_media…) pins a spinner on a result that is already final.
  if (generative(toolName)) return GEN
  return undefined
}

function bare(tool?: string) {
  const name = tool || ""
  if (name.startsWith("kolbo_")) return name.slice("kolbo_".length)
  if (name.startsWith("mcp__kolbo__")) return name.slice("mcp__kolbo__".length)
  return name
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
    if (Array.isArray(obj.items)) return obj
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
    if (fromMeta && typeof fromMeta === "object") return fromMeta
    const fromText = listed(output)
    if (fromText) return fromText
  }
  const op = resolved ?? read(output, metadata)
  if (!op) return
  return {
    widget: "generation",
    phase: op.phase === "running" ? "generating" : op.phase,
    kind: op.kind,
    tool: bare(tool),
    generation_id: op.id,
    urls: op.outputs.map((item) => item.url),
    model: op.model.id,
    // Generation type ("text_to_img", "image_editing", …) — the key the model
    // chip needs to resolve a generation model's name + avatar.
    route: op.route,
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
    const typed = route ? kolboModels.byType(route).find((m) => m.id === id) : undefined
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
    return data && typeof data === "object" ? withModelChip(data as Record<string, unknown>) : data
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
      if (typeof href === "string") ops.openLink?.(href)
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
