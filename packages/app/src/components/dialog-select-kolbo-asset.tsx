import { Component, createEffect, createMemo, createSignal, For, Show } from "solid-js"
import { Dialog } from "@opencode-ai/ui/dialog"
import { Icon } from "@opencode-ai/ui/icon"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { useLanguage } from "@/context/language"

export type KolboAssetItem = { id: string; name: string; thumbnail?: string; dnaType?: string }

/** What the picked asset becomes in the prompt — a `@dna` or a `#moodboard`. */
type Kind = "visual-dna" | "moodboard"
/** Which list is on screen. Global DNAs still insert as `visual-dna`. */
type Tab = "visual-dna" | "global-dna" | "moodboard"

type Props = {
  visualDnas: KolboAssetItem[]
  moodboards: KolboAssetItem[]
  globalDnas: KolboAssetItem[]
  globalLoading: boolean
  /** Called the first time the Global tab is shown — the catalog loads lazily. */
  onNeedGlobal: () => void
  initialTab?: Tab
  onSelect: (kind: Kind, item: KolboAssetItem) => void
}

/**
 * Browse Visual DNAs and moodboards as a picture grid.
 *
 * The `@` menu only helps once you remember roughly what a DNA is called — and
 * a DNA is a *look*, so the name is the worst handle for it. This is the visual
 * way in: every asset, its thumbnail, click to mention.
 */
export const DialogSelectKolboAsset: Component<Props> = (props) => {
  const dialog = useDialog()
  const language = useLanguage()
  const [tab, setTab] = createSignal<Tab>(props.initialTab ?? "visual-dna")
  const [query, setQuery] = createSignal("")

  // Opening the tab is what triggers the fetch — mounting the dialog is not.
  createEffect(() => {
    if (tab() === "global-dna") props.onNeedGlobal()
  })

  const source = createMemo(() => {
    if (tab() === "moodboard") return props.moodboards
    if (tab() === "global-dna") return props.globalDnas
    return props.visualDnas
  })
  const items = createMemo(() => {
    const q = query().trim().toLowerCase()
    if (!q) return source()
    return source().filter(
      (item) => item.name.toLowerCase().includes(q) || (item.dnaType ?? "").toLowerCase().includes(q),
    )
  })
  const loading = createMemo(() => tab() === "global-dna" && props.globalLoading && props.globalDnas.length === 0)

  const pick = (item: KolboAssetItem) => {
    props.onSelect(tab() === "moodboard" ? "moodboard" : "visual-dna", item)
    dialog.close()
  }

  const tabClass = (kind: Tab) =>
    "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-13-medium transition-colors cursor-pointer " +
    (tab() === kind
      ? "bg-surface-raised-stronger-non-alpha text-text-strong"
      : "text-text-weak hover:text-text-base")

  const emptyIcon = () => (tab() === "moodboard" ? "moodboard" : "dna")

  return (
    <Dialog size="full" title={language.t("dialog.kolboAsset.title")}>
      <div class="flex flex-col gap-3 h-full min-h-0">
        <div class="flex items-center gap-2 shrink-0">
          <div class="flex items-center gap-1 p-0.5 rounded-full bg-surface-recess-base shrink-0">
            <button type="button" class={tabClass("visual-dna")} onClick={() => setTab("visual-dna")}>
              <Icon name="dna" size="small" class="shrink-0" />
              {language.t("dialog.kolboAsset.visualDnas")} ({props.visualDnas.length})
            </button>
            <button type="button" class={tabClass("global-dna")} onClick={() => setTab("global-dna")}>
              <Icon name="providers" size="small" class="shrink-0" />
              {language.t("dialog.kolboAsset.globalDnas")}
              <Show when={props.globalDnas.length > 0}>{` (${props.globalDnas.length})`}</Show>
            </button>
            <button type="button" class={tabClass("moodboard")} onClick={() => setTab("moodboard")}>
              <Icon name="moodboard" size="small" class="shrink-0" />
              {language.t("dialog.kolboAsset.moodboards")} ({props.moodboards.length})
            </button>
          </div>
          <input
            autofocus
            value={query()}
            onInput={(event) => setQuery(event.currentTarget.value)}
            placeholder={language.t("common.search.placeholder")}
            class="flex-1 min-w-0 px-3 py-2 rounded-lg text-14-regular bg-surface-recess-base text-text-strong placeholder:text-text-weak outline-none focus:shadow-xs-border"
          />
        </div>

        <Show
          when={!loading()}
          fallback={
            <div class="flex-1 flex items-center justify-center text-13-regular text-text-weak">
              {language.t("common.loading")}
            </div>
          }
        >
          <Show
            when={items().length > 0}
            fallback={
              <div class="flex-1 flex items-center justify-center text-13-regular text-text-weak">
                {language.t("dialog.kolboAsset.empty")}
              </div>
            }
          >
            <div class="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-6 gap-2.5 overflow-auto no-scrollbar flex-1 min-h-0 pr-0.5">
              <For each={items()}>
                {(item) => (
                  <button
                    type="button"
                    onClick={() => pick(item)}
                    class="group flex flex-col gap-1.5 text-left rounded-xl p-1.5 h-fit hover:bg-surface-raised-base-hover transition-colors cursor-pointer"
                  >
                    {/* 4:3, matching kolbo-map's Visual DNA selector — the hero
                        image is usually a wide reference sheet, which a square
                        crop cuts in half. */}
                    <div class="relative aspect-[4/3] w-full overflow-hidden rounded-lg bg-surface-recess-base border border-border-weaker-base group-hover:border-border-weak-base transition-colors">
                      <Show
                        when={item.thumbnail}
                        fallback={
                          <span class="absolute inset-0 flex items-center justify-center text-text-weak">
                            <Icon name={emptyIcon()} class="size-5" />
                          </span>
                        }
                      >
                        <img
                          src={item.thumbnail}
                          alt=""
                          loading="lazy"
                          referrerpolicy="no-referrer"
                          class="size-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
                          onError={(event) => (event.currentTarget.style.display = "none")}
                        />
                      </Show>
                    </div>
                    <div class="flex flex-col min-w-0 px-0.5">
                      <span class="text-13-medium text-text-strong truncate">{item.name}</span>
                      <Show when={item.dnaType}>
                        <span class="text-11-regular text-text-weak truncate">{item.dnaType}</span>
                      </Show>
                    </div>
                  </button>
                )}
              </For>
            </div>
          </Show>
        </Show>
      </div>
    </Dialog>
  )
}
