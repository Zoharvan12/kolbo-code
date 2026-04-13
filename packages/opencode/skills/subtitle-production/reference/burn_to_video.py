"""
Full burn pipeline:
  For each chapter:
    1. Render SectionDivider card (4s) + mux with SFX
    2. Cut raw footage segment
    3. Render ChapterProgress banner (ProRes alpha, exact chapter duration)
    4. Composite banner onto footage
  Concatenate everything → final burned MP4
"""
import json, os, sys, subprocess

_root = r"G:\Projects\Master Agent"
for _p in [os.path.join(_root, 'core'), os.path.join(_root, 'agents', 'content-creation')]:
    if _p not in sys.path:
        sys.path.insert(0, _p)

import config
sys.path.insert(0, os.path.join(_root, 'agents', 'content-creation', 'modules'))
from remotion_render import render as remotion_render, render_still

# ── Config ───────────────────────────────────────────────────────────────────
SOURCE_VIDEO   = r"C:\Users\Zohar\Downloads\מכללת ספיר H.264.mp4"
CHAPTERS_JSON  = r"G:\Projects\Master Agent\ytp_jobs\sapir_test\chapters.json"
SFX_FILE       = r"G:\Projects\Master Agent\ytp_jobs\sapir_test\sfx\v1_cinematic_eq.mp3"
WORK_DIR       = r"G:\Projects\Master Agent\ytp_jobs\sapir_test\burn"
FINAL_OUTPUT   = r"G:\Projects\Youtube Editings\renders\sapir_edited_final.mp4"
VIDEO_DURATION = 1041.1
FPS            = 30
FFMPEG         = "ffmpeg"
NVENC          = True   # -bf 0 -rc-lookahead 0 eliminates encoder delay

os.makedirs(WORK_DIR, exist_ok=True)

# ── Load chapters ─────────────────────────────────────────────────────────────
with open(CHAPTERS_JSON, encoding='utf-8') as f:
    chapters = json.load(f)

for i, ch in enumerate(chapters):
    ch['end_time'] = chapters[i + 1]['start_time'] if i + 1 < len(chapters) else VIDEO_DURATION
    ch['duration'] = ch['end_time'] - ch['start_time']

# ── Helpers ───────────────────────────────────────────────────────────────────
def _venc(cq=19):
    """Return video encoder args — NVENC (GPU, no delay) or libx264 fallback."""
    if NVENC:
        # -bf 0 -rc-lookahead 0: zero encoder delay → no A/V drift with -c:a copy
        return ["-c:v", "h264_nvenc", "-preset", "p4", "-cq", str(cq),
                "-bf", "0", "-rc-lookahead", "0"]
    return ["-c:v", "libx264", "-preset", "fast", "-crf", str(cq)]


def run(cmd, desc=""):
    print(f"[ffmpeg] {desc}", flush=True)
    r = subprocess.run(cmd, capture_output=True)
    if r.returncode != 0:
        raise RuntimeError(f"FAILED {desc}:\n{r.stderr.decode('utf-8','replace')[-600:]}")


def cut_footage(start, end, output):
    if os.path.exists(output):
        print(f"[skip] {os.path.basename(output)} exists")
        return
    duration = end - start
    # Dual-seek: fast input seek to 5s before target, then frame-accurate output seek
    # This gives exact A/V sync without decoding the full file from the beginning.
    pre = min(5.0, start)
    run([FFMPEG, "-y",
         "-ss", str(start - pre), "-i", SOURCE_VIDEO,
         "-ss", str(pre), "-t", str(duration),
         *_venc(),
         "-c:a", "copy",
         "-movflags", "+faststart", output],
        f"cut footage {start:.1f}s + {duration:.1f}s")


def mux_sfx(video, sfx, output, video_duration=4.0):
    if os.path.exists(output):
        print(f"[skip] {os.path.basename(output)} exists")
        return
    # Resample SFX to 48kHz to match source video, pad, then mux
    run([FFMPEG, "-y",
         "-i", video, "-i", sfx,
         "-filter_complex", f"[1:a]aresample=48000,apad=pad_dur={video_duration}[a]",
         "-map", "0:v", "-map", "[a]",
         *_venc(cq=12), "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
         "-t", str(video_duration), output],
        f"mux SFX into {os.path.basename(video)}")


