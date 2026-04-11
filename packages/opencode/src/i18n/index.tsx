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

export async function initI18n(lang: SupportedLang = "en") {
  if (initialized) {
    await i18next.changeLanguage(lang)
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
}

/** Translate a key with optional interpolation variables */
export function t(key: string, vars?: Record<string, string | number>): string {
  return i18next.t(key, vars as any) as string
}

export function isRTL(lang?: string): boolean {
  return RTL_LANGUAGES.includes(lang ?? i18next.language)
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

export function toVisual(text: string): string {
  if (!text || !RTL_REGEX.test(text)) return text
  // Skip strings with custom markup like {highlight}...{/highlight} — bidi reordering
  // would reposition the tags and break the markup parser in tips-view
  if (text.includes("{highlight}") || text.includes("{/highlight}")) return text
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
  const [lang, setLangSignal] = createSignal<SupportedLang>(props.lang ?? "en")
  const [langConfigured, setLangConfigured] = createSignal(props.languageConfigured ?? false)

  const setLang = async (next: SupportedLang) => {
    const resources = loadLocale(next)
    if (!i18next.hasResourceBundle(next, "translation")) {
      i18next.addResourceBundle(next, "translation", resources)
    }
    await i18next.changeLanguage(next)
    setLangSignal(next)
    setLangConfigured(true)
    // Persist language choice to tui.json for next session
    try {
      const { TuiConfig } = await import("@/config/tui")
      await TuiConfig.update({ language: next })
    } catch {}
  }

  // Reactive t(): reads lang() signal so SolidJS re-runs any memo/JSX that calls t() when language changes.
  // For RTL languages, applies Unicode BiDi visual reordering so cell-based terminal renderers show
  // Hebrew/Arabic text in correct right-to-left visual order.
  const reactiveT = (key: string, vars?: Record<string, string | number>): string => {
    const currentLang = lang() // subscribe to language signal
    const result = i18next.t(key, vars as any) as string
    if (RTL_LANGUAGES.includes(currentLang)) {
      return toVisual(result)
    }
    return result
  }

  return (
    <I18nContext.Provider
      value={{
        t: reactiveT,
        lang,
        isRTL: () => RTL_LANGUAGES.includes(lang()),
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
