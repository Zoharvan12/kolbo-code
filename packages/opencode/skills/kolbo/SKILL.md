---
version: 0.9.0
name: kolbo
description: |
  Generate, edit, analyze, and direct creative media through Kolbo AI: images,
  video (Seedance, Veo, Kling, Hailuo), music, speech, sound, 3D, transcription,
  Visual DNA, Creative Director batches, marketing assets, HTML artifacts, and
  AI Docs. Use for sophisticated AI filmmaking as well as individual media:
  scripts, production bibles, recurring characters and locations, acting,
  dialogue, music performance, blocking, physics, multi-shot continuity,
  connected scenes, prompt audits, and feature-length production planning.

  NOT for: video editing / FFmpeg (use video-production), motion graphics
  (use remotion-best-practices), code editing, or general chat.
argument-hint: "[prompt-or-command] [--model <name>] [--image <path>] [--video <path>]"
allowed-tools: Bash, Read, Write, Edit
---

# Kolbo AI — Creative Generation, Analysis & Transcription

You have direct access to the Kolbo AI creative platform via MCP tools (auto-configured by `kolbo auth login`). Use them to generate and deliver real content — do NOT just describe what you would create.

> 🚫 **Don't dump generated URLs as bare text or markdown links in chat** — the UI already renders artifacts as a gallery tile + canvas. Refer by description ("the rainy scene"), store URLs in `.kolbo/production.md`. INLINE `![](url)` images ARE allowed for catalog-style replies (per-item thumbs in numbered lists).

This file is the **always-loaded core**: tool inventory + universal hard rules + routing index. For any model-specific prompt rules, Visual DNA workflow, production log format, marketing workflow, cost validation, etc., **Read the matching `references/` file from the index below**. Don't try to remember the rules — load the file when you need them.

Users never see the bundled prompting skills. If you skip them, they get a lazy one-line prompt. **Loading is mandatory, not optional flavor.**

## Step 0 — Bootstrap

Once per conversation, before any other Kolbo tool call:

1. **Run `check_credits`.** If it fails with "Session expired" / "Not authenticated", ask the user to run `kolbo auth login` (or their branded CLI command like `sapir auth login`) and reload the editor.
2. **If `list_models` returns empty**, MCP isn't wired — same fix.
3. Use the balance ONLY for the low-balance check at this moment. **Never quote a "credits remaining" number later in the session** — coding/chat usage also deducts credits, so any remembered or computed balance is stale. Report only what each generation cost (`credits_used`); if the user asks what's left, run `check_credits` fresh right then.

If the user is on a whitelabel build (`sapir`, etc.), they must use their branded command — not `kolbo`. See `references/workflows/troubleshooting.md`.

## 🎬 Confirm the Creative Brief BEFORE Generating (CRITICAL — read first)

Never fire a paid generation the moment the user says "make X". First **present the brief back as a confirmation the user can change** — this is the single most important interaction. It gives the user control over what gets created and what it costs, instead of silently spending credits on defaults.

**Before ANY paid image / video / music / speech / 3D generation**, unless the user has *explicitly* dictated every key parameter in this message, ask ONE labeled question (the UI renders it as an options card) confirming:

- **Model** — your recommended pick as the default option, plus 1–2 alternatives (with their credit cost).
- **Aspect ratio** — e.g. `1:1 / 9:16 / 16:9` (offer the sensible default first).
- **Count** — how many (1 / 4 / …).
- **Resolution / quality / duration** — where the model supports it.
- **Creative direction** — style / mood / scene, when the user was vague ("4 cats" → offer style options: photoreal / illustrated / cinematic / surprise-me).
- **Credit cost** — state the total (`✦ N credits`) right in the question so cost is never a surprise.

Then generate **only** with the confirmed parameters. If the user changes an option, use the change. This mirrors the approval-card flow: propose → let them adjust → confirm → generate.

