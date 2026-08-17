import { describe, expect, test } from "bun:test"
import { matchMentionTrigger, mentionTokenPattern } from "./mention-trigger"

describe("matchMentionTrigger", () => {
  test("opens the @ menu and captures the query", () => {
    expect(matchMentionTrigger("@", true)).toEqual({ trigger: "@", query: "" })
    expect(matchMentionTrigger("look at @may", true)).toEqual({ trigger: "@", query: "may" })
    expect(matchMentionTrigger("@src/foo.ts", true)).toEqual({ trigger: "@", query: "src/foo.ts" })
  })

  test("opens the # menu only at a word boundary", () => {
    expect(matchMentionTrigger("#", true)).toEqual({ trigger: "#", query: "" })
    expect(matchMentionTrigger("use #noir", true)).toEqual({ trigger: "#", query: "noir" })
  })

  test("stays quiet for hex colours, C#, and markdown headings", () => {
    expect(matchMentionTrigger("color:#fff", true)).toBeUndefined()
    expect(matchMentionTrigger("written in C#", true)).toBeUndefined()
    expect(matchMentionTrigger("## Heading", true)).toBeUndefined()
  })

  test("never opens the # menu when the user has no moodboards", () => {
    expect(matchMentionTrigger("use #noir", false)).toBeUndefined()
  })

  test("@ wins when both are present, since it is nearer the cursor", () => {
    expect(matchMentionTrigger("#noir and @may", true)).toEqual({ trigger: "@", query: "may" })
  })

  test("closes once the mention is finished", () => {
    expect(matchMentionTrigger("@maya walks ", true)).toBeUndefined()
  })
})

describe("mentionTokenPattern", () => {
  test("consumes the # token for moodboards and the @ token otherwise", () => {
    expect("use #noi".match(mentionTokenPattern("moodboard"))?.[0]).toBe("#noi")
    expect("use @may".match(mentionTokenPattern("visual-dna"))?.[0]).toBe("@may")
    expect("use @src/a.ts".match(mentionTokenPattern("file"))?.[0]).toBe("@src/a.ts")
  })

  test("a moodboard pick does not swallow a preceding @ mention", () => {
    expect("@maya #noi".match(mentionTokenPattern("moodboard"))?.[0]).toBe("#noi")
  })
})
