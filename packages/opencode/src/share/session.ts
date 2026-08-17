import { Bus } from "@/bus"
import { makeRuntime } from "@/effect/run-service"
import { Session } from "@/session"
import { MessageV2 } from "@/session/message-v2"
import { SessionID } from "@/session/schema"
import { SyncEvent } from "@/sync"
import { fn } from "@/util/fn"
import { Effect, Layer, Scope, ServiceMap, Stream } from "effect"
import { Config } from "../config/config"
import { Flag } from "../flag/flag"
import { KolboShare } from "./kolbo-share"

export namespace SessionShare {
  export interface Interface {
    readonly create: (input?: Parameters<typeof Session.create>[0]) => Effect.Effect<Session.Info>
    readonly share: (sessionID: SessionID) => Effect.Effect<{ url: string }, unknown>
    readonly unshare: (sessionID: SessionID) => Effect.Effect<void, unknown>
  }

  export class Service extends ServiceMap.Service<Service, Interface>()("@opencode/SessionShare") {}

  export const layer = Layer.effect(
    Service,
    Effect.gen(function* () {
      const bus = yield* Bus.Service
      const cfg = yield* Config.Service
      const session = yield* Session.Service
      const scope = yield* Scope.Scope

      const share = Effect.fn("SessionShare.share")(function* (sessionID: SessionID) {
        const conf = yield* cfg.get()
        if (conf.share === "disabled") throw new Error("Sharing is disabled in configuration")
        const info = yield* session.get(sessionID)
        // MessageV2.stream yields newest-first; a transcript reads oldest-first.
        const messages = yield* Effect.sync(() => Array.from(MessageV2.stream(sessionID)).reverse())
        const result = yield* Effect.tryPromise(() =>
          KolboShare.publish(sessionID, info, messages as KolboShare.MessageWithParts[]),
        )
        yield* Effect.sync(() =>
          SyncEvent.run(Session.Event.Updated, { sessionID, info: { share: { url: result.url } } }),
        )
        return result
      })

      const unshare = Effect.fn("SessionShare.unshare")(function* (sessionID: SessionID) {
        yield* Effect.tryPromise(() => KolboShare.remove(sessionID))
        yield* Effect.sync(() => SyncEvent.run(Session.Event.Updated, { sessionID, info: { share: { url: null } } }))
      })

      // A published share is a snapshot of the transcript, so re-publish it whenever the
      // assistant finishes a turn. Coalesced per session: a burst of completions costs one
      // upload, and the public URL is stable so the link never changes underneath a reader.
      const queued = new Set<SessionID>()
      const refresh = Effect.fn("SessionShare.refresh")(function* (sessionID: SessionID) {
        if (queued.has(sessionID)) return
        if (!KolboShare.exists(sessionID)) return
        queued.add(sessionID)
        yield* Effect.suspend(() => {
          queued.delete(sessionID)
          return share(sessionID)
        }).pipe(Effect.delay("3 seconds"), Effect.ignore, Effect.forkIn(scope))
      })

      yield* bus.subscribe(MessageV2.Event.Updated).pipe(
        Stream.runForEach((evt) => {
          const info = evt.properties.info
          if (info.role !== "assistant" || !info.time.completed) return Effect.void
          return refresh(info.sessionID)
        }),
        Effect.ignore,
        Effect.forkIn(scope),
      )

      const create = Effect.fn("SessionShare.create")(function* (input?: Parameters<typeof Session.create>[0]) {
        const result = yield* session.create(input)
        if (result.parentID) return result
        const conf = yield* cfg.get()
        if (!(Flag.KOLBO_AUTO_SHARE || conf.share === "auto")) return result
        yield* share(result.id).pipe(Effect.ignore, Effect.forkIn(scope))
        return result
      })

      return Service.of({ create, share, unshare })
    }),
  )

  export const defaultLayer = layer.pipe(
    Layer.provide(Bus.layer),
    Layer.provide(Session.defaultLayer),
    Layer.provide(Config.defaultLayer),
  )

  const { runPromise } = makeRuntime(Service, defaultLayer)

  export const create = fn(Session.create.schema, (input) => runPromise((svc) => svc.create(input)))
  export const share = fn(SessionID.zod, (sessionID) => runPromise((svc) => svc.share(sessionID)))
  export const unshare = fn(SessionID.zod, (sessionID) => runPromise((svc) => svc.unshare(sessionID)))
}
