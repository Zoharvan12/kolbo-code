import { Popover as Kobalte } from "@kobalte/core/popover"
import {
  Component,
  ComponentProps,
  createEffect,
  createMemo,
  createRoot,
  createSignal,
  JSX,
  onMount,
  Show,
  ValidComponent,
} from "solid-js"
import { createStore } from "solid-js/store"
import { useLocal } from "@/context/local"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { usePlatformOps } from "@opencode-ai/ui/context/platform-ops"
import { popularProviders } from "@/hooks/use-providers"
import { Button } from "@opencode-ai/ui/button"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { Dialog } from "@opencode-ai/ui/dialog"
import { List } from "@opencode-ai/ui/list"
import { Tooltip } from "@opencode-ai/ui/tooltip"
import { ModelTooltip, CreditCoin, formatCreditsPerThousand } from "./model-tooltip"
import { useLanguage } from "@/context/language"
import { useGlobalSDK } from "@/context/global-sdk"

type KolboPricing = Record<string, { input: number; output: number }>

const isFree = (provider: string, cost: { input: number } | undefined) =>
  provider === "kodu" && (!cost || cost.input === 0)

// Family name the backend gives the auto slots (kolbo-api set-code-model-groups.js).
// Their section always leads the picker and keeps its curated internal order.
const SLOT_GROUP = "Kolbo"

// Cost band → theme token. Semantic tokens rather than raw hex so the chips
// follow light/dark and any future theme. There is no --text-* equivalent for
// these, so the icon colour doubles as the foreground (see usage below).
const COST_TIER_COLOR: Record<"low" | "medium" | "high", string> = {
  low: "--icon-success-base",
  medium: "--icon-info-base",
  high: "--icon-warning-base",
}

// Module-scope so the user's choice survives Kobalte's unmount-on-close.
type SortMode = "name" | "priceDesc" | "priceAsc"
const SORT_STORAGE_KEY = "kolbo.modelPicker.sort"

function loadInitialSortMode(): SortMode {
  if (typeof localStorage === "undefined") return "priceAsc"
  try {
    const v = localStorage.getItem(SORT_STORAGE_KEY)
    if (v === "name" || v === "priceDesc" || v === "priceAsc") return v
  } catch {}
  return "priceAsc"
}

const [sortMode, setSortMode] = createSignal<SortMode>(loadInitialSortMode())

if (typeof window !== "undefined") {
  // createRoot keeps the persister alive for the module's lifetime.
  createRoot(() => {
    createEffect(() => {
      try {
        localStorage.setItem(SORT_STORAGE_KEY, sortMode())
      } catch {}
    })
  })
}

// Fetch once per page so the price-sorted list doesn't flash on every reopen.
const [kolboPricing, setKolboPricing] = createSignal<KolboPricing>({})
let kolboPricingInflight: Promise<unknown> | null = null
function ensureKolboPricing(sdk: ReturnType<typeof useGlobalSDK>) {
  if (kolboPricingInflight) return
  kolboPricingInflight = sdk.client.global
    .kolboPricing()
    .then((res) => {
      if (res.data) setKolboPricing(res.data as KolboPricing)
    })
    .catch(() => {
      // Allow a future mount to retry after transient failures.
      kolboPricingInflight = null
    })
}

type ModelState = ReturnType<typeof useLocal>["model"]

