import { Hono, type Context } from "hono"
import { describeRoute, resolver, validator } from "hono-openapi"
import { streamSSE } from "hono/streaming"
import z from "zod"
import { BusEvent } from "@/bus/bus-event"
import { SyncEvent } from "@/sync"
import { GlobalBus } from "@/bus/global"
import { AsyncQueue } from "@/util/queue"
import { Instance } from "../../project/instance"
import { Installation } from "@/installation"
import { Log } from "../../util/log"
import { lazy } from "../../util/lazy"
import { Config } from "../../config/config"
import { errors } from "../error"
import { Auth } from "../../auth"
import { Partner } from "../../brand/partner"
import { Global } from "../../global"
import path from "path"

const log = Log.create({ service: "server" })

// Declared at module top to avoid temporal dead zone in Bun compiled binaries
const _htmlPreviewStore = new Map<string, string>()

/**
 * Kolbo asset (Visual DNA / moodboard) cache for the `@`/`#` mention menu.
 *
 * `GET /v1/moodboards` sits on the 10 req/min per-user SDK bucket that generation
 * routes share, so an uncached autocomplete would rate-limit the user's own image
 * generations. The menu filters locally (fuzzysort in useFilteredList), so one
 * fetch per TTL window is all the UI ever needs.
 */
type KolboAsset = {
  id: string
  name: string
  thumbnail?: string
  dnaType?: string
  description?: string
  images?: string[]
}
const _kolboAssetCache = new Map<string, { at: number; value: KolboAsset[] }>()
const KOLBO_ASSET_TTL = 5 * 60 * 1000

function assetImages(row: Record<string, any>): string[] {
  const out: string[] = []
  const push = (url: unknown) => {
    if (typeof url === "string" && url && !url.startsWith("data:") && !out.includes(url)) out.push(url)
  }
  push(row.sheet_url ?? row.characterSheet)
  push(row.thumbnail_url ?? row.thumbnail)
  if (Array.isArray(row.images)) {
    for (const img of row.images) {
      if (typeof img === "string") push(img)
      else if (img && typeof img === "object") push(img.url ?? img.src)
    }
  }
  if (Array.isArray(row.source_images)) {
    for (const img of row.source_images) {
      if (typeof img === "string") push(img)
      else if (img && typeof img === "object") push(img.url ?? img.src)
    }
  }
  return out
}

function mapAsset(row: any): KolboAsset | null {
  const id = row?.id ?? row?._id
  const name = row?.name
  if (!id || !name) return null
  const images = assetImages(row)
  return {
    id: String(id),
    name: String(name),
    thumbnail: images[0],
    dnaType: row.dna_type ?? row.dnaType,
    description: typeof row.description === "string" ? row.description : undefined,
    images: images.length ? images : undefined,
  }
}

async function kolboAssets(cacheKey: string, path: string): Promise<KolboAsset[]> {
  const auth = (await Auth.get(Partner.authProviderID)) ?? (await Auth.get(Partner.authProviderIDLegacy))
  const apiKey = auth?.type === "api" ? auth.key : auth?.type === "oauth" ? auth.access : undefined
  if (!apiKey) return []

  const key = `${cacheKey}:${apiKey}`
  const hit = _kolboAssetCache.get(key)
  if (hit && Date.now() - hit.at < KOLBO_ASSET_TTL) return hit.value

  try {
    const res = await fetch(`${Partner.apiBase}${path}`, { headers: { "X-API-Key": apiKey } })
    if (!res.ok) return hit?.value ?? []
    const body = (await res.json()) as Record<string, any>
    // kolbo-api wraps list payloads differently per route.
    const rows: any[] = body.visual_dnas ?? body.moodboards ?? body.data ?? []
    const value = rows.flatMap((row): KolboAsset[] => {
      const mapped = mapAsset(row)
      return mapped ? [mapped] : []
    })
    _kolboAssetCache.set(key, { at: Date.now(), value })
    return value
  } catch {
    // Degrade silently like /kolbo-balance — a signed-out or offline user must
    // still get files and agents in the @ menu, not an error.
    return hit?.value ?? []
  }
}

const KolboAssetSchema = z.object({
  id: z.string(),
  name: z.string(),
  thumbnail: z.string().optional(),
  dnaType: z.string().optional(),
  description: z.string().optional(),
  images: z.array(z.string()).optional(),
})

type KolboPreset = { id: string; name: string; thumbnail?: string }
let _kolboPresetsCache: { at: number; key: string; value: KolboPreset[] } | undefined
const KOLBO_PRESETS_TTL = 10 * 60 * 1000

async function kolboPresets(): Promise<KolboPreset[]> {
  const auth = (await Auth.get(Partner.authProviderID)) ?? (await Auth.get(Partner.authProviderIDLegacy))
  const apiKey = auth?.type === "api" ? auth.key : auth?.type === "oauth" ? auth.access : undefined
  if (!apiKey) return []
  const hit = _kolboPresetsCache
  if (hit && hit.key === apiKey && Date.now() - hit.at < KOLBO_PRESETS_TTL) return hit.value
  try {
    const res = await fetch(`${Partner.apiBase}/v1/presets`, { headers: { "X-API-Key": apiKey } })
    if (!res.ok) return hit?.value ?? []
    const body = (await res.json()) as { presets?: Array<Record<string, unknown>> }
    const value = (body.presets ?? []).flatMap((row): KolboPreset[] => {
      const id = row?.id ?? row?._id ?? row?.identifier
      const name = row?.name
      if (!id || !name) return []
      const thumb = row.thumbnail_url ?? row.thumbnail
      return [
        {
          id: String(id),
          name: String(name),
          ...(typeof thumb === "string" ? { thumbnail: thumb } : {}),
        },
      ]
    })
    _kolboPresetsCache = { at: Date.now(), key: apiKey, value }
    return value
  } catch {
    return hit?.value ?? []
  }
}

// ── Kolbo platform projects ───────────────────────────────────────────────
// The cloud buckets generations land in. Selected per-workspace via the
// composer chip; the New Project dialog auto-links one by name. Separate from
// kolboAssets(): projects need `is_default` (the "API Generations" fallback
// bucket), which the generic asset projection has no slot for.
const KolboProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  is_default: z.boolean(),
  // Upstream role: 'owner' | 'edit' | 'full' — anything but 'owner' means the
  // project was shared with this user, which the chip surfaces as a badge.
  role: z.string(),
  thumbnail: z.string().nullable(),
})
type KolboProject = z.infer<typeof KolboProjectSchema>

let _kolboProjectsCache: { at: number; key: string; value: KolboProject[] } | undefined
const KOLBO_PROJECTS_TTL = 5 * 60 * 1000

async function kolboProjects(): Promise<KolboProject[]> {
  const auth = (await Auth.get(Partner.authProviderID)) ?? (await Auth.get(Partner.authProviderIDLegacy))
  const apiKey = auth?.type === "api" ? auth.key : auth?.type === "oauth" ? auth.access : undefined
  if (!apiKey) return []
  const hit = _kolboProjectsCache
  if (hit && hit.key === apiKey && Date.now() - hit.at < KOLBO_PROJECTS_TTL) return hit.value
  try {
    const res = await fetch(`${Partner.apiBase}/v1/projects?limit=200`, { headers: { "X-API-Key": apiKey } })
    if (!res.ok) return hit?.value ?? []
    const body = (await res.json()) as {
      projects?: { id: string; name: string; is_default?: boolean; role?: string; thumbnail_url?: string | null }[]
    }
    const value = (body.projects ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      is_default: !!p.is_default,
      role: p.role ?? "owner",
      thumbnail: p.thumbnail_url ?? null,
    }))
    _kolboProjectsCache = { at: Date.now(), key: apiKey, value }
    return value
  } catch {
    return hit?.value ?? []
  }
}

// ── Kolbo model metadata cache ────────────────────────────────────────────
// /kolbo/v1/models is hit on every page load by the model picker. The data
// (pricing + avatars) changes rarely — a 5-minute TTL with single in-flight
// dedup is plenty for live edits during development and avoids hammering
// kolbo-api on every UI refresh.
type KolboModelMetadata = {
  pricing: Record<string, { input: number; output: number }>
  avatars: Record<string, string | null>
  names: Record<string, string>
}
const KOLBO_MODELS_TTL_MS = 5 * 60 * 1000
let kolboModelCache: { at: number; data: KolboModelMetadata } | null = null
let kolboModelInflight: Promise<KolboModelMetadata> | null = null

