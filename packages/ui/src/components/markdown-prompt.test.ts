import { describe, expect, test } from "bun:test"
import { isPromptFence } from "./markdown-prompt"

const SCENE = `SCENE CONTEXT
A concert hall at night.

ACTIVE REFERENCES
@gal_suit (Gal, black suit, close-up) stands stage left while @yonatan (Yonatan) holds the mic.

ACTION
Camera dollies in as the chorus hits.`

describe("isPromptFence", () => {
  test("treats Seedance / Elements production text as a prompt", () => {
    expect(isPromptFence("text", SCENE)).toBe(true)
    expect(isPromptFence("", SCENE)).toBe(true)
    expect(isPromptFence("elements", "short")).toBe(true)
  })

  test("does not treat real code as a prompt", () => {
    expect(isPromptFence("ts", "const x = 1\nfunction foo() {\n  return x\n}")).toBe(false)
    expect(isPromptFence("text", "const x = 1\nexport function foo() {\n  return x\n}")).toBe(false)
  })
})
