import { For, createMemo } from "solid-js"
import { useTheme } from "@tui/context/theme"
import { useI18n, toVisual, isRTL } from "@/i18n"
import { useKeybind } from "@tui/context/keybind"

type TipPart = { text: string; highlight: boolean }

function parse(tip: string): TipPart[] {
  const parts: TipPart[] = []
  const regex = /\{highlight\}(.*?)\{\/highlight\}/g
  const found = Array.from(tip.matchAll(regex))
  const state = found.reduce(
    (acc, match) => {
      const start = match.index ?? 0
      if (start > acc.index) {
        acc.parts.push({ text: tip.slice(acc.index, start), highlight: false })
      }
      acc.parts.push({ text: match[1], highlight: true })
      acc.index = start + match[0].length
      return acc
    },
    { parts, index: 0 },
  )

  if (state.index < tip.length) {
    parts.push({ text: tip.slice(state.index), highlight: false })
  }

  return parts
}

/**
 * Curated list of "simple, very practical" tip keys. We used to rotate
 * through all ~100 tips which was overwhelming and many were confusing;
 * now we pick from a short handpicked list that's actually useful for
 * new users plus the voice-input tip the user asked to always include.
 *
 * `tips.voice` is special: its translated text uses the {{key}} placeholder
 * so it reflects the user's actual voice keybind.
 */
const PRACTICAL_TIPS = [
  "tips.voice", // voice dictation — always eligible
  "tips.tip_0", // @filename to attach files
  "tips.tip_1", // ! to run shell commands
  "tips.tip_2", // Tab to cycle build/plan/auto-approve
  "tips.tip_6", // drag & drop images/PDFs
  "tips.tip_9", // /init to generate project rules
  "tips.tip_12", // Ctrl+X N new session
  "tips.tip_13", // /sessions to browse previous conversations
  "tips.tip_14", // /compact to summarize long sessions
]

// Picked once at module load so the same tip stays shown for the lifetime
// of this process — rotating on every render would be jarring.
const CHOSEN_TIP_KEY = PRACTICAL_TIPS[Math.floor(Math.random() * PRACTICAL_TIPS.length)]

/**
 * Empty-state tip line shown above the prompt on the home screen.
 *
 * RTL rendering notes:
 *   1. `t()` from useI18n already applies `toVisual` to RTL strings — do
 *      NOT call toVisual again on the result or you double-reverse.
 *   2. For tips containing {highlight} markup, `t()` deliberately SKIPS
 *      bidi (the tags would be reordered into the middle of words). For
 *      those we apply toVisual per-part AFTER parse() strips the tags.
 *   3. The whole row swaps order in RTL so the bullet ends up on the
 *      right visual edge, matching reading direction. We use two separate
 *      inline JSX blocks (one for RTL, one for LTR) rather than swapping
 *      element constants, because reusing the same element in different
 *      positions can confuse Solid's reconciliation.
 */
export function Tips() {
  const { t } = useI18n()
  const theme = useTheme().theme
  const keybind = useKeybind()

  const tipState = createMemo(() => {
    const voiceKey = keybind.print("input_voice") || "alt+v"
    // For non-voice tips we don't pass any interpolation; for the voice
    // tip we pass the current keybind.
    const raw =
      CHOSEN_TIP_KEY === "tips.voice" ? t(CHOSEN_TIP_KEY, { key: voiceKey }) : t(CHOSEN_TIP_KEY)
    const rtl = isRTL()
    const hadHighlights = raw.includes("{highlight}")
    let parts = parse(raw)
    if (rtl) {
      // Tips with {highlight} markup bypass bidi in t(), so apply it here
      // per-part after the tags are stripped.
      if (hadHighlights) {
        parts = parts.map((p) => ({ ...p, text: toVisual(p.text) }))
      }
      // In RTL, flex-row lays children left-to-right; reverse the parts
      // so the first logical segment ends up visually on the right.
      parts = parts.slice().reverse()
    }
    return { parts, rtl }
  })

  return (
    <box flexDirection="row" maxWidth="100%">
      {tipState().rtl ? (
        <>
          <text flexShrink={1}>
            <For each={tipState().parts}>
              {(part) => (
                <span style={{ fg: part.highlight ? theme.text : theme.textMuted }}>{part.text}</span>
              )}
            </For>
          </text>
          <text flexShrink={0} style={{ fg: theme.warning }}>
            {" "}
            {t("tips.label")} ●
          </text>
        </>
      ) : (
        <>
          <text flexShrink={0} style={{ fg: theme.warning }}>
            ● {t("tips.label")}{" "}
          </text>
          <text flexShrink={1}>
            <For each={tipState().parts}>
              {(part) => (
                <span style={{ fg: part.highlight ? theme.text : theme.textMuted }}>{part.text}</span>
              )}
            </For>
          </text>
        </>
      )}
    </box>
  )
}
