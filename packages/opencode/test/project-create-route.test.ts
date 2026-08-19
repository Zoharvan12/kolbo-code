import { describe, expect, test } from "bun:test"
import { validateNewProjectName } from "../src/server/routes/project"

describe("validateNewProjectName", () => {
  test("accepts plain names", () => {
    expect(validateNewProjectName("Summer Campaign")).toBeUndefined()
  })
  test("rejects empty / whitespace", () => {
    expect(validateNewProjectName("  ")).toBeDefined()
  })
  test("rejects path separators and traversal", () => {
    for (const bad of ["a/b", "a\\b", "..", "con?", 'x"y', "a:b"]) {
      expect(validateNewProjectName(bad)).toBeDefined()
    }
  })
})
