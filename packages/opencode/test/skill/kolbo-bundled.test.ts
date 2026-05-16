import { test, expect } from "bun:test"
// @ts-ignore — Bun text-import attribute syntax
import KOLBO_SKILL_MD_BUNDLED from "../../skills/kolbo/SKILL.md" with { type: "text" }

// These tests defend the kolbo SKILL.md against silent regressions:
//   1. The text-import mechanism in wire.ts pulling an empty string.
//   2. A future cleanup pass accidentally cutting a canonical section
//      (the simplify pass that produced these tests trimmed ~140 lines —
//      a future one without guardrails could trim a load-bearing rule).
// If a test fails, decide deliberately: restore the content, OR if the
// section was renamed/removed on purpose, update the marker here.

test("SKILL.md is bundled and non-empty", () => {
  expect(KOLBO_SKILL_MD_BUNDLED.length).toBeGreaterThan(10_000)
})

test("SKILL.md frontmatter is intact", () => {
  expect(KOLBO_SKILL_MD_BUNDLED.startsWith("---\nname: kolbo\n")).toBe(true)
})

const REQUIRED_SECTIONS = [
  // Tool routing
  "## ⚠️ If the user names a tool, USE THAT TOOL (HARD RULE)",
  "## ⚠️ Generate vs Edit",
  // Rate-limit + bulk-gen rules
  "### Rate Limiting & Batch Generation (CRITICAL)",
  "### ⚠️ Bulk Generation",
  // Production log protocol — referenced by message-v2.ts nudge
  "## ⚠️ Production Log — `.kolbo/production.md`",
  // Media analysis decision tree
  "## Video / Audio Analysis & Transcription",
  "### Decision tree",
  "### ⚠️ Batching Media in Chat Messages (CRITICAL)",
  // Reference / DNA tagging — recent addition, easy to lose
  "### Tagging references inside the prompt",
  "### ⚠️ @name Syntax",
  // Cost rules
  "### ⚠️ Quote real cost, never estimates",
  "## ⚠️ Resolution, Caps & Constraints",
  // Canonical field reference — added in the cap-validation pass
  "Canonical field reference",
]
test.each(REQUIRED_SECTIONS)("SKILL.md contains required section: %s", (heading) => {
  expect(KOLBO_SKILL_MD_BUNDLED).toContain(heading)
})

const REQUIRED_GUARDRAILS = [
  // 100MB upload cap for chat media analysis
  "100MB",
  // Dialogue-dense laziness warning
  "dialogue-dense",
  // 30-min transcription cap
  "30-minute hard cap",
  // @image positional tagging
  "@image1",
  "@image2",
  // Read-before-Edit production log rule
  "Read-before-Edit",
  // Don't re-fire on abort
  "still process server-side",
  // FAL upload constraints
  "2048×2048",
  // No URL echo
  // Bare-URL prohibition wording (matches both pre- and post-2026-05 phrasings).
  "generated URLs",
]
test.each(REQUIRED_GUARDRAILS)("SKILL.md retains guardrail keyword: %s", (keyword) => {
  expect(KOLBO_SKILL_MD_BUNDLED).toContain(keyword)
})

const REQUIRED_TOOL_NAMES = [
  "generate_image",
  "generate_image_edit",
  "generate_video",
  "generate_video_from_image",
  "generate_video_from_video",
  "generate_elements",
  "generate_first_last_frame",
  "generate_lipsync",
  "generate_creative_director",
  "generate_music",
  "generate_speech",
  "generate_sound",
  "generate_3d",
  "create_visual_dna",
  "upload_media",
  "transcribe_audio",
  "chat_send_message",
  "check_credits",
  "list_models",
  "get_generation_status",
  "get_media",
  "delete_media",
  "restore_media",
  "permanently_delete_media",
  "bulk_delete_media",
  "bulk_move_media",
  "get_media_stats",
  "favorite_media",
  "list_media_folders",
  "share_media_folder",
]
test.each(REQUIRED_TOOL_NAMES)("SKILL.md documents MCP tool: %s", (tool) => {
  expect(KOLBO_SKILL_MD_BUNDLED).toContain(tool)
})
