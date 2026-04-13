"""
Export SRT subtitle files for each video and each individual chapter.
- Full video SRT: placed next to the edited MP4
- Per-chapter SRTs: placed in each chapter's subfolder, timestamps zeroed to chapter start
"""
import json, os

def fmt_srt_time(seconds):
    """Format seconds as SRT timestamp: HH:MM:SS,mmm"""
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = seconds % 60
    return f"{h:02d}:{m:02d}:{s:06.3f}".replace('.', ',')


def sentences_to_srt(sentences, offset=0.0):
    """Convert sentence list to SRT text, subtracting offset from all timestamps."""
    blocks = []
    for i, s in enumerate(sentences, 1):
        start = max(0.0, s['start'] - offset)
        end = max(0.0, s['end'] - offset)
        blocks.append(f"{i}\n{fmt_srt_time(start)} --> {fmt_srt_time(end)}\n{s['text']}\n")
    return '\n'.join(blocks)


def get_sentences_in_range(sentences, start_time, end_time):
    """Get all sentences that overlap with the given time range."""
    result = []
    for s in sentences:
        # Include sentence if it overlaps with the range
        if s['end'] > start_time and s['start'] < end_time:
            result.append(s)
    return result


JOBS = [
    {
        "name": "lior_course_01",
        "transcript": r"G:\Projects\Master Agent\ytp_jobs\lior_course_01\transcript.json",
        "chapters_json": r"G:\Projects\Master Agent\ytp_jobs\lior_course_01\chapters.json",
        "full_srt_path": r"G:\Projects\Kolbo.AI\Courses\Lior\Claude\1 - היכרות עם Kolbo.AI - edited.srt",
        "chapters_dir": r"G:\Projects\Kolbo.AI\Courses\Lior\Claude\1 - היכרות עם Kolbo.AI",
        "video_duration": 540.2,
    },
    {
        "name": "lior_course_02",
        "transcript": r"G:\Projects\Master Agent\ytp_jobs\lior_course_02\transcript.json",
        "chapters_json": r"G:\Projects\Master Agent\ytp_jobs\lior_course_02\chapters.json",
        "full_srt_path": r"G:\Projects\Kolbo.AI\Courses\Lior\Claude\2 - הסבר על פרוייקטים - edited.srt",
        "chapters_dir": r"G:\Projects\Kolbo.AI\Courses\Lior\Claude\2 - הסבר על פרוייקטים",
        "video_duration": 1643.0,
    },
    {
        "name": "lior_course_03",
        "transcript": r"G:\Projects\Master Agent\ytp_jobs\lior_course_03\transcript.json",
        "chapters_json": r"G:\Projects\Master Agent\ytp_jobs\lior_course_03\chapters.json",
        "full_srt_path": r"G:\Projects\Kolbo.AI\Courses\Lior\Claude\3 - כלי הצאט - edited.srt",
        "chapters_dir": r"G:\Projects\Kolbo.AI\Courses\Lior\Claude\3 - כלי הצאט",
        "video_duration": 2789.4,
    },
]

for job in JOBS:
    print(f"\n{'='*60}")
    print(f"SRT export: {job['name']}")
    print('='*60)

    with open(job['transcript'], encoding='utf-8') as f:
        transcript = json.load(f)
    sentences = transcript['sentences']

    with open(job['chapters_json'], encoding='utf-8') as f:
        chapters = json.load(f)

    # Compute end times
    for i, ch in enumerate(chapters):
        ch['end_time'] = chapters[i + 1]['start_time'] if i + 1 < len(chapters) else job['video_duration']

    # ── Full video SRT ────────────────────────────────────────────────────
    # Note: the burned video has 4s divider cards inserted before each chapter.
    # We need to offset all timestamps to account for the accumulated divider time.
    full_blocks = []
    block_num = 1
    accumulated_divider_time = 0.0
    DIVIDER_DURATION = 4.0

    for ch in chapters:
        ch_start = ch['start_time']
        ch_end = ch['end_time']
        ch_sentences = get_sentences_in_range(sentences, ch_start, ch_end)

        # Each chapter is preceded by a 4s divider
        accumulated_divider_time += DIVIDER_DURATION

        for s in ch_sentences:
            start = s['start'] + accumulated_divider_time
            end = s['end'] + accumulated_divider_time
            full_blocks.append(
                f"{block_num}\n{fmt_srt_time(start)} --> {fmt_srt_time(end)}\n{s['text']}\n"
            )
            block_num += 1

    with open(job['full_srt_path'], 'w', encoding='utf-8') as f:
        f.write('\n'.join(full_blocks))
    print(f"  Full SRT: {block_num - 1} blocks")

    # ── Per-chapter SRTs ──────────────────────────────────────────────────
    for ch in chapters:
        n = ch['chapter_number']
        title = ch['title']
        safe_title = title.replace('/', '-').replace('\\', '-').replace(':', '-').replace('"', '').replace('?', '').replace('*', '').replace('<', '').replace('>', '').replace('|', '')

        ch_start = ch['start_time']
        ch_end = ch['end_time']
        ch_sentences = get_sentences_in_range(sentences, ch_start, ch_end)

        # Offset = chapter start time (zero the timestamps to chapter-local time)
        # Add 4s for the divider card at the beginning of each chapter clip
        srt_text = sentences_to_srt(ch_sentences, offset=ch_start - DIVIDER_DURATION)

        srt_path = os.path.join(job['chapters_dir'], f"{n:02d} - {safe_title}.srt")
        with open(srt_path, 'w', encoding='utf-8') as f:
            f.write(srt_text)

        print(f"  Ch {n:02d}: {len(ch_sentences)} blocks")

print("\nAll SRTs exported!")
