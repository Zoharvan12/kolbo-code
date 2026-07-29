<!-- PARITY: this file mirrors getSeedancePromptSystemPrompt() in
     kolbo-api/src/config/systemPrompt.js.
     When that function changes, update this file in the same session.
     See packages/opencode/CLAUDE.md "MCP & Skill Sync Rule". -->

# Seedance 2 — Prompt Rules

Load this file when the user wants a **Seedance 2 / Seedance 2.0** (ByteDance) video. For any other video model, see `models/veo.md`, `models/prompt-copilot.md`, or generic video rules in `SKILL.md`.

**Kolbo MCP routing:** Seedance is a video model — call `generate_video` (text-to-video) or `generate_elements` (when video references / Visual DNA / first-last frames are involved). Run `list_models({ type: "text_to_video" })` and pick a Seedance variant by name.

## Universal Rules (apply to EVERY Seedance prompt)

- **First line ALWAYS declares shot structure**: total duration, shot count, aspect ratio. Example: `Total: 15s / 6 shots / 16:9`. Put it at the BOTTOM of the prompt too. For connected narrative sequences the proven phrasing is `N connected cinematic shots, 15 seconds total, 16:9, Multishot ON` — use it and keep `Multishot ON` for any multi-shot story.
- **Order inside each shot**: Subject → Action → Camera → Style → Constraints → (Audio/SFX if relevant).
- **Prompt length**: aim for ~120–280 words TOTAL across all shots combined (not per shot). Shorter than ~120 words = random output. Longer risks the 8000-char cap below and makes the model forget the opening. For 6-shot prompts, keep each shot 1–2 tight sentences.
- **Character lock**: if a character recurs, open with `same character throughout all shots` to stop identity drift.
- **Max 3 shots per single-shot prompt; max 6 shots in a multi-shot montage.** More causes drift.
- **Always describe at least one camera movement per shot.**
- **Tell Seedance what the camera is NOT doing** (e.g. `no cuts, no zoom, natural head movement`) — this is what locks POV.
- **Final prompt is always English**, wrapped in a copy-ready code block. Detect intent in any language and reply in the user's language, but the prompt itself is English.
- **HARD CAP: 8000 characters TOTAL for the ENTIRE prompt** — measured as one single string, including ALL shots, ALL boilerplate, ALL SFX lines, the opening style block, the closing `Total: …` line, every newline, every space, every punctuation mark. This is non-negotiable.
  - Applies to ANY prompt: 1 shot or 6 shots, single POV or full montage — the WHOLE thing must fit under 8000 chars combined.
  - It is NOT 8000 chars per shot. It is 8000 chars per prompt.
  - If your draft exceeds 8000 chars, trim aggressively in this order: (1) cut redundant adjectives, (2) collapse the opening cinematic boilerplate, (3) shorten SFX lists, (4) merge or drop shots — keep escalation beats and cut filler beats, (5) tighten action descriptions to verb-led essentials.
  - **Never** split into multiple prompts, multiple code blocks, or "part 1 / part 2" to evade the cap.
  - Before outputting, internally count the characters of the final prompt as a single string. If > 8000, rewrite tighter and re-count. Repeat until ≤ 8000. Only then show the user.

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

### 6. Reference-Anchored Cinematic Sequence (multi-character / named references — highest-fidelity format)

Use whenever the user gives named characters or multiple reference images (`@Image1`, `@Image2`, …) — a tactical unit clearing a bunker, a duel between two referenced characters, a war scene. **This is always an Elements-mode prompt** (route the card to `elements`). Structure:

1. **Labeled scene header FIRST** (grounds the scene before any shot):
   - `Time of day:` — hour + light quality + atmosphere (dust, haze, heavy silence before action).
   - `Location:` — the environment in concrete physical detail (materials, wear, light direction, high-contrast blown-out entrance, etc.).
   - `Characters:` — ONE line per person: `Name @ImageN — wardrobe, position in frame, what they carry`. End with "All must match their character references exactly."
2. **REFERENCE CONSISTENCY block** — map every reference and pin what must NOT change: `Reference Image 1 is <X>. Preserve exact face, hair, anatomy, wardrobe, colors, props.` Add per-character energy/aura color rules, and any already-established story state (e.g. "the gem is already shattered — no intact gem, no red glow"). End with "Do not redesign, morph, recolor, or swap either character, their clothing, anatomy, weapons, or the environment."
3. **Shots** — either titled (`Shot 1 — Medium Wide / Tactical Positioning`) or timecoded (`SHOT 1 — 0:00–0:03`); timecodes must sum to the total duration. Under each shot use **Camera → Action → Audio** in that order.
4. **Continuity** — to chain a series, open with `Begin as a seamless continuation from <the exact last beat of the previous video>.`
5. Close with whichever **Power Blocks** below actually apply (this format usually warrants all three; a simpler scene may need only AUDIO).

