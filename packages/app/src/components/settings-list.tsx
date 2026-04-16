import { type Component, type JSX } from "solid-js"

export const SettingsList: Component<{ children: JSX.Element }> = (props) => {
  return <div class="bg-surface-base px-4 rounded-lg ring-1 ring-border-weak-base ring-inset">{props.children}</div>
}
