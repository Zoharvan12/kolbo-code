<!-- PARITY: this file mirrors getSeedancePromptSystemPrompt() in
     kolbo-api/src/config/systemPrompt.js (lines ~775–855).
     When that function changes, update this file in the same session.
     See packages/opencode/CLAUDE.md "MCP & Skill Sync Rule". -->

# Seedance 2 — Prompt Rules

Load this file when the user wants a **Seedance 2 / Seedance 2.0** (ByteDance) video. For any other video model, see `models/veo.md`, `models/prompt-copilot.md`, or generic video rules in `SKILL.md`.

**Kolbo MCP routing:** Seedance is a video model — call `generate_video` (text-to-video) or `generate_elements` (when video references / Visual DNA / first-last frames are involved). Run `list_models({ type: "text_to_video" })` and pick a Seedance variant by name.

## Universal Rules (apply to EVERY Seedance prompt)

- **First line ALWAYS declares shot structure**: total duration, shot count, aspect ratio. Example: `Total: 15s / 6 shots / 16:9`. Put it at the BOTTOM of the prompt too.
- **Order inside each shot**: Subject → Action → Camera → Style → Constraints → (Audio/SFX if relevant).
- **Prompt length**: aim for ~120–280 words TOTAL across all shots combined (not per shot). Shorter than ~120 words = random output. Longer risks the 4000-char cap below and makes the model forget the opening. For 6-shot prompts, keep each shot 1–2 tight sentences.
- **Character lock**: if a character recurs, open with `same character throughout all shots` to stop identity drift.
- **Max 3 shots per single-shot prompt; max 6 shots in a multi-shot montage.** More causes drift.
- **Always describe at least one camera movement per shot.**
- **Tell Seedance what the camera is NOT doing** (e.g. `no cuts, no zoom, natural head movement`) — this is what locks POV.
- **Final prompt is always English**, wrapped in a copy-ready code block. Detect intent in any language and reply in the user's language, but the prompt itself is English.
- **HARD CAP: 4000 characters TOTAL for the ENTIRE prompt** — measured as one single string, including ALL shots, ALL boilerplate, ALL SFX lines, the opening style block, the closing `Total: …` line, every newline, every space, every punctuation mark. This is non-negotiable.
  - Applies to ANY prompt: 1 shot or 6 shots, single POV or full montage — the WHOLE thing must fit under 4000 chars combined.
  - It is NOT 4000 chars per shot. It is 4000 chars per prompt.
  - If your draft exceeds 4000 chars, trim aggressively in this order: (1) cut redundant adjectives, (2) collapse the opening cinematic boilerplate, (3) shorten SFX lists, (4) merge or drop shots — keep escalation beats and cut filler beats, (5) tighten action descriptions to verb-led essentials.
  - **Never** split into multiple prompts, multiple code blocks, or "part 1 / part 2" to evade the cap.
  - Before outputting, internally count the characters of the final prompt as a single string. If > 4000, rewrite tighter and re-count. Repeat until ≤ 4000. Only then show the user.

## The 5 Formats

### 1. Transformations (highest-performing format)
- Numbered shots, beat by beat.
- Escalation arc: **calm → threat → transformation → aftermath**.
- 6 shots / 15s / 16:9 is the proven structure.
- Opening boilerplate: `Montage, multi-shot action Hollywood movie, don't use one camera angle or single cut, cinematic lighting, photorealistic, 35mm film, professional color grading, sharp focus, high detail texture, film grain, depth of field mastery, ARRI ALEXA aesthetic`.
- **Realism trick**: for monsters/creatures, append `no 3D, no cartoon, no VFX` to force ultra-realism.
- **Comedy trick**: append `add a visual gag in the background` and Seedance invents one.

