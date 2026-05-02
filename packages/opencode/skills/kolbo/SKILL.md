---
name: kolbo
description: Generate, edit, or analyze creative media through Kolbo AI. Load this skill whenever the user asks to create, edit, prompt, or analyze images, videos, music, speech, sound effects, 3D models — or to transcribe audio/video, manage media, use Visual DNA for consistency, check credits, or browse models/presets/moodboards. It contains the MCP tool workflow and the prompt-engineering rules for each media type.
---

# Kolbo AI — Creative Generation, Analysis & Transcription

You have direct access to the Kolbo AI creative platform via MCP tools. Use them to generate and deliver real content — do NOT just describe what you would create.

**Response style:** Concise. Share URLs, costs, status — no preamble or postamble.

## Available MCP Tools

### Generation

| Tool | Description |
|------|-------------|
| `generate_image` | Create a **single** image from a text prompt. Supports Visual DNA, moodboards, reference images, web-search grounding. |
| `generate_image_edit` | Edit/transform an existing image (background removal, color changes, compositing). Pass source images + edit prompt. |
| `generate_creative_director` | **Generate 2–8 related images or videos as one coherent set.** Use INSTEAD of multiple `generate_image` calls for storyboards, campaigns, product sets, character sheets, scene variations. |
| `generate_video` | Create videos from text prompts. Does **not** support Visual DNA — use `generate_elements` for character-consistent video. |
| `generate_video_from_image` | Animate a still image into video. Prompt describes the motion, not the subject. |
| `generate_video_from_video` | Restyle/transform an existing video (style transfer, restyling, subject swap). Always `list_models type="video_to_video"` first — read `maxImages`/`maxVideos`/`maxElements`. |
| `generate_elements` | Generate video from reference assets + prompt. **Supports Visual DNA.** Always `list_models type="elements"` first — read `elementsMaxImages`/`elementsMaxVideos`/`elementsMaxAudio`. |
| `generate_first_last_frame` | Video that morphs from a first frame to a last frame. |
| `generate_lipsync` | Lipsync an audio track to a source image or video face. Accepts local files or URLs. |
| `generate_music` | Create music from descriptions. Supports instrumental, custom lyrics, style, vocal gender. |
| `generate_speech` | Convert text to speech. Default: ElevenLabs. Use `list_voices` to pick a voice. |
| `generate_sound` | Generate sound effects (foley, ambient, impacts, UI sounds). |
| `generate_3d` | Generate 3D models from text, single image, or multi-view images. Returns GLB, FBX, OBJ, USDZ. |

### Editing

| Tool | Description |
|------|-------------|
| `edit_image` | Targeted AI edit: `upscale` (2×–4×), `reframe`, `removebg`, `enhance_skin`, `magic_edit`. Faster/cheaper than `generate_image_edit` for these specific ops. |
| `edit_video` | Targeted AI edit: `upscale`, `reframe`, `generate_audio`, `remove_watermark`, `face_swap`, `extend`, `magic_edit`, `lipsync`. |

### Transcription, Discovery & Utilities

| Tool | Description |
|------|-------------|
| `transcribe_audio` | Transcribe audio/video → text + SRT + word-by-word SRT. |
| `list_models` | Browse AI models filtered by type. |
| `list_voices` | List TTS voices (filter by provider, language, gender). |
| `check_credits` | Check remaining Kolbo credit balance. |
| `get_generation_status` | Poll an in-progress generation by ID (fallback for timeouts). |
| `upload_media` | Upload any local file to Kolbo CDN → public URL. Works for images, videos, audio, HTML, any file type. |
| `list_media` | Browse uploaded media (filter by type, search). |

### Visual DNA, Moodboards & Chat

| Tool | Description |
|------|-------------|
| `create_visual_dna` | Create a Visual DNA profile from reference images/video/audio. |
| `list_visual_dnas` | List Visual DNA profiles (id, name, type, thumbnail). |
| `get_visual_dna` | Fetch full profile details. |
| `delete_visual_dna` | Delete a Visual DNA profile. |
| `list_moodboards` | List moodboards (personal, system, org). |
| `get_moodboard` | Fetch moodboard details (master_prompt, style_guide, images). |
| `list_presets` | Browse generation presets (image/video/music). |
| `chat_send_message` | Send message to Kolbo AI chat. Pass `media_urls` (public URLs) to analyze video/audio. Omit `model` for Smart Select. |
| `chat_list_conversations` | List SDK chat conversations. |
| `chat_get_messages` | Fetch messages in a conversation. |

