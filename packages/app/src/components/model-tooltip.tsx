import { For, Show, type Component } from "solid-js"
import { useLanguage } from "@/context/language"
import { Icon, type IconName } from "@opencode-ai/ui/icon"

/**
 * Credit coin. Concentric rings rather than a "¢" glyph — a letterform inside a
 * 14px circle turns to mush and reads as a typo. Sized in `em` so it tracks
 * whatever text it sits beside.
 */
export const CreditCoin: Component<{ class?: string }> = (props) => (
  <svg
    viewBox="0 0 16 16"
    class={props.class ?? "w-[1.05em] h-[1.05em]"}
    fill="none"
    aria-hidden="true"
    style={{ "flex-shrink": 0 }}
  >
    <circle cx="8" cy="8" r="6.25" fill="currentColor" opacity="0.16" />
    <circle cx="8" cy="8" r="6.25" stroke="currentColor" stroke-width="1.3" />
    <circle cx="8" cy="8" r="2.6" stroke="currentColor" stroke-width="1.3" opacity="0.7" />
  </svg>
)

// `text` is deliberately absent: every model accepts it, so an identical icon on
// all 25 rows carries no information and just crowds the row.
const MODALITY_ICONS: Array<{ key: Exclude<InputKey, "text">; icon: IconName }> = [
  { key: "image", icon: "photo" },
  { key: "audio", icon: "music" },
  { key: "video", icon: "video" },
  { key: "pdf", icon: "open-file" },
]

type InputKey = "text" | "image" | "audio" | "video" | "pdf"
type InputMap = Record<InputKey, boolean>

type ModelInfo = {
  id: string
  name: string
  provider: {
    id: string
    name: string
  }
  capabilities?: {
    reasoning: boolean
    input: InputMap
  }
  modalities?: {
    input: Array<string>
  }
  reasoning?: boolean
  limit: {
    context: number
  }
  cost?: {
    input?: number
    output?: number
  }
}

/**
 * Format a per-million-tokens rate as a per-1K-tokens decimal, with precision
 * tuned to keep tiny rates legible (0.0040) and big rates compact (20.0).
 * Shared with the picker rows in dialog-select-model.tsx.
 */
export function formatCreditsPerThousand(creditsPerMillion: number): string {
  const v = creditsPerMillion / 1000
  if (v >= 10) return v.toFixed(1)
  if (v >= 1) return v.toFixed(2)
  if (v >= 0.01) return v.toFixed(3)
  return v.toFixed(4)
}

function formatPer1K(
  providerID: string,
  cost: { input?: number; output?: number } | undefined,
  kolboPricing: { input: number; output: number } | undefined,
) {
  if (providerID === "kolbo") {
    if (!kolboPricing) return undefined
    if (kolboPricing.input === 0 && kolboPricing.output === 0) return undefined
    return `${formatCreditsPerThousand(kolboPricing.input)} / ${formatCreditsPerThousand(kolboPricing.output)} cr per 1K`
  }
  if (!cost || cost.input == null || cost.output == null) return undefined
  if (cost.input === 0 && cost.output === 0) return undefined
  const fmt = (n: number) => {
    const v = n / 1000
    return v >= 1 ? `$${v.toFixed(2)}` : `$${v.toFixed(3)}`
  }
  return `${fmt(cost.input)} / ${fmt(cost.output)} per 1K`
}