**Only skip the brief confirmation when** the user's message already pins model + aspect + count + creative direction (e.g. "generate 4 photoreal tabby cats, 1:1, z-image/turbo") — then just state the cost one-liner and fire. A low credit cost is **not** a reason to skip: cheap ≠ no-confirmation. What matters is whether the user actually chose the parameters.

For multi-scene / batch work this pairs with `generate_creative_director` (see below) — still confirm the brief first.

## Routing Index — Read These Files on Demand

| If the user wants to… | Read first |
|---|---|
| Make a **film / ad / scene / episode / campaign / any video with multiple or recurring characters** — read BEFORE planning a single shot | `references/workflows/production-planning.md` |
| Direct, develop, audit, or continue a **film / episode / connected scene / complex performance** with continuity, acting, dialogue, music, blocking, or physics | `references/workflows/filmmaking.md` |
| Generate a **Seedance 2.5** video | `skill` `elements-prompting` + `references/models/seedance25.md` + Locked Intro in `references/models/seedance.md`. For narrative/continuity also load `references/workflows/filmmaking.md` — but compile the prompt as Locked Intro, NOT the SCENE CONTEXT / OPTICS / ACTION pack |
| Generate a **Seedance 2 / WAN / MiniMax H3 / Gemini / Elements** video (`generate_elements` or Visual DNA) | `skill` `elements-prompting` + `references/models/seedance.md` — same Locked Intro. Elements is NOT a different prompt language |
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
| Write a **complex multi-element still**, an **edit that must not drift** (identity / product / scene lock), or a **reusable prompt template** | `references/workflows/prompt-structure.md` |
| Make anything look **shot on a phone** — UGC, selfie, candid, "authentic", a product photo that must not look like an ad (image OR video) | `references/workflows/ugc-smartphone.md` |
| Make a **YouTube / Shorts / Reels thumbnail** or video cover | `references/workflows/thumbnails.md` |
| Compose a **DTC ad image** (brand kit + ad format + avatar + product + reference media) | `references/workflows/dtc-ads.md` |
| Generate **brand product imagery** (studio shot, lifestyle, Pinterest pin, hero banner, carousel, ad pack, virtual try-on, conceptual, restyle) | `references/workflows/product-photoshoot.md` |
| Generate **marketplace listing cards** (Amazon main + secondary + A+ content) | `references/workflows/marketplace-cards.md` |
| Use **Visual DNA** / character consistency / `@name` syntax | `references/workflows/visual-dna.md` |
| Start or continue a **multi-step production** (storyboard → scenes → final cut) | `references/workflows/production-log.md` |
| **Transcribe** or **analyze** audio/video | `references/workflows/transcription.md` |
| **Split a soundtrack into layers** — remove/isolate speech, strip narration, instrumental bed, stems for dubbing | `references/workflows/audio-stems.md` |
| **Scrape brand/product info** before generating + persist as `.kolbo/brand-kits/<slug>.md` | `references/workflows/research-first.md` |
| Browse, manage, or present existing **media library** items | `references/workflows/media-library.md` |
| Confirm **cost** or validate **resolution / aspect / duration** against model caps | `references/workflows/cost-and-validation.md` |
| Hit an **auth / MCP / 429** issue | `references/workflows/troubleshooting.md` |

Each `references/models/*.md` mirrors the matching skill prompt in `kolbo-api/src/config/systemPrompt.js` — same battle-tuned rules that power Kolbo's web-app help widget. Keep parity (see `packages/opencode/CLAUDE.md` "MCP & Skill Sync Rule").

## Available MCP Tools

