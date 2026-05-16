import { createEffect, createMemo, createSignal, onCleanup, onMount, Show } from "solid-js"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { useServer } from "@/context/server"
import { Dialog as KobalteDialog } from "@kobalte/core/dialog"
import { Dialog } from "@opencode-ai/ui/dialog"
import { Button } from "@opencode-ai/ui/button"

export type ArtifactData = {
  content: string
  lang: "html" | "svg" | "mermaid"
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

export function ArtifactPreviewTab(props: { artifact: ArtifactData }) {
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

  // HTTP URL from sidecar for the HTML content.
  // null = still loading, "" = failed (fall back to blob)
  const [htmlPreviewUrl, setHtmlPreviewUrl] = createSignal<string | null>(null)
  const [htmlPreviewFailed, setHtmlPreviewFailed] = createSignal(false)

  createEffect(() => {
    if (props.artifact.lang !== "html") return
    const url = server.current?.http.url
    if (!url) {
      setHtmlPreviewFailed(true)
      return
    }
    const content = props.artifact.content
    setHtmlPreviewUrl(null)
    setHtmlPreviewFailed(false)
    void storeHtmlPreview(url, content).then((result) => {
      if (result) {
        setHtmlPreviewUrl(result)
      } else {
        setHtmlPreviewFailed(true)
      }
    })
  })

  // Fallback blob URL — only used when sidecar URL failed
  const blobUrl = createMemo<string>((prev) => {
    if (!htmlPreviewFailed()) {
      if (prev) URL.revokeObjectURL(prev)
      return ""
    }
    if (prev) return prev // keep existing blob url while still failed
    if (props.artifact.lang !== "html") return ""
    const blob = new Blob([props.artifact.content], { type: "text/html" })
    return URL.createObjectURL(blob)
  })
  onCleanup(() => {
    const u = blobUrl()
    if (u) URL.revokeObjectURL(u)
  })

  // The URL to use: prefer HTTP (WebGL works), fall back to blob
  const effectiveHtmlUrl = createMemo(() => htmlPreviewUrl() ?? (htmlPreviewFailed() ? blobUrl() : null))
  // True while we're waiting for the sidecar to respond
  const isLoadingPreview = createMemo(() => props.artifact.lang === "html" && !htmlPreviewUrl() && !htmlPreviewFailed())

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
      const data = (await res.json().catch(() => ({}))) as { data?: { publicUrl?: string; shareableSlug?: string; siteUrl?: string; shareToken?: string }; error?: { message?: string } }
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
        <div class="flex items-center rounded-md border border-border-weak-base bg-surface-base-active overflow-hidden text-12-medium">
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

        <div class="flex-1" />

        <Show when={props.artifact.lang === "html" || props.artifact.lang === "svg" || props.artifact.lang === "mermaid"}>
          <button
            type="button"
            class="flex items-center gap-1.5 px-2.5 py-1 rounded text-12-medium border border-border-weak-base text-text-base hover:bg-surface-base-hover hover:text-text-strong transition-colors duration-100 disabled:opacity-50 disabled:cursor-wait"
            disabled={publishLoading()}
            aria-label={language.t("artifact.publish")}
            title={language.t("artifact.publish")}
            onClick={publish}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M6 1.5v6m0-6L3.5 4M6 1.5L8.5 4M1.5 8.5v1A1 1 0 0 0 2.5 10.5h7a1 1 0 0 0 1-1v-1" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            {language.t("artifact.publish")}
          </button>
        </Show>

        <Show when={props.artifact.lang === "html"}>
          {(() => {
            const handleOpen = () => {
              // Use the Rust temp-file approach — works even when sidecar is unreachable
              if (platform.openHtmlPreview) {
                platform.openHtmlPreview(props.artifact.content)
                return
              }
              // Web fallback: open sidecar URL if available
              const u = htmlPreviewUrl()
              if (u) platform.openLink(u)
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
                  <path d="M7 1h4v4M11 1L5.5 6.5M5 2H2a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1V8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                {language.t("artifact.openInTab")}
              </button>
            )
          })()}
        </Show>
      </div>

      {/* Content */}
      <div ref={(el) => { contentDivRef = el }} class="flex-1 min-h-0 overflow-hidden relative">

        {/* HTML — wait for HTTP URL so WebView2 composites WebGL/Canvas correctly */}
        <Show when={props.artifact.lang === "html"}>
          {/* Loading spinner while sidecar is processing */}
          <Show when={isLoadingPreview() && view() === "preview"}>
            <div class="absolute inset-0 flex items-center justify-center bg-white dark:bg-neutral-900">
              <div class="size-6 border-2 border-neutral-300 border-t-neutral-600 rounded-full animate-spin" />
            </div>
          </Show>

          {/* Iframe — scaled to fit panel width so fixed-width HTML isn't cropped */}
          <Show when={effectiveHtmlUrl()} keyed>
            {(src) => (
              <iframe
                src={src}
                style={{
                  position: "absolute",
                  top: "0",
                  left: "0",
                  width: `${HTML_DESIGN_WIDTH}px`,
                  height: `${panelHeight() / htmlScale()}px`,
                  border: "0",
                  background: "#fff",
                  "transform-origin": "top left",
                  transform: `scale(${htmlScale()})`,
                  opacity: view() === "preview" ? "1" : "0",
                  "pointer-events": view() === "preview" ? "auto" : "none",
                }}
              />
            )}
          </Show>
        </Show>

        {/* SVG */}
        <Show when={props.artifact.lang === "svg" && view() === "preview"}>
          <div
            style="position:absolute;inset:0;overflow:auto;display:flex;align-items:center;justify-content:center;padding:16px;"
            // eslint-disable-next-line solid/no-innerhtml
            innerHTML={sanitizeSvg(props.artifact.content)}
          />
        </Show>

        {/* Mermaid */}
        <Show when={props.artifact.lang === "mermaid" && view() === "preview"}>
          <iframe
            sandbox="allow-scripts allow-same-origin"
            srcdoc={buildMermaidSrcdoc(props.artifact.content)}
            style="position:absolute;inset:0;width:100%;height:100%;border:0;background:#1e1e1e;"
          />
        </Show>

        {/* Code tab */}
        <Show when={view() === "code"}>
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
                          if (!url) { e.preventDefault(); return }
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
    </div>
  )
}
