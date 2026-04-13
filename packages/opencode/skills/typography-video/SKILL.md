---
name: typography-video
description: >
  Typography rules for video production: font selection and pairing, minimum readable sizes,
  safe zones per platform, text animation timing, contrast requirements, subtitle styling.
  Use when adding text overlays, titles, lower thirds, or captions to video.
  Keywords: typography, font, text, title, lower third, caption, subtitle, safe zone, text size,
  font pairing, readable, overlay, motion graphics
---

# Typography for Video Production

## Quick Reference

```
TITLE SIZE:       60-90px at 1080p  |  120-180px at 4K
BODY SIZE:        40-60px at 1080p  |  80-120px at 4K
SUBTITLE SIZE:    42px+ at 1080p    |  3-5% of video height
MAX CHARS/LINE:   32-42 (subtitles) |  30 (overlays)
MAX LINES:        2 (subtitles)     |  3 (overlays)
READING SPEED:    21 chars/sec      |  160-200 WPM
TITLE SAFE:       80% of frame (192px margin at 1080p)
FONT FAMILIES:    1-2 per video maximum
CONTRAST:         4.5:1 minimum, 7:1 optimal
FADE DURATION:    0.3s opacity  |  0.5-1.0s slide/scale
```

## Font Selection

### Recommended Video Fonts

| Category | Fonts | Use For |
|----------|-------|---------|
| **Body / Captions** | Inter, Open Sans, Roboto, Source Sans Pro, Lato, DM Sans | All body text, subtitles |
| **Headlines** | Montserrat Bold, Bebas Neue, Oswald Bold, Poppins Bold | Titles, section headers, key stats |
| **Editorial** | Playfair Display, Roboto Slab | Luxury, cinematic, documentary |
| **System Safe** | Helvetica Neue, Arial, Avenir Next | When custom fonts unavailable |

### Font Pairing Rules

- Limit to **1-2 font families** per video
- Pair a **display/bold heading** font with a **neutral body** font
- Size difference between title and body: at least **50% larger**
- **Sans-serif** for motion graphics and captions (holds up in motion)
- **Serif** only for cinematic title cards and editorial content
- **Script/decorative** fonts: hero titles only, never body, never in motion

### Proven Pairings

| Heading | Body | Style |
|---------|------|-------|
| Bebas Neue | Open Sans | High-impact, social ads |
| Montserrat Bold | Lato | Clean modern |
| Oswald Bold | Raleway | Strong contrast |
| Playfair Display | Inter | Editorial |
| Poppins Bold | Poppins Light | Single-family hierarchy |

## Text Sizing

| Element | 1080p (px) | 4K (px) |
|---------|-----------|---------|
| Title / Hero text | 60-90 | 120-180 |
| Body text | 40-60 | 80-120 |
| Subtitles | 42+ | 84+ |
| Lower third name | 48-60 | 96-120 |
| Lower third role | 36-44 | 72-88 |

## Safe Zones

### Broadcast Standard (1920x1080)

| Zone | Coverage | Margin |
|------|----------|--------|
| **Title Safe** | 80% of frame | 192px H, 108px V |
| **Action Safe** | 90% of frame | 96px H, 54px V |

At 1920x1080: Title Safe = inner 1536x864px

### Vertical (1080x1920) Platform-Specific

See the `short-form-video` skill for per-platform safe zones. Universal safe: 900x1400px centered.

## Reading Speed

- Average viewer reads **21 characters per second** / **160-200 WPM**
- Minimum display time: **0.5 seconds per text element**
- Maximum display time: **5 seconds** before it feels stale
- Formula: `display_seconds = character_count / 21 + 0.5`

## Contrast Requirements (WCAG)

| Element | Minimum Ratio |
|---------|--------------|
| Body text on background | 4.5:1 (AA) |
| Large text (>18pt) | 3:1 (AA) |
| Enhanced readability | 7:1 (AAA) |

**Practical rule:** After color grading, any text overlays must still meet 4.5:1 contrast against the graded background.

## Text Animation Timing

| Animation | Duration | Easing |
|-----------|----------|--------|
| Fade in/out | 0.3s | ease-in-out |
| Slide in | 0.5-0.8s | ease-out (cubic) |
| Scale up | 0.4-0.6s | ease-out with slight overshoot |
| Typewriter | 30-50ms per character | linear |
| Word-by-word | 80-120ms per word | step or ease |

### Animation Rules
- Text should be **fully readable for at least 1.5 seconds** after animation completes
- Entry animation + readable duration + exit animation = total display time
- **Never animate body text character-by-character** — only titles and keywords
- **Ease out, not ease in** — text should arrive quickly and settle, not start slow

## RTL (Hebrew/Arabic) Text — Proven Patterns

These patterns are battle-tested in Kolbo's video production pipeline.

**Reference implementation:** `./reference/KineticTitleScene.tsx` (346 lines, full RTL) — read this for a complete working example of every RTL flip listed below.

### Font Selection
- **Hebrew**: Heebo (Google Fonts, free) — use Bold weight for captions
- **Arabic**: Cairo (Google Fonts, free) — use Bold weight for captions
- **Never** use Poppins or English-first fonts for Hebrew/Arabic body text

### Remotion RTL Rules (proven)

Every component receiving text must handle RTL:

```tsx
const isHebrew = language === "he" || language === "iw";

<div style={{
  direction: isHebrew ? "rtl" : "ltr",
  fontFamily: isHebrew ? "'Heebo', sans-serif" : "'Poppins', sans-serif",
  textTransform: isHebrew ? "none" : "uppercase",  // No uppercase in Hebrew
  letterSpacing: isHebrew ? 0 : -2,                 // No negative kerning for Hebrew
}}>
```

**What you must flip for RTL:**
| Property | LTR (English) | RTL (Hebrew) |
|----------|--------------|--------------|
| `direction` | `ltr` | `rtl` |
| `paddingLeft` / `paddingRight` | normal | swapped |
| `transformOrigin` | `"top left"` | `"top right"` |
| Gradient direction | `90deg` | `270deg` |
| Position "left" | left side | **right side** (flip the logic) |
| `textTransform` | `uppercase` | `none` |
| `letterSpacing` | `-2` or custom | `0` (always) |
| Slide-in direction | from left | from right |

### FFmpeg RTL Burn-in

```bash
# Hebrew subtitles with Heebo font
ffmpeg -i input.mp4 -vf "subtitles=subs.srt:force_style='FontName=Heebo,FontSize=22,Bold=1,Encoding=177,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,Outline=2'" output.mp4
```

See `subtitle-production` skill for full RTL karaoke and per-word positioning patterns.

---

## Kolbo MCP Integration

Typography rules apply to all Kolbo visual generation:

| Task | Kolbo MCP Tool | Typography Rule |
|------|---------------|----------------|
| Title cards | `generate_image` | Add text as Remotion overlay, NOT in AI image prompt |
| Caption generation | `transcribe_audio` | Word-level SRT → burn-in with FFmpeg |
| Lower thirds | Remotion component | Use proven font pairings above |
| Video with text overlay | `generate_video` + FFmpeg post | Render video first, add text in post |

**Key rule:** Never ask image/video generation models to render text — they can't do it reliably. Always add text as overlays in post-production (Remotion, FFmpeg, or video editor).

**Free fonts for video (Google Fonts, all free):**
- Body: Inter, Open Sans, Roboto, Lato, DM Sans
- Headlines: Montserrat, Bebas Neue, Oswald, Poppins
- Hebrew: Heebo, Assistant, Rubik
- Arabic: Cairo, Noto Sans Arabic
