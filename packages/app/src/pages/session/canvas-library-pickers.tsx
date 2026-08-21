import { For, Show, type JSX } from "solid-js"
import { DropdownMenu } from "@opencode-ai/ui/dropdown-menu"
import { Icon } from "@opencode-ai/ui/icon"
import type { LibraryFolder, LibraryProject } from "./canvas-library"

const TINTS = [
  "linear-gradient(135deg, rgba(59,130,246,0.25), rgba(59,130,246,0.05))",
  "linear-gradient(135deg, rgba(168,85,247,0.25), rgba(168,85,247,0.05))",
  "linear-gradient(135deg, rgba(16,185,129,0.25), rgba(16,185,129,0.05))",
  "linear-gradient(135deg, rgba(245,158,11,0.25), rgba(245,158,11,0.05))",
  "linear-gradient(135deg, rgba(244,63,94,0.25), rgba(244,63,94,0.05))",
]

function tint(id: string) {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0
  return TINTS[Math.abs(hash) % TINTS.length]
}

function Thumb(props: { id: string; src?: string | null; color?: string | null; size: "chip" | "row" }) {
  const box = () => (props.size === "row" ? "size-9 rounded-xl" : "size-6 rounded-md")
  return (
    <span
      class={`${box()} shrink-0 overflow-hidden flex items-center justify-center bg-surface-recess-base ring-1 ring-border-weaker-base`}
      style={
        props.src
          ? undefined
          : props.color
            ? { background: props.color }
            : { background: tint(props.id) }
      }
    >
      <Show
        when={props.src}
        fallback={<Icon name="folder" size="small" class="opacity-40 text-text-weak" />}
      >
        {(url) => (
          <img
            src={url()}
            alt=""
            loading="lazy"
            referrerpolicy="no-referrer"
            class="size-full object-cover"
            onError={(e) => (e.currentTarget.style.display = "none")}
          />
        )}
      </Show>
    </span>
  )
}

function Row(props: {
  label: string
  title?: string
  hint?: string
  active: boolean
  onSelect: () => void
  thumb?: JSX.Element
}) {
  return (
    <DropdownMenu.Item onSelect={props.onSelect} style={{ padding: "8px 10px", gap: "10px" }} title={props.title}>
      {props.thumb}
      <DropdownMenu.ItemLabel class="truncate min-w-0">{props.label}</DropdownMenu.ItemLabel>
      <Show when={props.hint}>
        <span class="shrink-0 text-11-regular text-text-weak">{props.hint}</span>
      </Show>
      <Show when={props.active}>
        <Icon name="check" size="small" class="shrink-0 text-text-strong" />
      </Show>
    </DropdownMenu.Item>
  )
}

function Trigger(props: { label: string; aria: string; title?: string; thumb?: JSX.Element }) {
  return (
    <DropdownMenu.Trigger
      type="button"
      aria-label={props.aria}
      title={props.title ?? props.label}
      class="flex items-center gap-2 min-w-0 flex-1 text-12-regular bg-surface-base border border-border-base rounded-lg px-2 py-1.5 text-text-strong hover:bg-surface-raised-base transition-colors"
    >
      {props.thumb}
      <span class="truncate min-w-0 flex-1 text-left">{props.label}</span>
      <Icon name="chevron-down" size="small" class="shrink-0 opacity-50" />
    </DropdownMenu.Trigger>
  )
}

