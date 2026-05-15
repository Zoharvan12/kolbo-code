import { test, expect } from "bun:test"
import fs from "node:fs"
import path from "node:path"
// @ts-ignore — Bun text-import attribute syntax
import KOLBO_SKILL_MD_BUNDLED from "../../skills/kolbo/SKILL.md" with { type: "text" }

// The `.kolbo/production.md` stub format lives in TWO places by design:
//
//   1. SKILL.md (canonical guidance the agent reads when the skill is loaded)
//   2. message-v2.ts's PRODUCTION_LOG_REMINDER (self-contained runtime nudge
//      appended after every kolbo_* generation tool call — must work without
//      SKILL.md being loaded into context)
//
// Both must teach the agent the SAME stub structure. If they drift, the
// agent gets conflicting instructions on the first generation in a new
// workspace ("the nudge said X, the skill says Y, which is the real shape?").
//
// This test asserts a small set of stable structural markers exists in both
// files. The markers were picked to be load-bearing — removing any of them
// changes how the stub renders to the user. If you're intentionally changing
// the stub shape, update the markers list AND both files in the same commit.

const MESSAGE_V2_PATH = path.join(__dirname, "..", "..", "src", "session", "message-v2.ts")
const messageV2Source = fs.readFileSync(MESSAGE_V2_PATH, "utf8")

// Locate the PRODUCTION_LOG_REMINDER constant body. We only assert markers
// inside that constant — not over the whole file — so unrelated edits to
// message-v2.ts can't accidentally satisfy the check.
function extractReminder(): string {
  const startMarker = "const PRODUCTION_LOG_REMINDER ="
  const startIdx = messageV2Source.indexOf(startMarker)
  if (startIdx === -1) {
    throw new Error("Could not find PRODUCTION_LOG_REMINDER in message-v2.ts — was it renamed?")
  }
  // The constant is a multi-line string concatenation that ends with
  // "</system-reminder>" — capture everything up to and including that token.
  const closeMarker = "</system-reminder>"
  const closeIdx = messageV2Source.indexOf(closeMarker, startIdx)
  if (closeIdx === -1) {
    throw new Error("Could not find </system-reminder> closing the PRODUCTION_LOG_REMINDER constant")
  }
  return messageV2Source.slice(startIdx, closeIdx + closeMarker.length)
}
const reminderBody = extractReminder()

// Sanity: reminder is non-trivial.
test("PRODUCTION_LOG_REMINDER is non-empty and well-formed", () => {
  expect(reminderBody.length).toBeGreaterThan(500)
  expect(reminderBody).toContain("<system-reminder>")
  expect(reminderBody).toContain("</system-reminder>")
})

// Markers that define the stub's STRUCTURE. Both the SKILL.md stub code
// block AND the message-v2 reminder's inlined stub must contain all of these.
// If you change the stub shape, update this list AND both files together.
const STUB_STRUCTURE_MARKERS = [
  // Header comment line — identifies the file's purpose to the user when
  // they hand-edit it.
  ".kolbo/production.md — agent-managed media artifact registry",
  // Top-level title.
  "# Production Log",
  // The Manus-pattern recency block — rewritten every turn.
  "## 🎯 Now",
  // Required fields inside the recency block.
  "**Brief:**",
  "**Now working on:**",
  "**Last updated:**",
  // Production heading template.
  "## Production:",
  // Default subsection headings (suggestions but they must match).
  "### Cast",
  "### Visual DNA",
  "### Scenes",
  "### Audio",
  "### Final",
] as const

test.each(STUB_STRUCTURE_MARKERS)(
  "SKILL.md stub contains structural marker: %s",
  (marker) => {
    expect(KOLBO_SKILL_MD_BUNDLED).toContain(marker)
  },
)

test.each(STUB_STRUCTURE_MARKERS)(
  "message-v2 PRODUCTION_LOG_REMINDER contains structural marker: %s",
  (marker) => {
    expect(reminderBody).toContain(marker)
  },
)

// Procedural rules the reminder must continue to enforce. SKILL.md teaches
// the same rules in its Production Log section; the reminder must restate
// them because it has to work without SKILL.md loaded into context.
const PROCEDURAL_RULES = [
  // Read-before-Edit gotcha (the Edit tool refuses to overwrite without a
  // prior Read in the same session).
  "Read",
  "Edit",
  // First-time creation uses Write.
  "Write",
  // Append-only body discipline.
  "append-only",
  // Supersede semantics (no deletion of artifact entries).
  "superseded",
  // generation_id must be persisted.
  "generation_id",
  // No URL echoing in chat replies.
  "Do NOT echo",
] as const

test.each(PROCEDURAL_RULES)(
  "PRODUCTION_LOG_REMINDER teaches procedural rule keyword: %s",
  (keyword) => {
    expect(reminderBody).toContain(keyword)
  },
)
