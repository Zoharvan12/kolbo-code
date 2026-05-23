<!-- PARITY: this file mirrors getVeoPromptSystemPrompt() in
     kolbo-api/src/config/systemPrompt.js (lines ~1156–1256).
     When that function changes, update this file in the same session. -->

# Veo 3 / 3.1 — Prompt Rules

Load this file when the user wants a **Veo 3 / Veo 3.1** (Google) video. For other video models see `models/seedance.md`, `models/prompt-copilot.md`, or generic video rules in `SKILL.md`.

**Kolbo MCP routing:**
- Text-to-video → `generate_video` with `model: "veo-3.1"` (or via `list_models({ type: "text_to_video" })`).
- Image-to-video → `generate_video_from_image`.
- First-and-last frame → `generate_first_last_frame`.
- Ingredients-to-video (multi-reference) → `generate_elements` with `reference_images` and/or `visual_dna_ids`.

## CRITICAL Kolbo Platform Rules

- **Aspect ratio, resolution, and clip length are MCP-tool params** (`aspect_ratio`, `resolution`, `duration`). **NEVER include "16:9", "9:16", "720p", "1080p", "4 seconds", "8s", or any duration / aspect / resolution string inside the prompt body.**
- Pass `sound_enabled: true/false` as a separate param when the user mentions audio — see SKILL.md "Sound on/off".
- Don't write Python / Vertex AI / API call syntax. The user is generating through Kolbo's MCP tools.

## Model Capabilities (informs recommendations, never in the prompt body)
- Resolution: 720p or 1080p (`resolution` param)
- Aspect: 16:9 or 9:16 (`aspect_ratio` param)
- Clip length: 4s, 6s, or 8s (`duration` param)
- Synchronous audio: dialogue, SFX, ambient, music — all guided by prompt text. Veo 3.1 has `sound_generation_type: "native"` and `sound_enabled_by_default: true` — if the user said "no sound", you MUST pass `sound_enabled: false`.
- Image-to-video, first-and-last frame, ingredients-to-video (up to multiple reference images)
- Add/remove object (uses Veo 2 under the hood; no audio for that mode)
- All output watermarked with SynthID

## The Veo Prompt Formula (use for EVERY prompt)

`[Cinematography] + [Subject] + [Action] + [Context] + [Style & Ambiance]`

- **Cinematography** — camera work and shot composition (the most powerful tone-control lever)
- **Subject** — main character or focal point
- **Action** — what the subject is doing (strong verbs)
- **Context** — environment, background, time of day
- **Style & Ambiance** — overall aesthetic, mood, lighting, film stock

Example shape: `Medium shot, a tired corporate worker, rubbing his temples in exhaustion, in front of a bulky 1980s computer in a cluttered office late at night. The scene is lit by harsh fluorescent overhead lights and the green glow of the monochrome monitor. Retro aesthetic, shot as if on 1980s color film, slightly grainy.`

## The Language of Cinematography (Veo's strongest lever)

- **Camera movement**: `dolly shot`, `tracking shot`, `crane shot`, `aerial view`, `slow pan`, `POV shot`, `arc shot`, `whip pan`, `handheld`, `static`. Always name at least one.
- **Composition**: `wide shot`, `close-up`, `extreme close-up`, `low angle`, `high angle`, `two-shot`, `over-the-shoulder`.
- **Lens & focus**: `shallow depth of field`, `wide-angle lens`, `soft focus`, `macro lens`, `deep focus`, `anamorphic 2.39:1`.

## Directing the Soundstage (Veo 3.1 strength)

Veo bakes audio directly from prompt instructions. Use these conventions:
- **Dialogue**: put speech in **quotation marks** with speaker attribution.
  `A woman says, "We have to leave now."`
  `The detective replies in a weary voice, "Of all the offices in this town, you had to walk into mine."`
- **Sound effects**: prefix with `SFX:`. Example: `SFX: thunder cracks in the distance, rain hits the window`.
- **Ambient noise**: prefix with `Ambient noise:` or `Ambient:`. Example: `Ambient noise: the quiet hum of a starship bridge`.
- **Music**: describe inline. Example: `A swelling orchestral score begins to play.`

## Negative / Exclusion Prompts (Veo prefers positive framing)

- Describe what you WANT, not what you don't want.
- ❌ "no buildings, no roads"
- ✅ "a desolate, untouched landscape with bare earth and scrub grass"

## Advanced Workflows

### 1. First-and-Last-Frame Transition (`generate_first_last_frame`)
The user provides two images (`first_frame_url` + `last_frame_url`). The prompt describes ONLY the transition between them.
- Describe the **camera move** that bridges the two frames (`smooth 180-degree arc`, `slow dolly through`, `whip pan reveal`, `time-lapse fade`).
- Include any audio (dialogue / SFX / score) that plays during the transition.
- Don't re-describe either frame — Veo can see them.
Example: `The camera performs a smooth 180-degree arc shot, starting with the front-facing view of the singer and circling around her to seamlessly end on the POV shot from behind her. She sings, "When you look me in the eyes, I can see a million stars."`

### 2. Ingredients-to-Video (`generate_elements`, multi-reference consistency)
The user provides reference images for characters / objects / setting via `reference_images` (and/or `visual_dna_ids`). The prompt references each one and describes the scene.
- Open with: `Using @image1 for the <character A>, @image2 for the <character B>, and @image3 for the <setting>, create...` — see `workflows/visual-dna.md` for tag rules.
- Then describe shot type + action + dialogue + audio.
- Great for dialogue scenes, multi-character shots, character-locked sequences.

### 3. Timestamp Prompting (multi-shot single generation)
Direct a multi-shot sequence with precise pacing inside one prompt by tagging each segment with a time range.
Format:
`[00:00-00:02] <shot 1 — cinematography + subject + action + audio>`
`[00:02-00:04] <shot 2 — ...>`
`[00:04-00:06] <shot 3 — ...>`
- Use for 4s / 6s / 8s clips, sized to whatever `duration` param is set to.
- Each segment should change at least one of: angle, framing, subject, or location.
- Add `SFX:`, dialogue in quotes, and emotion cues inside each segment.

### 4. Image-to-Video (`generate_video_from_image`)
Veo can animate a source image with strong prompt adherence.
- The model can see the image — describe **what happens**, not what's already there.
- Always name a camera move + at least one audio element.
- Concise. Action-led.

## Negative Prompts (when you must specify exclusions)

If a tool exposes a separate negative-prompt field, write a short positive description of what to AVOID — e.g. `cartoon, animated, low resolution, watermark, text overlay`. Most of the time, positive prompting is better.

## Output Discipline

- Pass the prompt as the `prompt` field on the chosen tool.
- **NEVER** include aspect ratio, resolution, or duration inside the prompt body.
- When summarizing the call to the user, state separately:
  - **Aspect:** 16:9 or 9:16 — one-line why
  - **Resolution:** 720p or 1080p — one-line why (1080p for hero shots, 720p for drafts / cost-sensitive)
  - **Duration:** 4s / 6s / 8s — one-line why (match it to the action density)
  - **Sound:** `sound_enabled: true/false` — explicit if the user mentioned audio
  - **Workflow:** text-to-video / image-to-video / first-and-last-frame / ingredients-to-video / timestamp — which Kolbo MCP tool you'll call
  - **Why this works:** 1 line on the key cinematography / audio choice
- If the user asks in any language other than English, write explanations in their language but keep the prompt itself English (Veo handles English best for cinematography vocab; dialogue inside quotes can be in any language).
