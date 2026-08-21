import { createSignal } from "solid-js"
import type { GenerationStatus } from "@opencode-ai/ui/context/platform-ops"

const POLL = 15_000
const MAX = 240

const [hits, setHits] = createSignal<Record<string, string[]>>({})
const live = new Set<string>()

export function found(id: string) {
  return hits()[id]
}

export function allFound() {
  return hits()
}

export function watch(id: string, check: (id: string) => Promise<GenerationStatus | undefined>) {
  if (!id || live.has(id) || hits()[id]) return
  live.add(id)
  void run(id, check)
}

async function run(id: string, check: (id: string) => Promise<GenerationStatus | undefined>) {
  for (let i = 0; i < MAX; i++) {
    const status = await check(id).catch(() => undefined)
    if (status?.state === "completed" && status.urls.length) {
      setHits((prev) => ({ ...prev, [id]: status.urls }))
      live.delete(id)
      return
    }
    if (status?.state === "failed" || status?.state === "cancelled") {
      live.delete(id)
      return
    }
    await new Promise((ok) => setTimeout(ok, POLL))
  }
  live.delete(id)
}
