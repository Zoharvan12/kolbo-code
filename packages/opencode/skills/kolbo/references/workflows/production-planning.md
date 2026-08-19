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

1. **Map** every element the script needs.
2. **Create** each one as an approved asset (Visual DNA).
3. **Confirm** the asset set with the user.
4. **Only then** compile shots and generate video.

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

Use the sheet presets rather than free-form portraits — `generate_character_sheet`
with `sheet_type`:

- `character` — front/back/face turnaround, the default for a speaking role
- `character_bible` — denser model sheet (turnaround + faces + wardrobe + swatches) for a lead who appears across many shots
- `character_headless` — wardrobe/body when clothing changes but the face must not
- `environment` — location angles plus one signature detail
- `product` — angles plus material and construction close-ups
- `style` — one look applied across six varied subjects

The sheet is the single strongest consistency booster. It costs credits, so offer
it and generate on a yes.

Then `create_visual_dna` with the sheet as the reference and the matching
`dna_type`. Name each DNA in the exact form it will be tagged with later.

## 3. Confirm

Show the user the asset set and get an explicit approval before shooting. This is
the cheapest possible place to change their mind.

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
