import { expect, test } from "bun:test"
// @ts-ignore — Bun text-import attribute syntax
import core from "../../skills/kolbo/SKILL.md" with { type: "text" }
// @ts-ignore — Bun text-import attribute syntax
import cost from "../../skills/kolbo/references/workflows/cost-and-validation.md" with { type: "text" }
// @ts-ignore — Bun text-import attribute syntax
import dna from "../../skills/kolbo/references/workflows/visual-dna.md" with { type: "text" }
// @ts-ignore — Bun text-import attribute syntax
import film from "../../skills/kolbo/references/workflows/filmmaking.md" with { type: "text" }
// @ts-ignore — Bun text-import attribute syntax
import library from "../../skills/kolbo/references/workflows/media-library.md" with { type: "text" }
// @ts-ignore — Bun text-import attribute syntax
import log from "../../skills/kolbo/references/workflows/production-log.md" with { type: "text" }
// @ts-ignore — Bun text-import attribute syntax
import transcript from "../../skills/kolbo/references/workflows/transcription.md" with { type: "text" }
// @ts-ignore — Bun text-import attribute syntax
import continuity from "../../skills/kolbo/references/filmmaking/blocking-continuity.md" with { type: "text" }

const docs = [core, cost, dna, film, library, log, transcript, continuity].join("\n")

test("SKILL.md is bundled and non-empty", () => {
  expect(core.length).toBeGreaterThan(10_000)
})

test("SKILL.md frontmatter is intact", () => {
  expect(core).toMatch(/^---\n[\s\S]*?\nname: kolbo\n[\s\S]*?\n---\n/)
})

const ROUTES = [
  "references/workflows/filmmaking.md",
  "references/models/seedance25.md",
  "references/workflows/visual-dna.md",
  "references/workflows/production-log.md",
  "references/workflows/transcription.md",
  "references/workflows/cost-and-validation.md",
]
test.each(ROUTES)("SKILL.md routes to %s", (route) => {
  expect(core).toContain(route)
})

const GUARDRAILS = [
  "## ⚠️ If the User Names a Tool, USE THAT TOOL (HARD RULE)",
  "## Rate Limiting & Batch Generation",
  "## 🛑 Runaway-Loop Guard",
  "## ⚠️ @name Syntax",
  "## Reference Tagging",
  "Quote Real Cost, Never Estimates",
  "# Production Log",
  "# Transcription & Video/Audio Analysis",
  "## Decision Tree",
  "100MB",
  "dialogue-dense",
  "30-minute hard cap",
  "Read-before-Edit",
  "Default to the full approved prior video",
  "30,000 characters",
]
test.each(GUARDRAILS)("skill tree retains guardrail: %s", (guardrail) => {
  expect(docs).toContain(guardrail)
})

const TOOLS = [
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
  "delete_media",
  "restore_media",
  "permanently_delete_media",
  "bulk_delete_media",
  "list_media_folders",
  "share_media_folder",
]
test.each(TOOLS)("skill tree documents MCP tool: %s", (tool) => {
  expect(docs).toContain(tool)
})
