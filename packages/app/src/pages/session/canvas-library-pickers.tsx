import { For, Show, createMemo, createSignal, type JSX } from "solid-js"
import { DropdownMenu } from "@opencode-ai/ui/dropdown-menu"
import { Icon } from "@opencode-ai/ui/icon"
import type { LibraryFolder, LibraryProject } from "./canvas-library"

const TINTS = [
  "linear-gradient(135deg, rgba(59,130,246,0.28), rgba(59,130,246,0.06))",
  "linear-gradient(135deg, rgba(139,92,246,0.28), rgba(139,92,246,0.06))",
  "linear-gradient(135deg, rgba(16,185,129,0.28), rgba(16,185,129,0.06))",
  "linear-gradient(135deg, rgba(245,158,11,0.28), rgba(245,158,11,0.06))",
  "linear-gradient(135deg, rgba(99,102,241,0.28), rgba(99,102,241,0.06))",
]

function tint(id: string) {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0
  return TINTS[Math.abs(hash) % TINTS.length]
}

function hexColor(raw?: string | null) {
  if (!raw) return null
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(raw) ? raw : null
}

/** Soft cover tile — photo when present, quiet gradient fallback (kolbo-map CoverFallback). */
function ProjectMark(props: { id: string; src?: string | null; size: "chip" | "row" }) {
  const box = () => (props.size === "row" ? "size-9 rounded-xl" : "size-6 rounded-md")
  return (
    <span
      class={`${box()} shrink-0 overflow-hidden flex items-center justify-center ring-1 ring-border-weaker-base`}
      style={props.src ? { background: "var(--surface-recess-base)" } : { background: tint(props.id) }}
    >
      <Show
        when={props.src}
        fallback={
          <span
            class="pointer-events-none size-full"
            style="background:radial-gradient(circle at 30% 20%,rgba(255,255,255,0.18),transparent 60%)"
          />
        }
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

/** Tinted Lucide folder — same language as kolbo-map FolderSidebar (not a solid color blob). */
function FolderMark(props: { color?: string | null; size: "chip" | "row"; open?: boolean }) {
  const box = () => (props.size === "row" ? "size-9 rounded-xl" : "size-6 rounded-md")
  const color = () => hexColor(props.color) ?? "var(--text-weak)"
  return (
    <span
      class={`${box()} shrink-0 flex items-center justify-center bg-surface-recess-base ring-1 ring-border-weaker-base`}
    >
      <Icon
        name={props.open ? "folder-open" : "folder"}
        size={props.size === "row" ? "normal" : "small"}
        style={{
          color: color(),
          fill: color(),
          "fill-opacity": "0.35",
        }}
      />
    </span>
  )
}

function AllProjectsMark(props: { size: "chip" | "row" }) {
  const box = () => (props.size === "row" ? "size-9 rounded-xl" : "size-6 rounded-md")
  return (
    <span
      class={`${box()} shrink-0 flex items-center justify-center ring-1 ring-border-weaker-base`}
      style={{
        background: "color-mix(in oklch, var(--icon-info-base, #3b82f6) 18%, transparent)",
        color: "var(--icon-info-base, #60a5fa)",
      }}
    >
      <Icon name="folder-open" size={props.size === "row" ? "normal" : "small"} />
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
    <DropdownMenu.Item
      onSelect={props.onSelect}
      style={{ padding: "8px 10px", gap: "10px" }}
      title={props.title}
      classList={{ "bg-surface-raised-base-hover": props.active }}
    >
      {props.thumb}
      <DropdownMenu.ItemLabel class="truncate min-w-0 font-medium">{props.label}</DropdownMenu.ItemLabel>
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

/** Outer shell keeps rounded clip; scroll lives inside so rows are never sliced in half. */
function MenuShell(props: { children: JSX.Element; wide?: boolean }) {
  return (
    <DropdownMenu.Content
      class={props.wide ? "w-[min(360px,calc(100vw-2rem))] p-0" : "w-[min(300px,calc(100vw-2rem))] p-0"}
      style={{ overflow: "hidden", display: "flex", "flex-direction": "column" }}
    >
      <div
        class="flex flex-col min-h-0"
        style={{
          "max-height": "min(70vh, 480px)",
          overflow: "hidden",
        }}
      >
        {props.children}
      </div>
    </DropdownMenu.Content>
  )
}

function MenuScroll(props: { children: JSX.Element }) {
  return (
    <div class="flex-1 min-h-0 overflow-y-auto overscroll-contain p-1" style={{ "scrollbar-gutter": "stable" }}>
      {props.children}
    </div>
  )
}

export function ProjectPicker(props: {
  value: string
  projects: LibraryProject[]
  allLabel: string
  aria: string
  searchPlaceholder?: string
  onChange: (id: string) => void
}) {
  const [query, setQuery] = createSignal("")
  const selected = () => props.projects.find((p) => p.id === props.value)
  const filtered = createMemo(() => {
    const q = query().trim().toLowerCase()
    if (!q) return props.projects
    return props.projects.filter((p) => p.name.toLowerCase().includes(q))
  })

  return (
    <DropdownMenu
      gutter={8}
      placement="bottom-start"
      fitViewport
      overflowPadding={12}
      onOpenChange={(open) => {
        if (!open) setQuery("")
      }}
    >
      <Trigger
        label={selected()?.name ?? props.allLabel}
        aria={props.aria}
        thumb={
          <Show when={selected()} fallback={<AllProjectsMark size="chip" />}>
            {(p) => <ProjectMark id={p().id} src={p().thumbnail} size="chip" />}
          </Show>
        }
      />
      <DropdownMenu.Portal>
        <MenuShell wide>
          <div class="shrink-0 p-2 pb-1">
            <label class="relative flex items-center">
              <Icon
                name="magnifying-glass"
                size="small"
                class="pointer-events-none absolute left-2.5 opacity-45 text-text-weak"
              />
              <input
                type="search"
                value={query()}
                onInput={(e) => setQuery(e.currentTarget.value)}
                placeholder={props.searchPlaceholder ?? "Search"}
                class="w-full h-9 rounded-lg bg-surface-recess-base border border-border-weaker-base pl-8 pr-3 text-12-regular text-text-strong placeholder:text-text-weak outline-none focus:border-border-base"
                onKeyDown={(e) => e.stopPropagation()}
              />
            </label>
          </div>
          <MenuScroll>
            <Row
              label={props.allLabel}
              active={props.value === "all"}
              onSelect={() => props.onChange("all")}
              thumb={<AllProjectsMark size="row" />}
            />
            <For
              each={filtered()}
              fallback={
                <Show when={query().trim()}>
                  <div class="px-3 py-6 text-center text-12-regular text-text-weak">No matches</div>
                </Show>
              }
            >
              {(p) => (
                <Row
                  label={p.name}
                  title={p.name}
                  active={p.id === props.value}
                  onSelect={() => props.onChange(p.id)}
                  thumb={<ProjectMark id={p.id} src={p.thumbnail} size="row" />}
                />
              )}
            </For>
          </MenuScroll>
        </MenuShell>
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
    <DropdownMenu gutter={8} placement="bottom-end" fitViewport overflowPadding={12}>
      <Trigger
        label={selected() ? props.labelFor(selected()!, liveFor(selected()!.id)) : props.allLabel}
        aria={props.aria}
        title={selected() ? props.titleFor(selected()!, liveFor(selected()!.id)) : props.allLabel}
        thumb={
          <Show when={selected()} fallback={<FolderMark size="chip" open />}>
            {(f) => <FolderMark color={f().color} size="chip" />}
          </Show>
        }
      />
      <DropdownMenu.Portal>
        <MenuShell>
          <MenuScroll>
            <Row
              label={props.allLabel}
              active={!props.value}
              onSelect={() => props.onChange(null)}
              thumb={<FolderMark size="row" open />}
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
                      thumb={<FolderMark color={f.color} size="row" />}
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
                      thumb={<FolderMark color={f.color} size="row" />}
                    />
                  )}
                </For>
              </DropdownMenu.Group>
            </Show>
          </MenuScroll>
        </MenuShell>
      </DropdownMenu.Portal>
    </DropdownMenu>
  )
}
