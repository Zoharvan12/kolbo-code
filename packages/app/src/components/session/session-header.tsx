import { AppIcon } from "@opencode-ai/ui/app-icon"
import { Button } from "@opencode-ai/ui/button"
import { DropdownMenu } from "@opencode-ai/ui/dropdown-menu"
import { Icon } from "@opencode-ai/ui/icon"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { Keybind } from "@opencode-ai/ui/keybind"
import { Spinner } from "@opencode-ai/ui/spinner"
import { showToast } from "@opencode-ai/ui/toast"
import { Tooltip, TooltipKeybind } from "@opencode-ai/ui/tooltip"
import { getFilename } from "@opencode-ai/util/path"
import { createEffect, createMemo, For, onCleanup, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { Portal } from "solid-js/web"
import { useCommand } from "@/context/command"
import { useLanguage } from "@/context/language"
import { useLayout } from "@/context/layout"
import { usePlatform } from "@/context/platform"
import { useTheme } from "@opencode-ai/ui/theme/context"
import { useServer } from "@/context/server"
import { useSync } from "@/context/sync"
import { useTerminal } from "@/context/terminal"
import { focusTerminalById } from "@/pages/session/helpers"
import { useSessionLayout } from "@/pages/session/session-layout"
import { messageAgentColor } from "@/utils/agent"
import { decode64 } from "@/utils/base64"
import { Persist, persisted } from "@/utils/persist"
import { StatusPopover } from "../status-popover"

const OPEN_APPS = [
  "vscode",
  "cursor",
  "zed",
  "textmate",
  "antigravity",
  "finder",
  "terminal",
  "iterm2",
  "ghostty",
  "warp",
  "xcode",
  "android-studio",
  "powershell",
  "sublime-text",
] as const

type OpenApp = (typeof OPEN_APPS)[number]
type OS = "macos" | "windows" | "linux" | "unknown"

const MAC_APPS = [
  {
    id: "vscode",
    label: "session.header.open.app.vscode",
    icon: "vscode",
    openWith: "Visual Studio Code",
  },
  { id: "cursor", label: "session.header.open.app.cursor", icon: "cursor", openWith: "Cursor" },
  { id: "zed", label: "session.header.open.app.zed", icon: "zed", openWith: "Zed" },
  { id: "textmate", label: "session.header.open.app.textmate", icon: "textmate", openWith: "TextMate" },
  {
    id: "antigravity",
    label: "session.header.open.app.antigravity",
    icon: "antigravity",
    openWith: "Antigravity",
  },
  { id: "terminal", label: "session.header.open.app.terminal", icon: "terminal", openWith: "Terminal" },
  { id: "iterm2", label: "session.header.open.app.iterm2", icon: "iterm2", openWith: "iTerm" },
  { id: "ghostty", label: "session.header.open.app.ghostty", icon: "ghostty", openWith: "Ghostty" },
  { id: "warp", label: "session.header.open.app.warp", icon: "warp", openWith: "Warp" },
  { id: "xcode", label: "session.header.open.app.xcode", icon: "xcode", openWith: "Xcode" },
  {
    id: "android-studio",
    label: "session.header.open.app.androidStudio",
    icon: "android-studio",
    openWith: "Android Studio",
  },
  {
    id: "sublime-text",
    label: "session.header.open.app.sublimeText",
    icon: "sublime-text",
    openWith: "Sublime Text",
  },
] as const

const WINDOWS_APPS = [
  { id: "vscode", label: "session.header.open.app.vscode", icon: "vscode", openWith: "code" },
  { id: "cursor", label: "session.header.open.app.cursor", icon: "cursor", openWith: "cursor" },
  { id: "zed", label: "session.header.open.app.zed", icon: "zed", openWith: "zed" },
  {
    id: "powershell",
    label: "session.header.open.app.powershell",
    icon: "powershell",
    openWith: "powershell",
  },
  {
    id: "sublime-text",
    label: "session.header.open.app.sublimeText",
    icon: "sublime-text",
    openWith: "Sublime Text",
  },
] as const

const LINUX_APPS = [
  { id: "vscode", label: "session.header.open.app.vscode", icon: "vscode", openWith: "code" },
  { id: "cursor", label: "session.header.open.app.cursor", icon: "cursor", openWith: "cursor" },
  { id: "zed", label: "session.header.open.app.zed", icon: "zed", openWith: "zed" },
  {
    id: "sublime-text",
    label: "session.header.open.app.sublimeText",
    icon: "sublime-text",
    openWith: "Sublime Text",
  },
] as const

const detectOS = (platform: ReturnType<typeof usePlatform>): OS => {
  if (platform.platform === "desktop" && platform.os) return platform.os
  if (typeof navigator !== "object") return "unknown"
  const value = navigator.platform || navigator.userAgent
  if (/Mac/i.test(value)) return "macos"
  if (/Win/i.test(value)) return "windows"
  if (/Linux/i.test(value)) return "linux"
  return "unknown"
}

const showRequestError = (language: ReturnType<typeof useLanguage>, err: unknown) => {
  showToast({
    variant: "error",
    title: language.t("common.requestFailed"),
    description: err instanceof Error ? err.message : String(err),
  })
}

export function SessionHeader() {
  const layout = useLayout()
  const command = useCommand()
  const server = useServer()
  const platform = usePlatform()
  const language = useLanguage()
  const theme = useTheme()
  const sync = useSync()
  const terminal = useTerminal()
  const { params, view } = useSessionLayout()

  const isDark = () => {
    const scheme = theme.colorScheme()
    if (scheme === "dark") return true
    if (scheme === "light") return false
    return window.matchMedia("(prefers-color-scheme: dark)").matches
  }
  const toggleColorScheme = () => theme.setColorScheme(isDark() ? "light" : "dark")

  const projectDirectory = createMemo(() => decode64(params.dir) ?? "")
  const project = createMemo(() => {
    const directory = projectDirectory()
    if (!directory) return
    return layout.projects.list().find((p) => p.worktree === directory || p.sandboxes?.includes(directory))
  })
  const name = createMemo(() => {
    const current = project()
    if (current) return current.name || getFilename(current.worktree)
    return getFilename(projectDirectory())
  })
  const hotkey = createMemo(() => command.keybind("file.open"))
  const os = createMemo(() => detectOS(platform))

  const [exists, setExists] = createStore<Partial<Record<OpenApp, boolean>>>({
    finder: true,
  })

  const apps = createMemo(() => {
    if (os() === "macos") return MAC_APPS
    if (os() === "windows") return WINDOWS_APPS
    return LINUX_APPS
  })

  const fileManager = createMemo(() => {
    if (os() === "macos") return { label: "session.header.open.finder", icon: "finder" as const }
    if (os() === "windows") return { label: "session.header.open.fileExplorer", icon: "file-explorer" as const }
    return { label: "session.header.open.fileManager", icon: "finder" as const }
  })

  createEffect(() => {
    if (platform.platform !== "desktop") return
    if (!platform.checkAppExists) return

    const list = apps()

    setExists(Object.fromEntries(list.map((app) => [app.id, undefined])) as Partial<Record<OpenApp, boolean>>)

    void Promise.all(
      list.map((app) =>
        Promise.resolve(platform.checkAppExists?.(app.openWith))
          .then((value) => Boolean(value))
          .catch(() => false)
          .then((ok) => [app.id, ok] as const),
      ),
    ).then((entries) => {
      setExists(Object.fromEntries(entries) as Partial<Record<OpenApp, boolean>>)
    })
  })

  const options = createMemo(() => {
    return [
      { id: "finder", label: language.t(fileManager().label), icon: fileManager().icon },
      ...apps()
        .filter((app) => exists[app.id])
        .map((app) => ({ ...app, label: language.t(app.label) })),
    ] as const
  })

  const toggleTerminal = () => {
    const next = !view().terminal.opened()
    view().terminal.toggle()
    if (!next) return

    const id = terminal.active()
    if (!id) return
    focusTerminalById(id)
  }

  const [prefs, setPrefs] = persisted(Persist.global("open.app"), createStore({ app: "finder" as OpenApp }))
  const [menu, setMenu] = createStore({ open: false })
  const [openRequest, setOpenRequest] = createStore({
    app: undefined as OpenApp | undefined,
  })

  const canOpen = createMemo(() => platform.platform === "desktop" && !!platform.openPath && server.isLocal())
  const current = createMemo(
    () =>
      options().find((o) => o.id === prefs.app) ??
      options()[0] ??
      ({ id: "finder", label: fileManager().label, icon: fileManager().icon } as const),
  )
  const opening = createMemo(() => openRequest.app !== undefined)
  const tint = createMemo(() =>
    messageAgentColor(params.id ? sync.data.message[params.id] : undefined, sync.data.agent),
  )

  const selectApp = (app: OpenApp) => {
    if (!options().some((item) => item.id === app)) return
    setPrefs("app", app)
  }

  const openDir = (app: OpenApp) => {
    if (opening() || !canOpen() || !platform.openPath) return
    const directory = projectDirectory()
    if (!directory) return

    const item = options().find((o) => o.id === app)
    const openWith = item && "openWith" in item ? item.openWith : undefined
    setOpenRequest("app", app)
    platform
      .openPath(directory, openWith)
      .catch((err: unknown) => showRequestError(language, err))
      .finally(() => {
        setOpenRequest("app", undefined)
      })
  }

  const copyPath = () => {
    const directory = projectDirectory()
    if (!directory) return
    navigator.clipboard
      .writeText(directory)
      .then(() => {
        showToast({
          variant: "success",
          icon: "circle-check",
          title: language.t("session.share.copy.copied"),
          description: directory,
        })
      })
      .catch((err: unknown) => showRequestError(language, err))
  }

  const centerMount = createMemo(() => document.getElementById("opencode-titlebar-center"))
  const rightMount = createMemo(() => document.getElementById("opencode-titlebar-right"))

  return (
    <>
      <Show when={centerMount()}>
        {(mount) => (
          <Portal mount={mount()}>
            <Button
              type="button"
              variant="ghost"
              size="small"
              class="hidden md:flex w-[240px] max-w-full min-w-0 items-center gap-2 justify-between rounded-md border border-border-weak-base bg-surface-panel shadow-none cursor-default"
              onClick={() => command.trigger("file.open")}
              aria-label={language.t("session.header.searchFiles")}
            >
              <div class="flex min-w-0 flex-1 items-center overflow-visible">
                <span class="flex-1 min-w-0 text-12-regular text-text-weak truncate text-left">
                  {language.t("session.header.search.placeholder", {
                    project: name(),
                  })}
                </span>
              </div>

              <Show when={hotkey()}>
                {(keybind) => (
                  <Keybind class="shrink-0 !border-0 !bg-transparent !shadow-none px-0 text-text-weaker">
                    {keybind()}
                  </Keybind>
                )}
              </Show>
            </Button>
          </Portal>
        )}
      </Show>
      <Show when={rightMount()}>
        {(mount) => (
          <Portal mount={mount()}>
            <div class="flex items-center gap-2">
              <Show when={projectDirectory()}>
                <div class="hidden xl:flex items-center">
                  <Show
                    when={canOpen()}
                    fallback={
                      <div class="flex h-[24px] box-border items-center rounded-md border border-border-weak-base bg-surface-panel overflow-hidden">
                        <Button
                          variant="ghost"
                          class="rounded-none h-full py-0 pr-3 pl-0.5 gap-1.5 border-none shadow-none"
                          onClick={copyPath}
                          aria-label={language.t("session.header.open.copyPath")}
                        >
                          <Icon name="copy" size="small" class="text-icon-base" />
                          <span class="text-12-regular text-text-strong">
                            {language.t("session.header.open.copyPath")}
                          </span>
                        </Button>
                      </div>
                    }
                  >
                    <div class="flex items-center">
                      <div class="flex h-[24px] box-border items-center rounded-md border border-border-weak-base bg-surface-panel overflow-hidden">
                        <Button
                          variant="ghost"
                          class="rounded-none h-full px-0.5 border-none shadow-none disabled:!cursor-default"
                          classList={{
                            "bg-surface-raised-base-active": opening(),
                          }}
                          onClick={() => openDir(current().id)}
                          disabled={opening()}
                          aria-label={language.t("session.header.open.ariaLabel", { app: current().label })}
                        >
                          <div class="flex size-5 shrink-0 items-center justify-center [&_[data-component=app-icon]]:size-5">
                            <Show when={opening()} fallback={<AppIcon id={current().icon} />}>
                              <Spinner class="size-3.5" style={{ color: tint() ?? "var(--icon-base)" }} />
                            </Show>
                          </div>
                        </Button>
                        <DropdownMenu
                          gutter={4}
                          placement="bottom-end"
                          open={menu.open}
                          onOpenChange={(open) => setMenu("open", open)}
                        >
                          <DropdownMenu.Trigger
                            as={IconButton}
                            icon="chevron-down"
                            variant="ghost"
                            disabled={opening()}
                            class="rounded-none h-full w-[20px] p-0 border-none shadow-none data-[expanded]:bg-surface-raised-base-active disabled:!cursor-default"
                            classList={{
                              "bg-surface-raised-base-active": opening(),
                            }}
                            aria-label={language.t("session.header.open.menu")}
                          />
                          <DropdownMenu.Portal>
                            <DropdownMenu.Content class="[&_[data-slot=dropdown-menu-item]]:pl-1 [&_[data-slot=dropdown-menu-radio-item]]:pl-1 [&_[data-slot=dropdown-menu-radio-item]+[data-slot=dropdown-menu-radio-item]]:mt-1">
                              <DropdownMenu.Group>
                                <DropdownMenu.GroupLabel class="!px-1 !py-1">
                                  {language.t("session.header.openIn")}
                                </DropdownMenu.GroupLabel>
                                <DropdownMenu.RadioGroup
                                  class="mt-1"
                                  value={current().id}
                                  onChange={(value) => {
                                    if (!OPEN_APPS.includes(value as OpenApp)) return
                                    selectApp(value as OpenApp)
                                  }}
                                >
                                  <For each={options()}>
                                    {(o) => (
                                      <DropdownMenu.RadioItem
                                        value={o.id}
                                        disabled={opening()}
                                        onSelect={() => {
                                          setMenu("open", false)
                                          openDir(o.id)
                                        }}
                                      >
                                        <div class="flex size-5 shrink-0 items-center justify-center [&_[data-component=app-icon]]:size-5">
                                          <AppIcon id={o.icon} />
                                        </div>
                                        <DropdownMenu.ItemLabel>{o.label}</DropdownMenu.ItemLabel>
                                        <DropdownMenu.ItemIndicator>
                                          <Icon name="check-small" size="small" class="text-icon-weak" />
                                        </DropdownMenu.ItemIndicator>
                                      </DropdownMenu.RadioItem>
                                    )}
                                  </For>
                                </DropdownMenu.RadioGroup>
                              </DropdownMenu.Group>
                              <DropdownMenu.Separator />
                              <DropdownMenu.Item
                                onSelect={() => {
                                  setMenu("open", false)
                                  copyPath()
                                }}
                              >
                                <div class="flex size-5 shrink-0 items-center justify-center">
                                  <Icon name="copy" size="small" class="text-icon-weak" />
                                </div>
                                <DropdownMenu.ItemLabel>
                                  {language.t("session.header.open.copyPath")}
                                </DropdownMenu.ItemLabel>
                              </DropdownMenu.Item>
                            </DropdownMenu.Content>
                          </DropdownMenu.Portal>
                        </DropdownMenu>
                      </div>
                    </div>
                  </Show>
                </div>
              </Show>
              <div class="flex items-center gap-1">
                <Tooltip placement="bottom" value={language.t("status.popover.trigger")}>
                  <StatusPopover />
                </Tooltip>

                {/* Zoom controls */}
                <Show when={platform.zoomOut && platform.zoomIn}>
                  <div class="flex items-center border border-border-weak-base rounded-md overflow-hidden h-6">
                    <Tooltip placement="bottom" value={language.t("session.header.zoom.out")}>
                      <button
                        type="button"
                        class="titlebar-icon h-6 w-6 flex items-center justify-center text-text-weak hover:text-text-strong hover:bg-surface-raised-base transition-colors text-[14px] font-medium"
                        onClick={() => platform.zoomOut?.()}
                        aria-label={language.t("session.header.zoom.out.ariaLabel")}
                      >−</button>
                    </Tooltip>
                    <span class="flex items-center justify-center px-0.5 hidden md:flex"><Icon size="small" name="magnifying-glass" class="text-text-weaker" /></span>
                    <Tooltip placement="bottom" value={language.t("session.header.zoom.in")}>
                      <button
                        type="button"
                        class="titlebar-icon h-6 w-6 flex items-center justify-center text-text-weak hover:text-text-strong hover:bg-surface-raised-base transition-colors text-[14px] font-medium"
                        onClick={() => platform.zoomIn?.()}
                        aria-label={language.t("session.header.zoom.in.ariaLabel")}
                      >+</button>
                    </Tooltip>
                  </div>
                </Show>

                {/* Dark/light mode toggle */}
                <Tooltip placement="bottom" value={isDark() ? language.t("session.header.colorScheme.toLightMode") : language.t("session.header.colorScheme.toDarkMode")}>
                  <Button
                    variant="ghost"
                    class="titlebar-icon h-6 px-1.5 box-border shrink-0 flex items-center gap-1"
                    onClick={toggleColorScheme}
                    aria-label={isDark() ? language.t("session.header.colorScheme.toLightMode") : language.t("session.header.colorScheme.toDarkMode")}
                  >
                    <Show
                      when={isDark()}
                      fallback={
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                          <circle cx="12" cy="12" r="5"/>
                          <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
                          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                          <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
                          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
                        </svg>
                      }
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                      </svg>
                    </Show>
                  </Button>
                </Tooltip>

                <TooltipKeybind
                  title={language.t("command.terminal.toggle")}
                  keybind={command.keybind("terminal.toggle")}
                >
                  <Button
                    variant="ghost"
                    class="group/terminal-toggle titlebar-icon h-6 px-1.5 box-border shrink-0 flex items-center gap-1"
                    onClick={toggleTerminal}
                    aria-label={language.t("command.terminal.toggle")}
                    aria-expanded={view().terminal.opened()}
                    aria-controls="terminal-panel"
                  >
                    <Icon size="small" name={view().terminal.opened() ? "terminal-active" : "terminal"} />
                    <span class="text-11-regular text-text-weak hidden md:inline">{language.t("session.header.tab.terminal")}</span>
                  </Button>
                </TooltipKeybind>

                <div class="hidden md:flex items-center gap-1 shrink-0">
                  {(() => {
                    const hasCanvasMedia = createMemo(() => {
                      const id = params.id
                      if (!id) return false
                      const msgs = sync.data.message[id] ?? []
                      for (const message of msgs) {
                        const parts = sync.data.part[message.id] ?? []
                        for (const part of parts) {
                          if (part.type !== "tool") continue
                          const tool = (part as { tool?: string }).tool
                          if (typeof tool !== "string") continue
                          if (tool.startsWith("kolbo_") || tool.startsWith("mcp__kolbo__")) return true
                        }
                      }
                      return false
                    })
                    return (
                      <Show when={hasCanvasMedia()}>
                        <Tooltip placement="bottom" value={language.t("command.canvas.toggle")}>
                          <Button
                            variant="ghost"
                            class="titlebar-icon h-6 px-2 box-border shrink-0 flex items-center gap-1.5 mx-1"
                            onClick={() => {
                              if (typeof document !== "undefined") {
                                document.dispatchEvent(new CustomEvent("kolbo:open-canvas"))
                              }
                            }}
                            aria-label={language.t("command.canvas.toggle")}
                          >
                            <Icon size="small" name="canvas" />
                            <span class="text-11-regular text-text-weak">{language.t("session.header.tab.canvas")}</span>
                          </Button>
                        </Tooltip>
                      </Show>
                    )
                  })()}

                  <TooltipKeybind
                    title={language.t("command.review.toggle")}
                    keybind={command.keybind("review.toggle")}
                  >
                    <Button
                      variant="ghost"
                      class="group/review-toggle titlebar-icon h-6 px-1.5 box-border flex items-center gap-1"
                      onClick={() => view().reviewPanel.toggle()}
                      aria-label={language.t("command.review.toggle")}
                      aria-expanded={view().reviewPanel.opened()}
                      aria-controls="review-panel"
                    >
                      <Icon size="small" name={view().reviewPanel.opened() ? "review-active" : "review"} />
                      <span class="text-11-regular text-text-weak">{language.t("session.header.tab.review")}</span>
                    </Button>
                  </TooltipKeybind>

                  <TooltipKeybind
                    title={language.t("command.fileTree.toggle")}
                    keybind={command.keybind("fileTree.toggle")}
                  >
                    <Button
                      variant="ghost"
                      class="titlebar-icon h-6 px-1.5 box-border flex items-center gap-1"
                      onClick={() => layout.fileTree.toggle()}
                      aria-label={language.t("command.fileTree.toggle")}
                      aria-expanded={layout.fileTree.opened()}
                      aria-controls="file-tree-panel"
                    >
                      <div class="relative flex items-center justify-center size-4">
                        <Icon
                          size="small"
                          name={layout.fileTree.opened() ? "file-tree-active" : "file-tree"}
                          classList={{
                            "text-icon-strong": layout.fileTree.opened(),
                            "text-icon-weak": !layout.fileTree.opened(),
                          }}
                        />
                      </div>
                      <span class="text-11-regular text-text-weak">{language.t("session.header.tab.files")}</span>
                    </Button>
                  </TooltipKeybind>
                </div>
              </div>
            </div>
          </Portal>
        )}
      </Show>
    </>
  )
}
