---
name: kolbo
description: Generate or analyze creative media through Kolbo AI. Load this skill whenever the user asks to create, edit, prompt, or analyze images, videos, music, speech, or sound effects — or to list available AI models / check credit balance. It contains the MCP tool workflow and the prompt-engineering rules for each media type.
---

# Kolbo AI — Creative Generation & Analysis

You have direct access to the Kolbo AI creative platform via MCP tools (auto-configured by `kolbo auth login`). Use them to generate and deliver real content — do NOT just describe what you would create.

## Available MCP Tools

| Tool | Description |
|------|-------------|
| `generate_image` | Create images from text prompts. Returns image URL(s). |
| `generate_video` | Create videos from text. Returns video URL. |
| `generate_video_from_image` | Animate a still image into video. Returns video URL. |
| `generate_music` | Create music from descriptions. Returns audio URL. |
| `generate_speech` | Convert text to speech. Returns audio URL. |
| `generate_sound` | Generate sound effects. Returns audio URL. |
| `list_models` | Browse available AI models filtered by type. |
| `check_credits` | Check remaining Kolbo credit balance. |
| `get_generation_status` | Poll status of an in-progress generation by ID. |

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
| `video` | Text-to-video |
| `video_from_image` | Image-to-video animation |
| `music` | Music generation |
| `speech` | Text-to-speech |
| `sound` | Sound effects |

### Cost Awareness

Creative generations bill against the user's Kolbo credit balance. Order of expense (rough):
- **Cheap & fast**: speech (~5-30s), sound effects (~5-30s), image (~10-30s)
- **Medium**: music (~30s-2min)
- **Expensive**: video (~1-5min, highest credit cost)

Rule of thumb: confirm intent before firing off a video generation unless the user was explicit. For images, just generate.

---

## Image Prompts

### Rules
- **Clean prompts only.** No "Output:", "Tips:", "Notes:", "Resolution:", "Dimensions:", or any instructional/meta language inside the prompt. The prompt is what the model sees — anything not describing the image is noise.
- **Length**: focused 2-3 sentences beats a bloated paragraph. Only go longer when the concept genuinely needs it (complex scenes, multiple subjects, specific technical requirements). Match prompt length to complexity.
- **Order**: Subject → action/pose → environment → lighting → style.
- **Be specific about style** when it matters: "1970s film photography", "watercolor illustration on rough paper", "3D product render with studio softbox lighting" — not vague descriptors like "beautiful" or "high quality".
- **`enhance_prompt: true`** (default) will improve most prompts automatically. Turn it off only if the user's prompt is already fully engineered or they want literal wording.

### Image Editing (image-to-image)
When the model can see the uploaded image, describe the **change**, not the unchanged parts.
- Good: "Turn the sky orange and add drifting clouds"
- Bad: "A mountain landscape with an orange sky and drifting clouds" (re-describes what's already in the image)

Simple edits deserve simple prompts. Only elaborate for genuinely complex, multi-step transformations.

### Multi-Scene / Campaigns
For storyboards, campaigns, or character-consistent sequences, call `generate_image` once per scene with the same base style cues carried across prompts. Kolbo's web app has a dedicated Creative Director feature for this; in the CLI the workflow is sequential `generate_image` calls.

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

## Music Prompts

Describe **genre → mood → instrumentation → tempo → era**, in that order.

- `instrumental: true` excludes vocals.
- `lyrics` accepts actual lyric text the model should sing.
- `style` accepts short genre tags ("lo-fi hip hop", "orchestral cinematic", "80s synthwave").
- Good: "Upbeat 80s synthwave, analog synths, gated reverb drums, 120 BPM, driving bassline, no vocals"
- Bad: "A cool song" / "Something for a workout" (too vague)

---

## Speech (TTS)

- Call `list_models` with `type: speech` to get voice identifiers. Pass the `identifier` as `model` for a consistent voice.
- The voice **is** the model for speech — there is no separate voice parameter.
- For long text, split at natural sentence boundaries. Each generation has a character cap; chunk long-form content into multiple calls.
- For multilingual content, pick a voice that supports the target language from `list_models`.

---

## Sound Effects

- Describe the sound **literally and physically**. Avoid emotional framing.
- Good: "Heavy wooden door creaking open slowly, echoing in a stone hallway, followed by distant dripping water"
- Bad: "A scary sound" / "Creepy atmosphere" (the model can't render emotions directly — render the physical source)

---

## Image Analysis (when the user uploads images)

When the user shares an image and asks about it:

- **Analyze thoroughly**: describe composition, subjects, colors, lighting, style, text/signage, setting, mood, visible objects, and any embedded information (charts, diagrams, screenshots).
- **Reference specific regions** when helpful: "top-left corner", "in the foreground", "the figure on the right".
- **Extract text verbatim** when asked (OCR-style requests are fine).
- **Cannot identify real people.** Describe hair, clothing, pose, expression, and apparent role — but never name a specific individual, even a well-known public figure. If the user insists, decline and offer to describe instead.
- **Copyrighted content**: summarize and reference, don't reproduce verbatim large chunks.
- If the user wants an **edit** based on the analysis, hand off to `generate_video_from_image` (motion) or `generate_image` with an image-to-image model (visual edit) — see the Image Editing section above for prompt structure.

---

## Limitations & Safety

- **Real people**: never identify specific real individuals in photos, even public figures. Describe visible attributes only.
- **NSFW**: Kolbo enforces content safety at the model level. If a generation fails on safety grounds, rephrase the prompt rather than retrying identically.
- **Copyright**: style references are fine (e.g. "in the style of Studio Ghibli"); verbatim reproduction of copyrighted material is not.
- **No fabricated URLs**: only share URLs that actually came back from a tool call. Never guess a URL.

---

## Examples

Natural-language triggers that should prompt this skill + a tool call:

- "Generate an image of a neon-lit Tokyo street at night" → `list_models` (image) → `generate_image`
- "Create a 5-second cinematic video of ocean waves at sunset" → `list_models` (video) → `generate_video` with camera + mood guidance
- "Animate this product photo with a 360° orbit" → `list_models` (video_from_image) → `generate_video_from_image`
- "Make a lo-fi hip hop beat, instrumental, 85 BPM" → `list_models` (music) → `generate_music`
- "Say this in English with a natural female voice: Welcome to Kolbo" → `list_models` (speech) → `generate_speech`
- "Generate a door slam sound effect" → `list_models` (sound) → `generate_sound`
- "What video models are available?" → `list_models` (video)
- "How many credits do I have?" → `check_credits`
- "What's in this image?" (with upload) → describe per the Image Analysis section; no tool call needed unless the user asks to generate or edit
