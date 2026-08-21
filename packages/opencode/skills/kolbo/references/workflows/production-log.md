# Production Log — `.kolbo/production.md`

Load this file when starting a multi-step production, or before any continuation of prior media work ("edit", "redo", "the same character", `@name` references, "scene N").

## Why It Exists

Every URL, id, and brief produced by a Kolbo MCP tool MUST be recorded in `.kolbo/production.md` in the user's workspace. This file is **your** (agent) source of truth for prior artifacts across turns — not chat history (unreliable / compacted) and not a substitute for the user's **Library** gallery. URLs scattered across `tool_result` blobs are unreliable to re-scan and disappear entirely on context compaction. If the user named a model, write that name into `## 🎯 Now` and keep using that family on every follow-up — compaction is not permission to cheapest-swap.

**User vs agent SoT:** finished media for the human → **Library → This session**. Job state while in flight → `get_generation_status`. Your memory → this file. Chat cards are progress UI only.

## When to READ it

Read `.kolbo/production.md` **before** acting on any of these signals:
- "edit", "animate", "combine", "redo", "polish", "fix", "regenerate"
- "the same character / scene / image / video / sound", "that X", "scene N", "the rainy one", etc.
- `@name` references for Visual DNA
- Any continuation of prior media work ("now make scene 3")

If the file is missing and the user is referencing prior media, ask the user — do not guess from chat.

## ⚠️ Approval gates — the user is usually still iterating (READ THIS FIRST)

Most media work is an **approval loop**, not a single shot. The user generates, looks, asks for another take, and keeps going until satisfied. This is the normal case for **images, image sets, Visual DNAs, moodboards, and videos** alike.

The log records **what the user approved** — not everything you produced. Getting this wrong is expensive in both directions: log too eagerly and take 3 of 7 is enshrined as "the character"; log too late and the approved URL is gone after compaction.

**The loop:**

1. **Generate** candidates.
2. **Present them so the user can actually judge.** Never ask "approve?" over bare URLs or ids — the user cannot see those. Use the widget-carrying tools:
   - Visual DNAs → `list_visual_dnas` (renders a thumbnail media grid; `create_visual_dna` returns text only, so follow it with this)
   - Moodboards → `list_moodboards`
   - Images / videos / audio → show the returned URLs as markdown images/links
   Say plainly which ones are in play, e.g. "created `@maya` and `@maya_alt` — here they are".
3. **Ask for a decision** and name the options ("keep the first, redo the second, or both?").
4. **Repeat** until the user is satisfied. Log nothing as approved during this stage.
5. **On approval → promote in `.kolbo/production.md` immediately**, in the same turn: move the winner out of Candidates, update `**Approved:**`, then you may start the next plan bucket. Do not advance `**Now working on:**` to the next phase before this.

**Never write an artifact into the log as approved without the user's approval.**

If they did not volunteer a yes, end the turn with a **GATE** the next message can
parse (same contract as `production-planning.md`):

```
GATE — <bucket name>
Presented: <what is in play>
Lock + next: "lock <bucket>" / "yes" / "next" / "now <next bucket>"
Stay: "redo @name" / "another take of …"
```

Confirmation the agent may treat as a lock: `yes`, `ok`, `lock`, `approved`,
`that's the one`, `use take 2`, `next`, `go`, `continue`, or they name the next
planned bucket while treating this set as done. Silence / "maybe" / a new
question is **not** a lock — repeat the GATE once, do not invent a yes.

**If the user genuinely doesn't care** — "whatever you think", "you pick", "don't care", or they hand you the whole job — then **you decide**. Choose, say in one line which you picked and why, and log it as usual with `(agent-selected)`. Do not stall a production waiting for an approval the user has already delegated to you.

**Don't lose candidate URLs while iterating.** Recording a candidate is not the same as claiming approval, and compaction will eat unlogged URLs. Park in-flight takes under a `#### Candidates (pending approval)` bullet, and on approval promote the winner to a normal entry and mark the rest `(rejected)`:

```md
2. **Rainy street walk** — neon reflections, slow dolly
   #### Candidates (pending approval)
   - take 1: https://...02-rain-a.png  (flux-2-pro, 2026-08-17)
   - take 2: https://...02-rain-b.png  (flux-2-pro, 2026-08-17)
```

