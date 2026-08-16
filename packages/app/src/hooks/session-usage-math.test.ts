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
  test("discounts cached reads the way kolbo-api does, and counts reasoning as output", () => {
    // 500k fresh + 200k cache WRITE bill at full input = 700k; 300k cache READ
    // bills at 0.1x = 30k. So 730k in = 730 credits, and 1M out (600k output +
    // 400k reasoning) = 2000. Charging cache reads at full rate was the bug:
    // it read 1000 + 2000 here, and 62 instead of 36 on a real session.
    expect(
      calcAgentCredits([msg({ input: 500_000, read: 300_000, write: 200_000, output: 600_000, reasoning: 400_000 })], pricing),
    ).toBe(2730)
  })

  test("a cache-heavy turn costs a fraction of the same volume sent fresh", () => {
    const cached = calcAgentCredits([msg({ input: 0, read: 1_000_000 })], pricing)
    const fresh = calcAgentCredits([msg({ input: 1_000_000 })], pricing)
    expect(cached).toBe(100)
    expect(fresh).toBe(1000)
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
