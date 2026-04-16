---
name: video-production
description: >
  Full-stack video production assistant. Analyzes video content visually (Gemini),
  generates transcriptions/SRT subtitles, plans and creates motion graphics (Remotion),
  generates B-roll images/videos, produces timeline XMLs for Premiere/DaVinci.
  Downloads YouTube videos with yt-dlp.
  Use for: video analysis, visual analysis, describe video, what's in this video,
  transcription, subtitles, motion graphics, B-roll, shorts, timeline XML, clip cutting,
  silence removal, After Effects, Premiere Pro, DaVinci Resolve, YouTube download.
  Keywords: video edit, ffmpeg, remotion, after effects, premiere, davinci, shorts, subtitles,
  motion graphics, clip, render, transcribe, xml, timeline, b-roll, talking head, analyze,
  yt-dlp, youtube, download, gemini, vision
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
  - Agent
  - AskUserQuestion
  - TaskCreate
  - TaskUpdate
  - WebFetch
---

# Video Production — Strategy Map

## ⚠️ DEFAULT RULE: Video Analysis = Visual Analysis (NOT Transcription)

**When the user shares a video file and asks to "analyze", "describe", "what's in this", "what prompts are shown", or gives no specific instruction — ALWAYS do visual analysis via Gemini. Never default to transcription.**

- **Visual analysis** → `upload_media` → `chat_send_message` with `media_urls` (omit model — Smart Select auto-routes to Gemini)
- **Transcription** → ONLY when user explicitly says "transcribe", "subtitles", "SRT", "captions", or "what's being said"

**Never use ffmpeg to extract frames for analysis. Never use local Ollama/vision models. Commit to the right action — do not ask the user. Wait for `chat_send_message` to return before proceeding — it polls until done (up to 2 min). Do NOT fall back to ffmpeg or any other approach if it takes time.**

| Trigger | Action |
|---------|--------|
| "analyze this video" / "what's in this?" / "describe this" / "what prompts do you see?" / file path with no instruction | Visual analysis — `upload_media` → `chat_send_message` + Gemini |
| "transcribe" / "subtitles" / "SRT" / "what's being said" / "captions" | `transcribe_audio` |
| Both visual + transcript | Run both |

---

## Kolbo MCP Tools (Active When `kolbo auth login` Is Done)

These are available as MCP tools — use them directly without any Python/API key setup:

| Tool | Use |
|------|-----|
| `upload_media` | Upload local file to Kolbo CDN → get stable public URL |
| `chat_send_message` | Send message + `media_urls` array to Gemini for visual analysis |
| `transcribe_audio` | Transcribe audio/video to text + SRT (ElevenLabs Scribe) |
| `generate_image` | Generate B-roll images |
| `generate_video` | Generate B-roll videos |
| `generate_video_from_image` | Animate a still into video |
| `generate_music` | Generate background music |
| `generate_speech` | TTS for voiceover |
| `generate_sound` | Sound effects |
| `list_models` | Browse available models by type |
| `check_credits` | Check remaining Kolbo credit balance |

### Visual Analysis Workflow (use this for ANY video/image analysis task)

```
Step 1: upload_media({ source: "/absolute/path/to/video.mp4" })
  → Response contains: url, thumbnail_url, id, name, type, ...
  → Use "url" — this is the actual video CDN URL to send to Gemini
  → IGNORE "thumbnail_url" — that is a preview JPG, NOT the video

Step 2: chat_send_message({
  message: "Describe this video in detail. What is shown?",
  media_urls: ["<the url field from step 1>"]   ← array, "url" not "thumbnail_url"
})
→ returns: { content: "..." }
```

**Critical**: `media_urls` must be an array `[url]` using the `url` field (not `thumbnail_url`).
**Omit `model`** — Smart Select detects video/audio and auto-routes to Gemini.

For YouTube videos — download first with yt-dlp (see below), then follow steps 1–2 above.

---

## Pipeline

```
Input: local video / YouTube URL / uploaded file

→ [DEFAULT] Visual Analysis: upload_media → chat_send_message (Gemini)
→ [EXPLICIT REQUEST] Transcription: transcribe_audio → SRT / text
→ [EDITING] FFmpeg: cut, silence removal, 9:16 conversion
→ [MOTION GRAPHICS] Remotion: compositions, captions, B-roll
→ Output: Premiere XML / DaVinci EDL / MP4s / SRT
```

## APIs & Capabilities

| Service | Use |
|---------|-----|
| Kolbo MCP (`upload_media` + `chat_send_message`) | **Primary** — visual video/image analysis via Gemini |
| Kolbo MCP (`transcribe_audio`) | **Primary** — transcription, word-level SRT, multilingual |
| yt-dlp | Download YouTube/social media videos |
| FFmpeg | Local video editing, cutting, silence removal, format conversion |
| Remotion Lambda | Cloud render motion graphics |
| fal.ai (MCP) | Image & video B-roll generation |
| ElevenLabs | TTS, voice cloning, SFX (via Kolbo MCP `generate_speech`) |
| Suno | Background music (via Kolbo MCP `generate_music`) |

