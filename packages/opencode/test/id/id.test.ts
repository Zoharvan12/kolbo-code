import { describe, expect, it } from "bun:test"
import { Identifier } from "../../src/id/id"

describe("versioned identifiers", () => {
  it("keeps new ascending IDs after legacy IDs and preserves timestamps", () => {
    const timestamp = Date.now()
    const id = Identifier.create("message", false, timestamp)

    expect(id).toMatch(/^msg_g[0-9a-f]{14}/)
    expect(id > "msg_ffffffffffffzzzzzzzzzzzzzz").toBe(true)
    expect(Identifier.timestamp(id)).toBe(timestamp)
  })

  it("keeps new descending IDs before legacy IDs", () => {
    const id = Identifier.create("session", true, Date.now())

    expect(id).toMatch(/^ses_-[0-9a-f]{14}/)
    expect(id < "ses_00000000000000000000000000").toBe(true)
  })
})
