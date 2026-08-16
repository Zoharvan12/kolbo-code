# Audio Stem Separation — splitting a soundtrack into layers

Load this file when the user wants to **pull a soundtrack apart**: remove or isolate speech,
strip narration, mute the music, get a clean instrumental / M&E bed, prepare a track for
dubbing or localisation, clean up a podcast, or hand an editor stems.

This is Kolbo's own pipeline, not a vendor passthrough. It is a **masking** separation — the
layers sum back to the original at −30 to −37 dB, so nothing is resynthesised — with a speech
classifier layered on top. That classifier is the part that matters: a "vocals" mask is not
the same thing as dialogue. Engines, impacts and centred ambience land in it at full volume,
and a plain vocal remover hands those back labelled as speech. When no words are actually
spoken, Kolbo folds that mask into Effects instead.

## Decision tree

```
"Remove the vocals / speech / narration"            → separate_audio_stems, hand back the `me` layer
"Isolate just the dialogue"                          → separate_audio_stems, hand back the `dialogue` layer
"Get me the instrumental / music bed"                → separate_audio_stems, hand back the `music` layer
"Give the editor stems" / dubbing / localisation     → separate_audio_stems, hand back ALL layers
"I can still hear voices in the clean track"         → clean_dialogue_leftovers on the `me` URL
"I want the room tone / atmosphere on its own"       → separate_ambience on the `sfx` URL
Just want the words as text, not the audio           → transcribe_audio (references/workflows/transcription.md)
```

Never reach for `edit_video({ operation: "generate_audio" })` for any of these — that ADDS a
generated audio layer, it does not take one away.

## The layers

`separate_audio_stems` returns whichever of these the material actually contains:

| type | What it is |
|---|---|
| `dialogue` | Speech only. Absent when the clip has no spoken words. |
| `music` | Score / song bed. Absent when the clip has no music. |
| `sfx` | Effects and Foley. |
| `me` | Everything except dialogue ("M&E") — the track you dub over. |
| `original` | The untouched mix, for reference. |

A missing lane is a real finding, not an error: a talking-head clip with no score genuinely
has no Music layer, and shipping an empty row plus an `sfx` byte-identical to `me` would be
two lies instead of one honest pair. Say what came back rather than implying a lane failed.

## Two inputs, one tool

- **`audio_url`** — any public media URL, audio or video: an upload, a Kolbo generation, a
  direct link. Stateless: nothing is stored against it, there is **no cache**, so calling
  twice on the same file separates twice and bills twice. Sources up to **15 minutes**; trim
  longer files (`trim_video`, or ffmpeg locally) and separate each section.
- **`generation_id`** — a Kolbo video you already generated. The layers are saved onto that
  generation, so a repeat call returns them free and the web app's mixer sees the same thing.

Prefer `generation_id` whenever the source IS a Kolbo generation — it is cacheable and it
keeps the API and the web app in agreement.

## Cost and when NOT to escalate

| Tool | Credits | When |
|---|---|---|
| `separate_audio_stems` | 5 | Always the first call. |
| `clean_dialogue_leftovers` | 17 | ONLY when the user actually hears voice bleeding through `me`. |
| `separate_ambience` | 17 | ONLY when the user wants room tone as its own lane. |

`clean_dialogue_leftovers` is deliberately not automatic. It trades fidelity to do its job —
the model that removes the leak reconstructs the bed less cleanly (~−12 dB) than the masking
model that produced it (~−30 dB) — so running it by reflex makes the common case worse to fix
a rare one. Typical on dense crowd scenes; unnecessary on clean dialogue. Ask, or wait for the
user to report the leak. Both 17-credit tools bill even when the analysis finds nothing to
remove (the pass still runs); the response reports `already_clean` / `skipped` when that
happens, so say so rather than presenting a no-op as a result.

## Practical notes

- These tools run **inline** — no job id, nothing to poll. Each call holds for 20–90 seconds
  on a typical clip. Don't call `get_generation_status` on the result.
- Layer URLs are WAV on the Kolbo CDN. Hand the user the URLs directly.
- A file whose audio track is digital silence is refused **before** any charge (`NO_AUDIO`).
  That is the system working, not a failure to retry.
- Local file on the user's machine? Same rule as everywhere else — `upload_media` /
  `media_upload_widget` / `create_upload_ticket` first, then pass the returned https:// URL.
