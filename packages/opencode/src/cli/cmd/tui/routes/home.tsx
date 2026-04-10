import { Prompt, type PromptRef } from "@tui/component/prompt"
import { createEffect, createMemo, createSignal } from "solid-js"
import { Logo } from "../component/logo"
import { useSync } from "../context/sync"
import { Toast } from "../ui/toast"
import { useArgs } from "../context/args"
import { useRouteData } from "@tui/context/route"
import { usePromptRef } from "../context/prompt"
import { useLocal } from "../context/local"
import { TuiPluginRuntime } from "../plugin"
import { useDialog } from "../ui/dialog"
import { DialogProvider } from "../component/dialog-provider"
import { DialogLanguage } from "../component/dialog-language"
import { useI18n } from "@/i18n"

// TODO: what is the best way to do this?
let once = false

export function Home() {
  const { t } = useI18n()
  const placeholder = createMemo(() => ({
    normal: [t("home.placeholder.fixTodo"), t("home.placeholder.techStack"), t("home.placeholder.fixTests")],
    shell: [t("home.shellPlaceholder.ls"), t("home.shellPlaceholder.gitStatus"), t("home.shellPlaceholder.pwd")],
  }))
  const sync = useSync()
  const route = useRouteData("home")
  const promptRef = usePromptRef()
  const [ref, setRef] = createSignal<PromptRef | undefined>()
  const args = useArgs()
  const local = useLocal()
  const dialog = useDialog()
  let sent = false

  // Always show language → auth flow if not connected — re-shows on ESC
  const connected = createMemo(() => sync.data.provider_next.connected.length > 0)
  const { isLanguageConfigured } = useI18n()
  createEffect(() => {
    if (!sync.ready) return
    if (connected()) return
    if (dialog.stack.length > 0) return
    if (!isLanguageConfigured()) {
      dialog.replace(() => <DialogLanguage onSelect={() => dialog.replace(() => <DialogProvider />)} />)
    } else {
      dialog.replace(() => <DialogProvider />)
    }
  })

  const bind = (r: PromptRef | undefined) => {
    setRef(r)
    promptRef.set(r)
    if (once || !r) return
    if (route.initialPrompt) {
      r.set(route.initialPrompt)
      once = true
      return
    }
    if (!args.prompt) return
    r.set({ input: args.prompt, parts: [] })
    once = true
  }

  // Wait for sync and model store to be ready before auto-submitting --prompt
  createEffect(() => {
    const r = ref()
    if (sent) return
    if (!r) return
    if (!sync.ready || !local.model.ready) return
    if (!args.prompt) return
    if (r.current.input !== args.prompt) return
    sent = true
    r.submit()
  })

  return (
    <>
      <box flexGrow={1} alignItems="center" paddingLeft={2} paddingRight={2}>
        <box flexGrow={1} minHeight={0} />
        <box height={4} minHeight={0} flexShrink={1} />
        <box flexShrink={0}>
          <TuiPluginRuntime.Slot name="home_logo" mode="replace">
            <Logo />
          </TuiPluginRuntime.Slot>
        </box>
        <box height={1} minHeight={0} flexShrink={1} />
        <box width="100%" maxWidth={75} zIndex={1000} paddingTop={1} flexShrink={0}>
          <TuiPluginRuntime.Slot name="home_prompt" mode="replace" workspace_id={route.workspaceID} ref={bind}>
            <Prompt
              ref={bind}
              workspaceID={route.workspaceID}
              right={<TuiPluginRuntime.Slot name="home_prompt_right" workspace_id={route.workspaceID} />}
              placeholders={placeholder()}
            />
          </TuiPluginRuntime.Slot>
        </box>
        <TuiPluginRuntime.Slot name="home_bottom" />
        <box flexGrow={1} minHeight={0} />
        <Toast />
      </box>
      <box width="100%" flexShrink={0}>
        <TuiPluginRuntime.Slot name="home_footer" mode="single_winner" />
      </box>
    </>
  )
}
