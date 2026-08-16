import { describe, expect, test } from "bun:test"
import { calcAgentCredits } from "./session-usage-math"

const pricing = { "kolbo-auto-smart": { input: 1000, output: 2000 } }

const msg = (tokens: Partial<{ input: number; output: number; reasoning: number; read: number; write: number }>) => ({
  role: "assistant",
  providerID: "kolbo",
  tokens: {
    input: tokens.input ?? 0,
    output: tokens.output ?? 0,
    reasoning: tokens.reasoning ?? 0,
    cache: { read: tokens.read ?? 0, write: tokens.write ?? 0 },
  },
})

describe("agent credit maths", () => {
  test("bills cached tokens as input and reasoning as output", () => {
    // 1M in (500k fresh + 300k cache read + 200k cache write) = 1000 credits,
    // 1M out (600k output + 400k reasoning) = 2000. Dropping either cache
    // field or reasoning silently under-bills a long session.
    expect(
      calcAgentCredits([msg({ input: 500_000, read: 300_000, write: 200_000, output: 600_000, reasoning: 400_000 })], pricing),
    ).toBe(3000)
  })

  test("a billed turn never rounds down to zero", () => {
    expect(calcAgentCredits([msg({ input: 1 })], pricing)).toBe(1)
  })

  test("ignores turns that cost nothing or came from another provider", () => {
    expect(calcAgentCredits([msg({})], pricing)).toBe(0)
    expect(calcAgentCredits([{ ...msg({ input: 1_000_000 }), providerID: "anthropic" }], pricing)).toBe(0)
    expect(calcAgentCredits([{ ...msg({ input: 1_000_000 }), role: "user" }], pricing)).toBe(0)
  })

  test("an unpriced model contributes nothing rather than NaN", () => {
    expect(calcAgentCredits([{ ...msg({ input: 1_000_000 }), modelID: "not-in-catalog" }], pricing)).toBe(0)
  })
})
