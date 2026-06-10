---
version: 0.4.0
name: kolbo
description: |
  Generate, edit, or analyze creative media via the Kolbo AI MCP server:
  images (GPT Image, Nano Banana, Flux), video (Seedance, Veo, Kling, Hailuo),
  music (Suno), TTS (ElevenLabs), 3D, transcription, Visual DNA (character
  consistency), Marketing Studio (UGC + DTC ads + product photoshoot +
  marketplace cards), Creative Director (multi-scene batches), HTML artifact
  publishing (presentations, landing pages, dashboards), and the App Builder.

  Use when the user wants to generate, create, make, edit, animate, or
  transcribe media: images, video, music, voice/TTS, sound effects, 3D models,
  UGC or TV-spot ads, product / lifestyle / hero shots, Amazon or marketplace
  listings, presentations, landing pages, dashboards, or 'build me an app';
  or to reuse a character or brand (Visual DNA, brand kits).

  NOT for: video editing / FFmpeg (use video-production), motion graphics
  (use remotion-best-practices), code editing, or general chat.
argument-hint: "[prompt-or-command] [--model <name>] [--image <path>] [--video <path>]"
allowed-tools: Bash, Read, Write, Edit
---

# Kolbo AI — Creative Generation, Analysis & Transcription

You have direct access to the Kolbo AI creative platform via MCP tools (auto-configured by `kolbo auth login`). Use them to generate and deliver real content — do NOT just describe what you would create.

> 🚫 **Don't dump generated URLs as bare text or markdown links in chat** — the UI already renders artifacts as a gallery tile + canvas. Refer by description ("the rainy scene"), store URLs in `.kolbo/production.md`. INLINE `![](url)` images ARE allowed for catalog-style replies (per-item thumbs in numbered lists).

This file is the **always-loaded core**: tool inventory + universal hard rules + routing index. For any model-specific prompt rules, Visual DNA workflow, production log format, marketing workflow, cost validation, etc., **Read the matching `references/` file from the index below**. Don't try to remember the rules — load the file when you need them.

## Step 0 — Bootstrap

Once per conversation, before any other Kolbo tool call:

1. **Run `check_credits`.** If it fails with "Session expired" / "Not authenticated", ask the user to run `kolbo auth login` (or their branded CLI command like `sapir auth login`) and reload the editor.
2. **If `list_models` returns empty**, MCP isn't wired — same fix.
3. Remember the credit balance for the session; don't re-check on every turn.

If the user is on a whitelabel build (`sapir`, etc.), they must use their branded command — not `kolbo`. See `references/workflows/troubleshooting.md`.

## Routing Index — Read These Files on Demand

| If the user wants to… | Read first |
|---|---|
| Generate a **Seedance 2** video | `references/models/seedance.md` |
| Generate a **GPT Image 2** image | `references/models/gpt-image.md` |
| Generate a **Nano Banana / Gemini** image | `references/models/nano-banana.md` |
| Generate a **Veo 3 / 3.1** video | `references/models/veo.md` |
| Build a **multi-scene set** (Creative Director, storyboard, campaign batch, 4+ angles) | `references/models/creative-director.md` |
| Generate **music** (Suno, song, lyrics, jingle, score) | `references/models/music.md` |
| Build an **HTML presentation / slide deck** | `references/models/html-presentation.md` |
| Build a **landing page / marketing site** | `references/models/landing-page.md` |
| Build a **dashboard / data viz / interactive widget / mini-game / UI mockup** | `references/models/visual-code.md` |
| Generate with **any other model** (Flux, Kling, Sora, Hailuo, ElevenLabs, DeepDub, …) — also covers universal prompt-engineering basics | `references/models/prompt-copilot.md` |
| Build a **UGC ad / TV spot / branded video / unboxing / product review / virtual try-on** | `references/workflows/marketing-studio.md` |
| Compose a **DTC ad image** (brand kit + ad format + avatar + product + reference media) | `references/workflows/dtc-ads.md` |
| Generate **brand product imagery** (studio shot, lifestyle, Pinterest pin, hero banner, carousel, ad pack, virtual try-on, conceptual, restyle) | `references/workflows/product-photoshoot.md` |
| Generate **marketplace listing cards** (Amazon main + secondary + A+ content) | `references/workflows/marketplace-cards.md` |
| Use **Visual DNA** / character consistency / `@name` syntax | `references/workflows/visual-dna.md` |
| Start or continue a **multi-step production** (storyboard → scenes → final cut) | `references/workflows/production-log.md` |
| **Transcribe** or **analyze** audio/video | `references/workflows/transcription.md` |
| **Scrape brand/product info** before generating + persist as `.kolbo/brand-kits/<slug>.md` | `references/workflows/research-first.md` |
| Browse, manage, or present existing **media library** items | `references/workflows/media-library.md` |
| Use the **App Builder** (React app generation) | `references/workflows/app-builder.md` |
| Confirm **cost** or validate **resolution / aspect / duration** against model caps | `references/workflows/cost-and-validation.md` |
| Hit an **auth / MCP / 429** issue | `references/workflows/troubleshooting.md` |

