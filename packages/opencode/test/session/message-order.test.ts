import { describe, expect, it } from "bun:test"
import type { MessageV2 } from "../../src/session/message-v2"
import { messageCreatedBefore } from "../../src/session/message-order"

const message = (id: string, created: number) =>
  ({ id, sessionID: "ses_test", role: "user", agent: "build", model: {}, time: { created } }) as MessageV2.Info

describe("message chronology", () => {
  it("uses creation time when the legacy ID clock wraps", () => {
    const old = message("msg_fdbf1b93a001old", 100)
    const fresh = message("msg_00027a58e001new", 200)

    expect(fresh.id < old.id).toBe(true)
    expect(messageCreatedBefore(old, fresh)).toBe(true)
    expect(messageCreatedBefore(fresh, old)).toBe(false)
  })
})
