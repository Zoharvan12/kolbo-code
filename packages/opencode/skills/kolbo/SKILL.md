---
name: kolbo
description: Generate, edit, or analyze creative media through Kolbo AI. Load this skill whenever the user asks to create, edit, prompt, or analyze images, videos, music, speech, sound effects, 3D models — or to transcribe audio/video, manage media, use Visual DNA for consistency, check credits, or browse models/presets/moodboards. It contains the MCP tool workflow and the prompt-engineering rules for each media type.
---

# Kolbo AI — Creative Generation, Analysis & Transcription

You have direct access to the Kolbo AI creative platform via MCP tools (auto-configured by `kolbo auth login`). Use them to generate and deliver real content — do NOT just describe what you would create.

> 🚫 **Never echo generated image/video/audio URLs in your reply text.** The UI already renders every artifact as a gallery tile; echoing creates a duplicate preview. Refer to results by description ("the rainy scene"); store URLs in `.kolbo/production.md`. Full rule + Do/Don't table: see "Don't re-list generated URLs in your final message" below.

## Available MCP Tools

### Generation

| Tool | Description |
|------|-------------|
| `generate_image` | Create a **single** image from a text prompt. Supports Visual DNA, moodboards, reference images, web-search grounding. |
| `generate_image_edit` | Edit/transform an existing image (background removal, color changes, compositing). Pass source images + edit prompt. |
| `generate_creative_director` | **Generate 2–8 related images or videos as one coherent set.** Use this INSTEAD of multiple `generate_image` calls whenever the user wants more than one related output (storyboards, ad campaigns, product sets, character sheets, scene variations). Handles style consistency and runs scenes in parallel internally. |
| `generate_video` | Create videos from text prompts. Supports reference images for style/composition guidance. Does **not** support Visual DNA — use `generate_elements` for character-consistent video. |
| `generate_video_from_image` | Animate a still image into video. Prompt describes the motion, not the subject. |
| `generate_video_from_video` | Restyle/transform an existing video (style transfer, scene restyling, subject swap). Keeps the original motion. |
| `generate_elements` | Generate video from reference assets (images/videos) + prompt. **Supports Visual DNA** for character-consistent video — this is the primary tool for animating characters/scenes with Visual DNA. |
| `generate_first_last_frame` | Generate video that morphs from a first frame to a last frame (keyframe interpolation). |
| `generate_lipsync` | Lipsync an audio track to a source image or video face. Accepts local files or URLs. |
| `generate_music` | Create music from descriptions. Supports instrumental, custom lyrics, style, vocal gender. |
| `generate_speech` | Convert text to speech (TTS). Default: ElevenLabs. Use `list_voices` to pick a voice. |
| `generate_sound` | Generate sound effects from descriptions (foley, ambient, impacts, UI sounds). |
| `generate_3d` | Generate 3D models from text, single image, or multi-view images. Returns GLB, FBX, OBJ, USDZ. |

### Transcription & Analysis

| Tool | Description |
|------|-------------|
| `transcribe_audio` | Transcribe audio or video into text + SRT subtitles + word-by-word SRT. Accepts local files or URLs. |

### Voice & Model Discovery

| Tool | Description |
|------|-------------|
| `list_models` | Browse available AI models filtered by type. |
| `list_voices` | List available TTS voices with filtering by provider, language, gender. |
| `check_credits` | Check remaining Kolbo credit balance. |
| `get_generation_status` | Poll status of an in-progress generation by ID (fallback for timeouts). |

### Media Library