Each `references/models/*.md` mirrors the matching skill prompt in `kolbo-api/src/config/systemPrompt.js` — same battle-tuned rules that power Kolbo's web-app help widget. Keep parity (see `packages/opencode/CLAUDE.md` "MCP & Skill Sync Rule").

## Available MCP Tools

### Generation
| Tool | Description |
|------|-------------|
| `generate_image` | Single image from a text prompt. Supports Visual DNA, moodboards, reference images, web-search grounding. |
| `generate_image_edit` | Edit/transform an existing image. Pass `source_images` + edit prompt. |
| `generate_creative_director` | **2–8 related images or videos as one coherent set.** Use INSTEAD of multiple `generate_image` calls for any related multi-output. |
| `generate_video` | Text-to-video. Does **not** support Visual DNA — use `generate_elements` for character-consistent video. |
| `generate_video_from_image` | Animate a still. Prompt describes motion, not subject. |
| `generate_video_from_video` | Restyle/transform an existing video. Keeps original motion. |
| `generate_elements` | Reference-driven video. **Primary route for DNA → video.** |
| `generate_first_last_frame` | Keyframe interpolation between two frames. |
| `generate_lipsync` | Lipsync audio to an image or video face. |
| `generate_music` | Music generation (Suno + variants). |
| `generate_speech` | TTS. Use `list_voices` to pick a voice. |
| `generate_sound` | Sound effects. |
| `generate_3d` | 3D models from text / single image / multi-view. Returns GLB/FBX/OBJ/USDZ. |

### Discovery, Library, Visual DNA, Moodboards, Chat, App Builder, Publishing
| Tool | Purpose |
|------|---------|
| `list_models` / `list_voices` / `check_credits` / `get_generation_status` / `get_session_usage` | Discovery + status |
| `upload_media` / `list_media` / `get_media` / `get_media_stats` / `favorite_media` / `unfavorite_media` / `delete_media` / `restore_media` / `permanently_delete_media` / `move_media` / `bulk_*_media` / `*_media_folder` | Media library — see `workflows/media-library.md` |
| `create_visual_dna` / `list_visual_dnas` / `get_visual_dna` / `delete_visual_dna` | Visual DNA — see `workflows/visual-dna.md` |
| `list_moodboards` / `get_moodboard` / `list_presets` | Style overlays |
| `chat_send_message` / `chat_list_conversations` / `chat_get_messages` | Kolbo chat with optional `media_urls` (up to 10 per call) |
| `app_builder_*` (9 tools) | Full React app generation — see `workflows/app-builder.md` |
| `publish_html_artifact` | Publish HTML / SVG / Mermaid to `sites.kolbo.ai`. Server dedupes by content hash. Strict CSP. |

## ⚠️ If the User Names a Tool, USE THAT TOOL (HARD RULE)

A user-named tool — in any language — overrides every other rule. Recognized aliases:

| User said (any language) | Use exactly |
|---|---|
| "director", "creative director", **"במאי"**, "ad set", "campaign tool", "storyboard tool" | `generate_creative_director` |
| "image edit", "edit", "modify", "remove background", **"עריכת תמונה"** (paired with a per-image instruction) | `generate_image_edit` |
| "elements" / **"אלמנטים"** | `generate_elements` |
| "first/last frame" / **"פריימים"** | `generate_first_last_frame` |
| "lipsync" / **"ליפסינק"** | `generate_lipsync` |

**Mixed signals — named tool always wins.** "Image edit with the director tool to make 4 angles" → `generate_creative_director`.

## ⚠️ Generate vs Edit (when the user did NOT name a tool)

