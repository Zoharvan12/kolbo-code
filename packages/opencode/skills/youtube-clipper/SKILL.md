---
name: youtube-clipper
description: >
  YouTube video smart clipping tool. Downloads video and subtitles, uses AI to analyze
  and generate fine-grained chapters (2-5 minute segments), lets user select clips,
  then auto-clips, translates subtitles to bilingual format, burns subtitles, and generates
  summary copy. Use when: clipping YouTube videos, generating short clips, making bilingual
  subtitle versions, creating Shorts/Reels/TikTok from long-form video.
  Keywords: video clip, YouTube, subtitle translation, bilingual subtitles, video download,
  shorts, reels, tiktok, yt-dlp, ffmpeg, clip video
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
  - AskUserQuestion
---

# YouTube Video Smart Clipper

## Workflow — 6 Phases

### Phase 1: Environment Check

Verify required tools are installed:

```bash
yt-dlp --version
ffmpeg -version
ffmpeg -filters 2>&1 | grep subtitles   # verify libass for subtitle burn
python3 -c "import pysrt; print('ok')"
```

**If missing**:
- yt-dlp: `brew install yt-dlp` or `pip install yt-dlp`
- FFmpeg without libass (macOS): `brew install ffmpeg-full`
- Python deps: `pip install pysrt`

> **Note**: Standard Homebrew FFmpeg lacks libass. On macOS install `ffmpeg-full`. On Windows, gyan.dev FFmpeg builds include libass.

---

### Phase 2: Download Video

Ask user for YouTube URL, then download video + English subtitles:

```bash
yt-dlp -f "bestvideo[height<=1080][ext=mp4]+bestaudio/best" \
  --write-auto-sub --sub-lang en --convert-subs srt \
  -o "%(id)s.%(ext)s" <youtube_url>
```

Show user: title, duration, file size, download path.

**Output**: `<id>.mp4` + `<id>.en.srt`

**If 429 rate limit on subtitles**: download video first (`--no-write-subs`), then retry subtitle download separately after a delay.

---

### Phase 3: AI Chapter Analysis

Parse the subtitle file and analyze content semantically:

1. Read full subtitle text with timestamps
2. Identify natural topic transitions
3. Generate chapters at **2-5 minute granularity** (not coarse 30-minute cuts)

For each chapter provide:
- **Title**: concise topic summary (10-20 words)
- **Time range**: start → end (MM:SS or HH:MM:SS)
- **Summary**: 1-2 sentences on what this segment covers
- **Keywords**: 3-5 key concepts

Show numbered chapter list with all segments covered, no gaps.

---

### Phase 4: User Selection

Ask user which chapters to clip (multi-select by number).

Also ask:
- Generate bilingual subtitles? (original + translated)
- Burn subtitles into video? (hardcoded)
- Generate summary copy for social media?

---

### Phase 5: Process Selected Clips

For each selected chapter:

#### 5.1 — Cut clip
```bash
ffmpeg -i input.mp4 -ss <start> -to <end> -c copy clip.mp4
```

#### 5.2 — Extract subtitle segment
Filter subtitle entries within the time range, reset timestamps to start from 00:00:00.

#### 5.3 — Translate subtitles (if requested)
Batch translate in groups of 20 entries to minimize API calls. Target language: user's preferred language. Keep technical terms accurate; use natural spoken language suitable for short video.

#### 5.4 — Generate bilingual SRT (if requested)
Merge original + translated lines into dual-language SRT (original on top, translation below).

#### 5.5 — Burn subtitles (if requested)
```bash
ffmpeg -i clip.mp4 -vf "subtitles=subs.srt:force_style='FontSize=24,MarginV=30,Bold=1'" \
  -c:v libx264 -crf 18 -c:a copy output_with_subs.mp4
```

> **Windows path fix**: copy files to `tempfile.mkdtemp()` before running FFmpeg to avoid subtitle filter failures on paths with spaces.

#### 5.6 — Generate summary copy (if requested)
Based on chapter title, summary, and keywords — generate social media copy (title, key points, platform-appropriate format).

---

### Phase 6: Output Results

Organize output under `./youtube-clips/<datetime>/`:
```
<chapter-title>/
├── clip.mp4                  # raw cut
├── clip_with_subtitles.mp4   # burned subtitle version
├── bilingual.srt             # bilingual subtitle file
└── summary.md                # social media copy
```

Show file list with sizes and quick-open commands. Ask if user wants to clip more chapters.

---

## 9:16 Vertical (Shorts / Reels / TikTok)

When user requests vertical format — use blurred background fill, never crop:

```
[0:v]split[bg][fg];
[bg]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,gblur=sigma=40[blurred];
[fg]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black@0[front];
[blurred][front]overlay=0:0,subtitles=subs.srt:force_style='FontSize=28,MarginV=120,Bold=1'
```

**Rules**:
- Never crop original content — presenter/slides must be fully visible
- Place subtitles in the lower blurred area (MarginV=120)
- Black letterbox padding is not acceptable — blurred background only

---

## RTL Subtitles (Hebrew / Arabic)

Basic burn with SRT works for simple subtitles. For per-word karaoke highlight with RTL:

- Each word needs its own ASS `Dialogue` line with `\pos(x,y)` — no inline tags within a text run
- Use PIL to measure word widths with `~0.74` scale factor (PIL→libass calibration)
- Use `Alignment=7` and `Encoding=177` (Hebrew) in ASS style
- Render punctuation as separate positioned elements to the left of the last word
- Use two named ASS styles (e.g., White + Yellow) instead of inline `\c` color tags

**Critical**: Inline ASS tags (`\c`, `\K`, etc.) between RTL words break Unicode bidi in libass — causing words to render left-to-right. Always use separate Dialogue lines per word.

---

## Shorts Mode (~40s clips)

When user wants highlights rather than full chapters, identify:

1. **Strong hook** — opening line that grabs attention immediately
2. **Pain point** — relatable problem statement
3. **WOW moment** — impressive demo or revelation
4. **Core value prop** — clear, concise statement of the main idea
5. **Counter-intuitive insight** — breaks common assumptions

For each candidate clip provide: timestamps, content summary, why it works as a short, suggested title.

---

## Key Technical Notes

- **Batch translation** (20 entries/call) saves ~95% API calls vs per-entry
- **Chapter granularity**: semantic topic transitions, not mechanical time splits
- **File naming**: strip special chars (`/ \ : * ? " < > |`), replace spaces with `_`, max 100 chars
- **Windows encoding**: set `PYTHONIOENCODING=utf-8` when running Python scripts that print Unicode
