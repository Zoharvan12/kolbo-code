import { createEffect, createMemo, For, Show, type Accessor, type JSX } from "solid-js"
import {
  DragDropProvider,
  DragDropSensors,
  DragOverlay,
  SortableProvider,
  closestCenter,
  type DragEvent,
} from "@thisbeyond/solid-dnd"
import { ConstrainDragXAxis } from "@/utils/solid-dnd"
import { Icon } from "@opencode-ai/ui/icon"
import { Tooltip, TooltipKeybind } from "@opencode-ai/ui/tooltip"
import { type LocalProject } from "@/context/layout"
import { RAIL_TW } from "./sidebar-metrics"

export const SidebarContent = (props: {
  mobile?: boolean
  opened: Accessor<boolean>
  aimMove: (event: MouseEvent) => void
  projects: Accessor<LocalProject[]>
  renderProject: (project: LocalProject) => JSX.Element
  handleDragStart: (event: unknown) => void
  handleDragEnd: () => void
  handleDragOver: (event: DragEvent) => void
  openProjectLabel: JSX.Element
  openProjectKeybind: Accessor<string | undefined>
  onOpenProject: () => void
  renderProjectOverlay: () => JSX.Element
  settingsLabel: Accessor<string>
  settingsKeybind: Accessor<string | undefined>
  onOpenSettings: () => void
  helpLabel: Accessor<string>
  onOpenHelp: () => void
  renderPanel: () => JSX.Element
}): JSX.Element => {
  const expanded = createMemo(() => !!props.mobile || props.opened())
  const placement = () => (props.mobile ? "bottom" : "right")
  let panel: HTMLDivElement | undefined

  createEffect(() => {
    const el = panel
    if (!el) return
    if (expanded()) {
      el.removeAttribute("inert")
      return
    }
    el.setAttribute("inert", "")
  })

  return (
    <div class="flex h-full w-full min-w-0 overflow-hidden">
      <div
        data-component="sidebar-rail"
        class={`${RAIL_TW} shrink-0 bg-background-stronger flex flex-col overflow-hidden`}
        onMouseMove={props.aimMove}
      >
        <div class="flex-1 min-h-0 w-full">
          <DragDropProvider
            onDragStart={props.handleDragStart}
            onDragEnd={props.handleDragEnd}
            onDragOver={props.handleDragOver}
            collisionDetector={closestCenter}
          >
            <DragDropSensors />
            <ConstrainDragXAxis />
            <div class="h-full w-full flex flex-col items-stretch gap-1 px-2 py-3 overflow-y-auto no-scrollbar">
              <SortableProvider ids={props.projects().map((p) => p.worktree)}>
                <For each={props.projects()}>{(project) => props.renderProject(project)}</For>
              </SortableProvider>
              <Tooltip
                placement={placement()}
                value={
                  <div class="flex items-center gap-2">
                    <span>{props.openProjectLabel}</span>
                    <Show when={!props.mobile && !!props.openProjectKeybind()}>
                      <span class="text-icon-base text-12-medium">{props.openProjectKeybind()}</span>
                    </Show>
                  </div>
                }
              >
                <button
                  type="button"
                  onClick={props.onOpenProject}
                  aria-label={typeof props.openProjectLabel === "string" ? props.openProjectLabel : undefined}
                  class="flex h-9 w-full items-center gap-2 px-1.5 rounded-lg border border-dashed border-border-base text-icon-weak transition-all duration-200 cursor-pointer hover:border-text-interactive-base hover:text-text-interactive-base hover:bg-surface-base-hover"
                >
                  <Icon name="plus" size="small" class="shrink-0" />
                  <span class="min-w-0 flex-1 truncate text-12-medium text-start">
                    {props.openProjectLabel}
                  </span>
                </button>
              </Tooltip>
            </div>
            <DragOverlay>{props.renderProjectOverlay()}</DragOverlay>
          </DragDropProvider>
        </div>
        <div class="shrink-0 w-full px-2 pt-2 pb-4 flex flex-col gap-0.5">
          <TooltipKeybind placement={placement()} title={props.settingsLabel()} keybind={props.settingsKeybind() ?? ""}>
            <button
              type="button"
              onClick={props.onOpenSettings}
              aria-label={props.settingsLabel()}
              class="flex h-9 w-full items-center gap-2 px-1.5 rounded-lg text-icon-weak transition-colors cursor-pointer hover:bg-surface-base-hover hover:text-text-strong"
            >
              <Icon name="settings-gear" size="small" class="shrink-0" />
              <span class="min-w-0 flex-1 truncate text-12-medium text-start text-text-base">
                {props.settingsLabel()}
              </span>
            </button>
          </TooltipKeybind>
          <Tooltip placement={placement()} value={props.helpLabel()}>
            <button
              type="button"
              onClick={props.onOpenHelp}
              aria-label={props.helpLabel()}
              class="flex h-9 w-full items-center gap-2 px-1.5 rounded-lg text-icon-weak transition-colors cursor-pointer hover:bg-surface-base-hover hover:text-text-strong"
            >
              <Icon name="help" size="small" class="shrink-0" />
              <span class="min-w-0 flex-1 truncate text-12-medium text-start text-text-base">{props.helpLabel()}</span>
            </button>
          </Tooltip>
        </div>
      </div>

      <div
        ref={(el) => {
          panel = el
        }}
        classList={{ "flex-1 flex h-full min-h-0 min-w-0 overflow-hidden": true, "pointer-events-none": !expanded() }}
        aria-hidden={!expanded()}
      >
        {props.renderPanel()}
      </div>
    </div>
  )
}
