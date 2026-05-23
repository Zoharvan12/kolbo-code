# Transcription & Video/Audio Analysis

Load this file when the user wants to transcribe audio/video, get SRT subtitles, or analyze video/audio content. For image analysis, use native vision (no tool needed) — see "Image analysis" at bottom.

## Decision Tree

You have three routes. The right one depends on the file profile — pick before calling any tool.

```
Image (jpg/png/webp)?                         → Read directly (native vision, up to 10 per pass)
File >100MB OR >15 min OR dialogue-dense?     → HYBRID (transcribe + ffmpeg frames + Read + your synthesis)
User wants the transcript/SRT as deliverable? → transcribe_audio, return the URLs
Precise answer about one specific frame?      → ffmpeg that frame → Read
Otherwise (short/medium video, mixed content) → upload_media → chat_send_message (Gemini native)
```

## Why `upload_media` → chat is **not** always the default

Gemini-via-chat processes frames + motion + audio in one pass and is the simplest route when it works. But it has three known failure surfaces — recognize them and pivot to the hybrid path:

1. **>100MB upload cap.** Hard limit; the upload won't succeed. No option but to split with ffmpeg or go hybrid.
2. **Long-form decay** (rough threshold: 15–20 min). Even when it fits, attention degrades — shallow or hallucinated answers on the back half of the file.
3. **Transcription-dense laziness.** Lectures, interviews, podcasts, anything where speech is the substance: chat models summarize aggressively, paraphrase quotes wrong, or silently skip stretches. Always transcribe these first to get the actual words, then add visuals only if they matter.

## The hybrid path (workaround for all three failures)

```
1. transcribe_audio({ source }) → text, srt_url, word_by_word_srt_url, duration
2. Read the transcript text from the tool output directly
3. Pick 3–8 timestamps from the SRT where visuals actually matter
4. ffmpeg -ss <ts> -i <file> -frames:v 1 <frame.jpg>   (one extract per timestamp)
5. Read each frame with native vision (up to ~10 frames per analysis pass)
6. Synthesize from transcript + frames + the user's question
```

This is usually **cheaper** than chat for long files — transcription is per-minute, ffmpeg + Read are free — and produces stronger answers on dialogue-heavy material because you have the complete text, not a model's summary of it.

For media >30 min (past the transcription cap), split with ffmpeg into ~25-min chunks, transcribe each, concatenate.

## Transcribe-as-deliverable vs transcribe-as-input

| Request pattern | Action |
|---|---|
| "Transcribe this" / "give me an SRT" / "I need word-by-word timing" / "make subtitles" | Run `transcribe_audio`, return the URL(s). The transcript IS the deliverable. |
| "What did they say about X?" / "Summarize this meeting" / "Find the part where they mention Y" | Run `transcribe_audio` to *get* the text → **you** read/summarize/search. Transcript is a means, not the answer. |

## `transcribe_audio` — tool details

- `source`: URL or absolute local path.
- **Audio**: mp3, wav, m4a, flac, aac. **Video** (audio track extracted): mp4, mov, webm, mkv, avi, m4v.
- **30-minute hard cap.** Longer → split with ffmpeg first.
- Returns:
  - `text` — full transcript, plain.
  - `srt_url` — grouped SRT (~12 words per line, up to 2 lines per subtitle). Use this for normal subtitle delivery.
  - `word_by_word_srt_url` — one word per cue with millisecond-precise start/end (ElevenLabs Scribe v2). Use **only** when downstream is animation (Remotion captions, after-effects karaoke, precise speech-aligned cuts). Noise for normal subtitle workflows.
  - `txt_url` — plain text file.
  - `duration` — seconds.
- Cost: per-minute (`model.credit × duration_minutes`). Run `check_credits` before transcribing very long files.
- Read-only / discovery — does NOT trigger the `.kolbo/production.md` log nudge. If the user wants the transcript saved as a durable artifact, `Write` it to a workspace file, not the production log.

## `upload_media` → `chat_send_message` — tool details

- `upload_media({ source: "/absolute/local/path/file.mp4" })` → returns `{ url, thumbnail_url, ... }`. **Use `url`** (the CDN URL); ignore `thumbnail_url` (preview JPG only).
- `chat_send_message({ message, media_urls: [url] })`:
  - `media_urls` is **mandatory** — the model only sees the file if you pass the CDN URL here. Always an array.
  - **Omit `model`** — Smart Select auto-routes to Gemini when media is detected.
  - Sessions do NOT remember media between messages. On retry: reuse the same CDN URL (no re-upload), but always pass `media_urls` again.
  - Batch / many short videos cost-sensitively: `list_models` for the cheapest Gemini, pass it explicitly.

## Image analysis — never via chat

You have native vision. **Always `Read` images directly** (you handle up to 10 per pass). Do not `upload_media` + chat for images unless the user explicitly names a specific Kolbo chat model. Don't extract frames from images either — they're already viewable.

**NEVER ask the user which path to use — diagnose from the file profile and pick.**

## ⚠️ Batching Media in Chat Messages (CRITICAL)

**Send ALL media in ONE `chat_send_message` call.** `media_urls` accepts up to **10 URLs**. Each separate chat call counts toward rate limits — splitting trips "Too many generation requests."