const ModelList: Component<{
  provider?: string
  class?: string
  onSelect: () => void
  action?: JSX.Element
  model?: ModelState
}> = (props) => {
  const model = props.model ?? useLocal().model
  const language = useLanguage()
  const globalSDK = useGlobalSDK()
  // Kick off the shared pricing fetch — no-op if it already ran. The signal
  // is module-scope so the result survives every popover/dialog close.
  onMount(() => ensureKolboPricing(globalSDK))

  // Sort mode is module-level (see top of file) so it survives popover/dialog
  // remounts and is shared between every ModelList instance.
  const togglePriceSort = () =>
    setSortMode((m) => (m === "priceAsc" ? "priceDesc" : "priceAsc"))

  // Per-item input rate (per million tokens). Kolbo models read from the
  // separate pricing endpoint; everything else uses the model's own cost.input.
  // Unpriced models (returns 0) sink to the bottom of expensive sort and float
  // to the top of cheap sort — consistent tail placement reads better than
  // mid-list interleaving.
  const priceOf = (m: { id: string; provider: { id: string }; cost?: { input?: number } }) => {
    if (m.provider.id === "kolbo") {
      const p = kolboPricing()[m.id]
      return p ? p.input : 0
    }
    return m.cost?.input ?? 0
  }

  // Model family + catalog position, both backend-owned (kolbo-api listModels →
  // group / sort_order, set by set-code-model-groups.js). Providers that send
  // neither collapse into a single section named after the provider, which is
  // exactly the old behaviour.
  const groupOf = (m: { provider: { id: string; name: string }; group?: string }) =>
    m.provider.id === "kolbo" ? (m.group ?? SLOT_GROUP) : m.provider.name
  const sortOrderOf = (m: { sortOrder?: number }) => m.sortOrder ?? 1000

  // Pre-sort items in the memo so the sortMode signal triggers re-render
  // through the items prop. List's groupBy preserves order within each group.
  const models = createMemo(() => {
    const base = model
      .list()
      .filter((m) => model.visible({ modelID: m.id, providerID: m.provider.id }))
      .filter((m) => (props.provider ? m.provider.id === props.provider : true))
    const mode = sortMode()
    // Snapshot the price signal once into a Map so sort doesn't re-subscribe
    // on every comparator call. Big win for price-mode on long lists.
    const prices = new Map<string, number>(base.map((m) => [m.id, priceOf(m)]))
    const priceFor = (m: (typeof base)[number]) => prices.get(m.id) ?? 0
    return [...base].sort((a, b) => {
      // The auto slots are a curated pair, not commodities to price-compare:
      // Smart is the headline product and the backend default, so it leads its
      // section in every sort mode. Under a price sort it would otherwise fall
      // below Fast purely because Fast is cheaper.
      const aSlot = groupOf(a) === SLOT_GROUP
      const bSlot = groupOf(b) === SLOT_GROUP
      if (aSlot && bSlot) return sortOrderOf(a) - sortOrderOf(b)

      if (mode === "priceDesc") return priceFor(b) - priceFor(a) || a.name.localeCompare(b.name)
      if (mode === "priceAsc") return priceFor(a) - priceFor(b) || a.name.localeCompare(b.name)
      // Name mode is really "catalog order": the backend's sortOrder wins, with
      // name only as a tiebreak. Same rule as kolbo-map's normalizeModels —
      // Mongo is authoritative so families can be re-ordered without a release.
      // No separate default-pinning: the default lives in the first family
      // block, so pinning it would only fight the grouping.
      return sortOrderOf(a) - sortOrderOf(b) || a.name.localeCompare(b.name)
    })
  })

  return (
    <div class={`flex flex-col flex-1 min-h-0 ${props.class ?? ""}`}>
      {/* Sort toolbar — single segmented pill, no separate label. The toolbar
          itself communicates "sort" via its position and shape, so a SORT BY
          header was just visual noise (especially in RTL where it landed at
          the far edge). */}
      <div class="flex items-center px-1 pb-1.5 mb-0.5 shrink-0">
        <div class="flex items-center gap-0.5 rounded-md bg-surface-recess-base/60 p-0.5" dir="ltr">
          <button
            type="button"
            onClick={() => setSortMode("name")}
            class={`px-2 py-0.5 rounded text-11-regular transition-colors ${
              sortMode() === "name"
                ? "bg-surface-raised-base text-text-base shadow-[0_1px_0_rgba(0,0,0,0.04)]"
                : "text-text-weak hover:text-text-base"
            }`}
          >
            {language.t("dialog.model.sort.name")}
          </button>
          <button
            type="button"
            onClick={togglePriceSort}
            class={`px-2 py-0.5 rounded text-11-regular transition-colors inline-flex items-center gap-1 ${
              sortMode() !== "name"
                ? "bg-surface-raised-base text-text-base shadow-[0_1px_0_rgba(0,0,0,0.04)]"
                : "text-text-weak hover:text-text-base"
            }`}
          >
            <span>{language.t("dialog.model.sort.price")}</span>
            <Show when={sortMode() !== "name"} fallback={<span class="opacity-25 text-[10px]">▾</span>}>
              <span
                class="text-[10px] transition-transform duration-150 ease-out inline-block"
                style={{ transform: sortMode() === "priceAsc" ? "rotate(180deg)" : "rotate(0deg)" }}
              >
                ▾
              </span>
            </Show>
          </button>
        </div>
      </div>
      <List
        class={`flex-1 min-h-0 [&_[data-slot=list-scroll]]:flex-1 [&_[data-slot=list-scroll]]:min-h-0`}
        search={{
          placeholder: language.t("dialog.model.search.placeholder"),
          autofocus: true,
          action: props.action,
        }}
      emptyMessage={language.t("dialog.model.empty")}
      key={(x) => `${x.provider.id}:${x.id}`}
      items={models}
      current={model.current()}
      filterKeys={["provider.name", "name", "id", "group", "description"]}
      sortBy={() => 0}
      groupBy={groupOf}
      sortGroupsBy={(a, b) => {
        const aProvider = a.items[0].provider.id
        const bProvider = b.items[0].provider.id
        // The auto slots always lead the picker, in every sort mode. They are
        // the recommended default rather than one family among many, so they
        // are exempt from the price ordering below — otherwise any family with
        // a cheaper cheapest-model (Gemini Flash Lite at 0.038 vs the slots'
        // 0.060) would push them down the list.
        const aSlotGroup = groupOf(a.items[0]) === SLOT_GROUP
        const bSlotGroup = groupOf(b.items[0]) === SLOT_GROUP
        if (aSlotGroup !== bSlotGroup) return aSlotGroup ? -1 : 1
        // Kolbo's other sections are model families, not providers. In catalog
        // order they follow the backend's sortOrder (Claude → GPT → Gemini …),
        // rearrangeable from Mongo alone. Under a price sort they instead follow
        // their own best price, otherwise rows would be price-ordered inside
        // sections while the sections themselves ignored price — so "cheapest
        // first" would not actually hold reading top to bottom.
        if (aProvider === "kolbo" && bProvider === "kolbo") {
          const mode = sortMode()
          if (mode === "priceAsc") return Math.min(...a.items.map(priceOf)) - Math.min(...b.items.map(priceOf))
          if (mode === "priceDesc") return Math.max(...b.items.map(priceOf)) - Math.max(...a.items.map(priceOf))
          return Math.min(...a.items.map(sortOrderOf)) - Math.min(...b.items.map(sortOrderOf))
        }
        if (aProvider === "kolbo") return -1
        if (bProvider === "kolbo") return 1
        if (popularProviders.includes(aProvider) && !popularProviders.includes(bProvider)) return -1
        if (!popularProviders.includes(aProvider) && popularProviders.includes(bProvider)) return 1
        return popularProviders.indexOf(aProvider) - popularProviders.indexOf(bProvider)
      }}
      itemWrapper={(item, node) => (
        <Tooltip
          class="w-full"
          placement="right-start"
          gutter={12}
          // Kobalte defaults openDelay to ~700ms. That is right for an incidental
          // hover, but this tooltip is the whole point of hovering a row — you
          // come here to compare cost and capabilities, so waiting for it feels
          // broken. Scoped to the picker rather than changed globally, where the
          // delay still protects against tooltips firing on passing cursors.
          openDelay={0}
          value={
            <ModelTooltip
              model={item}
              latest={item.latest}
              free={isFree(item.provider.id, item.cost)}
              kolboPricing={item.provider.id === "kolbo" ? kolboPricing()[item.id] : undefined}
            />
          }
        >
          {node}
        </Tooltip>
      )}
      onSelect={(x) => {
        model.set(x ? { modelID: x.id, providerID: x.provider.id } : undefined, {
          recent: true,
        })
        props.onSelect()
      }}
    >
      {(i) => {
        const platformOps = usePlatformOps()
        const avatar = i.avatar
        const proxiedAvatar = avatar ? (platformOps.imageProxyUrl?.(avatar) ?? avatar) : undefined
        const isDefault = i.default === true
        // Resolve the kolbo per-1K price once per row, reactively. The signal
        // read is cached in a memo so multiple reads in the same row don't
        // re-subscribe.
        const kolboCreditPrice = createMemo<string | undefined>(() => {
          if (i.provider.id !== "kolbo") return undefined
          const p = kolboPricing()[i.id]
          if (!p || (p.input === 0 && p.output === 0)) return undefined
          return formatCreditsPerThousand(p.input)
        })
        const initial = i.name?.trim()?.charAt(0)?.toUpperCase() ?? "?"
        // A broken avatar URL has to fall back to the initial, not just vanish —
        // hiding the <img> alone leaves an empty tile (which is what every row
        // showed when the proxy 403'd non-kolbo.ai hosts).
        const [avatarFailed, setAvatarFailed] = createSignal(false)
        return (
          <div class="w-full flex items-center gap-2.5 text-13-regular min-w-0">
            {/* Avatar tile — 24×24 with recessed bg + initial fallback so rows
                never collapse height between models that have/lack icons.
                The image desaturates until the row is hovered or current
                (kolbo-map behaviour). List rows carry no `group` class, so the
                variant targets the real wrapper, data-slot="list-item". */}
            <div class="size-6 rounded-[6px] overflow-hidden bg-surface-recess-base/70 ring-1 ring-border-base/40 flex items-center justify-center shrink-0">
              <Show
                when={avatar && !avatarFailed()}
                fallback={
                  <span class="text-[10px] font-medium text-text-weaker leading-none">{initial}</span>
                }
              >
                <img
                  src={proxiedAvatar}
                  alt=""
                  data-list-desaturate
                  class="size-full object-cover"
                  referrerpolicy="no-referrer"
                  // WebView2 auto-lazy-loads images it judges off-screen and
                  // swaps in placeholders ("[Intervention] Images loaded lazily
                  // and replaced with placeholders"). In a scrollable list that
                  // hit every row below the fold, and the deferred load tripped
                  // the onError latch below — so those rows showed their initial
                  // forever, even after scrolling into view. These are 1-9KB
                  // icons in a short list; eager decoding costs nothing.
                  loading="eager"
                  decoding="async"
                  onError={() => setAvatarFailed(true)}
                />
              </Show>
            </div>

            {/* Name + description stacked. min-w-0 on both so long descriptions
                truncate instead of pushing the price column off the row. */}
            <div class="min-w-0 flex-1 flex flex-col justify-center gap-px">
              <span class="truncate min-w-0">{i.name}</span>
              <Show when={i.description}>
                {/* text-weak, not text-weaker: at 10px the weaker token is
                    rgba(255,255,255,0.284) in dark mode, which is legible as a
                    shape but not as text. weak (0.422) still reads as secondary
                    against the name without disappearing. */}
                <span class="truncate min-w-0 text-[10px] leading-[1.3] text-text-weak">
                  {i.description}
                </span>
              </Show>
            </div>

            {/* Status tags — typographic, not boxed. Reads as metadata, not
                stickers. DEFAULT slightly stronger (it's the actionable one). */}
            <Show when={isDefault}>
              <span class="shrink-0 text-[9px] font-medium uppercase tracking-[0.1em] text-text-weak">
                · {language.t("model.tag.default")}
              </span>
            </Show>
            <Show when={isFree(i.provider.id, i.cost)}>
              <span class="shrink-0 text-[9px] font-medium uppercase tracking-[0.1em] text-text-weaker">
                · {language.t("model.tag.free")}
              </span>
            </Show>
            <Show when={i.latest}>
              <span class="shrink-0 text-[9px] font-medium uppercase tracking-[0.1em] text-text-weaker">
                · {language.t("model.tag.latest")}
              </span>
            </Show>

            {/* Cost band, revealed on hover / keyboard focus / selection.
                Permanently badging every expensive row put an orange chip on
                most of the list, which reads as noise rather than a warning —
                and the always-visible price column already carries the
                persistent signal, so nothing is lost by holding this back.

                All three tiers show, not just "high": once it is hover-only
                there is no clutter cost, and "low" is genuinely useful
                reassurance when picking a cheap model.

                Shown ONLY for the row you are pointing at — not for the
                selected row, which would leave one chip permanently on screen.
                `[data-active]` rather than `:focus-visible` because that is the
                List's own notion of the current row: it is set by mouse-move
                AND by keyboard navigation, so arrow-key users get the same
                reveal without a separate rule.

                Opacity, not conditional rendering — the chip always occupies
                its slot, so revealing it cannot reflow the row (UX rule:
                content jumping). Colour is never the only cue; the label is
                always spelled out. */}
            {/* Cost slot — the tier chip and the per-1K price share one grid
                cell, stacked. Both describe cost and are never needed at the
                same instant, so giving each its own column meant the hidden
                chip still reserved ~78px and squeezed "Auto Smart" down to
                "Auto S…". Stacked, the slot is as wide as the wider of the two
                and the name gets that width back.
                Crossfade, not conditional rendering: the cell keeps its size,
                so revealing the chip cannot reflow the row. */}
            <Show when={i.costTier || kolboCreditPrice() !== undefined}>
              <span class="ms-auto shrink-0 grid items-center justify-items-end">
                <Show when={kolboCreditPrice() !== undefined}>
                  <span
                    data-list-hide
                    dir="ltr"
                    class="[grid-area:1/1] inline-flex items-center gap-1 text-text-weak tabular-nums"
                  >
                    {/* Coin instead of a "¢" glyph — these are Kolbo credits,
                        not cents, and the letterform was both wrong and
                        illegible at 10px. */}
                    <CreditCoin class="w-3 h-3 text-text-weaker" />
                    <span class="text-11-regular">{kolboCreditPrice()}</span>
                    <span class="text-[9px] text-text-weaker uppercase tracking-wider">/1K</span>
                  </span>
                </Show>
                <Show when={i.costTier}>
                  {(tier) => (
                    <span
                      data-list-reveal
                      class="[grid-area:1/1] inline-flex items-center whitespace-nowrap rounded-full px-1.5 py-px text-[9px] font-medium uppercase tracking-[0.08em]"
                      style={{
                        color: `var(${COST_TIER_COLOR[tier()]})`,
                        "background-color": `color-mix(in srgb, var(${COST_TIER_COLOR[tier()]}) 14%, transparent)`,
                      }}
                    >
                      {language.t(`model.tag.cost.${tier()}`)}
                    </span>
                  )}
                </Show>
              </span>
            </Show>
          </div>
        )
      }}
      </List>
    </div>
  )
}

