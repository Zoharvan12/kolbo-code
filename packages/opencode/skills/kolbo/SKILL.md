---
name: kolbo
description: Generate, edit, or analyze creative media through Kolbo AI. Load this skill whenever the user asks to create, edit, prompt, or analyze images, videos, music, speech, sound effects, 3D models — or to transcribe audio/video, manage media, use Visual DNA for consistency, check credits, or browse models/presets/moodboards. It contains the MCP tool workflow and the prompt-engineering rules for each media type.
---

# Kolbo AI — Creative Generation, Analysis & Transcription

You have direct access to the Kolbo AI creative platform via MCP tools (auto-configured by `kolbo auth login`). Use them to generate and deliver real content — do NOT just describe what you would create.

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
| `upload_media` | Upload ANY local file to Kolbo CDN → returns a public URL. Works for images, videos, audio, HTML, documents — any file type. Use for: feeding media to `chat_send_message`, sharing files publicly, hosting HTML pages, or multi-tool workflows. |
| `list_media` | Browse user's uploaded media with filtering by type and search. |

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

## ⚠️ Generate vs Edit — Know the Difference

| User intent | Action | NOT this |
|-------------|--------|----------|
| "Create a video from scratch" / "Generate a video of..." | `generate_video` (Kolbo MCP) | — |
| "Edit this video" / "Cut" / "Trim" / "Crop" / "Merge" / "Add subtitles" / "Remove silence" / "Speed up" / "Convert to 9:16" | Load `video-production` skill → FFmpeg | ❌ Do NOT call `generate_video` |
| "Create motion graphics" / "Animated text" / "Title sequence" | Load `remotion-best-practices` skill → Remotion | ❌ Do NOT call `generate_video` |
| "Animate this image" / "Make this photo move" | `generate_video_from_image` (Kolbo MCP) | — |
| "Restyle this video as anime" | `generate_video_from_video` (Kolbo MCP) | — |

**`generate_video` creates NEW videos from text prompts. It cannot edit, cut, trim, merge, or modify existing video files.** For any operation on an existing video file, use FFmpeg via the `video-production` skill.

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
| **Image** | per image (flat) | 1–30 cr | Flux.1 Fast = 1 cr, Midjourney = 4 cr, 4K variants cost more |
| **Image edit** | per image (flat) | 2–20 cr | |
| **Video** | **cr/s × duration** | 2–30 cr/s | Kandinsky 5 Fast × 5s = 10 cr; Seedance 2.0 × 10s = 300 cr |
| **Video from image** | **cr/s × duration** | 4–30 cr/s | Same per-second rule as text-to-video |
| **Elements (ref-to-video)** | **cr/s × duration** | 4–30 cr/s | Same per-second billing as video — check `credit` in `list_models type="elements"` |
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

**Cost confirmation — know when to skip it:**
- **User specified everything** (model, count, duration, e.g. "make 5 videos, seedance 2 fast, 15s, 16:9"): **ACT IMMEDIATELY** — that IS the confirmation. Do not re-explain costs or ask again.
- **Single generation under 5 credits**: proceed without confirmation.
- **Everything else**: calculate total cost, present a summary, and wait for the user to confirm before generating.
- **Batch totalling 100+ credits**: run `check_credits` before starting to verify the balance is sufficient, and include the available balance in your cost summary.

**When confirmation IS needed:**
1. Calculate per-item cost using the formulas above.
2. Multiply by the number of items.
3. Present a summary: "This will generate 8 videos × 5s each using [model] at X cr/s = **Y credits total**. Proceed?"
4. **Suggest cheaper alternatives** if available.
5. Only proceed after the user confirms.

### Rate Limiting & Batch Generation (CRITICAL)

**Rate limits** (per user, enforced server-side):
- **Image generation**: 30 requests per minute (higher because images are fast and cheap)
- **All other generation types**: 10 requests per minute per type (e.g. 10 video + 10 image = fine, but 11 video in 1 minute = 429)
- **300 requests per minute** global across all media endpoints
- **Uploads** (`upload_media`): 300/min, no credit cost — much lighter than generation
- The API **queues** requests internally — it never silently drops them. If you're within limits, every request will be processed.

**⚠️ NEVER duplicate a generation you already fired.**
Before calling any generation tool, check your conversation history. If you already called that tool with the same or similar prompt in this session:
- Do NOT call it again — even if it was aborted or interrupted (it is still running server-side and will complete)
- Only retry if the user explicitly says "retry", "redo", or "try again"
- Each duplicate wastes real credits from the user's balance
- If unsure whether a generation went through, use `get_generation_status` to check — the API returns 202 immediately and processes in the background, so aborted tool calls still generate