| Tool | Description |
|------|-------------|
| `upload_media` | Upload ANY local file (or remote URL) to Kolbo CDN → returns a stable public URL. Use for feeding media to `chat_send_message`, hosting HTML, or any multi-tool workflow that re-uses the same file. |
| `list_media` | Browse the user's library — both uploaded files AND saved AI outputs. Filter by `project_id`, `folder_id`, `category` (ai / uploaded / edited / favorites / training-lab), `type`, `source_type`, `sort`; paginate; full-text `search`. Response items include `is_favorited`, `prompt`, `dimensions`, `duration`, `project_id`. |
| `get_media` | Fetch one item by id (full details + extended metadata). Use when the user references a specific past creation. |
| `get_media_stats` | Counts + storage usage: `{ total, images, videos, audio, total_size_bytes }`. Optional `project_id`. Use for "how many videos do I have?" / "what's my usage?" / sizing a bulk op. |
| `favorite_media` / `unfavorite_media` | Toggle favorite. Idempotent. Per-user (shared projects: your favorites ≠ teammates'). |
| `delete_media` | **Soft delete** → trash (30-day recovery). Owner only. This is the right call for "delete this". |
| `restore_media` | Restore from trash. Pair with `delete_media`. |
| `permanently_delete_media` | **HARD delete** — MongoDB + S3 + folders + source generation record. NOT REVERSIBLE. **Always confirm with the user before calling.** Never default here for "delete". |
| `move_media` | Move one item to a different project (caller must own the item + have access to the target project). |
| `bulk_delete_media` | Soft-delete up to 1000 ids. Items not owned by the user are silently skipped. |
| `bulk_restore_media` | Restore up to 1000 trashed ids. |
| `bulk_permanently_delete_media` | Hard-delete up to 1000 ids. **Always confirm with the user before calling.** |
| `bulk_move_media` | Move up to 1000 ids to another project. **Atomic** — if ANY id isn't owned by the caller, the whole op is rejected; do not retry partially. |
| `move_folder_contents` | Move every item in a folder to another project (owner-only on every item). |
| `list_media_folders` | List the user's folders (owned + shared). Folders span projects. |
| `create_media_folder` / `update_media_folder` / `delete_media_folder` | Folder lifecycle. Delete is owner-only and detaches items (items stay in the library); **confirm before delete**. |
| `add_media_to_folder` / `remove_media_from_folder` | Up to 500 ids per call. Idempotent on add. |
| `share_media_folder` | Share by email (resolved to user ids; emails not found come back in `not_found`). Owner only. Members can list/add/remove items but cannot delete or reshare the folder. |
| `unshare_media_folder` | Revoke one user's access. Takes `user_id` from the folder's `shared_with` array. |

### Visual DNA (Character/Style Consistency)

| Tool | Description |
|------|-------------|
| `create_visual_dna` | Create a Visual DNA profile from reference images/video/audio for character, style, product, or scene consistency. |
| `list_visual_dnas` | List your Visual DNA profiles (id, name, type, thumbnail). |
| `get_visual_dna` | Fetch full profile details including system_prompt and reference images. |
| `delete_visual_dna` | Delete a Visual DNA profile. |

### Moodboards & Presets

| Tool | Description |
|------|-------------|
| `list_moodboards` | List available moodboards (personal, system presets, org). |
| `get_moodboard` | Fetch a moodboard's master_prompt, style_guide, and images. |
| `list_presets` | Browse generation presets (image/video/music templates with bundled style direction). |

### Chat & Vision

| Tool | Description |
|------|-------------|
| `chat_send_message` | Send a message to Kolbo AI chat. Pass `media_urls` (array of public URLs) to analyze images, videos, or audio — Smart Select auto-routes to Gemini vision when media is detected. Omit `model` for automatic routing. Supports web search and deep think modes. |
| `chat_list_conversations` | List your SDK chat conversations. |
| `chat_get_messages` | Fetch messages in a conversation (with media URLs). |

### App Builder

| Tool | Description |
|------|-------------|
| `app_builder_list_projects` | List all Kolbo projects to find a `project_id` for App Builder. |
| `app_builder_create_session` | Create a new App Builder session inside a project. Returns `session_id`. |
| `app_builder_generate_app` | Generate a full React app from a text prompt. Fires build, polls until deployed, returns live URL. |
| `app_builder_edit_app` | Edit an existing app with a natural language instruction. Same fire-and-poll pattern. |
| `app_builder_get_build_status` | Check current build status manually (fallback after timeout). |
| `app_builder_get_session` | Get session details including GitHub repo URL and Supabase connection info for local dev. |
| `app_builder_list_sessions` | List all App Builder sessions in a project. |
| `app_builder_list_generations` | List all generations for a session (needed for `edit_app`). |
| `app_builder_delete_session` | Permanently delete a session and all resources. IRREVERSIBLE. |

### Artifact Publishing

| Tool | Description |
|------|-------------|
| `publish_html_artifact` | Publish a built HTML page (or SVG / Mermaid diagram) to `sites.kolbo.ai` and return a public shareable URL. Use when the user asks to share, publish, deploy, or "give me a link to" a built artifact. Pass `title` + `content` (the full HTML document). Server dedupes by content hash — re-publishing the same bytes returns the same URL. Page is served with strict CSP (`connect-src 'none'`, `form-action 'none'`) so it cannot exfiltrate data; CDN frameworks (Tailwind/Chart.js/Three.js/React) still load. Use this *instead of* dumping the HTML into chat or telling the user to open the local file. |

## ⚠️ If the user names a tool, USE THAT TOOL (HARD RULE)

A user-named tool — in any language — overrides every other rule on this page. Same precedence as a user-named model: no routing, no substitution.

Recognized aliases:

| User said (any language) | Use exactly this MCP tool |
|---|---|
| "director", "creative director", "director tool", **"במאי"**, **"כלי במאי"**, "director-tool", "ad set", "campaign tool", "storyboard tool" | `generate_creative_director` |
| "image edit", "edit", "modify", "remove background", **"עריכת תמונה"** (only when paired with a per-image instruction, not a multi-output one) | `generate_image_edit` |
| "elements" / **"אלמנטים"** | `generate_elements` |
| "first/last frame" / **"פריימים"** | `generate_first_last_frame` |
| "lipsync" / **"ליפסינק"** | `generate_lipsync` |

**Mixed signals — named tool always wins.** "*Image edit with the director tool to make 4 angles*" → `generate_creative_director` (the verb says "edit" but the named tool is "director"). Same rule applies in Hebrew/Arabic phrases that contain both an edit-verb and a tool name.

## ⚠️ Generate vs Edit — Know the Difference (only when the user did NOT name a tool)

| User intent | Action | NOT this |
|-------------|--------|----------|
| "Create a video from scratch" / "Generate a video of..." | `generate_video` (Kolbo MCP) | — |
| "Edit this video" / "Cut" / "Trim" / "Crop" / "Merge" / "Add subtitles" / "Remove silence" / "Speed up" / "Convert to 9:16" | Load `video-production` skill → FFmpeg | ❌ Do NOT call `generate_video` |
| "Create motion graphics" / "Animated text" / "Title sequence" | Load `remotion-best-practices` skill → Remotion | ❌ Do NOT call `generate_video` |
| "Animate this image" / "Make this photo move" | `generate_video_from_image` (Kolbo MCP) | — |
| "Restyle this video as anime" | `generate_video_from_video` (Kolbo MCP) | — |
| "Modify THIS one image" — change background, remove object, recolor, add text | `generate_image_edit` (Kolbo MCP) | ❌ Do NOT use for multi-output |
| **"4 angles / poses / views of this character"** / "Show her in 8 different scenes / outfits / moods / settings" / "Variations of this character" | `generate_creative_director` with `visual_dna_ids` (Kolbo MCP) | ❌ Do NOT call `generate_image_edit` repeatedly. The director tool produces N coherent scenes from one brief and keeps the character consistent. |
| "4 variations of THIS exact image" (same prompt, different seeds, no new direction) | `generate_image` with `num_images=4` | ❌ Do NOT use `generate_image_edit` |

## Core Workflow

1. **Check credits** ONCE per conversation with `check_credits`. Skip if you already checked earlier in this session.
2. **Discover models** with `list_models` using a `type` filter — but **skip this when the user names a specific model** (e.g. "seedance 2 fast"). Only call `list_models` when you need to discover or compare models.
3. **Pick the model**: Follow this priority order:
   - **User named a model** (e.g. "use Kling v2") → use that identifier directly, no questions asked.
   - **Auto-select** → only from the **"Auto-selectable"** section of `list_models` results (models with a `summary`). Pick the cheapest one whose summary fits the task. Prefer `[RECOMMENDED]` when cost is similar.
   - **Never auto-select** a model from the **"Named-only"** section (no summary) — you have no quality signal for it. Only use it if the user explicitly requested it by name.
4. **How generation calls work**: Each tool call blocks until the generation is fully complete (the MCP server polls the API internally). For images this is seconds; for video it can be minutes. If a call times out, use `get_generation_status` with the returned generation ID. When you output multiple tool calls in a single response, they run concurrently — so batch calls finish in the time of the slowest one, not the sum.
5. **Share the URL** — after a successful generation, hand the real URL back to the user. Never fabricate URLs.

**For batch operations** (generating multiple items at once), see the "Rate Limiting & Batch Generation" section below — it overrides the per-item steps above.

### Model Types (for `list_models`)

Use the DB type name directly. Legacy aliases (right column) still work but prefer DB names.

| DB Type | Legacy alias | Use for |
|---------|-------------|---------|
| `text_to_img` | `image` | Still-image generation |
| `image_editing` | `image_edit` | Image editing / transformation |
| `text_to_video` | `video` | Text-to-video |
| `img_to_video` | `video_from_image` | Image-to-video animation |
| `draw_to_video` | — | Draw-to-video (Hailuo, Seedance variants) |
| `video_to_video` | `video_from_video` | Video restyling / style transfer |
| `elements` | *(same)* | Reference-to-video — Visual DNA-driven video |
| `firstlastgenerations` | `first_last_frame` | Keyframe interpolation |
| `lipsync-image` | (part of `lipsync`) | Lipsync with image source face |
| `lipsync-video` | (part of `lipsync`) | Lipsync with video source face |
| `music_gen` | `music` | Music generation |
| `text_to_speech` | `speech` | Text-to-speech (TTS) |
| `text_to_sound` | `sound` | Sound effects |
| `stt` | `transcription` | Audio/video transcription |
| `text` | `chat` | Chat / AI language models |
| `3d_text_to_model` | (part of `three_d`) | 3D from text prompt |
| `3d_image_to_model` | (part of `three_d`) | 3D from single image |
| `3d_multi_image_to_model` | (part of `three_d`) | 3D from multiple images |
| `3d_world` | (part of `three_d`) | 3D world generation |

> **Note**: `lipsync` alias returns both `lipsync-image` + `lipsync-video`. `three_d` alias returns all four 3D types.

### Cost Awareness

Creative generations bill against the user's Kolbo credit balance. **Billing units differ by type** — always apply the correct formula before generating.

| Type | Billing unit | Credit range | Example |
|------|-------------|-------------|---------|
| **Image** | per image (flat) | 1–30 cr | Flux.1 Fast = 1 cr, Midjourney = 4 cr. If `resolution` is set, check the model's `resolutionMultipliers` from `list_models` — some families multiply cost significantly at higher tiers, others are flat. |
| **Image edit** | per image (flat) | 2–20 cr | |
| **Video** | **cr/s × duration** | 2–30 cr/s | Kandinsky 5 Fast × 5s = 10 cr; Seedance 2.0 × 10s = 300 cr. If `resolution` or native audio is set, check the model's `resolutionMultipliers` and `soundCreditMultiplier` from `list_models`. |
| **Video from image** | **cr/s × duration** | 4–30 cr/s | Same per-second rule as text-to-video. Same multiplier check. |
| **Elements (ref-to-video)** | **cr/s × duration** | 4–30 cr/s | Same per-second billing as video — check `credit` and multipliers in `list_models type="elements"`. |
| **Lipsync** | **cr/s × duration** | 5–20 cr/s | |
| **Music** | per generation (flat) | 15–60 cr | Suno v5 = 15 cr; ElevenLabs Music = 60 cr |
| **Speech (TTS)** | per 100 characters | 2–5 cr/100 chars | ElevenLabs (5) × 500 chars = 25 cr; Google (2) × 500 chars = 10 cr |
| **Sound effects** | per generation (flat) | 4–7 cr | |
| **3D model** | per model (flat) | 5–300 cr | Trellis = 5 cr; Meshy v6 = 150 cr; Marble 1.1 = 300 cr |
| **Transcription (stt)** | per minute of audio | model.credit × duration_minutes | |

**Calculation formulas — apply when confirming cost:**
- **Video / Lipsync**: `total = model_credit_per_second × duration_seconds`
  - Get the `credit` value from `list_models` (or from a previous call in this session) and multiply by duration.
  - Never assume the credit shown is a flat per-generation cost for these types.
- **Music**: flat per generation — `total = model_credit` (duration does not change the cost).
- **TTS**: `total = model_credit × ceil(character_count / 100)`
  - Count the actual characters in the text before estimating. 1000 chars with ElevenLabs = 50 credits.
- **Images / 3D / Sound effects**: `total = model_credit × quantity`
- **Resolution / audio multipliers**: if the user sets `resolution` or the model has native audio, read `resolutionMultipliers[tier]` and `soundCreditMultiplier` from `list_models`. Formula: `final = base × resolutionMult × (sound ? soundMult : 1) × durationSeconds`.

**Tier label → pixel mapping (rough):**
- Images: `"1K"` ≈ 1024px, `"2K"` ≈ Full HD (1920×1080), `"3K"` ≈ QHD (2560×1440), `"4K"` ≈ UHD (3840×2160). Picker shows only tiers the model actually supports (per `supported_resolutions`).
- Videos: `"720p"` / `"1080p"` / `"1440p"` / `"2160p"` = vertical pixels (720p = HD, 1080p = Full HD, 1440p = QHD, 2160p = 4K UHD). Some models use model-specific labels like `"512P"` / `"1024P"` (Hailuo).

**Cost confirmation — when:**
- **Skip** when the user already specified model + count + duration ("make 5 videos, seedance 2 fast, 15s" IS the confirmation), or when a single generation costs under 5 credits.
- **Required** otherwise: present a one-line summary ("8 videos × 5s × [model] @ X cr/s = **Y credits**. Proceed?"), suggest a cheaper alternative if one exists, wait for confirm before firing.
- **Batch totalling 100+ credits**: run `check_credits` first and include the available balance in the summary.

### Rate Limiting & Batch Generation (CRITICAL)

**Rate limits** (per user, server-enforced; the API queues — never silently drops):
- `generate_image`: 30/min
- All other generation tools: 10/min per type
- 300/min global across all media endpoints
- `upload_media`: 300/min, no credit cost

**⚠️ NEVER re-fire a generation you already called.** Aborted, interrupted, or timed-out tool calls still process server-side and will complete. Before retrying, run `get_generation_status` — only retry if it returns `failed` (not `pending` or `completed`). Only re-fire on explicit user request ("retry", "redo", "try again"). Every duplicate burns real credits.

**Batch generation workflow (≤10 items):**
1. Confirm cost ONCE — skip if the user already specified model/count/duration ("make 5 videos, seedance 2 fast, 15s" IS the confirmation).
2. **Output ALL tool calls in one response** (up to 10 per type) — they run concurrently, so 5 videos finish in the time of the slowest one.
3. Each call blocks until done (images: seconds; video: 1–5 min). Don't apologize for the wait.
4. After all complete, present results together.
5. On 429: wait 60s, retry only the failed items (max 2 retries).

**Multi-image decision:**
- User gives a **general brief** ("make 4 product shots", "create a storyboard", "show the character in 4 different settings") → use `generate_creative_director` with `scene_count`. Pass `visual_dna_ids` to keep a character consistent across all scenes.
- User gives **explicit separate prompts** ("Image 1: X, Image 2: Y, Image 3: Z") → fire all as **parallel `generate_image` calls** in one response
- Never call `generate_image` sequentially in a loop — either use `generate_creative_director` or fire all calls in one parallel batch

**⚠️ Parameter names — do NOT confuse these:**
- `generate_image` → `num_images` (1–4): all images use the **same prompt**, just different random seeds — use this for "give me 4 variations of this image"
- `generate_creative_director` → `scene_count` (1–8): each scene gets its **own distinct prompt** — use this for "make 8 different campaign shots" OR "show the character in 8 different scenes/outfits/moods". Always pass `visual_dna_ids` when character consistency matters. **Never pass `num_images` to `generate_creative_director`.**

**After `generate_creative_director` completes — share results as individual URLs, one per scene. Do NOT create an HTML grid artifact or any combined layout. Just list each scene's title and its image URL on separate lines.**

### ⚠️ Don't re-list generated URLs in your final message (CRITICAL)

The chat UI **already renders every generated image / video / audio inline** as a tile in a responsive grid the moment the tool result returns. Listing all the URLs again as text or markdown at the end of your message produces an ugly second copy of the gallery and forces the user to scroll past it.

After a batch of `generate_image` / `generate_video` / `generate_creative_director` / etc. completes:

| Do | Don't |
|---|---|
| Briefly summarize what was made (1–2 sentences) | List every URL as `1. https://… 2. https://…` |
| Note total credits spent | Re-emit `![alt](url)` markdown for every image |
| Point to `.kolbo/production.md` for the durable index | Build an HTML `<table>` or `<div>` "summary grid" |
| Mention any failures (with their generation_ids) | Re-describe each scene with its URL underneath |
| Suggest the obvious next step ("animate scene 3?", "swap colors?") | Repeat the captions / prompts you already used |

The exception: **inside `.kolbo/production.md` you SHOULD store every URL** — that's the durable record. The chat-message text is for human-readable summary only; the tiles in the grid + the production log are the real artifacts.

For `generate_creative_director` specifically: when you DO need to identify scenes (e.g. so the user can refer to "scene 3" later), use a numbered list of *titles only* — no URLs, no markdown image syntax. The chat already shows them as a labeled grid.

### ⚠️ Bulk Generation (>10 items)

For large briefs ("make 50 UGC ads") the rules above still apply, plus:

**Real-world batch ceilings (cheat sheet)** — these are tighter than the published rate limits; exceeding them causes 429s that can throttle the whole session:

| Tool | Max safe in-flight | Notes |
|---|---|---|
| `generate_image` | 8–10 | Fast (~10–30s each) |
| `generate_image_edit` | 5–8 | Multi-angle models slower |
| `generate_creative_director` | 1 call → up to 8 scenes | Runs scenes in parallel internally — never batch externally |
| `generate_video` / `generate_video_from_image` / `generate_first_last_frame` / `generate_lipsync` | 3–5 | 1–5 min each |
| `generate_video_from_video` | 3 | Heaviest |
| `generate_elements` | 3–5 | Confirmed real-world ceiling for 50-item bulk runs |
| `generate_music` / `generate_speech` / `generate_sound` | 5–8 | |
| `upload_media` | 10+ | No practical ceiling |

For 50 outputs: fire one batch → wait for all to finish → fire next batch. Never fire all 50 in one response.

**`upload_media` external URLs first.** `files` on `generate_elements` and source images on edit/from-image tools only accept Kolbo-hosted URLs reliably; external URLs (e.g. unsplash) cause `400 Bad Request`. Pattern: external URL/local file → `upload_media` → use the returned Kolbo CDN URL in `reference_images` / `source_images` / `image_url`. Image upload constraints: JPEG/PNG/WebP only, 300×300 to 2048×2048 — pre-validate before upload.

**On 429:** finish the in-flight batch, wait 60s, retry only the failed items. Second 429 → wait 120s, retry once. Third → stop the whole job, report completed/failed counts to the user.

**Persist every `generation_id`** in `.kolbo/production.md` (even for failures) — required for `get_generation_status` recovery and cross-session dedupe.

Bulk production-log entry shape:
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

**Don't narrate** — output the tool calls, skip "Generating Video 1 of 5…" preambles.

**Handling interruptions:** if the user aborts mid-batch then says "do the rest," check what you already fired, skip those, fire only the remainder. Never restart from the beginning.

---

## ⚠️ Production Log — `.kolbo/production.md` (CRITICAL)

Every URL, id, and brief produced by a Kolbo MCP tool MUST be recorded in `.kolbo/production.md` in the user's workspace. This file — not chat history — is your source of truth for prior artifacts: URLs scattered across `tool_result` blobs are unreliable to re-scan and disappear entirely on context compaction.

### When to READ it

Read `.kolbo/production.md` **before** acting on any of these signals:
- "edit", "animate", "combine", "redo", "polish", "fix", "regenerate"
- "the same character / scene / image / video / sound", "that X", "scene N", "the rainy one", etc.
- `@name` references for Visual DNA
- Any continuation of prior media work ("now make scene 3")

If the file is missing and the user is referencing prior media, ask the user — do not guess from chat.

### When to WRITE to it

**Immediately after every successful generation tool call**, before your next tool call or your final reply. The runtime will inject a reminder after generation tool results — treat that as a hard rule, not a suggestion.

Tools that REQUIRE logging:
- `generate_image`, `generate_image_edit`, `edit_image`
- `generate_video`, `generate_video_from_image`, `generate_video_from_video`, `edit_video`
- `generate_elements`, `generate_first_last_frame`, `generate_lipsync`
- `generate_music`, `generate_sound`, `generate_speech`
- `generate_3d`, `generate_creative_director`
- `create_visual_dna`, `upload_media`

Tools that do NOT log: `list_*`, `get_*`, `check_credits`, `chat_*`, `transcribe_audio` (read-only / discovery).

### File creation — pick the right tool to avoid the "must Read first" error

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

### Entry shape

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

### Header rewrite rule (Manus pattern — IMPORTANT)

The `## 🎯 Now` block at the top of the file is **rewritten every turn** to keep the brief + current step near the model's recency window. Body sections (everything below the first `---`) are **append-only**.

When a user request supersedes a previous artifact (e.g., "redo scene 2 with more rain"), do not delete the old entry. Mark it `(superseded YYYY-MM-DD)` and place the new entry beneath:

```md
2. **Rainy street walk** — neon reflections, slow dolly
   - still: https://...scenes/02-rain.png (superseded 2026-05-13)
   - still: https://...scenes/02-rain-v2.png  (flux-2-pro, 2026-05-13)
   - video: https://...videos/02-rain-v2.mp4  (kling-2, 2026-05-13)
```

### Rules

1. **First touch `Write`, subsequent touches `Read` → `Edit`** (see "File creation" above). If `Edit` fails on exact-match, `Read` again — the user may have hand-edited.
2. **Plain English labels** — write what the user would call it.
3. **Append-only body.** Only the `## 🎯 Now` header is rewritten. Never delete artifact entries; mark them `(superseded)` instead.
4. **Do not log failures.** Only successful generations.
5. **Resolve user references via the log, not chat history.** If the user says "scene 3," use the URL the log says is scene 3, even if a later tool_result mentioned a different URL.
6. **One file per workspace.** Multiple concurrent productions go under separate `## Production: <name>` headings inside the same file.

### Production Log vs TodoWrite

Use both — different jobs:

| | `.kolbo/production.md` | `TodoWrite` |
|---|---|---|
| Purpose | Durable artifact registry | Ephemeral step plan |
| Lifetime | Persists across sessions / compaction | Per turn / per request |
| Content | URLs, ids, briefs | "Do X, then Y, then Z" |
| Example | `still: https://...01-coffee.png` | `Generate visual DNA for Maya` |

---

## Video / Audio Analysis & Transcription

You have three routes. The right one depends on the file profile — pick before calling any tool.

### Decision tree

```
Image (jpg/png/webp)?                         → Read directly (native vision, up to 10 per pass)
File >100MB OR >15 min OR dialogue-dense?     → HYBRID (transcribe + ffmpeg frames + Read + your synthesis)
User wants the transcript/SRT as deliverable? → transcribe_audio, return the URLs
Precise answer about one specific frame?      → ffmpeg that frame → Read
Otherwise (short/medium video, mixed content) → upload_media → chat_send_message (Gemini native)
```

### Why `upload_media` → chat is **not** always the default

Gemini-via-chat processes frames + motion + audio in one pass and is the simplest route when it works. But it has three known failure surfaces — recognize them and pivot to the hybrid path:

1. **>100MB upload cap.** Hard limit; the upload won't succeed. No option but to split with ffmpeg or go hybrid.
2. **Long-form decay** (rough threshold: 15–20 min). Even when it fits, attention degrades — shallow or hallucinated answers on the back half of the file.
3. **Transcription-dense laziness.** Lectures, interviews, podcasts, anything where speech is the substance: chat models summarize aggressively, paraphrase quotes wrong, or silently skip stretches. Always transcribe these first to get the actual words, then add visuals only if they matter.

### The hybrid path (workaround for all three failures)

```
1. transcribe_audio({ source }) → text, srt_url, word_by_word_srt_url, duration
2. Read the transcript text from the tool output directly
3. Pick 3–8 timestamps from the SRT where visuals actually matter
4. ffmpeg -ss <ts> -i <file> -frames:v 1 <frame.jpg>   (one extract per timestamp)
5. Read each frame with native vision (up to ~10 frames per analysis pass)
6. Synthesize from transcript + frames + the user's question
```

This is usually **cheaper** than chat for long files — transcription is per-minute, ffmpeg + Read are free — and produces stronger answers on dialogue-heavy material because you have the complete text, not a model's summary of it.

For media >30 min (past the transcription cap), split with ffmpeg into ~25-min chunks, transcribe each, concatenate.

### Transcribe-as-deliverable vs transcribe-as-input

| Request pattern | Action |
|---|---|
| "Transcribe this" / "give me an SRT" / "I need word-by-word timing" / "make subtitles" | Run `transcribe_audio`, return the URL(s). The transcript IS the deliverable. |
| "What did they say about X?" / "Summarize this meeting" / "Find the part where they mention Y" | Run `transcribe_audio` to *get* the text → **you** read/summarize/search. Transcript is a means, not the answer. |

### `transcribe_audio` — tool details

- `source`: URL or absolute local path.
- **Audio**: mp3, wav, m4a, flac, aac. **Video** (audio track extracted): mp4, mov, webm, mkv, avi, m4v.
- **30-minute hard cap.** Longer → split with ffmpeg first.
- Returns:
  - `text` — full transcript, plain.
  - `srt_url` — grouped SRT (~12 words per line, up to 2 lines per subtitle). Use this for normal subtitle delivery.
  - `word_by_word_srt_url` — one word per cue with millisecond-precise start/end (ElevenLabs Scribe v2). Use **only** when downstream is animation (Remotion captions, after-effects karaoke, precise speech-aligned cuts). Noise for normal subtitle workflows.
  - `txt_url` — plain text file.
  - `duration` — seconds.
- Cost: per-minute (`model.credit × duration_minutes`). Run `check_credits` before transcribing very long files.
- Read-only / discovery — does NOT trigger the `.kolbo/production.md` log nudge. If the user wants the transcript saved as a durable artifact, `Write` it to a workspace file, not the production log.

### `upload_media` → `chat_send_message` — tool details

- `upload_media({ source: "/absolute/local/path/file.mp4" })` → returns `{ url, thumbnail_url, ... }`. **Use `url`** (the CDN URL); ignore `thumbnail_url` (preview JPG only).
- `chat_send_message({ message, media_urls: [url] })`:
  - `media_urls` is **mandatory** — the model only sees the file if you pass the CDN URL here. Always an array.
  - **Omit `model`** — Smart Select auto-routes to Gemini when media is detected.
  - Sessions do NOT remember media between messages. On retry: reuse the same CDN URL (no re-upload), but always pass `media_urls` again.
  - Batch / many short videos cost-sensitively: `list_models` for the cheapest Gemini, pass it explicitly.

### Image analysis — never via chat

You have native vision. **Always `Read` images directly** (you handle up to 10 per pass). Do not `upload_media` + chat for images unless the user explicitly names a specific Kolbo chat model. Don't extract frames from images either — they're already viewable.

**NEVER ask the user which path to use — diagnose from the file profile and pick.**

### ⚠️ Batching Media in Chat Messages (CRITICAL)

**Send ALL media in ONE `chat_send_message` call.** `media_urls` accepts up to **10 URLs**. Each separate chat call counts toward rate limits — splitting trips "Too many generation requests."

```
# Step 1: parallel uploads (one response)
upload_media({ source: "video1.mp4" }) → url1
... (up to 10)

# Step 2: ONE chat call with all URLs
chat_send_message({ message: "Analyze all 5 videos...", media_urls: [url1, url2, ...] })
```

On 429: wait 60s, retry the same chat call — reuse the CDN URLs, do not re-upload.

**Never:** pass a local path in `media_urls` (CDN URLs only); use a transcription `.txt` URL as a video URL; construct a CDN URL yourself; split media across multiple chat calls.

---

## ⚠️ Research-First Creative — when to scrape before generating

When the user gives you a **product URL, brand reference, or "make X for Y audience" brief** (especially for ads, marketing creative, or anything tied to a real brand), don't jump straight to prompts. Spend one turn researching first — the cost of a single research turn is far less than 10 mis-aimed generations.

### When to do research-first
- Any URL appears in the brief (product page, landing page, brand site)
- The brief names a brand, product, or company you don't already have context on
- The brief targets a specific audience / language / market with conventions you should respect (Hebrew/Israeli, Japanese, Gen-Z TikTok, B2B SaaS, luxury, etc.)
- The brief explicitly says "research" / "תחקור" / "look up" / "find examples" / "check best practices"

### How to research (parallel calls in one response)
Fire these IN PARALLEL — they're independent reads:

1. **`WebSearch`** for prompt-engineering patterns specific to the chosen model. **The model name in the search query MUST be the literal model the user named** — never substitute a generic / default / "popular" model. If the user said "nano banana 2", search for `"nano banana 2" prompt …`, NOT `"flux" prompt …` or `"midjourney" prompt …`. The same HARD RULE that applies to *calling* the named model applies to *researching* it. Examples (replace `<model>` with the user's exact wording):
   - `"<model>" prompt engineering ad image text rendering`
   - `"<model>" hex color font specification advertising prompt`
   - `"<model>" hebrew text RTL rendering` (or any user-named language)
2. **`WebSearch`** for the audience / market design conventions:
   - `<audience> advertising design trends <year>`
   - `<language> typography <use case> RTL/LTR best practices`
3. **`WebFetch`** the product URL with a precise extraction prompt (see below).
4. (Optional) `WebSearch` for competitor / reference visuals to set bar.

### Extracting the product page (WebFetch prompt template)

Don't ask WebFetch a vague "what is this page" — ask for structured extraction:

```
Extract from this page, in compact bullets:
1. Product name + one-line value proposition.
2. 3–5 concrete capabilities/benefits (user-facing language).
3. All product hero / screenshot image URLs visible in the page.
4. Brand color hex codes — pull from inline `style=`, `<style>` tags, or
   linked CSS, ignoring generic UI defaults (#fff/#000). Identify which
   color plays which role (primary CTA, headline text, background, accent).
5. Brand voice signals (tone, target user, formality).
6. Any explicit fonts named in CSS or visible.
```

### Re-host every external image via `upload_media`

The bulk-API rule applies: external URLs in `reference_images` / `source_images` / `image_url` cause **400 Bad Request**. Pipeline:

1. `Bash: curl -fsSL "<external-url>" -o /tmp/<name>.<ext>` (or use WebFetch where it returns the binary)
2. `mcp__kolbo__upload_media` with the local file → returns Kolbo CDN URL
3. Use the returned CDN URL in any subsequent generation call
4. Log both URLs in the production log (so the user can trace provenance)

### Synthesizing the research

In the production log create:
```md
### Research notes
- Prompt patterns for <model>: …
- Audience conventions: …

### Product brief
- Name: …
- Value prop: …
- Capabilities: …, …, …

### Brand palette
- primary: #...
- accent: #...
- text: #...
- bg: #...

### Re-hosted assets
- hero_1: <kolbo CDN url>  (from <original url>)
```

### Building prompts informed by the research

When generating ad / marketing creative based on this research:
- **Exact hex codes for every color** — `#FF4D2E` not "orange". Match brand palette.
- **On-image text in literal double quotes** — `"שלום עולם"` not `Hebrew greeting`. Specify language and direction (RTL/LTR) when non-English.
- **Per text element**: position, font weight, point size, color hex, alignment.
- **Forbid uninvited additions** — explicitly tell the model: NO captions, NO subtitles, NO watermarks, NO extra text beyond what's specified. Same rule as UGC defaults.
- **Use research findings to shape composition** — e.g. if research said "Israeli social ads favor bold contrast and minimal copy", reflect that.
- Always **approve the concept + sample prompts with the user** before firing the full batch when the batch is ≥4 ads or the user said "approve first".

### Skipping research is OK when…
- User gave no URL, no brand, no audience-specific signal — pure creative ("make a sunset")
- User said "skip research" / "just generate" / "I have the prompt ready"
- The brief is for a single quick draft

---

## Image Prompts

### Rules
- **Clean prompts only.** No "Output:", "Tips:", "Notes:", "Resolution:", "Dimensions:", or any instructional/meta language inside the prompt. The prompt is what the model sees — anything not describing the image is noise.
- **Length**: focused 2-3 sentences beats a bloated paragraph. Only go longer when the concept genuinely needs it (complex scenes, multiple subjects, specific technical requirements). Match prompt length to complexity.
- **Order**: Subject → action/pose → environment → lighting → style.
- **Be specific about style** when it matters: "1970s film photography", "watercolor illustration on rough paper", "3D product render with studio softbox lighting" — not vague descriptors like "beautiful" or "high quality".
- **`enhance_prompt: true`** (default) will improve most prompts automatically. Turn it off only if the user's prompt is already fully engineered or they want literal wording.

### Image Editing (image-to-image)

Use `generate_image_edit` when the user wants to modify an existing image. Pass the source image URL(s) in `source_images` and describe the change in `prompt`.

- Good: "Turn the sky orange and add drifting clouds"
- Bad: "A mountain landscape with an orange sky and drifting clouds" (re-describes what's already in the image)

Simple edits deserve simple prompts. Only elaborate for genuinely complex, multi-step transformations.

### Director Tool — Full Capabilities

`generate_creative_director` is **not just for storyboards**. It is the right tool any time the user wants **2–8 related outputs from one brief**. The director plans each scene's prompt internally, keeps style consistent across all of them, and runs them in parallel — meaning total wall-time matches the slowest scene, not the sum.

**When to reach for it (canonical use cases):**
- **Multi-angle character sheet** — front / back / sides / 3-quarter, "show her from 4 angles," "turn-around"
- **Multi-pose** — same character, different poses for the camera
- **Multi-scene story** — same character through 8 different environments / settings / locations
- **Wardrobe / outfit variants** — same character, different outfits
- **Mood / lighting variants** — same scene, different times of day / weather / emotion
- **Ad campaign / product set** — one product, N hero shots
- **Storyboard / shot list** — sequential beats of a narrative
- **Reference sheet for Visual DNA training** — produce 4–8 cohesive images that you'll *then* feed into `create_visual_dna`

**What it accepts (all combinable):**

| Parameter | Purpose | Use when |
|---|---|---|
| `prompt` | The overall brief, *not* a per-scene prompt | Always |
| `scene_count` (1–8) | How many outputs | Always — never use `num_images` here |
| `visual_dna_ids: []` | Character / style / product / scene consistency across every output | The character must look the same in every scene |
| `reference_images: []` | Style / composition references applied to every scene | You have a mood-image or layout reference but no Visual DNA yet |
| `moodboard_id` / `moodboard_ids: []` | Art-direction overlay (palette, lighting, vibe) | The user gave a brand / style brief |
| `workflow_type: "video"` | Switch to multi-scene video instead of images | The user asked for "8 short clips" / "4 video variants" |
| `model` | Pin a specific image / video model | The user named one |
| `aspect_ratio`, `resolution`, `duration` | Standard formatting | As needed |

**When NOT to use it:**
- User gave **explicit per-image prompts** ("Image 1: X. Image 2: Y. Image 3: Z.") — fire parallel `generate_image` calls instead. Director is for *one brief → N scenes*; explicit per-scene prompts mean the user already did the directing.
- User wants to **modify a specific existing image** — that's `generate_image_edit`.
- User asked for **one image** — that's `generate_image`.

### Mixing References, Visual DNAs, and Moodboards

You can combine all three reference types in a single call — they're additive, not exclusive. The system blends them; the model uses whichever it can interpret best for the prompt.

| Tool | `source_images` (required edit base) | `reference_images` (style / composition) | `visual_dna_ids` (character/style identity) | `moodboard_id` (art direction) |
|---|:-:|:-:|:-:|:-:|
| `generate_image` | — | ✅ | ✅ | ✅ |
| `generate_image_edit` | ✅ (required) | — (source_images plays this role) | ✅ | ✅ |
| `generate_creative_director` | — | ✅ (applied to every scene) | ✅ (locks character across every scene) | ✅ / `moodboard_ids` |
| `generate_elements` (video) | — | ✅ (also `reference_videos`, `audio_url`) | ✅ | — |

**Practical combinations to know:**
- *"Make her in a Tokyo street, matching this mood board, with the same face as Visual DNA Maya"* → `generate_image` with `visual_dna_ids=[maya], moodboard_id=tokyo_neon`. No `reference_images` needed.
- *"Same character, but place her like in this composition"* → `generate_image` with `visual_dna_ids=[maya], reference_images=[layout.png]`. The DNA owns the *face*; the reference owns the *pose/composition*.
- *"Edit this photo to give her the leather-jacket look from Visual DNA Maya"* → `generate_image_edit` with `source_images=[photo.png], visual_dna_ids=[maya]`. Source is what's edited; the DNA injects the wardrobe identity.
- *"4 angles of this character, brand-styled"* → `generate_creative_director` with `scene_count=4, visual_dna_ids=[maya], moodboard_id=brand_x`. DNA keeps the face; moodboard sets the look.
- *"Generate 6 product hero shots; here are 3 reference comp images and our brand moodboard"* → `generate_creative_director` with `scene_count=6, reference_images=[comp1, comp2, comp3], moodboard_id=brand_x`. No DNA needed if it's a product not a face.

**Rule of thumb for which to use:**
- Need an **identity** (face, character, specific product) to stay constant → `visual_dna_ids`.
- Need a **composition / pose / mood reference** → `reference_images`.
- Need an **overall style / palette / brand look** → `moodboard_id`.
- Need all three at once → pass all three. They compose.

### Tagging references inside the prompt (CRITICAL for multi-image accuracy)

When a call passes more than one image — `reference_images`, `source_images`, OR `visual_dna_ids` — name them inside the prompt so the model knows **which image plays which role**. Without tags, models guess and the wrong reference bleeds into the wrong slot ("she ended up wearing the background's color" / "the second character got the first character's face").

**Two tag namespaces, used together:**

| Tag | Refers to | Order rule |
|---|---|---|
| `@image1`, `@image2`, … | Plain images in `reference_images` / `source_images` | Position in the array — `@image1` = `images[0]`, `@image2` = `images[1]`, etc. |
| `@<dna-name>` | A Visual DNA, e.g. `@maya`, `@product_hero` | Whatever label you logged in `.kolbo/production.md` next to its `vdna_*` id |

**How to write a tagged prompt:**

```
Place @maya at the coffee-shop counter from @image1, wearing the leather jacket from @image2.
Keep the warm window light from @image1; ignore the people in the background of @image2.
```

What that prompt does, at submission time:
- `visual_dna_ids: [vdna_8f2c]` (the Visual DNA for `@maya`)
- `reference_images: [coffee_shop.jpg, jacket_ref.jpg]` (in that exact order, so `@image1`/`@image2` resolve correctly)
- The prompt names each one, so the model never has to guess which reference is the location vs. the wardrobe.

**Rules:**

1. **Order is contract.** `@imageN` is bound to position N in the array you pass. Reordering the array silently changes what `@imageN` points to — don't reorder mid-conversation; if you need to add a new ref, append it (`@image3`) rather than inserting.
2. **For edits, the source is `@image1`.** In `generate_image_edit`, the first entry of `source_images` is the canonical base — refer to it as `@image1` ("brighten the sky in @image1"). Additional source images become `@image2`, `@image3`.
3. **Visual DNA tags are name-based, not positional.** `@maya` always means the DNA you registered as "maya," regardless of where its id appears in `visual_dna_ids`. Pick names a human would type — short, no spaces, lowercase.
4. **Tag every reference you actually want used.** If you pass a reference but never mention it in the prompt, the model often treats it as decorative — pass less, or name it explicitly.
5. **Tags carry across the production log.** When you log a generation to `.kolbo/production.md`, write the prompt with the tags intact and record the `@name → URL` / `@name → vdna_id` binding next to the Visual DNA entry. That way "the rainy scene from last week" remains reproducible weeks later.
6. **Don't tag a single-image call.** If there's only one reference and no DNA, prose ("this image", "the source") is fine — `@image1` is overhead.

**Failure modes the tags fix:**

| Without tags | With tags |
|---|---|
| "Combine these two images" → model averages them | "Put the subject from @image1 into the scene of @image2" → clear roles |
| "Same character, new outfit" with 2 refs → wrong face | "Keep @maya's face from the Visual DNA; apply the outfit from @image1" |
| "Edit this" with 3 source images → model edits whichever is first | "In @image1, replace the sky with the sky from @image2" |

---

## ⚠️ Resolution, Caps & Constraints — read these BEFORE every generation (HARD RULE)

Every model exposes a constraint envelope via `list_models`. Submitting a value outside it is a **deterministic 400** — not a degraded result, not a substitution. You MUST consult `list_models` and validate inputs before firing any generation. When in doubt, call `list_models` with `format: "json"` to get the raw model document for programmatic comparison.

### Canonical field reference — which `list_models` field controls which input on which tool

The same conceptual slot (e.g. "max reference images") lives under **different field names per model family**. Read the row for your tool, not the model name.

| Your input | Tool(s) | Field to read on the model | What "0" / `null` means |
|---|---|---|---|
| `reference_images` | `generate_image`, `generate_image_edit` (uses `source_images`), `generate_creative_director`, `generate_video` | `max_reference_images` | `0` = model accepts no refs |
| `reference_images` | `generate_elements` | `elements_max_images` | `0` = model accepts no image refs |
| `reference_images` | `generate_video_from_video` | `max_images` | `0` = no secondary image input |
| `reference_videos` | `generate_elements` | `elements_max_videos` | `0` = no video refs |
| `reference_videos` | `generate_video_from_video` | `max_videos` | `<= 1` = only the source_video |
| `elements` | `generate_video_from_video` | `max_elements` | `0` = no elements |
| `audio_url` | `generate_elements` | `elements_max_audio` (+ `max_audio_duration` for the file) | `0` = no audio ref |
| `visual_dna_ids` | every tool that accepts DNA | `max_visual_dna` (+ `supports_visual_dna` boolean) | `null` / `0` / `false` = model rejects DNA (silently ignored by some paths) |
| `aspect_ratio` | any | `supported_aspect_ratios` (or `supported_aspect_ratios_by_type[<type>]` when multimodal) | empty → use `default_aspect_ratio` if set |
| `resolution` | any | `supported_resolutions` (+ `resolution_multipliers` for cost) | empty → model has no resolution tiering |
| `duration` (video output) | video tools | `supported_durations` if set, else `min_output_duration`–`max_output_duration` | both null → can't validate, omit and let server default |
| **input** video duration (source) | `lipsync-video`, `generate_video_from_video` | `min_video_duration` – `max_video_duration` | outside range → reject or upstream truncates |
| input audio duration | `generate_lipsync`, `generate_elements` audio | `min_audio_duration` – `max_audio_duration` (+ `audio_max_follows_video_duration` for lipsync) | outside range → reject |
| audio file format | any audio input | `supported_audio_formats` (e.g. `["mp3","wav","m4a"]`; empty = all) | pre-validate before upload |
| recording duration | `text_to_speech` recording UX | `min_recording_duration` – `max_recording_duration` | usually null for plain TTS |
| upload file size | every file upload | `max_file_size` (bytes) | null → use platform default |
| `num_images` | image tools | `images_per_request` overrides for fixed-output models (Midjourney returns 4 regardless) | null → `num_images` honored as-is |
| `prompt` | every tool | `requires_prompt`, `min_prompt_length`, `max_prompt_length` | null → unconstrained |
| sound on/off | video tools | `sound_generation_type` (`"native"` vs `"none"`), `sound_enabled_by_default`, `sound_credit_multiplier` | not `"native"` → can't emit synced audio |
| capability gate | route decision | `supports_visual_dna`, `supports_first_last_frame`, `supports_audio_input` | `false` → the controller silently drops that param |

Cost formula: `final_cost = credit × resolution_multipliers[resolution] × (sound_enabled ? sound_credit_multiplier : 1)`, multiplied by `num_images` / `scene_count` as applicable.

### Validation pattern — every generation

Before submitting:

1. Call `list_models type=<tool-type>` (text mode is enough for picking; `format: "json"` when you need to programmatically compare caps).
2. For each input array (refs / DNAs / elements) — check `length <= <cap>` from the row above. If over, drop the lowest-priority entries OR ask the user.
3. For each enumerated value (`aspect_ratio` / `resolution` / `duration`) — check it's in `supported_*`. If not, **do not silently substitute**; show the user the allowed set and ask.
4. For each duration-bearing file (source_video for lipsync/v2v, audio for lipsync/elements) — pre-check duration against the min/max range. Use ffmpeg if needed (via `video-production` skill).
5. For uploads — pre-check size against `max_file_size`.

The MCP tool descriptions also embed the cap field name on the relevant parameter (e.g. `reference_images: "...Cap: pass at most max_reference_images..."`) — use those as inline reminders.

### ⚠️ Quote real cost, never estimates (CRITICAL)

The formula above is for **pre-approval previews only**. After firing, use the real number from the tool response — every generation now returns `credits_used` (multiplier-adjusted total) and `credits_breakdown` (per-model attribution). Log `credits_used` to `.kolbo/production.md`, not `base × count`.

```json
{ "credits_used": 12, "credits_breakdown": [{ "model": "nano-banana-2", "base": 8, "final": 12, ... }], "urls": [...] }
```

When the user asks "how much did I spend?" → call `mcp__kolbo__get_session_usage` for the real, multiplier-adjusted session total + per-tool + per-model breakdowns (same numbers as the desktop bottom-bar counter).

### Decision rule

1. **User specified resolution / sound explicitly** ("4K", "1080p", "480p", "with sound", "silent") → ALWAYS verify the value is in `supported_resolutions` BEFORE firing. If it isn't:
   - ❌ Do **NOT** silently substitute a "close" value. The user asked for 480p; sending 720p without their consent burns 1.5–2× the credits they expected and produces a different output.
   - ✅ Show them what the model actually supports in one line and ask which to use:
     > "Seedance 2 elements supports `[720p, 1080p, 1440p, 2160p]` — 480p isn't available. Closest cheap option is 720p (~+0 credits over your intent). Want 720p, or pick another?"
   - Only fire after they reply (or after they re-confirm the original intent with the new info).
2. **User specified quality intent without numbers** ("draft", "quick test", "final delivery", "for client", "production") → map intent to tier:
   - draft / quick / preview → cheapest in `supported_resolutions` (1K / 720p)
   - normal / standard → `default_duration`-equivalent (typically 2K / 1080p)
   - final / production / hero → highest the user's budget allows (3K-4K / 1440p-2160p)
3. **No quality signal at all** AND the cost difference between cheapest and most-expensive is **>2×** OR total batch is large (≥4 outputs) → **ask the user once** with a one-line cost comparison, then default to standard if they don't reply. Example:
   > "This model offers 1K (8 cr × 4 = 32), 2K (1.5×: 48), 4K (2×: 64). Default to 1K? Or pick 2K/4K?"
4. **No quality signal AND cost difference is small** (≤1.5×) → quietly use the cheapest supported, no need to interrupt.
5. **Sound on a video model with `sound_credit_multiplier > 1`** → if user didn't ask for sound, leave it off (saves credits). If user said "with sound" / "with music" / "with audio", enable it.

### Defaults when nothing is specified

- **Image**: `1K` (or the cheapest in `supported_resolutions`).
- **Video**: `720p` (or the cheapest), with `default_duration` (or shortest in `supported_durations`).
- **Sound**: respect `sound_enabled_by_default`; if false, leave off.

### Always log the resolution / duration / sound choices

Production-log entries should include the resolution and (for video) duration + sound state alongside the URL, so the user can see what they paid for:

```md
- still: https://...01-coffee.png  (flux-2-pro · 1K, 2026-05-14)
- video: https://...02-rain.mp4   (kling-2 · 1080p · 5s · sound-off, 2026-05-14)
```

---

## Visual DNA (Character/Style Consistency)

Visual DNA profiles capture the visual "identity" of a character, style, product, or scene from reference media.

### Workflow
1. **Create** a profile with `create_visual_dna` — provide reference images (max 4), optionally video and audio
2. **Types**: `character` (default), `style`, `product`, `scene`, `environment`
3. **Use** the profile by passing its `id` in `visual_dna_ids` in: `generate_image`, `generate_creative_director`, `generate_elements`
4. **List/inspect** profiles with `list_visual_dnas` / `get_visual_dna`

### ⚠️ @name Syntax for Multi-Visual-DNA Prompts

When multiple Visual DNAs appear in one generation, reference each by `@name` in the prompt so the engine knows which profile plays which role. Names are set in `create_visual_dna` (lowercase, no spaces). Without `@name`, the engine may blend all DNAs indiscriminately. Works in `generate_image`, `generate_creative_director`, `generate_elements`.

```
prompt: "@dana standing in @shop, picking up a product"
visual_dna_ids: ["vdna_abc",  // dana
                 "vdna_xyz"]  // shop
```

This composes with `@image1` / `@image2` positional tags for plain reference/source images — see "Tagging references inside the prompt" above for the full system.

### Visual DNA Limits

Read `max_visual_dna` from `list_models` for the exact cap, AND `supports_visual_dna` for the on/off boolean — a model can support DNA without an explicit cap, or have a non-null cap but silently ignore DNA on certain paths (e.g. `generate_video`). Typical ranges: image models (non-Kling) up to **8**, Kling image models **3**, Elements video models **3–5**, everything else up to **3**. The canonical field reference table above gives the per-tool routing.

### ⚠️ Visual DNA Creation — Always Generate Reference Images First (MANDATORY)

**Before calling `create_visual_dna` for a character**, always generate 2 reference images first and include them alongside any user-provided images. These give the Visual DNA engine multi-angle coverage and dramatically improve consistency:

**Step 1 — Generate both images in parallel (one `generate_image` call each, fire simultaneously):**

1. **4-angle character sheet** — prompt: `"[character description], character reference sheet showing front view, back view, left side view, right side view, four panels arranged in a 2x2 grid, neutral solid background, full body, photorealistic"`, aspect ratio `16:9`
2. **Close-up portrait** — prompt: `"[character description], close-up portrait, face and shoulders, neutral solid background, soft studio lighting, photorealistic"`, aspect ratio `1:1`

**Step 2 — Call `create_visual_dna`** with:
- `images`: the 4-angle sheet URL first, then the close-up URL — **plus** the user's reference photo(s) only if they provided one (i.e. a real person or existing character they want to match). If they gave no reference image, the 2 generated images alone are sufficient.
- `type`: `"character"`
- `name`: descriptive name

**Why:** A single reference photo only shows one angle. The close-up gives the engine facial detail; the 4-angle sheet gives it body geometry and pose range. Together they produce far more consistent generations.

**Skip this only if** the user explicitly says "just use my image as-is" or provides 3+ reference images already covering multiple angles.

### When to Use
- User wants the same character across multiple **images** or a campaign → `generate_image` / `generate_creative_director` with `visual_dna_ids`
- User wants to animate a character in video using **elements models** (Seedance 2, Kling O3 Reference, Grok Imagine, Veo 3.1, etc.) → `generate_elements` with `visual_dna_ids`
- User wants a consistent brand style across a campaign → `generate_creative_director` with `visual_dna_ids`
- User references "keep the same look", "same character", or "use that character"
- User provides reference photos of a person/product to maintain consistency
- User asks to put a character in a specific environment or scene → create both a character Visual DNA and an environment Visual DNA, use `@name` syntax to place them

### ⚠️ When NOT to Use Visual DNA
- **Animating an image** → `generate_video_from_image`; the source image IS the reference, don't add `visual_dna_ids`.
- **Video DNA support is limited to `generate_elements`** (Seedance 2, Kling O3 Reference, Grok Imagine). `generate_video`, `generate_video_from_image`, and `generate_first_last_frame` all ignore `visual_dna_ids` — for character-consistent video, route through `generate_elements`.

---

## Video Prompts

Video costs more per generation than images — write prompts deliberately to get it right the first time.

### Core Rules
- **Order**: Subject → Action → Camera → Style → Constraints → Audio
- **Length**: 80-280 words. Shorter = random. Longer = the model forgets the start.
- **Always specify at least one camera movement per shot.** Even "static wide shot" is a valid explicit choice — just don't leave it unsaid.
- **Character consistency**: when a character appears across shots, begin the prompt with the literal phrase `same character throughout all shots` to prevent identity drift.
- **Max 3 shots per prompt.** More shots cause the model to drift.
- **Duration-aware timecodes**: if the user gives a duration, space timecodes to fit (`[0s] [3s]` for 5s total; `[0s] [3s] [6s]` for 10s total). If no duration is given, describe shots sequentially without hardcoded timecodes.

### ⚠️ Pick the right video tool

There are SIX distinct video modes. They take different inputs and route to different model families. Pick by what the user actually has on hand:

| User has… | Use | Primary inputs | Visual DNA? |
|---|---|:-:|:-:|
| Nothing — just a text idea | `generate_video` | `prompt` (+ optional `reference_images`, `preset_id`) | **❌ No** (controller ignores DNA — use `generate_elements` if you need DNA) |
| One still image they want animated | `generate_video_from_image` | `image_url` + motion `prompt` | ✅ Yes |
| An existing video to restyle / transform | `generate_video_from_video` | `source_video` + restyle `prompt` (+ optional `reference_images`, `reference_videos`, `elements`) | ✅ Yes |
| Loose assets (products, characters, refs) to compose into a video | `generate_elements` | `prompt` + any of `reference_images`, `reference_videos`, `audio_url`, `files`, `visual_dna_ids` | ✅ Yes (PRIMARY route for DNA→video) |
| Two keyframes (start + end) — wants smooth morph between them | `generate_first_last_frame` | `first_frame_url` + `last_frame_url` (or `first_frame` + `last_frame` paths) + optional motion `prompt` | ✅ Yes |
| Image or video face + audio to dub | `generate_lipsync` | `source` (image OR video) + `audio` + optional `text_prompt` + optional `bounding_box_target` | — |

**Rule of thumb:**
- Coordinated **multi-scene** video set ("8 short clips of the character") → `generate_creative_director` with `workflow_type: "video"`, never multiple `generate_video` calls.
- Need a **character to stay the same** across multiple videos → DNA only flows through `generate_elements`, `generate_video_from_image`, `generate_video_from_video`, `generate_first_last_frame`. **NOT through `generate_video`** — text-to-video silently drops `visual_dna_ids`.

### Text-to-Video (`generate_video`)
Pure text → video. No source media. Pass `prompt`, optional `reference_images` (style/composition cue), optional `preset_id`. Use `list_models type="text_to_video"` to pick a model, then read `supported_durations`, `supported_aspect_ratios`, `supported_resolutions` on it before setting those params.

### Image-to-Video (`generate_video_from_image`)
The model can see the starting frame. Describe **what happens**, not what the image looks like. Focus on motion, camera, and action — don't re-describe the subject or setting.
- Good: "Slow dolly-in on the subject. Her hair drifts in a light breeze. Soft particles float through the air. [6s]"
- Bad: "A woman with long brown hair standing in a forest, wearing a red dress, with golden sunlight..." (re-describes the image)

DNA support: yes — `visual_dna_ids` is honored if you need to lock the character to a prior DNA profile.

### Video-to-Video (`generate_video_from_video`)
Restyle / transform an existing video. Describe the **new style**, not the original content — the model preserves the original motion.
- Good: "Transform into anime style with cel-shading and vibrant colors"
- Bad: "A person walking down a street" (re-describes what's already in the video)

Per-model extras — **call `list_models type="video_to_video"` and read these caps before passing extras**:

| Param | Read this cap | Examples |
|---|---|---|
| `reference_images` | `max_images > 0` | Kling O1/O3 (character ref), Aleph / gen4_aleph (style ref), WAN VACE (character image) |
| `reference_videos` | `max_videos > 1` | WAN 2.6 reference-to-video — accepts 1–3 reference videos |
| `elements` | `max_elements > 0` | Models that accept additional element images alongside the main video |

For models that use `reference_videos` as their *primary* input (like WAN 2.6 reference-to-video), pass the first reference video in BOTH `source_video` AND `reference_videos`.

### Elements — Reference Assets → Video (`generate_elements`)
The **primary route for character-consistent video**. Combine any of: reference images, reference videos, an audio track, Visual DNAs. Pass URLs (`reference_images`, `reference_videos`, `audio_url`) or local file paths (`files`).

Per-model caps — **call `list_models type="elements"`** and read:

| Param | Read this cap | What it means |
|---|---|---|
| `reference_images` | `elements_max_images` | Max distinct image references the model accepts |
| `reference_videos` | `elements_max_videos` | Most models = 0; non-zero for video-referenced elements models |
| `audio_url` | `elements_max_audio` | Most models = 0; non-zero for audio-driven elements models |
| `visual_dna_ids` | `max_visual_dna` | Max DNA profiles. Each DNA may expand into multiple slots — the controller distributes them across the available image slots. |

Top elements models to know: Seedance 2, Kling O3 Reference, Grok Imagine, Veo 3.1. Specs vary — never assume; always `list_models`.

### First/Last Frame (`generate_first_last_frame`)
Provide two keyframes; the model interpolates a smooth transition. Two input modes (do NOT mix):
- URL mode — `first_frame_url` + `last_frame_url`
- File mode — `first_frame` + `last_frame` (URLs or absolute local paths)

Optional `prompt` describes the desired motion (e.g. "smooth dolly-in"). DNA support: yes.

### Lipsync (`generate_lipsync`)
Sync audio to a face — works for **both image-lipsync and video-lipsync**, the tool auto-detects the source type by file extension. Pass `source` (image OR video URL/path), `audio` (URL/path), optional `text_prompt`, optional `bounding_box_target` to pick which face when there are several.

### Reference inputs combine freely
`visual_dna_ids` + `reference_images` + (where supported) `reference_videos` + `audio_url` are **additive** across all video tools that accept them. The same matrix from "Mixing References, Visual DNAs, and Moodboards" applies: DNA owns identity, reference_images own composition/style, audio_url drives sync, video references provide motion or scene context.

### UGC / Short-Form Vertical Video — Defaults

When the user asks for **UGC ads, TikTok content, Reels, Shorts, or any "creator-style" video**, snap to these defaults unless they explicitly override:

| Setting | UGC default | Why |
|---|---|---|
| `aspect_ratio` | **`"9:16"`** (vertical) | TikTok / Reels / Shorts are all vertical-first. Using 16:9 forces the user to crop or reshoot. |
| Visual aesthetic | Phone-shot, handheld, natural lighting | UGC works precisely *because* it doesn't look produced. Cinematic = wrong vibe. |
| Camera language | Slight handheld sway, selfie-arm framing, key light from window/screen | NOT slow dollies, NOT cinematic crane moves, NOT studio key light |
| Energy | "talking to a friend" — casual, direct-to-camera, occasional gestures | Not theatrical, not staged, not "model-y" |
| Captions / subtitles / text overlays | **NEVER add** unless explicitly requested | Users add captions in CapCut / TikTok native editor; baked-in captions limit reuse |
| Brand watermarks / lower-thirds / lower banners | **NEVER add** unless explicitly requested | Same reason |
| Music / SFX | Off by default unless asked | They'll layer their own audio in post |
| Length | If user gives no number, default to the model's `default_duration` (typically 5–8s for elements/v2v models). Don't extend without asking. | Shorter = more usable for the algorithm |

**Phrases in the user's prompt that activate UGC defaults:**
"UGC", "user-generated", "creator video", "TikTok", "Reels", "Shorts", "POV", "selfie video", "phone-shot", "vlogger", "talking head" (when context implies social media), "for social", "Instagram video", "YouTube short".

**Phrases that override UGC defaults** (use them as-given, not as UGC):
"commercial", "ad spot" (without UGC), "cinematic", "broadcast", "TV ad", "horizontal", "16:9", "landscape", "billboard".

**Prompt template seed for UGC:**
```
UGC selfie video, vertical 9:16, handheld phone aesthetic.
{presenter description} in {everyday setting}, {energy level}.
They {natural action with the product/subject}, talking directly to camera.
Phone-shot lighting (window/screen key light), slight handheld sway, no cinematic moves.
Style: authentic creator content, NOT polished commercial.
```

### Camera Vocabulary

Pick what fits the mood. Every shot gets at least one.

| Movement | Use for |
|----------|---------|
| `slow dolly-in` | Building intensity, focus pull |
| `pull-back` / `dolly out` | Scale reveal, loneliness, context |
| `extreme low-angle` | Power, heroic framing |
| `overhead top-down` | Geometry, pattern, abstraction |
| `360° orbit` | Product showcase, bullet-time moments |
| `handheld natural lag` | Urgency, documentary, grit |
| `tracking shot` | Continuous follow of a subject |
| `crash zoom` | Shock, impact moment |
| `aerial pull-back` | Epic reveal, landscape scale |
| `static drift` | Contemplative, subtle, meditative |
| `crane up` / `crane down` | Grandeur, establishing, dismissal |
| `whip pan` | Sharp transition, high energy |

### Physics Vocabulary (only name what matters for the scene)

- **Cloth**: `cloth inertia`, `fabric lags behind movement`
- **Water**: `water splashing with surface tension`, `droplets scattering`, `puddle mirror reflection`
- **Sand / dust**: `sand displacement`, `radial dust shockwave`
- **Hair**: `hair reacts to acceleration and wind`
- **Impact**: `skin distorting on impact`, `delayed follow-through`
- **Smoke**: `volumetric smoke curling and dissipating`

Don't stuff every category in every prompt — only name the physics that genuinely drives the shot.

### Multi-Shot Format

When the user wants a sequence (trailer, story, showcase), write each shot as a brief 1-2 sentence entry on its own line inside the prompt:

```
Shot 1: [action + camera movement]
Shot 2: [action + camera movement]
Shot 3: [action + camera movement]
```

Think like a director. Describe what **happens**, not what things **look** like.

### Mood Presets

Pick techniques that match the user's intent. A calm landscape and an action sequence need different tools.

- **Cinematic / dramatic**: slow dolly-in, anamorphic 2.39:1, shallow depth of field, volumetric light, subtle film grain
- **Product showcase**: 360° orbit, clean white or gradient backdrop, macro detail inserts, smooth tracking
- **Dreamy / ethereal**: slow crane up, soft diffused light, gentle particle drift, muted pastels, static drift moments
- **Action / intense**: crash zoom, handheld natural lag, extreme slow-motion at the peak beat, high contrast, fast cuts
- **Nature / landscape**: aerial pull-back, golden hour lighting, wind physics on foliage, wide establishing shots
- **Abstract / motion graphics**: overhead top-down, geometric patterns, bold color blocks, rhythmic cutting

### Slow-Motion

Extreme slow-motion is a tool, not a freeze frame. Always describe the micro-movements that *continue* during the slow beat (hair drifting, droplets crawling, fabric rippling), and specify the snap-back to full speed when relevant.

Format: `extreme slow-motion [Xs] — [micro-movements in ultra slow-mo] — snap-back to full speed`

---

## 3D Generation

Use `generate_3d` for creating 3D models. Three modes:
- **Text mode**: prompt-only (e.g., "a medieval sword with ornate handle")
- **Single image mode**: one reference image + optional prompt
- **Multi-view mode**: 2+ reference images for higher-quality reconstruction

Returns downloadable model files in GLB, FBX, OBJ, and USDZ formats. Use `list_models` with `type: "three_d"` to discover available models.

---

## Music Prompts

Describe **genre → mood → instrumentation → tempo → era**, in that order.

- `instrumental: true` excludes vocals.
- `lyrics` accepts actual lyric text the model should sing.
- `style` accepts short genre tags ("lo-fi hip hop", "orchestral cinematic", "80s synthwave").
- Good: "Upbeat 80s synthwave, analog synths, gated reverb drums, 120 BPM, driving bassline, no vocals"
- Bad: "A cool song" / "Something for a workout" (too vague)

---

## Speech (TTS)

- Call `list_voices` to find available voices. Filter by `provider`, `language`, or `gender`.
- Pass the returned `voice_id` (or the voice's display name like "Rachel") as the `voice` parameter in `generate_speech`.
- For multilingual content, pick a voice that supports the target language.
- For long text, split at natural sentence boundaries. Each generation has a character cap; chunk long-form content into multiple calls.

---

## Sound Effects

- Describe the sound **literally and physically**. Avoid emotional framing.
- Good: "Heavy wooden door creaking open slowly, echoing in a stone hallway, followed by distant dripping water"
- Bad: "A scary sound" / "Creepy atmosphere" (the model can't render emotions directly — render the physical source)

---

## Moodboards & Presets

**Moodboards** inject style direction as a **system-level prompt** (master prompt + style guide + reference images) — think of it as a persistent art direction layer applied on top of your generation. Pass a `moodboard_id` to any generation tool to apply its style. Moodboards can be combined with Visual DNA: the moodboard sets the overall aesthetic, while Visual DNA controls specific characters or objects.
- `list_moodboards` to browse available options
- `get_moodboard` to see full details (master_prompt, style_guide, images) before applying

**Presets** bundle prompt templates + style direction for specific creative looks. Pass a `preset_id` to generation tools.
- `list_presets` with optional `type` filter ("image", "video", "video_from_image", "music")

---

## Media Library

The library covers both **uploaded files** and **AI-generated outputs the user has saved**. Tools fall into five groups: ingest, browse, lifecycle (delete/restore/move), folders, and favorites.

### Routing — user says → call

| User says | Call |
|---|---|
| "Upload this file" / "host this" / "give me a public URL for this" | `upload_media` |
| "Show my media" / "list my images/videos" / "what do I have?" | `list_media` (pass `type` / `category` / `project_id` / `folder_id` / `search`) |
| "Show my favorites" / "list starred items" | `list_media` with `category=favorites` |
| "List everything in project X" | `list_media` with `project_id=X` |
| "List all videos in folder X" | `list_media` with `folder_id=X, type=video` |
| "What was the prompt for [item]?" / "tell me about this generation" | `get_media` |
| "How many videos do I have?" / "what's my storage usage?" | `get_media_stats` |
| "Favorite this" / "star this" / "save to favorites" | `favorite_media` |
| "Unfavorite" / "remove from favorites" / "unstar" | `unfavorite_media` |
| "Delete this" / "remove this image" | `delete_media` (soft, recoverable for 30 days) |
| "Restore it" / "undelete" / "bring it back from trash" | `restore_media` |
| "Permanently delete" / "wipe it forever" / "free up space" | **confirm with user** → `permanently_delete_media` |
| "Move this to project X" | `move_media` |
| "Clean up old [type]" / "delete everything from [time period]" | `list_media` (find ids) → **confirm** → `bulk_delete_media` |
| "Restore all from trash" | `list_media include_deleted=true` → `bulk_restore_media` |
| "Empty my trash" / "purge deleted items" | `list_media include_deleted=true` → **show count, confirm** → `bulk_permanently_delete_media` |
| "Move all these to project X" | `bulk_move_media` |
| "Move everything in folder X to project Y" | `move_folder_contents` |
| "Make a folder for X" / "create a 'campaigns' folder" | `create_media_folder` |
| "Rename folder" / "change folder color or icon" | `update_media_folder` |
| "Delete the [name] folder" | **confirm with user** → `delete_media_folder` (items stay in library) |
| "Add these to [folder]" / "put these in folder X" | `add_media_to_folder` |
| "Remove these from [folder]" | `remove_media_from_folder` |
| "Share [folder] with alice@…" | `share_media_folder` with `user_emails: [...]` |
| "Revoke [user]'s access to [folder]" | `unshare_media_folder` with `user_id` |
| "Show my folders" / "what folders do I have?" | `list_media_folders` |

### Rules and gotchas

1. **"Delete" is soft by default.** Use `delete_media` / `bulk_delete_media` for normal "delete" intent — items go to trash for 30 days and are recoverable. Only use `permanently_delete_media` / `bulk_permanently_delete_media` when the user explicitly asks for unrecoverable deletion ("permanently", "forever", "wipe", "free up space"). **Always confirm before either permanent variant.**
2. **Confirm before destructive folder ops.** `delete_media_folder` detaches items (they stay in the library) but the folder itself is gone — no undo. Confirm with the user.
3. **`bulk_move_media` is atomic.** If you get a "not all items owned by you" error, do NOT retry partially. Surface the error to the user and let them pick a smaller batch.
4. **Prefer `list_media` filters over post-filtering.** Pass `project_id` / `folder_id` / `category` / `type` / `search` to the backend; don't fetch the whole library and filter client-side.
5. **`is_favorited` is per-user.** On shared projects, an item can be favorited by you and not by your teammates — the value reflects the calling user only.
6. **"Empty trash" flow:** `list_media` with `include_deleted=true` → show the count → confirm → `bulk_permanently_delete_media`. Never call the bulk-permanent endpoint without listing first so the user knows the scope.
7. **Bulk caps:** 1000 ids for `bulk_delete_media` / `bulk_restore_media` / `bulk_permanently_delete_media` / `bulk_move_media`; 500 ids for `add_media_to_folder` / `remove_media_from_folder`. Split larger jobs into successive calls.
8. **Folder share resolution:** `share_media_folder` takes emails; users not found come back in `not_found`. Report those to the user — don't assume the share succeeded silently. Members can list/add/remove items but cannot delete the folder or reshare it.
9. **`get_media` accepts a generation_id as a fallback** for the `media_id` arg, so you can chase down items the user references by their original generation rather than by library id.

---

## Chat

Use `chat_send_message` to interact with Kolbo AI models (GPT-4o, Claude, etc.) with optional web search and deep think modes. Conversations persist via `session_id` — omit to start new, pass to continue.

**Media in chat:** Always batch all media into a single message. `media_urls` accepts up to 10 URLs per call. See the "Batching Media in Chat Messages" section above for the mandatory workflow.

Use `chat_list_conversations` and `chat_get_messages` to browse conversation history.

---

## App Builder

Use the App Builder tools to generate and iterate on full React apps from a text prompt. The backend auto-provisions a GitHub repo, Supabase database (when the app needs storage), and a live hosted deployment — all in one flow.

### Standard Workflow

1. **Find project ID**: `app_builder_list_projects` → pick the right project
2. **Create session**: `app_builder_create_session` with `project_id`
3. **Generate app**: `app_builder_generate_app` with `session_id` + `prompt`
   - Fires the build in the background, polls until `build_status === "deployed"` (up to 5 min)
   - Always surface the `deployment_url` to the user: **"Your app is live at: [url]"**
4. **Iterate**: `app_builder_list_generations` → get `generation_id` → `app_builder_edit_app` with natural language instruction

No manual polling needed — `generate_app` and `edit_app` block until the build completes.

### Local Dev Workflow

If the user wants to run the app locally or connect to the database directly:
```
app_builder_get_session(session_id) → returns:
  github_repo_url  →  git clone <url> && npm install && npm run dev
  supabase_url     →  paste into .env as NEXT_PUBLIC_SUPABASE_URL
  supabase_anon_key → paste into .env as NEXT_PUBLIC_SUPABASE_ANON_KEY
```

### ⚠️ Rules

- **Always confirm before `app_builder_delete_session`** — permanently deletes the GitHub repo, Supabase DB (unless user-connected), deployed files, and history. IRREVERSIBLE.
- **On build timeout** (rare): use `app_builder_get_build_status` to check manually, then continue or report.

Whitelabel works automatically — the MCP client routes App Builder calls through whitelabel API endpoints.

---

## Image Analysis (when the user uploads images)

When the user shares an image and asks about it:

- **Analyze thoroughly**: describe composition, subjects, colors, lighting, style, text/signage, setting, mood, visible objects, and any embedded information (charts, diagrams, screenshots).
- **Reference specific regions** when helpful: "top-left corner", "in the foreground", "the figure on the right".
- **Extract text verbatim** when asked (OCR-style requests are fine).
- **Cannot identify real people.** Describe hair, clothing, pose, expression, and apparent role — but never name a specific individual, even a well-known public figure. If the user insists, decline and offer to describe instead.
- **Copyrighted content**: summarize and reference, don't reproduce verbatim large chunks.
- If the user wants an **edit** based on the analysis, hand off to `generate_image_edit` (visual edit) or `generate_video_from_image` (motion).

---

## Limitations & Safety

- **Real people**: never identify specific real individuals in photos, even public figures. Describe visible attributes only.
- **NSFW**: Kolbo enforces content safety at the model level. If a generation fails on safety grounds, rephrase the prompt rather than retrying identically.
- **Copyright**: style references are fine (e.g. "in the style of Studio Ghibli"); verbatim reproduction of copyrighted material is not.
- **No fabricated URLs**: only share URLs that actually came back from a tool call. Never guess a URL.

---

## Sharing HTML Artifacts

HTML/SVG/Mermaid artifacts have a **Share** button in the preview toolbar that uploads the artifact and copies a permanent public URL (no login required to view). Requires the user to be authenticated (`kolbo auth login`).

---

## Kolbo Code Documentation

Full public documentation for Kolbo Code (the CLI you are running inside) lives at **[docs.kolbo.ai/docs/kolbo-code](https://docs.kolbo.ai/docs/kolbo-code)**. If the user asks about installation, authentication, voice input, supported languages, commands, or how to uninstall, point them to the matching page below rather than guessing:

| Topic | Path |
|-------|------|
| Overview & quick links | `/docs/kolbo-code` |
| Installation (npm / bun / brew / scoop / choco) | `/docs/kolbo-code/installation` |
| Sign in with Kolbo (device-code OAuth) | `/docs/kolbo-code/authentication` |
| Push-to-talk voice input (hold `space`) | `/docs/kolbo-code/voice-input` |
| 12 supported UI languages + RTL | `/docs/kolbo-code/languages` |
| Full CLI command reference | `/docs/kolbo-code/commands` |
| Uninstall + cleanup | `/docs/kolbo-code/uninstall` |

The MDX sources are in the `kolbo-docs` repo under `content/docs/kolbo-code/`. When the user's question has a concrete answer in one of those pages, cite the path and summarize — do not invent new instructions.

## Troubleshooting

### "API key is invalid or expired"
This usually means the CLI is sending a key to the wrong API endpoint.

**Common cause — whitelabel overlap:** if the user previously used regular `kolbo` and then switched to a whitelabel/partner CLI (e.g. `sapir`), the old API key may still be cached against the main Kolbo API. Running `kolbo` instead of the branded command (`sapir`) overwrites the MCP config with the wrong endpoint.

**Fix:** tell the user to re-authenticate with their branded CLI command:
```
sapir auth login
```
(Replace `sapir` with their actual CLI command.)

Then **restart the editor/session** so the MCP picks up the new key and endpoint.

**Important:** whitelabel users must always use their branded CLI command (e.g. `sapir`), not `kolbo`, to keep the MCP pointed at the correct API.

### MCP tools not responding or not found
If Kolbo tools timeout or aren't listed, the MCP server may not be wired. Tell the user to run:
```
<their-cli-command> auth login
```
This re-wires the MCP configuration automatically. Then restart the session.

### "Rate limited" (429 errors)
Wait 60s for the window to reset, retry only the failed calls. For batch image work prefer `generate_creative_director` over multiple `generate_image` calls. Full rate-limit details + retry sequence: see "Rate Limiting & Batch Generation".

---

## Examples

Natural-language triggers → tool routing:

- "Generate an image of a neon-lit Tokyo street at night" → `list_models` (image) → `generate_image`
- "Use Midjourney to generate X" → `generate_image` with model "midjourney" (user named → skip `list_models`)
- "Remove the background from this image" → `list_models` (image_edit) → `generate_image_edit`
- "Create a storyboard for a coffee brand ad" / "4 angles of this character" → `generate_creative_director`
- "Make 5 videos with Seedance 2 Fast, 15s, 16:9" → fire all 5 `generate_video` calls in parallel (skip `list_models`, skip cost confirmation)
- "Animate this product photo with a 360° orbit" → `generate_video_from_image`
- "Restyle this video as anime" → `generate_video_from_video`
- "Make this character talk with this voiceover" → `generate_lipsync`
- "Create a smooth transition between these two frames" → `generate_first_last_frame`
- "Make a lo-fi hip hop beat, instrumental, 85 BPM" → `generate_music`
- "Say this in English with a natural female voice: …" → `list_voices` → `generate_speech`
- "Generate a door slam sound effect" → `generate_sound`
- "Create a 3D model of a medieval castle" → `generate_3d`
- Transcription / SRT / "what was said" / word-by-word timing → `transcribe_audio` (see Video/Audio Analysis section for full routing)
- "Analyze this video" / "What's in this?" → `upload_media` → `chat_send_message` (see decision tree for >100MB / long / dialogue-dense exceptions)
- Multi-video analysis → upload all in parallel, then ONE `chat_send_message` with up to 10 URLs
- "Keep the same character across these images" → `create_visual_dna` → `generate_image` with `visual_dna_ids`
- "Upload this" / "Host this HTML page" / "Public URL for this file" → `upload_media` (Kolbo CDN serves any file type publicly)
- "How many credits do I have?" → `check_credits`
- Image analysis ("what's in this image?", "analyze these N frames") → `Read` directly with native vision, never `upload_media` + chat
- "Build me a todo app" / "Make a landing page with waitlist" → `app_builder_list_projects` → `app_builder_create_session` → `app_builder_generate_app` → show `deployment_url`
- "Add dark mode to my app" / "Add a contact form" → `app_builder_list_generations` → `app_builder_edit_app`
- "Give me the GitHub repo" / "Supabase credentials" → `app_builder_get_session` → return `github_repo_url` + `supabase_url` + `supabase_anon_key`
- "Create motion graphics" / "animated text" / "title sequence" → load `remotion-best-practices` skill
- "Edit this video" / "cut" / "trim" / "remove silence" / "add subtitles" / "convert to 9:16" → load `video-production` skill (FFmpeg)
- "Create a short-form video" / "make a reel" / "YouTube short" → load `short-form-video` skill
