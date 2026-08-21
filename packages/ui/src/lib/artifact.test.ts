import { describe, expect, test } from "bun:test"
import { artifactLabel, isPlanPath, resetAgentOpen, takeAgentOpen } from "./artifact"

describe("artifact auto-open gate", () => {
  test("agent open is one-shot until reset", () => {
    resetAgentOpen()
    expect(takeAgentOpen()).toBe(true)
    expect(takeAgentOpen()).toBe(false)
    expect(takeAgentOpen()).toBe(false)
    resetAgentOpen()
    expect(takeAgentOpen()).toBe(true)
  })
})

describe("isPlanPath", () => {
  test("matches .kolbo/plans session plans", () => {
    expect(isPlanPath("G:/proj/.kolbo/plans/1710000000000-davinim.md")).toBe(true)
    expect(isPlanPath(".kolbo\\plans\\1710000000000-slug.md")).toBe(true)
  })

  test("matches global data plans with timestamp prefix", () => {
    expect(isPlanPath("C:/Users/x/AppData/kolbo/plans/1710000000000-chorus.md")).toBe(true)
  })

  test("rejects production notes and random markdown", () => {
    expect(isPlanPath(".kolbo/production.md")).toBe(false)
    expect(isPlanPath("docs/plans/overview.md")).toBe(false)
    expect(isPlanPath("readme.md")).toBe(false)
    expect(isPlanPath(null)).toBe(false)
  })
})

describe("artifactLabel", () => {
  test("prefers title, then basename, then lang", () => {
    expect(artifactLabel("markdown", { title: "Plan" })).toBe("Plan")
    expect(artifactLabel("markdown", { path: "G:/x/.kolbo/plans/171-foo.md" })).toBe("171-foo.md")
    expect(artifactLabel("html")).toBe("HTML")
  })
})