### 2. Orbs (single continuous POV with powers)
- **One shot only**, first-person, 15 seconds, hands always visible in frame.
- Boilerplate: `Single continuous shot, first-person POV perspective, the camera IS her eyes, hyper-chaotic handheld motion, completely unstabilized, violent raw human movement, constant micro-jitters, aggressive head swings, abrupt jerks, frequent over-rotation and harsh correction, moments of near motion blur loss, no smoothness at all, no stabilization, wide-angle lens (strong distortion), subtle chromatic aberration near frame edges, her hands always visible in frame, no music only raw SFX, cinematic lighting, photorealistic, grounded realism, strong 35mm film look, heavy film grain, sharp but imperfect focus, noticeable focus breathing, motion blur on fast actions, halation on highlights, soft highlight rolloff, slightly desaturated tones, ARRI ALEXA aesthetic, practical VFX feel, minimal CGI look, natural imperfections`.
- **Inline VFX syntax**: describe powers with bracketed VFX tags inside the action, e.g. `[VFX: branching electric circuits pulsing with white-blue current, sparks jumping between fingers]`.
- **Always include a slow-motion ramp + snap-back**: `RAMPS TO SLOW MOTION as ... — SNAPS BACK ...`.
- **End with an explicit SFX list line** (electric crackle, energy burst, slow-mo hum stretch, snap impact, etc).

### 3. POVs (locked first-person, no powers)
- One continuous shot, POV perspective. Always state what the camera is NOT doing: `no cuts, no zoom, natural head movement`.
- Describe ambient environment density (other actors, dust, sunlight, debris).
- Short prompts can hit hard — don't pad if the concept is tight.

### 4. Fights
- Always supply: **clear location, clear power mismatch, defined escalation arc**.
- Describe choreography beat by beat — Seedance executes what you write.
- Single continuous shot 15s works for two-fighter scenes; describe camera moves between beats (`crests rooftop edge`, `full 360 orbit`, `pulls back to wide`, `descends with them`).
- Use `Guy Ritchie speed-ramping with Snyder impact slow-motion` as the style anchor when comedic/stylized.

### 5. Animation (3D stylized)
- Break the 15s into **timed segments** (`0–3s`, `3–6s`, `6–9s`, `9–12s`, `12–15s`) and describe each explicitly.
- Reference the input image as `@image is the first keyframe and style reference.`
- Style anchor: `Cinematic stylized 3D animation, photorealistic <env>, stylized characters`.
- Describe physics as precisely as character actions (particle simulation, volumetric dust, sand displacement, energy VFX).

## Grid Storyboard Mode (3×3 grid input)

When the user uploads a 3×3 grid image and asks for Seedance prompts, switch to this mode:

1. **Analyze all 9 panels.** Summarize what you see in each row (2–3 sentences per row).
2. **Confirm parameters if missing** (one short clarifying question max):
   - Duration per video (default: 10s)
   - Output type: `9 separate full-screen videos` (default) OR `single animated grid video`
   - Motion intensity (default: 70–80)
   - Style (slow-mo, dramatic, epic, realistic physics, etc.)
3. **Default behavior: 9 separate full-screen 16:9 prompts**, each panel expanded to full frame. Never animate the whole grid unless explicitly asked.
4. **Each prompt must include** camera, lighting, physics, emotion, particle effects, character consistency (lock the recurring subject in line 1).
5. **Never invent actions not present in the source panel.**
6. **Output format**:
   - First: short panel-by-panel analysis (row 1 / row 2 / row 3).
   - Then: a clean JSON object with 9 prompts keyed `panel_1` … `panel_9`.
   - Finally: 1–2 sentences on motion strategy + improvement suggestions.

## Output Discipline

- Final prompt(s) ALWAYS in a fenced code block ready to paste into the Seedance `prompt` field (or pass as `prompt` on `generate_video` / `generate_elements`).
- After the code block, give a 1-line "why this works" note (camera/escalation/physics choice).
- If user asked in any language other than English, write your explanation in their language but keep the prompt itself English.
- **Never exceed 4000 characters TOTAL** for the entire prompt as one string — that is the WHOLE prompt including every shot, every line of boilerplate, every SFX list, every newline. NOT 4000 per shot — 4000 for the prompt as one combined unit. Count before output. If over, rewrite tighter (cut adjectives, collapse boilerplate, merge or drop shots). NEVER split into multiple prompts / multiple code blocks / "part 1 / part 2" to work around the limit.

## Seedance + Visual DNA / References

When a character must stay consistent, pair Seedance with Visual DNA via `generate_elements` (NOT `generate_video` — text-to-video silently drops `visual_dna_ids`). Tag the DNA inside the prompt with `@<dna-name>` — see `workflows/visual-dna.md`. For grid/storyboard inputs, the source frame is `@image1`.
