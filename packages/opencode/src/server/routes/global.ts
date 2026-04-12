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

const log = Log.create({ service: "server" })

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
        const auth = await Auth.get("kolbo")
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
          "Fetch per-model credit pricing (credits per 1M input/output tokens) for Kolbo models from kolbo-api. Used to compute per-session credit consumption client-side.",
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
        const base = Partner.apiBase
        try {
          // Public endpoint — no auth needed for model metadata.
          const res = await fetch(`${base}/kolbo/v1/models`)
          if (!res.ok) return c.json({})
          const data = (await res.json()) as {
            data?: Array<{
              id: string
              pricing?: {
                input_credits_per_million?: number
                output_credits_per_million?: number
              }
            }>
          }
          const out: Record<string, { input: number; output: number }> = {}
          for (const m of data.data ?? []) {
            const inRate = m.pricing?.input_credits_per_million
            const outRate = m.pricing?.output_credits_per_million
            if (typeof inRate === "number" && typeof outRate === "number") {
              out[m.id] = { input: inRate, output: outRate }
            }
          }
          return c.json(out)
        } catch {
          return c.json({})
        }
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
        const auth = await Auth.get("kolbo")
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
        const auth = await Auth.get("kolbo")
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
    ),
)