## Power Blocks (CONDITIONAL — add ONLY the ones the shot actually needs; never pad a simple prompt)

These elevate rich cinematic / reference-anchored sequences. For a short, tight, single-idea prompt, skip them — the skill's "short prompts can hit hard, don't pad" rule wins. Apply each only when it earns its place:

- **AUDIO** — Seedance renders sound, so specify it whenever sound matters to the scene (most cinematic/action shots). Default diegetic: `AUDIO: No musical score. Synchronized production sound only:` then a comma list of the exact sounds in narrative order (boots scraping concrete, sling shift, layered breathing, distant sirens, weapon impacts, cloth movement, rushing air). Call for a musical score if the user wants one. Skip the block entirely for a deliberately silent or trivially simple shot.
- **AVOID** — add when there's real drift risk: referenced characters/DNAs, an established story state, or a specific content tone to enforce. `AVOID:` + the drifts to forbid: character morphing, costume/anatomy changes, missing signature details (a piercing, a scar), camera looking into the lens, glamorous posing, duplicated characters, extra weapons, text / subtitles / logos, plus content-specific negatives (e.g. "intact gemstone, red aura" once it's destroyed). Skip it when there's nothing meaningful to forbid.
- **PHYSICAL GROUNDING** — only when the shot has a real contact/impact (a boot planted on a chest, a weapon lock, a body thrown): spell out weight transfer, full contact, stable balance, material reaction, and the victim's physical response. Not needed for talking, walking, or ambient shots.

## Dialogue & expression

- Dialogue goes in quotes and may be in ANY language (Hebrew included). For silent tension, deliver it as expression, not speech: `He does not speak. His expression clearly says: "…"`.

## Content tone

- **Brutal war realism** — allow `Hollywood-style blood squib` impacts (visible spray, spreading stain on clothing, violent body reaction, hard collapse) when the user wants gritty combat.
- **Restrained / no-gore** — when intensity is wanted without gore, state it explicitly (`brutal supernatural strike but no blood, no open wound, no exposed flesh`) AND add the gore terms to the AVOID list.
- **Rapid-cut montage** (`N cuts / 2 seconds each`) — a valid structure: fixed-length hard cuts, vary the angle every cut (wide / medium / low / side / close handheld), state "Hard cuts. No slow motion," and reserve slow motion for a single named beat if any.

## Universal Craft Layer (apply on top of any format above)

> This is the universal film-direction layer that lifts every prompt above the boilerplate. **Deep-dive reference:** `~/.kolbo/skills/seedance-2-prompting/SKILL.md` (Craft Edition — full block structure, every optical technique, and the pre-flight checklist).

### Core principle

The model reacts to what can be **seen and measured**, not to mood words. Translate abstractions into observables.

- ❌ "tense scene" → ✅ "man freezes, slowly clenches his fist, light only from the side, half his face in shadow"
- ❌ "cool cinematic shot of a car, epic, fast" → ✅ "low tracking shot alongside the car as it powers through a wet curve, headlights glowing, spray off the tyres, hard buffeting camera shake"

### Style — DISTRIBUTED, not a prefix

Never pile all style tokens at the top of the prompt. Each aspect lives in the block that already governs it:

- Lighting → inside the shot's LIGHTING description
- Lens / FOV → in OPTICS
- Color → either an explicit grade (when strong / stylized) or folded into LOCATION + LIGHTING for naturalistic looks
- Skin / acting → in PERFORMANCE
- Physics → in PHYSICS
- Format / resolution / grain → at the END as a suffix stack (before LOCKS)

### Shot sizes

| Abbr | Meaning | In frame |
|------|---------|----------|
| ECU | Extreme Close-Up | a detail: eyes, button, headlight, hand |
| CU | Close-Up | full face / one element large |
| MCU | Medium Close-Up | head and shoulders |
| MS | Medium Shot | roughly to the waist |
| WS | Wide Shot | full figure + surroundings |
| EWS | Extreme Wide | scale, location |

### FOV anchor table (degrees — what to write in the prompt)

| FOV | mm equiv | Purpose |
|-----|----------|---------|
| 180° | Fisheye | spherical distortion |
| 107° | 14–16mm | architectural ultra-wide |
| 84° | 20–24mm | wide |
| 63° | 28–35mm | observational |
| 47° | 40–50mm | neutral human perspective |
| 29° | 75–85mm | portrait compression |
| 18° | 100–135mm | natural portrait |
| 12° | 180–200mm | tele-detail |
| 8° | 300–400mm | extreme compression |

Use only the discrete steps. Not "23°" — use 18° or 29°.

### Prompting rules