### Generation
| Tool | Description |
|------|-------------|
| `generate_image` | Single image from a text prompt. Supports Visual DNA, moodboards, image presets (custom instructions live here), reference images, web-search grounding. Named sheets/styles: `list_presets({ type: "image", search: "headless" })` then `preset_id`. |
| `generate_image_edit` | Edit/transform an existing image. Pass `source_images` + edit prompt. Image-editing presets are supported through `preset_id` from `list_presets({ type: "image_edit" })`. |
| `generate_creative_director` | **2–8 related images or videos as one coherent set.** Use INSTEAD of multiple `generate_image` calls for any related multi-output. |
| `generate_video` | Text-to-video. Accepts `visual_dna_ids` and `sound_enabled`; `generate_elements` is still the primary reference-driven route for a DNA-anchored film. |
| `generate_video_from_image` | Animate a still. Prompt describes motion, not subject. |
| `generate_video_from_video` | Restyle/transform an existing video. Keeps original motion. |
| `generate_elements` | Reference-driven video. **Primary route for DNA → video.** Prompt = Seedance Locked Intro (`Total` + `[GLOBAL LOOK]` / `[CAST]` / `[LOCATION]` + `SHOT N`). Every DNA in `visual_dna_ids` must also be `@Name` in that prompt. |
| `generate_first_last_frame` | Keyframe interpolation between two frames. |
| `generate_lipsync` | Lipsync an existing waveform onto a face. **Not the route for dialogue in a film you are generating** — write the line in the Seedance prompt instead. |
| `generate_music` | Music generation (Suno + variants). |
| `generate_speech` | TTS for narration, voiceover and standalone audio. **NOT for scene dialogue** — Seedance 2/2.5 performs quoted lines itself. |
| `generate_sound` | Sound effects. |
| `generate_3d` | 3D models from text / single image / multi-view. Returns GLB/FBX/OBJ/USDZ. |
| `separate_audio_stems` | Split a soundtrack into Dialogue / Music / Effects / without-dialogue (M&E). The route for removing or isolating speech, instrumental beds, and stems for dubbing. 5cr, inline. See `workflows/audio-stems.md`. |
| `clean_dialogue_leftovers` | Strip voices still faintly audible in an M&E layer. 17cr — only when the user reports the leak, it trades fidelity. |
| `separate_ambience` | Pull room tone out of the Effects bed as its own lane. 17cr. |