type ModelSelectorTriggerProps = Omit<ComponentProps<typeof Kobalte.Trigger>, "as" | "ref">
type Dismiss = "escape" | "outside" | "select" | "manage" | "provider"

export function ModelSelectorPopover(props: {
  provider?: string
  model?: ModelState
  children?: JSX.Element
  triggerAs?: ValidComponent
  triggerProps?: ModelSelectorTriggerProps
  onClose?: (cause: "escape" | "select") => void
}) {
  const [store, setStore] = createStore<{
    open: boolean
    dismiss: Dismiss | null
  }>({
    open: false,
    dismiss: null,
  })
  const dialog = useDialog()

  const close = (dismiss: Dismiss) => {
    setStore("dismiss", dismiss)
    setStore("open", false)
  }

  const handleManage = () => {
    close("manage")
    void import("./dialog-manage-models").then((x) => {
      dialog.show(() => <x.DialogManageModels />)
    })
  }

  const handleConnectProvider = () => {
    close("provider")
    void import("./dialog-select-provider").then((x) => {
      dialog.show(() => <x.DialogSelectProvider />)
    })
  }
  const language = useLanguage()

  return (
    <Kobalte
      open={store.open}
      onOpenChange={(next) => {
        if (next) setStore("dismiss", null)
        setStore("open", next)
      }}
      modal={false}
      placement="top-start"
      // Gutter pushes the popover well clear of the trigger pill's own
      // tooltip ("Choose model") which also anchors above the trigger at
      // gutter=4. Without this clearance, the two stack and the tooltip
      // chips the top row of the model list.
      gutter={14}
    >
      <Kobalte.Trigger as={props.triggerAs ?? "div"} {...props.triggerProps}>
        {props.children}
      </Kobalte.Trigger>
      <Kobalte.Portal>
        <Kobalte.Content
          class="w-96 h-[42rem] max-h-[85vh] flex flex-col p-2 rounded-md border border-border-base bg-surface-raised-stronger-non-alpha shadow-md z-[60] outline-none overflow-hidden"
          onEscapeKeyDown={(event) => {
            close("escape")
            event.preventDefault()
            event.stopPropagation()
          }}
          onPointerDownOutside={() => close("outside")}
          onFocusOutside={() => close("outside")}
          onCloseAutoFocus={(event) => {
            const dismiss = store.dismiss
            if (dismiss === "outside") event.preventDefault()
            if (dismiss === "escape" || dismiss === "select") {
              event.preventDefault()
              props.onClose?.(dismiss)
            }
            setStore("dismiss", null)
          }}
        >
          <Kobalte.Title class="sr-only">{language.t("dialog.model.select.title")}</Kobalte.Title>
          <ModelList
            provider={props.provider}
            model={props.model}
            onSelect={() => close("select")}
            class="p-1"
            action={
              <div class="flex items-center gap-1">
                <Tooltip placement="top" value={language.t("command.provider.connect")}>
                  <IconButton
                    icon="plus-small"
                    variant="ghost"
                    iconSize="normal"
                    class="size-6"
                    aria-label={language.t("command.provider.connect")}
                    onClick={handleConnectProvider}
                  />
                </Tooltip>
                <Tooltip placement="top" value={language.t("dialog.model.manage")}>
                  <IconButton
                    icon="sliders"
                    variant="ghost"
                    iconSize="normal"
                    class="size-6"
                    aria-label={language.t("dialog.model.manage")}
                    onClick={handleManage}
                  />
                </Tooltip>
              </div>
            }
          />
        </Kobalte.Content>
      </Kobalte.Portal>
    </Kobalte>
  )
}

export const DialogSelectModel: Component<{ provider?: string; model?: ModelState }> = (props) => {
  const dialog = useDialog()
  const language = useLanguage()

  const provider = () => {
    void import("./dialog-select-provider").then((x) => {
      dialog.show(() => <x.DialogSelectProvider />)
    })
  }

  const manage = () => {
    void import("./dialog-manage-models").then((x) => {
      dialog.show(() => <x.DialogManageModels />)
    })
  }

  return (
    <Dialog
      title={language.t("dialog.model.select.title")}
      action={
        <Button class="h-7 -my-1 text-14-medium" icon="plus-small" tabIndex={-1} onClick={provider}>
          {language.t("command.provider.connect")}
        </Button>
      }
    >
      <ModelList provider={props.provider} model={props.model} onSelect={() => dialog.close()} />
      <Button variant="ghost" class="ml-3 mt-5 mb-6 text-text-base self-start" onClick={manage}>
        {language.t("dialog.model.manage")}
      </Button>
    </Dialog>
  )
}
