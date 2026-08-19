<!-- PARITY: this file mirrors getSeedance25PromptSystemPrompt() in
     kolbo-api/src/config/systemPrompt.js.
     Craft layer (formats, optics, grid mode) lives in models/seedance.md —
     load that file too. Locked Intro is the same three blocks on both versions. -->

# Seedance 2.5 — Prompt Rules

Load this file when the user wants a **Seedance 2.5** video (they said "2.5" / "25", or they need longer than 15s, more than ~10 shots, or a large cast of references). Also load `models/seedance.md` for the shared craft layer.

**Kolbo MCP routing:** `generate_video` or `generate_elements` (refs / Visual DNA / first-last). Run `list_models({ type: "text_to_video" })` and pick the Seedance 2.5 variant by name.

**Audio:** Seedance 2.5 emits real synced audio. `list_models` shows `sound_generation_type: none` only because there is no in-app toggle (`sound_baked_in: true`) — it does NOT mean the model is silent, and it is never a reason to reach for TTS. Quoted dialogue is PERFORMED (synced voices, lip movement, room tone) alongside the SFX named in AUDIO, so scene dialogue never goes through `generate_speech` or `generate_lipsync`; write the lines in quotes inside their shot beats.

**Dialogue language: English.** Other languages are not reliably performed, and Hebrew does not work — it returns accented gibberish or English-shaped mouth movement. Never offer a user "Hebrew dialogue directly". See `models/seedance.md` for the three honest alternatives.

**Draft at 480p.** Resolution is a credit MULTIPLIER, not a flat rate. Relative to 720p: 480p ×0.44, 1080p ×2.25. A 30s pass costs ~540cr at 480p against ~1230cr at 720p and ~2770cr at 1080p. Block the film at 480p, get the user's sign-off on staging, performance and timing, then re-run only the approved cut at delivery resolution.

## What's NEW in 2.5 (verified — never hedge)

- **Duration 4–30 seconds**, whole seconds. 30s IS supported.
- **Up to 30 shots/cuts in ONE generation.** Deliver exactly N if N ≤ 30.
- **Prompt cap 15,000 characters** for the entire prompt as one string (`max_prompt_length` in the catalog; Seedance 2.0 is 10,000). Verify with `list_models` rather than trusting this number — it was documented as 30,000 for months, which is double the real limit.
- **Up to 50 reference medias / Visual DNA mentions** (`@Name`, `@ImageN`, `#Moodboard`). Every referenced asset must be tagged in the prompt text.
- **Multimodal refs:** images + video clips + audio can all anchor one generation.

## Locked Intro (DEFAULT — same shape as Seedance 2)

After the Total line, every multi-shot cinematic opens with:

```
[GLOBAL LOOK – LOCKED, APPLIES TO EVERY SHOT]
[CAST – IDENTICAL IN EVERY SHOT]
[LOCATION]
```

then timecoded `SHOT N — 0:00–0:02 — Medium / camera position` beats. Full skeleton, acting rules, and optical craft: `models/seedance.md`.

2.5 is where this format earns its keep: 15 shots timed to 30s, ~5k characters, one locked look so every cut matches camera / grade / cast. Do not skip the three blocks. Do not restack GLOBAL LOOK inside shots.

UGC / phone vertical (full craft: `workflows/ugc-smartphone.md`): NEVER write "cinematic". GLOBAL LOOK is phone-native. Use `N connected phone shots, Xs total, 9:16, Multishot ON` and restate `9:16 vertical phone frame` inside every shot.

## Prompt length

Simple ≤15s ~120–280 words. Locked-intro cinematic 15s typically 400–900 words. Full 30s / 15+ shots typically 700–1200 words / ~4k–9k chars. Hard cap 15,000 characters. Never split into part 1 / part 2.

A one-line shot beat is UNDER-WRITTEN. At 30s / 8+ shots you have ~15k characters to work with and a thin prompt wastes them: every beat carries its own camera move, performance task for BOTH the speaker and the listeners, prop/hand state, and the sound in that beat. If a 30s compile lands under ~4k characters, it is too thin — go back and direct it.

## Feature-Block (optional, UNDER the Locked Intro)

Reach for extra department passes only when the user wants "their best possible 30 seconds" AND the 15k budget still has room after GLOBAL LOOK / CAST / LOCATION. Never replace the Locked Intro.

May add above GLOBAL LOOK: **EMOTIONAL INTENT** + **SIGNATURE MOMENT**.
May add under the shot list: CAMERA timecode pass, SOUND timestamps, PHYSICS contract, EDITING/CONTINUITY, DIRECTORIAL NOTES.
Skip CORE STYLE / SUBJECT / ENVIRONMENT — the three locked blocks already own those.

## References (ByteDance 2.5)

- Limits: up to 30 images (each ≤4K), up to 10 videos (≤30s combined), up to 10 audio clips (≤30s combined); up to 50 materials total.
- Role mapping is mandatory, one line per material:
  - `@Image N defines <subject>'s <appearance, clothing, structure, or material>.`
  - `@Video N defines <motion, camera movement, or pacing>.`
  - `@Audio N defines <character or sound type>'s <voice, dialogue, ambience, or music>.`
- Add exclusions when a material's people/background could leak: "Do not use the image background." / "Do not use the people in the image."

## Task-locked parameters

- **Video editing:** aspect + duration auto-preserve the source. Do NOT declare AR / duration / shot-count headers. Use `[Edit Goal]` / `[Source Video Role]` / `[Target Material Role]` / `[Edit Scope]` / `[Content to Preserve]`.
- **First-frame / first-and-last-frame:** AR comes from the FIRST image. Duration CAN be set.
- **Video extension:** AR auto-preserves the input; duration CAN be set.

## Where to run in Kolbo

Same routing as Seedance 2 (`first_last_frame` / `elements` / `image_to_video` / `text_to_video`). Pair Visual DNA with `generate_elements` and write the exact `@DNA_name` in CAST and every shot — never "Zohar's" / "the left man" / an untagged "Visual DNA anchors" paragraph. Elements uses this same Locked Intro; do not compile SCENE CONTEXT / OPTICS / ACTION packs.
