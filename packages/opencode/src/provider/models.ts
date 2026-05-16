import { Global } from "../global"
import { Log } from "../util/log"
import path from "path"
import z from "zod"
import { Installation } from "../installation"
import { Flag } from "../flag/flag"
import { Partner } from "../brand/partner"
import { lazy } from "@/util/lazy"
import { Filesystem } from "../util/filesystem"
import { Flock } from "@/util/flock"
import { Hash } from "@/util/hash"

// Try to import bundled snapshot (generated at build time)
// Falls back to undefined in dev mode when snapshot doesn't exist
/* @ts-ignore */

export namespace ModelsDev {
  const log = Log.create({ service: "models.dev" })
  const source = url()
  const filepath = path.join(
    Global.Path.cache,
    source === "https://models.dev" ? "models.json" : `models-${Hash.fast(source)}.json`,
  )
  const ttl = 5 * 60 * 1000

  type JsonValue = string | number | boolean | null | { [key: string]: JsonValue } | JsonValue[]

  const JsonValue: z.ZodType<JsonValue> = z.lazy(() =>
    z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(JsonValue), z.record(z.string(), JsonValue)]),
  )

  const Cost = z.object({
    input: z.number(),
    output: z.number(),
    cache_read: z.number().optional(),
    cache_write: z.number().optional(),
    context_over_200k: z
      .object({
        input: z.number(),
        output: z.number(),
        cache_read: z.number().optional(),
        cache_write: z.number().optional(),
      })
      .optional(),
  })

  export const Model = z.object({
    id: z.string(),
    name: z.string(),
    family: z.string().optional(),
    release_date: z.string(),
    attachment: z.boolean(),
    reasoning: z.boolean(),
    temperature: z.boolean(),
    tool_call: z.boolean(),
    interleaved: z
      .union([
        z.literal(true),
        z
          .object({
            field: z.enum(["reasoning_content", "reasoning_details"]),
          })
          .strict(),
      ])
      .optional(),
    cost: Cost.optional(),
    limit: z.object({
      context: z.number(),
      input: z.number().optional(),
      output: z.number(),
    }),
    modalities: z
      .object({
        input: z.array(z.enum(["text", "audio", "image", "video", "pdf"])),
        output: z.array(z.enum(["text", "audio", "image", "video", "pdf"])),
      })
      .optional(),
    experimental: z
      .object({
        modes: z
          .record(
            z.string(),
            z.object({
              cost: Cost.optional(),
              provider: z
                .object({
                  body: z.record(z.string(), JsonValue).optional(),
                  headers: z.record(z.string(), z.string()).optional(),
                })
                .optional(),
            }),
          )
          .optional(),
      })
      .optional(),
    status: z.enum(["alpha", "beta", "deprecated"]).optional(),
    provider: z.object({ npm: z.string().optional(), api: z.string().optional() }).optional(),
    // Kolbo-provider extras tacked on at runtime by refreshKolboLimits().
    default: z.boolean().optional(),
    avatar: z.string().optional(),
  })
  export type Model = z.infer<typeof Model>

  export const Provider = z.object({
    api: z.string().optional(),
    name: z.string(),
    env: z.array(z.string()),
    id: z.string(),
    npm: z.string().optional(),
    models: z.record(z.string(), Model),
  })

  export type Provider = z.infer<typeof Provider>

  function url() {
    return Flag.KOLBO_MODELS_URL || "https://models.dev"
  }

  function fresh() {
    return Date.now() - Number(Filesystem.stat(filepath)?.mtimeMs ?? 0) < ttl
  }

  function skip(force: boolean) {
    return !force && fresh()
  }

  const fetchApi = async () => {
    const result = await fetch(`${url()}/api.json`, {
      headers: { "User-Agent": Installation.USER_AGENT },
      signal: AbortSignal.timeout(10000),
    })
    return { ok: result.ok, text: await result.text() }
  }

  // Kolbo.AI provider — routes through kolbo-api at the isolated /kolbo/v1
  // prefix so the CLI consumes the user's Kolbo.AI credit balance via the
  // hidden kodu-default model (exposed publicly as kolbo-default).
  const KOLBO_PROVIDER = {
    id: "kolbo",
    env: ["KOLBO_API_KEY"],
    npm: "@ai-sdk/openai-compatible",
    api: `${Partner.apiBase}/kolbo/v1`,
    name: Partner.name,
    doc: `https://${Partner.domain}/cli`,
    models: {
      "kolbo-default": {
        id: "kolbo-default",
        name: Partner.name,
        family: "kolbo",
        attachment: true,
        reasoning: false,
        tool_call: true,
        structured_output: true,
        temperature: true,
        release_date: "2026-04-10",
        last_updated: "2026-04-10",
        modalities: { input: ["text", "image", "audio", "video", "pdf"], output: ["text"] },
        open_weights: false,
        cost: { input: 0.4, output: 1.6 },
        limit: { context: 196_608, output: 32_768 },
      },
    },
  }

  // Local Ollama provider — user runs Ollama on their machine at localhost:11434
  // No preset models: available models depend on what the user has pulled locally
  const OLLAMA_PROVIDER = {
    id: "ollama",
    env: [],
    npm: "@ai-sdk/openai-compatible",
    api: "http://localhost:11434/v1",
    name: "Ollama",
    doc: "https://ollama.ai",
    models: {},
  }

  /**
   * Fetch the catalog from the Kolbo API's /models endpoint and rebuild
   * KOLBO_PROVIDER.models from it. Called once at startup + hourly
   * (fire-and-forget); failures are silently swallowed so the hardcoded
   * `kolbo-default` fallback stays in effect when offline.
   *
   * The full rebuild lets the backend expose new code models (just by adding
   * Mongo docs) without a CLI release. The local hardcoded entry above is
   * the offline-only fallback.
   */
  export async function refreshKolboLimits() {
    try {
      const res = await fetch(`${Partner.apiBase}/kolbo/v1/models`, {
        headers: { "User-Agent": Installation.USER_AGENT },
        signal: AbortSignal.timeout(8000),
      })
      if (!res.ok) return
      const json = (await res.json()) as {
        data?: Array<{
          id: string
          name?: string
          description?: string
          default?: boolean
          avatar?: string | null
          release_date?: string
          modalities?: { input?: string[]; output?: string[] }
          cost?: { input?: number; output?: number }
          reasoning?: boolean
          context_length?: number
          output_length?: number
        }>
      }
      if (!Array.isArray(json.data) || json.data.length === 0) return // keep fallback

      // kolbo-api absolutizes + percent-encodes avatar URLs server-side
      // (controller.js → resolveAvatar). We just keep absolute URLs and drop
      // anything else — relative paths arriving here would 404 in the browser
      // anyway, so undefined → fallback initial tile is the safer outcome.
      const passAvatar = (a: string | null | undefined): string | undefined =>
        typeof a === "string" && /^https?:\/\//i.test(a) ? a : undefined

      const next: Record<string, any> = {}
      for (const m of json.data) {
        if (!m?.id) continue
        const inputModalities = m.modalities?.input ?? ["text"]
        next[m.id] = {
          id: m.id,
          name: m.name ?? m.id,
          family: "kolbo",
          attachment: inputModalities.length > 1,
          reasoning: m.reasoning ?? false,
          tool_call: true,
          structured_output: true,
          temperature: true,
          release_date: m.release_date ?? "2026-04-10",
          last_updated: m.release_date ?? "2026-04-10",
          modalities: {
            input: inputModalities,
            output: m.modalities?.output ?? ["text"],
          },
          open_weights: false,
          cost: {
            input: m.cost?.input ?? 0,
            output: m.cost?.output ?? 0,
          },
          limit: {
            context: m.context_length ?? 196_608,
            output: m.output_length ?? 32_768,
          },
          // Picker pins default to top of Kolbo group + renders avatar.
          default: m.default === true,
          avatar: passAvatar(m.avatar),
        }
      }
      // Atomic swap so the TUI never observes a half-empty map
      ;(KOLBO_PROVIDER as any).models = next
      Data.reset() // invalidate cached provider data so next get() picks up the new catalog
    } catch {
      // offline or API down — hardcoded fallback stays in effect
    }
  }

  function injectKolbo(data: Record<string, any>) {
    if (!data || typeof data !== "object") return { kolbo: KOLBO_PROVIDER, ollama: OLLAMA_PROVIDER } as any
    // Build a new object to avoid mutating potentially frozen snapshot objects.
    const result: Record<string, any> = {}
    const strip = new Set(["opencode", "opencode-go", "kodu", "ollama-cloud", "ollama"])
    for (const [key, value] of Object.entries(data)) {
      if (!strip.has(key)) result[key] = value
    }
    result.kolbo = KOLBO_PROVIDER
    result.ollama = OLLAMA_PROVIDER
    return result
  }

  export const Data = lazy(async () => {
    const result = await Filesystem.readJson(Flag.KOLBO_MODELS_PATH ?? filepath).catch(() => {})
    if (result) return injectKolbo(result)
    // @ts-ignore
    const snapshot = await import("./models-snapshot.js")
      .then((m) => m.snapshot as Record<string, unknown>)
      .catch(() => undefined)
    if (snapshot) return injectKolbo(snapshot)
    if (Flag.KOLBO_DISABLE_MODELS_FETCH) return injectKolbo({})
    return Flock.withLock(`models-dev:${filepath}`, async () => {
      const result = await Filesystem.readJson(Flag.KOLBO_MODELS_PATH ?? filepath).catch(() => {})
      if (result) return injectKolbo(result)
      const result2 = await fetchApi()
      if (result2.ok) {
        await Filesystem.write(filepath, result2.text).catch((e) => {
          log.error("Failed to write models cache", { error: e })
        })
      }
      return injectKolbo(JSON.parse(result2.text))
    })
  })

  export async function get() {
    const result = await Data()
    return result as Record<string, Provider>
  }

  export async function refresh(force = false) {
    if (skip(force)) return ModelsDev.Data.reset()
    await Flock.withLock(`models-dev:${filepath}`, async () => {
      if (skip(force)) return ModelsDev.Data.reset()
      const result = await fetchApi()
      if (!result.ok) return
      await Filesystem.write(filepath, result.text)
      ModelsDev.Data.reset()
    }).catch((e) => {
      log.error("Failed to fetch models.dev", {
        error: e,
      })
    })
  }
}

if (!Flag.KOLBO_DISABLE_MODELS_FETCH && !process.argv.includes("--get-yargs-completions")) {
  ModelsDev.refresh()
  ModelsDev.refreshKolboLimits()
  setInterval(
    async () => {
      await ModelsDev.refresh()
      await ModelsDev.refreshKolboLimits()
    },
    60 * 1000 * 60,
  ).unref()
}