after the user picks take 2:

```md
2. **Rainy street walk** — neon reflections, slow dolly
   - still: https://...02-rain-b.png  (flux-2-pro · 1K, approved 2026-08-17)
   - take 1: https://...02-rain-a.png  (rejected 2026-08-17)
```

**Re-confirm state after a long loop.** When a session has churned through many takes, restate the approved set before moving on — "so we're locked on: @maya, moodboard #noir, scenes 1-3" — and make the log match. An approval loop that ends without a written-down approved state is how the wrong asset ships.

## When to WRITE to it

Two writes, different jobs:

1. **Right after a successful generate** — park the URL, `generation_id`, `credits_used`, and `session_id` under `#### Candidates (pending approval)` and under `### Sessions` if this is the first shot of a new bucket. Rewrite `## 🎯 Now` only for `**Awaiting approval:**` / the current bucket. This is what the runtime reminder is asking for. It is **not** approval.
2. **After the user locks the bucket** — promote the winner, mark rejects, update `**Approved:**`, then you may change `**Now working on:**` to the next planned bucket.

Where there is no production (user asked for one throwaway image and got it, or said "you pick") — approval is implicit and you log the finished entry right away. A film / ad / scene plan is never that case.

Tools that REQUIRE logging:
- `generate_image`, `generate_image_edit`, `edit_image`
- `generate_video`, `generate_video_from_image`, `generate_video_from_video`, `edit_video`
- `generate_elements`, `generate_first_last_frame`, `generate_lipsync`
- `generate_music`, `generate_sound`, `generate_speech`
- `generate_3d`, `generate_creative_director`
- `create_visual_dna`, `upload_media`

Tools that do NOT log: `list_*`, `get_*`, `check_credits`, `chat_*`, `transcribe_audio` (read-only / discovery).

## File creation — pick the right tool to avoid the "must Read first" error

`Edit` refuses to overwrite a file unless you've `Read` it first in the same session. Pick by file state:

| State | Tool |
|---|---|
| File **does not exist** (typical first turn) | `Write` with the full stub below |
| File **exists** | `Read` first, then `Edit` |
| Not sure | `Read` first; on ENOENT, fall back to `Write` |

Stub for first creation:

```md
<!-- .kolbo/production.md — agent-managed media artifact registry.
     User may hand-edit; agent must Read-before-Edit to reconcile. -->

# Production Log

## 🎯 Now

**Brief:** <paraphrase of user's overall goal in 1-3 sentences>
**Now working on:** <the immediate next step>
**Approved:** <locked assets — DNAs, moodboards, scenes; "nothing yet" if still iterating>
**Awaiting approval:** <what you've presented and are waiting on; omit when nothing is pending>
**Sessions:** <plan names + ids — Cast / Locations / Scene 01 — …; "none yet" until first generate>
**Last updated:** <ISO date>

---

## Production: <name from user's request, slugified human label>

### Sessions
### Cast
### Visual DNA
### Scenes
### Audio
### Final
```

Subsections (`### Cast` etc.) are **suggested defaults**, not required. Adapt: a logo set has `### Logos`, an album has `### Tracks`, a 3D render has `### Models`. Leave empty subsections out of the file when you create entries.

## Entry shape

One bullet per artifact. Write the label **the way the user would reference it next time** ("the rainy one"), not the model's raw output.

```md
### Sessions
- **Cast** — sess_abc  (image) — @maya @doron
- **Locations** — sess_def  (image) — @night_market
- **Scene 01 — coffee shop** — sess_ghi  (video) — shots 1–4
- **Scene 02 — rooftop chase** — (pending)

### Cast
- **Maya** — female, 30, urban photographer, leather jacket
  - portrait: https://...characters/maya.png  (nano-banana-2, 2026-05-13)
  - visual DNA: vdna_8f2c  (@maya)
  - session: sess_abc

### Scenes
1. **Coffee shop morning** — Maya at counter, soft light, wide shot
   - still: https://...scenes/01-coffee.png  (flux-2-pro, 2026-05-13)
   - video: (pending)
2. **Rainy street walk** — neon reflections, slow dolly
   - still: https://...scenes/02-rain.png  (flux-2-pro, 2026-05-13)
   - video: https://...videos/02-rain.mp4  (kling-2, 2026-05-13)
```