def composite_with_banner(footage, banner_png, output, duration_sec, is_hebrew=True):
    """Composite static banner PNG + animated progress bar.
    Uses crop+geq+overlay on just the bottom 4 rows — fast (5760 px/frame not 2M).
    geq uses capital T for timestamp, avoiding conflict with drawbox's t=fill.
    """
    if os.path.exists(output):
        print(f"[skip] {os.path.basename(output)} exists")
        return
    d = float(duration_sec)
    # geq on a 4px strip: T=timestamp(secs), W=strip width, X=pixel x-coord
    # Hebrew RTL: fill right side first → X > W*(1 - T/D)
    # LTR:        fill left side first  → X < W*T/D
    if is_hebrew:
        bar_cond = f"gt(X,W*(1-T/{d}))"
    else:
        bar_cond = f"lt(X,W*T/{d})"

    bar_geq = (
        f"geq="
        f"r='if({bar_cond},59,r(X,Y))':"
        f"g='if({bar_cond},130,g(X,Y))':"
        f"b='if({bar_cond},246,b(X,Y))'"
    )

    # overlay=0:0 composites banner PNG onto footage
    # split → crop bottom 4px → geq colors the bar → overlay back at bottom
    fc = (
        f"[0:v][1:v]overlay=0:0:format=auto,format=yuv420p[base];"
        f"[base]split[main][bot_src];"
        f"[bot_src]crop=iw:4:0:ih-4[strip];"
        f"[strip]{bar_geq}[bar];"
        f"[main][bar]overlay=0:H-4[v]"
    )

    run([FFMPEG, "-y",
         "-i", footage,
         "-i", banner_png,
         "-filter_complex", fc,
         "-map", "[v]", "-map", "0:a",
         *_venc(),
         "-c:a", "copy",
         "-movflags", "+faststart", output],
        f"composite+bar {os.path.basename(output)}")


# ── Main loop ─────────────────────────────────────────────────────────────────
parts = []
total = len(chapters)

for ch in chapters:
    n   = ch['chapter_number']
    dur = ch['duration']
    dur_frames = int(round(dur * FPS))

    print(f"\n{'='*60}")
    title_safe = ch['title'].encode('ascii','replace').decode('ascii')
    print(f"Chapter {n}/{total}: {title_safe}  ({dur:.1f}s = {dur_frames} frames)")
    print('='*60)

    # ── 1. SectionDivider render ──────────────────────────────────────────
    divider_raw  = os.path.join(WORK_DIR, f"ch{n:02d}_divider_raw.mp4")
    divider_sfx  = os.path.join(WORK_DIR, f"ch{n:02d}_divider.mp4")

    if not os.path.exists(divider_raw):
        print(f"[render] SectionDivider ch{n}...")
        remotion_render(
            composition_id="SectionDivider-16x9",
            props={
                "chapterNumber": n,
                "title": ch['title'],
                "subtitle": ch.get('subtitle', ''),
                "language": "he",
                "durationInFrames": 120,
                "fps": FPS,
            },
            output_path=divider_raw,
            job_dir=WORK_DIR,
            alpha=False,
            concurrency=16,
        )
    else:
        print(f"[skip] divider ch{n} exists")

    mux_sfx(divider_raw, SFX_FILE, divider_sfx, video_duration=4.0)
    parts.append(divider_sfx)

    # ── 2. Cut raw footage ────────────────────────────────────────────────
    raw_clip = os.path.join(WORK_DIR, f"ch{n:02d}_raw.mp4")
    cut_footage(ch['start_time'], ch['end_time'], raw_clip)

    # ── 3. ChapterBanner still PNG render (single frame, fast) ───────────
    banner_png = os.path.join(WORK_DIR, f"ch{n:02d}_banner.png")

    if not os.path.exists(banner_png):
        print(f"[still] ChapterBanner ch{n}...")
        render_still(
            composition_id="ChapterBanner-16x9",
            props={
                "chapterNumber": n,
                "title": ch['title'],
                "language": "he",
            },
            output_path=banner_png,
            job_dir=WORK_DIR,
        )
    else:
        print(f"[skip] banner ch{n} exists")

    # ── 4. Composite banner + progress bar onto footage ───────────────────
    composited = os.path.join(WORK_DIR, f"ch{n:02d}_composited.mp4")
    composite_with_banner(raw_clip, banner_png, composited, dur, is_hebrew=True)
    parts.append(composited)

# ── Concatenate all parts ─────────────────────────────────────────────────────
print(f"\n{'='*60}")
print(f"Concatenating {len(parts)} clips...")

concat_list = os.path.join(WORK_DIR, "concat.txt")
with open(concat_list, 'w', encoding='utf-8') as f:
    for p in parts:
        f.write(f"file '{p}'\n")

run([FFMPEG, "-y",
     "-f", "concat", "-safe", "0",
     "-i", concat_list,
     *_venc(),
     "-c:a", "copy",
     "-movflags", "+faststart", FINAL_OUTPUT],
    f"final concat -> {FINAL_OUTPUT}")

size_mb = os.path.getsize(FINAL_OUTPUT) / 1024 / 1024
print(f"\nDone! Final output: {FINAL_OUTPUT}")
print(f"Size: {size_mb:.0f} MB")