### Discovery, Library, Visual DNA, Moodboards, Chat, Publishing
| Tool | Purpose |
|------|---------|
| `list_models` / `list_voices` / `check_credits` / `get_generation_status` / `cancel_generation` / `get_session_usage` | Discovery + status. `list_models` with no args returns the recommended shortlist out of ~428 — pass `type` for a full category with per-model caps. `cancel_generation` stops an in-flight job and refunds what it can: use it when the user changes their mind mid-generation instead of letting it run. |
| `upload_media` / `create_upload_ticket` / `list_media` / `get_media` / `get_media_stats` / `favorite_media` / `unfavorite_media` / `delete_media` / `restore_media` / `permanently_delete_media` / `move_media` / `bulk_*_media` / `*_media_folder` | Media library — see `workflows/media-library.md`. Getting a LOCAL file in depends on where the server runs: `upload_media` with a path only works on a local (stdio) install; over a remote connector use `create_upload_ticket` and POST the file yourself. |
| `create_visual_dna` / `generate_character_sheet` / `list_visual_dnas` / `get_visual_dna` / `delete_visual_dna` / `*_visual_dna_folder` (5 folder tools) | Visual DNA (+ character sheet, character folders) — see `workflows/visual-dna.md` |
| `list_moodboards` / `get_moodboard` / `list_presets` | Style overlays + sheet presets. Always pass `search` when you know the name — that is a silent id lookup, not a catalog to show. Never omit `preset_id` after claiming a preset was used. |
| `list_color_palettes` / `analyze_color_palette` / `create_color_palette` / `update_color_palette` / `delete_color_palette` / `activate_color_palette` / `deactivate_color_palette` | **Color DNA — sticky and account-wide.** At most one palette is active at a time; while it is, it strict-grades **every** image and video generation automatically, with no per-call argument. `analyze_color_palette` pulls colors out of 1-5 image URLs for free and does NOT save. `create_color_palette` defaults `is_active: true`, which activates it and deactivates any other. Per-generation opt-out: `skip_color_palette: true` on `generate_image` / `generate_image_edit` / `generate_video` / `generate_video_from_image`. |
| `list_agents` / `create_agent` / `update_agent` / `delete_agent` | Custom chat agents — reusable named personas for `chat_send_message`. The agent's `description` IS the system instruction. Resolve a name the user mentions ("use my SEO agent") to an id with `list_agents`, then pass `agent_id`. Global/preset agents are read-only; only the user's own can be updated or deleted. |
| `search_stock_media` / `get_stock_sources` / `get_stock_categories` / `get_stock_collections` / `get_stock_asset` / `analyze_script_for_stock` / `import_stock_asset` | Stock library (free, no credits) — EXISTING photos / videos / 3D / SFX / music. For stock **music** use `search_stock_media` with `mediaType: "music"` (semantic vibe query, e.g. "uplifting corporate background") → `get_stock_asset` for downloads. The older `*_music_library` tools are deprecated adapters over this — prefer the stock tools, except for the licensed-catalog tools in the next row. |
| `search_music_library` / `browse_music_library` / `get_music_library_facets` / `get_music_track_audio` / `get_music_track_lyrics` / `get_music_track_related` / `analyze_script_for_music` / `acquire_clean_music_track` / `import_music_track_to_library` | **SYNCI licensed music** — a commercially licensed catalog, not free stock. Discovery and previews are free but **watermarked**; there is no unwatermarked URL until you pay. `acquire_clean_music_track` (or `import_music_track_to_library`, which also copies it to the media library) **CHARGES CREDITS** for the clean master — confirm with the user first, and pass a stable `requestId` so a retry doesn't buy it twice. `analyze_script_for_music` turns a script into search terms for `search_music_library`. Use this family when the user needs music cleared for commercial use; use `search_stock_media` with `mediaType: "music"` when free stock will do. |
| `list_projects` / `move_session` | Projects: resolve a project NAME → the `project_id` you pass on generation/upload/doc calls; `move_session` relocates a whole session + its media when work landed in the wrong project. See "Projects — Where Work Lands" below. |
| `create_project` / `update_project` / `archive_project` / `unarchive_project` / `list_sessions` / `rename_session` / `delete_session` / `restore_session` | Project lifecycle + session inventory. `list_sessions` returns `project_id` + `types[]` on every row. Soft-delete leftover empty sessions after a move; `restore_session` undoes trash. Create a project when the user starts new work, then pass its id on EVERY call. |
| `bulk_move_sessions` / `list_session_generations` / `move_generations_to_session` / `split_session` / `undo_session_organization` | Reorganize many sessions or generations. `list_session_generations` is an inventory (not a live generation card). |
| `add_project_context` / `list_project_context` / `delete_project_context` / `get_project_profile` / `regenerate_project_profile` | Project knowledge base (RAG): feed scripts/URLs/notes; `get_project_profile` = the living brief — read it to ground work in the project |
| `create_moodboard` / `update_moodboard` / `delete_moodboard` | Moodboards from image URLs → AI master style prompt → pass `moodboard_id` to generation tools |
| `clone_voice` / `import_elevenlabs_voice` / `delete_voice` | Custom voices (clone CHARGES CREDITS — confirm first; new voices show in `list_voices`) |
| `trim_video` | Frame-accurate trim of a Kolbo-hosted video (tool waits and returns the URL). `edit_video` also gained `remove_background`. |
| `create_doc` / `list_docs` / `get_doc` / `update_doc` / `share_doc` / `delete_doc` | AI Docs (Magic Pad): YOU author full HTML documents (plans, briefs, scripts, research) saved into the user's project, editable in the Kolbo app. `share_doc` returns a public link. `update_doc` content replaces the WHOLE doc — `get_doc` first. |
| `chat_send_message` / `chat_list_conversations` / `chat_get_messages` | Kolbo chat with optional `media_urls` (up to 10 per call) |
| `publish_html_artifact` | Publish HTML / SVG / Mermaid to `sites.kolbo.ai`. Server dedupes by content hash. Strict CSP. |

