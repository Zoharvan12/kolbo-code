declare global {
  const KODU_VERSION: string
  const KODU_CHANNEL: string
}

export const VERSION = typeof KODU_VERSION === "string" ? KODU_VERSION : "local"
export const CHANNEL = typeof KODU_CHANNEL === "string" ? KODU_CHANNEL : "local"
