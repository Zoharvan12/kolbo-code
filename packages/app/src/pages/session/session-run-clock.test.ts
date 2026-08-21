import { describe, expect, test } from "bun:test"
import { resetRunClocks, runElapsed, runStart } from "./session-run-clock"

describe("session run clock", () => {
  test("keeps the earliest mark when a later message or tool starts", () => {
    resetRunClocks()
    expect(runElapsed("s1", true, 1000, 3000)).toBe(2000)
    expect(runElapsed("s1", true, 2500, 4000)).toBe(3000)
    expect(runStart("s1", true, 9000, 4000)).toBe(1000)
  })

  test("survives a short idle flicker then resumes", () => {
    resetRunClocks()
    runElapsed("s1", true, 1000, 3000)
    expect(runElapsed("s1", false, undefined, 4000)).toBe(3000)
    expect(runElapsed("s1", true, 3900, 4500)).toBe(3500)
  })

  test("starts a new clock after a real idle gap", () => {
    resetRunClocks()
    runElapsed("s1", true, 1000, 3000)
    expect(runElapsed("s1", false, undefined, 6000)).toBe(0)
    expect(runElapsed("s1", true, 6000, 6500)).toBe(500)
  })

  test("per-tool clocks do not inherit the session working clock", () => {
    resetRunClocks()
    runElapsed("ses_long", true, 1000, 100_000)
    expect(runStart("tool_a", true, 95_000, 100_000)).toBe(95_000)
    expect(runElapsed("tool_a", true, 95_000, 100_000)).toBe(5_000)
  })
})
