/**
 * Pure credit maths, kept free of Solid context imports so it stays unit
 * testable — importing the hook pulls in client-only modules that blow up
 * outside a browser.
 */

export type KolboPricing = Record<string, { input: number; output: number }>

export type TokenMessage = {
  role: string
  modelID?: string
  providerID?: string
  tokens?: { input: number; output: number; reasoning: number; cache: { read: number; write: number } }
}

export type MediaSpend = {
  total: number
  byType: Array<{ type: string; amount: number; count: number }>
}

/**
 * Cached prompt reads cost the provider ~10% of fresh input, and kolbo-api
 * bills them at that fraction (CACHE_READ_COST_FACTOR in constants/pricing.js).
 * Counting them at the full rate — as every client-side tally did — overstates
 * a long coding session badly: a real 8-turn session that re-sent ~508k cached
 * tokens reported 62 credits against an actual charge of 36. Keep this in step
 * with the server constant.
 */
const CACHE_READ_COST_FACTOR = 0.1

/** Credits the agent itself burned on tokens, mirroring kolbo-api's charge. */
export function calcAgentCredits(messages: ReadonlyArray<TokenMessage>, pricing: KolboPricing): number {
  let total = 0
  for (const msg of messages) {
    if (msg.role !== "assistant" || msg.providerID !== "kolbo" || !msg.tokens) continue
    const p = pricing[msg.modelID ?? "kolbo-auto-smart"]
    if (!p) continue
    // Cache WRITES are billed as fresh input; only reads get the discount.
    const fresh = msg.tokens.input + (msg.tokens.cache?.write ?? 0)
    const cached = msg.tokens.cache?.read ?? 0
    const inT = fresh + cached * CACHE_READ_COST_FACTOR
    const outT = msg.tokens.output + msg.tokens.reasoning
    if (inT <= 0 && outT <= 0) continue
    total += Math.max(1, Math.ceil((inT / 1_000_000) * p.input + (outT / 1_000_000) * p.output))
  }
  return total
}
