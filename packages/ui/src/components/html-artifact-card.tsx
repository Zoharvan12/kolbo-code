import { createEffect, createSignal, Match, Switch } from "solid-js"
import { usePlatformOps } from "../context/platform-ops"
import { useI18n } from "../context/i18n"
import { dispatchArtifact, resolveHtmlPreviewSource, type HtmlPreviewSource } from "../lib/artifact"

export function HtmlArtifactCard(props: { content: string; autoOpen?: boolean }) {
  const ops = usePlatformOps()
  const i18n = useI18n()
  const [source, setSource] = createSignal<HtmlPreviewSource | null>(null)

  createEffect(() => {
    const content = props.content
    if (!content) {
      setSource(null)
      return
    }
    let stale = false
    void resolveHtmlPreviewSource(ops, content).then((next) => {
      if (!stale) setSource(next)
    })
    return () => {
      stale = true
    }
  })

  const open = () => dispatchArtifact(props.content, "html", props.autoOpen ?? true)

  return (
    <div
      data-slot="markdown-html-inline-preview"
      role="button"
      tabindex="0"
      title={i18n.t("ui.artifact.preview")}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          open()
        }
      }}
    >
      <Switch>
        <Match when={source()?.kind === "url" && (source() as { kind: "url"; url: string })}>
          {(s) => <iframe src={s().url} title="HTML preview" loading="lazy" />}
        </Match>
        <Match when={source()?.kind === "srcdoc" && (source() as { kind: "srcdoc"; content: string })}>
          {(s) => (
            <iframe
              sandbox="allow-scripts allow-same-origin allow-popups"
              srcdoc={s().content}
              title="HTML preview"
              loading="lazy"
            />
          )}
        </Match>
      </Switch>
      <div data-slot="markdown-html-preview-overlay">
        <div data-slot="markdown-html-preview-label">{i18n.t("ui.artifact.preview")}</div>
      </div>
    </div>
  )
}