## ⚠️ Visual DNA `@Name` in the prompt (HARD RULE — always on)

Passing `visual_dna_ids` is **not enough**. For every DNA in that array you MUST also write `@ExactStoredName` in the prompt text (the `name` from `list_visual_dnas` / `create_visual_dna`). The engine binds identity by parsing `@tags`. No `@tag` → the DNA is wasted.

- Right: `visual_dna_ids: ["vdna_…"]` + prompt `@Zohar walks into frame`
- Wrong: `Zohar's`, `Zohar`, `the left man`, `the man on the LEFT`, `Visual DNA anchors: the man on the LEFT…` — none of these bind
- Never invent a role label or possessive as a substitute for `@Name`
- Same rule for moodboards: `#ExactBoardName`

**Rewrite / compile never drops a tag.** If the user, a prior prompt, or `list_visual_dnas` already has `@gal_suit` / `@yonatan` / `#Board`, the Locked Intro you write MUST still contain those exact tokens in CAST **and** in every shot they appear in. Do not "clean" them into first names, `@Image 1 (Lee)`, "the singer", or a SCENE CONTEXT / ACTIVE REFERENCES block with no `@`. A compile that loses a tag is a failed turn — put the tags back before calling `generate_*`.

Before `generate_elements` / any DNA video: for each id in `visual_dna_ids`, confirm the prompt string includes `@` + that DNA's stored `name`. Missing even one → fix the prompt, do not fire.

Resolve names with `list_visual_dnas` first. Full binding rules: `references/workflows/visual-dna.md`.

## ⚠️ `enhance_prompt` — leave it OFF (HARD RULE)

**Never pass `enhance_prompt: true` unless the user asked for it in words.** It is
not a quality knob you turn on to be helpful — it sends the prompt to a rewriter
first, so the model renders *different words than the ones the user wrote*.

- The user says "make it more cinematic" → that is a request to change **your**
  prompt. Write the better prompt yourself. It is NOT permission to enhance.
- Only "enhance the prompt" / "improve my prompt" / "expand this prompt" is.
- Passing it silently is the worst case: the card shows an `enhanced` chip the
  user never asked for, and their own wording never reached the model.
- The default is `false` in every generation tool. Leave the argument out.

## ⚠️ Assets Before Shots (HARD RULE)

For any film / ad / scene / episode / campaign the order is **Map → Create → Confirm → Shoot** (the directing guide — load `references/workflows/production-planning.md` + `filmmaking.md` before creating anything). Crack the concept first. Then every character, location, and prop becomes a Visual DNA **from a sheet** (`list_presets` search → `generate_image` with that `preset_id` → `create_visual_dna`). Do **not** register a DNA from a single portrait and skip the sheet. Publish the session plan (`Cast` / `Locations` / `Scene NN — slug`). Get a GATE lock on the asset set. **Only then** video. A shot against an unapproved cast is waste.

Scene dialogue is **never** `generate_speech` or `generate_lipsync`. Seedance 2 / 2.5 performs quoted lines written into the shot beat itself — English only. Full flow: `references/workflows/production-planning.md`.

## ⚠️ Load the matching skill BEFORE generating (HARD RULE)

Do **not** call `generate_*` / `generate_elements` / `generate_image_edit` until you have loaded the matching skill **in this turn** (the `skill` tool for bundled skills, and/or Read of the `references/` file). "I already know this" is not a load. Users will never invoke these skills themselves.

