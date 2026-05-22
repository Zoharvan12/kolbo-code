import { createSignal, Show, type JSX } from "solid-js"
import { Icon } from "./icon"
import { usePlatformOps } from "../context/platform-ops"
import { useI18n } from "../context/i18n"
import { useTheme } from "../theme/context"
import { showToast } from "./toast"

export type MediaCardProps = {
  children: JSX.Element
  /** The current renderable source — data URL or http URL */
  src?: string
  /** Original file path or URL (used to determine remote vs local) */
  path?: string
  /** Suggested filename for downloads */
  filename?: string
  /**
   * Skip rendering the hover-revealed download / open-folder buttons.
   * Use for cells (e.g., audio) that own their full visible layout and
   * provide their own integrated controls — the floating corner buttons
   * would otherwise overlap the cell content at narrow column counts.
   */
  hideHoverButtons?: boolean
  /**
   * When provided, renders a hover-revealed "X" button alongside the
   * download/folder buttons. Click hides the media from the parent view
   * (the caller is responsible for the actual hide/persist semantics —
   * MediaCard just surfaces the affordance). Use for canvas tiles where
   * the user wants to declutter without deleting the underlying generation.
   */
  onRemove?: () => void
  /** Optional tooltip for the remove button. Defaults to "Hide from canvas". */
  removeLabel?: string
}

function extractFilename(path?: string, fallback = "download"): string {
  if (!path) return fallback
  const lastSlash = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"))
  const base = lastSlash >= 0 ? path.slice(lastSlash + 1) : path
  // Strip query strings from URLs
  return base.split("?")[0] || fallback
}

function isRemoteUrl(path?: string): boolean {
  return !!(path?.startsWith("http://") || path?.startsWith("https://"))
}

function isLocalPath(path?: string): boolean {
  if (!path) return false
  if (path.startsWith("http") || path.startsWith("data:")) return false
  return true
}

