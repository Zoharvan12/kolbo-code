/**
 * Terminal capability detection.
 *
 * macOS Terminal.app can parse truecolor (24-bit) SGR escape sequences but
 * does NOT handle alpha-blended RGBA — all colors must be fully opaque.
 * We force COLORTERM=truecolor for it (so the renderer sends 24-bit
 * sequences) but pre-composite any alpha-blended colors to opaque.
 */

export function isTerminalApp(): boolean {
  return process.env.TERM_PROGRAM === "Apple_Terminal"
}

/**
 * Returns true if the terminal can handle RGBA alpha blending natively.
 * Terminal.app can display truecolor RGB but not alpha — colors with
 * fractional alpha must be pre-composited to opaque equivalents.
 */
export function supportsAlphaBlending(): boolean {
  if (isTerminalApp()) return false
  return true
}