export const ModelTooltip: Component<{
  model: ModelInfo
  latest?: boolean
  free?: boolean
  kolboPricing?: { input: number; output: number }
}> = (props) => {
  const language = useLanguage()
  const sourceName = (model: ModelInfo) => {
    const value = `${model.id} ${model.name}`.toLowerCase()

    if (/claude|anthropic/.test(value)) return language.t("model.provider.anthropic")
    if (/gpt|o[1-4]|codex|openai/.test(value)) return language.t("model.provider.openai")
    if (/gemini|palm|bard|google/.test(value)) return language.t("model.provider.google")
    if (/grok|xai/.test(value)) return language.t("model.provider.xai")
    if (/llama|meta/.test(value)) return language.t("model.provider.meta")

    return model.provider.name
  }
  const inputLabel = (value: string) => {
    if (value === "text") return language.t("model.input.text")
    if (value === "image") return language.t("model.input.image")
    if (value === "audio") return language.t("model.input.audio")
    if (value === "video") return language.t("model.input.video")
    if (value === "pdf") return language.t("model.input.pdf")
    return value
  }
  const title = () => {
    const tags: Array<string> = []
    if (props.latest) tags.push(language.t("model.tag.latest"))
    if (props.free) tags.push(language.t("model.tag.free"))
    const suffix = tags.length ? ` (${tags.join(", ")})` : ""
    return `${sourceName(props.model)} ${props.model.name}${suffix}`
  }
  const inputs = () => {
    if (props.model.capabilities) {
      const input = props.model.capabilities.input
      const order: Array<InputKey> = ["text", "image", "audio", "video", "pdf"]
      const entries = order.filter((key) => input[key]).map((key) => inputLabel(key))
      return entries.length ? entries.join(", ") : undefined
    }
    const raw = props.model.modalities?.input
    if (!raw) return
    const entries = raw.map((value) => inputLabel(value))
    return entries.length ? entries.join(", ") : undefined
  }
  const reasoning = () => {
    if (props.model.capabilities)
      return props.model.capabilities.reasoning
        ? language.t("model.tooltip.reasoning.allowed")
        : language.t("model.tooltip.reasoning.none")
    return props.model.reasoning
      ? language.t("model.tooltip.reasoning.allowed")
      : language.t("model.tooltip.reasoning.none")
  }
  const context = () => language.t("model.tooltip.context", { limit: props.model.limit.context.toLocaleString() })

  // Which non-text modalities this model actually accepts, resolved from either
  // the capabilities map or the raw modalities list depending on the source.
  const acceptsModality = (key: Exclude<InputKey, "text">) => {
    if (props.model.capabilities) return props.model.capabilities.input[key] === true
    return props.model.modalities?.input?.includes(key) === true
  }
  const modalityIcons = () =>
    MODALITY_ICONS.filter((m) => acceptsModality(m.key)).map((m) => ({
      icon: m.icon,
      label: language.t(`model.input.${m.key}`),
    }))
  const hasReasoning = () =>
    props.model.capabilities ? props.model.capabilities.reasoning === true : props.model.reasoning === true
  // "1M" / "200K" rather than "Context limit 1,000,000" — same fact, a third
  // of the width, and it sits inline with the capability icons.
  const contextShort = () => {
    const n = props.model.limit.context
    if (n >= 1_000_000) return `${Math.round(n / 100_000) / 10}M`
    if (n >= 1_000) return `${Math.round(n / 1_000)}K`
    return String(n)
  }
  const pricing = () => formatPer1K(props.model.provider.id, props.model.cost, props.kolboPricing)
  const typicalCredits = () => {
    const v = (props.model as { typicalMessageCredits?: number }).typicalMessageCredits
    if (typeof v !== "number" || v <= 0) return undefined
    // Round to whole credits past 100 — "352.7" implies a precision an estimate
    // does not have, and the extra glyph adds nothing at that magnitude.
    if (v >= 100) return Math.round(v).toString()
    return v >= 10 ? v.toFixed(1) : v.toFixed(2)
  }

  return (
    <div class="flex flex-col gap-1 py-1">
      <div class="text-13-medium">{title()}</div>

      {/* Capabilities as one dense row instead of three sentences. Modality
          icons replace "Allows: text, image, audio, video, pdf" — the same
          information in a glanceable form, with each icon titled for
          screen readers and hover. Context sits alongside because it is the
          other number people scan for; reasoning only appears when true,
          since "No reasoning" was a line of text spent saying nothing. */}
      <div class="flex items-center gap-2 text-12-regular text-text-invert-base">
        <Show when={modalityIcons().length > 0}>
          <span class="flex items-center gap-1">
            <For each={modalityIcons()}>
              {(mod) => (
                <span title={mod.label} aria-label={mod.label} class="opacity-80">
                  <Icon name={mod.icon} class="w-3.5 h-3.5" />
                </span>
              )}
            </For>
          </span>
        </Show>
        <span class="opacity-45">{contextShort()}</span>
        <Show when={hasReasoning()}>
          <span class="opacity-80">{language.t("model.tooltip.reasoning.allowed")}</span>
        </Show>
      </div>
      {/* Cost. The headline is the per-message estimate, because that is the
          unit people actually budget in — nobody converts a per-1K rate into
          "what will this task cost me" in their head. The raw rate stays as
          quiet secondary text for anyone who wants to check the arithmetic. */}
      <Show when={typicalCredits()} fallback={
        <Show when={pricing()}>
          {(value) => (
            <div class="text-12-regular text-text-invert-base/70">
              {language.t("model.tooltip.pricing", { value: value() })}
            </div>
          )}
        </Show>
      }>
        {(value) => (
          <div class="mt-1 pt-2 border-t border-text-invert-base/12">
            {/* The number is the point, so it gets size and weight; the coin
                carries the unit visually and the word "credits" stays small.
                tabular-nums keeps the digits from dancing between rows. */}
            <div class="flex items-baseline gap-1.5">
              <CreditCoin class="w-3.5 h-3.5 self-center text-text-invert-base/70" />
              <span class="text-14-medium text-text-invert-base tabular-nums leading-none">{value()}</span>
              <span class="text-11-regular text-text-invert-base/65 leading-none">
                {language.t("model.tooltip.typicalCost.unit")}
              </span>
            </div>
            <div class="mt-1 text-11-regular text-text-invert-base/55">
              {language.t("model.tooltip.typicalCost.hint")}
            </div>
          </div>
        )}
      </Show>
    </div>
  )
}
