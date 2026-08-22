import { Component, For, Show, createEffect, createMemo, createSignal, onCleanup } from "solid-js"
import { Dialog } from "@opencode-ai/ui/dialog"
import { Icon } from "@opencode-ai/ui/icon"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { useLanguage } from "@/context/language"
import { useServer } from "@/context/server"

export type KolboAssetItem = {
  id: string
  name: string
  /** Grid card image — preferably the optimized small thumb. */
  thumbnail?: string
  sheet?: string
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

/** Moodboards stay capped; Visual DNAs are unlimited in this picker. */
const MAX_MOODBOARD = 4

/** Recover a Mongo hex id from string / Buffer / `{buffer:{…}}` leaks. */
function coerceId(raw: unknown): string | null {
  if (raw == null) return null
  if (typeof raw === "string") {
    const s = raw.trim()
    if (!s || s === "[object Object]") return null
    if (/^[a-f0-9]{24}$/i.test(s)) return s
    return s
  }
  if (typeof raw === "number" || typeof raw === "bigint") return String(raw)
  if (typeof raw !== "object") return null
  const obj = raw as Record<string, any>
  if (typeof obj.toHexString === "function") {
    const hex = obj.toHexString()
    if (typeof hex === "string" && hex) return hex
  }
  if (obj.type === "Buffer" && Array.isArray(obj.data)) {
    return (obj.data as number[]).map((b) => (b & 0xff).toString(16).padStart(2, "0")).join("")
  }
  if (obj.buffer != null) {
    const buf = obj.buffer
    const bytes = Array.isArray(buf)
      ? buf
      : typeof buf === "object"
        ? Object.keys(buf as object)
            .filter((k) => /^\d+$/.test(k))
            .sort((a, b) => Number(a) - Number(b))
            .map((k) => Number((buf as Record<string, number>)[k]))
        : []
    if (bytes.length === 12) return bytes.map((b) => (b & 0xff).toString(16).padStart(2, "0")).join("")
  }
  return null
}

/** Prefer a real Mongo id; when the sidecar collapses every ObjectId to
 *  "[object Object]", fall back to name so the grid can still multi-select. */
function keyOf(item: Pick<KolboAssetItem, "id" | "name">) {
  const id = coerceId(item.id) ?? (typeof item.id === "string" ? item.id.trim() : "")
  if (id && id !== "[object Object]") return id
  return `name:${item.name}`
}

function apiId(item: Pick<KolboAssetItem, "id">) {
  return coerceId(item.id)
}

function coverFit(item: KolboAssetItem) {
  return (item.dnaType ?? "").toLowerCase() === "environment"
}

/** Merge URL lists without dropping extras from either side. */
function mergeUrls(...lists: (string[] | undefined)[]) {
  const out: string[] = []
  for (const list of lists) {
    for (const url of list ?? []) {
      if (url && !out.includes(url)) out.push(url)
    }
  }
  return out
}

/** Full-res DNA media for the gallery — sheet + refs. Never the small card thumb. */
function allMedia(item: KolboAssetItem) {
  const urls = mergeUrls(item.sheet ? [item.sheet] : undefined, item.images)
  if (urls.length) return urls
  return item.thumbnail ? [item.thumbnail] : []
}

/** Normalize a detail/list payload that may still be snake_case from older sidecars. */
function normalizeAsset(row: Record<string, any>, fallback?: KolboAssetItem): KolboAssetItem {
  const id = coerceId(row.id ?? row._id) ?? fallback?.id ?? ""
  const sheet =
    (typeof row.sheet === "string" && row.sheet) ||
    (typeof row.sheet_url === "string" && row.sheet_url) ||
    (typeof row.characterSheet === "string" && row.characterSheet) ||
    fallback?.sheet
  const small =
    (typeof row.thumbnail_small_url === "string" && row.thumbnail_small_url) ||
    (typeof row.thumbnailSmallUrl === "string" && row.thumbnailSmallUrl) ||
    undefined
  const thumb =
    small ||
    (typeof row.thumbnail === "string" && row.thumbnail) ||
    (typeof row.thumbnail_url === "string" && row.thumbnail_url) ||
    fallback?.thumbnail
  const fromImages = Array.isArray(row.images)
    ? row.images.flatMap((img: unknown) => {
        if (typeof img === "string") return [img]
        if (img && typeof img === "object" && typeof (img as { url?: string }).url === "string") {
          return [(img as { url: string }).url]
        }
        return []
      })
    : []
  const fromInventory = Array.isArray(row.imageInventory ?? row.image_inventory)
    ? (row.imageInventory ?? row.image_inventory).flatMap((img: any) =>
        typeof img?.url === "string" ? [img.url] : typeof img === "string" ? [img] : [],
      )
    : []
  const images = mergeUrls(
    fromImages,
    fromInventory,
    fallback?.images,
  ).filter((url) => url !== sheet)
  return {
    id,
    name: String(row.name || fallback?.name || ""),
    thumbnail: thumb,
    sheet,
    dnaType: row.dnaType ?? row.dna_type ?? fallback?.dnaType,
    description: typeof row.description === "string" ? row.description : fallback?.description,
    images: images.length ? images : undefined,
  }
}

/**
 * Browse Visual DNAs and moodboards as a picture grid — multi-select,
 * detail panel with all media, Apply bar. No create/edit here.
 */
export const DialogSelectKolboAsset: Component<Props> = (props) => {
  const dialog = useDialog()
  const language = useLanguage()
  const server = useServer()
  const [tab, setTab] = createSignal<Tab>(props.initialTab ?? "visual-dna")
  const [query, setQuery] = createSignal("")
  const [selected, setSelected] = createSignal<KolboAssetItem[]>([])
  const [previewKey, setPreviewKey] = createSignal<string | null>(null)
  const [enriched, setEnriched] = createSignal<Record<string, KolboAssetItem>>({})
  const [detailLoading, setDetailLoading] = createSignal(false)
  const [galleryIdx, setGalleryIdx] = createSignal(0)

  createEffect(() => {
    if (tab() === "global-dna") props.onNeedGlobal()
  })

  createEffect(() => {
    tab()
    setSelected([])
    setPreviewKey(null)
    setGalleryIdx(0)
  })

  const kind = (): Kind => (tab() === "moodboard" ? "moodboard" : "visual-dna")
  /** `null` = no cap (Visual DNA). */
  const maxPick = () => (kind() === "moodboard" ? MAX_MOODBOARD : null)

  const source = createMemo(() => {
    const rows =
      tab() === "moodboard" ? props.moodboards : tab() === "global-dna" ? props.globalDnas : props.visualDnas
    return rows.map((row) => normalizeAsset(row as unknown as Record<string, any>, row))
  })
  const items = createMemo(() => {
    const q = query().trim().toLowerCase()
    if (!q) return source()
    return source().filter(
      (item) => item.name.toLowerCase().includes(q) || (item.dnaType ?? "").toLowerCase().includes(q),
    )
  })
  const loading = createMemo(() => tab() === "global-dna" && props.globalLoading && props.globalDnas.length === 0)

  const isSelected = (item: KolboAssetItem) => selected().some((row) => keyOf(row) === keyOf(item))
  const atMax = () => {
    const max = maxPick()
    return max != null && selected().length >= max
  }

  const resolve = (key: string): KolboAssetItem | null => {
    const extra = enriched()[key]
    const row =
      items().find((item) => keyOf(item) === key) ?? selected().find((item) => keyOf(item) === key) ?? null
    if (!row && !extra) return null
    return { ...row, ...extra, id: row?.id ?? extra?.id ?? key } as KolboAssetItem
  }

  const preview = createMemo(() => {
    const key = previewKey()
    return key ? resolve(key) : null
  })

  const gallery = createMemo(() => {
    const item = preview()
    return item ? allMedia(item) : []
  })

  createEffect(() => {
    const urls = gallery()
    if (galleryIdx() >= urls.length) setGalleryIdx(0)
  })

  // Always hydrate the preview DNA — list payloads are often thumbnail-only.
  createEffect(() => {
    const key = previewKey()
    if (!key || kind() === "moodboard") return
    const cached = enriched()[key]
    // Skip only when we already have real multi-image detail (or a sheet + refs).
    if (cached && (cached.sheet || (cached.images?.length ?? 0) > 0)) return
    const row = resolve(key)
    const id = row ? apiId(row) : null
    if (!id) return
    const base = server.current?.http.url
    if (!base) return
    setDetailLoading(true)
    let cancelled = false
    void fetch(`${base}/global/kolbo-visual-dna/${encodeURIComponent(id)}`)
      .then(async (res) => {
        if (!res.ok || cancelled) return
        const body = (await res.json()) as Record<string, any>
        if (cancelled) return
        const next = normalizeAsset(body, row ?? undefined)
        if (!next.name) return
        setEnriched((prev) => ({
          ...prev,
          [key]: {
            ...next,
            // Keep the optimized small thumb on the card if detail only returned fulls.
            thumbnail: row?.thumbnail && row.thumbnail !== next.sheet ? row.thumbnail : next.thumbnail,
            images: mergeUrls(next.images, row?.images),
            sheet: next.sheet ?? row?.sheet,
          },
        }))
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
    const key = keyOf(item)
    setPreviewKey(key)
    setGalleryIdx(0)
    if (isSelected(item)) {
      setSelected((prev) => prev.filter((x) => keyOf(x) !== key))
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
            <div class="flex flex-1 min-h-0 gap-3 flex-col lg:flex-row">
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
                    const picked = () => isSelected(item)
                    const disabled = () => atMax() && !picked()
                    const active = () => previewKey() === keyOf(item)
                    const cover = () => coverFit(item)
                    const count = () => allMedia(enriched()[keyOf(item)] ? { ...item, ...enriched()[keyOf(item)] } : item).length
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
                          <Show when={count() > 1}>
                            <span class="absolute bottom-1.5 end-1.5 px-1.5 py-0.5 rounded-md bg-black/65 text-white text-11-medium">
                              {count()}
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
                  const hero = () => gallery()[galleryIdx()] ?? item().thumbnail
                  return (
                    <aside class="flex w-full lg:w-[340px] shrink-0 flex-col min-h-0 max-h-[42vh] lg:max-h-none rounded-2xl border border-border-weaker-base bg-surface-recess-base overflow-hidden">
                      <div class="relative aspect-[4/3] w-full bg-black/30 shrink-0">
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

                      <div class="flex-1 min-h-0 overflow-auto flex flex-col gap-3 px-3 py-3">
                        <Show when={gallery().length > 0}>
                          <div class="flex flex-col gap-1.5">
                            <div class="text-11-medium text-text-weak uppercase tracking-wide">
                              {language.t("dialog.kolboAsset.allMedia")} ({gallery().length})
                            </div>
                            <div class="grid grid-cols-3 gap-1.5">
                              <For each={gallery()}>
                                {(url, index) => (
                                  <button
                                    type="button"
                                    class="rounded-md overflow-hidden border aspect-square transition-colors"
                                    classList={{
                                      "border-green-500/80": galleryIdx() === index(),
                                      "border-border-weaker-base hover:border-border-weak-base": galleryIdx() !== index(),
                                    }}
                                    onClick={() => setGalleryIdx(index())}
                                  >
                                    <img
                                      src={url}
                                      alt=""
                                      class="size-full object-cover"
                                      referrerpolicy="no-referrer"
                                    />
                                  </button>
                                )}
                              </For>
                            </div>
                          </div>
                        </Show>

                        <div class="flex flex-col gap-1 pt-1">
                          <div class="text-14-medium text-text-strong break-words">{item().name}</div>
                          <Show when={item().dnaType}>
                            <div class="text-12-regular text-text-weak">{item().dnaType}</div>
                          </Show>
                          <Show when={item().description}>
                            <p class="text-12-regular text-text-base whitespace-pre-wrap break-words line-clamp-6">
                              {item().description}
                            </p>
                          </Show>
                        </div>
                      </div>

                      <div class="shrink-0 flex flex-col gap-2 p-3 border-t border-border-weaker-base">
                        <button
                          type="button"
                          class="w-full px-3 py-2.5 rounded-lg text-13-medium border border-border-weak-base text-text-base hover:bg-surface-raised-base-hover transition-colors"
                          onClick={() => toggle(item())}
                        >
                          {isSelected(item())
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
              <Show
                when={maxPick() != null}
                fallback={language.t("dialog.kolboAsset.selectedCountUnlimited", {
                  count: selected().length,
                })}
              >
                {language.t("dialog.kolboAsset.selectedCount", {
                  count: selected().length,
                  max: maxPick()!,
                })}
              </Show>
            </div>
            <button
              type="button"
              class="px-3 py-1.5 rounded-lg text-13-medium text-text-weak hover:text-text-base hover:bg-surface-raised-base-hover transition-colors"
              onClick={() => setSelected([])}
            >
              {language.t("dialog.kolboAsset.clear")}
            </button>
            <button
              type="button"
              class="px-4 py-1.5 rounded-lg text-13-medium text-white hover:opacity-90 transition-opacity"
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
