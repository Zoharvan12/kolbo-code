import { createEffect, createMemo, createSignal, onMount } from "solid-js"

import { useGlobalSDK } from "@/context/global-sdk"
import { useServer } from "@/context/server"
import { useSync } from "@/context/sync"
import { useSessionLayout } from "@/pages/session/session-layout"
import { calcAgentCredits, type KolboPricing, type MediaSpend, type TokenMessage } from "./session-usage-math"

/**
 * The ONE place session credit usage is computed.
 *
 * There used to be three: the composer's bottom bar, the top-bar usage
 * tooltip, and the Context tab — each with its own copy of the token maths and
 * two of them tallying media spend client-side, which under-reports every time
 * a resolution multiplier applies (a 2K image costs 2 credits and showed as 1).
 * Media now comes from `kolbo-session-usage`, which proxies the same
 * `/credit-usage/by-caller-session` data kolbo-api bills from, so the
 * multipliers are already applied. Add a surface by calling this hook, never by
 * writing a second tally.
 */

// Module scope so every surface shares one fetch and one refresh, the same way
// dialog-select-model shares its pricing table.
const [pricing, setPricing] = createSignal<KolboPricing>({})
const [balance, setBalance] = createSignal<number | null>(null)
const [media, setMedia] = createSignal<MediaSpend | null>(null)
let pricingLoaded = false

export function useSessionUsage() {
  const globalSDK = useGlobalSDK()
  const server = useServer()
  const sync = useSync()
  const { params } = useSessionLayout()

  const refreshBalance = () => {
    globalSDK.client.global
      .kolboBalance()
      .then((res) => {
        if (res.data != null) setBalance((res.data as { available: number }).available)
      })
      .catch(() => {})
  }

  onMount(() => {
    if (!pricingLoaded) {
      pricingLoaded = true
      globalSDK.client.global
        .kolboPricing()
        .then((res) => {
          if (res.data) setPricing(res.data as KolboPricing)
        })
        .catch(() => {
          pricingLoaded = false
        })
    }
    refreshBalance()
  })

  // `caller_session_id` identifies the app install, not the chat, so scope the
  // query to this chat's start time or the number is a running total across
  // every chat since launch.
  const startedAt = createMemo(() => {
    const id = params.id
    if (!id) return undefined
    const session = sync.session.get?.(id) as { time?: { created?: number } } | undefined
    const created = session?.time?.created
    return typeof created === "number" ? new Date(created).toISOString() : undefined
  })

  const refreshMedia = async () => {
    const base = server.current?.http.url
    const start = startedAt()
    if (!base || !start) {
      setMedia(null)
      return
    }
    try {
      const res = await fetch(`${base}/global/kolbo-session-usage?startDate=${encodeURIComponent(start)}`, {
        headers: { Accept: "application/json" },
      })
      if (!res.ok) return
      const data = (await res.json()) as {
        total?: number
        by_tool?: Array<{ generation_type: string | null; amount: number; count: number }>
      }
      const total = data.total ?? 0
      if (total <= 0) {
        setMedia(null)
        return
      }
      setMedia({
        total,
        byType: (data.by_tool ?? [])
          .filter((row) => row.amount > 0)
          .map((row) => ({ type: row.generation_type ?? "other", amount: row.amount, count: row.count }))
          .sort((a, b) => b.amount - a.amount),
      })
    } catch {
      // Best effort — a transient failure keeps the previous figure rather
      // than blanking a number the user is reading.
    }
  }

  createEffect(() => {
    startedAt()
    void refreshMedia()
  })

  const messages = createMemo(() => {
    const id = params.id
    if (!id) return [] as TokenMessage[]
    return (sync.data.message[id] ?? []) as TokenMessage[]
  })

  return {
    agentCredits: createMemo(() => calcAgentCredits(messages(), pricing())),
    media,
    balance,
    /** Call when a generation finishes — both figures move together. */
    refresh: () => {
      refreshBalance()
      void refreshMedia()
    },
  }
}

export { calcAgentCredits }
export type { KolboPricing, MediaSpend }