### App Builder

| Tool | Description |
|------|-------------|
| `app_builder_list_projects` | List Kolbo projects → find `project_id`. |
| `app_builder_create_session` | Create App Builder session → returns `session_id`. |
| `app_builder_generate_app` | Generate full React app from prompt. Polls until deployed, returns live URL. |
| `app_builder_edit_app` | Edit existing app with natural language instruction. |
| `app_builder_get_build_status` | Check build status (fallback after timeout). |
| `app_builder_get_session` | Get session details: GitHub repo URL, Supabase connection info. |
| `app_builder_list_sessions` | List all App Builder sessions in a project. |
| `app_builder_list_generations` | List generations for a session (needed for `edit_app`). |
| `app_builder_delete_session` | Permanently delete a session and all resources. IRREVERSIBLE. |

---

## ⚠️ Local vs Cloud — Use the Right Tool

**Default to local tools. Only use Kolbo AI when you actually need AI generation.**

| Task | Use | NOT this |
|------|-----|---------|
| Trim / cut / merge / speed / crop / convert / extract audio / add subtitles / resize / format convert | `video-production` skill → **FFmpeg** | ❌ Kolbo tools |
| Add text overlay / logo / watermark deterministically | **FFmpeg** drawtext/overlay | ❌ `edit_video` |
| Resize or compress an image | **Sharp / ImageMagick / ffmpeg** | ❌ `edit_image` |
| Create motion graphics / animated text / title sequence | `remotion-best-practices` skill | ❌ `generate_video` |
| Create short-form video (edit-based) | `short-form-video` skill | ❌ `generate_video` |
| Analyze an **image** | **`Read` tool directly** — you have built-in vision | ❌ `upload_media` + chat |
| **AI background removal** (no hard edges needed) | `edit_image removebg` | ✓ |
| **AI upscale** (beyond normal resize quality) | `edit_image upscale` / `edit_video upscale` | ✓ |
| **AI face swap / style transfer / audio generation** | `edit_video` operations | ✓ |
| Generate new content from scratch | Kolbo generation tools | ✓ |

**Rule of thumb:** If the operation is deterministic (same input = same output every time), use a local tool. If it requires AI inference to produce the result, use Kolbo.

---

## ⚠️ Generate vs Edit

| User intent | Action |
|-------------|--------|
| "Create a video from scratch" | `generate_video` |
| "Edit / Cut / Trim / Crop / Merge / Subtitles / Speed / Convert" | `video-production` skill → FFmpeg |
| "Animate this image" | `generate_video_from_image` |
| "Restyle this video as anime" | `generate_video_from_video` |
| "Upscale image" / "Remove background (AI)" / "Retouch skin" | `edit_image` |
| "Upscale video" / "Add AI audio" / "Extend video" / "Swap face" | `edit_video` |

**`generate_video` creates NEW video from text. It cannot edit, cut, trim, or modify existing files.**

---

## ⚠️ Critical Rules

### Never Duplicate a Generation
Before calling any generation tool, check conversation history. If you already called it with the same/similar prompt:
- **Do NOT call again** — even if aborted (still running server-side)
- Only retry if user explicitly says "retry", "redo", or "try again"
- If unsure, use `get_generation_status` — the API returns 202 immediately and processes in the background

### Parallel Batch vs Sequential Pipeline

**Parallel batch** (independent same-type outputs) → fire all calls in one response:
- "Make 5 images of different landscapes" → all 5 `generate_image` calls at once ✓

**Sequential pipeline** (step N output feeds step N+1, or each stage is a distinct creative decision) → **pause after each stage, show result, wait for approval:**
- "Generate an image, then animate it, then add music" → generate → show → confirm → animate → show → confirm → music
- "Create Visual DNA then make 4 videos" → create → show → confirm → generate videos
- Any workflow where step 2 uses step 1's URL/ID and involves a new creative direction

**Exception:** user says "do it all automatically" or "run the whole pipeline" → execute without pausing.

