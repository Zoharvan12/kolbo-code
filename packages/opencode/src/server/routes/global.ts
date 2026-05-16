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

// ── Kolbo model metadata cache ────────────────────────────────────────────
// /kolbo/v1/models is hit on every page load by the model picker. The data
// (pricing + avatars) changes rarely — a 5-minute TTL with single in-flight
// dedup is plenty for live edits during development and avoids hammering
// kolbo-api on every UI refresh.
type KolboModelMetadata = {
  pricing: Record<string, { input: number; output: number }>
  avatars: Record<string, string | null>
}
const KOLBO_MODELS_TTL_MS = 5 * 60 * 1000
let kolboModelCache: { at: number; data: KolboModelMetadata } | null = null
let kolboModelInflight: Promise<KolboModelMetadata> | null = null

async function fetchKolboModelMetadata(): Promise<KolboModelMetadata> {
  const base = Partner.apiBase
  const empty: KolboModelMetadata = { pricing: {}, avatars: {} }
  try {
    const res = await fetch(`${base}/kolbo/v1/models`)
    if (!res.ok) return empty
    const data = (await res.json()) as {
      data?: Array<{
        id: string
        avatar?: string | null
        pricing?: {
          input_credits_per_million?: number
          output_credits_per_million?: number
        }
      }>
    }
    const out: KolboModelMetadata = { pricing: {}, avatars: {} }
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
        try {
          const url = `${base}/credit-usage/by-caller-session?caller_session_id=${encodeURIComponent(callerSessionId)}`
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
    }),
)
