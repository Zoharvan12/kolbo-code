import type { MessageV2 } from "./message-v2"

export const messageCreatedBefore = (left: MessageV2.Info, right: MessageV2.Info) =>
  left.time.created < right.time.created || (left.time.created === right.time.created && left.id < right.id)
