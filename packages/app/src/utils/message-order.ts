import type { Message } from "@opencode-ai/sdk/v2/client"

export const compareMessages = (a: Message, b: Message) =>
  a.time.created - b.time.created || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

export const findMessageIndex = (messages: readonly Message[], id: string) =>
  messages.findIndex((message) => message.id === id)

export function insertMessageIndex(messages: readonly Message[], message: Message) {
  let left = 0
  let right = messages.length
  while (left < right) {
    const middle = Math.floor((left + right) / 2)
    if (compareMessages(messages[middle], message) < 0) left = middle + 1
    else right = middle
  }
  return left
}

export function mergeMessages(a: readonly Message[], b: readonly Message[]) {
  const map = new Map(a.map((message) => [message.id, message] as const))
  for (const message of b) map.set(message.id, message)
  return [...map.values()].sort(compareMessages)
}