**Batch generation workflow (≤10 items):**
1. Confirm cost ONCE — or skip if the user already specified model, count, and duration (e.g. "make 5 videos, seedance 2 fast, 15s" IS the confirmation — act immediately)
2. **Output ALL generation tool calls in a single response** — up to 10 per tool type. The system runs them concurrently, so 5 videos render in parallel and finish in the time of the slowest one, not 5× the time.
3. Each call blocks until its generation is complete (images: seconds, video: 1-5 minutes). This is normal — don't apologize for the wait.
4. Track what you've generated — never re-fire a completed or in-progress generation.
5. After all complete, present all results together.
6. If any fail with 429: wait 60 seconds and retry only the failed ones (max 2 retries).

**Multi-image decision:**
- User gives a **general brief** ("make 4 product shots", "create a storyboard", "show the character in 4 different settings") → use `generate_creative_director` with `scene_count`. Pass `visual_dna_ids` to keep a character consistent across all scenes.
- User gives **explicit separate prompts** ("Image 1: X, Image 2: Y, Image 3: Z") → fire all as **parallel `generate_image` calls** in one response
- Never call `generate_image` sequentially in a loop — either use `generate_creative_director` or fire all calls in one parallel batch

**⚠️ Parameter names — do NOT confuse these:**
- `generate_image` → `num_images` (1–4): all images use the **same prompt**, just different random seeds — use this for "give me 4 variations of this image"
- `generate_creative_director` → `scene_count` (1–8): each scene gets its **own distinct prompt** — use this for "make 8 different campaign shots" OR "show the character in 8 different scenes/outfits/moods". Always pass `visual_dna_ids` when character consistency matters. **Never pass `num_images` to `generate_creative_director`.**

**After `generate_creative_director` completes — share results as individual URLs, one per scene. Do NOT create an HTML grid artifact or any combined layout. Just list each scene's title and its image URL on separate lines.**

**Don't narrate, just generate.** When the user says "make 5 videos", output all 5 tool calls in one response. Don't explain your plan, don't calculate step-by-step, don't say "Generating Video 1 of 5..." — just call the tools.

**Handling interruptions:** If the user aborts or interrupts mid-batch (e.g. cancels Video 1, then says "do the rest" or "continue with 2-5"), pick up where you left off. Check which generations you already fired, skip those, and fire only the remaining ones. Never restart a batch from the beginning. Remember: aborted tool calls still process server-side — don't re-fire them.

---

## Transcription & Audio/Video Analysis

Use `transcribe_audio` ONLY when the user explicitly asks for:
- A text transcript
- Subtitles (SRT format)
- Word-by-word timed subtitles (for karaoke, motion graphics, Remotion captions, video editing)
- Summary of what was **spoken/said** in the video
- Dialogue extraction from video

**Do NOT use `transcribe_audio` to "analyze" a video visually.** For visual analysis **of videos or audio**, use `upload_media` → `chat_send_message` with `media_urls`. For **images**, use the `Read` tool directly — you have built-in vision.

### Workflow
1. Call `transcribe_audio` with the `source` (URL or absolute local file path)
2. The tool returns:
   - `text` — full transcript as plain text
   - `srt_url` — download URL for grouped SRT subtitles (configurable words-per-line)
   - `word_by_word_srt_url` — download URL for **word-by-word SRT** (one word per subtitle entry with precise timestamps from ElevenLabs Scribe v2)
   - `txt_url` — download URL for plain text file
   - `duration` — audio duration in seconds
3. Analyze the transcript text as needed (summarize, translate, extract topics, answer questions about content)

### Supported Formats
- **Audio**: mp3, wav, m4a, flac, aac
- **Video** (extracts audio track): mp4, mov, webm, mkv, avi, m4v

### Word-by-Word Transcription
The `word_by_word_srt_url` contains an SRT file where each subtitle entry is a **single word** with precise start/end timestamps (powered by ElevenLabs Scribe v2). This is ideal for:
- **Karaoke-style captions** — highlight one word at a time
- **Remotion/motion graphics** — animate text word-by-word synced to audio
- **Video editing** — precise cut points aligned to speech
- **Accessibility** — word-level navigation for hearing-impaired users

The regular `srt_url` groups words into readable subtitle lines (default 12 words per line, up to 2 lines per subtitle).

