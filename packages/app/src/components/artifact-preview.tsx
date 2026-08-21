import { createEffect, createMemo, createResource, createSignal, onCleanup, onMount, Show } from "solid-js"
import { checksum, sampledChecksum } from "@opencode-ai/util/encode"
import { artifactLabel } from "@opencode-ai/ui/lib/artifact"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { useServer } from "@/context/server"
import { Dialog as KobalteDialog } from "@kobalte/core/dialog"
import { Dialog } from "@opencode-ai/ui/dialog"
import { Button } from "@opencode-ai/ui/button"
import { Markdown } from "@opencode-ai/ui/markdown"

export type ArtifactData = {
  /** Source markup — or, for lang "site", the published site's public URL. */
  content: string
  lang: "html" | "svg" | "mermaid" | "markdown" | "site"
  /** Absolute or project path when this came from a write/edit. */
  path?: string
  /** Explicit label (e.g. chat Plan dump) when there is no file path. */
  title?: string
}

function buildMermaidSrcdoc(code: string): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<style>
  html,body{margin:0;padding:16px;background:#1e1e1e;color:#ccc;font-family:sans-serif;height:100%;box-sizing:border-box;}
  .mermaid{max-width:100%;overflow:auto;}
  svg{max-width:100%;}
</style>
</head>
<body>
<div class="mermaid">${code.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>
<script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"><\/script>
<script>
  mermaid.initialize({startOnLoad:true,theme:'dark',securityLevel:'loose'});
<\/script>
</body>
</html>`
}

function sanitizeSvg(svg: string): string {
  return svg
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/\son\w+\s*=\s*["'][^"']*["']/gi, "")
    .replace(/javascript:/gi, "")
}

/**
 * Upload HTML to the sidecar's in-memory store and return an HTTP URL.
 * Loading via HTTP lets Tauri WebView2 render WebGL/Canvas/WebCodecs correctly —
 * blob: and srcdoc approaches both fail to composite GPU content in WebView2.
 */
async function storeHtmlPreview(serverUrl: string, content: string): Promise<string | null> {
  try {
    const res = await fetch(`${serverUrl}/global/html-preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    })
    if (!res.ok) return null
    const data = (await res.json()) as { id?: string }
    if (!data.id) return null
    return `${serverUrl}/global/html-preview/${data.id}`
  } catch {
    return null
  }
}

// Design width assumed for HTML previews — content is scaled to fit the panel
const HTML_DESIGN_WIDTH = 1280
/** Above this, blob/srcdoc freezes WebView2 — refuse the fallback. */
const HEAVY_HTML = 250_000

