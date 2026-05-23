# Cost Awareness, Validation & Constraints

Load this file when you need to: confirm cost before firing a generation, validate input params against a model's caps, or quote real cost after a generation completes.

## Billing Units by Type

Creative generations bill against the user's Kolbo credit balance. **Billing units differ by type** — apply the correct formula before generating.

| Type | Billing unit | Credit range | Example |
|------|-------------|-------------|---------|
| **Image** | per image (flat) | 1–30 cr | Flux.1 Fast = 1 cr, Midjourney = 4 cr. If `resolution` is set, check `resolutionMultipliers` — some families multiply cost significantly at higher tiers. |
| **Image edit** | per image (flat) | 2–20 cr | |
| **Video** | **cr/s × duration** | 2–30 cr/s | Kandinsky 5 Fast × 5s = 10 cr; Seedance 2.0 × 10s = 300 cr. Check `resolutionMultipliers` + `soundCreditMultiplier`. |
| **Video from image** | **cr/s × duration** | 4–30 cr/s | Same per-second rule. |
| **Elements (ref-to-video)** | **cr/s × duration** | 4–30 cr/s | Check `credit` and multipliers in `list_models type="elements"`. |
| **Lipsync** | **cr/s × duration** | 5–20 cr/s | |
| **Music** | per generation (flat) | 15–60 cr | Suno v5 = 15 cr; ElevenLabs Music = 60 cr |
| **Speech (TTS)** | per 100 characters | 2–5 cr/100 chars | ElevenLabs (5) × 500 chars = 25 cr |
| **Sound effects** | per generation (flat) | 4–7 cr | |
| **3D model** | per model (flat) | 5–300 cr | Trellis = 5 cr; Meshy v6 = 150 cr; Marble 1.1 = 300 cr |
| **Transcription (stt)** | per minute of audio | `model.credit × duration_minutes` | |

## Calculation Formulas

Apply when confirming cost before firing:

- **Video / Lipsync**: `total = model_credit_per_second × duration_seconds`. Never assume the credit shown is a flat per-generation cost for these types.
- **Music**: flat per generation — `total = model_credit` (duration does not change cost).
- **TTS**: `total = model_credit × ceil(character_count / 100)`. Count actual characters first. 1000 chars with ElevenLabs = 50 credits.
- **Images / 3D / Sound effects**: `total = model_credit × quantity`.
- **Resolution / audio multipliers**: if `resolution` is set or model has native audio, read `resolutionMultipliers[tier]` and `soundCreditMultiplier`. Formula: `final = base × resolutionMult × (sound ? soundMult : 1) × durationSeconds`.

### Tier label → pixel mapping (rough)

- Images: `"1K"` ≈ 1024px, `"2K"` ≈ Full HD (1920×1080), `"3K"` ≈ QHD (2560×1440), `"4K"` ≈ UHD (3840×2160). Picker shows only tiers the model supports (per `supported_resolutions`).
- Videos: `"720p"` / `"1080p"` / `"1440p"` / `"2160p"` = vertical pixels. Some models use model-specific labels like `"512P"` / `"1024P"` (Hailuo).

## When to Confirm Cost

**Skip cost confirmation when:**
- The user already specified model + count + duration ("make 5 videos, seedance 2 fast, 15s" IS the confirmation).
- A single generation costs under 5 credits.

**Required cost confirmation when:**
- Anything else — present a one-line summary: "8 videos × 5s × [model] @ X cr/s = **Y credits**. Proceed?"
- Suggest a cheaper alternative if one exists.
- Wait for the user's confirm before firing.

**Batch totalling 100+ credits:** run `check_credits` first and include the available balance in the summary.

## ⚠️ Quote Real Cost, Never Estimates (CRITICAL)

Pre-flight formulas above are for **preview only**. After firing, every generation returns `credits_used` (multiplier-adjusted total) and `credits_breakdown` (per-model attribution).

```json
{
  "credits_used": 12,
  "credits_breakdown": [
    { "model": "nano-banana-2", "base": 8, "final": 12, ... }
  ],
  "urls": [...]
}
```

**Log `credits_used` to `.kolbo/production.md`**, not `base × count`. The multiplier-adjusted number is the only truth.

When the user asks "how much did I spend?" → call `get_session_usage` for the real, multiplier-adjusted session total + per-tool + per-model breakdowns (same numbers as the desktop bottom-bar counter).

## Validation Pattern — Every Generation

Before submitting:

1. Call `list_models type=<tool-type>` (text mode is enough for picking; `format: "json"` for programmatic comparison).
2. For each input array (refs / DNAs / elements) — check `length <= <cap>` from the canonical field reference below. If over, drop the lowest-priority entries OR ask the user.
3. For each enumerated value (`aspect_ratio` / `resolution` / `duration`) — check it's in `supported_*`. If not, **do not silently substitute**; show the user the allowed set and ask.
4. For each duration-bearing file (source_video for lipsync/v2v, audio for lipsync/elements) — pre-check duration against the min/max range. Use ffmpeg if needed.
5. For uploads — pre-check size against `max_file_size`.

The MCP tool descriptions also embed the cap field name on the relevant parameter (e.g. `reference_images: "...Cap: pass at most max_reference_images..."`) — use those as inline reminders.

