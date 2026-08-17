import { createMemo, For, Match, Show, Switch } from "solid-js"
import { Button } from "@opencode-ai/ui/button"
import { Logo } from "@opencode-ai/ui/logo"
import { Kobi } from "@opencode-ai/ui/kobi"
import { useLayout } from "@/context/layout"
import { useNavigate } from "@solidjs/router"
import { base64Encode } from "@opencode-ai/util/encode"
import { Icon } from "@opencode-ai/ui/icon"
import { usePlatform } from "@/context/platform"
import { DateTime } from "luxon"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { DialogSelectDirectory } from "@/components/dialog-select-directory"
import { DialogSelectServer } from "@/components/dialog-select-server"
import { useServer } from "@/context/server"
import { useGlobalSync } from "@/context/global-sync"
import { useLanguage } from "@/context/language"

export default function Home() {
  const sync = useGlobalSync()
  const layout = useLayout()
  const platform = usePlatform()
  const dialog = useDialog()
  const navigate = useNavigate()
  const server = useServer()
  const language = useLanguage()
  const homedir = createMemo(() => sync.data.path.home)
  const recent = createMemo(() => {
    return sync.data.project
      .slice()
      .sort((a, b) => (b.time.updated ?? b.time.created) - (a.time.updated ?? a.time.created))
      .slice(0, 6)
  })

  const serverDotClass = createMemo(() => {
    const healthy = server.healthy()
    if (healthy === true) return "bg-icon-success-base"
    if (healthy === false) return "bg-icon-critical-base"
    return "bg-border-weak-base"
  })

  function openProject(directory: string) {
    layout.projects.open(directory)
    server.projects.touch(directory)
    navigate(`/${base64Encode(directory)}`)
  }

  async function chooseProject() {
    function resolve(result: string | string[] | null) {
      if (Array.isArray(result)) {
        for (const directory of result) {
          openProject(directory)
        }
      } else if (result) {
        openProject(result)
      }
    }

    if (platform.openDirectoryPickerDialog && server.isLocal()) {
      const result = await platform.openDirectoryPickerDialog?.({
        title: language.t("command.project.open"),
        multiple: true,
      })
      resolve(result)
    } else {
      dialog.show(
        () => <DialogSelectDirectory multiple={true} onSelect={resolve} />,
        () => resolve(null),
      )
    }
  }

  // "/Users/zohar/code/kolbo-map" → { name: "kolbo-map", parent: "~/code" }
  function split(worktree: string) {
    const short = worktree.replace(homedir(), "~")
    const cut = Math.max(short.lastIndexOf("/"), short.lastIndexOf("\\"))
    return cut < 0 ? { name: short, parent: "" } : { name: short.slice(cut + 1), parent: short.slice(0, cut) }
  }

  return (
    <div class="mx-auto w-full max-w-2xl px-6 pt-20 pb-16 flex flex-col items-center">
      {/* Hero — Kobi is the product's face, so he greets you here rather than a
          washed-out logo watermark. The ambient glow sits behind everything and
          tints with the current agent colour, so the screen changes with theme. */}
      <div class="relative flex flex-col items-center text-center w-full">
        <div
          aria-hidden="true"
          class="pointer-events-none absolute left-1/2 -translate-x-1/2 -top-24 rounded-full"
          style={{
            width: "460px",
            height: "460px",
            background:
              "radial-gradient(circle, color-mix(in srgb, var(--icon-agent-build-base) 20%, transparent) 0%, transparent 62%)",
            filter: "blur(30px)",
          }}
        />
        <Kobi state="idle" size={132} class="relative" />
        <div class="relative mt-3 flex items-center justify-center h-7">
          {import.meta.env.VITE_WHITELABEL_LOGO ? (
            <img src={import.meta.env.VITE_WHITELABEL_LOGO} class="h-7 w-auto opacity-90" alt="" />
          ) : (
            <div style={{ width: "112px" }}>
              <Logo class="opacity-70" />
            </div>
          )}
        </div>
        <div class="relative mt-4 text-20-medium text-text-strong">{language.t("home.greeting")}</div>
        <div class="relative mt-1.5 text-14-regular text-text-weak max-w-sm">{language.t("home.tagline")}</div>

        <Button size="large" icon="folder-add-left" class="relative mt-6 pl-3 pr-4" onClick={chooseProject}>
          {language.t("command.project.open")}
        </Button>
        <Button
          size="normal"
          variant="ghost"
          class="relative mt-2 text-12-regular text-text-weak"
          onClick={() => dialog.show(() => <DialogSelectServer />)}
        >
          <div
            classList={{
              "size-2 rounded-full": true,
              [serverDotClass()]: true,
            }}
          />
          {server.name}
        </Button>
      </div>

      <Switch>
        <Match when={sync.data.project.length > 0}>
          <div class="mt-14 w-full flex flex-col gap-3">
            <div class="text-12-medium text-text-weak uppercase tracking-wide pl-1">
              {language.t("home.recentProjects")}
            </div>
            {/* Cards, not a list of raw paths: the folder name is what you
                actually scan for, so it leads and the path recedes. */}
            <ul class="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <For each={recent()}>
                {(project) => {
                  const parts = split(project.worktree)
                  return (
                    <li>
                      <button
                        type="button"
                        onClick={() => openProject(project.worktree)}
                        class="group w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-xl border border-border-weaker-base bg-surface-base hover:bg-surface-raised-base-hover hover:border-border-weak-base transition-colors cursor-pointer"
                      >
                        <span class="flex items-center justify-center size-9 shrink-0 rounded-lg bg-surface-recess-base text-text-weak group-hover:text-text-base transition-colors">
                          <Icon name="folder-add-left" class="size-4.5" />
                        </span>
                        <span class="flex flex-col min-w-0 flex-1">
                          <span class="text-14-medium text-text-strong truncate">{parts.name}</span>
                          <span class="text-12-mono text-text-weak truncate" dir="ltr">
                            {parts.parent}
                          </span>
                        </span>
                        <span class="text-11-regular text-text-subtle shrink-0">
                          {DateTime.fromMillis(project.time.updated ?? project.time.created).toRelative()}
                        </span>
                      </button>
                    </li>
                  )
                }}
              </For>
            </ul>
          </div>
        </Match>
        <Match when={!sync.ready}>
          <div class="mt-14 text-12-regular text-text-weak">{language.t("common.loading")}</div>
        </Match>
        <Match when={true}>
          <div class="mt-14 text-12-regular text-text-weak">{language.t("home.empty.description")}</div>
        </Match>
      </Switch>
    </div>
  )
}