async function fetchKolboModelMetadata(): Promise<KolboModelMetadata> {
  const base = Partner.apiBase
  const empty: KolboModelMetadata = { pricing: {}, avatars: {}, names: {} }
  try {
    const res = await fetch(`${base}/kolbo/v1/models`)
    if (!res.ok) return empty
    const data = (await res.json()) as {
      data?: Array<{
        id: string
        name?: string | null
        display_name?: string | null
        label?: string | null
        avatar?: string | null
        pricing?: {
          input_credits_per_million?: number
          output_credits_per_million?: number
        }
      }>
    }
    const out: KolboModelMetadata = { pricing: {}, avatars: {}, names: {} }
    for (const m of data.data ?? []) {
      const inRate = m.pricing?.input_credits_per_million
      const outRate = m.pricing?.output_credits_per_million
      if (typeof inRate === "number" && typeof outRate === "number") {
        out.pricing[m.id] = { input: inRate, output: outRate }
      }
      if (typeof m.avatar === "string" && m.avatar.length > 0) {
        out.avatars[m.id] = m.avatar
      } else {
        out.avatars[m.id] = null
      }
      // Prefer display_name / label / name in that order — kolbo-api has
      // varied across versions which key it uses for the human-friendly
      // label, so check all the common ones before falling back to the id.
      const friendly =
        (typeof m.display_name === "string" && m.display_name.trim()) ||
        (typeof m.label === "string" && m.label.trim()) ||
        (typeof m.name === "string" && m.name.trim()) ||
        ""
      if (friendly) out.names[m.id] = friendly
    }
    return out
  } catch {
    return empty
  }
}

async function getKolboModelMetadata(): Promise<KolboModelMetadata> {
  const now = Date.now()
  if (kolboModelCache && now - kolboModelCache.at < KOLBO_MODELS_TTL_MS) {
    return kolboModelCache.data
  }
  if (kolboModelInflight) return kolboModelInflight
  kolboModelInflight = fetchKolboModelMetadata()
    .then((data) => {
      kolboModelCache = { at: Date.now(), data }
      return data
    })
    .finally(() => {
      kolboModelInflight = null
    })
  return kolboModelInflight
}

// Generation models FILTERED BY generation type (text_to_img, image_editing,
// text_to_video, …) — for the desktop approval-card model picker, which needs
// the models valid for the tool being run (not the chat model list). Backed by
// the kolbo-api SDK /v1/models?type= endpoint (same one the MCP list_models
// uses), returning each model's id, friendly name and avatar. Cached per type.
type KolboGenModel = { id: string; name: string; avatar: string | null }
const kolboGenModelCache = new Map<string, { at: number; data: KolboGenModel[] }>()

// Generation-model avatars come off /v1/models as BARE FILENAMES, never URLs —
// every single row ("Bytedance icon.png", "kling-color.svg", …), spaces and
// all. The chat-metadata route hands out absolute URLs, so callers assumed
// these were absolute too and fed them straight to the image proxy: the
// in-progress generation card resolved "Seedance 2.5" correctly but rendered a
// first-letter circle instead of the Bytedance icon, because `Bytedance
// icon.png` is not a loadable src. Resolve here, once, so every consumer of
// this route (widget model chip, approval-card picker) gets a real URL —
// same base and same per-segment encoding @kolbo/mcp uses server-side.
const MODEL_ICON_CDN_BASE = "https://kolbo-general-media.fra1.cdn.digitaloceanspaces.com/models_icons"

