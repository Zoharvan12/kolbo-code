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
| `generate_image` | Create images from text prompts. Supports Visual DNA, moodboards, reference images, batch generation, web-search grounding. |
| `generate_image_edit` | Edit/transform an existing image (background removal, color changes, compositing). Pass source images + edit prompt. |
| `generate_creative_director` | Generate a coordinated multi-scene set (1–8 scenes) from one creative brief. Ideal for storyboards, ad campaigns, product showcases. Supports image and video modes. |
| `generate_video` | Create videos from text prompts. Supports Visual DNA and reference images for consistency. |
| `generate_video_from_image` | Animate a still image into video. Prompt describes the motion, not the subject. |
| `generate_video_from_video` | Restyle/transform an existing video (style transfer, scene restyling, subject swap). Keeps the original motion. |
| `generate_elements` | Generate video from reference assets (images/videos) + prompt. Use when animating specific uploaded assets. |
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
| `upload_media` | Upload a local file or URL to the user's Kolbo media library (CDN). Use for multi-tool workflows. |
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

### Chat

| Tool | Description |
|------|-------------|
| `chat_send_message` | Send a message to Kolbo AI chat. Supports web search and deep think modes. |
| `chat_list_conversations` | List your SDK chat conversations. |
| `chat_get_messages` | Fetch messages in a conversation (with media URLs). |

## Core Workflow

1. **Check credits** with `check_credits` at the start of any creative session (once is enough).
2. **Discover models** with `list_models` using a `type` filter. **Always do this before calling a generation tool — never hardcode model identifiers.** Models are added, removed, and updated frequently.
3. **Generate**: call the appropriate tool. Omit `model` to let Kolbo auto-select the best model (recommended default), or pass an `identifier` from `list_models` for explicit control. Models marked `recommended: true` are Kolbo's top picks for quality and speed.
4. **Polling is internal** — the tool returns the final URL(s) when ready. If a video generation times out, call `get_generation_status` with the returned generation ID to retrieve the result.
5. **Share the URL** — after a successful generation, hand the real URL back to the user. Never fabricate URLs.

### Model Types (for `list_models`)

| Type | Use for |
|------|---------|
| `image` | Still-image generation |
| `image_edit` | Image editing / transformation |
| `video` | Text-to-video |
| `video_from_image` | Image-to-video animation |
| `lipsync` | Audio-to-face lipsync |
| `music` | Music generation |
| `speech` | Text-to-speech |
| `sound` | Sound effects |
| `three_d` | 3D model generation |

### Cost Awareness

Creative generations bill against the user's Kolbo credit balance. Order of expense (rough):
- **Cheap & fast**: speech (~5-30s), sound effects (~5-30s), image (~10-30s), transcription (by duration)
- **Medium**: music (~30s-2min), 3D (~1-3min)
- **Expensive**: video (~1-5min, highest credit cost), lipsync (~1-3min)

Rule of thumb: confirm intent before firing off a video generation unless the user was explicit. For images, just generate.

### Rate Limiting
Kolbo enforces **10 generation requests per minute per user per tool type** (e.g. 10 image calls + 10 video calls = fine, but 11 image calls in 1 minute = rate limited). General media requests are capped at **300 per minute**.

When making multiple generation calls:
- **Stagger calls** — do NOT fire all in parallel. Space them ~5-10 seconds apart.
- **Batch images**: use `generate_creative_director` instead of calling `generate_image` 5+ times — it handles multi-scene in one request.
- If you get a rate limit error (429), wait 60 seconds (the window resets per minute) and retry. Do not retry more than 2 times.

---

## Transcription & Audio/Video Analysis

Use `transcribe_audio` whenever the user provides an audio or video file and wants:
- A text transcript
- Subtitles (SRT format)
- Word-by-word timed subtitles (for karaoke, motion graphics, Remotion captions, video editing)
- Content analysis or summary of spoken content
- Dialogue extraction from video

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

### Visual Video/Audio Analysis (what's happening, not just what's said)
`transcribe_audio` only extracts **speech**. If the user wants to understand **what's visually happening** in a video (scenes, actions, objects, on-screen text) or needs a multimodal AI to reason about the content, use `chat_send_message` with a video-capable model instead.

