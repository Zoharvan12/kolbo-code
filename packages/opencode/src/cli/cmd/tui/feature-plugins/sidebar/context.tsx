import type { AssistantMessage } from "@opencode-ai/sdk/v2"
import type { TuiPlugin, TuiPluginApi, TuiPluginModule } from "@opencode-ai/plugin/tui"
import { createMemo, createSignal, onMount, Show } from "solid-js"
import { useI18n } from "@/i18n"
import { sessionCredits, type ModelPricing } from "@/util/kolbo-credits"

const id = "internal:sidebar-context"

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
})

function View(props: { api: TuiPluginApi; session_id: string }) {
  const { t } = useI18n()
  const theme = () => props.api.theme.current
  const msg = createMemo(() => props.api.state.session.messages(props.session_id))
  const [kolboBalance, setKolboBalance] = createSignal<number | null>(null)
  const [kolboPricing, setKolboPricing] = createSignal<Record<string, ModelPricing>>({})

  // Pricing is stable across a session — fetch once on mount.
  onMount(() => {
    props.api.client.global
      .kolboPricing()
      .then((res) => {
        if (res.data) setKolboPricing(res.data as Record<string, ModelPricing>)
      })
      .catch(() => {})
  })

  const state = createMemo(() => {
    const last = msg().findLast((item): item is AssistantMessage => item.role === "assistant" && item.tokens.output > 0)
    if (!last) {
      return {
        tokens: 0,
        percent: null,
        isKolbo: false,
        cost: 0,
        creditsUsed: 0,
      }
    }

    const tokens =
      last.tokens.input + last.tokens.output + last.tokens.reasoning + last.tokens.cache.read + last.tokens.cache.write
    const model = props.api.state.provider.find((item) => item.id === last.providerID)?.models[last.modelID]
    const isKolbo = last.providerID === "kolbo"
    const isLocal = last.providerID === "ollama" || last.providerID === "lmstudio"
    const cost = isKolbo || isLocal ? 0 : msg().reduce((sum, item) => sum + (item.role === "assistant" ? item.cost : 0), 0)

    const creditsUsed = isKolbo ? sessionCredits(msg(), kolboPricing()) : 0

    // Refresh balance whenever a new kolbo message arrives
    if (isKolbo) {
      props.api.client.global.kolboBalance().then((res) => {
        if (res.data) setKolboBalance(res.data.available)
      }).catch(() => {})
    }

    return {
      tokens,
      percent: model?.limit.context ? Math.round((tokens / model.limit.context) * 100) : null,
      isKolbo,
      isLocal,
      cost,
      creditsUsed,
    }
  })

  return (
    <box>
      <text fg={theme().text}>
        <b>{t("sidebar.context.title")}</b>
      </text>
      <Show when={state().tokens > 0}>
        <text fg={theme().textMuted}>{t("sidebar.context.tokensAndPct", { n: state().tokens.toLocaleString(), pct: state().percent ?? 0 })}</text>
        <Show when={state().isKolbo}>
          <Show when={kolboBalance() !== null} fallback={<text fg={theme().textMuted}>{t("sidebar.context.creditsLoading")}</text>}>
            <text fg={theme().textMuted}>{t("sidebar.context.creditsLeft", { n: kolboBalance()!.toLocaleString() })}</text>
          </Show>
          <Show when={state().creditsUsed > 0}>
            <text fg={theme().textMuted}>{t("sidebar.context.creditsUsed", { n: state().creditsUsed.toLocaleString() })}</text>
          </Show>
        </Show>
        <Show when={!state().isKolbo && !state().isLocal}>
          <text fg={theme().textMuted}>{t("sidebar.context.spent", { amount: money.format(state().cost) })}</text>
        </Show>
      </Show>
    </box>
  )
}

const tui: TuiPlugin = async (api) => {
  api.slots.register({
    order: 100,
    slots: {
      sidebar_content(_ctx, props) {
        return <View api={api} session_id={props.session_id} />
      },
    },
  })
}

const plugin: TuiPluginModule & { id: string } = {
  id,
  tui,
}

export default plugin
