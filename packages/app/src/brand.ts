/**
 * Whitelabel brand name — set via VITE_WHITELABEL_NAME at build time.
 * Falls back to "Kolbo Code" for standard builds.
 */
export const BRAND_NAME: string = import.meta.env.VITE_WHITELABEL_NAME || "Kolbo Code"