### Use Cases & Examples
- "Transcribe this podcast" → `transcribe_audio` with the audio URL
- "What's being said in this video?" → `transcribe_audio` → analyze the returned text
- "Generate subtitles for my video" → `transcribe_audio` → share the `srt_url`
- "I need word-by-word timing for this audio" → `transcribe_audio` → share `word_by_word_srt_url`
- "Summarize this meeting recording" → `transcribe_audio` → summarize the text
- "Extract key points from this lecture" → `transcribe_audio` → analyze and extract

### Long Content
Transcription supports files up to 30 minutes. For longer content, split the file first or provide segments.

### Visual Video/Audio/Image Analysis

**The agent has built-in vision — ALWAYS prefer your own model for images:**

| Media type | How to analyze |
|------------|----------------|
| **Image** (jpg, png, webp, etc.) | **Read it directly with the `Read` tool** — you see images natively. No upload, no API call, no rate-limit risk. This is ALWAYS the first choice for images. |
| **Video / Audio** | `upload_media` → `chat_send_message` with `media_urls` (Gemini handles video/audio) |
| **Transcription** | `transcribe_audio` — ONLY when user explicitly says "transcribe", "subtitles", "SRT", or "what's being said" |

**⚠️ Image analysis priority: YOUR OWN VISION FIRST.**
You are a multimodal model — you can see and analyze images directly via the `Read` tool. This is faster, free, and avoids API rate limits. **Never upload images to Kolbo or use `chat_send_message` for image analysis** unless the user explicitly asks to use a specific Kolbo chat model. Even with 10+ images, read them all yourself — you can handle up to 10 images in a single analysis pass.

**NEVER use ffmpeg or frame extraction for analysis. NEVER ask the user — just pick the right path above.**

**Video/Audio analysis workflow — Step 1 is NOT optional:**
1. `upload_media({ source: "/absolute/local/path/to/file.mp4" })` → returns `{ url, thumbnail_url, ... }`
   - **Use `url`** — the actual CDN URL. Ignore `thumbnail_url` (preview JPG only).
2. `chat_send_message({ message: "<your question>", media_urls: [result.url] })`
   - **`media_urls` is mandatory** — the model only sees the video if you pass the CDN URL here.
   - Always an **array**: `media_urls: ["https://cdn.kolbo.ai/..."]`
   - **Omit `model`** — Smart Select auto-routes to Gemini when media is detected
   - **Sessions do NOT remember media between messages.** On retry: reuse the same CDN `url` (no re-upload) but always pass `media_urls` again.
   - **Batch / many videos**: use `list_models` to find the cheapest Gemini model and pass it explicitly for cheaper bulk runs

### ⚠️ Batching Media in Chat Messages (CRITICAL)

**Always send ALL media in ONE `chat_send_message` call.** The `media_urls` array accepts up to **10 URLs** in a single request. Never send one message per image/video.

**Why this matters:** Each `upload_media` call + the final `chat_send_message` all count toward rate limits. Sending 10 uploads + 10 separate chat messages = 20 requests in rapid succession → "Too many generation requests" error. Instead:

1. Upload all files at once (output all `upload_media` calls in one response — uploads are 300/min and cost no credits).
2. Collect ALL returned CDN URLs into one array.
3. Send ONE `chat_send_message` with all URLs in `media_urls`.

**Example — analyzing 5 videos:**
```
# Step 1: Upload all in one response (all 5 upload_media calls at once)
upload_media({ source: "video1.mp4" }) → url1
upload_media({ source: "video2.mp4" }) → url2
upload_media({ source: "video3.mp4" }) → url3
upload_media({ source: "video4.mp4" }) → url4
upload_media({ source: "video5.mp4" }) → url5

# Step 2: ONE chat call with ALL media URLs
chat_send_message({
  message: "Analyze all 5 videos...",
  media_urls: [url1, url2, url3, url4, url5]
})
```

**Rate limit recovery:** If you hit "Too many generation requests", wait 60 seconds before retrying. On retry, do NOT re-upload — reuse the CDN URLs from step 1.

**❌ Never do this:**
- Pass a local file path in `media_urls` — it won't work, only CDN URLs work
- Use the `.txt` URL from a transcription result as the video URL — that's text, not video
- Skip `upload_media` and try to construct a URL yourself
- Send separate `chat_send_message` calls for each media file — batch them into ONE call

When in doubt, do visual analysis. Do not stop to ask.

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

### Multi-Scene / Campaigns
`generate_creative_director` is not only for storyboards and campaigns — use it whenever the user wants a character shown across multiple scenes, outfits, moods, or settings. It generates 1–8 scenes from one brief, each with its own distinct prompt, and keeps style consistent internally. Always pass `visual_dna_ids` when a character must look the same across scenes, and optionally `moodboard_id` for art direction.

