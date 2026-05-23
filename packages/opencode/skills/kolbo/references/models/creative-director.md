<!-- PARITY: this file mirrors getCreativeDirectorPromptSystemPrompt() in
     kolbo-api/src/config/systemPrompt.js (lines ~1062–1155).
     When that function changes, update this file in the same session. -->

# Creative Director — Multi-Scene Prompt Rules

Load this file when the user wants **2–8 related outputs from one brief** — storyboards, ad campaigns, character lookbooks, multi-angle/multi-pose sets, scene variations. For single-image work see `models/gpt-image.md` / `models/nano-banana.md`. For single-clip video see `models/seedance.md` / `models/veo.md`.

**Kolbo MCP routing:** always call `generate_creative_director` (NEVER fire ≥2 `generate_image` calls in a loop). Pass `scene_count: 1–8`, optional `visual_dna_ids`, `reference_images`, `moodboard_id`, `workflow_type: "video"` for clips, `model` to pin a specific image/video model.

## What the Creative Director Tool Is

A multi-scene batch generator. Submit 1–8 scenes in one go and the tool fans them out in parallel into images or videos, optionally locked to a character/product (Visual DNA) and a mood/style (Moodboard). Total wall time = slowest scene, not the sum.

### The Three Modes
- **Photo Auto Pilot** — each scene = one image. Optional reference images for style/subject. Best for: campaign batches, product shoots, character lookbooks, ad variants. Pass `workflow_type: "image"` (or omit — image is default).
- **Video Auto Pilot** — each scene = one short video clip. Optional reference image per scene anchors the starting frame. Best for: storyboards, mood reels, ad teasers, character action sequences. Pass `workflow_type: "video"`.
- **Cinema Manual** — per-scene **first frame + last frame** + per-scene prompt. Full cinematic control over composition transitions. Best for: hero shots, controlled camera moves, deliberate edits.

### Identity & Style Locks
- **Visual DNA** — attach a character/product preset via `visual_dna_ids` to lock identity across all scenes. Up to **8 Visual DNAs** can be active at once (e.g. main character + product + side character). See `workflows/visual-dna.md` for the `@name` syntax — every DNA must be tagged inside the prompt.
- **Moodboard** — attach `moodboard_id` (or `moodboard_ids`) for a curated mood/style reference that anchors the aesthetic of the whole batch.
- When the user mentions a recurring character/product, **ask** if they want to use a Visual DNA and recommend it. Same for a consistent aesthetic → recommend a Moodboard.

## CRITICAL Kolbo Platform Rules

- **Aspect ratio and resolution are MCP-tool params** (`aspect_ratio`, `resolution`) — NEVER include "16:9", "9:16", "1024x1536", "2K", or any size syntax inside the scene prompts.
- **Model selection is the `model` param** — never hardcode "Nano Banana", "Veo", "Seedance", "Flux" inside the scene text.
- Output scenes in the exact format below — anything else breaks the parser.
- **Never pass `num_images` to `generate_creative_director`** — use `scene_count` (1–8). `num_images` is for `generate_image` (same prompt, different seeds).

## The Output Format (non-negotiable)

All scenes go in **ONE fenced code block** in this exact shape:
```
Scene 1: <prompt for scene 1>
Scene 2: <prompt for scene 2>
Scene 3: <prompt for scene 3>
...
```
- One scene per line. Each line starts with `Scene N:` followed by a single concise prompt.
- **No meta-commentary inside the block**: no "Output:", "Tips:", "Notes:", resolution, dimensions, or "this scene…" preamble.
- Number sequentially from 1. Hard cap at 8 scenes.

## How to Build the Batch

### Step 1 — Pick the right mode
- Single static asset per scene → **Photo Auto Pilot**
- Motion / camera moves → **Video Auto Pilot**
- Controlled first→last frame transitions → **Cinema Manual**

### Step 2 — Decide the narrative arc
A great batch isn't 8 random shots — it's a sequence with intent. Pick one structure:
- **Campaign**: establishing → product hero → lifestyle → detail → close
- **Storyboard**: setup → inciting action → escalation → climax → resolution
- **Character lookbook**: full body → 3/4 → portrait → action → environment
- **Ad concept**: hook → tension → reveal → CTA
- **Variant exploration**: same concept, varying angle/lighting/mood/palette

### Step 3 — Write each scene under the right framework

**Photo Auto Pilot scene prompt** (image instruction):
- Vary at least one axis between scenes: angle, lighting, mood, framing, palette.
- Concise: 1–3 sentences. Concept-led, not keyword soup.
- Subject + Action + Setting + Style cue.
- If a Visual DNA is attached, refer to the subject by `@<dna-name>` — the DNA does identity work, don't re-describe it every scene.

**Video Auto Pilot scene prompt** (motion instruction):
- The model can see the reference image — **describe what happens, not what's already there**.
- Always name a **camera move** per scene: `dolly in`, `pull-back`, `arc orbit`, `tracking shot`, `handheld natural lag`, `crane up`, `static drift`, `crash zoom`.
- Format: `<action> + <camera move>`. Short and action-led.
- Don't re-describe what the image already shows; describe the verb.

**Cinema Manual scene prompt** (transition instruction):
- The user provides first frame + last frame. Describe what bridges them: motion, time-passage, camera move, transformation.
- Be explicit about the transition type: `smooth dolly between`, `time-lapse`, `match cut`, `whip pan reveal`.

### Step 4 — Apply consistency rules
- If recurring subject: keep description anchored to the same noun across scenes ("the woman", "the bottle") or use a single `@<dna-name>` consistently. Don't rename her in scene 4.
- If recurring location: same world descriptors throughout (don't switch "Tel Aviv rooftop" to "downtown LA" mid-batch unless that's the arc).
- Vary lighting/angle/composition between scenes — never two consecutive identical setups.

## Output Discipline

- Final scenes in ONE fenced code block in `Scene N:` format. **No model names, no resolutions, no aspect ratios inside scenes.**
- When summarizing the call to the user, state separately:
  - **Mode:** Photo Auto Pilot / Video Auto Pilot / Cinema Manual — one-line why
  - **Recommended model:** (Nano Banana 2 / Nano Banana Pro / GPT Image 2 for photo; Veo / Seedance 2 / Kling for video) — one-line why
  - **Aspect / Resolution preset:** what to pass — one-line why
  - **Visual DNA / Moodboard:** recommend if applicable, or "—" if not
  - **Why this arc works:** 1 line on the narrative choice
- Reply explanations in the user's language; scenes themselves in English.

## After Generation

**Share results as individual URLs, one per scene. Do NOT create an HTML grid artifact or any combined layout.** Just list each scene's title and its image URL on separate lines — the desktop canvas already renders them as a gallery. See SKILL.md "Generated URLs in chat".

## Character-Driven Video — Frames First

For any ad / story / scene-based video **created from scratch** featuring a Visual DNA character, do NOT jump straight from DNA to per-shot video. The right flow is:

1. **Generate the shot frames first** as still images via `generate_creative_director` with `scene_count` + `visual_dna_ids` + `workflow_type: "image"`. DNA is strongest in image generation; the user can approve cheaply before any expensive video runs.
2. **Confirm the frames with the user** if there are more than ~3 shots, or if the user hasn't said "go straight to video."
3. **Animate each frame** with `generate_video_from_image`, passing each approved frame as `image_url`.

Skip frames-first only when the user says "go straight to video / skip the storyboard", on single-shot quick experiments, or when the user supplies their own approved frames.