export function ProjectPicker(props: {
  value: string
  projects: LibraryProject[]
  allLabel: string
  aria: string
  onChange: (id: string) => void
}) {
  const selected = () => props.projects.find((p) => p.id === props.value)
  return (
    <DropdownMenu gutter={6} placement="bottom-start">
      <Trigger
        label={selected()?.name ?? props.allLabel}
        aria={props.aria}
        thumb={
          <Show
            when={selected()}
            fallback={
              <span class="size-6 shrink-0 rounded-md flex items-center justify-center bg-surface-recess-base ring-1 ring-border-weaker-base">
                <Icon name="folder" size="small" class="opacity-40 text-text-weak" />
              </span>
            }
          >
            {(p) => <Thumb id={p().id} src={p().thumbnail} size="chip" />}
          </Show>
        }
      />
      <DropdownMenu.Portal>
        <DropdownMenu.Content class="min-w-[280px] max-w-[360px] max-h-[360px] overflow-y-auto">
          <Row
            label={props.allLabel}
            active={props.value === "all"}
            onSelect={() => props.onChange("all")}
            thumb={
              <span class="size-9 shrink-0 rounded-xl flex items-center justify-center bg-surface-recess-base ring-1 ring-border-weaker-base">
                <Icon name="folder" size="small" class="opacity-40 text-text-weak" />
              </span>
            }
          />
          <For each={props.projects}>
            {(p) => (
              <Row
                label={p.name}
                title={p.name}
                active={p.id === props.value}
                onSelect={() => props.onChange(p.id)}
                thumb={<Thumb id={p.id} src={p.thumbnail} size="row" />}
              />
            )}
          </For>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu>
  )
}

export function FolderPicker(props: {
  value: string | null
  owned: LibraryFolder[]
  shared: LibraryFolder[]
  allLabel: string
  ownedLabel: string
  sharedLabel: string
  aria: string
  live?: number
  labelFor: (folder: LibraryFolder, live?: number) => string
  titleFor: (folder: LibraryFolder, live?: number) => string
  onChange: (id: string | null) => void
}) {
  const selected = () => {
    const id = props.value
    if (!id) return undefined
    return [...props.owned, ...props.shared].find((f) => f.id === id)
  }
  const liveFor = (id: string) => (props.value === id ? props.live : undefined)
  return (
    <DropdownMenu gutter={6} placement="bottom-end">
      <Trigger
        label={selected() ? props.labelFor(selected()!, liveFor(selected()!.id)) : props.allLabel}
        aria={props.aria}
        title={selected() ? props.titleFor(selected()!, liveFor(selected()!.id)) : props.allLabel}
        thumb={
          <Show
            when={selected()}
            fallback={
              <span class="size-6 shrink-0 rounded-md flex items-center justify-center bg-surface-recess-base ring-1 ring-border-weaker-base">
                <Icon name="folder" size="small" class="opacity-40 text-text-weak" />
              </span>
            }
          >
            {(f) => <Thumb id={f().id} color={f().color} size="chip" />}
          </Show>
        }
      />
      <DropdownMenu.Portal>
        <DropdownMenu.Content class="min-w-[280px] max-w-[360px] max-h-[360px] overflow-y-auto">
          <Row
            label={props.allLabel}
            active={!props.value}
            onSelect={() => props.onChange(null)}
            thumb={
              <span class="size-9 shrink-0 rounded-xl flex items-center justify-center bg-surface-recess-base ring-1 ring-border-weaker-base">
                <Icon name="folder" size="small" class="opacity-40 text-text-weak" />
              </span>
            }
          />
          <Show when={props.owned.length > 0}>
            <DropdownMenu.Group>
              <DropdownMenu.GroupLabel>{props.ownedLabel}</DropdownMenu.GroupLabel>
              <For each={props.owned}>
                {(f) => (
                  <Row
                    label={props.labelFor(f, liveFor(f.id))}
                    title={props.titleFor(f, liveFor(f.id))}
                    active={props.value === f.id}
                    onSelect={() => props.onChange(f.id)}
                    thumb={<Thumb id={f.id} color={f.color} size="row" />}
                  />
                )}
              </For>
            </DropdownMenu.Group>
          </Show>
          <Show when={props.shared.length > 0}>
            <DropdownMenu.Group>
              <DropdownMenu.GroupLabel>{props.sharedLabel}</DropdownMenu.GroupLabel>
              <For each={props.shared}>
                {(f) => (
                  <Row
                    label={props.labelFor(f, liveFor(f.id))}
                    title={props.titleFor(f, liveFor(f.id))}
                    active={props.value === f.id}
                    onSelect={() => props.onChange(f.id)}
                    thumb={<Thumb id={f.id} color={f.color} size="row" />}
                  />
                )}
              </For>
            </DropdownMenu.Group>
          </Show>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu>
  )
}