You can also do multiple parallel `generate_image` calls with the same `visual_dna_ids` when the user provides explicit per-image prompts.

---

## Visual DNA (Character/Style Consistency)

Visual DNA profiles capture the visual "identity" of a character, style, product, or scene from reference media.

### Workflow
1. **Create** a profile with `create_visual_dna` — provide reference images (max 4), optionally video and audio
2. **Types**: `character` (default), `style`, `product`, `scene`, `environment`
3. **Use** the profile by passing its `id` in `visual_dna_ids` in: `generate_image`, `generate_creative_director`, `generate_elements`
4. **List/inspect** profiles with `list_visual_dnas` / `get_visual_dna`

### ⚠️ @name Syntax — CRITICAL for Multi-Visual-DNA Prompts

When using **multiple Visual DNA profiles in a single generation**, reference each profile by its name using the `@name` syntax directly in the prompt. This tells the engine which character or asset appears where:

```
"@dana walks into @shop and picks up a product from the shelf"
```

- Profile names are set during `create_visual_dna` (the `name` field)
- Reference them as `@name` (lowercase, no spaces) inside the prompt text
- Multiple profiles can appear in one prompt — the engine blends each one where it's mentioned
- **Without `@name` references, the engine may blend all Visual DNAs together indiscriminately**
- This works across `generate_image`, `generate_creative_director`, and `generate_elements`

**Example workflow — two-character scene:**
1. Create Visual DNA `name: "dana"` (type: character) → `id: "vdna_abc"`
2. Create Visual DNA `name: "shop"` (type: environment) → `id: "vdna_xyz"`
3. Generate: `prompt: "@dana standing in @shop, picking up a product"`, `visual_dna_ids: ["vdna_abc", "vdna_xyz"]`

### Visual DNA Limits (maxVisualDna)

Each model has a `maxVisualDna` field in `list_models` results — never pass more Visual DNAs than the model supports:
- **Image models** (non-Kling): up to **8** Visual DNAs
- **Kling image models**: up to **3** Visual DNAs
- **Elements video models**: up to **3–5** Visual DNAs (model-dependent)
- **All other models**: up to **3** Visual DNAs

Always check the `maxVisualDna` field from `list_models` for the exact limit of the chosen model.

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
- **Animating an image** ("make this photo move", "animate this image") → use `generate_video_from_image` and pass the image as the source. Do NOT attach `visual_dna_ids` — the source image IS the reference, Visual DNA adds no value here.
- **Text-to-video** from a general description (no specific character to lock in) → use `generate_video` without `visual_dna_ids`
- **`generate_video`** — does not support Visual DNA at all. Never pass `visual_dna_ids` to it.
- **`generate_video_from_image`** — does not support Visual DNA. The source image serves as the visual reference.
- **`generate_first_last_frame`** — does not support Visual DNA. The keyframes define the visual.
- **The only video tool that supports Visual DNA is `generate_elements`** (elements-type models like Seedance 2, Kling O3 Reference, Grok Imagine). Use it when the user wants a character to appear consistently in a video scene.

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

### Image-to-Video
The model can see the starting frame. Describe **what happens**, not what the image looks like. Focus on motion, camera, and action — don't re-describe the subject or setting.
- Good: "Slow dolly-in on the subject. Her hair drifts in a light breeze. Soft particles float through the air. [6s]"
- Bad: "A woman with long brown hair standing in a forest, wearing a red dress, with golden sunlight..." (re-describes the image)