| About to call / user intent | `skill` tool | Also Read |
|---|---|---|
| `generate_elements` **or** any video with Visual DNA **or** Seedance 2 / 2.5 / WAN / MiniMax H3 / Gemini video | `elements-prompting` | `references/models/seedance.md` (+ `seedance25.md` if 2.5) and `references/workflows/visual-dna.md` when DNA is in play |
| `generate_image` / `generate_image_edit` | `image-prompting-guide` | `references/models/gpt-image.md` / `nano-banana.md` / `prompt-copilot.md` as the model requires. Complex stills / identity lock: `references/workflows/prompt-structure.md` |
| `generate_video*` that is **not** Elements/DNA (Kling, Veo, Sora, Grok, Hailuo, generic t2v/i2v) | `video-prompting-guide` | matching `references/models/*.md` |
| `generate_music` | `music-prompting` | `references/models/music.md` |
| UGC / phone-shot / selfie / "authentic" / must-not-look-like-an-ad | — | `references/workflows/ugc-smartphone.md` |
| Marketing / TV spot / branded video / unboxing / product review | — | `references/workflows/marketing-studio.md` |
| DTC ad image | — | `references/workflows/dtc-ads.md` |
| Product photoshoot / hero / lifestyle / try-on | — | `references/workflows/product-photoshoot.md` |
| Thumbnail / cover | — | `references/workflows/thumbnails.md` |
| Marketplace listing cards | — | `references/workflows/marketplace-cards.md` |
| Film / episode / connected scene | — | `references/workflows/filmmaking.md` + `production-planning.md` |

## ⚠️ Seedance / Elements prompt contract (HARD RULE)

`generate_elements`, Seedance 2 / 2.5, WAN, MiniMax H3, Gemini, and any Visual DNA video share **one** compile shape — the Locked Intro in `references/models/seedance.md`. Load `elements-prompting` first (craft, `@Image N` mapping, eight elements), then compile:

`Total: Xs / N shots / AR` → `[GLOBAL LOOK – LOCKED, APPLIES TO EVERY SHOT]` → `[CAST – IDENTICAL IN EVERY SHOT]` (each person is `@DNAName`) → `[LOCATION]` → `SHOT N — 0:00–0:02 — …`

Write the beats at FULL DEPTH. The cap is 15,000 characters on Seedance 2.5 (10,000 on 2.0) — a 30s / 8+ shot compile should land around 4k–9k, and every beat carries its own camera move, a performance task for the speaker AND the listeners, prop/hand state, and the sound in that beat. A one-line shot beat is under-written; the structure alone is not the craft. Read `references/models/seedance25.md` before compiling.

Do **not** default Elements to `SCENE CONTEXT` / `OPTICS` / `ACTION` / `ACTIVE REFERENCES` department packs (those live in filmmaking audit/contracts for other models). `elements-prompting` is the craft skill (formerly `seedance-2-prompting`); Locked Intro is the compile shape.

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

**Preset contract:**
- Custom instructions live on the **preset**. Prefer `generate_image` + `preset_id` (not `generate_character_sheet`) for Character Sheet / Headless / Bible / location / product sheets.
- Always `list_presets({ type: "image", search: "<name>" })` — `headless`, `bible`, `character sheet`. That is a silent id lookup. Do **not** omit `search` (that dumps the whole catalog). Reuse the id after the first hit.
- Browse (no search) only when the user asked to see presets.
- Pass the exact returned `id` as `preset_id`. Never invent an id.

1. **Check credits** ONCE per conversation (Step 0). Skip if already checked.
2. **Load the matching skill** (HARD RULE above) — `skill` tool + Read the `references/` file. Do this before the first paid call in the turn.
3. **Discover models** with `list_models` using a `type` filter — but **skip when the user names a specific model** (this turn **or** earlier in the conversation / compaction `## Locked choices`).
4. **Pick the model**:
   - User named one → that name is a **family lock**, not a single catalog row. Use it. Identifiers resolve leniently — `"z-image"` / `"nano banana 2"` / `"grok imagine"` auto-resolve, including to the sibling for the tool you are calling (`grok-imagine-text-to-video` on `generate_video_from_image` becomes `grok-imagine-image-to-video`). `list_models` is still authoritative for constraints, caps, and pricing — not for swapping brands.
   - **Never cheapest-swap a named family.** After compaction, "animate those images" is still Grok if the user said Grok. Seedance / Kling / Veo are not a "best balance" substitute. If the named family has no variant for this modality, ASK — do not silently switch.
   - Auto-select → **only when no model was named on this task**. Then pick from "Auto-selectable" (models with a `summary`). Cheapest fit. Prefer `[RECOMMENDED]` when cost is similar.
   - Never auto-select from "Named-only" section.
