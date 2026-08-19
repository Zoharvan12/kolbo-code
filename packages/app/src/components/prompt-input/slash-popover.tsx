import { Component, For, Match, Show, Switch } from "solid-js"
import { FileIcon } from "@opencode-ai/ui/file-icon"
import { Icon } from "@opencode-ai/ui/icon"
import { getDirectory, getFilename } from "@opencode-ai/util/path"

export type AtOption =
  | { type: "agent"; name: string; display: string }
  | { type: "file"; path: string; display: string; recent?: boolean }
  | { type: "image"; id: string; display: string; mime: string; url: string }
  // Split per `type` rather than one member with a union discriminant, so the
  // narrowing chain in the popover still eliminates these before the file branch.
  | { type: "visual-dna"; id: string; name: string; display: string; thumbnail?: string; dnaType?: string }
  | { type: "moodboard"; id: string; name: string; display: string; thumbnail?: string }

export interface SlashCommand {
  id: string
  trigger: string
  title: string
  description?: string
  keybind?: string
  type: "builtin" | "custom"
  source?: "command" | "mcp" | "skill"
}

type PromptPopoverProps = {
  popover: "at" | "slash" | null
  /** "up" (default): opens above the input — the bottom-docked composer.
   *  "down": opens below — the new-session page's composer sits at the TOP of
   *  a scroll container, and an upward popover clips against its edge. */
  direction?: "up" | "down"
  setSlashPopoverRef: (el: HTMLDivElement) => void
  atFlat: AtOption[]
  atActive?: string
  atKey: (item: AtOption) => string
  setAtActive: (id: string) => void
  onAtSelect: (item: AtOption) => void
  slashFlat: SlashCommand[]
  slashActive?: string
  setSlashActive: (id: string) => void
  onSlashSelect: (item: SlashCommand) => void
  commandKeybind: (id: string) => string | undefined
  t: (key: string) => string
}