---

## Core Workflow

1. **Check credits** once per conversation (`check_credits`). Skip if already checked.
2. **Discover models** (`list_models type="..."`) — skip when user names a specific model.
3. **Pick the model:**
   - User named a model → use it directly, no questions
   - Auto-select → only from **"Auto-selectable"** models (those with a `summary` in results). Prefer `[RECOMMENDED]`.
   - Never auto-select from **"Named-only"** models (no summary = no quality signal)
4. **Generation calls block** until complete (images: seconds; video: 1–5 min). Multiple tool calls in one response run concurrently.
5. **Share the URL** — hand the real URL back. Never fabricate URLs.

### Model Types (for `list_models`)

| DB Type | Use for |
|---------|---------|
| `text_to_img` | Image generation |
| `image_editing` | Image editing |
| `text_to_video` | Text-to-video |
| `img_to_video` | Image-to-video animation |
| `draw_to_video` | Draw-to-video (Hailuo, Seedance variants) |
| `video_to_video` | Video restyling / style transfer |
| `elements` | Reference-to-video (Visual DNA-driven) |
| `firstlastgenerations` | Keyframe interpolation |
| `lipsync-image` / `lipsync-video` | Lipsync (`lipsync` alias returns both) |
| `music_gen` | Music generation |
| `text_to_speech` | TTS |
| `text_to_sound` | Sound effects |
| `stt` | Transcription |
| `text` | Chat / language models |
| `3d_text_to_model` / `3d_image_to_model` / `3d_multi_image_to_model` / `3d_world` | 3D (`three_d` alias returns all four) |

---

## Cost & Billing

| Type | Billing unit | Credit range |
|------|-------------|-------------|
| Image | per image (flat) | 1–30 cr |
| Image edit | per image (flat) | 2–20 cr |
| Video / Video-from-image / Elements / Lipsync | **cr/s × duration** | 2–30 cr/s |
| Music | per generation (flat) | 15–60 cr |
| Speech (TTS) | per 100 characters | 2–5 cr/100 chars |
| Sound effects | per generation (flat) | 4–7 cr |
| 3D model | per model (flat) | 5–300 cr |
| Transcription | model.credit × duration_minutes | — |

**Formulas:**
- **Video/Lipsync**: `total = model_credit_per_second × duration_seconds` — never assume flat cost
- **TTS**: `total = model_credit × ceil(character_count / 100)`
- **Images/3D/Sound**: `total = model_credit × quantity`
- **Music**: flat — `total = model_credit`

**Skip confirmation when:** user specified everything (model + count + duration) — that IS the confirmation · single generation under 5 credits.

**Confirm when:** everything else — "This will generate X × Y using [model] at Z cr/s = **N credits total**. Proceed?" Suggest cheaper alternatives. For 100+ credit batches, run `check_credits` first.

---

## Rate Limiting & Batch Generation

**Limits:** 30 req/min images · 10 req/min per other type · 300 req/min global · `upload_media` 300/min (no credits). The API queues requests — it never silently drops them.

**Batch workflow (≤10 items):**
1. Confirm cost once (skip if user specified everything)
2. Output ALL tool calls in one response — they run concurrently
3. Never re-fire completed/in-progress generations
4. On 429: wait 60s, retry only failed calls (max 2 retries)

**Multi-image decision:**
- General brief ("make 4 product shots", "character in 4 settings") → `generate_creative_director` with `scene_count`
- Explicit separate prompts → parallel `generate_image` calls

**⚠️ Parameter names:**
- `generate_image` → `num_images` (1–4): same prompt, different seeds (variations of one image)
- `generate_creative_director` → `scene_count` (1–8): each scene gets its own distinct prompt. Never pass `num_images` to it.

After `generate_creative_director`: list each scene's URL on a separate line. Do NOT create an HTML grid.

**Don't narrate, just generate.** No "Generating Video 1 of 5…" — just call the tools. On interruption: pick up where you left off, skip already-fired calls, never restart from the beginning.

---

## Post-Video: Remotion Studio Offer

After any of these completes successfully with a video URL: `generate_video`, `generate_video_from_image`, `generate_elements`, `generate_first_last_frame`, `generate_lipsync`, `edit_video`

