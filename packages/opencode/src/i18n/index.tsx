/**
 * Kolbo CLI i18n engine
 * Mirrors the kolbo-map i18n system (i18next-based).
 * Language is set via ~/.kolbo/tui.json { "language": "he" }
 */

import i18next from "i18next"
import bidiFactory from "bidi-js"
const { getReorderedString, getEmbeddingLevels } = bidiFactory()
import { createSignal, createContext, useContext, type ParentComponent } from "solid-js"

// Static imports so Bun bundles all locale files into the binary.
// Dynamic template-literal imports (`./locales/${lang}.json`) are not statically
// analyzable and therefore NOT bundled — the language would silently fall back to
// English in the published binary even though it works fine in local dev.
import en from "./locales/en.json"
import he from "./locales/he.json"
import ar from "./locales/ar.json"
import ru from "./locales/ru.json"
import zh from "./locales/zh.json"
import es from "./locales/es.json"
import hi from "./locales/hi.json"
import ja from "./locales/ja.json"
import de from "./locales/de.json"
import ko from "./locales/ko.json"
import fr from "./locales/fr.json"
import pt from "./locales/pt.json"

export const RTL_LANGUAGES = ["he", "ar"]

export type SupportedLang = "en" | "he" | "ar" | "ru" | "zh" | "es" | "hi" | "ja" | "de" | "ko" | "fr" | "pt"

const LOCALES: Record<SupportedLang, Record<string, unknown>> = { en, he, ar, ru, zh, es, hi, ja, de, ko, fr, pt }

function loadLocale(lang: SupportedLang): Record<string, unknown> {
  return LOCALES[lang] ?? LOCALES["en"]
}

let initialized = false

// Module-level reactive language signal. Every call to t() or isRTL() reads this,
// so any SolidJS reactive scope (memo / effect / JSX expression) that calls them
// re-runs automatically when the user switches language at runtime. This is what
// makes live language switching work across the TUI without restarting.
const [currentLang, setCurrentLang] = createSignal<SupportedLang>("en")

export async function initI18n(lang: SupportedLang = "en") {
  if (initialized) {
    await i18next.changeLanguage(lang)
    setCurrentLang(lang)
    return
  }
  initialized = true
  const resources = loadLocale(lang)
  await i18next.init({
    lng: lang,
    fallbackLng: "en",
    resources: {
      [lang]: { translation: resources },
    },
    interpolation: { escapeValue: false },
  })
  setCurrentLang(lang)
}

/**
 * Translate a key with optional interpolation variables.
 * Subscribes to the module-level language signal, so calls inside a reactive
 * scope (memo / effect / JSX expression) re-run when the language changes.
 * Applies bidi visual reordering for RTL languages (skipped for strings
 * containing {highlight} markup — see toVisual).
 */
export function t(key: string, vars?: Record<string, string | number>): string {
  const lang = currentLang() // subscribe
  const result = i18next.t(key, vars as any) as string
  return RTL_LANGUAGES.includes(lang) ? toVisual(result) : result
}

/**
 * Reactive RTL check. Subscribes to the module-level language signal so callers
 * inside reactive scopes re-run on language change. The optional `lang` arg
 * bypasses the signal (useful when you already have a specific language code).
 */
export function isRTL(lang?: string): boolean {
  return RTL_LANGUAGES.includes(lang ?? currentLang())
}

// RTL Unicode block ranges
const RTL_REGEX = /[\u0590-\u05FF\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/

/**
 * Reorder a string to visual left-to-right order for cell-based terminal renderers.
 * Only applied when the string actually contains RTL characters.
 * Skips strings that contain {highlight} markup to avoid breaking the parser.
 */
/**
 * Apply toVisual line-by-line — safe for multi-line content like markdown.
 * Each line is reordered independently so markdown structure across lines is preserved.
 */
export function toVisualLines(text: string): string {
  if (!text || !RTL_REGEX.test(text)) return text
  return text
    .split("\n")
    .map((line) => toVisual(line))
    .join("\n")
}

// Native macOS terminals (Terminal.app, iTerm2) run their own bidi reordering pass
// when they encounter RTL characters. If we also pre-reorder with bidi-js the text
// ends up double-flipped. However, xterm.js-based terminals (VS Code, Cursor, etc.)
// do NOT do native bidi, even on macOS. We whitelist only known bidi-capable
// terminals via TERM_PROGRAM so xterm.js-based editors get proper reordering.
const BIDI_TERMINALS = new Set(["apple_terminal", "iterm.app"])
const TERMINAL_DOES_BIDI =
  process.platform === "darwin" &&
  BIDI_TERMINALS.has((process.env.TERM_PROGRAM ?? "").toLowerCase())

export function toVisual(text: string): string {
  if (!text || !RTL_REGEX.test(text)) return text
  // Skip strings with custom markup like {highlight}...{/highlight} — bidi reordering
  // would reposition the tags and break the markup parser in tips-view
  if (text.includes("{highlight}") || text.includes("{/highlight}")) return text
  if (TERMINAL_DOES_BIDI) return text
  try {
    const levels = getEmbeddingLevels(text, "rtl")
    return getReorderedString(text, levels)
  } catch {
    return text
  }
}

// ── SolidJS reactive context ─────────────────────────────────────────────────

type I18nContextValue = {
  t: typeof t
  lang: () => SupportedLang
  isRTL: () => boolean
  setLang: (lang: SupportedLang) => Promise<void>
  isLanguageConfigured: () => boolean
}

const I18nContext = createContext<I18nContextValue>()

export const I18nProvider: ParentComponent<{ lang?: SupportedLang; languageConfigured?: boolean }> = (props) => {
  // Seed the module-level signal from props on mount. Live language changes go
  // through setLang below, which also updates currentLang. The provider itself
  // no longer owns a separate signal — context `t` / `lang` / `isRTL` all read
  // the module signal, so components importing them directly (e.g. via
  // `import { t, isRTL } from "@/i18n"`) stay in sync with components using
  // `useI18n()`. This is what enables live language switching everywhere.
  if (props.lang) setCurrentLang(props.lang)
  const [langConfigured, setLangConfigured] = createSignal(props.languageConfigured ?? false)

  const setLang = async (next: SupportedLang) => {
    const resources = loadLocale(next)
    if (!i18next.hasResourceBundle(next, "translation")) {
      i18next.addResourceBundle(next, "translation", resources)
    }
    await i18next.changeLanguage(next)
    setCurrentLang(next)
    setLangConfigured(true)
    // Persist language choice to tui.json for next session
    try {
      const { TuiConfig } = await import("@/config/tui")
      await TuiConfig.update({ language: next })
    } catch {}
  }

  return (
    <I18nContext.Provider
      value={{
        t,
        lang: currentLang,
        isRTL: () => isRTL(),
        setLang,
        isLanguageConfigured: langConfigured,
      }}
    >
      {props.children}
    </I18nContext.Provider>
  )
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error("useI18n must be used inside I18nProvider")
  return ctx
}
