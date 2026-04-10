import { For } from "solid-js"
import { DEFAULT_THEMES, useTheme } from "@tui/context/theme"
import { useI18n, toVisual, isRTL } from "@/i18n"

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

export function Tips() {
  const { t } = useI18n()
  const theme = useTheme().theme
  const themes = () => Object.keys(DEFAULT_THEMES)

  const TIPS = [
    t("tips.tip_0"),
    t("tips.tip_1"),
    t("tips.tip_2"),
    t("tips.tip_3"),
    t("tips.tip_4"),
    t("tips.tip_5"),
    t("tips.tip_6"),
    t("tips.tip_7"),
    t("tips.tip_8"),
    t("tips.tip_9"),
    t("tips.tip_10"),
    t("tips.tip_11"),
    t("tips.tip_12"),
    t("tips.tip_13"),
    t("tips.tip_14"),
    t("tips.tip_15"),
    t("tips.tip_16"),
    t("tips.tip_17"),
    t("tips.tip_18"),
    t("tips.tip_19"),
    t("tips.tip_20"),
    t("tips.tip_21"),
    t("tips.tip_22"),
    t("tips.tip_23"),
    t("tips.tip_24"),
    t("tips.tip_25"),
    t("tips.tip_26"),
    t("tips.tip_27"),
    t("tips.tip_28"),
    t("tips.tip_29"),
    t("tips.tip_30"),
    t("tips.tip_31"),
    t("tips.tip_32"),
    t("tips.tip_33"),
    t("tips.tip_34"),
    t("tips.tip_35"),
    t("tips.tip_36"),
    t("tips.tip_37"),
    t("tips.tip_38"),
    t("tips.tip_39"),
    t("tips.tip_40"),
    t("tips.tip_41"),
    t("tips.tip_42"),
    t("tips.tip_43"),
    t("tips.tip_44"),
    t("tips.tip_45"),
    t("tips.tip_46"),
    t("tips.tip_47"),
    t("tips.tip_48"),
    t("tips.tip_49"),
    t("tips.tip_50"),
    t("tips.tip_51"),
    t("tips.tip_52"),
    t("tips.tip_53"),
    t("tips.tip_54"),
    t("tips.tip_55"),
    t("tips.tip_56"),
    t("tips.tip_57"),
    t("tips.tip_58"),
    t("tips.tip_59"),
    t("tips.tip_60"),
    t("tips.tip_61"),
    t("tips.tip_62"),
    t("tips.tip_63"),
    t("tips.tip_64"),
    t("tips.tip_65"),
    t("tips.tip_66"),
    t("tips.tip_67"),
    t("tips.tip_68"),
    t("tips.tip_69"),
    t("tips.tip_70"),
    t("tips.tip_71"),
    t("tips.tip_72"),
    t("tips.tip_73"),
    t("tips.tip_74"),
    t("tips.tip_75"),
    t("tips.tip_76"),
    t("tips.tip_77"),
    t("tips.tip_78"),
    t("tips.tip_79"),
    t("tips.tip_80"),
    t("tips.tip_81"),
    t("tips.tip_82"),
    t("tips.tip_83"),
    t("tips.tip_84"),
    t("tips.tip_85"),
    t("tips.tip_86"),
    t("tips.tip_87"),
    t("tips.tip_88"),
    t("tips.tip_89"),
    t("tips.tip_90"),
    t("tips.tip_91"),
    t("tips.tip_92"),
    t("tips.tip_93"),
    t("tips.tip_94"),
    t("tips.tip_95"),
    t("tips.tip_96"),
    t("tips.tip_97"),
    t("tips.tip_98"),
    ...(process.platform === "win32"
      ? [t("tips.tip_99_win")]
      : [t("tips.tip_99_unix")]),
  ]

  const rawTip = TIPS[Math.floor(Math.random() * TIPS.length)]
  const rtl = isRTL()
  // Apply toVisual per-part to fix character display order in cell-based renderer.
  // Do NOT reverse part order — the translated strings from Gemini are already in
  // the correct reading sequence for the target language.
  const parts = parse(rawTip).map((p) => (rtl ? { ...p, text: toVisual(p.text) } : p))

  const label = (
    <text flexShrink={0} style={{ fg: theme.warning }}>
      ● {t("tips.label")}{" "}
    </text>
  )
  const content = (
    <text flexShrink={1}>
      <For each={parts}>
        {(part) => <span style={{ fg: part.highlight ? theme.text : theme.textMuted }}>{part.text}</span>}
      </For>
    </text>
  )

  return (
    <box flexDirection="row" maxWidth="100%">
      {rtl ? content : label}
      {rtl ? label : content}
    </box>
  )
}