## Header rewrite rule (Manus pattern — IMPORTANT)

The `## 🎯 Now` block at the top of the file is **rewritten every turn** to keep the brief + current step near the model's recency window. Body sections (everything below the first `---`) are **append-only**.

When a user request supersedes a previous artifact (e.g., "redo scene 2 with more rain"), do not delete the old entry. Mark it `(superseded YYYY-MM-DD)` and place the new entry beneath:

```md
2. **Rainy street walk** — neon reflections, slow dolly
   - still: https://...scenes/02-rain.png (superseded 2026-05-13)
   - still: https://...scenes/02-rain-v2.png  (flux-2-pro, 2026-05-13)
   - video: https://...videos/02-rain-v2.mp4  (kling-2, 2026-05-13)
```

## Rules

1. **First touch `Write`, subsequent touches `Read` → `Edit`** (see "File creation" above). If `Edit` fails on exact-match, `Read` again — the user may have hand-edited.
2. **Plain English labels** — write what the user would call it.
3. **Append-only body.** Only the `## 🎯 Now` header is rewritten. Never delete artifact entries; mark them `(superseded)` instead.
4. **Do not log failures.** Only successful generations.
5. **Resolve user references via the log, not chat history.** If the user says "scene 3," use the URL the log says is scene 3, even if a later tool_result mentioned a different URL.
6. **One file per workspace.** Multiple concurrent productions go under separate `## Production: <name>` headings inside the same file.
7. **Approved state is user-granted, never assumed.** A generation succeeding is not approval. Only the user's "yes" — or their explicit delegation of the choice to you — promotes a candidate to an approved entry. Silence is not approval; neither is the user moving on to another topic.
8. **The `## 🎯 Now` block names what is locked.** Keep an `**Approved:**` line there listing the currently-approved cast, DNAs, moodboards, and scenes, so the approved state survives compaction and is the first thing you read next session.
9. **Sessions are part of the log.** Every bucket from the plan gets a `### Sessions` row (name from the plan, `session_id`, kind, which `@tags` / scene it holds). After the first generate of a bucket, `rename_session` to that plan name and write the id. Reuse that id — do not spawn untitled sessions for retakes.

## Bulk Generation Entry Shape

For batch runs (50-item UGC sets, etc.), persist every `generation_id` (even for failures) — required for `get_generation_status` recovery and cross-session dedupe.

```md
12. ✅ Asian F 24, bedroom, hype POV
    - generation_id: gen_8a2c…
    - url: https://…
    - model: seedance-2 · 720p · 10s · sound-on
    - generated: 2026-05-14T07:42Z
13. ❌ Latino M 31, gym
    - generation_id: gen_ff19…
    - error: 429 Too many generation requests
    - retry_after: 2026-05-14T07:43Z
```

## Always log the resolution / duration / sound choices

Production-log entries should include the resolution and (for video) duration + sound state alongside the URL, so the user can see what they paid for:

```md
- still: https://...01-coffee.png  (flux-2-pro · 1K, 2026-05-14)
- video: https://...02-rain.mp4   (kling-2 · 1080p · 5s · sound-off, 2026-05-14)
```

## Production Log vs TodoWrite

Use both — different jobs:

| | `.kolbo/production.md` | `TodoWrite` |
|---|---|---|
| Purpose | Durable artifact registry | Ephemeral step plan |
| Lifetime | Persists across sessions / compaction | Per turn / per request |
| Content | URLs, ids, briefs | "Do X, then Y, then Z" |
| Example | `still: https://...01-coffee.png` | `Generate visual DNA for Maya` |

## Real Cost Quoting

Every generation now returns `credits_used` (multiplier-adjusted total) and `credits_breakdown` (per-model attribution). **Log `credits_used` to `.kolbo/production.md`, not `base × count`.**

```json
{ "credits_used": 12, "credits_breakdown": [{ "model": "nano-banana-2", "base": 8, "final": 12, ... }], "urls": [...] }
```

When the user asks "how much did I spend?" → call `get_session_usage` for the real, multiplier-adjusted session total + per-tool + per-model breakdowns (same numbers as the desktop bottom-bar counter).
