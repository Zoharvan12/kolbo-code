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

/** Credits the agent itself burned on tokens, per kolbo-api's published rates. */
export function calcAgentCredits(messages: ReadonlyArray<TokenMessage>, pricing: KolboPricing): number {
  let total = 0
  for (const msg of messages) {
    if (msg.role !== "assistant" || msg.providerID !== "kolbo" || !msg.tokens) continue
    const p = pricing[msg.modelID ?? "kolbo-auto-smart"]
    if (!p) continue
    const inT = msg.tokens.input + (msg.tokens.cache?.read ?? 0) + (msg.tokens.cache?.write ?? 0)
    const outT = msg.tokens.output + msg.tokens.reasoning
    if (inT <= 0 && outT <= 0) continue
    total += Math.max(1, Math.ceil((inT / 1_000_000) * p.input + (outT / 1_000_000) * p.output))
  }
  return total
}