- **Positive only.** ❌ "does not fall backward" → ✅ "stays upright, feet planted."
- **Speeds in km/h.** ❌ "fast/slow" → ✅ "moves at 40 km/h", "camera pans at 5 km/h."
- **Atmosphere in % / meters.** ❌ "light fog" → ✅ "fog density 40%", "haze visible at 15 meters depth."
- **Atmosphere builds in steps across shots.** Shot 1: 20% → Shot 2: 40% → Shot 3: 60%.
- **Giant scale via human-height.** ❌ "huge, three meters tall" → ✅ "stands as tall as four humans stacked."
- **Left/right is from the camera.** "Subject moves left" = left from the camera's view.
- **Emotion through muscle movement**, not labels. ❌ "she looks sad" → ✅ "her eyes drop to the table, jaw tightens, she swallows once before answering."
- **WB in Kelvin.** 3200K / 4000K / 5600K / 8500K. Pick ONE for the scene's mood.
- **Color as material + light + role**, never a flat list. ❌ "she wears red, he wears blue" → ✅ "crimson silk scarf catching the cold tungsten spill from the corridor".
- **No equipment names**, no director references, no "shot on ARRI / Sigma 85mm / Roger Deakins".

### Cuts and timing

- **Single continuous shot (oner)** → "one continuous shot, the camera does not cut on its own."
- **Sequential cuts, no timecodes** → "CUT 1 … CUT 2 … CUT 3".
- **Timed multishot** → explicit HARD CUTs at stated seconds, with timecode blocks `0.0s to 1.0s — [description]`.
- **Mixed real-time + slow-mo** → hard cuts only between speed modes. Each shot one speed start to finish.

### Special protocols

- **4-mechanism multishot consistency stack** (extreme FOV: 8°, 107°): (1) sequence-wide identity lock, (2) LENS LOCK opener per beat, (3) LENS CHECK closer per beat, (4) color via material + light, not as a list. All four required.
- **Whip-pan timing:** 0.3s Subject A settled → 0.8s WHIP motion-blur → 1.4s Subject B settled. Whip under 0.8s renders as a hard cut without blur.
- **Anti-impact lock** (cracks/breaks without impact): "crowd PRESSES, not strikes", "fracture originates from edge stress, not center impact", "no impact point — pressure-based crack."

### Optical techniques

- **Observation pattern (hidden-camera):** foreground occlusion 20–30% + atmospheric haze + 8°–12° super-tele vantage.
- **Sports broadcast:** 8° super-tele + handheld 1–2cm tremor + "anchored at distance, finding the action".
- **Tele compressed air column** at 8°–12°: "dust suspended in the long compressed air column between camera and subject".

### Camera placement

Place CAMERA in the **3rd position** of each shot's core layers (Subject → Action → Camera → Style → Constraints). FOV gets ignored at the end, conflicts with identity at the front.

### Pre-flight checklist (before output)

- Distributed style (no top-pile)?
- One camera movement per time slice?
- FOV in degrees from the table (not mm, not arbitrary)?
- WB in Kelvin?
- Speed in km/h, atmosphere in % or meters?
- Color via material + light + role?
- Positive phrasing (no "does not X")?
- No equipment / director names?
- Emotion through muscle, not labels?
- Multishot: FOV per segment + "no drift mid-segment"?
- 8000-char cap honored?

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

- Final prompt(s) ALWAYS in a fenced code block ready to paste into Seedance.
- After the code block, give a 1-line "why this works" note (camera/escalation/physics choice).
- If user asked in any language other than English, write your explanation in their language but keep the prompt itself English.
- **Never exceed 8000 characters TOTAL for the entire prompt as one string** — that is the WHOLE prompt including every shot, every line of boilerplate, every SFX list, every newline. NOT 8000 per shot — 8000 for the prompt as one combined unit. Count before output. If over, rewrite tighter (cut adjectives, collapse boilerplate, merge or drop shots). NEVER split into multiple prompts / multiple code blocks / "part 1 / part 2" to work around the limit.

## Where to run in Kolbo

Seedance 2 lives in the **Video** category. Route the prompt card by the INPUTS:

- **First & Last Frame** (`first_last_frame` tag) when the video must begin on one frame and end on another (start + end image, morph A→B). This wins even if Visual DNAs / characters / elements are referenced inside it — First-Last-Frame supports DNAs/elements too.
- **Elements** (`elements` tag) when the scene is built from reference assets — a Visual DNA / character (`@name`), a moodboard (`#name`), or reference images composed into a NEW scene, with no explicit start+end frame. This is the default for any "@Character does X" / loopable-idle / new-scene-from-my-refs request.
- **Image-to-Video** (`image_to_video` tag) only when a single existing image is animated as-is.
- **Text-to-Video** (`text_to_video` tag) only when there is no reference image or character at all.

## Seedance + Visual DNA / References

When a character must stay consistent, pair Seedance with Visual DNA via `generate_elements` (NOT `generate_video` — text-to-video silently drops `visual_dna_ids`). Tag the DNA inside the prompt with `@<dna-name>` — see `workflows/visual-dna.md`. For grid/storyboard inputs, the source frame is `@image1`.