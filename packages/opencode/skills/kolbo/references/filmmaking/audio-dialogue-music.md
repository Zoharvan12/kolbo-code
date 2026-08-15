# Audio, Dialogue, and Music

Choose one primary audio lane, then state how the remaining sound layers interact.

## Audio ownership

For every audible element, record:

- source: native generation, supplied audio, off-screen actor, environment, or post;
- owner: which mouth/body/object produces it;
- timing and duration;
- priority in the mix;
- whether it continues across the edit.

Never leave spoken or sung words ownerless.

## Dialogue lane

Use exact quoted text. Separate:

1. **Voice identity** — stable register, timbre, accent, pace, habitual delivery.
2. **Scene delivery** — tactic, volume, pressure, timing, breath, interruption.
3. **Listener behavior** — active task and reaction timing.

Specify when mouths remain closed if the model tends to invent speech. Allow nonverbal sound only when requested.

Fit dialogue to the available duration. Include a clean tail when the editor needs a seam. Preserve the previous line's emotional/audio tail only when it helps the next reaction; do not import irrelevant visual subjects from prior audio.

## Exact-song lip-sync lane

Use when a supplied waveform is authoritative.

Declare:

- the audio/video reference contains the performance track;
- the exact performer whose mouth owns it;
- the lyric fragment in the block;
- source waveform wins if text and clipped edges disagree;
- breath gaps and section boundaries;
- non-performers' mouth behavior;
- whether returned generation audio is retained or replaced in post.

Example contract:

```text
<audio tag> is the authoritative performance waveform.
<performer> shapes every audible syllable frame-accurately.
Lyrics: "..."
At clipped boundaries, follow the waveform rather than completing the written line.
Other mouths react and sing only if explicitly assigned; they never inherit these words.
```

Cut long songs into edit-aware sections at breaths or musical seams. Do not cut mid-phoneme unless unavoidable.

## Native music-performance lane

Use when the selected model can produce synchronized music/vocals and the user wants generation-native sound.

Specify:

- performers and vocal ownership;
- lyric or semantic requirement;
- tempo/beat landmarks and choreography hits;
- music style in observable arrangement terms;
- where vocals trade, overlap, or unify;
- SFX/ambience relationship;
- whether imperfect live energy or polished studio precision is desired.

Do not default to “music belongs in post” when the creative ask explicitly depends on native synchronized music.

## Dance and ensemble performance

Define formation, choreography class, beat accents, leader changes, and what counts as synchronized versus individualized. Keep reaction/face rhythms distinct even when bodies hit choreography in unison.

For moving vehicles or complex environments, protect balance, handholds, wind, hair/wardrobe response, and occupant positions.

## Ambience/SFX-only lane

Use when edit flexibility or dramatic silence matters. Define a continuous environmental bed and timed events. “No score” must not suppress dialogue or requested effects.

Use silence as a placed event with duration and dramatic purpose, not an empty unspecified gap.

## Post-production music lane

Track the score brief outside the generation prompt:

- thematic motif and emotional arc;
- tempo, meter, instrumentation, entry/exit points;
- dialogue ducking and impact sync;
- continuous ambience that glues generated shots;
- licensing/ownership status.

Generate clean picture audio consistent with the edit plan.

## Voice and likeness rights

Do not imitate or deploy a real person's voice/likeness without confirmed authorization. Store provenance/permission with the asset. Describe fictional character performance rather than relying on an actor name.

## Audit failures

Flag:

- multiple mouths owning one line unintentionally;
- dialogue repeated in both action and audio in conflicting forms;
- lyrics inconsistent with the source waveform;
- invented ad-libs or sound from off-screen events meant to remain silent;
- native music requested but globally prohibited;
- “no music” interpreted as “no audio”;
- voice identity rewritten across shots;
- dialogue/choreography that cannot fit the duration;
- no clean audio seam for the intended edit.
