import { Show, createMemo } from "solid-js"
import { DropdownMenu } from "@opencode-ai/ui/dropdown-menu"
import { ProgressCircle } from "@opencode-ai/ui/progress-circle"

import { useFile } from "@/context/file"
import { useLayout } from "@/context/layout"
import { useSync } from "@/context/sync"
import { useLanguage } from "@/context/language"
import { useProviders } from "@/hooks/use-providers"
import { useSessionUsage } from "@/hooks/use-session-usage"
import { getSessionContextMetrics } from "@/components/session/session-context-metrics"
import { useSessionLayout } from "@/pages/session/session-layout"

/**
 * The one usage surface. Replaces an unlabelled 16px progress circle whose
 * numbers only appeared on hover.
 *
 * AGENT SPEND ONLY, deliberately. Media credits are tagged with a
 * caller_session_id that identifies the app INSTALL, not the chat, so the only
 * narrowing available is a start date — which reports "everything this install
 * generated since this chat began" and reads as all-time on a long-lived chat.
 * A wrong number is worse than no number. Restore it when kolbo-api can total
 * by the generation ids that actually belong to this session.
 */

function Row(props: { label: string; value: string; strong?: boolean }) {
  return (
    <div class="flex items-center justify-between gap-6 px-3 py-1">
      <span classList={{ "text-12-regular": true, "text-text-weak": !props.strong, "text-text-base": !!props.strong }}>
        {props.label}
      </span>
      <span
        classList={{
          "text-12-medium tabular-nums": true,
          "text-text-base": !props.strong,
          "text-text-strong": !!props.strong,
        }}
      >
        {props.value}
      </span>
    </div>
  )
}

export function SessionUsageMenu() {
  const sync = useSync()
  const file = useFile()
  const layout = useLayout()
  const language = useLanguage()
  const providers = useProviders()
  const usage = useSessionUsage()
  const { params, tabs, view } = useSessionLayout()

  const messages = createMemo(() => (params.id ? (sync.data.message[params.id] ?? []) : []))
  const context = createMemo(() => getSessionContextMetrics(messages(), providers.all()).context)
  const num = (value: number) => value.toLocaleString(language.intl())
  const total = createMemo(() => usage.agentCredits())

  const openDetails = () => {
    if (!params.id) return
    const v = view()
    if (!v.reviewPanel.opened()) v.reviewPanel.open()
    if (layout.fileTree.opened() && layout.fileTree.tab() !== "all") layout.fileTree.setTab("all")
    tabs().open("context")
    tabs().setActive("context")
  }

  return (
    <Show when={params.id}>
      <DropdownMenu gutter={4} placement="bottom-end">
        <DropdownMenu.Trigger
          class="flex items-center gap-1.5 h-6 px-1.5 rounded-md text-12-regular text-text-weak hover:text-text-base hover:bg-background-element"
          aria-label={language.t("context.usage.view")}
        >
          <ProgressCircle size={14} strokeWidth={2} percentage={context()?.usage ?? 0} />
          <span>Usage</span>
          <Show when={total() > 0}>
            <span class="text-text-base tabular-nums">✦ {num(total())}</span>
          </Show>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content style={{ "min-width": "236px" }}>
            <div class="py-1.5">
              <div class="px-3 pb-1 text-11-medium text-text-weaker uppercase tracking-wide">Agent</div>
              <Row label="Credits" value={num(usage.agentCredits())} />
              <Show when={context()}>
                {(ctx) => (
                  <>
                    <Row label="Tokens" value={num(ctx().total)} />
                    <Row label="Context used" value={`${ctx().usage ?? 0}%`} />
                  </>
                )}
              </Show>

              <div class="mt-1.5 pt-1.5 border-t border-border-weak-base">
                <Show when={usage.balance() !== null}>
                  <Row label="Balance" value={num(usage.balance()!)} strong />
                </Show>
                <DropdownMenu.Item onSelect={openDetails}>
                  <DropdownMenu.ItemLabel>{language.t("context.usage.view")}</DropdownMenu.ItemLabel>
                </DropdownMenu.Item>
              </div>
            </div>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu>
    </Show>
  )
}
