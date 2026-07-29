/**
 * Client-side credit consumption estimator for Kolbo-provider messages.
 *
 * The authoritative charge happens server-side in kolbo-api — this util mirrors
 * that formula so the TUI can show per-session consumption as tokens stream in,
 * without round-tripping to the backend for every update.
 *
 * Formula (per assistant message / request):
 *   credits = ceil( (inputTokens  / 1M) * pricing.input
 *                 + (outputTokens / 1M) * pricing.output )
 *   minimum 1 credit per request
 *
 * Token field mapping — opencode normalizes provider usage so these are DISJOINT
 * (see session/index.ts where cache/reasoning are subtracted out of input/output):
 *   inputTokens  = tokens.input + tokens.cache.read + tokens.cache.write
 *   outputTokens = tokens.output + tokens.reasoning
 *
 * Cache tokens are billed at full input rate (prompt caching reduces backend
 * cost but not user-facing credits). Reasoning tokens are billed as output,
 * matching how MiniMax reports them inside completion_tokens.
 */

export type TokenCounts = {
  input: number
  output: number
  reasoning: number
  cache: { read: number; write: number }
}

export type ModelPricing = {
  /** Credits charged per 1,000,000 input tokens. */
  input: number
  /** Credits charged per 1,000,000 output tokens. */
  output: number
}

export function creditsForMessage(tokens: TokenCounts, pricing: ModelPricing): number {
  const inTokens = tokens.input + (tokens.cache?.read ?? 0) + (tokens.cache?.write ?? 0)
  const outTokens = tokens.output + tokens.reasoning
  if (inTokens <= 0 && outTokens <= 0) return 0
  const raw = (inTokens / 1_000_000) * pricing.input + (outTokens / 1_000_000) * pricing.output
  return Math.max(1, Math.ceil(raw))
}

/**
 * Sum per-session credits across all assistant messages for the Kolbo
 * provider, using the pricing entry matching each message's `modelID`.
 * Slightly under-counts vision turns (~1-2 credits) but accurate for the
 * ~90% text-only case.
 *
 * Two known drifts against the server's authoritative number, both display-only:
 *  - cached reads are billed at 10% server-side (CACHE_READ_COST_FACTOR) but
 *    counted at full input rate here, so this over-reports long sessions;
 *  - an auto slot advertises its build-mode rate, so plan turns (which the
 *    backend may serve free to subscribers) still show a cost here.
 *
 * Shared by subagent-footer, prompt/index.tsx, and sidebar/context.tsx
 * so the credit display is computed identically everywhere.
 */
export function sessionCredits(
  messages: ReadonlyArray<{
    readonly role: string
    readonly modelID?: string
    readonly providerID?: string
    readonly tokens?: TokenCounts
    readonly cost?: number
  }>,
  pricing: Record<string, ModelPricing>,
): number {
  let total = 0
  for (const msg of messages) {
    if (msg.role !== "assistant") continue
    if (msg.providerID !== "kolbo") continue
    const p = pricing[msg.modelID ?? "kolbo-auto-smart"]
    if (!p || !msg.tokens) continue
    total += creditsForMessage(msg.tokens, p)
  }
  return total
}
