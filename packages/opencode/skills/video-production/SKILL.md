---
name: video-production
description: >
  Full-stack video production assistant. Analyzes talking head footage,
  generates transcriptions/SRT subtitles, plans and creates motion graphics (Remotion),
  generates B-roll images/videos, produces timeline XMLs for Premiere/DaVinci.
  Use for: video analysis, transcription, subtitles, motion graphics, B-roll, shorts,
  timeline XML, clip cutting, silence removal, After Effects, Premiere Pro, DaVinci Resolve.
  Keywords: video edit, ffmpeg, remotion, after effects, premiere, davinci, shorts, subtitles,
  motion graphics, clip, render, transcribe, xml, timeline, b-roll, talking head, analyze
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

## Pipeline

```
Input video → Transcribe → Analyze → Plan segments
  → Generate: Remotion compositions | B-roll | SRT subtitles
  → Output: Premiere XML / DaVinci EDL / individual MP4s / SRT
```

## APIs & Capabilities

| Service | Use |
|---------|-----|
| ElevenLabs Scribe | Primary transcription — word-level SRT, multilingual |
| Claude | Content analysis, edit planning |
| Google Gemini | Video understanding, visual analysis |
| fal.ai (MCP) | Image & video B-roll generation |
| Runway | Image-to-video, video-to-video |
| FLUX / BFL | High quality still image generation |
| ElevenLabs | TTS, voice cloning, SFX |
| Suno | Background music generation |
| Remotion Lambda | Cloud render motion graphics |

> Load API keys from the project's `.env` file or environment variables.

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

SRT with `subtitles` filter works for basic burn. For per-word karaoke highlighting with RTL:

- Each word gets its own ASS `Dialogue` line with explicit `\pos(x,y)`
- Use PIL to measure word widths: apply `~0.74` scale factor (PIL→libass calibration)
- Use `Alignment=7` (top-left anchor) so `\pos` sets exact top-left of each word
- Set `Encoding=177` (Hebrew) in ASS style
- Strip punctuation and render as separate positioned elements
- Two ASS styles (e.g., White + Yellow) instead of inline `\c` color tags

**CRITICAL**: Any inline ASS tag (`\c`, `\K`, `\1c`, etc.) between RTL words breaks Unicode bidirectional algorithm in libass — words render LTR. Use separate Dialogue lines instead.

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