### Video-to-Video (Restyle)
Use `generate_video_from_video` to restyle an existing video. Describe the **new style**, not the original content — the model preserves the original motion.
- Good: "Transform into anime style with cel-shading and vibrant colors"
- Bad: "A person walking down a street" (re-describes what's already in the video)

### Elements (Reference Assets → Video)
Use `generate_elements` when the user has specific assets (product photos, character references) they want animated into a video. Pass them as `reference_images` (URLs) or `files` (local paths).

### First/Last Frame (Keyframe Interpolation)
Use `generate_first_last_frame` when the user provides two keyframes and wants the model to create a smooth transition between them.

### Lipsync
Use `generate_lipsync` to sync audio to a face in an image or video. Both `source` (face) and `audio` accept URLs or local file paths.

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

Use `upload_media` to upload local files or URLs to the Kolbo CDN for stable hosting. Useful when:
- A local file needs to be referenced in multiple generation calls
- You want a permanent CDN URL instead of an ephemeral local path

Use `list_media` to browse previously uploaded content (filter by type, search by name).

---

## Chat

Use `chat_send_message` to interact with Kolbo AI models (GPT-4o, Claude, etc.) with optional web search and deep think modes. Conversations persist via `session_id` — omit to start new, pass to continue.

**Media in chat:** Always batch all media into a single message. `media_urls` accepts up to 10 URLs per call. See the "Batching Media in Chat Messages" section above for the mandatory workflow.

Use `chat_list_conversations` and `chat_get_messages` to browse conversation history.

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

When you generate an HTML, SVG, or Mermaid artifact in the chat, a **Share** button appears in the artifact preview toolbar (next to Desktop / Mobile). Clicking it:

1. Uploads the artifact to Kolbo's hosting platform
2. Copies a permanent public URL to the clipboard (e.g. `https://api.kolbo.ai/api/shared-artifact-raw/<token>`)
3. Shows a toast confirming the link was copied

Anyone with the URL can view the rendered page — no login required.

**Requirements:** You must be logged in (`kolbo auth login`). The share button returns an error toast if you are not authenticated.

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
Kolbo allows 10 generation requests per minute per user per tool type (video, image, etc. are separate pools). Wait 60 seconds (the window resets) and retry only the failed calls. Use `generate_creative_director` for batch image work instead of multiple `generate_image` calls. The API queues requests — it never silently drops them.

---

## Examples

Natural-language triggers that should prompt this skill + a tool call:

- "Generate an image of a neon-lit Tokyo street at night" → `list_models` (image) → `generate_image`
- "Use Midjourney to generate a Tokyo street" → `generate_image` with model "midjourney" (user named the model — skip `list_models`)
- "Remove the background from this image" → `list_models` (image_edit) → `generate_image_edit`
- "Create a storyboard for a coffee brand ad" → `list_models` (image) → `generate_creative_director`
- "Create a 5-second cinematic video of ocean waves at sunset" → `list_models` (video) → `generate_video` with camera + mood guidance
- "Make 5 videos with Seedance 2 Fast, 15s, 16:9" → fire all 5 `generate_video` calls in parallel (user specified everything — skip `list_models`, skip cost confirmation)
- "Animate this product photo with a 360° orbit" → `list_models` (video_from_image) → `generate_video_from_image`
- "Restyle this video as anime" → `generate_video_from_video`
- "Make this character talk with this voiceover" → `generate_lipsync`
- "Create a smooth transition between these two frames" → `generate_first_last_frame`
- "Make a lo-fi hip hop beat, instrumental, 85 BPM" → `list_models` (music) → `generate_music`
- "Say this in English with a natural female voice: Welcome to Kolbo" → `list_voices` → `generate_speech`
- "Generate a door slam sound effect" → `list_models` (sound) → `generate_sound`
- "Create a 3D model of a medieval castle" → `list_models` (three_d) → `generate_3d`
- "Transcribe this podcast episode" → `transcribe_audio`
- "What's being said in this video?" → `transcribe_audio` → analyze the text
- "Generate word-by-word subtitles for this audio" → `transcribe_audio` → share `word_by_word_srt_url`
- "Analyze this video" / "What do you see?" / "What's in this?" (with video file) → `upload_media` → `chat_send_message` with `media_urls` (omit model — auto-routes to Gemini)
- "What prompts are shown in this video?" → `upload_media` → `chat_send_message` with `media_urls` (omit model — auto-routes to Gemini)
- "Keep the same character across all these images" → `create_visual_dna` → `generate_image` with `visual_dna_ids`
- "Upload this file to my media library" → `upload_media`
- "Host this HTML page" / "Publish this landing page" / "Give me a public URL for this file" → `upload_media` → share the returned `url` (Kolbo CDN serves any file type publicly)
- "What video models are available?" → `list_models` (video)
- "How many credits do I have?" → `check_credits`
- "What's in this image?" (with upload) → Read the image directly with your own vision — no Kolbo API call needed
- "Analyze these 10 frames" (with multiple images) → Read all images directly with your own vision — you handle up to 10 natively
- "Analyze these 5 videos" → upload all 5 with `upload_media`, then ONE `chat_send_message` with all 5 URLs in `media_urls`
- "Create motion graphics" / "animated text" / "title sequence" → load the `remotion-best-practices` skill for Remotion-based motion graphics
- "Edit this video" / "cut this clip" / "remove silence" / "add subtitles" / "convert to 9:16" → load the `video-production` skill for FFmpeg-based editing
- "Create a short-form video" / "make a reel" / "YouTube short" → load the `short-form-video` skill
