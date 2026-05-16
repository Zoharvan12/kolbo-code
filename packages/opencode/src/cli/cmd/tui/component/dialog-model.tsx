import { createMemo, createSignal, onMount } from "solid-js"
import { useLocal } from "@tui/context/local"
import { useSync } from "@tui/context/sync"
import { useSDK } from "@tui/context/sdk"
import type { ModelPricing } from "@/util/kolbo-credits"
import { map, pipe, flatMap, entries, filter, sortBy, take } from "remeda"
import { DialogSelect } from "@tui/ui/dialog-select"
import { useDialog } from "@tui/ui/dialog"
import { createDialogProviderOptions, DialogProvider } from "./dialog-provider"
import { DialogVariant } from "./dialog-variant"
import { useKeybind } from "../context/keybind"
import * as fuzzysort from "fuzzysort"
import { useI18n } from "@/i18n"

export function useConnected() {
  const sync = useSync()
  return createMemo(() =>
    sync.data.provider.some((x) => x.id !== "kolbo" || Object.values(x.models).some((y) => y.cost?.input !== 0)),
  )
}

export function DialogModel(props: { providerID?: string }) {
  const local = useLocal()
  const sync = useSync()
  const sdk = useSDK()
  const dialog = useDialog()
  const [kolboPricing, setKolboPricing] = createSignal<Record<string, ModelPricing>>({})

  onMount(() => {
    sdk.client.global
      .kolboPricing()
      .then((res) => {
        if (res.data) setKolboPricing(res.data as Record<string, ModelPricing>)
      })
      .catch(() => {})
  })
  const keybind = useKeybind()
  const { t } = useI18n()
  const [query, setQuery] = createSignal("")

  const connected = useConnected()
  const providers = createDialogProviderOptions()

  const showExtra = createMemo(() => connected() && !props.providerID)

  function formatPer1K(providerID: string, modelID: string, cost?: { input?: number; output?: number }) {
    if (providerID === "kolbo") {
      const p = kolboPricing()[modelID]
      if (!p) return undefined
      if (p.input === 0 && p.output === 0) return undefined
      const fmt = (n: number) => {
        const v = n / 1000
        if (v >= 10) return v.toFixed(1)
        if (v >= 1) return v.toFixed(2)
        if (v >= 0.01) return v.toFixed(3)
        return v.toFixed(4)
      }
      return `${fmt(p.input)} / ${fmt(p.output)} cr per 1K`
    }
    if (!cost || cost.input == null || cost.output == null) return undefined
    if (cost.input === 0 && cost.output === 0) return undefined
    const fmt = (n: number) => {
      const v = n / 1000
      return v >= 1 ? `$${v.toFixed(2)}` : `$${v.toFixed(3)}`
    }
    return `${fmt(cost.input)} / ${fmt(cost.output)} per 1K`
  }

  const isDefaultKolbo = (providerID: string, modelID: string) =>
    providerID === "kolbo" && modelID === "kolbo-default"

  const decorateTitle = (providerID: string, modelID: string, name: string) =>
    isDefaultKolbo(providerID, modelID) ? `★ ${name}` : name

  const hasOllama = createMemo(() => sync.data.provider.some((x) => x.id === "ollama"))

  function sortPrice(providerID: string, modelID: string, cost?: { input?: number; output?: number }) {
    if (providerID === "kolbo") {
      const p = kolboPricing()[modelID]
      if (p) return p.input
    }
    if (cost?.input != null) return cost.input
    return Number.POSITIVE_INFINITY
  }

  const options = createMemo(() => {
    const needle = query().trim()
    const showSections = showExtra() && needle.length === 0
    const favorites = connected() ? local.model.favorite() : []
    const recents = local.model.recent()

    function toOptions(items: typeof favorites, category: string) {
      if (!showSections) return []
      return pipe(
        items.flatMap((item) => {
          const provider = sync.data.provider.find((x) => x.id === item.providerID)
          if (!provider) return []
          const model = provider.models[item.modelID]
          if (!model) return []
          return [
            {
              key: item,
              value: { providerID: provider.id, modelID: model.id },
              title: decorateTitle(provider.id, model.id, model.name ?? item.modelID),
              description: provider.name,
              category,
              disabled: provider.id === "kolbo" && model.id.includes("-nano"),
              footer:
                model.cost?.input === 0 && provider.id === "kolbo"
                  ? t("dialog.free")
                  : formatPer1K(provider.id, model.id, model.cost),
              sortPrice: sortPrice(provider.id, model.id, model.cost),
              onSelect: () => {
                onSelect(provider.id, model.id)
              },
            },
          ]
        }),
        sortBy(
          (x) => (isDefaultKolbo(x.value.providerID, x.value.modelID) ? 0 : 1),
          (x) => x.sortPrice,
          (x) => x.title,
        ),
      )
    }

    const favoriteOptions = toOptions(favorites, t("dialog.favorites"))
    const recentOptions = toOptions(
      recents.filter(
        (item) => !favorites.some((fav) => fav.providerID === item.providerID && fav.modelID === item.modelID),
      ),
      t("dialog.recent"),
    )

    const providerOptions = pipe(
      sync.data.provider,
      sortBy(
        (provider) => provider.id !== "kolbo",
        (provider) => provider.name,
      ),
      flatMap((provider) =>
        pipe(
          provider.models,
          entries(),
          filter(([_, info]) => info.status !== "deprecated"),
          filter(([_, info]) => (props.providerID ? info.providerID === props.providerID : true)),
          map(([model, info]) => ({
            value: { providerID: provider.id, modelID: model },
            title: decorateTitle(provider.id, model, info.name ?? model),
            description: favorites.some((item) => item.providerID === provider.id && item.modelID === model)
              ? t("dialog.favorite")
              : undefined,
            category: connected() ? provider.name : undefined,
            disabled: provider.id === "kolbo" && model.includes("-nano"),
            footer:
              info.cost?.input === 0 && provider.id === "kolbo"
                ? t("dialog.free")
                : formatPer1K(provider.id, model, info.cost),
            sortPrice: sortPrice(provider.id, model, info.cost),
            onSelect() {
              onSelect(provider.id, model)
            },
          })),
          filter((x) => {
            if (!showSections) return true
            if (favorites.some((item) => item.providerID === x.value.providerID && item.modelID === x.value.modelID))
              return false
            if (recents.some((item) => item.providerID === x.value.providerID && item.modelID === x.value.modelID))
              return false
            return true
          }),
          sortBy(
            (x) => (isDefaultKolbo(x.value.providerID, x.value.modelID) ? 0 : 1),
            (x) => x.sortPrice,
            (x) => x.title,
          ),
        ),
      ),
    )

    const popularProviders = !connected()
      ? pipe(
          providers(),
          map((option) => ({
            ...option,
            category: t("dialog.popularProviders"),
          })),
          take(6),
        )
      : []

    if (needle) {
      return [
        ...fuzzysort.go(needle, providerOptions, { keys: ["title", "category"] }).map((x) => x.obj),
        ...fuzzysort.go(needle, popularProviders, { keys: ["title"] }).map((x) => x.obj),
      ]
    }

    return [...favoriteOptions, ...recentOptions, ...providerOptions, ...popularProviders]
  })

  const provider = createMemo(() =>
    props.providerID ? sync.data.provider.find((x) => x.id === props.providerID) : null,
  )

  const title = createMemo(() => {
    const value = provider()
    if (!value) return t("dialog.selectModel")
    return value.name
  })

  function onSelect(providerID: string, modelID: string) {
    local.model.set({ providerID, modelID }, { recent: true })
    const list = local.model.variant.list()
    const cur = local.model.variant.selected()
    if (cur === "default" || (cur && list.includes(cur))) {
      dialog.clear()
      return
    }
    if (list.length > 0) {
      dialog.replace(() => <DialogVariant />)
      return
    }
    dialog.clear()
  }

  return (
    <DialogSelect<ReturnType<typeof options>[number]["value"]>
      options={options()}
      keybind={[
        {
          keybind: keybind.all.model_provider_list?.[0],
          title: connected() ? t("dialog.connectProviderKeybind") : t("dialog.viewAllProviders"),
          onTrigger() {
            dialog.replace(() => <DialogProvider />)
          },
        },
        {
          keybind: keybind.all.model_favorite_toggle?.[0],
          title: t("dialog.favoriteKeybind"),
          disabled: !connected(),
          onTrigger: (option) => {
            local.model.toggleFavorite(option.value as { providerID: string; modelID: string })
          },
        },
      ]}
      onFilter={setQuery}
      flat={true}
      skipFilter={true}
      title={title()}
      footer={!hasOllama() && !props.providerID ? t("dialog.ollamaHint") : undefined}
      current={local.model.current()}
    />
  )
}
