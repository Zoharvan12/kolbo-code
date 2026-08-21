import { createSignal } from "solid-js"
import type { GenerationStatus } from "@opencode-ai/ui/context/platform-ops"

const POLL = 15_000
const MAX = 240

const [hits, setHits] = createSignal<Record<string, string[]>>({})
/** Generation ids that finished without media (failed / cancelled / empty). */
const [dead, setDead] = createSignal<Record<string, true>>({})
const live = new Set<string>()

export function found(id: string) {
  return hits()[id]
}

export function allFound() {
  return hits()
}

export function allDead() {
  return dead()
}

function markDead(id: string) {
  setDead((prev) => (prev[id] ? prev : { ...prev, [id]: true }))
}

export function watch(id: string, check: (id: string) => Promise<GenerationStatus | undefined>) {
  if (!id || live.has(id) || hits()[id] || dead()[id]) return
  live.add(id)
  void run(id, check)
}

async function run(id: string, check: (id: string) => Promise<GenerationStatus | undefined>) {
  for (let i = 0; i < MAX; i++) {
    const status = await check(id).catch(() => undefined)
    if (status?.state === "completed") {
      if (status.urls.length) {
        setHits((prev) => ({ ...prev, [id]: status.urls }))
      } else {
        // Completed with no media = failed attempt — hide the spinner.
        markDead(id)
      }
      live.delete(id)
      return
    }
    if (status?.state === "failed" || status?.state === "cancelled") {
      markDead(id)
      live.delete(id)
      return
    }
    await new Promise((ok) => setTimeout(ok, POLL))
  }
  // Gave up polling — don't leave a zombie spinner in Canvas.
  markDead(id)
  live.delete(id)
}