> Kolbo MCP tools need no API keys — auth is handled by `kolbo auth login`.
> FFmpeg/yt-dlp need to be installed locally on the machine.

## YouTube / Social Media Download (yt-dlp)

Download video from YouTube, TikTok, Instagram, Twitter, etc.:

```bash
# Best quality MP4
yt-dlp -f "bestvideo[height<=1080][ext=mp4]+bestaudio/best" \
  --merge-output-format mp4 \
  -o "%(id)s.%(ext)s" <url>

# With subtitles
yt-dlp -f "bestvideo[height<=1080][ext=mp4]+bestaudio/best" \
  --write-auto-sub --sub-lang en --convert-subs srt \
  --merge-output-format mp4 \
  -o "%(id)s.%(ext)s" <url>

# Audio only (for transcription)
yt-dlp -f "bestaudio" --extract-audio --audio-format mp3 -o "%(id)s.%(ext)s" <url>
```

After download → upload to Kolbo CDN with `upload_media` → analyze visually with `chat_send_message`.

---

## Key Rules

- **FFmpeg on Windows**: always copy inputs to `tempfile.mkdtemp()` first (handles spaces in paths)
- **9:16 shorts**: blurred background + centered content — never crop the original
- **Hebrew / RTL subtitles**: ASS format, Heebo Bold font, `\pos()` for RTL rendering
- **Video quality standard**: `-c:v libx264 -crf 18 -c:a aac -b:a 128k`
- **Image generation**: prefer fal MCP server over Python scripts when available
- **Silence removal**: `silencedetect -35dB:d=0.4` → trim+concat → `atempo=1.14`

## Transcription

Use ElevenLabs Scribe for word-level SRT with speaker diarization:
```python
import requests

def transcribe(audio_path, api_key, language="he"):
    with open(audio_path, "rb") as f:
        response = requests.post(
            "https://api.elevenlabs.io/v1/speech-to-text",
            headers={"xi-api-key": api_key},
            files={"file": f},
            data={"model_id": "scribe_v1", "language_code": language,
                  "timestamps_granularity": "word", "diarize": True}
        )
    return response.json()
```

## 9:16 Shorts — Blurred Background

```python
filter_complex = (
    "[0:v]split[bg][fg];"
    "[bg]scale=1080:1920:force_original_aspect_ratio=increase,"
    "crop=1080:1920,gblur=sigma=40[blurred];"
    "[fg]scale=1080:1920:force_original_aspect_ratio=decrease,"
    "pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black@0[front];"
    "[blurred][front]overlay=0:0"
)
```

## Silence Removal

```python
import subprocess, json

def detect_silence(video_path, noise_db=-35, duration=0.4):
    result = subprocess.run([
        "ffmpeg", "-i", video_path,
        "-af", f"silencedetect=noise={noise_db}dB:d={duration}",
        "-f", "null", "-"
    ], capture_output=True, text=True)
    # Parse silence_start/silence_end from stderr
    ...
```

## RTL (Hebrew/Arabic) Subtitles

For comprehensive RTL subtitle handling, load the `subtitle-production` skill — it contains full patterns for:
- Simple SRT burn-in with Heebo font + `Encoding=177`
- ASS per-word positioning for karaoke (with PIL `~0.74` scale factor)
- Remotion RTL captions with CSS `direction: rtl` and all the flip rules
- RTL progress bar with FFmpeg `geq` filter

**CRITICAL**: Any inline ASS tag (`\c`, `\K`, `\1c`, etc.) between RTL words breaks Unicode bidi in libass — words render LTR. Use separate Dialogue lines per word instead.

For Remotion RTL layout rules (padding flips, transform-origin, gradient direction), load the `typography-video` skill.

## Remotion Motion Graphics

For motion graphics rendering, use the `remotion-best-practices` skill for detailed Remotion patterns.

For cloud rendering via Remotion Lambda:
```bash
npx remotion lambda render <serve-url> <composition-id> --out output.mp4
```

## Premiere Pro XML Timeline

```python
def generate_premiere_xml(clips, output_path, fps=30):
    # Generate FCP7 XML compatible with Premiere Pro
    ...
```

## Output Structure

Organize outputs per project:
```
<project>/
├── raw/          # original footage
├── transcripts/  # SRT, word-level JSON
├── clips/        # cut segments
├── shorts/       # 9:16 vertical versions
├── b-roll/       # generated B-roll images/videos
├── motion/       # Remotion compositions
└── export/       # final deliverables + XML timelines
```

## Check Before Writing New Scripts

Before writing a new script, ask the user if they already have one for the task — they may have existing tools for clipping, silence removal, or subtitle burning.
