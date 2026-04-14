import * as i18n from "@solid-primitives/i18n"
import { Store } from "@tauri-apps/plugin-store"

import { dict as desktopEn } from "./en"
import { dict as desktopZh } from "./zh"
import { dict as desktopKo } from "./ko"
import { dict as desktopDe } from "./de"
import { dict as desktopEs } from "./es"
import { dict as desktopFr } from "./fr"
import { dict as desktopJa } from "./ja"
import { dict as desktopRu } from "./ru"
import { dict as desktopAr } from "./ar"
import { dict as desktopBr } from "./br"
import { dict as desktopHe } from "./he"
import { dict as desktopHi } from "./hi"

import { dict as appEn } from "../../../app/src/i18n/en"
import { dict as appZh } from "../../../app/src/i18n/zh"
import { dict as appKo } from "../../../app/src/i18n/ko"
import { dict as appDe } from "../../../app/src/i18n/de"
import { dict as appEs } from "../../../app/src/i18n/es"
import { dict as appFr } from "../../../app/src/i18n/fr"
import { dict as appJa } from "../../../app/src/i18n/ja"
import { dict as appRu } from "../../../app/src/i18n/ru"
import { dict as appAr } from "../../../app/src/i18n/ar"
import { dict as appBr } from "../../../app/src/i18n/br"
import { dict as appHe } from "../../../app/src/i18n/he"
import { dict as appHi } from "../../../app/src/i18n/hi"

export type Locale =
  | "en"
  | "zh"
  | "ko"
  | "de"
  | "es"
  | "fr"
  | "ja"
  | "ru"
  | "ar"
  | "br"
  | "he"
  | "hi"

type RawDictionary = typeof appEn & typeof desktopEn
type Dictionary = i18n.Flatten<RawDictionary>

const LOCALES: readonly Locale[] = [
  "en",
  "he",
  "ar",
  "ru",
  "zh",
  "ko",
  "de",
  "es",
  "fr",
  "ja",
  "br",
  "hi",
]

function detectLocale(): Locale {
  if (typeof navigator !== "object") return "en"

  const languages = navigator.languages?.length ? navigator.languages : [navigator.language]
  for (const language of languages) {
    if (!language) continue
    const l = language.toLowerCase()
    if (l.startsWith("en")) return "en"
    if (l.startsWith("zh")) return "zh"
    if (l.startsWith("ko")) return "ko"
    if (l.startsWith("de")) return "de"
    if (l.startsWith("es")) return "es"
    if (l.startsWith("fr")) return "fr"
    if (l.startsWith("ja")) return "ja"
    if (l.startsWith("ru")) return "ru"
    if (l.startsWith("ar")) return "ar"
    if (l.startsWith("pt")) return "br"
    if (l.startsWith("he")) return "he"
    if (l.startsWith("hi")) return "hi"
  }

  return "en"
}

function parseLocale(value: unknown): Locale | null {
  if (!value) return null
  if (typeof value !== "string") return null
  if ((LOCALES as readonly string[]).includes(value)) return value as Locale
  return null
}

function parseRecord(value: unknown) {
  if (!value || typeof value !== "object") return null
  if (Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function parseStored(value: unknown) {
  if (typeof value !== "string") return value
  try {
    return JSON.parse(value) as unknown
  } catch {
    return value
  }
}

function pickLocale(value: unknown): Locale | null {
  const direct = parseLocale(value)
  if (direct) return direct

  const record = parseRecord(value)
  if (!record) return null

  return parseLocale(record.locale)
}

const base = i18n.flatten({ ...appEn, ...desktopEn })

function build(locale: Locale): Dictionary {
  if (locale === "en") return base
  if (locale === "zh") return { ...base, ...i18n.flatten(appZh), ...i18n.flatten(desktopZh) }
  if (locale === "ko") return { ...base, ...i18n.flatten(appKo), ...i18n.flatten(desktopKo) }
  if (locale === "de") return { ...base, ...i18n.flatten(appDe), ...i18n.flatten(desktopDe) }
  if (locale === "es") return { ...base, ...i18n.flatten(appEs), ...i18n.flatten(desktopEs) }
  if (locale === "fr") return { ...base, ...i18n.flatten(appFr), ...i18n.flatten(desktopFr) }
  if (locale === "ja") return { ...base, ...i18n.flatten(appJa), ...i18n.flatten(desktopJa) }
  if (locale === "ru") return { ...base, ...i18n.flatten(appRu), ...i18n.flatten(desktopRu) }
  if (locale === "ar") return { ...base, ...i18n.flatten(appAr), ...i18n.flatten(desktopAr) }
  if (locale === "br") return { ...base, ...i18n.flatten(appBr), ...i18n.flatten(desktopBr) }
  if (locale === "he") return { ...base, ...i18n.flatten(appHe), ...i18n.flatten(desktopHe) }
  if (locale === "hi") return { ...base, ...i18n.flatten(appHi), ...i18n.flatten(desktopHi) }
  return base
}

const state = {
  locale: detectLocale(),
  dict: base as Dictionary,
  init: undefined as Promise<Locale> | undefined,
}

state.dict = build(state.locale)

const translate = i18n.translator(() => state.dict, i18n.resolveTemplate)

export function t(key: keyof Dictionary, params?: Record<string, string | number>) {
  return translate(key, params)
}

export function initI18n(): Promise<Locale> {
  const cached = state.init
  if (cached) return cached

  const promise = (async () => {
    const store = await Store.load("kodu.global.dat").catch(() => null)
    if (!store) return state.locale

    const raw = await store.get("language").catch(() => null)
    const value = parseStored(raw)
    const next = pickLocale(value) ?? state.locale

    state.locale = next
    state.dict = build(next)
    return next
  })().catch(() => state.locale)

  state.init = promise
  return promise
}
