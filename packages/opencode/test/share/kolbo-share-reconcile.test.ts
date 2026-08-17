import { NodeFileSystem } from "@effect/platform-node"
import { beforeEach, describe, expect } from "bun:test"
import { Effect, Layer } from "effect"

import * as CrossSpawnSpawner from "../../src/effect/cross-spawn-spawner"
import { Session } from "../../src/session"
import type { SessionID } from "../../src/session/schema"
import { SessionTable } from "../../src/session/session.sql"
import { KolboShare } from "../../src/share/kolbo-share"
import { SessionShareTable } from "../../src/share/share.sql"
import { Database, eq } from "../../src/storage/db"
import { resetDatabase } from "../fixture/db"
import { provideTmpdirInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

const it = testEffect(Layer.mergeAll(Session.defaultLayer, NodeFileSystem.layer, CrossSpawnSpawner.defaultLayer))

const shareUrl = (id: SessionID) =>
  Database.use((db) => db.select().from(SessionTable).where(eq(SessionTable.id, id)).get())?.share_url

const setShare = (sessionID: SessionID, url: string, row?: { id: string }) =>
  Database.use((db) => {
    db.update(SessionTable).set({ share_url: url }).where(eq(SessionTable.id, sessionID)).run()
    if (row) {
      db.insert(SessionShareTable).values({ session_id: sessionID, id: row.id, secret: "sec", url }).run()
    }
  })

beforeEach(async () => {
  await resetDatabase()
})

describe("KolboShare.reconcile", () => {
  it.live("drops a share link left behind by the retired backend", () =>
    provideTmpdirInstance(() =>
      Effect.gen(function* () {
        const session = yield* Session.Service.use((svc) => svc.create({ title: "legacy" }))
        // Legacy row: a bare share id, the shape ShareNext wrote before the move to Kolbo.
        setShare(session.id, "https://opncd.ai/s/abc123", { id: "shr_abc" })

        expect(KolboShare.reconcile()).toBe(1)
        expect(shareUrl(session.id)).toBeNull()
        expect(KolboShare.exists(session.id)).toBe(false)
      }),
    ),
  )

  it.live("keeps a live Kolbo share", () =>
    provideTmpdirInstance(() =>
      Effect.gen(function* () {
        const session = yield* Session.Service.use((svc) => svc.create({ title: "current" }))
        const url = "https://sites.kolbo.ai/current-tok"
        setShare(session.id, url, { id: "proj_1/art_1" })

        expect(KolboShare.reconcile()).toBe(0)
        expect(shareUrl(session.id)).toBe(url)
        expect(KolboShare.exists(session.id)).toBe(true)
      }),
    ),
  )

  it.live("leaves sessions that were never shared alone", () =>
    provideTmpdirInstance(() =>
      Effect.gen(function* () {
        const session = yield* Session.Service.use((svc) => svc.create({ title: "unshared" }))

        expect(KolboShare.reconcile()).toBe(0)
        expect(shareUrl(session.id)).toBeFalsy()
      }),
    ),
  )
})
