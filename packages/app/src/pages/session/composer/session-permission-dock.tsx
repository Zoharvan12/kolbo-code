import { For, Show, createEffect, onMount } from "solid-js"
import type { PermissionRequest } from "@opencode-ai/sdk/v2"
import { Button } from "@opencode-ai/ui/button"
import { DockPrompt } from "@opencode-ai/ui/dock-prompt"
import { Icon } from "@opencode-ai/ui/icon"
import { useLanguage } from "@/context/language"

export function SessionPermissionDock(props: {
  request: PermissionRequest
  responding: boolean
  onDecide: (response: "once" | "always" | "reject") => void
}) {
  const language = useLanguage()

  const toolDescription = () => {
    const key = `settings.permissions.tool.${props.request.permission}.description`
    const value = language.t(key as Parameters<typeof language.t>[0])
    if (value === key) return ""
    return value
  }

  // Surface the actual tool/permission name as a pill so the user sees
  // WHAT they're being asked to approve, not just a generic title.
  const actionTag = () => props.request.permission?.toUpperCase()

  let dockRoot: HTMLDivElement | undefined
  let primaryButton: HTMLButtonElement | undefined

  // Auto-scroll the dock into view on appearance — easy to miss otherwise
  // when the user is mid-scroll in a long conversation. Also focus the
  // primary "Allow once" button so keyboard users can hit Enter / Tab
  // through immediately without hunting for the buttons.
  onMount(() => {
    dockRoot?.scrollIntoView({ behavior: "smooth", block: "center" })
    // Defer focus so the parent dock-mount animation finishes first.
    requestAnimationFrame(() => primaryButton?.focus({ preventScroll: true }))
  })

  // If a NEW permission request comes in while one was already showing
  // (e.g. parallel tool calls), re-attract attention.
  createEffect(() => {
    void props.request.id
    dockRoot?.scrollIntoView({ behavior: "smooth", block: "center" })
  })

  return (
    <div ref={dockRoot}>
    <DockPrompt
      kind="permission"
      header={
        <div data-slot="permission-row" data-variant="header">
          <span data-slot="permission-icon">
            <Icon name="warning" size="normal" />
          </span>
          <div data-slot="permission-header-title">
            {language.t("notification.permission.title")}
            <Show when={actionTag()}>
              <span data-slot="permission-action-tag">{actionTag()}</span>
            </Show>
          </div>
        </div>
      }
      footer={
        <>
          <div />
          <div data-slot="permission-footer-actions">
            <Button variant="ghost" size="normal" onClick={() => props.onDecide("reject")} disabled={props.responding}>
              {language.t("ui.permission.deny")}
            </Button>
            <Button
              variant="secondary"
              size="normal"
              onClick={() => props.onDecide("always")}
              disabled={props.responding}
            >
              {language.t("ui.permission.allowAlways")}
            </Button>
            <Button
              ref={primaryButton}
              variant="primary"
              size="normal"
              onClick={() => props.onDecide("once")}
              disabled={props.responding}
            >
              {language.t("ui.permission.allowOnce")}
            </Button>
          </div>
        </>
      }
    >
      <Show when={toolDescription()}>
        <div data-slot="permission-row">
          <span data-slot="permission-spacer" aria-hidden="true" />
          <div data-slot="permission-hint">{toolDescription()}</div>
        </div>
      </Show>

      <Show when={props.request.patterns.length > 0}>
        <div data-slot="permission-row">
          <span data-slot="permission-spacer" aria-hidden="true" />
          <div data-slot="permission-patterns">
            <For each={props.request.patterns}>
              {(pattern) => <code class="text-12-regular text-text-base break-all">{pattern}</code>}
            </For>
          </div>
        </div>
      </Show>
    </DockPrompt>
    </div>
  )
}
