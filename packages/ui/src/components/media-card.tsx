import { createSignal, Show, type JSX } from "solid-js"
import { Icon } from "./icon"
import { usePlatformOps } from "../context/platform-ops"
import { useI18n } from "../context/i18n"
import { showToast } from "./toast"

export type MediaCardProps = {
  children: JSX.Element
  /** The current renderable source — data URL or http URL */
  src?: string
  /** Original file path or URL (used to determine remote vs local) */
  path?: string
  /** Suggested filename for downloads */
  filename?: string
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
  const [downloading, setDownloading] = createSignal(false)
  const [done, setDone] = createSignal(false)

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

  return (
    <div class="group relative">
      {props.children}
      <Show when={showDownload() || showOpenFolder()}>
        <div class="absolute top-2 right-2 z-10 flex gap-1.5 opacity-0 translate-y-1 transition-all duration-200 ease-out group-hover:opacity-100 group-hover:translate-y-0">
          <Show when={showDownload()}>
            <button
              type="button"
              title={downloading() ? i18n.t("ui.download.downloading") : done() ? i18n.t("ui.download.downloaded") : i18n.t("ui.download.download")}
              disabled={downloading()}
              onClick={handleDownload}
              class={`flex items-center justify-center size-[30px] rounded-md border backdrop-blur-[8px] shadow-[0_2px_8px_rgba(0,0,0,0.45)] transition-all duration-150 disabled:opacity-40 ${
                done()
                  ? "bg-green-500/15 border-green-500/35 text-green-400"
                  : "bg-black/58 border-white/[0.15] text-white/85 hover:bg-black/72 hover:border-white/28 hover:text-white"
              }`}
            >
              <Icon name={done() ? "check-small" : "download"} size="small" />
            </button>
          </Show>
          <Show when={showOpenFolder()}>
            <button
              type="button"
              title={i18n.t("ui.download.openInFolder")}
              onClick={handleOpenFolder}
              class="flex items-center justify-center size-[30px] rounded-md border border-white/[0.15] bg-black/58 backdrop-blur-[8px] text-white/85 shadow-[0_2px_8px_rgba(0,0,0,0.45)] transition-all duration-150 hover:bg-black/72 hover:border-white/28 hover:text-white"
            >
              <Icon name="folder" size="small" />
            </button>
          </Show>
        </div>
      </Show>
    </div>
  )
}
