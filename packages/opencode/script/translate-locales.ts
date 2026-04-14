#!/usr/bin/env bun
/**
 * translate-locales.ts
 *
 * Uses Gemini API to fill missing translation keys across all locale files.
 * Reads source from packages/app/src/i18n/en.ts and packages/ui/src/i18n/en.ts,
 * then patches any locale file that is missing keys.
 *
 * Usage:
 *   GOOGLE_API_KEY=... bun run packages/opencode/script/translate-locales.ts
 *   GOOGLE_API_KEY=... bun run packages/opencode/script/translate-locales.ts --locale he
 *   GOOGLE_API_KEY=... bun run packages/opencode/script/translate-locales.ts --pkg ui --locale ar
 */

import { join, dirname } from "path"
import { fileURLToPath } from "url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(__dirname, "../../..")

const OPENAI_API_KEY = process.env.OPENAI_API_KEY

const OPENAI_MODEL = "gpt-4o-mini"

async function callOpenAI(prompt: string): Promise<string> {
  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 4096,
      temperature: 0.1,
    }),
  })
  const json = (await resp.json()) as any
  if (!resp.ok) throw new Error(json.error?.message ?? `OpenAI ${resp.status}`)
  return json.choices[0].message.content.trim()
}

// ─── locale metadata ──────────────────────────────────────────────────────────

const LOCALE_META: Record<string, { name: string; rtl?: boolean }> = {
  ar: { name: "Arabic", rtl: true },
  he: { name: "Hebrew", rtl: true },
  ru: { name: "Russian" },
  zh: { name: "Simplified Chinese" },
  zht: { name: "Traditional Chinese" },
  ko: { name: "Korean" },
  de: { name: "German" },
  es: { name: "Spanish" },
  fr: { name: "French" },
  da: { name: "Danish" },
  ja: { name: "Japanese" },
  pl: { name: "Polish" },
  bs: { name: "Bosnian" },
  no: { name: "Norwegian" },
  br: { name: "Brazilian Portuguese" },
  th: { name: "Thai" },
  tr: { name: "Turkish" },
  hi: { name: "Hindi" },
}

// ─── arg parsing ──────────────────────────────────────────────────────────────

const args = process.argv.slice(2)
const localeIdx = args.indexOf("--locale")
const localeArg = localeIdx >= 0 ? args[localeIdx + 1] : undefined
const pkgIdx = args.indexOf("--pkg")
const pkgArg = pkgIdx >= 0 ? args[pkgIdx + 1] : undefined
// When true, also retranslate keys whose current value is identical to English (likely a fallback)
const retranslateEnglishFallbacks = args.includes("--fix-fallbacks")

// ─── file helpers ─────────────────────────────────────────────────────────────