export function ArtifactPreviewTab(props: {
  artifact: ArtifactData
  /** Show Apply Plan when this markdown is a plan-mode deliverable. */
  showApplyPlan?: boolean
  applyingPlan?: boolean
  onApplyPlan?: () => void
}) {
  const language = useLanguage()
  const platform = usePlatform()
  const server = useServer()
  const [view, setView] = createSignal<"preview" | "code">("preview")
  const [panelWidth, setPanelWidth] = createSignal(HTML_DESIGN_WIDTH)
  const [panelHeight, setPanelHeight] = createSignal(720)
  let contentDivRef: HTMLDivElement | undefined

  onMount(() => {
    if (!contentDivRef) return
    const ro = new ResizeObserver((entries) => {
      const rect = entries[0].contentRect
      setPanelWidth(rect.width)
      setPanelHeight(rect.height)
    })
    ro.observe(contentDivRef)
    onCleanup(() => ro.disconnect())
  })

  const htmlScale = createMemo(() => {
    const w = panelWidth()
    return w > 0 && w < HTML_DESIGN_WIDTH ? w / HTML_DESIGN_WIDTH : 1
  })

  // Debounce HTML body so rapid edit bursts coalesce into one POST + one
  // iframe navigation instead of thrashing WebView2 on every hunk.
  const [stableHtml, setStableHtml] = createSignal(
    props.artifact.lang === "html" ? props.artifact.content : "",
  )
  createEffect(() => {
    const lang = props.artifact.lang
    const content = props.artifact.content
    if (lang !== "html") {
      setStableHtml("")
      return
    }
    if (!stableHtml()) {
      setStableHtml(content)
      return
    }
    const t = window.setTimeout(() => setStableHtml(content), 200)
    onCleanup(() => clearTimeout(t))
  })

  const [htmlPreview] = createResource(
    () => {
      if (props.artifact.lang !== "html") return null
      const url = server.current?.http.url
      if (!url) return null
      const body = stableHtml()
      if (!body) return null
      return `${url}:${sampledChecksum(body) ?? ""}`
    },
    async () => {
      const url = server.current?.http.url
      if (!url) return null
      const body = stableHtml()
      if (!body) return null
      return storeHtmlPreview(url, body)
    },
  )

  // Fallback blob URL — never for heavy HTML (sync parse freezes the app).
  const needsBlobFallback = createMemo(
    () =>
      props.artifact.lang === "html" &&
      stableHtml().length <= HEAVY_HTML &&
      (!server.current?.http.url || (htmlPreview.state === "ready" && htmlPreview() === null)),
  )
  const blobUrl = createMemo<string>((prev) => {
    if (!needsBlobFallback()) {
      if (prev) URL.revokeObjectURL(prev)
      return ""
    }
    if (prev) URL.revokeObjectURL(prev)
    const blob = new Blob([stableHtml()], { type: "text/html" })
    return URL.createObjectURL(blob)
  })
  onCleanup(() => {
    const u = blobUrl()
    if (u) URL.revokeObjectURL(u)
  })

  const effectiveHtmlUrl = createMemo(() => {
    // Published Kolbo sites iframe through the sidecar proxy — their
    // frame-ancestors CSP blocks the app origin from framing them directly.
    if (props.artifact.lang === "site") {
      const base = server.current?.http.url
      return base ? `${base}/global/site-preview?url=${encodeURIComponent(props.artifact.content)}` : null
    }
    const u = htmlPreview()
    if (typeof u === "string" && u) return u
    const b = blobUrl()
    return b || null
  })
  const isLoadingPreview = createMemo(() => props.artifact.lang === "html" && htmlPreview.loading && !blobUrl())
  const heavyFailed = createMemo(
    () =>
      props.artifact.lang === "html" &&
      stableHtml().length > HEAVY_HTML &&
      htmlPreview.state === "ready" &&
      !htmlPreview(),
  )
  const label = createMemo(() =>
    artifactLabel(props.artifact.lang, { path: props.artifact.path, title: props.artifact.title }),
  )
  const blank = createMemo(
    () => props.artifact.lang !== "site" && !props.artifact.content.trim(),
  )

  // Two long-lived iframe slots — assign src without remounting. Keyed <Show>
  // discarded the warm pending frame and flashed blank on every HTML edit.
  const [slotA, setSlotA] = createSignal<string | null>(null)
  const [slotB, setSlotB] = createSignal<string | null>(null)
  const [front, setFront] = createSignal<"a" | "b">("a")
  const [painted, setPainted] = createSignal(false)
  const [pendingSlot, setPendingSlot] = createSignal<"a" | "b" | null>(null)

  createEffect(() => {
    const next = effectiveHtmlUrl()
    if (!next) {
      if (htmlPreview.loading || props.artifact.lang === "html" || props.artifact.lang === "site") return
      setSlotA(null)
      setSlotB(null)
      setPendingSlot(null)
      setPainted(false)
      return
    }
    const f = front()
    const shown = f === "a" ? slotA() : slotB()
    if (!shown) {
      if (f === "a") setSlotA(next)
      else setSlotB(next)
      return
    }
    if (next === shown) return
    const back = f === "a" ? "b" : "a"
    const backUrl = back === "a" ? slotA() : slotB()
    if (next === backUrl && pendingSlot() === back) return
    if (back === "a") setSlotA(next)
    else setSlotB(next)
    setPendingSlot(back)
  })

  const promote = (slot: "a" | "b") => {
    if (pendingSlot() === slot) {
      setFront(slot)
      setPendingSlot(null)
    }
    setPainted(true)
  }

  const frameStyle = (slot: "a" | "b") => {
    const live = front() === slot
    const preview = view() === "preview"
    const has = slot === "a" ? !!slotA() : !!slotB()
    return {
      position: "absolute",
      top: "0",
      left: "0",
      width: `${HTML_DESIGN_WIDTH}px`,
      height: `${panelHeight() / htmlScale()}px`,
      border: "0",
      background: "transparent",
      "color-scheme": "light",
      "transform-origin": "top left",
      transform: `scale(${htmlScale()})`,
      opacity: live && preview && has && painted() ? "1" : "0",
      "pointer-events": live && preview ? "auto" : "none",
      "z-index": live ? "1" : "0",
    } as const
  }

  // ── Publish flow ─────────────────────────────────────────────────────────
  // POSTs the current artifact to the opencode server's /global/kolbo-artifact-publish
  // proxy, which forwards to kolbo-api's /artifact/quick-share with the user's
  // stored Bearer auth and returns a public sites.kolbo.ai URL.
  const [publishOpen, setPublishOpen] = createSignal(false)
  const [publishUrl, setPublishUrl] = createSignal<string | null>(null)
  const [publishError, setPublishError] = createSignal<string | null>(null)
  const [publishLoading, setPublishLoading] = createSignal(false)
  const [copied, setCopied] = createSignal(false)

  async function publish() {
    if (publishLoading()) return
    const base = server.current?.http.url
    if (!base) {
      setPublishError("Server not reachable")
      setPublishOpen(true)
      return
    }
    setPublishLoading(true)
    setPublishError(null)
    setPublishUrl(null)
    setPublishOpen(true)
    try {
      const res = await fetch(`${base}/global/kolbo-artifact-publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: language.t("artifact.publish.defaultTitle"),
          content: props.artifact.content,
          type: props.artifact.lang,
        }),
      })
      const data = (await res.json().catch(() => ({}))) as {
        data?: { publicUrl?: string; shareableSlug?: string; siteUrl?: string; shareToken?: string }
        error?: { message?: string }
      }
      if (!res.ok) {
        setPublishError(data?.error?.message || `HTTP ${res.status}`)
        return
      }
      // Server returns publicUrl already env-aware (local API for dev, sites.kolbo.ai for prod).
      const url =
        data?.data?.publicUrl ||
        data?.data?.siteUrl ||
        (data?.data?.shareableSlug ? `https://sites.kolbo.ai/${data.data.shareableSlug}` : null)
      if (!url) {
        setPublishError("Server returned no URL")
        return
      }
      setPublishUrl(url)
    } catch (e) {
      setPublishError((e as Error).message)
    } finally {
      setPublishLoading(false)
    }
  }

  async function copyUrl() {
    const url = publishUrl()
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard API blocked — leave the URL visible so user can manually copy.
    }
  }

  return (
    <div class="flex flex-col h-full overflow-hidden">
      {/* Toolbar */}
      <div class="shrink-0 flex items-center gap-2 px-3 py-2 border-b border-border-weaker-base">
        <div class="min-w-0 flex-1">
          <div class="text-13-medium text-text-strong truncate" title={props.artifact.path ?? label()}>
            {label()}
          </div>
        </div>

        <div class="flex items-center rounded-md border border-border-weak-base bg-surface-base-active overflow-hidden text-12-medium shrink-0">
          <button
            type="button"
            onClick={() => setView("preview")}
            aria-label={language.t("artifact.preview")}
            class="px-3 py-1 transition-colors duration-100"
            classList={{
              "bg-background-base text-text-strong": view() === "preview",
              "text-text-weak hover:text-text-base": view() !== "preview",
            }}
          >
            {language.t("artifact.preview")}
          </button>
          <button
            type="button"
            onClick={() => setView("code")}
            aria-label={language.t("artifact.code")}
            class="px-3 py-1 transition-colors duration-100"
            classList={{
              "bg-background-base text-text-strong": view() === "code",
              "text-text-weak hover:text-text-base": view() !== "code",
            }}
          >
            {language.t("artifact.code")}
          </button>
        </div>

        <Show
          when={props.artifact.lang === "html" || props.artifact.lang === "svg" || props.artifact.lang === "mermaid"}
        >
          <button
            type="button"
            class="flex items-center gap-1.5 px-2.5 py-1 rounded text-12-medium border border-border-weak-base text-text-base hover:bg-surface-base-hover hover:text-text-strong transition-colors duration-100 disabled:opacity-50 disabled:cursor-wait"
            disabled={publishLoading()}
            aria-label={language.t("artifact.publish")}
            title={language.t("artifact.publish")}
            onClick={publish}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path
                d="M6 1.5v6m0-6L3.5 4M6 1.5L8.5 4M1.5 8.5v1A1 1 0 0 0 2.5 10.5h7a1 1 0 0 0 1-1v-1"
                stroke="currentColor"
                stroke-width="1.4"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
            {language.t("artifact.publish")}
          </button>
        </Show>

        <Show when={props.artifact.lang === "html" || props.artifact.lang === "site"}>
          {(() => {
            const handleOpen = () => {
              // A published site opens at its real public URL.
              if (props.artifact.lang === "site") {
                platform.openLink(props.artifact.content)
                return
              }
              // Use the Rust temp-file approach — works even when sidecar is unreachable
              if (platform.openHtmlPreview) {
                platform.openHtmlPreview(props.artifact.content)
                return
              }
              // Web fallback: open sidecar URL if available
              const u = htmlPreview()
              if (typeof u === "string" && u) platform.openLink(u)
            }
            return (
              <button
                type="button"
                class="flex items-center gap-1.5 px-2.5 py-1 rounded text-12-medium border border-border-weak-base text-text-base hover:bg-surface-base-hover hover:text-text-strong transition-colors duration-100"
                aria-label={language.t("artifact.openInTab")}
                title={language.t("artifact.openInTab")}
                onClick={handleOpen}
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path
                    d="M7 1h4v4M11 1L5.5 6.5M5 2H2a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1V8"
                    stroke="currentColor"
                    stroke-width="1.4"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
                {language.t("artifact.openInTab")}
              </button>
            )
          })()}
        </Show>
      </div>

      {/* Content */}
      <div
        ref={(el) => {
          contentDivRef = el
        }}
        class="flex-1 min-h-0 overflow-hidden relative"
      >
        <Show when={blank()}>
          <div class="absolute inset-0 flex flex-col items-center justify-center gap-1.5 px-6 text-center">
            <div class="text-13-medium text-text-base">{language.t("artifact.empty")}</div>
            <div class="text-12-regular text-text-weak max-w-[36ch]">{language.t("artifact.empty.hint")}</div>
          </div>
        </Show>

        {/* HTML — wait for HTTP URL so WebView2 composites WebGL/Canvas correctly */}
        <Show when={!blank() && (props.artifact.lang === "html" || props.artifact.lang === "site")}>
          <Show when={isLoadingPreview() && view() === "preview" && !painted()}>
            <div class="absolute inset-0 flex items-center justify-center bg-[var(--surface-recess-base)]">
              <div class="size-6 border-2 border-neutral-300 border-t-neutral-600 rounded-full animate-spin" />
            </div>
          </Show>
          <Show when={heavyFailed() && view() === "preview"}>
            <div class="absolute inset-0 flex items-center justify-center px-6 text-center text-12-regular text-text-weak">
              Preview unavailable for this large HTML file. Open in tab instead.
            </div>
          </Show>
          <iframe
            src={slotA() ?? undefined}
            title="HTML preview A"
            onLoad={() => {
              if (slotA()) promote("a")
            }}
            style={frameStyle("a")}
          />
          <iframe
            src={slotB() ?? undefined}
            title="HTML preview B"
            onLoad={() => {
              if (slotB()) promote("b")
            }}
            style={frameStyle("b")}
          />
        </Show>

        {/* SVG */}
        <Show when={!blank() && props.artifact.lang === "svg" && view() === "preview"}>
          <div
            style="position:absolute;inset:0;overflow:auto;display:flex;align-items:center;justify-content:center;padding:16px;"
            // eslint-disable-next-line solid/no-innerhtml
            innerHTML={sanitizeSvg(props.artifact.content)}
          />
        </Show>

        {/* Markdown */}
        <Show when={!blank() && props.artifact.lang === "markdown" && view() === "preview"}>
          <div class="absolute inset-0 overflow-auto px-6 py-5">
            <Markdown
              text={props.artifact.content}
              cacheKey={checksum(props.artifact.content)}
              class="text-14-regular max-w-[72ch] mx-auto select-text"
            />
          </div>
        </Show>

        {/* Mermaid */}
        <Show when={!blank() && props.artifact.lang === "mermaid" && view() === "preview"}>
          <iframe
            sandbox="allow-scripts allow-same-origin"
            srcdoc={buildMermaidSrcdoc(props.artifact.content)}
            style="position:absolute;inset:0;width:100%;height:100%;border:0;background:#1e1e1e;"
          />
        </Show>

        {/* Code tab */}
        <Show when={!blank() && view() === "code"}>
          <div class="h-full overflow-auto" style="position:absolute;inset:0;">
            <pre class="p-4 text-12-regular text-text-base whitespace-pre-wrap break-words" style="margin:0;">
              <code>{props.artifact.content}</code>
            </pre>
          </div>
        </Show>
      </div>

      {/* Publish dialog */}
      <KobalteDialog open={publishOpen()} onOpenChange={setPublishOpen} modal>
        <KobalteDialog.Portal>
          <KobalteDialog.Overlay class="fixed inset-0 z-50 bg-background-base/60 backdrop-blur-sm" />
          <div class="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <div class="pointer-events-auto">
              <Dialog title={language.t("artifact.publish.title")} class="w-full max-w-[480px] mx-auto">
                <div class="flex flex-col gap-4 p-6 pt-2">
                  <Show when={publishLoading()}>
                    <div class="flex items-center justify-center py-6 gap-3 text-text-weak text-12-regular">
                      <div class="size-4 border-2 border-neutral-300 border-t-neutral-600 rounded-full animate-spin" />
                      {language.t("artifact.publish.loading")}
                    </div>
                  </Show>
                  <Show when={publishError()}>
                    <div class="text-text-danger text-12-regular px-3 py-2 rounded bg-surface-danger-base/40">
                      {publishError()}
                    </div>
                  </Show>
                  <Show when={publishUrl()}>
                    <div class="flex flex-col gap-2">
                      <label class="text-12-medium text-text-weak">{language.t("artifact.publish.urlLabel")}</label>
                      <div class="flex items-center gap-2">
                        <input
                          readonly
                          value={publishUrl() ?? ""}
                          class="flex-1 text-12-regular px-3 py-2 rounded border border-border-weak-base bg-surface-base-active text-text-base outline-none"
                          onFocus={(e) => (e.currentTarget as HTMLInputElement).select()}
                        />
                        <Button type="button" onClick={copyUrl}>
                          {copied() ? language.t("artifact.publish.copied") : language.t("artifact.publish.copy")}
                        </Button>
                      </div>
                      <a
                        href={publishUrl() ?? "#"}
                        target="_blank"
                        rel="noreferrer noopener"
                        class="text-12-medium text-text-interactive-base hover:underline self-start"
                        onClick={(e) => {
                          const url = publishUrl()
                          if (!url) {
                            e.preventDefault()
                            return
                          }
                          if (platform.openLink) {
                            e.preventDefault()
                            platform.openLink(url)
                          }
                        }}
                      >
                        {language.t("artifact.publish.open")} →
                      </a>
                    </div>
                  </Show>
                </div>
              </Dialog>
            </div>
          </div>
        </KobalteDialog.Portal>
      </KobalteDialog>

      {/* Sticky Apply Plan — full-width footer so it stays visible while reading */}
      <Show when={props.artifact.lang === "markdown" && props.showApplyPlan && props.onApplyPlan}>
        <div class="shrink-0 border-t border-border-weak-base bg-surface-base px-4 py-3 flex flex-col gap-2">
          <div class="text-14-medium text-text-strong">{language.t("artifact.applyPlan.title")}</div>
          <div class="text-12-regular text-text-weak">{language.t("artifact.applyPlan.subtitle")}</div>
          <button
            type="button"
            class="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-14-medium text-white hover:opacity-90 transition-opacity duration-100 disabled:opacity-50 disabled:cursor-wait"
            style={{ "background-color": "var(--icon-agent-plan-base)" }}
            disabled={props.applyingPlan}
            aria-label={language.t("artifact.applyPlan")}
            onClick={() => props.onApplyPlan?.()}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path
                d="M3 8.5l3.5 3.5L13 4.5"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
            {props.applyingPlan ? language.t("artifact.applyPlan.applying") : language.t("artifact.applyPlan")}
          </button>
        </div>
      </Show>
    </div>
  )
}
