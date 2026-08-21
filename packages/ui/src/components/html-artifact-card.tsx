import { createEffect, createSignal, Match, Show, Switch } from "solid-js"
import { usePlatformOps } from "../context/platform-ops"
import { useI18n } from "../context/i18n"
import { dispatchArtifact, resolveHtmlPreviewSource } from "../lib/artifact"

const HEAVY = 250_000

export function HtmlArtifactCard(props: { content: string; autoOpen?: boolean }) {
  const ops = usePlatformOps()
  const i18n = useI18n()
  // Two long-lived URL slots — never remount the warm iframe on edit.
  const [slotA, setSlotA] = createSignal<string | null>(null)
  const [slotB, setSlotB] = createSignal<string | null>(null)
  const [front, setFront] = createSignal<"a" | "b">("a")
  const [pendingSlot, setPendingSlot] = createSignal<"a" | "b" | null>(null)
  const [srcdoc, setSrcdoc] = createSignal<string | null>(null)
  const [painted, setPainted] = createSignal(false)
  const [busy, setBusy] = createSignal(false)

  createEffect(() => {
    const content = props.content
    if (!content) {
      setSlotA(null)
      setSlotB(null)
      setSrcdoc(null)
      setPendingSlot(null)
      setPainted(false)
      setBusy(false)
      return
    }
    // Heavy srcdoc freezes WebView2 — wait for HTTP preview only.
    if (content.length > HEAVY && !ops.htmlPreviewUrl) {
      setBusy(false)
      return
    }
    let stale = false
    setBusy(true)
    void resolveHtmlPreviewSource(ops, content).then((next) => {
      if (stale) return
      setBusy(false)
      if (next.kind === "srcdoc") {
        if (content.length > HEAVY) return
        setSrcdoc(next.content)
        setSlotA(null)
        setSlotB(null)
        setPendingSlot(null)
        setPainted(false)
        return
      }
      setSrcdoc(null)
      const f = front()
      const shown = f === "a" ? slotA() : slotB()
      if (!shown) {
        if (f === "a") setSlotA(next.url)
        else setSlotB(next.url)
        setPainted(false)
        return
      }
      if (shown === next.url) return
      const back = f === "a" ? "b" : "a"
      if (back === "a") setSlotA(next.url)
      else setSlotB(next.url)
      setPendingSlot(back)
    })
    return () => {
      stale = true
    }
  })

  const promote = (slot: "a" | "b") => {
    if (pendingSlot() === slot) {
      setFront(slot)
      setPendingSlot(null)
    }
    setPainted(true)
  }

  const open = () => dispatchArtifact(props.content, "html", props.autoOpen ?? true)

  return (
    <div
      data-slot="markdown-html-inline-preview"
      data-loading={!painted() || busy() ? "" : undefined}
      data-ready={painted() ? "" : undefined}
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
      <Show when={!painted()}>
        <div data-slot="markdown-html-preview-skeleton" aria-hidden="true">
          <span data-slot="markdown-html-preview-spinner" />
        </div>
      </Show>
      <Switch>
        <Match when={srcdoc()}>
          {(doc) => (
            <iframe
              sandbox="allow-scripts allow-same-origin allow-popups"
              srcdoc={doc()}
              title="HTML preview"
              data-ready={painted() ? "" : undefined}
              onLoad={() => setPainted(true)}
            />
          )}
        </Match>
        <Match when={!srcdoc()}>
          <>
            <iframe
              src={slotA() ?? undefined}
              title="HTML preview A"
              data-ready={painted() && front() === "a" ? "" : undefined}
              onLoad={() => {
                if (slotA()) promote("a")
              }}
              style={{
                opacity: front() === "a" && slotA() ? "1" : "0",
                "pointer-events": "none",
                "z-index": front() === "a" ? "1" : "0",
              }}
            />
            <iframe
              src={slotB() ?? undefined}
              title="HTML preview B"
              data-ready={painted() && front() === "b" ? "" : undefined}
              onLoad={() => {
                if (slotB()) promote("b")
              }}
              style={{
                opacity: front() === "b" && slotB() ? "1" : "0",
                "pointer-events": "none",
                "z-index": front() === "b" ? "1" : "0",
              }}
            />
          </>
        </Match>
      </Switch>
      <div data-slot="markdown-html-preview-overlay">
        <div data-slot="markdown-html-preview-label">{i18n.t("ui.artifact.preview")}</div>
      </div>
    </div>
  )
}
