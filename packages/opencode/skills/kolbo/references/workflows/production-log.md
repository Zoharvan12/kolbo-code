# Production Log — `.kolbo/production.md`

Load this file when starting a multi-step production, or before any continuation of prior media work ("edit", "redo", "the same character", `@name` references, "scene N").

## Why It Exists

Every URL, id, and brief produced by a Kolbo MCP tool MUST be recorded in `.kolbo/production.md` in the user's workspace. This file — not chat history — is your source of truth for prior artifacts: URLs scattered across `tool_result` blobs are unreliable to re-scan and disappear entirely on context compaction.

## When to READ it

Read `.kolbo/production.md` **before** acting on any of these signals:
- "edit", "animate", "combine", "redo", "polish", "fix", "regenerate"
- "the same character / scene / image / video / sound", "that X", "scene N", "the rainy one", etc.
- `@name` references for Visual DNA
- Any continuation of prior media work ("now make scene 3")

If the file is missing and the user is referencing prior media, ask the user — do not guess from chat.

## When to WRITE to it

**Immediately after every successful generation tool call**, before your next tool call or your final reply. The runtime will inject a reminder after generation tool results — treat that as a hard rule, not a suggestion.

Tools that REQUIRE logging:
- `generate_image`, `generate_image_edit`, `edit_image`
- `generate_video`, `generate_video_from_image`, `generate_video_from_video`, `edit_video`
- `generate_elements`, `generate_first_last_frame`, `generate_lipsync`
- `generate_music`, `generate_sound`, `generate_speech`
- `generate_3d`, `generate_creative_director`
- `create_visual_dna`, `upload_media`

Tools that do NOT log: `list_*`, `get_*`, `check_credits`, `chat_*`, `transcribe_audio` (read-only / discovery).

## File creation — pick the right tool to avoid the "must Read first" error

`Edit` refuses to overwrite a file unless you've `Read` it first in the same session. Pick by file state:

| State | Tool |
|---|---|
| File **does not exist** (typical first turn) | `Write` with the full stub below |
| File **exists** | `Read` first, then `Edit` |
| Not sure | `Read` first; on ENOENT, fall back to `Write` |

Stub for first creation:

```md
<!-- .kolbo/production.md — agent-managed media artifact registry.
     User may hand-edit; agent must Read-before-Edit to reconcile. -->

# Production Log

## 🎯 Now

**Brief:** <paraphrase of user's overall goal in 1-3 sentences>
**Now working on:** <the immediate next step>
**Last updated:** <ISO date>

---

## Production: <name from user's request, slugified human label>

### Cast
### Visual DNA
### Scenes
### Audio
### Final
```

Subsections (`### Cast` etc.) are **suggested defaults**, not required. Adapt: a logo set has `### Logos`, an album has `### Tracks`, a 3D render has `### Models`. Leave empty subsections out of the file when you create entries.

## Entry shape

One bullet per artifact. Write the label **the way the user would reference it next time** ("the rainy one"), not the model's raw output.

```md
### Cast
- **Maya** — female, 30, urban photographer, leather jacket
  - portrait: https://...characters/maya.png  (nano-banana-2, 2026-05-13)
  - visual DNA: vdna_8f2c  (@maya)

### Scenes
1. **Coffee shop morning** — Maya at counter, soft light, wide shot
   - still: https://...scenes/01-coffee.png  (flux-2-pro, 2026-05-13)
   - video: (pending)
2. **Rainy street walk** — neon reflections, slow dolly
   - still: https://...scenes/02-rain.png  (flux-2-pro, 2026-05-13)
   - video: https://...videos/02-rain.mp4  (kling-2, 2026-05-13)
```

## Header rewrite rule (Manus pattern — IMPORTANT)

The `## 🎯 Now` block at the top of the file is **rewritten every turn** to keep the brief + current step near the model's recency window. Body sections (everything below the first `---`) are **append-only**.

When a user request supersedes a previous artifact (e.g., "redo scene 2 with more rain"), do not delete the old entry. Mark it `(superseded YYYY-MM-DD)` and place the new entry beneath:

```md
2. **Rainy street walk** — neon reflections, slow dolly
   - still: https://...scenes/02-rain.png (superseded 2026-05-13)
   - still: https://...scenes/02-rain-v2.png  (flux-2-pro, 2026-05-13)
   - video: https://...videos/02-rain-v2.mp4  (kling-2, 2026-05-13)
```

## Rules

1. **First touch `Write`, subsequent touches `Read` → `Edit`** (see "File creation" above). If `Edit` fails on exact-match, `Read` again — the user may have hand-edited.
2. **Plain English labels** — write what the user would call it.
3. **Append-only body.** Only the `## 🎯 Now` header is rewritten. Never delete artifact entries; mark them `(superseded)` instead.
4. **Do not log failures.** Only successful generations.
5. **Resolve user references via the log, not chat history.** If the user says "scene 3," use the URL the log says is scene 3, even if a later tool_result mentioned a different URL.
6. **One file per workspace.** Multiple concurrent productions go under separate `## Production: <name>` headings inside the same file.

## Bulk Generation Entry Shape

For batch runs (50-item UGC sets, etc.), persist every `generation_id` (even for failures) — required for `get_generation_status` recovery and cross-session dedupe.

```md
12. ✅ Asian F 24, bedroom, hype POV
    - generation_id: gen_8a2c…
    - url: https://…
    - model: seedance-2 · 720p · 10s · sound-on
    - generated: 2026-05-14T07:42Z
13. ❌ Latino M 31, gym
    - generation_id: gen_ff19…
    - error: 429 Too many generation requests
    - retry_after: 2026-05-14T07:43Z
```

## Always log the resolution / duration / sound choices

Production-log entries should include the resolution and (for video) duration + sound state alongside the URL, so the user can see what they paid for:

```md
- still: https://...01-coffee.png  (flux-2-pro · 1K, 2026-05-14)
- video: https://...02-rain.mp4   (kling-2 · 1080p · 5s · sound-off, 2026-05-14)
```

## Production Log vs TodoWrite

Use both — different jobs:

| | `.kolbo/production.md` | `TodoWrite` |
|---|---|---|
| Purpose | Durable artifact registry | Ephemeral step plan |
| Lifetime | Persists across sessions / compaction | Per turn / per request |
| Content | URLs, ids, briefs | "Do X, then Y, then Z" |
| Example | `still: https://...01-coffee.png` | `Generate visual DNA for Maya` |

## Real Cost Quoting

Every generation now returns `credits_used` (multiplier-adjusted total) and `credits_breakdown` (per-model attribution). **Log `credits_used` to `.kolbo/production.md`, not `base × count`.**

```json
{ "credits_used": 12, "credits_breakdown": [{ "model": "nano-banana-2", "base": 8, "final": 12, ... }], "urls": [...] }
```

When the user asks "how much did I spend?" → call `get_session_usage` for the real, multiplier-adjusted session total + per-tool + per-model breakdowns (same numbers as the desktop bottom-bar counter).