5. **Validate inputs** against model caps — see `references/workflows/cost-and-validation.md`.
6. **How calls work**: each tool blocks until generation is fully complete. Images: seconds. Video: minutes. Multiple tool calls in one response run concurrently. On hosts with live widgets the tool instead returns `submitted` instantly — the card updates on its own; you only need `get_generation_status` when a follow-up step needs the output URLs.
7. **Checking status — NEVER poll in a loop**: `get_generation_status` takes `wait=true` (blocks server-side until done, ~3 min) and `generation_ids` (check MANY generations in ONE call — returns `all_done` + which are still running). One `wait=true` call replaces any polling loop. If it comes back with some still processing, call it ONCE more with `wait=true` and the remaining ids.
8. **Share the URL** after success. Never fabricate URLs.

Model types for `list_models`: `text_to_img`, `image_editing`, `text_to_video`, `img_to_video`, `draw_to_video`, `video_to_video`, `elements`, `firstlastgenerations`, `lipsync-image`, `lipsync-video`, `music_gen`, `text_to_speech`, `text_to_sound`, `stt`, `text`, `3d_text_to_model`, `3d_image_to_model`, `3d_multi_image_to_model`, `3d_world`.

## 📁 Projects — Where Work Lands (CRITICAL)

Everything in Kolbo — sessions, generations, media, docs — lives inside a PROJECT. Getting this wrong is the #1 user complaint ("my work went to the wrong project").

1. **User names a project** ("in my Acme project", "for the film") → call `list_projects` ONCE to resolve the name to an ObjectId, then pass that **same** id as `project_id` on **EVERY** subsequent `generate_*` / `upload_media` / `create_doc` / `chat_send_message` call in **this conversation**. There is no server-side sticky store — omitting it on any later call silently lands in the default "API Generations" bucket (`is_default: true`). Once resolved, treat that id as required for the rest of the conversation. Accounts often hold hundreds of projects, so pass `list_projects({ search: "acme" })` rather than listing everything; the list is paginated (50/page) and hides archived projects unless you pass `include_archived: true`.
2. **No project mentioned** → omit `project_id`; the default bucket is correct. Don't ask unless intent is ambiguous. If `list_sessions` already returned a `project_id` for the work you are continuing, keep passing that id.
3. **Work landed in the wrong project? MOVE it, never regenerate**: `move_session` relocates a whole session + all its media (works for any session type — the `session_id` from generation responses, chats, transcriptions); `move_media` / `bulk_move_media` / `move_folder_contents` relocate individual media items. Empty leftover sessions after a move: `delete_session` (soft-delete; `restore_session` undoes it). `rename_session` only changes the sidebar title.

## ⚠️ One session per plan bucket (HARD RULE)

Omitting `session_id` on a generate call creates a **new** Kolbo sidebar session. Do that only when the **plan** starts a new bucket — not per take, not per shot, not because you just called a tool.

Name buckets from the plan you already showed the user, then `rename_session` on first create:

| Bucket | What lives in it | Kind |
|---|---|---|
| `Cast` | every character sheet / character DNA | image |
| `Locations` | every environment | image |
| `Props` | hero products / vehicles (if any) | image |
| `Scene NN — <slug>` | that scene's video shots **and** retakes | video |

How to thread:

