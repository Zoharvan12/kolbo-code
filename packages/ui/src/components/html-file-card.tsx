import { usePlatformOps } from "../context/platform-ops"
import { Icon } from "./icon"

type HtmlFileCardProps = {
  /** The file:// URL or absolute path to the HTML file */
  path: string
  /** Display label (defaults to filename) */
  label?: string
}

function extractFilename(path: string): string {
  // Normalise file:// prefix
  const cleaned = path.replace(/^file:\/\/\/?/, "").replace(/\\/g, "/")
  return cleaned.split("/").pop() || path
}

export function HtmlFileCard(props: HtmlFileCardProps) {
  const ops = usePlatformOps()

  const label = () => props.label || extractFilename(props.path)

  const handleOpen = () => {
    const p = props.path
    if (!p) return
    if (ops.openPath) {
      void ops.openPath(p.replace(/^file:\/\/\/?/, ""))
    } else if (ops.openLink) {
      ops.openLink(p.startsWith("file://") ? p : `file:///${p.replace(/\\/g, "/")}`)
    }
  }

  return (
    <div
      data-component="html-file-card"
      class="group mt-2 flex cursor-pointer items-center gap-3 rounded border border-border-weak-base bg-background-stronger px-3 py-2.5 transition-colors hover:border-border-base hover:bg-background-strongest"
      onClick={handleOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && handleOpen()}
    >
      {/* HTML badge */}
      <div class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded bg-background-strongest text-10-semibold text-text-weak group-hover:text-text-strong">
        HTML
      </div>

      {/* Filename */}
      <span class="flex-1 truncate text-14-regular text-text-base group-hover:text-text-strong">
        {label()}
      </span>

      {/* Open icon */}
      <Icon name="open-file" size="small" class="flex-shrink-0 text-text-weak group-hover:text-text-strong" />
    </div>
  )
}
