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
import { ModelTooltip, formatCreditsPerThousand } from "./model-tooltip"
import { useLanguage } from "@/context/language"
import { useGlobalSDK } from "@/context/global-sdk"

type KolboPricing = Record<string, { input: number; output: number }>

const isFree = (provider: string, cost: { input: number } | undefined) =>
  provider === "kodu" && (!cost || cost.input === 0)

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
    const isDefault = (m: (typeof base)[number]) =>
      m.default || (m.provider.id === "kolbo" && m.id === "kolbo-default")
    return [...base].sort((a, b) => {
      if (mode === "priceDesc") return priceFor(b) - priceFor(a) || a.name.localeCompare(b.name)
      if (mode === "priceAsc") return priceFor(a) - priceFor(b) || a.name.localeCompare(b.name)
      const aDef = isDefault(a)
      const bDef = isDefault(b)
      if (aDef !== bDef) return aDef ? -1 : 1
      return a.name.localeCompare(b.name)
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
      filterKeys={["provider.name", "name", "id"]}
      sortBy={() => 0}
      groupBy={(x) => x.provider.name}
      sortGroupsBy={(a, b) => {
        const aProvider = a.items[0].provider.id
        const bProvider = b.items[0].provider.id
        if (popularProviders.includes(aProvider) && !popularProviders.includes(bProvider)) return -1
        if (!popularProviders.includes(aProvider) && popularProviders.includes(bProvider)) return 1
        return popularProviders.indexOf(aProvider) - popularProviders.indexOf(bProvider)
      }}
      itemWrapper={(item, node) => (
        <Tooltip
          class="w-full"
          placement="right-start"
          gutter={12}
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
        const isDefault = i.default || (i.provider.id === "kolbo" && i.id === "kolbo-default")
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
        return (
          <div class="w-full flex items-center gap-2 text-13-regular min-w-0">
            {/* Avatar tile — fixed 18×18 with recessed bg + initial fallback so
                rows never collapse height between models that have/lack icons. */}
            <div class="size-[18px] rounded-[4px] overflow-hidden bg-surface-recess-base/70 ring-1 ring-border-base/40 flex items-center justify-center shrink-0">
              <Show
                when={avatar}
                fallback={
                  <span class="text-[9px] font-medium text-text-weaker leading-none">{initial}</span>
                }
              >
                <img
                  src={proxiedAvatar}
                  alt=""
                  class="size-full object-cover"
                  referrerpolicy="no-referrer"
                  onError={(e) => {
                    ;(e.currentTarget as HTMLImageElement).style.display = "none"
                  }}
                />
              </Show>
            </div>

            {/* Name — eats available space, truncates cleanly */}
            <span class="truncate min-w-0 flex-1">{i.name}</span>

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

            {/* Credit cost — quiet right-aligned metadata. Forced LTR (dir +
                inline-block) so Hebrew/Arabic layouts don't reorder the unit
                before the value. Tabular digits keep the column aligned. */}
            <Show when={kolboCreditPrice() !== undefined}>
              <span
                dir="ltr"
                class="ms-auto inline-flex items-baseline gap-[3px] shrink-0 text-text-weak tabular-nums"
              >
                <span class="text-11-regular">{kolboCreditPrice()}</span>
                <span class="text-[10px] text-text-weaker">¢</span>
                <span class="text-[9px] text-text-weaker uppercase tracking-wider ms-0.5">/1K</span>
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
          class="w-96 h-[32rem] max-h-[80vh] flex flex-col p-2 rounded-md border border-border-base bg-surface-raised-stronger-non-alpha shadow-md z-[60] outline-none overflow-hidden"
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
