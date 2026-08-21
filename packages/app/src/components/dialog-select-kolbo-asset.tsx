import { Component, For, Show, createEffect, createMemo, createSignal, onCleanup } from "solid-js"
import { Dialog } from "@opencode-ai/ui/dialog"
import { Icon } from "@opencode-ai/ui/icon"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { useLanguage } from "@/context/language"
import { useServer } from "@/context/server"

export type KolboAssetItem = {
  id: string
  name: string
  thumbnail?: string
  dnaType?: string
  description?: string
  images?: string[]
}

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
  /** Apply one or many picks into the prompt (batch). */
  onSelect: (kind: Kind, items: KolboAssetItem[]) => void
}

const MAX_DNA = 8
const MAX_MOODBOARD = 4

function coverFit(item: KolboAssetItem) {
  return (item.dnaType ?? "").toLowerCase() === "environment"
}

function heroUrls(item: KolboAssetItem) {
  if (item.images?.length) return item.images
  if (item.thumbnail) return [item.thumbnail]
  return [] as string[]
}

/**
 * Browse Visual DNAs and moodboards as a picture grid — kolbo-map parity:
 * contain+blur cards, multi-select, detail panel, Apply bar.
 */
export const DialogSelectKolboAsset: Component<Props> = (props) => {
  const dialog = useDialog()
  const language = useLanguage()
  const server = useServer()
  const [tab, setTab] = createSignal<Tab>(props.initialTab ?? "visual-dna")
  const [query, setQuery] = createSignal("")
  const [selected, setSelected] = createSignal<KolboAssetItem[]>([])
  const [previewId, setPreviewId] = createSignal<string | null>(null)
  const [enriched, setEnriched] = createSignal<Record<string, KolboAssetItem>>({})
  const [detailLoading, setDetailLoading] = createSignal(false)
  const [galleryIdx, setGalleryIdx] = createSignal(0)

  createEffect(() => {
    if (tab() === "global-dna") props.onNeedGlobal()
  })

  createEffect(() => {
    tab()
    setSelected([])
    setPreviewId(null)
    setGalleryIdx(0)
  })

  const kind = (): Kind => (tab() === "moodboard" ? "moodboard" : "visual-dna")
  const maxPick = () => (kind() === "moodboard" ? MAX_MOODBOARD : MAX_DNA)

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

  const isSelected = (id: string) => selected().some((item) => item.id === id)
  const atMax = () => selected().length >= maxPick()

  const resolve = (id: string): KolboAssetItem | null => {
    const extra = enriched()[id]
    const row =
      items().find((item) => item.id === id) ?? selected().find((item) => item.id === id) ?? null
    if (!row && !extra) return null
    return { ...row, ...extra, id } as KolboAssetItem
  }

  const preview = createMemo(() => {
    const id = previewId()
    return id ? resolve(id) : null
  })

  const gallery = createMemo(() => {
    const item = preview()
    return item ? heroUrls(item) : []
  })

  createEffect(() => {
    const urls = gallery()
    if (galleryIdx() >= urls.length) setGalleryIdx(0)
  })

  createEffect(() => {
    const id = previewId()
    if (!id || kind() === "moodboard") return
    const row = resolve(id)
    if (row?.description && (row.images?.length ?? 0) > 1) return
    if (enriched()[id]?.description) return
    const base = server.current?.http.url
    if (!base) return
    setDetailLoading(true)
    let cancelled = false
    void fetch(`${base}/global/kolbo-visual-dna/${encodeURIComponent(id)}`)
      .then(async (res) => {
        if (!res.ok || cancelled) return
        const body = (await res.json()) as KolboAssetItem
        if (!body?.id || cancelled) return
        setEnriched((prev) => ({ ...prev, [id]: { ...row, ...body, id: body.id } }))
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setDetailLoading(false)
      })
    onCleanup(() => {
      cancelled = true
    })
  })

  const toggle = (item: KolboAssetItem) => {
    setPreviewId(item.id)
    setGalleryIdx(0)
    if (isSelected(item.id)) {
      setSelected((prev) => prev.filter((x) => x.id !== item.id))
      return
    }
    if (atMax()) return
    setSelected((prev) => [...prev, item])
  }

  const apply = (list: KolboAssetItem[]) => {
    if (list.length === 0) return
    props.onSelect(kind(), list)
    dialog.close()
  }

  const tabClass = (next: Tab) =>
    "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-13-medium transition-colors cursor-pointer " +
    (tab() === next
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
            <div class="flex flex-1 min-h-0 gap-3">
              <div
                class="flex-1 min-w-0 min-h-0 overflow-auto no-scrollbar pr-0.5"
                style={{
                  display: "grid",
                  gap: "10px",
                  "grid-template-columns": "repeat(auto-fill, minmax(168px, 1fr))",
                  "align-content": "start",
                }}
              >
                <For each={items()}>
                  {(item) => {
                    const picked = () => isSelected(item.id)
                    const disabled = () => atMax() && !picked()
                    const active = () => previewId() === item.id
                    const cover = () => coverFit(item)
                    return (
                      <button
                        type="button"
                        disabled={disabled()}
                        aria-selected={picked()}
                        onClick={() => !disabled() && toggle(item)}
                        onDblClick={(e) => {
                          e.preventDefault()
                          apply([item])
                        }}
                        class="group flex flex-col gap-1.5 text-left rounded-xl p-1.5 h-fit transition-colors cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
                        classList={{
                          "bg-surface-raised-base-hover ring-2 ring-green-500/70": picked(),
                          "bg-surface-raised-base-hover ring-1 ring-text-interactive-base/35": !picked() && active(),
                          "hover:bg-surface-raised-base-hover": !picked() && !active(),
                        }}
                      >
                        <div class="relative aspect-[4/3] w-full overflow-hidden rounded-lg bg-surface-recess-base border border-border-weaker-base group-hover:border-border-weak-base transition-colors">
                          <Show
                            when={item.thumbnail}
                            fallback={
                              <span class="absolute inset-0 flex items-center justify-center text-text-weak">
                                <Icon name={emptyIcon()} class="size-5" />
                              </span>
                            }
                          >
                            <Show when={!cover()}>
                              <div
                                class="absolute inset-0 scale-125 bg-center bg-cover blur-2xl opacity-70"
                                style={{ "background-image": `url(${item.thumbnail})` }}
                                aria-hidden="true"
                              />
                            </Show>
                            <img
                              src={item.thumbnail}
                              alt=""
                              loading="lazy"
                              referrerpolicy="no-referrer"
                              classList={{
                                "relative size-full object-center": true,
                                "object-cover": cover(),
                                "object-contain": !cover(),
                              }}
                              onError={(event) => (event.currentTarget.style.display = "none")}
                            />
                          </Show>
                          <Show when={picked()}>
                            <span class="absolute top-1.5 start-1.5 size-5 rounded-full bg-green-500 text-white flex items-center justify-center shadow-sm">
                              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                                <path
                                  d="M3 8.5l3.5 3.5L13 4.5"
                                  stroke="currentColor"
                                  stroke-width="2.2"
                                  stroke-linecap="round"
                                  stroke-linejoin="round"
                                />
                              </svg>
                            </span>
                          </Show>
                        </div>
                        <div class="flex flex-col min-w-0 px-0.5">
                          <span class="text-13-medium text-text-strong truncate">{item.name}</span>
                          <Show when={item.dnaType}>
                            <span class="text-11-regular text-text-weak truncate">{item.dnaType}</span>
                          </Show>
                        </div>
                      </button>
                    )
                  }}
                </For>
              </div>

              <Show when={preview()}>
                {(item) => {
                  const urls = () => heroUrls(item())
                  const hero = () => urls()[galleryIdx()] ?? item().thumbnail
                  return (
                    <aside class="hidden xl:flex w-[300px] shrink-0 flex-col min-h-0 rounded-2xl border border-border-weaker-base bg-surface-recess-base overflow-hidden">
                      <div class="relative aspect-[4/3] w-full bg-black/30">
                        <Show
                          when={hero()}
                          fallback={
                            <span class="absolute inset-0 flex items-center justify-center text-text-weak">
                              <Icon name={emptyIcon()} class="size-8" />
                            </span>
                          }
                        >
                          <div
                            class="absolute inset-0 scale-125 bg-center bg-cover blur-2xl opacity-50"
                            style={{ "background-image": `url(${hero()})` }}
                            aria-hidden="true"
                          />
                          <img
                            src={hero()}
                            alt=""
                            referrerpolicy="no-referrer"
                            class="relative size-full object-contain object-center"
                          />
                        </Show>
                        <Show when={detailLoading()}>
                          <div class="absolute inset-0 flex items-center justify-center bg-black/20 text-12-regular text-white">
                            {language.t("common.loading")}
                          </div>
                        </Show>
                      </div>
                      <Show when={urls().length > 1}>
                        <div class="flex gap-1.5 px-3 py-2 overflow-x-auto no-scrollbar">
                          <For each={urls()}>
                            {(url, index) => (
                              <button
                                type="button"
                                class="size-12 shrink-0 rounded-md overflow-hidden border transition-colors"
                                classList={{
                                  "border-green-500/80": galleryIdx() === index(),
                                  "border-border-weaker-base hover:border-border-weak-base":
                                    galleryIdx() !== index(),
                                }}
                                onClick={() => setGalleryIdx(index())}
                              >
                                <img src={url} alt="" class="size-full object-cover" referrerpolicy="no-referrer" />
                              </button>
                            )}
                          </For>
                        </div>
                      </Show>
                      <div class="flex flex-col gap-2 px-3 py-3 flex-1 min-h-0 overflow-auto">
                        <div class="text-14-medium text-text-strong break-words">{item().name}</div>
                        <Show when={item().dnaType}>
                          <div class="text-12-regular text-text-weak">{item().dnaType}</div>
                        </Show>
                        <Show when={item().description}>
                          <p class="text-12-regular text-text-base whitespace-pre-wrap break-words">
                            {item().description}
                          </p>
                        </Show>
                      </div>
                      <div class="shrink-0 flex flex-col gap-2 p-3 border-t border-border-weaker-base">
                        <button
                          type="button"
                          class="w-full px-3 py-2.5 rounded-lg text-13-medium border border-border-weak-base text-text-base hover:bg-surface-raised-base-hover transition-colors"
                          onClick={() => toggle(item())}
                        >
                          {isSelected(item().id)
                            ? language.t("dialog.kolboAsset.deselect")
                            : language.t("dialog.kolboAsset.select")}
                        </button>
                        <button
                          type="button"
                          class="w-full px-3 py-2.5 rounded-lg text-13-medium text-white hover:opacity-90 transition-opacity"
                          style={{ "background-color": "var(--icon-agent-plan-base, #22c55e)" }}
                          onClick={() => apply([item()])}
                        >
                          {language.t("dialog.kolboAsset.useOne")}
                        </button>
                      </div>
                    </aside>
                  )
                }}
              </Show>
            </div>
          </Show>
        </Show>

        <Show when={selected().length > 0}>
          <div class="shrink-0 flex items-center gap-3 rounded-xl border border-border-weak-base bg-surface-base px-3 py-2.5 shadow-lg">
            <div class="flex -space-x-2 rtl:space-x-reverse shrink-0">
              <For each={selected().slice(0, 5)}>
                {(item) => (
                  <div class="size-8 rounded-full overflow-hidden border-2 border-surface-base bg-surface-recess-base">
                    <Show when={item.thumbnail} fallback={<Icon name={emptyIcon()} class="size-full p-1.5" />}>
                      <img src={item.thumbnail} alt="" class="size-full object-cover" referrerpolicy="no-referrer" />
                    </Show>
                  </div>
                )}
              </For>
            </div>
            <div class="flex-1 min-w-0 text-13-regular text-text-base truncate">
              {language.t("dialog.kolboAsset.selectedCount", {
                count: selected().length,
                max: maxPick(),
              })}
            </div>
            <button
              type="button"
              class="shrink-0 px-3 py-1.5 rounded-lg text-13-medium text-text-weak hover:text-text-base"
              onClick={() => setSelected([])}
            >
              {language.t("dialog.kolboAsset.clear")}
            </button>
            <button
              type="button"
              class="shrink-0 px-4 py-2 rounded-lg text-13-medium text-white hover:opacity-90 transition-opacity"
              style={{ "background-color": "var(--icon-agent-plan-base, #22c55e)" }}
              onClick={() => apply(selected())}
            >
              {language.t("dialog.kolboAsset.apply", { count: selected().length })}
            </button>
          </div>
        </Show>
      </div>
    </Dialog>
  )
}
