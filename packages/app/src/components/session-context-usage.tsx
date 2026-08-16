import { Match, Show, Switch, createMemo } from "solid-js"
import { Tooltip, type TooltipProps } from "@opencode-ai/ui/tooltip"
import { ProgressCircle } from "@opencode-ai/ui/progress-circle"
import { Button } from "@opencode-ai/ui/button"

import { useFile } from "@/context/file"
import { useLayout } from "@/context/layout"
import { useSync } from "@/context/sync"
import { useLanguage } from "@/context/language"
import { useProviders } from "@/hooks/use-providers"
import { costOf, read } from "@opencode-ai/ui/kolbo-operation"
import { getSessionContextMetrics } from "@/components/session/session-context-metrics"
import { useSessionLayout } from "@/pages/session/session-layout"
import { createSessionTabs } from "@/pages/session/helpers"

interface SessionContextUsageProps {
  variant?: "button" | "indicator"
  placement?: TooltipProps["placement"]
}

type KolboMediaKind = "image" | "video" | "audio" | "threeD"

function bucket(kind: string | undefined): KolboMediaKind | undefined {
  if (kind === "model3d") return "threeD"
  if (kind === "image" || kind === "video" || kind === "audio") return kind
}

function openSessionContext(args: {
  view: ReturnType<ReturnType<typeof useLayout>["view"]>
  layout: ReturnType<typeof useLayout>
  tabs: ReturnType<ReturnType<typeof useLayout>["tabs"]>
}) {
  if (!args.view.reviewPanel.opened()) args.view.reviewPanel.open()
  if (args.layout.fileTree.opened() && args.layout.fileTree.tab() !== "all") args.layout.fileTree.setTab("all")
  args.tabs.open("context")
  args.tabs.setActive("context")
}

export function SessionContextUsage(props: SessionContextUsageProps) {
  const sync = useSync()
  const file = useFile()
  const layout = useLayout()
  const language = useLanguage()
  const providers = useProviders()
  const { params, tabs, view } = useSessionLayout()

  const variant = createMemo(() => props.variant ?? "button")
  const tabState = createSessionTabs({
    tabs,
    pathFromTab: file.pathFromTab,
    normalizeTab: (tab) => (tab.startsWith("file://") ? file.tab(tab) : tab),
  })
  const messages = createMemo(() => (params.id ? (sync.data.message[params.id] ?? []) : []))

  const usd = createMemo(
    () =>
      new Intl.NumberFormat(language.intl(), {
        style: "currency",
        currency: "USD",
      }),
  )

  const metrics = createMemo(() => getSessionContextMetrics(messages(), providers.all()))
  const context = createMemo(() => metrics().context)
  const cost = createMemo(() => {
    return usd().format(metrics().totalCost)
  })

  // Per-session Kolbo credit spend broken down by media type (Image / Video /
  // Audio / 3D) — parsed from each generation tool's result. Beats the
  // Higgsfield reference by including 3D, which theirs omits.
  const creditsByType = createMemo(() => {
    const buckets: Record<KolboMediaKind, number> = { image: 0, video: 0, audio: 0, threeD: 0 }
    const id = params.id
    if (!id) return buckets
    for (const message of sync.data.message[id] ?? []) {
      for (const part of sync.data.part[message.id] ?? []) {
        if (part.type !== "tool" || part.state.status !== "completed") continue
        const out = (part.state as { output?: string }).output
        if (!out) continue
        const env = read(out)
        const credits = costOf(env, out)
        if (!credits) continue
        const kind = bucket(env?.kind)
        if (kind) buckets[kind] += credits
      }
    }
    return buckets
  })
  const totalCredits = createMemo(() => {
    const b = creditsByType()
    return b.image + b.video + b.audio + b.threeD
  })

  const openContext = () => {
    if (!params.id) return

    if (tabState.activeTab() === "context") {
      tabs().close("context")
      return
    }
    openSessionContext({
      view: view(),
      layout,
      tabs: tabs(),
    })
  }

  const circle = () => (
    <div class="flex items-center justify-center">
      <ProgressCircle size={16} strokeWidth={2} percentage={context()?.usage ?? 0} />
    </div>
  )

  const tooltipValue = () => (
    <div>
      <Show when={context()}>
        {(ctx) => (
          <>
            <div class="flex items-center gap-2">
              <span class="text-text-invert-strong">{ctx().total.toLocaleString(language.intl())}</span>
              <span class="text-text-invert-base">{language.t("context.usage.tokens")}</span>
            </div>
            <div class="flex items-center gap-2">
              <span class="text-text-invert-strong">{ctx().usage ?? 0}%</span>
              <span class="text-text-invert-base">{language.t("context.usage.usage")}</span>
            </div>
          </>
        )}
      </Show>
      <div class="flex items-center gap-2">
        <span class="text-text-invert-strong">{cost()}</span>
        <span class="text-text-invert-base">{language.t("context.usage.cost")}</span>
      </div>
      <Show when={totalCredits() > 0}>
        <div class="mt-1.5 pt-1.5 border-t border-border-weak-base flex flex-col gap-0.5">
          <div class="flex items-center gap-2">
            <span class="text-text-invert-strong">✦ {totalCredits().toLocaleString(language.intl())}</span>
            <span class="text-text-invert-base">{language.t("context.usage.credits")}</span>
          </div>
          <Show when={creditsByType().image > 0}>
            <div class="flex items-center justify-between gap-3">
              <span class="text-text-invert-base">{language.t("context.usage.credits.image")}</span>
              <span class="text-text-invert-strong tabular-nums">{creditsByType().image}</span>
            </div>
          </Show>
          <Show when={creditsByType().video > 0}>
            <div class="flex items-center justify-between gap-3">
              <span class="text-text-invert-base">{language.t("context.usage.credits.video")}</span>
              <span class="text-text-invert-strong tabular-nums">{creditsByType().video}</span>
            </div>
          </Show>
          <Show when={creditsByType().audio > 0}>
            <div class="flex items-center justify-between gap-3">
              <span class="text-text-invert-base">{language.t("context.usage.credits.audio")}</span>
              <span class="text-text-invert-strong tabular-nums">{creditsByType().audio}</span>
            </div>
          </Show>
          <Show when={creditsByType().threeD > 0}>
            <div class="flex items-center justify-between gap-3">
              <span class="text-text-invert-base">{language.t("context.usage.credits.threeD")}</span>
              <span class="text-text-invert-strong tabular-nums">{creditsByType().threeD}</span>
            </div>
          </Show>
        </div>
      </Show>
    </div>
  )

  return (
    <Show when={params.id}>
      <Tooltip value={tooltipValue()} placement={props.placement ?? "top"}>
        <Switch>
          <Match when={variant() === "indicator"}>{circle()}</Match>
          <Match when={true}>
            <Button
              type="button"
              variant="ghost"
              class="size-6"
              onClick={openContext}
              aria-label={language.t("context.usage.view")}
            >
              {circle()}
            </Button>
          </Match>
        </Switch>
      </Tooltip>
    </Show>
  )
}
