import { Show, type Component } from "solid-js"
import { useLanguage } from "@/context/language"

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
  const pricing = () => formatPer1K(props.model.provider.id, props.model.cost, props.kolboPricing)

  return (
    <div class="flex flex-col gap-1 py-1">
      <div class="text-13-medium">{title()}</div>
      <Show when={inputs()}>
        {(value) => (
          <div class="text-12-regular text-text-invert-base">
            {language.t("model.tooltip.allows", { inputs: value() })}
          </div>
        )}
      </Show>
      <div class="text-12-regular text-text-invert-base">{reasoning()}</div>
      <div class="text-12-regular text-text-invert-base">{context()}</div>
      <Show when={pricing()}>
        {(value) => (
          <div class="flex items-center gap-1.5 text-12-regular text-text-invert-base">
            <svg
              viewBox="0 0 16 16"
              class="w-3.5 h-3.5 shrink-0 opacity-80"
              fill="currentColor"
              aria-hidden="true"
            >
              <circle cx="8" cy="8" r="6.5" fill="currentColor" opacity="0.18" />
              <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" stroke-width="1.2" />
              <text x="8" y="11" text-anchor="middle" font-size="8.5" font-weight="700" fill="currentColor">¢</text>
            </svg>
            <span>{language.t("model.tooltip.pricing", { value: value() })}</span>
          </div>
        )}
      </Show>
    </div>
  )
}