**Append one offer line:** "Want to add text, captions, or effects in Remotion Studio? I can set it up and open it for you."

Skip when: user already requested further editing · generation failed · user said they only want the raw video.

### If user accepts — full workflow

**Step 1 — Get video metadata** (in parallel with writing the composition):
```bash
# Use getVideoMetadata from @remotion/media-utils, or extract with ffprobe:
ffprobe -v quiet -print_format json -show_streams "VIDEO_URL"
# → read duration (seconds), width, height
# durationInFrames = Math.ceil(duration * fps)
```

**Step 2 — Write the composition** into `kolbo-code/src/remotion/Root.tsx`.  
Update `defaultProps.code` with your JSX, and set `durationInFrames`, `width`, `height` to match the source video:

```tsx
// kolbo-code/src/remotion/Root.tsx
const videoCode = `
import { AbsoluteFill, OffthreadVideo } from "remotion";
export const MyAnimation = () => (
  <AbsoluteFill>
    <OffthreadVideo src="https://cdn.kolbo.ai/your-video.mp4" />
    {/* Add overlays, captions, or effects here */}
  </AbsoluteFill>
);`;

<Composition
  id="DynamicComp"
  component={DynamicComp}
  durationInFrames={150}   // ← actual video duration in frames
  fps={30}
  width={1280}             // ← actual video width
  height={720}             // ← actual video height
  defaultProps={{ code: videoCode }}
  calculateMetadata={({ props }) => ({
    durationInFrames: props.durationInFrames as number,
    fps: props.fps as number,
  })}
/>
```

Use `<OffthreadVideo>` not `<Video>` — `<Video>` uses a browser element and stutters during frame-accurate Remotion renders.

**Step 3 — Start Remotion Studio in the background:**
```bash
cd kolbo-code && npx remotion studio &
# Studio boots at http://localhost:3000
```

**Step 4 — Wait ~3 seconds, then open the browser automatically:**
```bash
# Windows:
start http://localhost:3000
# macOS:
open http://localhost:3000
# Linux:
xdg-open http://localhost:3000
```

**Step 5 — Tell the user exactly what they're looking at:**
> "Remotion Studio is open at **http://localhost:3000** — your video is loaded in the canvas. Use the timeline to scrub through it. When you're happy with the composition, tell me and I'll render the final video file."

**Never say "open the URL from terminal output"** — users don't know what that means. Always open the browser programmatically and give them the direct link.

### What to offer when user is in Studio
- Animated captions / karaoke (pair with `transcribe_audio` → `word_by_word_srt_url`)
- Text overlays / lower-thirds with spring-physics animations
- Color grading via CSS filters
- Intro/outro title cards
- Music sync (`<Audio src={musicUrl} />` from `generate_music`)

### Rendering when user approves
```bash
cd kolbo-code && npx remotion render DynamicComp output.mp4
```
Then share the local path with the user.

---

## Transcription & Audio/Video Analysis

Use `transcribe_audio` ONLY when user explicitly asks for: text transcript · SRT subtitles · word-by-word timed subtitles · what was **spoken** in the video.

**Do NOT use for visual analysis.** For visual analysis of video/audio → `upload_media` → `chat_send_message`.

**Workflow:**
1. `transcribe_audio({ source: "url-or-absolute-path" })`
2. Returns: `text` · `srt_url` · `word_by_word_srt_url` (ElevenLabs Scribe v2, one word per entry — ideal for karaoke, Remotion captions, precise cut points) · `txt_url` · `duration`

**Formats:** Audio: mp3/wav/m4a/flac/aac · Video: mp4/mov/webm/mkv/avi/m4v · Max: 30 min

### Visual Media Analysis

| Media type | How to analyze |
|------------|----------------|
| **Image** | `Read` tool directly — you have built-in vision. **Always first choice. Never upload for image analysis.** |
| **Video / Audio** | `upload_media` → `chat_send_message` with `media_urls` (Gemini auto-routes) |
| **Transcription** | `transcribe_audio` only when user explicitly asks for spoken content |

**NEVER use ffmpeg or frame extraction for analysis.**

**Batching media in chat (CRITICAL):** Upload all files in one response (all `upload_media` calls at once), collect all CDN URLs, then ONE `chat_send_message` with all URLs in `media_urls` (max 10). Never send one message per file — it triggers rate limits.