1. First generate of a bucket → omit `session_id`, read it from the result, immediately `rename_session` to the plan name (`Cast`, `Locations`, `Scene 03 — rooftop chase`).
2. Every later generate in that bucket (more characters, another environment, shot 2, "make it darker", redo take 3) → pass that **same** `session_id`.
3. New scene or new concept → new session. Same scene / same cast pass → never a new session.
4. Image tools and video tools cannot share an id (server kinds differ). Cast/Locations stay image; scene clips stay video.

Write each session's `session_id` + plan name into `.kolbo/production.md` `### Sessions`. Do **not** mark the phase Approved or jump to the next bucket until the user confirms (or you asked a labeled GATE and they answered). Full rules: `references/workflows/production-planning.md` + `production-log.md`.

## Cost Awareness — Quick Rules

Full tables + formulas in `references/workflows/cost-and-validation.md`. Quick rules:

- **Skip the brief/cost confirmation ONLY** when the user's message already pins model + count + aspect + creative direction (see "Confirm the Creative Brief" above). Low cost alone is **not** a reason to skip — cheap generations still get the one labeled confirmation unless the user chose the parameters.
- **Otherwise confirm** via the labeled-question card: the parameters + the credit cost, suggest a cheaper alternative if one fits, wait for the user's pick. Never fire on defaults the user didn't choose.
- **Batch totalling 100+ credits**: run `check_credits` first.
- **Quote real cost**: after firing, log `credits_used` (from the tool result) to `.kolbo/production.md` — never `base × count`.
- **Video/lipsync `credit` is per-SECOND, not per-clip**: `total = credit × duration`. This is the universal rule for video/firstlast/elements/motion_graphic/cast types, not a per-model exception — `list_models` states it inline now. The one carve-out is a model with `flat_credit_by_resolution` set.
- **Never state "credits remaining" from arithmetic** (opening balance − generation costs). Coding/chat usage deducts credits too, so the math is always wrong. Report cost only; if the user asks for their balance, call `check_credits` fresh at that moment.

## Rate Limiting & Batch Generation

- `generate_image`: 30/min. All other generation tools: 10/min per type. 300/min global. `upload_media`: 300/min, no credit cost.
- **⚠️ NEVER re-fire a generation you already called.** Aborted / timed-out calls still process server-side. Run `get_generation_status` (with `wait=true`) before retrying.
- **Tracking a batch**: check ALL in-flight ids in ONE `get_generation_status` call with `generation_ids` + `wait=true`. Read `all_done` / `still_processing` from the response — do not check ids one by one, and never re-call without `wait`.
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

**Motion-control / animate-move models invert the inputs**: `reference_images[0]` = the CHARACTER IMAGE to animate, `source_video` = the driving/reference video whose motion is transferred. Omitting the character image returns a `MOTION_CONTROL_INPUTS` error.

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
3. **Tool hangs / never returns** — MCP poll timed out. Call `get_generation_status(generation_id, wait=true)` IMMEDIATELY. The server might be done.

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

**Always** park every successful URL + `session_id` in `.kolbo/production.md` as a **candidate**. Promote to Approved and advance the plan only after the user confirms — see `references/workflows/production-log.md`.

## Limitations & Safety

- **Real people**: never identify specific individuals in photos, even public figures. Describe visible attributes only.
- **NSFW**: Kolbo enforces content safety at the model level. If a generation fails on safety grounds, rephrase rather than retrying identically.
- **Copyright**: style references are fine ("in the style of Studio Ghibli"); verbatim reproduction is not.
- **No fabricated URLs**: only share URLs that actually came back from a tool call.

## Sharing HTML Artifacts

HTML/SVG/Mermaid artifacts have a **Share** button in the preview toolbar that uploads the artifact and copies a permanent public URL (no login required to view). Or call `publish_html_artifact({ title, content })` directly.

---

If at this point you still don't know which `references/` file to load, default to `references/models/prompt-copilot.md` for generation prompts or `references/workflows/cost-and-validation.md` for cost/validation questions, or just keep going with this core file's rules.
