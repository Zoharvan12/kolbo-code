import type { TuiPlugin, TuiPluginModule } from "@opencode-ai/plugin/tui"
import { createMemo, Show } from "solid-js"
import { Tips } from "./tips-view"

const id = "internal:home-tips"

function View(props: { show: boolean }) {
  // paddingTop used to be 3 (plus height=4), which pushed the tip down to
  // the bottom of its own container and — on short terminals — ended up
  // overlapping the directory footer. paddingTop=1 keeps the tip close to
  // the prompt above and leaves the flexGrow spacer in home.tsx to hold
  // the footer well below it.
  return (
    <box height={2} minHeight={0} width="100%" maxWidth={75} alignItems="center" paddingTop={1} flexShrink={1}>
      <Show when={props.show}>
        <Tips />
      </Show>
    </box>
  )
}

const tui: TuiPlugin = async (api) => {
  api.command.register(() => [
    {
      title: api.kv.get("tips_hidden", false) ? "Show tips" : "Hide tips",
      value: "tips.toggle",
      keybind: "tips_toggle",
      category: "System",
      hidden: api.route.current.name !== "home",
      onSelect() {
        api.kv.set("tips_hidden", !api.kv.get("tips_hidden", false))
        api.ui.dialog.clear()
      },
    },
  ])

  api.slots.register({
    order: 100,
    slots: {
      home_bottom() {
        const hidden = createMemo(() => api.kv.get("tips_hidden", false))
        const first = createMemo(() => api.state.session.count() === 0)
        const show = createMemo(() => !first() && !hidden())
        return <View show={show()} />
      },
    },
  })
}

const plugin: TuiPluginModule & { id: string } = {
  id,
  tui,
}

export default plugin
