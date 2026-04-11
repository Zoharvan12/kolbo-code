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
 * Roll up per-session Kolbo credit consumption with correct text-vs-vision
 * pricing.
 *
 * The CLI always sends `modelID: "kolbo-default"` in its requests — but the
 * kolbo-api controller auto-routes any request containing image/audio/video/
 * pdf parts to `kolbo-vision` (Gemini) which bills at a higher rate. The
 * CLI never sees this routing decision on the way back, so to keep the
 * footer credit display aligned with the authoritative server-side charge
 * we mirror the backend's `hasMultimodalContent()` detection locally.
 *
 * Rule: once any user message in the conversation contains a file part with
 * a media mime, every subsequent assistant response is priced at
 * `kolbo-vision` — because the full history (including that file) rides
 * along on every subsequent request, so the backend keeps routing to Gemini.
 *
 * If `kolbo-vision` pricing isn't in the map (e.g. hasn't been fetched yet,
 * or the server hasn't deployed the second model), falls back to
 * `kolbo-default` pricing. Better to under-count than crash the footer.
 */
export function sessionKolboCredits(args: {
  messages: ReadonlyArray<{
    readonly id: string
    readonly role: string
    readonly providerID?: string
    readonly modelID?: string
    readonly tokens?: TokenCounts
  }>
  partsByMessageID: (
    messageID: string,
  ) => ReadonlyArray<{ readonly type?: string; readonly mime?: string }> | undefined
  pricing: Record<string, ModelPricing>
}): number {
  let multimodalSeen = false
  let total = 0
  for (const msg of args.messages) {
    if (msg.role === "user") {
      if (!multimodalSeen) {
        const parts = args.partsByMessageID(msg.id) ?? []
        for (const p of parts) {
          if (p.type === "file" && typeof p.mime === "string" && isMultimodalMime(p.mime)) {
            multimodalSeen = true
            break
          }
        }
      }
      continue
    }
    if (msg.role !== "assistant") continue
    if (msg.providerID !== "kolbo") continue
    if (!msg.tokens) continue
    const key = multimodalSeen ? "kolbo-vision" : (msg.modelID ?? "kolbo-default")
    const pricing = args.pricing[key] ?? args.pricing[msg.modelID ?? "kolbo-default"]
    if (!pricing) continue
    total += creditsForMessage(msg.tokens, pricing)
  }
  return total
}

function isMultimodalMime(mime: string): boolean {
  return (
    mime.startsWith("image/") ||
    mime.startsWith("audio/") ||
    mime.startsWith("video/") ||
    mime === "application/pdf"
  )
}
