// One elapsed clock per session for the current busy run.
// Assistant messages and tool parts get replaced mid-generation (timeout →
// get_generation_status, a second assistant message, a one-tick part flicker).
// Using the latest message.created / tool.time.start makes "Working for" and
// the Session pending tile jump back to 0s. Keep the earliest mark and only
// drop the clock after the run has been idle for HOLD ms.

const HOLD = 2500

type Clock = { start: number; seen: number }
const clocks = new Map<string, Clock>()

export function runElapsed(id: string, live: boolean, mark?: number, now = Date.now()): number {
  const cur = clocks.get(id)
  if (!live) {
    if (!cur) return 0
    if (now - cur.seen > HOLD) {
      clocks.delete(id)
      return 0
    }
    return Math.max(0, now - cur.start)
  }
  const start = cur ? Math.min(cur.start, mark ?? cur.start) : (mark ?? now)
  clocks.set(id, { start, seen: now })
  return Math.max(0, now - start)
}

export function runStart(id: string, live: boolean, mark?: number, now = Date.now()): number {
  runElapsed(id, live, mark, now)
  return clocks.get(id)?.start ?? mark ?? now
}

/** Test-only. */
export function resetRunClocks() {
  clocks.clear()
}