**Local file editing:** Check for `[Image local path: ...]` / `[Video attached — local path: ...]` in conversation — use that path directly with ffmpeg/tools. If not available, use the CDN URL directly. Always use absolute paths with `upload_media`. Upload each output file exactly once.

**`media_urls` only accepts CDN URLs** — never pass local file paths, never construct URLs yourself, never use a transcription `.txt` URL as the video URL.

---

## Image & Video Editing Operations

| User says | Tool | `operation` |
|-----------|------|-------------|
| "Upscale image" / "Make it 2×/3×/4×" | `edit_image` | `upscale` + `scale` |
| "Reframe for Instagram" / "Crop to 16:9" | `edit_image` | `reframe` + `aspect_ratio` |
| "Remove background (AI)" | `edit_image` | `removebg` |
| "Retouch skin" / "Smooth portrait" | `edit_image` | `enhance_skin` + `skin_strength` |
| "Add sunglasses" / "Change sky to sunset" | `edit_image` | `magic_edit` + `prompt` |
| "Upscale video to 4K" | `edit_video` | `upscale` |
| "Change video to 9:16" | `edit_video` | `reframe` + `aspect_ratio` |
| "Add AI audio to video" | `edit_video` | `generate_audio` + `prompt` |
| "Remove watermark" | `edit_video` | `remove_watermark` |
| "Swap face with [image]" | `edit_video` | `face_swap` + `image_url` |
| "Extend / lengthen video" | `edit_video` | `extend` + `duration` |
| "Restyle video with prompt" | `edit_video` | `magic_edit` + `prompt` |
| "Sync audio to face" | `edit_video` | `lipsync` + `audio_url` |

`edit_image` = single-op AI edits (faster/cheaper) · `generate_image_edit` = general prompt-based compositing with source images.

---

## Image Prompts

- **No meta-language:** no "Output:", "Tips:", "Notes:", "Resolution:", "Dimensions:" inside prompts.
- **Order:** Subject → action/pose → environment → lighting → style.
- **Length:** 2–3 focused sentences. Go longer only for genuinely complex scenes.
- **Style specifics:** "1970s film photography" not "beautiful".
- **`enhance_prompt: true`** (default) improves most prompts. Turn off only if user's prompt is already engineered.