| User intent | Action | NOT this |
|-------------|--------|----------|
| "Create a video from scratch" | `generate_video` | — |
| "Edit / Cut / Trim / Add subtitles / Remove silence / Convert to 9:16" | Load `video-production` skill → FFmpeg | ❌ `generate_video` |
| "Create motion graphics / animated text / title sequence" | Load `remotion-best-practices` skill | ❌ `generate_video` |
| "Animate this image" | `generate_video_from_image` | — |
| "Restyle this video as anime" | `generate_video_from_video` | — |
| "Modify THIS one image" — change bg, remove object, recolor | `generate_image_edit` | ❌ Not for multi-output |
| "4 angles / poses / views of this character" / "variations of this character" | `generate_creative_director` with `visual_dna_ids` | ❌ Don't loop `generate_image_edit` |
| "4 variations of THIS exact image" (same prompt, different seeds) | `generate_image` with `num_images=4` | ❌ Not `generate_image_edit` |

## Core Workflow

1. **Check credits** ONCE per conversation (Step 0). Skip if already checked.
2. **Discover models** with `list_models` using a `type` filter — but **skip when the user names a specific model**.
3. **Pick the model**:
   - User named one → use it.
   - Auto-select → only from "Auto-selectable" section (models with a `summary`). Cheapest fit. Prefer `[RECOMMENDED]` when cost is similar.
   - Never auto-select from "Named-only" section.
4. **Validate inputs** against model caps — see `references/workflows/cost-and-validation.md`.
5. **How calls work**: each tool blocks until generation is fully complete. Images: seconds. Video: minutes. Multiple tool calls in one response run concurrently. If a call times out, use `get_generation_status` with the returned generation ID.
6. **Share the URL** after success. Never fabricate URLs.

Model types for `list_models`: `text_to_img`, `image_editing`, `text_to_video`, `img_to_video`, `draw_to_video`, `video_to_video`, `elements`, `firstlastgenerations`, `lipsync-image`, `lipsync-video`, `music_gen`, `text_to_speech`, `text_to_sound`, `stt`, `text`, `3d_text_to_model`, `3d_image_to_model`, `3d_multi_image_to_model`, `3d_world`.

## Cost Awareness — Quick Rules

Full tables + formulas in `references/workflows/cost-and-validation.md`. Quick rules:

- **Skip cost confirmation** when the user already specified model + count + duration, OR when a single generation costs < 5 credits.
- **Required cost confirmation** otherwise: one-line summary, suggest cheaper alternative if available, wait for confirm.
- **Batch totalling 100+ credits**: run `check_credits` first.
- **Quote real cost**: after firing, log `credits_used` (from the tool result) to `.kolbo/production.md` — never `base × count`.

## Rate Limiting & Batch Generation

- `generate_image`: 30/min. All other generation tools: 10/min per type. 300/min global. `upload_media`: 300/min, no credit cost.
- **⚠️ NEVER re-fire a generation you already called.** Aborted / timed-out calls still process server-side. Run `get_generation_status` before retrying.
- **Batch ≤10 items**: output ALL tool calls in one response — they run concurrently.
- **Bulk >10 items**: real-world ceilings — `generate_image` 8–10 in-flight, image-edit 5–8, video tools 3–5, `generate_video_from_video` 3, music/speech/sound 5–8. Fire one batch → wait → fire next. Persist every `generation_id` in `.kolbo/production.md`.
- **`upload_media` external URLs first.** `files`/`source_images`/`image_url` only accept Kolbo-hosted URLs reliably; external URLs cause `400`.

## ⚠️ Multi-output? Default to `generate_creative_director` (CRITICAL)

`generate_creative_director` is **an agent**, not a niche tool. Plans each scene internally, locks consistency, runs in parallel. For 2+ related outputs, it's almost always right.

**Tie-breaker:** about to fire ≥2 `generate_image` calls and the user did NOT dictate per-image prompts? Stop. Use `generate_creative_director`.

**Never loop `generate_image` sequentially.** Either Creative Director or one parallel batch.

**Parameter gotcha:** `num_images` (1–4, same prompt different seeds) on `generate_image` vs `scene_count` (1–8, distinct prompt per scene) on `generate_creative_director`. **Never pass `num_images` to Creative Director.**

## 🛑 Runaway-Loop Guard — ONE Generation per Requested Item (CRITICAL)

