declare global {
  const KOLBO_VERSION: string
  const KOLBO_CHANNEL: string
}

export const VERSION = typeof KOLBO_VERSION === "string" ? KOLBO_VERSION : "local"
export const CHANNEL = typeof KOLBO_CHANNEL === "string" ? KOLBO_CHANNEL : "local"
