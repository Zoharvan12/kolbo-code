#!/usr/bin/env bun
/**
 * translate-locales.ts
 *
 * Uses Gemini Flash (gemini-2.0-flash-lite) to fill missing translation keys
 * across all locale files in packages/app/src/i18n and packages/ui/src/i18n.
 *
 * API key is read from G:/Projects/Kolbo.AI/github/kolbo-api/.env.development
 * (GOOGLE_API_KEY), falling back to the GOOGLE_API_KEY env var.
 *
 * Usage:
 *   bun run packages/opencode/script/translate-locales.ts
 *   bun run packages/opencode/script/translate-locales.ts --locale he
 *   bun run packages/opencode/script/translate-locales.ts --pkg ui --locale ar
 *   bun run packages/opencode/script/translate-locales.ts --fix-fallbacks
 */

import { GoogleGenerativeAI } from "@google/generative-ai"
import { join, dirname } from "path"
import { fileURLToPath } from "url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(__dirname, "../../..")
const KOLBO_API_ENV = "G:/Projects/Kolbo.AI/github/kolbo-api/.env.development"

// ─── load GOOGLE_API_KEY from kolbo-api .env.development ─────────────────────

async function loadApiKey(): Promise<string> {
  // Prefer explicit env var
  if (process.env.GOOGLE_API_KEY) return process.env.GOOGLE_API_KEY

  try {
    const content = await Bun.file(KOLBO_API_ENV).text()
    for (const line of content.split("\n")) {
      const m = line.match(/^\s*GOOGLE_API_KEY\s*=\s*["']?([^"'\s]+)["']?/)
      if (m) return m[1]
    }
  } catch {
    // file not found — fall through to error
  }

  throw new Error(
    `GOOGLE_API_KEY not found. Set the env var or add it to ${KOLBO_API_ENV}`,
  )
}

// ─── locale metadata ──────────────────────────────────────────────────────────

const LOCALE_META: Record<string, { name: string; rtl?: boolean }> = {
  ar: { name: "Arabic", rtl: true },
  he: { name: "Hebrew", rtl: true },
  ru: { name: "Russian" },
  zh: { name: "Simplified Chinese" },
  ko: { name: "Korean" },
  de: { name: "German" },
  es: { name: "Spanish" },
  fr: { name: "French" },
  ja: { name: "Japanese" },
  br: { name: "Brazilian Portuguese" },
  hi: { name: "Hindi" },
}

// ─── arg parsing ──────────────────────────────────────────────────────────────

const args = process.argv.slice(2)
const localeIdx = args.indexOf("--locale")
const localeArg = localeIdx >= 0 ? args[localeIdx + 1] : undefined
const pkgIdx = args.indexOf("--pkg")
const pkgArg = pkgIdx >= 0 ? args[pkgIdx + 1] : undefined
// Retranslate keys whose value is identical to English (fallbacks from a failed run)
const retranslateEnglishFallbacks = args.includes("--fix-fallbacks")

// ─── file helpers ─────────────────────────────────────────────────────────────

function parseDict(content: string): Record<string, string> {
  const dict: Record<string, string> = {}
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

// ─── translation via Gemini Flash ────────────────────────────────────────────

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
  model: ReturnType<InstanceType<typeof GoogleGenerativeAI>["getGenerativeModel"]>,
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
- Respond ONLY with a valid JSON object: {"key": "translated value", ...}
- Do not include any explanation or markdown code fences

Input JSON:
${JSON.stringify(Object.fromEntries(keys.map((k, i) => [k, values[i]])), null, 2)}
`

  const result = await model.generateContent(prompt)
  const text = result.response.text().trim()

  // strip markdown fences if present
  const cleaned = text.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim()

  let parsed: Record<string, string>
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    console.error("  Failed to parse Gemini response:", cleaned.slice(0, 300))
    throw new Error("JSON parse failed")
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

const BATCH_SIZE = 60  // keys per Gemini call
const DELAY_MS = 400   // ms between calls to stay within rate limits

async function processPackage(
  cfg: PackageConfig,
  locales: string[],
  model: ReturnType<InstanceType<typeof GoogleGenerativeAI>["getGenerativeModel"]>,
) {
  const enPath = join(cfg.i18nDir, "en.ts")
  const enContent = await Bun.file(enPath).text()
  const enDict = parseDict(enContent)
  const enKeys = Object.keys(enDict)

  console.log(`\n[${cfg.pkg}] ${enKeys.length} English keys`)

  for (const locale of locales) {
    const localePath = join(cfg.i18nDir, `${locale}.ts`)
    const localeDict = await readDict(localePath)

    let missingKeys = enKeys.filter((k) => !(k in localeDict))

    if (retranslateEnglishFallbacks) {
      const fallbackKeys = enKeys.filter(
        (k) => k in localeDict && localeDict[k] === enDict[k],
      )
      missingKeys = [...new Set([...missingKeys, ...fallbackKeys])]
    }

    if (missingKeys.length === 0) {
      console.log(`  [${locale}] ✓ complete`)
      continue
    }

    console.log(`  [${locale}] ${missingKeys.length} keys to translate...`)

    const translatedValues: string[] = []

    for (let i = 0; i < missingKeys.length; i += BATCH_SIZE) {
      const batchKeys = missingKeys.slice(i, i + BATCH_SIZE)
      const batchValues = batchKeys.map((k) => enDict[k])
      process.stdout.write(
        `    batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(missingKeys.length / BATCH_SIZE)}...`,
      )

      try {
        const translated = await translateBatch(model, batchKeys, batchValues, locale)
        translatedValues.push(...translated)
        process.stdout.write(" ✓\n")
      } catch {
        process.stdout.write(" ✗ (keeping English fallback)\n")
        translatedValues.push(...batchValues)
      }

      if (i + BATCH_SIZE < missingKeys.length) {
        await Bun.sleep(DELAY_MS)
      }
    }

    // Merge: overwrite retranslated keys, keep everything else
    const translated = new Map(missingKeys.map((k, i) => [k, translatedValues[i]]))
    const merged: Record<string, string> = {}
    for (const key of enKeys) {
      merged[key] = translated.has(key) ? translated.get(key)! : (localeDict[key] ?? enDict[key])
    }

    await Bun.write(localePath, serializeDict(merged))
    console.log(`  [${locale}] ✓ written (${Object.keys(merged).length} keys)`)
  }
}

async function main() {
  const apiKey = await loadApiKey()
  console.log("Using Gemini 3.1 Flash Lite (gemini-3.1-flash-lite-preview)")

  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel({ model: "gemini-3.1-flash-lite-preview" })

  const targetLocales = localeArg ? [localeArg] : Object.keys(LOCALE_META)
  const targetPackages = pkgArg ? PACKAGES.filter((p) => p.pkg === pkgArg) : PACKAGES

  console.log(`Locales: ${targetLocales.join(", ")}`)
  console.log(`Packages: ${targetPackages.map((p) => p.pkg).join(", ")}`)

  for (const cfg of targetPackages) {
    await processPackage(cfg, targetLocales, model)
  }

  console.log("\n✓ Done")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
