import { createSignal } from "solid-js"
import { showToast, Toast, toaster } from "@opencode-ai/ui/toast"
import type { Platform } from "@/context/platform"
import type { useLanguage } from "@/context/language"

type T = ReturnType<typeof useLanguage>["t"]

function size(bytes: number) {
  const mb = bytes / (1024 * 1024)
  if (mb >= 10) return `${Math.round(mb)} MB`
  return `${mb.toFixed(1)} MB`
}

export function installAppUpdate(platform: Platform, t: T) {
  if (platform.installUpdate) {
    const [title, setTitle] = createSignal(t("toast.update.downloading", { pct: 0 }))
    toaster.show((props) => (
      <Toast toastId={props.toastId} persistent>
        <Toast.Content>
          <Toast.Title>{title()}</Toast.Title>
        </Toast.Content>
      </Toast>
    ))
    return platform
      .installUpdate((p) => {
        if (p.total) {
          const pct = Math.min(100, Math.round((p.downloaded / p.total) * 100))
          setTitle(pct >= 100 ? t("toast.update.installing") : t("toast.update.downloading", { pct }))
          return
        }
        setTitle(t("toast.update.downloadingSize", { size: size(p.downloaded) }))
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err)
        showToast({ title: "Update failed", description: msg })
      })
  }

  if (!platform.update || !platform.restart) return Promise.resolve()
  return platform
    .update()
    .then(() => platform.restart!())
    .catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err)
      showToast({ title: "Update failed", description: msg })
    })
}