**Video-capable models**: `gemini-2.5-pro`, `gemini-2.5-flash` — these can watch video and analyze visual content.

**Workflow for visual analysis:**
1. Upload the video with `upload_media` to get a stable CDN URL
2. Call `chat_send_message` with the video URL in the message and a video-capable model (e.g. `gemini-2.5-pro`)
3. Ask your analysis question: "Describe what happens in this video", "What products are shown?", "Summarize the key scenes"

**When to use which:**

| User intent | Tool |
|-------------|------|
| "Transcribe this" / "What's being said?" | `transcribe_audio` |
| "Generate subtitles" / "Word-by-word timing" | `transcribe_audio` |
| "What's happening in this video?" / "Describe the scenes" | `chat_send_message` + Gemini |
| "Analyze this video and transcribe it" | Both — `transcribe_audio` for text + `chat_send_message` for visual |

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
For storyboards, campaigns, or character-consistent sequences, use `generate_creative_director` — it generates 1–8 coordinated scenes from a single creative brief with consistent style. Pass `visual_dna_ids` and/or `moodboard_id` for character/style consistency across all scenes.

In the CLI, you can also do sequential `generate_image` calls with the same Visual DNA profiles.

---

## Visual DNA (Character/Style Consistency)

Visual DNA profiles capture the visual "identity" of a character, style, product, or scene from reference media.

### Workflow
1. **Create** a profile with `create_visual_dna` — provide reference images (max 4), optionally video and audio
2. **Types**: `character` (default), `style`, `product`, `scene`
3. **Use** the profile by passing its `id` in `visual_dna_ids` when calling any generation tool
4. **List/inspect** profiles with `list_visual_dnas` / `get_visual_dna`

### When to Use
- User wants the same character across multiple images/videos
- User wants a consistent brand style across a campaign
- User references "keep the same look" or "same character"
- User provides reference photos of a person/product to maintain consistency

---

## Video Prompts

Video is the most expensive operation in the Kolbo catalog. Write prompts deliberately.

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

**Moodboards** provide style direction (master prompt + style guide + reference images). Pass a `moodboard_id` to any generation tool to apply its style.
- `list_moodboards` to browse available options
- `get_moodboard` to see full details before applying

**Presets** bundle prompt templates + style direction for specific creative looks. Pass a `preset_id` to generation tools.
- `list_presets` with optional `type` filter ("image", "video", "music", "text_to_video")

---

## Media Library

Use `upload_media` to upload local files or URLs to the Kolbo CDN for stable hosting. Useful when:
- A local file needs to be referenced in multiple generation calls
- You want a permanent CDN URL instead of an ephemeral local path

Use `list_media` to browse previously uploaded content (filter by type, search by name).

---

## Chat

Use `chat_send_message` to interact with Kolbo AI models (GPT-4o, Claude, etc.) with optional web search and deep think modes. Conversations persist via `session_id` — omit to start new, pass to continue.

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
Kolbo allows 10 generation requests per minute per tool type. Wait 60 seconds and retry. Use `generate_creative_director` for batch image work instead of multiple `generate_image` calls.

---

## Examples

Natural-language triggers that should prompt this skill + a tool call:

- "Generate an image of a neon-lit Tokyo street at night" → `list_models` (image) → `generate_image`
- "Remove the background from this image" → `list_models` (image_edit) → `generate_image_edit`
- "Create a storyboard for a coffee brand ad" → `list_models` (image) → `generate_creative_director`
- "Create a 5-second cinematic video of ocean waves at sunset" → `list_models` (video) → `generate_video` with camera + mood guidance
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
- "Keep the same character across all these images" → `create_visual_dna` → `generate_image` with `visual_dna_ids`
- "Upload this file to my media library" → `upload_media`
- "What video models are available?" → `list_models` (video)
- "How many credits do I have?" → `check_credits`
- "What's in this image?" (with upload) → describe per the Image Analysis section; no tool call needed unless the user asks to generate or edit
