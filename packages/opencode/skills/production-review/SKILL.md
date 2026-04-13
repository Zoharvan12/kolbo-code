---
name: production-review
description: >
  Self-review quality gates for video production: post-render verification protocol, pre-delivery
  checklist, audio verification, visual inspection, severity classification (critical/suggestion/nitpick),
  review workflow. Use after completing any production stage to verify quality before delivery.
  Keywords: review, quality, verification, checklist, render, audio check, video check, delivery,
  QA, quality gate, self-review, post-render
---

# Production Review — Quality Gates

## When to Use

After completing any major production stage — especially after rendering, before delivering to the user. Read this skill and run through the relevant checklist.

## Severity Levels

| Severity | Definition | Action |
|----------|-----------|--------|
| **CRITICAL** | Breaks the output, incomplete, or dangerously wrong | Must fix. Blocks delivery. |
| **SUGGESTION** | Improves quality significantly but doesn't block | Note it, fix if time allows |
| **NITPICK** | Nice-to-have polish | Log it, move on |

## Decision Flow

1. Run the relevant checklist below
2. Count critical findings
3. **0 critical** → PASS (note suggestions)
4. **1+ critical** → REVISE (max 2 revision rounds)
5. After 2 rounds, still critical → PASS_WITH_WARNINGS (inform user of known issues)

---

## Post-Render Verification (Video)

### Step 1: Probe the Output (GATE — blocks all other steps)
```bash
ffprobe -v quiet -print_format json -show_format -show_streams rendered_video.mp4
```

Verify ALL of:
- [ ] Video stream exists with correct resolution and FPS
- [ ] **Audio stream exists** — if missing, STOP. Fix audio config, re-render
- [ ] Duration within +/-5% of target
- [ ] File size is reasonable (not 0 bytes, not suspiciously small)

**If audio stream is missing, do NOT proceed.** Most common cause: audio sources mixed externally but never embedded in the composition.

### Step 2: Extract Review Frames
Sample frames at scene midpoints and visually inspect:
```bash
ffmpeg -i rendered_video.mp4 -vf "fps=1/5" frame_%04d.png
```
- [ ] No visual artifacts or glitches
- [ ] Text overlays readable and within safe zones
- [ ] Color grade consistent across scenes
- [ ] No black frames or flash frames at cuts

### Step 3: Audio Verification
- [ ] Play back and confirm narration is audible over music
- [ ] No audio pops or clicks at cut points
- [ ] Music volume appropriate (18-20 dB below dialogue)
- [ ] Audio loudness within platform target (-14 LUFS for social)

### Step 4: Present Review to User
Structured summary with: file stats, audio verification, visual findings, caption status.

---

## Pre-Delivery Checklist by Content Type

### Explainer Video
- [ ] Hook lands in first 3 seconds
- [ ] Core concept clearly explained (the "aha" moment)
- [ ] Captions present and synced
- [ ] Background music doesn't overpower narration
- [ ] Duration matches target (+/-10%)
- [ ] Output plays correctly on target platform

### Short-Form (TikTok/Reels/Shorts)
- [ ] 9:16 aspect ratio, 1080x1920
- [ ] Important content within safe zones (900x1400)
- [ ] Hook in first 1-2 seconds
- [ ] Captions mandatory (85% watch muted)
- [ ] File size under platform limit
- [ ] H.264 High Profile, 8+ Mbps

### Talking Head
- [ ] Filler words removed
- [ ] No awkward jump cuts (covered by B-roll or transition)
- [ ] Speaker's face never covered by overlays
- [ ] Audio clean — no background noise
- [ ] Eye-level framing maintained

### Music/Audio
- [ ] Correct duration
- [ ] Instrumental if for background use
- [ ] BPM matches content energy
- [ ] No clipping or distortion
- [ ] Loudness normalized to target

---

## Remotion-Specific Verification

Before declaring a Remotion render complete:

- [ ] Run `composition_validator` before rendering
- [ ] All `staticFile()` references resolve to existing assets
- [ ] Composition duration matches sum of scene durations minus transition overlaps
- [ ] No CSS animations used (must use `useCurrentFrame()` + `interpolate()`)
- [ ] No Tailwind `animate-*` classes (break frame-based rendering)
- [ ] `interpolate()` calls use `extrapolateLeft: 'clamp', extrapolateRight: 'clamp'`
- [ ] Audio layers in sync with visual scenes
- [ ] Theme colors match the active style
- [ ] Text scenes use Remotion components, NOT AI-generated images with text

## Review Log Format

When logging a review finding:
```
[SEVERITY] Finding description
  - What: specific issue observed
  - Where: timestamp or scene reference
  - Fix: recommended action
```

---

## Kolbo MCP Integration

Use these tools during review:

| Review Step | Kolbo MCP Tool | What to Check |
|-------------|---------------|---------------|
| Audio verification | `transcribe_audio` | Transcribe the rendered video — if 0 words, audio is silent |
| Visual analysis | `chat_send_message` + Gemini | "Review this video for quality issues" |
| Credit check | `check_credits` | Verify budget before re-renders |

**Post-render verification with Kolbo:**
1. `ffprobe` the output (always first — check streams exist)
2. `transcribe_audio` the rendered video → compare word count to script
3. If word count < 80% of script → audio is cut off → investigate
4. `chat_send_message` with Gemini + video URL → visual quality review
5. Present structured findings to user

**Re-generation workflow (if review finds critical issues):**
1. Identify the failed asset (video clip, audio, image)
2. Re-generate with adjusted prompt via the appropriate Kolbo MCP tool
3. Re-compose with FFmpeg or Remotion
4. Run review again (max 2 revision rounds)
