import { Show, createEffect, createSignal, onCleanup } from "solid-js"
import { usePlatformOps } from "../context/platform-ops"
import { read } from "./kolbo-operation"

const GEN = "ui://kolbo/generation.html"

function uri(meta?: Record<string, unknown>) {
  const ui = meta?.ui
  if (ui && typeof ui === "object") {
    const rec = ui as Record<string, unknown>
    if (typeof rec["ui/resourceUri"] === "string") return rec["ui/resourceUri"]
    const nested = rec.ui
    if (nested && typeof nested === "object" && typeof (nested as { resourceUri?: unknown }).resourceUri === "string") {
      return (nested as { resourceUri: string }).resourceUri
    }
  }
  const sc = meta?.structuredContent
  if (sc && typeof sc === "object" && typeof (sc as { widget?: unknown }).widget === "string") {
    const name = (sc as { widget: string }).widget
    if (name === "media-grid") return "ui://kolbo/media-grid.html"
    if (name === "catalog") return "ui://kolbo/catalog.html"
    if (name === "transcript") return "ui://kolbo/transcript.html"
    if (name === "list") return "ui://kolbo/list.html"
    if (name === "upload") return "ui://kolbo/upload.html"
  }
  return GEN
}

function bare(tool?: string) {
  const name = tool || ""
  if (name.startsWith("kolbo_")) return name.slice("kolbo_".length)
  if (name.startsWith("mcp__kolbo__")) return name.slice("mcp__kolbo__".length)
  return name
}

function structured(
  output?: string,
  metadata?: Record<string, unknown>,
  input?: Record<string, unknown>,
  tool?: string,
) {
  const fromMeta = metadata?.structuredContent
  if (fromMeta && typeof fromMeta === "object") return fromMeta
  const op = read(output, metadata)
  if (!op) return
  return {
    widget: "generation",
    phase: op.phase === "running" ? "generating" : op.phase,
    kind: op.kind,
    tool: bare(tool),
    generation_id: op.id,
    urls: op.outputs.map((item) => item.url),
    model: op.model.id,
    credits_used: op.cost,
    prompt: op.prompt || (typeof input?.prompt === "string" ? input.prompt : ""),
    settings: {
      aspect_ratio: input?.aspect_ratio,
      resolution: input?.resolution,
      quality: input?.quality,
    },
  }
}

export function KolboMcpWidget(props: {
  tool: string
  output?: string
  metadata?: Record<string, unknown>
  input?: Record<string, unknown>
  onReady?: () => void
}) {
  const ops = usePlatformOps()
  const [src, setSrc] = createSignal<string>()
  const [h, setH] = createSignal(280)
  let frame: HTMLIFrameElement | undefined

  const payload = () => structured(props.output, props.metadata, props.input, props.tool)

  createEffect(() => {
    const htmlFn = ops.mcpWidget
    const preview = ops.htmlPreviewUrl
    const target = uri(props.metadata)
    if (!htmlFn || !preview) return
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
      win.postMessage(
        {
          jsonrpc: "2.0",
          method: "ui/notifications/tool-result",
          params: {
            structuredContent: payload(),
            content: [{ type: "text", text: props.output || "" }],
          },
        },
        "*",
      )
      return
    }
    if (msg.method === "ui/notifications/size-changed") {
      const next = Number(msg.params?.height)
      if (Number.isFinite(next) && next > 0) setH(Math.min(Math.max(next, 180), 720))
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

  return (
    <Show when={src()}>
      <iframe
        ref={frame}
        src={src()}
        title="Kolbo"
        sandbox="allow-scripts allow-same-origin allow-popups"
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