export const PromptPopover: Component<PromptPopoverProps> = (props) => {
  return (
    <Show when={props.popover}>
      <div
        ref={(el) => {
          if (props.popover === "slash") props.setSlashPopoverRef(el)
        }}
        classList={{
          "absolute inset-x-0 max-h-80 min-h-10 overflow-auto no-scrollbar flex flex-col p-2 rounded-[12px] bg-surface-raised-stronger-non-alpha shadow-[var(--shadow-lg-border-base)]": true,
          "-top-2 -translate-y-full origin-bottom-left": props.direction !== "down",
          "top-full mt-2 origin-top-left z-50": props.direction === "down",
        }}
        onMouseDown={(e) => e.preventDefault()}
      >
        <Switch>
          <Match when={props.popover === "at"}>
            <Show
              when={props.atFlat.length > 0}
              fallback={<div class="text-text-weak px-2 py-1">{props.t("prompt.popover.emptyResults")}</div>}
            >
              <For each={props.atFlat.slice(0, 10)}>
                {(item, index) => {
                  const key = props.atKey(item)

                  if (item.type === "image") {
                    return (
                      <button
                        class="w-full flex items-center gap-x-2 rounded-md px-2 py-0.5"
                        classList={{ "bg-surface-raised-base-hover": props.atActive === key }}
                        onClick={() => props.onAtSelect(item)}
                        onMouseEnter={() => props.setAtActive(key)}
                      >
                        <Show
                          when={item.mime.startsWith("image/")}
                          fallback={<FileIcon node={{ path: item.display, type: "file" }} class="shrink-0 size-4" />}
                        >
                          <img src={item.url} alt="" class="shrink-0 size-6 rounded-[3px] object-cover" />
                        </Show>
                        <span class="text-14-regular text-text-strong truncate min-w-0">{item.display}</span>
                      </button>
                    )
                  }

                  // Attachments are their own group at the top — separate them from files/agents.
                  const divider = index() > 0 && props.atFlat[index() - 1]?.type === "image"

                  if (item.type === "agent") {
                    return (
                      <button
                        class="w-full flex items-center gap-x-2 rounded-md px-2 py-0.5"
                        classList={{
                          "bg-surface-raised-base-hover": props.atActive === key,
                          "mt-1 pt-1 border-t border-border-weaker-base rounded-t-none": divider,
                        }}
                        onClick={() => props.onAtSelect(item)}
                        onMouseEnter={() => props.setAtActive(key)}
                      >
                        <Icon name="brain" size="small" class="text-icon-info-active shrink-0" />
                        <span class="text-14-regular text-text-strong whitespace-nowrap">@{item.name}</span>
                      </button>
                    )
                  }

                  if (item.type === "visual-dna" || item.type === "moodboard") {
                    const sigil = item.type === "moodboard" ? "#" : "@"
                    return (
                      <button
                        class="w-full flex items-center gap-x-2 rounded-md px-2 py-0.5"
                        classList={{
                          "bg-surface-raised-base-hover": props.atActive === key,
                          "mt-1 pt-1 border-t border-border-weaker-base rounded-t-none": divider,
                        }}
                        onClick={() => props.onAtSelect(item)}
                        onMouseEnter={() => props.setAtActive(key)}
                      >
                        <Show
                          when={item.thumbnail}
                          fallback={
                            <Icon
                              name={item.type === "moodboard" ? "moodboard" : "dna"}
                              size="small"
                              class="text-icon-info-active shrink-0"
                            />
                          }
                        >
                          <img
                            src={item.thumbnail}
                            alt=""
                            loading="lazy"
                            class="shrink-0 size-6 rounded-[3px] object-cover"
                          />
                        </Show>
                        <span class="text-14-regular text-text-strong truncate min-w-0">
                          {sigil}
                          {item.name}
                        </span>
                        <Show when={item.type === "visual-dna" ? item.dnaType : undefined}>
                          {(dnaType) => <span class="text-11-regular text-text-subtle shrink-0">{dnaType()}</span>}
                        </Show>
                      </button>
                    )
                  }

                  const isDirectory = item.path.endsWith("/")
                  const directory = isDirectory ? item.path : getDirectory(item.path)
                  const filename = isDirectory ? "" : getFilename(item.path)

                  return (
                    <button
                      class="w-full flex items-center gap-x-2 rounded-md px-2 py-0.5"
                      classList={{
                        "bg-surface-raised-base-hover": props.atActive === key,
                        "mt-1 pt-1 border-t border-border-weaker-base rounded-t-none": divider,
                      }}
                      onClick={() => props.onAtSelect(item)}
                      onMouseEnter={() => props.setAtActive(key)}
                    >
                      <FileIcon node={{ path: item.path, type: "file" }} class="shrink-0 size-4" />
                      <div class="flex items-center text-14-regular min-w-0">
                        <span class="text-text-weak whitespace-nowrap truncate min-w-0">{directory}</span>
                        <Show when={!isDirectory}>
                          <span class="text-text-strong whitespace-nowrap">{filename}</span>
                        </Show>
                      </div>
                    </button>
                  )
                }}
              </For>
            </Show>
          </Match>
          <Match when={props.popover === "slash"}>
            <Show
              when={props.slashFlat.length > 0}
              fallback={<div class="text-text-weak px-2 py-1">{props.t("prompt.popover.emptyCommands")}</div>}
            >
              <For each={props.slashFlat}>
                {(cmd) => (
                  <button
                    data-slash-id={cmd.id}
                    classList={{
                      "w-full flex items-center justify-between gap-4 rounded-md px-2 py-1": true,
                      "bg-surface-raised-base-hover": props.slashActive === cmd.id,
                    }}
                    onClick={() => props.onSlashSelect(cmd)}
                    onMouseEnter={() => props.setSlashActive(cmd.id)}
                  >
                    <div class="flex items-center gap-2 min-w-0">
                      <span class="text-14-regular text-text-strong whitespace-nowrap">/{cmd.trigger}</span>
                      <Show when={cmd.description}>
                        <span class="text-14-regular text-text-weak truncate">{cmd.description}</span>
                      </Show>
                    </div>
                    <div class="flex items-center gap-2 shrink-0">
                      <Show when={cmd.type === "custom" && cmd.source !== "command"}>
                        <span class="text-11-regular text-text-subtle px-1.5 py-0.5 bg-surface-base rounded">
                          {cmd.source === "skill"
                            ? props.t("prompt.slash.badge.skill")
                            : cmd.source === "mcp"
                              ? props.t("prompt.slash.badge.mcp")
                              : props.t("prompt.slash.badge.custom")}
                        </span>
                      </Show>
                      <Show when={props.commandKeybind(cmd.id)}>
                        <span class="text-12-regular text-text-subtle">{props.commandKeybind(cmd.id)}</span>
                      </Show>
                    </div>
                  </button>
                )}
              </For>
            </Show>
          </Match>
        </Switch>
      </div>
    </Show>
  )
}
