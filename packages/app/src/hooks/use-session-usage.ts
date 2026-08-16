import { createMemo, createSignal, onMount } from "solid-js"

import { useGlobalSDK } from "@/context/global-sdk"
import { useSync } from "@/context/sync"
import { useSessionLayout } from "@/pages/session/session-layout"
import { calcAgentCredits, type KolboPricing, type TokenMessage } from "./session-usage-math"

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
let pricingLoaded = false

export function useSessionUsage() {
  const globalSDK = useGlobalSDK()
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

  const messages = createMemo(() => {
    const id = params.id
    if (!id) return [] as TokenMessage[]
    return (sync.data.message[id] ?? []) as TokenMessage[]
  })

  return {
    agentCredits: createMemo(() => calcAgentCredits(messages(), pricing())),
    balance,
    /** Call when a generation finishes — the balance moves. */
    refresh: refreshBalance,
  }
}

export { calcAgentCredits }
export type { KolboPricing }