function resolveModelAvatar(avatar: string | null | undefined): string | null {
  if (typeof avatar !== "string" || avatar.length === 0) return null
  if (/^(https?:)?\/\//i.test(avatar) || avatar.startsWith("data:")) return avatar
  return `${MODEL_ICON_CDN_BASE}/${encodeURIComponent(avatar.replace(/^\/+/, ""))}`
}
async function getKolboGenerationModels(type: string): Promise<KolboGenModel[]> {
  const cached = kolboGenModelCache.get(type)
  if (cached && Date.now() - cached.at < KOLBO_MODELS_TTL_MS) return cached.data
  const base = Partner.apiBase
  try {
    // /v1/models is authenticated (unlike the public chat metadata). The Kolbo
    // key is an X-API-Key (NOT a Bearer token — Bearer returns "Invalid token").
    const auth = (await Auth.get(Partner.authProviderID)) ?? (await Auth.get(Partner.authProviderIDLegacy))
    const apiKey = auth?.type === "api" ? auth.key : auth?.type === "oauth" ? auth.access : undefined
    const res = await fetch(`${base}/v1/models?type=${encodeURIComponent(type)}`, {
      headers: apiKey ? { "X-API-Key": apiKey } : {},
    })
    if (!res.ok) return []
    const data = (await res.json()) as {
      models?: Array<{ identifier: string; name?: string | null; avatar?: string | null }>
    }
    const out: KolboGenModel[] = (data.models ?? [])
      .filter((m) => typeof m.identifier === "string" && m.identifier.length > 0)
      .map((m) => ({
        id: m.identifier,
        name: (typeof m.name === "string" && m.name.trim()) || m.identifier,
        avatar: resolveModelAvatar(m.avatar),
      }))
    kolboGenModelCache.set(type, { at: Date.now(), data: out })
    return out
  } catch {
    return []
  }
}

export const GlobalDisposedEvent = BusEvent.define("global.disposed", z.object({}))

async function streamEvents(c: Context, subscribe: (q: AsyncQueue<string | null>) => () => void) {
  return streamSSE(c, async (stream) => {
    const q = new AsyncQueue<string | null>()
    let done = false

    q.push(
      JSON.stringify({
        payload: {
          type: "server.connected",
          properties: {},
        },
      }),
    )

    // Send heartbeat every 10s to prevent stalled proxy streams.
    const heartbeat = setInterval(() => {
      q.push(
        JSON.stringify({
          payload: {
            type: "server.heartbeat",
            properties: {},
          },
        }),
      )
    }, 10_000)

    const stop = () => {
      if (done) return
      done = true
      clearInterval(heartbeat)
      unsub()
      q.push(null)
      log.info("global event disconnected")
    }

    const unsub = subscribe(q)

    stream.onAbort(stop)

    try {
      for await (const data of q) {
        if (data === null) return
        await stream.writeSSE({ data })
      }
    } finally {
      stop()
    }
  })
}

export const GlobalRoutes = lazy(() =>
  new Hono()
    .get(
      "/health",
      describeRoute({
        summary: "Get health",
        description: "Get health information about the Kolbo server.",
        operationId: "global.health",
        responses: {
          200: {
            description: "Health information",
            content: {
              "application/json": {
                schema: resolver(z.object({ healthy: z.literal(true), version: z.string() })),
              },
            },
          },
        },
      }),
      async (c) => {
        return c.json({ healthy: true, version: Installation.VERSION })
      },
    )
    .get(
      "/event",
      describeRoute({
        summary: "Get global events",
        description: "Subscribe to global events from the Kolbo system using server-sent events.",
        operationId: "global.event",
        responses: {
          200: {
            description: "Event stream",
            content: {
              "text/event-stream": {
                schema: resolver(
                  z
                    .object({
                      directory: z.string(),
                      payload: BusEvent.payloads(),
                    })
                    .meta({
                      ref: "GlobalEvent",
                    }),
                ),
              },
            },
          },
        },
      }),
      async (c) => {
        log.info("global event connected")
        c.header("Cache-Control", "no-cache, no-transform")
        c.header("X-Accel-Buffering", "no")
        c.header("X-Content-Type-Options", "nosniff")

        return streamEvents(c, (q) => {
          async function handler(event: any) {
            q.push(JSON.stringify(event))
          }
          GlobalBus.on("event", handler)
          return () => GlobalBus.off("event", handler)
        })
      },
    )
    .get(
      "/sync-event",
      describeRoute({
        summary: "Subscribe to global sync events",
        description: "Get global sync events",
        operationId: "global.sync-event.subscribe",
        responses: {
          200: {
            description: "Event stream",
            content: {
              "text/event-stream": {
                schema: resolver(
                  z
                    .object({
                      payload: SyncEvent.payloads(),
                    })
                    .meta({
                      ref: "SyncEvent",
                    }),
                ),
              },
            },
          },
        },
      }),
      async (c) => {
        log.info("global sync event connected")
        c.header("Cache-Control", "no-cache, no-transform")
        c.header("X-Accel-Buffering", "no")
        c.header("X-Content-Type-Options", "nosniff")
        return streamEvents(c, (q) => {
          return SyncEvent.subscribeAll(({ def, event }) => {
            // TODO: don't pass def, just pass the type (and it should
            // be versioned)
            q.push(
              JSON.stringify({
                payload: {
                  ...event,
                  type: SyncEvent.versionedType(def.type, def.version),
                },
              }),
            )
          })
        })
      },
    )
    .get(
      "/config",
      describeRoute({
        summary: "Get global configuration",
        description: "Retrieve the current global Kolbo configuration settings and preferences.",
        operationId: "global.config.get",
        responses: {
          200: {
            description: "Get global config info",
            content: {
              "application/json": {
                schema: resolver(Config.Info),
              },
            },
          },
        },
      }),
      async (c) => {
        return c.json(await Config.getGlobal())
      },
    )
    .patch(
      "/config",
      describeRoute({
        summary: "Update global configuration",
        description: "Update global Kolbo configuration settings and preferences.",
        operationId: "global.config.update",
        responses: {
          200: {
            description: "Successfully updated global config",
            content: {
              "application/json": {
                schema: resolver(Config.Info),
              },
            },
          },
          ...errors(400),
        },
      }),
      validator("json", Config.Info),
      async (c) => {
        const config = c.req.valid("json")
        const next = await Config.updateGlobal(config)
        return c.json(next)
      },
    )
    .post(
      "/dispose",
      describeRoute({
        summary: "Dispose instance",
        description: "Clean up and dispose all Kolbo instances, releasing all resources.",
        operationId: "global.dispose",
        responses: {
          200: {
            description: "Global disposed",
            content: {
              "application/json": {
                schema: resolver(z.boolean()),
              },
            },
          },
        },
      }),
      async (c) => {
        await Instance.disposeAll()
        GlobalBus.emit("event", {
          directory: "global",
          payload: {
            type: GlobalDisposedEvent.type,
            properties: {},
          },
        })
        return c.json(true)
      },
    )
    .post(
      "/upgrade",
      describeRoute({
        summary: "Upgrade kolbo",
        description: "Upgrade kolbo to the specified version or latest if not specified.",
        operationId: "global.upgrade",
        responses: {
          200: {
            description: "Upgrade result",
            content: {
              "application/json": {
                schema: resolver(
                  z.union([
                    z.object({
                      success: z.literal(true),
                      version: z.string(),
                    }),
                    z.object({
                      success: z.literal(false),
                      error: z.string(),
                    }),
                  ]),
                ),
              },
            },
          },
          ...errors(400),
        },
      }),
      validator(
        "json",
        z.object({
          target: z.string().optional(),
        }),
      ),
      async (c) => {
        const method = await Installation.method()
        if (method === "unknown") {
          return c.json({ success: false, error: "Unknown installation method" }, 400)
        }
        const target = c.req.valid("json").target || (await Installation.latest(method))
        const result = await Installation.upgrade(method, target)
          .then(() => ({ success: true as const, version: target }))
          .catch((e) => ({ success: false as const, error: e instanceof Error ? e.message : String(e) }))
        if (result.success) {
          GlobalBus.emit("event", {
            directory: "global",
            payload: {
              type: Installation.Event.Updated.type,
              properties: { version: target },
            },
          })
          return c.json(result)
        }
        return c.json(result, 500)
      },
    )
    .get(
      "/kolbo-session-usage",
      describeRoute({
        summary: "Get media credit spend for the current Kolbo Code app session",
        description:
          "Aggregates real, multiplier-adjusted credit spend tagged with this app's caller-session-id (set in the MCP env by ensureKolboMcpWired). Powers the desktop bottom-bar 'media N' counter.",
        operationId: "global.kolbo-session-usage",
        responses: {
          200: {
            description: "Caller-session usage breakdown",
            content: {
              "application/json": {
                schema: resolver(
                  z.object({
                    caller_session_id: z.string().nullable(),
                    total: z.number(),
                    count: z.number(),
                    by_tool: z.array(z.object({ generation_type: z.string().nullable(), amount: z.number(), count: z.number() })),
                    by_model: z.array(z.object({ model: z.string().nullable(), amount: z.number(), count: z.number() })),
                    recent: z.array(z.any()),
                  }),
                ),
              },
            },
          },
          ...errors(401, 502),
        },
      }),
      async (c) => {
        const auth = (await Auth.get(Partner.authProviderID)) ?? (await Auth.get(Partner.authProviderIDLegacy))
        const apiKey =
          auth?.type === "api"
            ? auth.key
            : auth?.type === "oauth"
              ? auth.access
              : undefined
        const empty = { caller_session_id: null, total: 0, count: 0, by_tool: [], by_model: [], recent: [] }
        if (!apiKey) return c.json(empty)

        // Read the caller-session-id that wire.ts wrote into the MCP env when
        // it persisted ~/.config/kolbo/kolbo.json. Single source of truth —
        // no duplicate generation, no drift between MCP and server.
        let callerSessionId: string | undefined
        try {
          const raw = await import("fs").then((fs) =>
            fs.promises.readFile(path.join(Global.Path.config, "kolbo.json"), "utf8"),
          )
          callerSessionId = JSON.parse(raw)?.mcp?.kolbo?.environment?.KOLBO_CALLER_SESSION_ID
        } catch {}
        if (!callerSessionId) return c.json(empty)

        const base = Partner.apiBase
        // Pass through startDate / endDate so callers can scope the window
        // (e.g. the desktop prompt-input scopes to "this chat session" by
        // sending startDate = first-message timestamp). kolbo-api filters
        // CreditUsage.created_at by these. Strings only — non-string values
        // are dropped to defend against NoSQL operator injection.
        const startDate = typeof c.req.query("startDate") === "string" ? c.req.query("startDate") : undefined
        const endDate = typeof c.req.query("endDate") === "string" ? c.req.query("endDate") : undefined
        const qs = new URLSearchParams({ caller_session_id: callerSessionId })
        if (startDate) qs.set("startDate", startDate)
        if (endDate) qs.set("endDate", endDate)
        try {
          const url = `${base}/credit-usage/by-caller-session?${qs.toString()}`
          const res = await fetch(url, {
            headers: {
              "X-API-Key": apiKey,
              "X-Kolbo-Caller-Session-Id": callerSessionId,
            },
          })
          if (!res.ok) return c.json({ ...empty, caller_session_id: callerSessionId })
          const json = (await res.json()) as { data?: typeof empty }
          return c.json({ ...(json.data || empty), caller_session_id: callerSessionId })
        } catch {
          return c.json({ ...empty, caller_session_id: callerSessionId })
        }
      },
    )
    .get(
      "/kolbo-balance",
      describeRoute({
        summary: "Get Kolbo credit balance",
        description: "Fetch the authenticated user's Kolbo credit balance from kolbo-api.",
        operationId: "global.kolbo-balance",
        responses: {
          200: {
            description: "Credit balance",
            content: {
              "application/json": {
                schema: resolver(
                  z.object({
                    available: z.number(),
                    reserved: z.number(),
                    total: z.number(),
                  }),
                ),
              },
            },
          },
          ...errors(401, 502),
        },
      }),
      async (c) => {
        const auth = (await Auth.get(Partner.authProviderID)) ?? (await Auth.get(Partner.authProviderIDLegacy))
        const apiKey =
          auth?.type === "api"
            ? auth.key
            : auth?.type === "oauth"
              ? auth.access
              : undefined

        if (!apiKey) {
          return c.json({ available: 0, reserved: 0, total: 0 })
        }

        const base = Partner.apiBase
        try {
          const res = await fetch(`${base}/kolbo/v1/balance`, {
            headers: { "X-API-Key": apiKey },
          })
          if (!res.ok) return c.json({ available: 0, reserved: 0, total: 0 })
          const data = (await res.json()) as { available: number; reserved: number; total: number }
          return c.json(data)
        } catch {
          return c.json({ available: 0, reserved: 0, total: 0 })
        }
      },
    )
    .post(
      "/kolbo-generation-cancel",
      describeRoute({
        summary: "Cancel one Kolbo media generation",
        description: "Forwards an exact generation id to Kolbo's existing stop-and-refund endpoint.",
        operationId: "global.kolbo-generation-cancel",
        responses: {
          200: {
            description: "Generation cancelled",
            content: {
              "application/json": {
                schema: resolver(z.record(z.string(), z.any())),
              },
            },
          },
          ...errors(400, 401, 502),
        },
      }),
      validator("json", z.object({ generationId: z.string().min(1).max(200) })),
      async (c) => {
        const auth = (await Auth.get(Partner.authProviderID)) ?? (await Auth.get(Partner.authProviderIDLegacy))
        const apiKey = auth?.type === "api" ? auth.key : auth?.type === "oauth" ? auth.access : undefined
        if (!apiKey) return c.json({ error: "Not authenticated with Kolbo" }, 401)
        const { generationId } = c.req.valid("json")
        try {
          const res = await fetch(`${Partner.apiBase}/generation/stop`, {
            method: "POST",
            headers: {
              "X-API-Key": apiKey,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ generationId }),
          })
          const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
          if (!res.ok) return c.json(data, 502)
          return c.json(data)
        } catch {
          return c.json({ error: "Kolbo cancellation service is unavailable" }, 502)
        }
      },
    )
    .get(
      "/kolbo-generation-status",
      describeRoute({
        summary: "Check one Kolbo media generation",
        description:
          "Forwards a generation id to Kolbo's status endpoint. The MCP's generate_* tools give up waiting after their poll window and return `state: \"processing\"`; without this the card that result renders has no way to ever learn the generation finished.",
        operationId: "global.kolbo-generation-status",
        responses: {
          200: {
            description: "Generation status",
            content: {
              "application/json": {
                schema: resolver(z.record(z.string(), z.any())),
              },
            },
          },
          ...errors(400, 401, 502),
        },
      }),
      validator("query", z.object({ generationId: z.string().min(1).max(200) })),
      async (c) => {
        const auth = (await Auth.get(Partner.authProviderID)) ?? (await Auth.get(Partner.authProviderIDLegacy))
        const apiKey = auth?.type === "api" ? auth.key : auth?.type === "oauth" ? auth.access : undefined
        if (!apiKey) return c.json({ error: "Not authenticated with Kolbo" }, 401)
        const { generationId } = c.req.valid("query")
        try {
          const res = await fetch(`${Partner.apiBase}/v1/generate/${encodeURIComponent(generationId)}/status`, {
            headers: { "X-API-Key": apiKey },
          })
          const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
          if (!res.ok) return c.json(data, 502)
          return c.json(data)
        } catch {
          return c.json({ error: "Kolbo status service is unavailable" }, 502)
        }
      },
    )
    .get(
      "/kolbo-visual-dnas",
      describeRoute({
        summary: "List Kolbo Visual DNAs",
        description:
          "Fetch the authenticated user's Visual DNAs for the prompt `@` mention menu. Cached server-side; returns an empty list when signed out.",
        operationId: "global.kolbo-visual-dnas",
        responses: {
          200: {
            description: "Visual DNAs",
            content: { "application/json": { schema: resolver(z.array(KolboAssetSchema)) } },
          },
          ...errors(401, 502),
        },
      }),
      // `mine` = personal + org + shared. NOT "personal" — kolbo-api validates
      // scope against ['mine','global','all'] and silently falls back to 'all'
      // on anything else, so the old value was quietly asking for the whole
      // catalog and relying on luck to keep the menu short.
      async (c) => c.json(await kolboAssets("visual-dna", "/v1/visual-dna?scope=mine")),
    )
    .get(
      "/kolbo-global-visual-dnas",
      describeRoute({
        summary: "List the global Kolbo Visual DNA catalog",
        description:
          "Fetch the platform-wide Visual DNA presets. Deliberately separate from /kolbo-visual-dnas: the catalog runs to thousands of entries, so it is browsed in its own tab rather than mixed into the `@` mention menu. kolbo-api serves this scope from a 15-minute cache of its own.",
        operationId: "global.kolbo-global-visual-dnas",
        responses: {
          200: {
            description: "Global Visual DNAs",
            content: { "application/json": { schema: resolver(z.array(KolboAssetSchema)) } },
          },
          ...errors(401, 502),
        },
      }),
      async (c) => c.json(await kolboAssets("visual-dna-global", "/v1/visual-dna?scope=global")),
    )
    .get(
      "/kolbo-moodboards",
      describeRoute({
        summary: "List Kolbo moodboards",
        description:
          "Fetch the authenticated user's moodboards for the prompt `#` mention menu. Cached server-side; returns an empty list when signed out.",
        operationId: "global.kolbo-moodboards",
        responses: {
          200: {
            description: "Moodboards",
            content: { "application/json": { schema: resolver(z.array(KolboAssetSchema)) } },
          },
          ...errors(401, 502),
        },
      }),
      async (c) => c.json(await kolboAssets("moodboard", "/v1/moodboards")),
    )
    .get(
      "/kolbo-visual-dna/:id",
      describeRoute({
        summary: "Get one Visual DNA by id",
        description:
          "Resolve a single Visual DNA (name + thumbnail) for the in-progress generation card. Used when the id is not in the user's own list (global / shared).",
        operationId: "global.kolbo-visual-dna",
        responses: {
          200: {
            description: "Visual DNA",
            content: { "application/json": { schema: resolver(KolboAssetSchema) } },
          },
          ...errors(401, 404, 502),
        },
      }),
      async (c) => {
        const id = c.req.param("id")
        if (!id) return c.json({ error: "missing id" }, 400)
        const auth = (await Auth.get(Partner.authProviderID)) ?? (await Auth.get(Partner.authProviderIDLegacy))
        const apiKey = auth?.type === "api" ? auth.key : auth?.type === "oauth" ? auth.access : undefined
        if (!apiKey) return c.json({ error: "Not authenticated with Kolbo" }, 401)
        try {
          const res = await fetch(`${Partner.apiBase}/v1/visual-dna/${encodeURIComponent(id)}`, {
            headers: { "X-API-Key": apiKey },
          })
          if (!res.ok) return c.json({ error: "Visual DNA not found" }, 404)
          const body = (await res.json()) as Record<string, any>
          const row = body.visual_dna ?? body
          const mapped = mapAsset(row)
          if (!mapped) return c.json({ error: "Visual DNA not found" }, 404)
          return c.json(mapped)
        } catch {
          return c.json({ error: "Kolbo Visual DNA service is unavailable" }, 502)
        }
      },
    )
    .get(
      "/kolbo-presets",
      describeRoute({
        summary: "List Kolbo generation presets",
        description:
          "Slim {id,name,thumbnail} list so the in-progress generation card can show the actual preset name instead of the word “preset”.",
        operationId: "global.kolbo-presets",
        responses: {
          200: {
            description: "Presets",
            content: { "application/json": { schema: resolver(z.array(KolboAssetSchema)) } },
          },
          ...errors(401, 502),
        },
      }),
      async (c) => c.json(await kolboPresets()),
    )
    .get(
      "/kolbo-projects",
      describeRoute({
        summary: "List Kolbo platform projects",
        description:
          "Cloud projects where generations land, for the composer's project chip. Cached server-side (~5min); returns an empty list when signed out — never an error.",
        operationId: "global.kolbo-projects",
        responses: {
          200: {
            description: "Projects",
            content: { "application/json": { schema: resolver(z.array(KolboProjectSchema)) } },
          },
        },
      }),
      async (c) => c.json(await kolboProjects()),
    )
    .post(
      "/kolbo-projects",
      describeRoute({
        summary: "Create a Kolbo platform project by name",
        description:
          "Used by the New Project dialog's auto-link and the composer chip's Create-new. Idempotent by name: if a project with this name already exists it is returned instead of duplicated.",
        operationId: "global.kolbo-projects-create",
        responses: {
          200: {
            description: "Created or matched project",
            content: { "application/json": { schema: resolver(KolboProjectSchema) } },
          },
          ...errors(401, 502),
        },
      }),
      validator("json", z.object({ name: z.string().min(1) })),
      async (c) => {
        const { name } = c.req.valid("json")
        const auth = (await Auth.get(Partner.authProviderID)) ?? (await Auth.get(Partner.authProviderIDLegacy))
        const apiKey = auth?.type === "api" ? auth.key : auth?.type === "oauth" ? auth.access : undefined
        if (!apiKey) return c.json({ error: "Not authenticated with Kolbo" }, 401)
        // Match-first: auto-link must be idempotent when a folder is re-created.
        const existing = (await kolboProjects()).find((p) => p.name.toLowerCase() === name.trim().toLowerCase())
        if (existing) return c.json(existing)
        const res = await fetch(`${Partner.apiBase}/v1/projects`, {
          method: "POST",
          headers: { "X-API-Key": apiKey, "Content-Type": "application/json" },
          body: JSON.stringify({ name: name.trim() }),
        })
        if (!res.ok) return c.json({ error: `Kolbo API ${res.status}` }, 502)
        const body = (await res.json()) as { project?: { id: string; name: string } }
        if (!body.project?.id) return c.json({ error: "Malformed upstream response" }, 502)
        _kolboProjectsCache = undefined // next list must include the new project
        return c.json({ id: body.project.id, name: body.project.name, is_default: false, role: "owner", thumbnail: null })
      },
    )
    .get(
      "/kolbo-pricing",
      describeRoute({
        summary: "Get Kolbo model pricing",
        description:
          "Fetch per-model credit pricing (credits per 1M input/output tokens) for Kolbo models from kolbo-api. Used to compute per-session credit consumption client-side. Response is cached in-memory for 5 minutes — pricing rarely changes, but a server restart or 5-min TTL expiry triggers a fresh fetch from kolbo-api.",
        operationId: "global.kolbo-pricing",
        responses: {
          200: {
            description: "Map of model identifier to credit rates",
            content: {
              "application/json": {
                schema: resolver(
                  z.record(
                    z.string(),
                    z.object({
                      input: z.number(),
                      output: z.number(),
                    }),
                  ),
                ),
              },
            },
          },
          ...errors(401, 502),
        },
      }),
      async (c) => {
        const out = await getKolboModelMetadata()
        return c.json(out.pricing)
      },
    )
    .get(
      "/kolbo-model-metadata",
      describeRoute({
        summary: "Get Kolbo model pricing + avatar in one call",
        description:
          "Returns combined pricing (per-1M credits) and avatar URL per Kolbo model. Backed by the same 5-minute in-memory cache as /kolbo-pricing so the desktop UI can fetch both in a single request without hitting kolbo-api on every page load.",
        operationId: "global.kolbo-model-metadata",
        responses: {
          200: {
            description: "Pricing + avatar per model",
            content: {
              "application/json": {
                schema: resolver(
                  z.object({
                    pricing: z.record(
                      z.string(),
                      z.object({ input: z.number(), output: z.number() }),
                    ),
                    avatars: z.record(z.string(), z.string().nullable()),
                    names: z.record(z.string(), z.string()),
                  }),
                ),
              },
            },
          },
          ...errors(401, 502),
        },
      }),
      async (c) => {
        const out = await getKolboModelMetadata()
        return c.json(out)
      },
    )
    .get(
      "/kolbo-generation-models",
      describeRoute({
        summary: "List Kolbo generation models for a generation type",
        description:
          "Returns the generation models (id, friendly name, avatar) valid for a given generation type — text_to_img, image_editing, text_to_video, img_to_video, video_to_video, music_gen, text_to_speech, text_to_sound, elements, lipsync-*, 3d_*, etc. Backs the desktop approval-card model picker so the user only sees models valid for the tool being run. Proxies kolbo-api /v1/models?type= (same source as MCP list_models), cached per type.",
        operationId: "global.kolbo-generation-models",
        responses: {
          200: {
            description: "Generation models for the type",
            content: {
              "application/json": {
                schema: resolver(
                  z.object({
                    models: z.array(
                      z.object({ id: z.string(), name: z.string(), avatar: z.string().nullable() }),
                    ),
                  }),
                ),
              },
            },
          },
          ...errors(502),
        },
      }),
      async (c) => {
        const type = c.req.query("type") ?? ""
        if (!type) return c.json({ models: [] })
        const models = await getKolboGenerationModels(type)
        return c.json({ models })
      },
    )
    .get(
      "/kolbo-auth-context",
      describeRoute({
        summary: "Expose Kolbo API key + base URL to the TUI",
        description:
          "Returns the current user's Kolbo API key and the API base URL so the TUI can call kolbo-api directly from the process that owns the terminal, without going through the worker-fetch RPC bridge (which can't carry binary multipart bodies). Used by the file-attachment upload flow. Same-process exposure — TUI and server worker share a Bun runtime, so this is a memory-local hand-off, not a network disclosure.",
        operationId: "global.kolbo-auth-context",
        responses: {
          200: {
            description: "Authenticated — returns apiKey and apiBase",
            content: {
              "application/json": {
                schema: resolver(
                  z.object({
                    apiKey: z.string(),
                    apiBase: z.string(),
                  }),
                ),
              },
            },
          },
          ...errors(401),
        },
      }),
      async (c) => {
        const auth = (await Auth.get(Partner.authProviderID)) ?? (await Auth.get(Partner.authProviderIDLegacy))
        const apiKey =
          auth?.type === "api" ? auth.key : auth?.type === "oauth" ? auth.access : undefined
        if (!apiKey) {
          return c.json({ error: { message: "Not authenticated with Kolbo", type: "auth" } }, 401)
        }
        return c.json({ apiKey, apiBase: Partner.apiBase })
      },
    )
    .post(
      "/kolbo-files-upload",
      describeRoute({
        summary: "Proxy: upload a binary file to kolbo-api for multimodal chat",
        description:
          "Multipart form-data with a single 'file' field. Reads the user's Kolbo API key via the server-side auth store, forwards the upload to POST /kolbo/v1/files on kolbo-api with Bearer auth, and returns the upstream JSON response (file_id, url, mime_type, bytes, deduplicated, expires_at, etc.). Available for external clients and the TUI's external mode. Internal-mode TUI bypasses this route and uploads directly to kolbo-api via globalThis.fetch + /kolbo-auth-context, because the worker-RPC bridge that backs sdk.fetch corrupts multipart bodies.",
        operationId: "global.kolbo-files-upload",
        responses: {
          200: {
            description: "Upload succeeded — returns the upstream file metadata",
            content: {
              "application/json": {
                schema: resolver(
                  z.object({
                    id: z.string().optional(),
                    url: z.string(),
                    mime_type: z.string(),
                    filename: z.string().optional(),
                    bytes: z.number().optional(),
                  }),
                ),
              },
            },
          },
          ...errors(400, 401, 502),
        },
      }),
      async (c) => {
        const auth = (await Auth.get(Partner.authProviderID)) ?? (await Auth.get(Partner.authProviderIDLegacy))
        const apiKey =
          auth?.type === "api" ? auth.key : auth?.type === "oauth" ? auth.access : undefined
        if (!apiKey) {
          return c.json({ error: { message: "Not authenticated with Kolbo", type: "auth" } }, 401)
        }

        let incoming: FormData
        try {
          incoming = await c.req.formData()
        } catch (e) {
          return c.json(
            { error: { message: `Invalid multipart body: ${(e as Error).message}`, type: "bad_request" } },
            400,
          )
        }

        // FormData field values can be string | Blob. The TS lib we run
        // against doesn't expose `File` as an instanceof-friendly type, so
        // we narrow by shape.
        const rawFile = incoming.get("file")
        if (!rawFile || typeof rawFile === "string") {
          return c.json(
            { error: { message: "Missing 'file' field in multipart body", type: "bad_request" } },
            400,
          )
        }
        const file = rawFile as Blob & { name?: string }

        const outgoing = new FormData()
        const filename =
          (typeof file.name === "string" && file.name) ||
          (incoming.get("filename") as string | null) ||
          "upload.bin"
        outgoing.append("file", file, filename)

        try {
          const res = await fetch(`${Partner.apiBase}/kolbo/v1/files`, {
            method: "POST",
            headers: { Authorization: `Bearer ${apiKey}` },
            body: outgoing,
          })
          if (!res.ok) {
            const body = await res.text().catch(() => "")
            log.error("kolbo files upload upstream failed", { status: res.status, body: body.slice(0, 500) })
            return c.json(
              {
                error: {
                  message: `Upload rejected by kolbo-api (${res.status})`,
                  type: "upstream_error",
                },
              },
              502,
            )
          }
          const data = (await res.json()) as Record<string, unknown>
          return c.json(data)
        } catch (e) {
          log.error("kolbo files upload network error", { error: (e as Error).message })
          return c.json(
            { error: { message: `Upload failed: ${(e as Error).message}`, type: "network_error" } },
            502,
          )
        }
      },
    )
    .post(
      "/kolbo-files-upload-from-path",
      describeRoute({
        summary: "Proxy: read a local file by path and upload it to kolbo-api",
        description:
          "Accepts { path } JSON, reads the file from the local filesystem (server-side), and forwards it to POST /kolbo/v1/files on kolbo-api. Used by the desktop client when the native file picker returns paths instead of File objects.",
        operationId: "global.kolbo-files-upload-from-path",
        responses: {
          200: {
            description: "Upload succeeded",
            content: {
              "application/json": {
                schema: resolver(z.object({ url: z.string(), mime_type: z.string().optional() })),
              },
            },
          },
          ...errors(400, 401, 502),
        },
      }),
      async (c) => {
        const auth = (await Auth.get(Partner.authProviderID)) ?? (await Auth.get(Partner.authProviderIDLegacy))
        const apiKey =
          auth?.type === "api" ? auth.key : auth?.type === "oauth" ? auth.access : undefined
        if (!apiKey) {
          return c.json({ error: { message: "Not authenticated with Kolbo", type: "auth" } }, 401)
        }

        let body: { path?: string }
        try {
          body = await c.req.json()
        } catch {
          return c.json({ error: { message: "Invalid JSON body", type: "bad_request" } }, 400)
        }

        const filePath = typeof body.path === "string" ? body.path.trim() : ""
        if (!filePath) {
          return c.json({ error: { message: "Missing 'path' field", type: "bad_request" } }, 400)
        }

        let fileBlob: Blob
        let filename: string
        try {
          const bunFile = Bun.file(filePath)
          fileBlob = await bunFile.arrayBuffer().then((buf) => new Blob([buf], { type: bunFile.type || "application/octet-stream" }))
          filename = filePath.split(/[\\/]/).pop() || "upload.bin"
        } catch (e) {
          return c.json({ error: { message: `Cannot read file: ${(e as Error).message}`, type: "bad_request" } }, 400)
        }

        const outgoing = new FormData()
        outgoing.append("file", fileBlob, filename)

        try {
          const res = await fetch(`${Partner.apiBase}/kolbo/v1/files`, {
            method: "POST",
            headers: { Authorization: `Bearer ${apiKey}` },
            body: outgoing,
          })
          if (!res.ok) {
            const body = await res.text().catch(() => "")
            return c.json({ error: { message: `Upload rejected by kolbo-api (${res.status})`, type: "upstream_error" } }, 502)
          }
          const data = (await res.json()) as Record<string, unknown>
          return c.json(data)
        } catch (e) {
          return c.json({ error: { message: `Upload failed: ${(e as Error).message}`, type: "network_error" } }, 502)
        }
      },
    )
    .post(
      "/kolbo-artifact-publish",
      describeRoute({
        summary: "Proxy: publish an HTML artifact to kolbo-api and get a shareable URL",
        description:
          "Accepts { title, content, type? } and forwards to POST /artifact/quick-share on kolbo-api with the user's stored Bearer auth. Returns the shareable site URL the user can hand out. Powers the desktop Artifact viewer's Publish button.",
        operationId: "global.kolbo-artifact-publish",
        responses: {
          200: {
            description: "Artifact published — returns shareableSlug + URLs",
            content: {
              "application/json": {
                schema: resolver(
                  z.object({
                    status: z.boolean(),
                    data: z.record(z.string(), z.unknown()),
                    duplicate: z.boolean().optional(),
                  }),
                ),
              },
            },
          },
          ...errors(400, 401, 502),
        },
      }),
      async (c) => {
        const auth = (await Auth.get(Partner.authProviderID)) ?? (await Auth.get(Partner.authProviderIDLegacy))
        const apiKey =
          auth?.type === "api" ? auth.key : auth?.type === "oauth" ? auth.access : undefined
        if (!apiKey) {
          return c.json({ error: { message: "Not authenticated with Kolbo", type: "auth" } }, 401)
        }

        let body: { title?: string; content?: string; type?: string; allowJs?: boolean }
        try {
          body = await c.req.json()
        } catch {
          return c.json({ error: { message: "Invalid JSON body", type: "bad_request" } }, 400)
        }
        if (!body.title || !body.content) {
          return c.json({ error: { message: "title and content are required", type: "bad_request" } }, 400)
        }

        try {
          // /artifact/* uses the generic auth middleware which reads the
          // Kolbo API key from X-API-Key (not Authorization: Bearer the way
          // /kolbo/v1/* routes do).
          const res = await fetch(`${Partner.apiBase}/artifact/quick-share`, {
            method: "POST",
            headers: {
              "X-API-Key": apiKey,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
          })
          const data = (await res.json().catch(() => ({}))) as any
          if (!res.ok) {
            return c.json(
              { error: { message: data?.message || `Publish rejected (${res.status})`, type: "upstream_error" } },
              502,
            )
          }
          // Compose env-correct public URL. The canonical sites.kolbo.ai
          // domain only resolves in production; for local/dev environments
          // we serve the artifact straight off the kolbo-api host via
          // /shared-artifact-raw/:shareToken (public, no auth, iframe-safe CSP).
          const shareToken = data?.data?.shareToken
          if (shareToken) {
            const isProd = /(^|\/\/)api\.kolbo\.ai/i.test(Partner.apiBase)
            const publicUrl = isProd
              ? data?.data?.siteUrl ||
                (data?.data?.shareableSlug ? `https://sites.kolbo.ai/${data.data.shareableSlug}` : `${Partner.apiBase}/shared-artifact-raw/${shareToken}`)
              : `${Partner.apiBase}/shared-artifact-raw/${shareToken}`
            data.data = { ...(data.data || {}), publicUrl }
          }
          return c.json(data as Record<string, unknown>)
        } catch (e) {
          return c.json({ error: { message: `Publish failed: ${(e as Error).message}`, type: "network_error" } }, 502)
        }
      },
    )
    // ── Media library proxies ────────────────────────────────────────────
    // Forward to kolbo-api's /v1/media* endpoints with the user's stored
    // Kolbo API key (X-API-Key auth — same convention as /kolbo-artifact-
    // publish). Drives the Canvas Library tab. Auth resolution mirrors
    // every other /kolbo-* route: OAuth `access` token is itself a
    // kolbo_live_* API key, so we forward it directly.
    .get("/kolbo-media", async (c) => {
      const auth = (await Auth.get(Partner.authProviderID)) ?? (await Auth.get(Partner.authProviderIDLegacy))
      const apiKey = auth?.type === "api" ? auth.key : auth?.type === "oauth" ? auth.access : undefined
      if (!apiKey) return c.json({ error: { message: "Not authenticated with Kolbo", type: "auth" } }, 401)
      const qs = c.req.url.split("?")[1] ?? ""
      try {
        const res = await fetch(`${Partner.apiBase}/v1/media${qs ? "?" + qs : ""}`, {
          headers: { "X-API-Key": apiKey, "User-Agent": Installation.USER_AGENT },
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) return c.json({ error: { message: (data as any)?.message || `upstream ${res.status}`, type: "upstream_error" } }, 502)
        return c.json(data as Record<string, unknown>)
      } catch (e) {
        return c.json({ error: { message: `media fetch failed: ${(e as Error).message}`, type: "network_error" } }, 502)
      }
    })
    .get("/kolbo-media-folders", async (c) => {
      const auth = (await Auth.get(Partner.authProviderID)) ?? (await Auth.get(Partner.authProviderIDLegacy))
      const apiKey = auth?.type === "api" ? auth.key : auth?.type === "oauth" ? auth.access : undefined
      if (!apiKey) return c.json({ error: { message: "Not authenticated with Kolbo", type: "auth" } }, 401)
      try {
        const res = await fetch(`${Partner.apiBase}/v1/media/folders`, {
          headers: { "X-API-Key": apiKey, "User-Agent": Installation.USER_AGENT },
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) return c.json({ error: { message: (data as any)?.message || `upstream ${res.status}`, type: "upstream_error" } }, 502)
        return c.json(data as Record<string, unknown>)
      } catch (e) {
        return c.json({ error: { message: `folders fetch failed: ${(e as Error).message}`, type: "network_error" } }, 502)
      }
    })
    .post("/kolbo-media/:id/favorite", async (c) => {
      const auth = (await Auth.get(Partner.authProviderID)) ?? (await Auth.get(Partner.authProviderIDLegacy))
      const apiKey = auth?.type === "api" ? auth.key : auth?.type === "oauth" ? auth.access : undefined
      if (!apiKey) return c.json({ error: { message: "Not authenticated with Kolbo", type: "auth" } }, 401)
      const id = c.req.param("id")
      try {
        const res = await fetch(`${Partner.apiBase}/v1/media/${encodeURIComponent(id)}/favorite`, {
          method: "POST",
          headers: { "X-API-Key": apiKey, "Content-Type": "application/json", "User-Agent": Installation.USER_AGENT },
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) return c.json({ error: { message: (data as any)?.message || `upstream ${res.status}`, type: "upstream_error" } }, 502)
        return c.json(data as Record<string, unknown>)
      } catch (e) {
        return c.json({ error: { message: `favorite failed: ${(e as Error).message}`, type: "network_error" } }, 502)
      }
    })
    // Soft-delete (move to trash). The actual endpoint is /media/files/:id —
    // NOT /v1/media/:id. /v1/media is the read API; /media/files is the
    // mutation endpoint that handles the soft-delete-to-trash flow.
    .delete("/kolbo-media/:id", async (c) => {
      const auth = (await Auth.get(Partner.authProviderID)) ?? (await Auth.get(Partner.authProviderIDLegacy))
      const apiKey = auth?.type === "api" ? auth.key : auth?.type === "oauth" ? auth.access : undefined
      if (!apiKey) return c.json({ error: { message: "Not authenticated with Kolbo", type: "auth" } }, 401)
      const id = c.req.param("id")
      try {
        const res = await fetch(`${Partner.apiBase}/media/files/${encodeURIComponent(id)}`, {
          method: "DELETE",
          headers: { "X-API-Key": apiKey, "User-Agent": Installation.USER_AGENT },
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) return c.json({ error: { message: (data as any)?.message || `upstream ${res.status}`, type: "upstream_error" } }, 502)
        return c.json(data as Record<string, unknown>)
      } catch (e) {
        return c.json({ error: { message: `delete failed: ${(e as Error).message}`, type: "network_error" } }, 502)
      }
    })
    // Bulk soft-delete — POST /media/files/bulk/delete with { fileIds: [...] }.
    .post("/kolbo-media/bulk/delete", async (c) => {
      const auth = (await Auth.get(Partner.authProviderID)) ?? (await Auth.get(Partner.authProviderIDLegacy))
      const apiKey = auth?.type === "api" ? auth.key : auth?.type === "oauth" ? auth.access : undefined
      if (!apiKey) return c.json({ error: { message: "Not authenticated with Kolbo", type: "auth" } }, 401)
      let body: any
      try { body = await c.req.json() } catch { return c.json({ error: { message: "invalid json", type: "bad_request" } }, 400) }
      try {
        const res = await fetch(`${Partner.apiBase}/media/files/bulk/delete`, {
          method: "POST",
          headers: { "X-API-Key": apiKey, "Content-Type": "application/json", "User-Agent": Installation.USER_AGENT },
          body: JSON.stringify(body ?? {}),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) return c.json({ error: { message: (data as any)?.message || `upstream ${res.status}`, type: "upstream_error" } }, 502)
        return c.json(data as Record<string, unknown>)
      } catch (e) {
        return c.json({ error: { message: `bulk delete failed: ${(e as Error).message}`, type: "network_error" } }, 502)
      }
    })
    .delete("/kolbo-media/:id/favorite", async (c) => {
      const auth = (await Auth.get(Partner.authProviderID)) ?? (await Auth.get(Partner.authProviderIDLegacy))
      const apiKey = auth?.type === "api" ? auth.key : auth?.type === "oauth" ? auth.access : undefined
      if (!apiKey) return c.json({ error: { message: "Not authenticated with Kolbo", type: "auth" } }, 401)
      const id = c.req.param("id")
      try {
        const res = await fetch(`${Partner.apiBase}/v1/media/${encodeURIComponent(id)}/favorite`, {
          method: "DELETE",
          headers: { "X-API-Key": apiKey, "User-Agent": Installation.USER_AGENT },
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) return c.json({ error: { message: (data as any)?.message || `upstream ${res.status}`, type: "upstream_error" } }, 502)
        return c.json(data as Record<string, unknown>)
      } catch (e) {
        return c.json({ error: { message: `unfavorite failed: ${(e as Error).message}`, type: "network_error" } }, 502)
      }
    })
    // Favorites use a dedicated endpoint (mirrors kolbo-map's behavior).
    // /v1/media?category=favorites returns items the user favorited but the
    // project_id filter interacts badly with cross-project favorites and the
    // sourceType=uploaded items have null project_id. Per kolbo-map's
    // favoritesApi.ts, the canonical query is GET /api/favorite-items.
    .post("/kolbo-favorite-toggle", async (c) => {
      const auth = (await Auth.get(Partner.authProviderID)) ?? (await Auth.get(Partner.authProviderIDLegacy))
      const apiKey = auth?.type === "api" ? auth.key : auth?.type === "oauth" ? auth.access : undefined
      if (!apiKey) return c.json({ error: { message: "Not authenticated with Kolbo", type: "auth" } }, 401)
      let body: unknown
      try { body = await c.req.json() } catch { return c.json({ error: { message: "invalid json", type: "bad_request" } }, 400) }
      try {
        const res = await fetch(`${Partner.apiBase}/favorite-items/toggle`, {
          method: "POST",
          headers: { "X-API-Key": apiKey, "Content-Type": "application/json", "User-Agent": Installation.USER_AGENT },
          body: JSON.stringify(body ?? {}),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) return c.json({ error: { message: (data as any)?.message || `upstream ${res.status}`, type: (data as any)?.error || "upstream_error" } }, (res.status === 404 ? 404 : 502) as 404 | 502)
        return c.json(data as Record<string, unknown>)
      } catch (e) {
        return c.json({ error: { message: `favorite toggle failed: ${(e as Error).message}`, type: "network_error" } }, 502)
      }
    })
    .post("/kolbo-favorite-status", async (c) => {
      const auth = (await Auth.get(Partner.authProviderID)) ?? (await Auth.get(Partner.authProviderIDLegacy))
      const apiKey = auth?.type === "api" ? auth.key : auth?.type === "oauth" ? auth.access : undefined
      if (!apiKey) return c.json({ error: { message: "Not authenticated with Kolbo", type: "auth" } }, 401)
      let body: unknown
      try { body = await c.req.json() } catch { return c.json({ error: { message: "invalid json", type: "bad_request" } }, 400) }
      try {
        const res = await fetch(`${Partner.apiBase}/favorite-items/check-status`, {
          method: "POST",
          headers: { "X-API-Key": apiKey, "Content-Type": "application/json", "User-Agent": Installation.USER_AGENT },
          body: JSON.stringify(body ?? {}),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) return c.json({ error: { message: (data as any)?.message || `upstream ${res.status}`, type: "upstream_error" } }, 502)
        return c.json(data as Record<string, unknown>)
      } catch (e) {
        return c.json({ error: { message: `favorite status failed: ${(e as Error).message}`, type: "network_error" } }, 502)
      }
    })
    .get("/kolbo-favorites", async (c) => {
      const auth = (await Auth.get(Partner.authProviderID)) ?? (await Auth.get(Partner.authProviderIDLegacy))
      const apiKey = auth?.type === "api" ? auth.key : auth?.type === "oauth" ? auth.access : undefined
      if (!apiKey) return c.json({ error: { message: "Not authenticated with Kolbo", type: "auth" } }, 401)
      const qs = c.req.url.split("?")[1] ?? ""
      try {
        const res = await fetch(`${Partner.apiBase}/favorite-items${qs ? "?" + qs : ""}`, {
          headers: { "X-API-Key": apiKey, "User-Agent": Installation.USER_AGENT },
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) return c.json({ error: { message: (data as any)?.message || `upstream ${res.status}`, type: "upstream_error" } }, 502)
        return c.json(data as Record<string, unknown>)
      } catch (e) {
        return c.json({ error: { message: `favorites fetch failed: ${(e as Error).message}`, type: "network_error" } }, 502)
      }
    })
    // Full model registry (avatars, identifier maps, etc.) — used by the
    // Canvas Library to show a per-cell model badge that mirrors kolbo-map.
    // Response shape: { data: Model[], lookups?: {...} } — pass through verbatim.
    .get("/kolbo-models", async (c) => {
      const auth = (await Auth.get(Partner.authProviderID)) ?? (await Auth.get(Partner.authProviderIDLegacy))
      const apiKey = auth?.type === "api" ? auth.key : auth?.type === "oauth" ? auth.access : undefined
      if (!apiKey) return c.json({ error: { message: "Not authenticated with Kolbo", type: "auth" } }, 401)
      const qs = c.req.url.split("?")[1] ?? ""
      try {
        const res = await fetch(`${Partner.apiBase}/models${qs ? "?" + qs : ""}`, {
          headers: { "X-API-Key": apiKey, "User-Agent": Installation.USER_AGENT },
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) return c.json({ error: { message: (data as any)?.message || `upstream ${res.status}`, type: "upstream_error" } }, 502)
        // Derive the public assets origin from apiBase ("https://kolbo.ai/api" → "https://kolbo.ai/assets")
        // so the client can resolve relative avatar paths the same way kolbo-map does
        // (utils/apiConfig.ts getAssetsBaseUrl()).
        const assetsBase = `${Partner.apiBase.replace(/\/api\/?$/, "").replace(/\/$/, "")}/assets`
        return c.json({ ...(data as Record<string, unknown>), assetsBase })
      } catch (e) {
        return c.json({ error: { message: `models fetch failed: ${(e as Error).message}`, type: "network_error" } }, 502)
      }
    })
    // Trash (deleted media, 30-day retention) — mirrors kolbo-map's trashApi.
    .get("/kolbo-trash", async (c) => {
      const auth = (await Auth.get(Partner.authProviderID)) ?? (await Auth.get(Partner.authProviderIDLegacy))
      const apiKey = auth?.type === "api" ? auth.key : auth?.type === "oauth" ? auth.access : undefined
      if (!apiKey) return c.json({ error: { message: "Not authenticated with Kolbo", type: "auth" } }, 401)
      const qs = c.req.url.split("?")[1] ?? ""
      try {
        const res = await fetch(`${Partner.apiBase}/media/db/trash${qs ? "?" + qs : ""}`, {
          headers: { "X-API-Key": apiKey, "User-Agent": Installation.USER_AGENT },
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) return c.json({ error: { message: (data as any)?.message || `upstream ${res.status}`, type: "upstream_error" } }, 502)
        return c.json(data as Record<string, unknown>)
      } catch (e) {
        return c.json({ error: { message: `trash fetch failed: ${(e as Error).message}`, type: "network_error" } }, 502)
      }
    })
    .post("/kolbo-media/:id/restore", async (c) => {
      const auth = (await Auth.get(Partner.authProviderID)) ?? (await Auth.get(Partner.authProviderIDLegacy))
      const apiKey = auth?.type === "api" ? auth.key : auth?.type === "oauth" ? auth.access : undefined
      if (!apiKey) return c.json({ error: { message: "Not authenticated with Kolbo", type: "auth" } }, 401)
      const id = c.req.param("id")
      try {
        const res = await fetch(`${Partner.apiBase}/media/db/${encodeURIComponent(id)}/restore`, {
          method: "POST",
          headers: { "X-API-Key": apiKey, "Content-Type": "application/json", "User-Agent": Installation.USER_AGENT },
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) return c.json({ error: { message: (data as any)?.message || `upstream ${res.status}`, type: "upstream_error" } }, 502)
        return c.json(data as Record<string, unknown>)
      } catch (e) {
        return c.json({ error: { message: `restore failed: ${(e as Error).message}`, type: "network_error" } }, 502)
      }
    })
    .get("/kolbo-projects", async (c) => {
      const auth = (await Auth.get(Partner.authProviderID)) ?? (await Auth.get(Partner.authProviderIDLegacy))
      const apiKey = auth?.type === "api" ? auth.key : auth?.type === "oauth" ? auth.access : undefined
      if (!apiKey) return c.json({ error: { message: "Not authenticated with Kolbo", type: "auth" } }, 401)
      try {
        const res = await fetch(`${Partner.apiBase}/project/lightweight`, {
          headers: { "X-API-Key": apiKey, "User-Agent": Installation.USER_AGENT },
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) return c.json({ error: { message: (data as any)?.message || `upstream ${res.status}`, type: "upstream_error" } }, 502)
        return c.json(data as Record<string, unknown>)
      } catch (e) {
        return c.json({ error: { message: `projects fetch failed: ${(e as Error).message}`, type: "network_error" } }, 502)
      }
    })
    // In-memory HTML preview store — keyed by random ID, auto-purged after 1 hour.
    // No describeRoute: kept as plain handlers so hono-openapi doesn't interfere with routing.
    .post("/html-preview", async (c) => {
      let body: { content?: string }
      try { body = await c.req.json() } catch { return c.json({ error: "invalid json" }, 400) }
      if (typeof body.content !== "string") return c.json({ error: "missing content" }, 400)
      const id = crypto.randomUUID()
      _htmlPreviewStore.set(id, body.content)
      setTimeout(() => _htmlPreviewStore.delete(id), 60 * 60 * 1000)
      return c.json({ id })
    })
    .get("/html-preview/:id", async (c) => {
      const id = c.req.param("id")
      const content = _htmlPreviewStore.get(id)
      if (!content) return c.json({ error: "not found" }, 404)
      return c.newResponse(content, 200, { "Content-Type": "text/html; charset=utf-8" })
    })
    // ── Published-site preview proxy ────────────────────────────────────────
    // Published Kolbo sites (sites.kolbo.ai) ship `frame-ancestors 'self'
    // https://*.kolbo.ai` + X-Frame-Options, so the app origin cannot iframe
    // them directly. Re-serving the body from the sidecar sheds the
    // header-delivered CSP; a <base> tag keeps any relative asset resolving
    // against the original origin. Allowlisted to published-site hosts only.
    .get("/site-preview", async (c) => {
      const remote = c.req.query("url")
      if (!remote) return c.json({ error: "missing url" }, 400)
      let parsed: URL
      try {
        parsed = new URL(remote)
      } catch {
        return c.json({ error: "invalid url" }, 400)
      }
      const allowed =
        (parsed.protocol === "https:" && parsed.hostname.toLowerCase() === "sites.kolbo.ai") ||
        // Dev/staging/partner backends publish under the configured API origin
        // (…/shared-artifact-raw/<token>) instead of sites.kolbo.ai.
        (partnerImageOrigins().has(parsed.origin) && parsed.pathname.includes("/shared-artifact-raw/"))
      if (!allowed) return c.json({ error: "host not allowed" }, 403)
      try {
        const res = await fetch(parsed.toString(), { signal: AbortSignal.timeout(15_000) })
        if (!res.ok) return c.json({ error: `upstream ${res.status}` }, 502)
        let html = await res.text()
        html = html.replace(/<head([^>]*)>/i, `<head$1><base href="${parsed.origin}${parsed.pathname}">`)
        return c.newResponse(html, 200, { "Content-Type": "text/html; charset=utf-8" })
      } catch {
        return c.json({ error: "fetch failed" }, 502)
      }
    })
    // ── Image proxy ─────────────────────────────────────────────────────────
    // Tauri's WebView2 can't reliably load https://api.kolbo.ai/assets/*.svg
    // (TLS handshake fails — surfaces in DevTools as ERR_SSL_PROTOCOL_ERROR).
    // We fetch the image server-side here using Bun's native HTTP stack,
    // which has zero issues with the same URL, and stream it back to the
    // webview. Allowlisted to kolbo's asset hosts only; everything else is
    // rejected so the route can't be abused as an open proxy. Responses are
    // cached in-memory for 6 hours to keep latency low — model avatars
    // basically never change.
    .get("/proxy-image", async (c) => {
      const remote = c.req.query("url")
      if (!remote) return c.json({ error: "missing url" }, 400)
      let parsed: URL
      try {
        parsed = new URL(remote)
      } catch {
        return c.json({ error: "invalid url" }, 400)
      }
      const host = parsed.hostname.toLowerCase()
      const allowedDomain =
        (host === "api.kolbo.ai" ||
          host === "kolbo.ai" ||
          host === "app.kolbo.ai" ||
          host === "media.kolbo.ai" ||
          host.endsWith(".kolbo.ai") ||
          // Model icons live on Kolbo's public DO Spaces CDN, not on a
          // kolbo.ai host (kolbo-api mirrors them there on every startup).
          // Without this, resolving a bare avatar filename to its real URL
          // just moved the failure: the proxy answered 403 and the chip still
          // fell back to a letter circle.
          host === "kolbo-general-media.fra1.cdn.digitaloceanspaces.com") &&
        parsed.protocol === "https:"

      // Also allow the backend this install is actually configured against.
      // The hardcoded list above only covers production kolbo.ai, so model
      // avatars silently 403'd on any dev/staging/custom-partner backend —
      // every row fell back to its initial. Matching on the full ORIGIN (scheme
      // + host + port) keeps this tight: it permits exactly the server the app
      // already talks to and sends its token to, not localhost in general.
      const allowedByPartner = partnerImageOrigins().has(parsed.origin)

      if (!allowedDomain && !allowedByPartner) return c.json({ error: "host not allowed" }, 403)

      const now = Date.now()
      const cached = _proxyImageCache.get(remote)
      if (cached && now - cached.at < PROXY_IMAGE_TTL_MS) {
        return imageResponse(cached.bytes, cached.contentType)
      }

      try {
        // Singleflight: collapse concurrent requests for the same URL into a
        // single upstream HTTPS call. Without this, the canvas-library view
        // can fire N parallel requests for the same provider avatar on first
        // paint and hit Cloudflare N times.
        let pending = _proxyImageInflight.get(remote)
        if (!pending) {
          pending = (async () => {
            const upstream = await fetch(remote, { headers: { Accept: "image/*" } })
            if (!upstream.ok) throw new Error(`upstream ${upstream.status}`)
            const contentType = upstream.headers.get("content-type") || "application/octet-stream"
            const bytes = new Uint8Array(await upstream.arrayBuffer())
            return { bytes, contentType }
          })()
          _proxyImageInflight.set(remote, pending)
          pending.finally(() => _proxyImageInflight.delete(remote))
        }
        const result = await pending
        // LRU-ish: cap entries by inserting at end and dropping the oldest
        // (Map preserves insertion order). 256 × ~30KB ≈ 8MB ceiling.
        if (_proxyImageCache.size >= PROXY_IMAGE_MAX_ENTRIES) {
          const oldest = _proxyImageCache.keys().next().value
          if (oldest !== undefined) _proxyImageCache.delete(oldest)
        }
        _proxyImageCache.set(remote, { at: now, bytes: result.bytes, contentType: result.contentType })
        return imageResponse(result.bytes, result.contentType)
      } catch (e) {
        return c.json({ error: `proxy fetch failed: ${(e as Error).message}` }, 502)
      }
    }),
)

/**
 * Origins of the backend this install is configured against (production
 * kolbo.ai, a whitelabel, or a local dev API via KOLBO_API_BASE). Computed once
 * — Partner is resolved at startup and cannot change while the process runs.
 */
const partnerImageOrigins = lazy(() => {
  const origins = new Set<string>()
  for (const base of [Partner.apiBase, Partner.appBase]) {
    try {
      origins.add(new URL(base).origin)
    } catch {
      // A malformed profile shouldn't take the proxy down — it just means no
      // extra origin is allowed beyond the kolbo.ai list.
    }
  }
  return origins
})

const _proxyImageCache = new Map<string, { at: number; bytes: Uint8Array; contentType: string }>()
const _proxyImageInflight = new Map<string, Promise<{ bytes: Uint8Array; contentType: string }>>()
const PROXY_IMAGE_TTL_MS = 6 * 60 * 60 * 1000
const PROXY_IMAGE_MAX_ENTRIES = 256

function imageResponse(bytes: Uint8Array, contentType: string): Response {
  // Pass the bytes through Response's BodyInit accepting path. TS narrows
  // BodyInit to exclude Uint8Array here even though the runtime accepts it,
  // so cast through unknown.
  return new Response(bytes as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=21600",
    },
  })
}
