import { For, Show, createMemo, createSignal } from "solid-js"
import { DateTime } from "luxon"
import { useSync } from "@/context/sync"
import { useSDK } from "@/context/sdk"
import { useLanguage } from "@/context/language"
import { usePrompt } from "@/context/prompt"
import { Icon } from "@opencode-ai/ui/icon"
import { Kobi } from "@opencode-ai/ui/kobi"
import { getDirectory, getFilename } from "@opencode-ai/util/path"

const MAIN_WORKTREE = "main"
const CREATE_WORKTREE = "create"
const ROOT_CLASS = "size-full flex flex-col"

interface NewSessionViewProps {
  worktree: string
}

type StarterCategory = "marketing" | "film" | "images" | "web"

type Starter = {
  key:
    | "fashionCampaign"
    | "scene"
    | "ugc"
    | "presentation"
    | "landing"
    | "video"
    | "productPhotoshoot"
    | "productAnimation"
    | "aiInfluencer"
  categories: StarterCategory[]
  /** i18n suffix for the small corner tag (session.new.tag.*); omit = no tag */
  tag?: "guided" | "seedance" | "needsRefs"
  /** Clicking also opens the attachment picker (UGC needs product + face refs). */
  wantsAttachments?: boolean
  /** Fallback tile when the CDN still is missing/unreachable — never a broken image. */
  gradient: string
}

// Real card art lives on the CDN (same contract as Kobi's poses in
// packages/ui kobi.tsx): keyed by starter key so it can be redrawn without
// shipping a new build. Until an asset exists, the gradient tile carries the card.
const THUMB_CDN = "https://media.kolbo.ai/kolboai-media/kolbo-code/starters"

const STARTERS: Starter[] = [
  { key: "fashionCampaign", categories: ["marketing", "images"], tag: "guided", gradient: "linear-gradient(140deg,#ff4dd8,#6a00b8)" },
  { key: "scene", categories: ["film"], tag: "seedance", gradient: "linear-gradient(140deg,#ff2d78,#7b2dff)" },
  { key: "ugc", categories: ["marketing", "film"], tag: "needsRefs", wantsAttachments: true, gradient: "linear-gradient(140deg,#ff8a00,#ff2d55)" },
  { key: "presentation", categories: ["web"], gradient: "linear-gradient(140deg,#ffd200,#ff6a00)" },
  { key: "landing", categories: ["web", "marketing"], gradient: "linear-gradient(140deg,#00c2ff,#0037ff)" },
  { key: "video", categories: ["film"], gradient: "linear-gradient(140deg,#00e58f,#00707a)" },
  { key: "productPhotoshoot", categories: ["marketing", "images"], gradient: "linear-gradient(140deg,#8f5bff,#2d0f66)" },
  { key: "productAnimation", categories: ["marketing", "film"], gradient: "linear-gradient(140deg,#ff5e3a,#b8003e)" },
  { key: "aiInfluencer", categories: ["marketing", "images"], gradient: "linear-gradient(140deg,#b84dff,#3a0ca3)" },
]

const CATEGORIES: ("all" | StarterCategory)[] = ["all", "marketing", "film", "images", "web"]

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
  const isWorktree = createMemo(() => {
    const project = sync.project
    if (!project) return false
    return sdk.directory !== project.worktree
  })
  // Kobi reacts to the composer: idle until you start describing something.
  const typing = createMemo(() => prompt.current().some((part) => "content" in part && part.content.trim().length > 0))

  const [category, setCategory] = createSignal<(typeof CATEGORIES)[number]>("all")
  const visible = createMemo(() =>
    STARTERS.filter((starter) => category() === "all" || starter.categories.includes(category() as StarterCategory)),
  )

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
    if (starter.wantsAttachments) {
      // The composer's own hidden multi-file input — on this page no dialog is
      // mounted, so it is the only [multiple] file input in the document.
      document.querySelector<HTMLInputElement>('input[type="file"][multiple]')?.click()
    }
  }

  return (
    <div class={ROOT_CLASS} data-component="session-new-view">
      <div class="h-12 shrink-0" aria-hidden />
      <div class="flex-1 min-h-0 overflow-y-auto px-6 pb-30 flex items-start justify-center">
        <div class="w-full max-w-200 flex flex-col items-center text-center gap-7 pt-10">
          <div class="flex flex-col items-center gap-4" data-slot="new-session-hero">
            <div data-slot="new-session-mark">
              {import.meta.env.VITE_WHITELABEL_LOGO ? (
                <img src={import.meta.env.VITE_WHITELABEL_LOGO} class="w-10" alt="" />
              ) : (
                <Kobi state={typing() ? "thinking" : "idle"} size={84} />
              )}
            </div>
            <div class="flex flex-col items-center gap-1.5">
              <h1 data-slot="new-session-title">{language.t("session.new.title")}</h1>
              <p data-slot="new-session-subtitle">{language.t("session.new.subtitle")}</p>
            </div>
          </div>

          <Show
            when={sync.project}
            fallback={
              <div data-slot="new-session-no-project">
                <Icon name="folder" size="small" />
                <span>{language.t("prompt.noProject.description")}</span>
              </div>
            }
          >
            {(project) => (
              <>
                <div data-slot="new-session-meta">
                  <span class="select-text">
                    {getDirectory(project().worktree)}
                    <span data-slot="new-session-meta-strong">{getFilename(project().worktree)}</span>
                  </span>
                  <span data-slot="new-session-meta-divider" aria-hidden="true">
                    ·
                  </span>
                  <span class="inline-flex items-center gap-1">
                    <Icon name="branch" size="small" />
                    {label(current())}
                  </span>
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
                </div>

                <div data-slot="new-session-divider" aria-hidden="true">
                  <span />
                  <span data-slot="new-session-divider-label">{language.t("session.new.jumpIn")}</span>
                  <span />
                </div>

                <div data-slot="new-session-chips" role="tablist">
                  <For each={CATEGORIES}>
                    {(cat) => (
                      <button
                        type="button"
                        role="tab"
                        data-slot="new-session-chip"
                        data-active={category() === cat}
                        aria-selected={category() === cat}
                        onClick={() => setCategory(cat)}
                      >
                        {language.t(`session.new.category.${cat}`)}
                      </button>
                    )}
                  </For>
                </div>

                <div data-slot="new-session-cards">
                  <For each={visible()}>
                    {(starter, i) => (
                      <button
                        type="button"
                        data-slot="new-session-card"
                        style={{ "--starter-delay": `${i() * 60}ms` }}
                        onClick={() => seed(starter)}
                      >
                        <span data-slot="new-session-card-thumb" style={{ background: starter.gradient }}>
                          <img
                            src={`${THUMB_CDN}/${starter.key}.webp`}
                            alt=""
                            loading="lazy"
                            referrerpolicy="no-referrer"
                            onError={(e) => (e.currentTarget.style.display = "none")}
                          />
                          <Show when={starter.tag}>
                            <span data-slot="new-session-card-tag">{language.t(`session.new.tag.${starter.tag}`)}</span>
                          </Show>
                        </span>
                        <span data-slot="new-session-card-meta">
                          <span data-slot="new-session-card-title">
                            {language.t(`session.new.starter.${starter.key}.title`)}
                          </span>
                          <span data-slot="new-session-card-body">
                            {language.t(`session.new.starter.${starter.key}.body`)}
                          </span>
                        </span>
                      </button>
                    )}
                  </For>
                </div>
              </>
            )}
          </Show>
        </div>
      </div>
    </div>
  )
}
