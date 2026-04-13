---
name: color-grading
description: >
  Color grading for video with FFmpeg: filter chains, profile selection by content type,
  LUT workflow, skin tone protection, mood-specific recipes, colorblind-safe palette,
  WCAG contrast requirements. Use when applying color grades, creating visual looks, or
  correcting color in video.
  Keywords: color grading, color correction, LUT, FFmpeg, filter, cinematic, warm, cool,
  skin tone, colorbalance, curves, eq, color temperature, film look
---

# Color Grading for Video Production

## Quick Reference

```
PROFILES:       cinematic_warm | cinematic_cool | moody_dark | bright_clean | vintage_film | high_contrast | neutral
LUT FORMAT:     .cube (3D LUT) — industry standard
INTENSITY:      0.6-0.85 for subtle grades, 1.0 for full effect
SKIN TONE:      Vectorscope should fall on "skin tone line" (~123 degrees)
BIT DEPTH:      Grade in 10-bit when possible, deliver in 8-bit for web
```

## FFmpeg Filter Chain Order

Apply filters in this order for predictable results:

```
1. normalize          (auto-levels if source is flat/log)
2. colortemperature   (white balance correction)
3. colorbalance       (shadow/mid/highlight color shifts)
4. curves             (contrast and tone shaping)
5. eq                 (final contrast/saturation/brightness tweak)
6. lut3d              (creative LUT — applied LAST, on corrected footage)
```

## FFmpeg Filter Reference

| Filter | Purpose | Key Parameters |
|--------|---------|----------------|
| `eq` | Brightness, contrast, saturation, gamma | `contrast=1.0:saturation=1.0:brightness=0.0:gamma=1.0` |
| `colorbalance` | RGB in shadows/mids/highlights | `rs/gs/bs` (shadows), `rm/gm/bm` (mids), `rh/gh/bh` (highlights) — range -1.0 to 1.0 |
| `curves` | Tone curves per channel | `all='0/0 0.5/0.5 1/1'` or per-channel `red=`, `green=`, `blue=` |
| `colortemperature` | White balance shift | `temperature=6500` (neutral) — lower=cooler, higher=warmer |
| `lut3d` | Apply .cube LUT | `lut3d='path/to/file.cube'` |
| `hue` | Hue rotation and saturation | `h=0:s=1` |

## Profile Selection by Content Type

| Content Type | Profile | Intensity | Why |
|-------------|---------|-----------|-----|
| Corporate / SaaS explainer | `bright_clean` | 0.8 | Clean, professional |
| Science / educational | `neutral` | 1.0 | Accurate color matters |
| Storytelling / narrative | `cinematic_warm` | 0.85 | Warmth builds connection |
| Tech / dark theme | `cinematic_cool` | 0.7 | Complements dark UI |
| Drama / serious | `moody_dark` | 0.6-0.7 | Atmosphere without crushing detail |
| Lifestyle / social | `high_contrast` | 0.8 | Punchy, attention-grabbing |
| Retro / nostalgic | `vintage_film` | 0.7 | Subtle faded look |

## Mood-Specific FFmpeg Recipes

### Warm / Inviting
```
colorbalance=rs=0.06:gs=0.02:bs=-0.04:rh=0.05:gh=0.01:bh=-0.03,
eq=contrast=1.05:saturation=1.08:brightness=0.01
```

### Cool / Technical
```
colorbalance=rs=-0.03:gs=-0.01:bs=0.06:rh=-0.02:gh=0.01:bh=0.04,
eq=contrast=1.06:saturation=0.95
```

### High Energy
```
curves=all='0/0 0.15/0.08 0.5/0.52 0.85/0.92 1/1',
eq=contrast=1.15:saturation=1.2
```

### Subdued / Serious
```
curves=all='0/0.04 0.25/0.22 0.5/0.47 0.75/0.73 1/0.94',
eq=contrast=1.03:saturation=0.75:brightness=-0.02
```

## LUT Workflow

1. **Always correct before grading** — normalize/white-balance first, then creative LUT
2. **Use intensity < 1.0** — full strength usually looks overdone; 0.6-0.8 is typical
3. **Test on skin tones first** — if people appear, skin must look natural
4. **One LUT per project** — switching LUTs creates visual inconsistency

### FFmpeg LUT at partial intensity
```bash
ffmpeg -i input.mp4 -vf \
  "split[a][b];[b]lut3d='my_lut.cube'[graded];[a][graded]blend=all_mode=normal:all_opacity=0.7" \
  output.mp4
```

## Skin Tone Protection

- On a vectorscope, healthy skin (all ethnicities) falls on a narrow line at ~123 degrees
- Never push saturation above 1.2 on footage with people
- If skin looks orange, green, or magenta after grading — pull back
- `cinematic_warm` at intensity 0.85 is pre-tuned for natural skin
- For `moody_dark`, keep intensity at 0.6-0.7 to avoid grey skin

## Enhancement Chain Order

Apply in this sequence to avoid filter interactions:

1. **Subtitles first** — burn into base video
2. **Face enhance** — smoothing/sharpening on ungraded footage
3. **Color grade** — applies look after face is enhanced
4. **Audio enhance** — independent of video, apply last

## Colorblind-Safe Palette (Wong)

For overlays, graphics, and diagrams:

| Color | Hex | Use For |
|-------|-----|---------|
| Orange | `#E69F00` | Primary accent |
| Sky Blue | `#56B4E9` | Secondary accent |
| Bluish Green | `#009E73` | Positive/success |
| Yellow | `#F0E442` | Highlight/warning |
| Blue | `#0072B2` | Links, info |
| Vermillion | `#D55E00` | Error/danger |
| Reddish Purple | `#CC79A7` | Tertiary accent |

---

## Kolbo MCP Integration

Color grading is a **post-production step** applied after Kolbo generates the raw video/images:

1. `generate_video` or `generate_video_from_image` → raw footage
2. Download the result
3. Apply color grade with FFmpeg using recipes above
4. Optionally: `upload_media` the graded result back to Kolbo CDN

**For Remotion compositions:** Apply color grade as the last visual filter, or set the theme/palette in the composition props.

**For AI-generated images:** Use lighter grades (intensity 0.5-0.6) since AI images are already stylized. Use `generate_image_edit` for major color changes instead of FFmpeg.

---

## Local / Free Options

> **IMPORTANT:** Always use Kolbo MCP + FFmpeg by default. FFmpeg is safe to use directly — it's standard software. Do not install additional tools without confirming with the user first.

**FFmpeg (safe, standard):** All color grading recipes in this skill use FFmpeg — no additional installs needed. This is the only local tool needed for color grading.
