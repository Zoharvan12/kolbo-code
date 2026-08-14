import { describe, expect, it } from "bun:test"
import type { Message } from "@opencode-ai/sdk/v2/client"
import {
  findMessageIndex,
  insertMessageIndex,
  mergeMessages,
  messageAfter,
  messageBefore,
  messagesBefore,
  messagesFrom,
} from "./message-order"

const message = (id: string, created: number): Message =>
  ({
    id,
    sessionID: "ses_test",
    role: "user",
    agent: "build",
    model: { providerID: "kolbo", modelID: "test" },
    time: { created },
  }) as Message

describe("message chronology", () => {
  it("orders wrapped IDs by creation time", () => {
    const old = message("msg_fdbf1b93a001old", 100)
    const fresh = message("msg_00027a58e001new", 200)

    expect(insertMessageIndex([old], fresh)).toBe(1)
    expect(mergeMessages([old], [fresh]).map((item) => item.id)).toEqual([old.id, fresh.id])
  })

  it("finds an existing wrapped ID without relying on sort order", () => {
    const messages = [message("msg_fdbf1b93a001old", 100), message("msg_00027a58e001new", 200)]
    expect(findMessageIndex(messages, "msg_00027a58e001new")).toBe(1)
    expect(messagesBefore(messages, "msg_00027a58e001new").map((item) => item.id)).toEqual([messages[0].id])
    expect(messagesFrom(messages, "msg_00027a58e001new").map((item) => item.id)).toEqual([messages[1].id])
    expect(messageBefore(messages, "msg_00027a58e001new")?.id).toBe(messages[0].id)
    expect(messageAfter(messages, "msg_fdbf1b93a001old")?.id).toBe(messages[1].id)
  })
})