## Canonical Field Reference — Which `list_models` Field Controls Which Input

The same conceptual slot (e.g. "max reference images") lives under **different field names per model family**. Read the row for your tool, not the model name.

| Your input | Tool(s) | Field on the model | What `0` / `null` means |
|---|---|---|---|
| `reference_images` | `generate_image`, `generate_image_edit` (uses `source_images`), `generate_creative_director`, `generate_video` | `max_reference_images` | `0` = no refs |
| `reference_images` | `generate_elements` | `elements_max_images` | `0` = no image refs |
| `reference_images` | `generate_video_from_video` | `max_images` | `0` = no secondary image input |
| `reference_videos` | `generate_elements` | `elements_max_videos` | `0` = no video refs |
| `reference_videos` | `generate_video_from_video` | `max_videos` | `<= 1` = only the source_video |
| `elements` | `generate_video_from_video` | `max_elements` | `0` = no elements |
| `audio_url` | `generate_elements` | `elements_max_audio` (+ `max_audio_duration` for the file) | `0` = no audio ref |
| `visual_dna_ids` | every DNA-aware tool | `max_visual_dna` (+ `supports_visual_dna` boolean) | `null` / `0` / `false` = model rejects DNA |
| `aspect_ratio` | any | `supported_aspect_ratios` (or `_by_type[<type>]` when multimodal) | empty → `default_aspect_ratio` if set |
| `resolution` | any | `supported_resolutions` (+ `resolution_multipliers` for cost) | empty → no resolution tiering |
| `duration` (video output) | video tools | `supported_durations`, else `min_output_duration`–`max_output_duration` | both null → omit and let server default |
| **input** video duration | `lipsync-video`, `generate_video_from_video` | `min_video_duration` – `max_video_duration` | outside range → reject |
| input audio duration | `generate_lipsync`, `generate_elements` audio | `min_audio_duration` – `max_audio_duration` (+ `audio_max_follows_video_duration` for lipsync) | outside range → reject |
| audio file format | any audio input | `supported_audio_formats` (e.g. `["mp3","wav","m4a"]`; empty = all) | pre-validate before upload |
| recording duration | `text_to_speech` recording UX | `min_recording_duration` – `max_recording_duration` | usually null for plain TTS |
| upload file size | every file upload | `max_file_size` (bytes) | null → use platform default |
| `num_images` | image tools | `images_per_request` overrides for fixed-output models (Midjourney returns 4) | null → `num_images` honored as-is |
| `prompt` | every tool | `requires_prompt`, `min_prompt_length`, `max_prompt_length` | null → unconstrained |
| sound on/off | video tools | `sound_generation_type` (`"native"` vs `"none"`), `sound_enabled_by_default`, `sound_credit_multiplier` | not `"native"` → can't emit synced audio |
| capability gate | route decision | `supports_visual_dna`, `supports_first_last_frame`, `supports_audio_input` | `false` → the controller silently drops that param |

Cost formula: `final_cost = credit × resolution_multipliers[resolution] × (sound_enabled ? sound_credit_multiplier : 1)`, multiplied by `num_images` / `scene_count` as applicable.

## Decision Rule for Resolution

1. **User specified resolution explicitly** ("4K", "1080p", "480p") → ALWAYS verify in `supported_resolutions` BEFORE firing. If not supported:
   - ❌ Do **NOT** silently substitute. The user asked for 480p; sending 720p without consent burns 1.5–2× the credits they expected.
   - ✅ Show them the supported set in one line and ask:
     > "Seedance 2 elements supports `[720p, 1080p, 1440p, 2160p]` — 480p isn't available. Closest cheap option is 720p (~+0 credits over your intent). Want 720p, or pick another?"
   - Only fire after they reply.
2. **User specified quality intent without numbers** ("draft", "quick test", "final delivery", "for client", "production"):
   - draft / quick / preview → cheapest in `supported_resolutions` (1K / 720p)
   - normal / standard → middle tier (typically 2K / 1080p)
   - final / production / hero → highest the user's budget allows (3K-4K / 1440p-2160p)
3. **No quality signal AND cost difference >2×** OR total batch ≥4 outputs → **ask the user once** with a one-line cost comparison, then default to standard if they don't reply.
4. **No quality signal AND cost difference ≤1.5×** → quietly use the cheapest supported, no need to interrupt.
5. **Sound on a video model with `sound_credit_multiplier > 1`** → if user didn't ask for sound, leave it off. If user said "with sound" / "with music", enable it.

## Defaults When Nothing Is Specified

- **Image**: `1K` (or the cheapest in `supported_resolutions`).
- **Video**: `720p` (or the cheapest), with `default_duration` (or shortest in `supported_durations`).
- **Sound**: respect `sound_enabled_by_default`; if false, leave off.

## Always Log the Resolution / Duration / Sound Choices

Production-log entries should include the resolution and (for video) duration + sound state alongside the URL, so the user can see what they paid for:

```md
- still: https://...01-coffee.png  (flux-2-pro · 1K, 2026-05-14)
- video: https://...02-rain.mp4   (kling-2 · 1080p · 5s · sound-off, 2026-05-14)
```
