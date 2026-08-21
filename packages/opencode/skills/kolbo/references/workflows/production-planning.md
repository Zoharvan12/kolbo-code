<!-- PARITY: the asset-first rule and the model defaults here are mirrored in
     kolbo-api/src/config/systemPrompt.js and the help widget's skillRouter.
     Change all three together. -->

# Production Planning — map the assets before you shoot

Any request for a film, ad, scene, episode, campaign or "video with characters"
starts here, **before** a single video credit is spent. Most users do not know
this flow exists; they ask for a film and expect a film. Walk them through it
rather than jumping to a prompt.

Skip it only for a genuine one-off: a single clip, no recurring subject, nothing
that has to match anything else.

## The order is not negotiable

1. **Map** every element the script needs — including the **session plan** (names).
2. **Create** each one as an asset (Visual DNA), grouped into the planned sessions.
3. **Confirm** that bucket with the user. Do not start the next bucket until they lock this one.
4. **Only then** compile shots and generate video (one session per scene).

Generating video before step 3 is how a production ends up with a different face
in every shot and a re-shoot bill. A shot generated against an unapproved cast is
not a draft, it is waste.

## 1. Map

Read the script and produce an explicit inventory. Name every element, even the
ones that feel obvious — the ones that get skipped are the ones that drift:

| Kind | DNA type | What it owns |
|---|---|---|
| Every speaking or recurring person | `character` | identity, wardrobe, physical state, performance |
| Every location, including reverse angles | `environment` | geography, landmarks, materials, light logic |
| Every hero prop, product, vehicle | `product` | identity, scale, material, damage/version state |
| The film's overall look, when it must hold across shots | `style` | visual register only |

State the inventory back to the user as a list with counts and cost before
creating anything. A 4-character, 2-location, 1-prop film is 7 assets, not "some
characters".

Also publish the **session plan** in that same MAP reply — exact sidebar titles
you will `rename_session` to. Default buckets:

| Session name | Kind | Contents |
|---|---|---|
| `Cast` | image | all character sheets / character DNAs |
| `Locations` | image | all environments |
| `Props` | image | hero products / vehicles (omit if none) |
| `Scene 01 — <slug>` | video | every shot and retake of that scene |
| `Scene 02 — <slug>` | video | next scene |

Slugs come from the plan (`Scene 01 — coffee shop`, `Scene 03 — rooftop chase`),
not generic "API Generations" or "Untitled". One video session **per scene**;
shots live inside it. A new session is a new scene or a new concept — never a
new take.

Omitting `session_id` on generate creates a new session. First call of a bucket
omits it, then `rename_session` immediately; every later call in that bucket
passes the same id. Image and video kinds cannot share an id.

Write those planned names into `.kolbo/production.md` `### Sessions` as
`(pending)` during MAP. Fill in the real `session_id` when the first generate
returns. See `production-log.md`.

Separate **states** from **identities**: clean vs bloodied, day vs night, intact
vs broken are their own assets. Do not expect one DNA to carry both.

## 2. Create

Generate the reference imagery, then register it as a Visual DNA.

**Model defaults for the asset pass** (this is an image job — never a video model):

| Asset | Model | Why |
|---|---|---|
| Cinematic environments; invented / original characters | **`mirage-film-2`** (MIRAGE FILM 2, 3cr) | cinematic look at a third the cost — the default for anything being invented from scratch |
| Assets needing reference fidelity, legible text, or editing | **`nano-banana-2`** (10cr) or **`gpt-image-2`** (12cr) | stronger reference adherence and text; GPT Image 2 when the asset carries readable words |

Read the matching prompt reference before writing an asset prompt:
`references/models/nano-banana.md` for Nano Banana, `references/models/gpt-image.md`
for GPT Image 2. There is no Mirage reference file — prompt it as a plain cinematic
still.

Resolve the sheet **preset** (custom instructions live there):
`list_presets({ type: "image", search: "bible" | "headless" | "character sheet" })`
then `generate_image` with that `preset_id`. Do not dump the catalog — always
pass `search`.

- `bible` — lead or anyone with a lot of detail (default when in doubt)
- `headless` — body / wardrobe / instrument; face already locked
- `character sheet` — simple supporting role
- `location` / `product` — matching DNA type

Sheets are **2K or 4K** (never 1K). Default 2K; 4K for bible / high-detail / when
the user names 4K or GPT Image 2.

Do not skip the sheet and `create_visual_dna` from a portrait. The sheet is the
asset; the DNA stores it.

Then `create_visual_dna` with the sheet as the reference and the matching
`dna_type`. Name each DNA in the exact form it will be tagged with later.

## 3. Confirm — a labeled GATE, then wait

Show the user what this bucket produced and **stop**. Do not start Locations
while Cast is still iterating. Do not shoot while assets are unapproved.
Do not rewrite `## 🎯 Now` to the next phase until the gate is answered.

If they do not volunteer a yes, end the turn with a GATE the next message can
parse — not a vague "looks good?":

```
GATE — Cast
Presented: @maya, @doron (candidates in the log)
Lock + next: "lock cast" / "yes" / "next" / "now locations"
Stay: "redo @maya" / "another take of the leather jacket"
```

Treat as confirmation: `yes`, `ok`, `lock`, `approved`, `that's the one`,
`use take 2`, `next`, `go`, `continue`, or they name the **next** bucket
("now do environments", "shoot scene 1") while treating the current set as done.

Not confirmation: silence, "maybe", a question about something else, another
take request. Ask the GATE again once; do not invent a yes.

On lock: promote candidates → Approved in `.kolbo/production.md`, then start
the next planned bucket in **its** session.

## 4. Shoot

Only now compile shots. Defaults:

- **`generate_elements` with Seedance 2.5** (`seedance-2-5`) for the film itself —
  up to 30s and 30 shots in ONE generation, up to 20 Visual DNAs, dialogue and SFX
  baked in. `generate_video` also accepts `visual_dna_ids` now; Elements remains
  the primary reference-driven route.
- **Seedance 2.0** (`seedance-2`, cheaper, 4–15s, 9 DNAs) when the piece is short
  and the cast is small. `seedance-2-fast` / `seedance-2-mini` for cheap blocking.
- Every DNA in `visual_dna_ids` must also appear as `@ExactName` in the prompt.
- Dialogue in quotes inside its shot beat — English only, never TTS or lipsync.
  See `models/seedance25.md`.
- **First pass at 480p.** Resolution is a credit multiplier (480p ×0.44 vs 720p,
  1080p ×2.25). Block, approve, then re-run the approved cut at delivery
  resolution.

## What this replaces

Do not plan a film as "N separate image-to-video clips plus TTS plus lipsync".
That shape is a legacy of models that could not hold a cast or speak. It costs
more, drifts between shots, and produces dead-eyed dubbed performance. One
multi-shot Seedance generation against approved DNAs is the current answer.
