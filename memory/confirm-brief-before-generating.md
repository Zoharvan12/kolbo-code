---
name: confirm-brief-before-generating
description: Kolbo Code agent must confirm the creative brief (model/aspect/count/style + cost) via a labeled question BEFORE any paid generation — the marquee UX from Zohar's Higgsfield teardown videos
metadata:
  type: project
---

The single most important interaction Zohar wanted from his 2 Higgsfield "Supercomputer" teardown videos was the **approval/parameter step BEFORE generation**: nothing should spend credits until the user confirms what to generate with (model, aspect ratio, count, resolution, creative direction) and sees the cost. He can then change any parameter, then approve.

Kolbo's generation tools are MCP tools, which (unlike bash/edit) have NO permission gate in the opencode core (`packages/opencode/src/mcp/index.ts` `convertMcpTool.execute` calls the tool directly). So the redesigned approval *card* never appears for generations. The fix is agent-behavioral: SKILL.md (`packages/opencode/skills/kolbo/SKILL.md`, v0.5.0+) now MANDATES confirming the brief via the labeled-question card before any paid generation unless the user already pinned every parameter — cheap cost is NOT a reason to skip. This drives the existing `session-question-dock` options card.

The literal engine-gated per-tool approval overlay (with editable chips) would require threading the Permission service + session context into the MCP execute path — a larger, riskier change, not yet done.

**Why:** During the redesign I over-indexed on visual polish (tool icons, activity rail, spacing, working header) and under-weighted this core interaction — the agent kept firing generations on defaults with no confirmation, which Zohar immediately flagged.

**How to apply:** When implementing from a reference product/video, first identify the CORE INTERACTION (what the user is fundamentally trying to control), not just the surface styling. For Kolbo generations specifically: verify the agent confirms the brief + cost before spending credits. Related: [[template-demo-content-preferences]].