```
# Step 1: parallel uploads (one response)
upload_media({ source: "video1.mp4" }) → url1
... (up to 10)

# Step 2: ONE chat call with all URLs
chat_send_message({ message: "Analyze all 5 videos...", media_urls: [url1, url2, ...] })
```

On 429: wait 60s, retry the same chat call — reuse the CDN URLs, do not re-upload.

**Never:** pass a local path in `media_urls` (CDN URLs only); use a transcription `.txt` URL as a video URL; construct a CDN URL yourself; split media across multiple chat calls.

## Analyzing the source before a chained generation — when it's worth it

Before feeding a media asset into another generation tool (`generate_image_edit`, `edit_image`, `generate_video_from_image`, `generate_first_last_frame`, `generate_video_from_video`, `edit_video`, `generate_elements`, `generate_lipsync`), think about whether you actually *know* what's in the source. If you don't, analyze it first so the next prompt can reference concrete details instead of generic adjectives.

**Analyze first when:**

- The source is **old** — more than a few turns back, or pulled via `list_media` / `get_media` from earlier in the project. Context has drifted; you likely don't remember the specifics.
- The source was **user-provided without a description** — they pasted a URL or uploaded a file but didn't say what it shows.
- The previous prompt was **vague** ("make something pretty", "a cool shot") — the output details matter and you don't know them.
- The chain step needs to **preserve specific details** the original prompt didn't pin down (exact pose, color of a prop, lighting direction, audio room tone, etc.).
- Source is a **video or audio** going into elements / video-from-video / lipsync — motion direction, pacing, voice characteristics, and ambient bed drive the next prompt and can't be guessed from a URL.

**Skip analysis when:**

- You **just generated** the asset in the same conversation with a precise prompt — that prompt *is* the spec. Re-analyzing wastes credits.
- The edit is **mechanical** — "remove background", "brighten 10%", "loop to 5 seconds", "crop to 1:1". The source content doesn't matter.
- The user already **described what's in it** in this turn.

Default to skipping unless one of the "analyze first" cases applies — an analysis-per-step habit on long chains burns credits and latency without adding signal.

**How to analyze (pick by media type):**

| Source media | How |
|---|---|
| Image (URL or local) | Your native vision — view it directly. No `chat_send_message` round-trip needed. |
| Video / Audio | `chat_send_message({ message: "Describe...", media_urls: [url] })`. Batch up to 10 URLs in **one** call (see batching rule above). Omit `model` so Smart Select routes to Gemini vision. |

**What the analysis should extract** (use whatever is relevant for the next step's prompt):

- **Subject** — pose, expression, framing (head-and-shoulders / full body / wide).
- **Wardrobe & props** — exact colors, materials, distinguishing items.
- **Scene & environment** — location, time of day, weather, background depth.
- **Lighting & color palette** — dominant temperature, key/fill direction, contrast, color grade.
- **Camera** — angle, focal length feel (wide / portrait), depth-of-field.
- **Motion** (videos only) — direction, speed, camera move (push-in, pan, locked), what changes between first and last frame.
- **Audio** (videos/audio only) — voice characteristics, ambient bed, speech pace, music tempo/mood.
- **Anything that already looks wrong** — artifacts, blurred faces, wrong fingers, blown highlights, audio glitches — note these so the next prompt either fixes them (edit) or doesn't preserve them (elements/video).

**Then write the next prompt with concrete references**, not generic adjectives. Example for an image-to-video chain:

Bad — generic, no analysis:
```
prompt: "Animate this image with a slow push-in"
image_url: <generated still>
```

Good — analyzed first, prompt names the specifics:
```
prompt: "Slow 4-second dolly-in toward @maya's face from the medium shot;
         the warm golden-hour rim light on her left shoulder stays
         consistent; the wind moves the leaves behind her gently to the
         right. Camera locked, no shake. Subject does not turn — she keeps
         the half-smile and direct eye contact from the still."
image_url: <generated still>
visual_dna_ids: ["vdna_8f2c"]   // maya
```

The point is **not** to dump an essay into the prompt — it's to make sure every concrete detail the next model needs to preserve (or change) is named, so the chain doesn't lose continuity across steps.

**Production-log tie-in:** when you analyze a generated still/clip, write a one-line description into `.kolbo/production.md` next to the URL — that way the next chained step can read the log instead of re-analyzing.

## Image Analysis Detail (when the user uploads images)

When the user shares an image and asks about it:

- **Analyze thoroughly**: describe composition, subjects, colors, lighting, style, text/signage, setting, mood, visible objects, and any embedded information (charts, diagrams, screenshots).
- **Reference specific regions** when helpful: "top-left corner", "in the foreground", "the figure on the right".
- **Extract text verbatim** when asked (OCR-style requests are fine).
- **Cannot identify real people.** Describe hair, clothing, pose, expression, and apparent role — but never name a specific individual, even a well-known public figure. If the user insists, decline and offer to describe instead.
- **Copyrighted content**: summarize and reference, don't reproduce verbatim large chunks.
- If the user wants an **edit** based on the analysis, hand off to `generate_image_edit` (visual edit) or `generate_video_from_image` (motion).