export function MediaCard(props: MediaCardProps) {
  const ops = usePlatformOps()
  const i18n = useI18n()
  const theme = useTheme()
  const [downloading, setDownloading] = createSignal(false)
  const [done, setDone] = createSignal(false)
  const isDark = () => {
    const scheme = theme.colorScheme()
    if (scheme === "dark") return true
    if (scheme === "light") return false
    if (typeof window === "undefined") return false
    return window.matchMedia("(prefers-color-scheme: dark)").matches
  }

  const filename = () =>
    props.filename || extractFilename(props.path) || "download"

  const showDownload = () =>
    isRemoteUrl(props.path) || !!(props.src && !isLocalPath(props.path))

  const showOpenFolder = () =>
    isLocalPath(props.path) && !!ops.openPath

  const handleDownload = async () => {
    if (downloading()) return
    setDownloading(true)

    try {
      const downloadSrc = props.src || props.path
      if (!downloadSrc) return

      if (downloadSrc.startsWith("data:")) {
        const a = document.createElement("a")
        a.href = downloadSrc
        a.download = filename()
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        showToast({ variant: "success", title: i18n.t("ui.download.saved"), description: filename() })
      } else if (downloadSrc.startsWith("http")) {
        if (ops.downloadFile) {
          const savedPath = await ops.downloadFile(downloadSrc)
          const savedFilename = savedPath.split(/[\\/]/).pop() ?? filename()
          const toastActions: { label: string; onClick: () => void }[] = []
          if (ops.revealFile)
            toastActions.push({ label: i18n.t("ui.download.openInFolder"), onClick: () => void ops.revealFile!(savedPath) })
          if (ops.changeDownloadFolder)
            toastActions.push({ label: i18n.t("ui.download.changeFolder"), onClick: () => void ops.changeDownloadFolder!() })
          showToast({
            variant: "success",
            icon: "circle-check",
            title: i18n.t("ui.download.downloaded"),
            description: savedFilename,
            actions: toastActions.length > 0 ? toastActions : undefined,
          })
        } else {
          // Fallback for web: open in browser
          const openFn = ops.openLink ?? ((u: string) => window.open(u, "_blank", "noopener,noreferrer"))
          openFn(downloadSrc)
          showToast({ variant: "success", title: i18n.t("ui.download.openingInBrowser") })
        }
      }

      setDone(true)
      setTimeout(() => setDone(false), 2000)
    } catch (e) {
      console.error("[MediaCard] Download failed:", e)
      showToast({ variant: "error", title: i18n.t("ui.download.failed") })
    } finally {
      setDownloading(false)
    }
  }

  const handleOpenFolder = () => {
    const p = props.path
    if (!p || !ops.openPath) return
    const lastSep = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"))
    const dir = lastSep > 0 ? p.slice(0, lastSep) : p
    void ops.openPath(dir)
  }

  // Theme-aware overlay button: light glass on light theme, dark glass on
  // dark theme. Both feel native vs. the page chrome while staying legible
  // on top of arbitrary media via blur + drop shadow.
  const btnBase = () =>
    isDark()
      ? "background:rgba(28,28,32,0.78);" +
        "color:rgba(255,255,255,0.92);" +
        "border:1px solid rgba(255,255,255,0.18);" +
        "box-shadow:0 1px 2px rgba(0,0,0,0.30), 0 6px 16px rgba(0,0,0,0.40);" +
        "backdrop-filter:blur(8px) saturate(140%);" +
        "-webkit-backdrop-filter:blur(8px) saturate(140%);"
      : "background:rgba(255,255,255,0.92);" +
        "color:#18181b;" +
        "border:1px solid rgba(0,0,0,0.08);" +
        "box-shadow:0 1px 2px rgba(0,0,0,0.06), 0 6px 16px rgba(0,0,0,0.18);" +
        "backdrop-filter:blur(6px);" +
        "-webkit-backdrop-filter:blur(6px);"
  const btnDone = () =>
    "background:var(--surface-success-base);" +
    "color:var(--text-on-success-base);" +
    "border:1px solid color-mix(in srgb, var(--surface-success-base) 50%, #fff);" +
    "box-shadow:0 1px 2px rgba(0,0,0,0.06), 0 6px 16px color-mix(in srgb, var(--surface-success-base) 35%, transparent);"

  return (
    <div class="group relative h-full">
      {props.children}
      <Show when={!props.hideHoverButtons && (showDownload() || showOpenFolder() || !!props.onRemove)}>
        <div class="absolute top-2 right-2 z-10 flex gap-1.5 opacity-0 translate-y-0.5 transition-all duration-200 ease-out group-hover:opacity-100 group-hover:translate-y-0">
          <Show when={props.onRemove}>
            <button
              type="button"
              title={props.removeLabel ?? "Hide from canvas"}
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                props.onRemove?.()
              }}
              class="flex items-center justify-center size-[30px] rounded-md transition-all duration-150 hover:scale-[1.08]"
              style={btnBase()}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path
                  d="M2.5 4.5h11M6 4.5V3a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1.5M4.5 4.5l.6 9a1.5 1.5 0 0 0 1.5 1.4h2.8a1.5 1.5 0 0 0 1.5-1.4l.6-9M7 7.5v4.5M9 7.5v4.5"
                  stroke="currentColor"
                  stroke-width="1.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
            </button>
          </Show>
          <Show when={showDownload()}>
            <button
              type="button"
              title={downloading() ? i18n.t("ui.download.downloading") : done() ? i18n.t("ui.download.downloaded") : i18n.t("ui.download.download")}
              disabled={downloading()}
              onClick={handleDownload}
              class="flex items-center justify-center size-[30px] rounded-md transition-all duration-150 disabled:opacity-40 hover:scale-[1.08]"
              style={done() ? btnDone() : btnBase()}
            >
              <Show
                when={done()}
                fallback={
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path
                      d="M8 2v8m0 0l3-3m-3 3l-3-3M3 13h10"
                      stroke="currentColor"
                      stroke-width="1.8"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    />
                  </svg>
                }
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path
                    d="M3.5 8.5l3 3 6-6"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
              </Show>
            </button>
          </Show>
          <Show when={showOpenFolder()}>
            <button
              type="button"
              title={i18n.t("ui.download.openInFolder")}
              onClick={handleOpenFolder}
              class="flex items-center justify-center size-[30px] rounded-full transition-all duration-150 hover:scale-[1.08]"
              style={btnBase()}
            >
              <Icon name="folder" size="small" />
            </button>
          </Show>
        </div>
      </Show>
    </div>
  )
}
