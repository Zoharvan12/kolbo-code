"""Generate SRT from transcript.json and analyze chapters via Claude."""
import json, os, sys

# ── SRT generation ────────────────────────────────────────────────────────

with open('ytp_jobs/sapir_test/transcript.json', encoding='utf-8') as f:
    data = json.load(f)

words = data['words']

def fmt_time(s):
    h = int(s // 3600)
    m = int((s % 3600) // 60)
    sec = s % 60
    return f'{h:02d}:{m:02d}:{sec:06.3f}'.replace('.', ',')

lines, current, cur_start = [], [], None
for i, w in enumerate(words):
    if not current:
        cur_start = w['start']
    current.append(w['text'])
    gap = words[i + 1]['start'] - w['end'] if i + 1 < len(words) else 999
    if len(current) >= 8 or gap > 1.5:
        lines.append({'start': cur_start, 'end': w['end'], 'text': ' '.join(current)})
        current, cur_start = [], None

if current:
    lines.append({'start': cur_start, 'end': words[-1]['end'], 'text': ' '.join(current)})

srt_blocks = []
for i, l in enumerate(lines, 1):
    srt_blocks.append(f"{i}\n{fmt_time(l['start'])} --> {fmt_time(l['end'])}\n{l['text']}\n")

srt_text = '\n'.join(srt_blocks)

with open('ytp_jobs/sapir_test/sapir.srt', 'w', encoding='utf-8') as f:
    f.write(srt_text)

print(f"[srt] Written {len(lines)} subtitle blocks -> ytp_jobs/sapir_test/sapir.srt")
print(f"[srt] First 3 blocks:")
for l in lines[:3]:
    print(f"  [{fmt_time(l['start'])} --> {fmt_time(l['end'])}] {l['text'][:70]}")