function parseDict(content: string): Record<string, string> {
  const dict: Record<string, string> = {}
  // Match "key": "value"  (handles escaped quotes inside values)
  const re = /"([^"]+)":\s*"((?:[^"\\]|\\.)*)"/g
  let m: RegExpExecArray | null
  while ((m = re.exec(content)) !== null) {
    dict[m[1]] = m[2].replace(/\\"/g, '"').replace(/\\\\/g, "\\")
  }
  return dict
}

function serializeDict(dict: Record<string, string>): string {
  const lines = Object.entries(dict).map(([k, v]) => {
    const escaped = v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')
    return `  "${k}": "${escaped}"`
  })
  return `export const dict = {\n${lines.join(",\n")},\n}\n`
}

async function readDict(path: string): Promise<Record<string, string>> {
  try {
    const content = await Bun.file(path).text()
    return parseDict(content)
  } catch {
    return {}
  }
}

// ─── translation via Gemini ───────────────────────────────────────────────────

const BRAND_NAMES = [
  "Kolbo",
  "Kolbo Code",
  "Kolbo.AI",
  "Claude",
  "GPT",
  "Gemini",
  "GitHub Copilot",
  "VS Code",
  "Cursor",
  "Zed",
  "Ghostty",
  "Warp",
  "kodu.json",
  "MCP",
  "LSP",
  "API",
]

async function translateBatch(
  keys: string[],
  values: string[],
  targetLocale: string,
): Promise<string[]> {
  const meta = LOCALE_META[targetLocale]
  if (!meta) throw new Error(`Unknown locale: ${targetLocale}`)

  const rtlNote = meta.rtl
    ? "\nThis is an RTL language. Write text naturally right-to-left."
    : ""

  const prompt = `You are a professional software UI translator. Translate the following English UI strings to ${meta.name}.${rtlNote}

Rules:
- ONLY translate the values, keep keys unchanged
- Preserve {{variable}} placeholders exactly as-is
- Keep brand names untranslated: ${BRAND_NAMES.join(", ")}
- Keep keyboard key names in English: ESC, Ctrl, Alt, Shift, Enter, Tab, Delete
- Keep file extensions (.mp4, .jpg, .ts, etc.) untranslated
- Use professional, friendly tone matching software UI
- Respond ONLY with a JSON object: {"key": "translated value", ...}
- Do not include any explanation or markdown code fences

Input JSON:
${JSON.stringify(Object.fromEntries(keys.map((k, i) => [k, values[i]])), null, 2)}
`

  const text = await callOpenAI(prompt)

  // strip markdown fences if present
  const cleaned = text.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim()

  let parsed: Record<string, string>
  try {
    parsed = JSON.parse(cleaned)
  } catch (e) {
    console.error("Failed to parse Gemini response:", cleaned.slice(0, 500))
    throw e
  }

  return keys.map((k) => parsed[k] ?? values[keys.indexOf(k)])
}

// ─── main ─────────────────────────────────────────────────────────────────────

interface PackageConfig {
  pkg: string
  i18nDir: string
}

const PACKAGES: PackageConfig[] = [
  { pkg: "app", i18nDir: join(REPO_ROOT, "packages/app/src/i18n") },
  { pkg: "ui", i18nDir: join(REPO_ROOT, "packages/ui/src/i18n") },
]

const BATCH_SIZE = 60 // keys per Gemini call
const DELAY_MS = 500 // ms between calls

async function processPackage(cfg: PackageConfig, locales: string[]) {
  const enPath = join(cfg.i18nDir, "en.ts")
  const enContent = await Bun.file(enPath).text()
  const enDict = parseDict(enContent)
  const enKeys = Object.keys(enDict)

  console.log(`\n[${cfg.pkg}] ${enKeys.length} English keys`)

  for (const locale of locales) {
    const localePath = join(cfg.i18nDir, `${locale}.ts`)
    const localeDict = await readDict(localePath)

    let missingKeys = enKeys.filter((k) => !(k in localeDict))

    // Also include keys whose value is identical to English (English fallbacks from a failed run)
    if (retranslateEnglishFallbacks) {
      const fallbackKeys = enKeys.filter(
        (k) => k in localeDict && localeDict[k] === enDict[k],
      )
      missingKeys = [...new Set([...missingKeys, ...fallbackKeys])]
    }

    if (missingKeys.length === 0) {
      console.log(`  [${locale}] ✓ complete (no missing keys)`)
      continue
    }

    console.log(`  [${locale}] ${missingKeys.length} keys to translate...`)

    const translatedValues: string[] = []

    for (let i = 0; i < missingKeys.length; i += BATCH_SIZE) {
      const batchKeys = missingKeys.slice(i, i + BATCH_SIZE)
      const batchValues = batchKeys.map((k) => enDict[k])
      process.stdout.write(`    batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(missingKeys.length / BATCH_SIZE)}...`)

      try {
        const translated = await translateBatch(batchKeys, batchValues, locale)
        translatedValues.push(...translated)
        process.stdout.write(" ✓\n")
      } catch (e) {
        process.stdout.write(" ✗ (keeping English fallback)\n")
        translatedValues.push(...batchValues)
      }

      if (i + BATCH_SIZE < missingKeys.length) {
        await Bun.sleep(DELAY_MS)
      }
    }

    // Merge: keep existing translations, overwrite with new ones where applicable
    const translated = new Map(missingKeys.map((k, i) => [k, translatedValues[i]]))
    const merged: Record<string, string> = {}
    for (const key of enKeys) {
      if (translated.has(key)) {
        merged[key] = translated.get(key)!
      } else {
        merged[key] = localeDict[key] ?? enDict[key]
      }
    }

    await Bun.write(localePath, serializeDict(merged))
    console.log(`  [${locale}] ✓ written (${Object.keys(merged).length} keys)`)
  }
}

async function main() {
  const targetLocales = localeArg
    ? [localeArg]
    : Object.keys(LOCALE_META)

  const targetPackages = pkgArg
    ? PACKAGES.filter((p) => p.pkg === pkgArg)
    : PACKAGES

  console.log(`Translating locales: ${targetLocales.join(", ")}`)
  console.log(`Packages: ${targetPackages.map((p) => p.pkg).join(", ")}`)

  for (const cfg of targetPackages) {
    await processPackage(cfg, targetLocales)
  }

  console.log("\n✓ Done")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