**Image-to-image:** Describe the change, not the image content.
- ✓ "Turn the sky orange and add drifting clouds"
- ✗ "A mountain landscape with an orange sky" (re-describes what's already there)

---

## Visual DNA (Character/Style Consistency)

**Workflow:** `create_visual_dna` (max 4 reference images) → use `id` in `visual_dna_ids` for `generate_image`, `generate_creative_director`, `generate_elements`.

Types: `character` (default) · `style` · `product` · `scene` · `environment`

### ⚠️ @name Syntax — CRITICAL for Multi-Visual-DNA Prompts

When using multiple Visual DNA profiles, reference each by name in the prompt:
```
"@dana walks into @shop and picks up a product from the shelf"
```
- Names are set in `create_visual_dna` (`name` field)
- Use `@name` (lowercase, no spaces) inline in prompt
- **Without `@name`, the engine blends all Visual DNAs indiscriminately**

### ⚠️ Always Generate Reference Images First (MANDATORY)

Before `create_visual_dna` for a character, fire both in parallel:
1. **4-angle sheet:** `"[character], reference sheet: front/back/left/right views, 2×2 grid, neutral background, full body, photorealistic"` · 16:9
2. **Close-up portrait:** `"[character], close-up portrait, face and shoulders, neutral background, soft studio lighting, photorealistic"` · 1:1

Then `create_visual_dna` with: 4-angle sheet first, close-up second, plus user's reference photos if provided. Skip only if user says "use my image as-is" or already provides 3+ multi-angle references.

### maxVisualDna Limits

| Model type | Max |
|------------|-----|
| Image (non-Kling) | 8 |
| Kling image | 3 |
| Elements video | 3–5 (model-dependent) |
| All other | 3 |

Always check `maxVisualDna` from `list_models`.

### When to Use
- Same character across images/campaign → `generate_image` / `generate_creative_director` with `visual_dna_ids`
- Character-consistent video → `generate_elements` with `visual_dna_ids`
- User says "keep the same look", "same character", "use that character"
- Character in a specific environment → create character DNA + environment DNA, use `@name` syntax

### ⚠️ When NOT to Use Visual DNA
- **Animating an image** → `generate_video_from_image` (source image IS the reference)
- **`generate_video`** — does not support Visual DNA at all. Never pass `visual_dna_ids`.
- **`generate_video_from_image`** / **`generate_first_last_frame`** — keyframes serve as reference
- Only `generate_elements` supports Visual DNA for video

---

## Video Prompts

### Core Rules
- **Order:** Subject → Action → Camera → Style → Constraints → Audio
- **Length:** 80–280 words. Shorter = random. Longer = model forgets the start.
- **Always specify at least one camera movement per shot** — even "static wide shot" counts.
- **Max 3 shots per prompt** — more causes drift.
- **Character consistency:** begin prompt with `same character throughout all shots`.
- **Duration timecodes:** `[0s] [3s]` for 5s total; `[0s] [3s] [6s]` for 10s total.

### Video-to-Video Model Capabilities (CRITICAL)

Always `list_models type="video_to_video"` first:

| Field | What to pass |
|-------|-------------|
| `maxImages > 0` | `reference_images` array |
| `maxVideos > 1` | `reference_videos` array (extras beyond source) |
| `maxElements > 0` | `elements` array |

### Elements Model Capabilities (CRITICAL)

Always `list_models type="elements"` first:

| Field | What to pass |
|-------|-------------|
| `elementsMaxImages` | `reference_images` array |
| `elementsMaxVideos` | `reference_videos` array |
| `elementsMaxAudio > 0` | `audio_url` string |

### Camera Vocabulary

| Movement | Best for |
|----------|---------|
| `slow dolly-in` | Intensity, focus pull |
| `pull-back` / `dolly out` | Scale reveal, context |
| `overhead top-down` | Geometry, pattern, abstraction |
| `360° orbit` | Product showcase, bullet-time |
| `handheld natural lag` | Urgency, documentary |
| `tracking shot` | Subject follow |
| `crash zoom` | Shock, impact |
| `aerial pull-back` | Epic reveal, landscape scale |
| `extreme low-angle` | Power, heroic framing |
| `crane up` / `crane down` | Grandeur, establishing |

### Physics Vocabulary (only name what's relevant)

- **Cloth:** `cloth inertia`, `fabric lags behind movement`
- **Water:** `water splashing with surface tension`, `droplets scattering`
- **Hair:** `hair reacts to acceleration and wind`
- **Impact:** `skin distorting on impact`, `delayed follow-through`
- **Smoke:** `volumetric smoke curling and dissipating`

### Slow-Motion Format

`extreme slow-motion [Xs] — [micro-movements in ultra slow-mo] — snap-back to full speed`

### Multi-Shot Format

```
Shot 1: [action + camera movement]
Shot 2: [action + camera movement]
Shot 3: [action + camera movement]
```

Describe what **happens**, not what things **look** like.

### By Video Type

- **Image-to-video:** Describe motion/camera — not what the image looks like.
- **Video-to-video restyle:** Describe the **new style** — model preserves original motion.
- **Elements:** Pass reference assets as `reference_images` (URLs) or `files` (local paths).
- **First/Last Frame:** Describe the transition/motion between the two keyframes.
- **Lipsync:** Both `source` (face) and `audio` accept URLs or local paths.

**Presets:** `generate_image`, `generate_video`, `generate_music` all accept `preset_id`. Use `list_presets type="image/video/music"` to discover.

---

## 3D Generation

Three modes: **text** (prompt-only) · **single image** + optional prompt · **multi-view** (2+ images, higher quality). Returns GLB, FBX, OBJ, USDZ. Discover models: `list_models type="three_d"`.

---

## Music, Speech & Sound

**Music:** genre → mood → instrumentation → tempo → era. `instrumental: true` excludes vocals. `lyrics` accepts lyric text. `style` accepts tags ("lo-fi hip hop", "80s synthwave").

**Speech (TTS):** `list_voices` → filter by provider/language/gender → pass `voice_id` to `generate_speech`. Split long text at sentence boundaries.

**Sound:** Describe **literally and physically** — not emotionally.
- ✓ "Heavy wooden door creaking open slowly, echoing in a stone hallway"
- ✗ "A scary sound"

---

## App Builder

1. `app_builder_list_projects` → find project ID
2. `app_builder_create_session` with `project_id`
3. `app_builder_generate_app` — polls until deployed, returns `deployment_url`. **Always surface this URL.**
4. Iterate: `app_builder_list_generations` → `app_builder_edit_app` with natural language

**Local dev:** `app_builder_get_session` → `github_repo_url`, `supabase_url`, `supabase_anon_key`

⚠️ **Always confirm before `app_builder_delete_session`** — permanently deletes GitHub repo, Supabase DB, all history. IRREVERSIBLE.

---

## Image Analysis

Analyze: composition, subjects, colors, lighting, style, text/signage, mood. Reference specific regions. Extract text verbatim when asked. **Cannot identify real people** — describe visible attributes only.

---

## Limitations & Safety

- **Real people:** never identify specific individuals. Describe visible attributes only.
- **NSFW:** rephrase on safety failure, don't retry identically.
- **Copyright:** style references fine; verbatim reproduction not.
- **No fabricated URLs:** only share URLs returned from tool calls.

---

## Sharing HTML Artifacts

A **Share** button appears in artifact previews (HTML, SVG, Mermaid). Clicking it uploads to Kolbo hosting and copies a permanent public URL. Requires `kolbo auth login`.

---

## Kolbo Code Documentation

Docs at **[docs.kolbo.ai/docs/kolbo-code](https://docs.kolbo.ai/docs/kolbo-code)**:

| Topic | Path |
|-------|------|
| Overview | `/docs/kolbo-code` |
| Installation | `/docs/kolbo-code/installation` |
| Authentication | `/docs/kolbo-code/authentication` |
| Voice input | `/docs/kolbo-code/voice-input` |
| Languages | `/docs/kolbo-code/languages` |
| CLI commands | `/docs/kolbo-code/commands` |
| Uninstall | `/docs/kolbo-code/uninstall` |

---

## Troubleshooting

**"API key is invalid or expired":** Whitelabel CLI overlap — user ran `kolbo` instead of their branded command (e.g. `sapir`). Fix: `sapir auth login` then restart session.

**MCP tools not responding:** Run `<their-cli-command> auth login` to re-wire MCP config. Restart session.

**429 Rate limited:** Wait 60s (window resets), retry only failed calls. Use `generate_creative_director` instead of multiple `generate_image` calls.

---

## Examples (non-obvious routing only)

- "Make 5 videos with Seedance 2 Fast, 15s, 16:9" → fire all 5 `generate_video` calls in parallel (user specified everything — skip `list_models`, skip cost confirmation)
- "Create a storyboard for a coffee brand ad" → `list_models` (image) → `generate_creative_director` with `scene_count`
- "Put this character in 4 different scenes" → generate 4-angle sheet + portrait → `create_visual_dna` → `generate_creative_director` with `visual_dna_ids` + `scene_count: 4`
- "Restyle this video as anime" → `list_models type="video_to_video"` → `generate_video_from_video` (read `maxImages`/`maxVideos` first)
- "Add text to this video" → `video-production` skill → **FFmpeg drawtext** (not `edit_video`)
- "Resize this image to 1080×1080" → **Sharp / ImageMagick** (not `edit_image`)
- "Convert this video to mp4" → **FFmpeg** (not any Kolbo tool)
- "What's in this image?" → **`Read` tool directly** (not `upload_media` + chat)
- "Analyze these 5 videos" → `upload_media` all 5 in one response → ONE `chat_send_message` with all 5 URLs
- "Transcribe this podcast" → `transcribe_audio` → analyze returned `text`
- "Word-by-word subtitles for Remotion" → `transcribe_audio` → share `word_by_word_srt_url`
- "Build me a todo app" → `app_builder_list_projects` → `app_builder_create_session` → `app_builder_generate_app` → show `deployment_url`
- "Edit this video / cut / remove silence / add subtitles" → `video-production` skill → FFmpeg
- "Create motion graphics / animated text" → `remotion-best-practices` skill
