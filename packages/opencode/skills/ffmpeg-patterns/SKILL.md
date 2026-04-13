---
name: ffmpeg-patterns
description: >
  Advanced FFmpeg patterns for video production: encoding presets, lossless vs re-encode decisions,
  subtitle burn-in (SRT/ASS), audio mixing and ducking, face enhancement, silence removal,
  concatenation, format conversion, platform-specific encoding. Use for any FFmpeg operation
  beyond basic trim/cut.
  Keywords: ffmpeg, encoding, h264, crf, subtitle, burn-in, ASS, SRT, concat, audio mix,
  silence removal, face enhance, format, codec, bitrate, filter
---

# FFmpeg Patterns for Video Production

## Encoding Presets

### Standard Quality (web delivery)
```bash
ffmpeg -i input.mp4 -c:v libx264 -crf 18 -preset medium -c:a aac -b:a 128k output.mp4
```

### High Quality (master/archive)
```bash
ffmpeg -i input.mp4 -c:v libx264 -crf 15 -preset slow -c:a aac -b:a 256k output.mp4
```

### Fast Preview
```bash
ffmpeg -i input.mp4 -c:v libx264 -crf 28 -preset ultrafast -c:a aac -b:a 96k preview.mp4
```

## Lossless vs Re-encode

- Use `-c copy` when you only need to cut or concat without altering frames (instant, lossless)
- Re-encode (`-c:v libx264`) when applying filters (speed, subtitles, overlays, scaling)
- Default CRF 23. Use 18-20 for higher quality final deliverables

## Subtitle Burn-in

### SRT (Simple)
```bash
ffmpeg -i input.mp4 -vf "subtitles=subs.srt:force_style='FontSize=22,Bold=1,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,Outline=2'" output.mp4
```

### ASS Color Format
Always use full 8-char `&HAABBGGRR` format: `&H00FFFFFF` (white, alpha=00)
- `&HFFFFFF` breaks positioning — always include the alpha byte

### Vertical Video Subtitles
```
font_size: 18, max 3 words/cue, margin_v: 50
```

### Horizontal Video Subtitles
```
font_size: 22, max 6 words/cue, margin_v: 40
```

### Windows Path Escaping
Escape colons in paths: `C\:/path/to/subs.srt` not `C:/path/to/subs.srt`

## Audio Operations

### Mix Narration + Music (with ducking)
```bash
ffmpeg -i narration.wav -i music.wav -filter_complex \
  "[1:a]volume=0.15[music]; \
   [0:a][music]amix=inputs=2:duration=longest" \
  -c:a aac output.m4a
```

### Loudness Normalization
```bash
ffmpeg -i input.mp4 -af loudnorm=I=-14:LRA=11:TP=-1 -c:v copy output.mp4
```

### Extract Audio
```bash
ffmpeg -i video.mp4 -vn -c:a copy audio.m4a
```

### Replace Audio
```bash
ffmpeg -i video.mp4 -i new_audio.wav -map 0:v -map 1:a -c:v copy -c:a aac output.mp4
```

## Silence Removal

### Detect Silence
```bash
ffmpeg -i input.mp4 -af "silencedetect=noise=-35dB:d=0.4" -f null - 2>&1 | grep silence
```

### Remove Silence (trim + concat)
1. Parse `silence_start` / `silence_end` from stderr
2. Generate segments between silences
3. Concatenate with the concat demuxer
4. Optional: `atempo=1.14` for slight speedup

## Concatenation

### Same Codec (lossless)
```bash
# Create filelist.txt:
# file 'clip1.mp4'
# file 'clip2.mp4'
ffmpeg -f concat -safe 0 -i filelist.txt -c copy output.mp4
```

### Mixed Codecs (re-encode)
Re-encode all segments to matching codec/resolution first, then concat.

## Speed Adjustment

### Speed Up 2x
```bash
ffmpeg -i input.mp4 -filter:v "setpts=0.5*PTS" -filter:a "atempo=2.0" output.mp4
```

### Slow Motion 0.5x
```bash
ffmpeg -i input.mp4 -filter:v "setpts=2.0*PTS" -filter:a "atempo=0.5" output.mp4
```

## Face Enhancement Presets

### Skin Smoothing
```bash
ffmpeg -i input.mp4 -vf "smartblur=lr=1.0:ls=-1.0:lt=-3.0:cr=0.5:cs=-1.0:ct=-3.0" output.mp4
```

### Sharpening
```bash
ffmpeg -i input.mp4 -vf "unsharp=5:5:1.0:5:5:0.0" output.mp4
```

## Format Conversion

### To GIF (high quality)
```bash
ffmpeg -i input.mp4 -vf "fps=15,scale=480:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse" output.gif
```

### To WebM
```bash
ffmpeg -i input.mp4 -c:v libvpx-vp9 -crf 30 -b:v 0 -c:a libopus output.webm
```

### Extract Frames
```bash
# Every 5 seconds
ffmpeg -i input.mp4 -vf "fps=1/5" frame_%04d.png

# Specific timestamp
ffmpeg -i input.mp4 -ss 00:01:30 -vframes 1 thumbnail.png
```

## Probing (Analysis)

### Full Media Info
```bash
ffprobe -v quiet -print_format json -show_format -show_streams input.mp4
```

### Duration Only
```bash
ffprobe -v quiet -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 input.mp4
```

### Audio Loudness
```bash
ffmpeg -i input.mp4 -af loudnorm=print_format=json -f null - 2>&1
```

## Platform-Specific Encoding

| Platform | Resolution | Codec | Bitrate |
|----------|-----------|-------|---------|
| YouTube | 1920x1080 | H.264 High | 8-12 Mbps |
| TikTok | 1080x1920 | H.264 High | 8-15 Mbps |
| Instagram | 1080x1920 | H.264 High | 8-15 Mbps |
| Twitter/X | 1280x720 | H.264 Main | 5-8 Mbps |

## Windows-Specific Notes

- Always copy inputs to a temp directory first if paths contain spaces
- Use forward slashes in filter strings even on Windows
- Escape colons in drive letters within subtitle filter paths

---

## Kolbo MCP Integration

FFmpeg is the **post-production backbone** that processes Kolbo-generated assets:

| Kolbo MCP Output | FFmpeg Post-Processing |
|-----------------|----------------------|
| `generate_video` → raw video | Trim, grade, add subtitles, normalize audio |
| `generate_speech` → narration | Mix with music, normalize loudness |
| `generate_music` → background | Duck under narration, fade in/out |
| `generate_sound` → SFX | Place at precise timestamps, adjust levels |
| `transcribe_audio` → SRT | Burn-in subtitles with force_style |
| `generate_image` → frames | Assemble into slideshow/montage |

**Typical production chain:**
```
Kolbo generates raw assets
  → FFmpeg trims/cuts
  → FFmpeg mixes audio (narration + music + SFX)
  → FFmpeg burns in subtitles
  → FFmpeg applies color grade
  → FFmpeg encodes for target platform
```

---

## Installing FFmpeg

**Windows:**
```bash
# Scoop
scoop install ffmpeg

# Chocolatey
choco install ffmpeg

# Or download from https://ffmpeg.org/download.html
```

**macOS:**
```bash
brew install ffmpeg
```

**Linux:**
```bash
sudo apt install ffmpeg   # Ubuntu/Debian
sudo dnf install ffmpeg   # Fedora
```

Verify: `ffmpeg -version`
