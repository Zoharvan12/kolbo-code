import { For, Show, createMemo } from "solid-js"
import { DateTime } from "luxon"
import { useSync } from "@/context/sync"
import { useSDK } from "@/context/sdk"
import { useLanguage } from "@/context/language"
import { usePrompt } from "@/context/prompt"
import { Icon } from "@opencode-ai/ui/icon"
import { Mark } from "@opencode-ai/ui/logo"
import { getDirectory, getFilename } from "@opencode-ai/util/path"

const MAIN_WORKTREE = "main"
const CREATE_WORKTREE = "create"
const ROOT_CLASS = "size-full flex flex-col"

interface NewSessionViewProps {
  worktree: string
}

type Starter = {
  key: "landing" | "images" | "video" | "music"
  icon: "app-window" | "photo" | "video" | "music"
}

const STARTERS: Starter[] = [
  { key: "landing", icon: "app-window" },
  { key: "images", icon: "photo" },
  { key: "video", icon: "video" },
  { key: "music", icon: "music" },
]

export function NewSessionView(props: NewSessionViewProps) {
  const sync = useSync()
  const sdk = useSDK()
  const language = useLanguage()
  const prompt = usePrompt()

  const sandboxes = createMemo(() => sync.project?.sandboxes ?? [])
  const options = createMemo(() => [MAIN_WORKTREE, ...sandboxes(), CREATE_WORKTREE])
  const current = createMemo(() => {
    const selection = props.worktree
    if (options().includes(selection)) return selection
    return MAIN_WORKTREE
  })
  const projectRoot = createMemo(() => sync.project?.worktree ?? sdk.directory)
  const isWorktree = createMemo(() => {
    const project = sync.project
    if (!project) return false
    return sdk.directory !== project.worktree
  })

  const label = (value: string) => {
    if (value === MAIN_WORKTREE) {
      if (isWorktree()) return language.t("session.new.worktree.main")
      const branch = sync.data.vcs?.branch
      if (branch) return language.t("session.new.worktree.mainWithBranch", { branch })
      return language.t("session.new.worktree.main")
    }
    if (value === CREATE_WORKTREE) return language.t("session.new.worktree.create")
    return getFilename(value)
  }

  const seed = (starter: Starter) => {
    const text = language.t(`session.new.starter.${starter.key}.prompt`)
    prompt.set([{ type: "text", content: text, start: 0, end: text.length }], text.length)
    const editor = document.querySelector<HTMLElement>('[data-component="prompt-input"]')
    editor?.focus()
  }

  return (
    <div class={ROOT_CLASS} data-component="session-new-view">
      <div class="h-12 shrink-0" aria-hidden />
      <div class="flex-1 px-6 pb-30 flex items-start justify-center">
        <div class="w-full max-w-200 flex flex-col items-center text-center gap-8 pt-12">
          <div class="flex flex-col items-center gap-5" data-slot="new-session-hero">
            <div data-slot="new-session-mark">
              {import.meta.env.VITE_WHITELABEL_LOGO ? (
                <img src={import.meta.env.VITE_WHITELABEL_LOGO} class="w-10" alt="" />
              ) : (
                <Mark class="w-10" />
              )}
              <span data-slot="new-session-pulse" aria-hidden="true" />
            </div>
            <div class="flex flex-col items-center gap-1.5">
              <h1 data-slot="new-session-title">{language.t("session.new.title")}</h1>
              <p data-slot="new-session-subtitle">{language.t("session.new.subtitle")}</p>
            </div>
          </div>

          <div data-slot="new-session-meta">
            <span class="select-text">
              {getDirectory(projectRoot())}
              <span data-slot="new-session-meta-strong">{getFilename(projectRoot())}</span>
            </span>
            <span data-slot="new-session-meta-divider" aria-hidden="true">
              ·
            </span>
            <span class="inline-flex items-center gap-1">
              <Icon name="branch" size="small" />
              {label(current())}
            </span>
            <Show when={sync.project}>
              {(project) => (
                <>
                  <span data-slot="new-session-meta-divider" aria-hidden="true">
                    ·
                  </span>
                  <span>
                    {language.t("session.new.lastModified")}{" "}
                    <span data-slot="new-session-meta-strong">
                      {DateTime.fromMillis(project().time.updated ?? project().time.created)
                        .setLocale(language.intl())
                        .toRelative()}
                    </span>
                  </span>
                </>
              )}
            </Show>
          </div>

          <div data-slot="new-session-starters">
            <For each={STARTERS}>
              {(starter, i) => (
                <button
                  type="button"
                  data-slot="new-session-starter"
                  style={{ "--starter-delay": `${i() * 80}ms` }}
                  onClick={() => seed(starter)}
                >
                  <span data-slot="new-session-starter-icon">
                    <Icon name={starter.icon} size="small" />
                  </span>
                  <span data-slot="new-session-starter-text">
                    <span data-slot="new-session-starter-title">
                      {language.t(`session.new.starter.${starter.key}.title`)}
                    </span>
                    <span data-slot="new-session-starter-body">
                      {language.t(`session.new.starter.${starter.key}.body`)}
                    </span>
                  </span>
                  <span data-slot="new-session-starter-arrow" aria-hidden="true">
                    <Icon name="chevron-right" size="small" />
                  </span>
                </button>
              )}
            </For>
          </div>
        </div>
      </div>
    </div>
  )
}