When the user asks for **one specific change**, the answer is **a single tool call**. After URLs return, **stop**. Surface and wait.

You are NOT allowed to:
- Fire the same tool 3+ times in a single turn unless the user explicitly asked for "N variations".
- Re-fire because you think the result might not be exactly what the user wanted.
- Auto-retry on success.
- Fire 5+ parallel `generate_video*` calls speculatively.

**Only re-fire when:** user explicitly asked for variations with a count, OR previous call returned `failure.retryable === true` (ONE retry), OR previous call returned `completed` but `urls.length === 0` (ONE retry).

## ⚠️ Editing an Existing Video → ONE Call, Not Frames-First (CRITICAL)

Existing video → modify → **single `generate_video_from_video` call** with source video URL + edit prompt.

**Use a TRUE video-to-video model.** Image-to-video models reject with `WRONG_MODEL_TYPE`. Valid: `wan/2-7-videoedit`, `happyhorse/video-edit`, `kling-video/o3-video-to-video`, or any model whose DB `type` includes `video_to_video` (use `list_models({ type: "video_to_video" })`).

**Do NOT** decompose into frames. **Do NOT** re-fire if the first call returned URLs.

## ⚠️ Character-Driven Video — Frames First, Then Animate (CRITICAL)

For any ad / story / scene-based video **created from scratch** featuring a Visual DNA character (NOT v2v edits):

1. **Generate the shot frames first** via `generate_creative_director` with `scene_count` + `visual_dna_ids` (image mode). DNA is strongest in image gen; user can approve cheaply.
2. **Confirm the frames** if >3 shots.
3. **Animate each frame** with `generate_video_from_image`, fired in parallel.

Skip frames-first only when the user says "go straight to video", single-shot quick experiments, or the user supplies approved frames. Full rules: `references/models/creative-director.md`.

## ⚠️ Detecting Failed Generations (CRITICAL)

A generation can fail three ways. Treat ALL as failure:

1. **Tool returns `error`** — explicit. Surface, suggest retry, log `generation_id`.
2. **Tool returns `completed` but `urls` is empty** — silent failure (NSFW filter, model OOM, upstream 5xx). Tell user "completed without an output — retrying" and re-fire ONCE. Do NOT log to `.kolbo/production.md`. Do NOT claim it worked.
3. **Tool hangs / never returns** — MCP poll timed out. Call `get_generation_status(generation_id)` IMMEDIATELY. The server might be done.

**Always:**
- Don't celebrate before reading the result. Verify `urls` is non-empty.
- Don't auto-retry without surfacing the failure. Partial batches: list failed items + reasons + successful count. Never "✅ all done!" on partials.
- Don't log failed items to `.kolbo/production.md`. Only successes.
- Surface the user's count. "6 of 8 ready", not "videos ready".

`failure` envelope structure + retry rules: `references/workflows/troubleshooting.md`.

## ⚠️ Generated URLs in Chat (CRITICAL)

Chat renders markdown natively. `![alt](url)` = inline image. `[label](url)` = labeled link with preview.

- **Catalog-style replies** (numbered lists of characters / scenes / products): embed `![alt](url)` so each item shows inline.
- **Conversational replies** ("4 shots ready"): keep prose short; canvas chip already shows gallery.

Avoid bare URL dumps and HTML `<table>` grids — canvas already provides a gallery.

**After `generate_creative_director` completes** — share results as individual URLs, one per scene. Do NOT create an HTML grid artifact.

**Always** record every URL in `.kolbo/production.md` — see `references/workflows/production-log.md`.

## Limitations & Safety

- **Real people**: never identify specific individuals in photos, even public figures. Describe visible attributes only.
- **NSFW**: Kolbo enforces content safety at the model level. If a generation fails on safety grounds, rephrase rather than retrying identically.
- **Copyright**: style references are fine ("in the style of Studio Ghibli"); verbatim reproduction is not.
- **No fabricated URLs**: only share URLs that actually came back from a tool call.

## Sharing HTML Artifacts

HTML/SVG/Mermaid artifacts have a **Share** button in the preview toolbar that uploads the artifact and copies a permanent public URL (no login required to view). Or call `publish_html_artifact({ title, content })` directly.

---

If at this point you still don't know which `references/` file to load, default to `references/models/prompt-copilot.md` for generation prompts or `references/workflows/cost-and-validation.md` for cost/validation questions, or just keep going with this core file's rules.
