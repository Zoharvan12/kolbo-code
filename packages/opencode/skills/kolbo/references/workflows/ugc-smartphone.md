# UGC / Smartphone Look — Images and Video

Load this file whenever the user asks for anything that should look like a real person's
phone captured it: "UGC", "shot on my phone", "iPhone photo", "selfie", "candid",
"authentic", "organic", "TikTok / Reels / Shorts", "creator video", "unboxing", "POV",
"talking head", or a product photo that "shouldn't look like an ad".

For the *campaign* layer around this — ad modes, hooks, avatars, brand kits — see
`workflows/marketing-studio.md`. This file is the LOOK: the physics that make a
generation read as a phone capture instead of a commercial.

---

## The one rule everything else follows

**Writing "smartphone photo" does not produce a smartphone photo.**

Image and video models treat "phone" as a subject label, not a rendering instruction.
The model has already decided what a good picture looks like — shallow depth of field,
sculpted key light, clean background, retouched skin — and the word "phone" does not
overrule any of it. You have to specify the *causes*.

Every UGC prompt states four things. Miss one and it drifts back to a commercial.

### 1. Optics — the biggest tell

> `shot on a phone, 24mm-equivalent wide lens, tiny sensor: DEEP depth of field, the
> background as sharp as the subject`

Deep focus is the single strongest signal. A creamy blurred background instantly reads
"produced" — it is physically what a phone cannot do without portrait mode. Add:

- mild wide-angle distortion toward the frame edges
- close-focus perspective: the nearest hand / nose / product reads slightly large
- the camera stands where a person stands — chest height, arm's length, or above a table

### 2. Processing — what the phone's chip does after the shutter

> `computational HDR: flat contrast, lifted shadows, highlights held right at clipping,
> over-sharpened micro-detail, heavy noise reduction with faint luminance noise in the shadows`

This is the "digital" texture people recognise without being able to name. It is the
opposite of a graded image: nothing is crushed, nothing is filmic, edges are a little
too crisp.

### 3. Light — available only, and NAMED

Never "natural lighting". Name the actual source:

| Source | What it does |
|---|---|
| Window daylight | soft from one side, faint pane shadows, cool |
| One ceiling bulb | top-down, warm, shadowed eye sockets |
| Phone / laptop screen glow | up-lit face, cool cast, dark room |
| Supermarket / office fluorescents | flat, green-ish, no modelling |
| Direct on-camera flash at night | hard shadow thrown on the wall behind, hot falloff, dark background |

**Mixed white balance in one frame is the strongest realism cue that exists** — warm bulb
inside plus cool daylight through a window, and the model stops rendering a studio.

### 4. Imperfection — the part everyone skips

- framing slightly off-centre, a few degrees of tilt, head near the top edge or lightly cropped
- caught mid-gesture or mid-blink, not on a posed peak
- faint motion blur on a moving hand
- visible pores, flyaway hair, creased clothing, chapped lips — no beauty retouching
- **a real cluttered background**: cables, a mug, an unmade bed corner, a full dish rack.
  Empty minimal sets are the AI default and the giveaway.

---

## The subject dial — ask once, then state it

Users often want the subject facing camera. **Often — not always.** Decide it explicitly
and write it into the prompt:

- **TO-CAMERA** — arm's-length selfie geometry, direct eye contact, talking to the viewer
  like a friend. Default for a talking head, review, testimonial, or hook.
- **OBSERVATIONAL** — candid, subject unaware, filmed by someone standing where a person
  would stand. Default for lifestyle, product-in-use, and "day in the life".

Do not silently assume to-camera for every UGC ask; an observational frame is what makes a
product shot feel found rather than staged.

---

## Product + UGC (the most common image case)

The user uploads a product and wants a photo a customer could have taken.

**Route first:**

| What they want | Tool |
|---|---|
| The SAME uploaded photo re-rendered as a phone shot | `generate_image_edit` (`image_editing`) |
| The product in a NEW scene — a hand, a counter, a gym bag | `generate_image` with the product image as a reference |

**Then four hard rules:**

1. **Identity is not creative latitude.** `keep the label artwork, typography, colours,
   proportions and closure exactly as in the reference — do not redesign, re-letter or
   re-colour the packaging`. Models rewrite label text unless forbidden. If the label
   carries words, quote them verbatim in the prompt.
2. **Relight it into the room.** A studio pack-shot dropped into a kitchen is the classic
   fake. Demand: the same light direction and colour temperature as the scene, a contact
   shadow where it meets the surface, the room reflected in glossy or laminated faces, a
   matching noise level, and no leftover white-cyclorama edge glow.
3. **Human scale.** A real hand holding or using it — unmanicured nails, natural grip,
   slight motion blur — or set down mid-use (open, half-full, cap beside it). Never
   centred like a catalogue.
4. **One product per frame**, label toward camera at least once.

For recurring products, make a **product Visual DNA** (`workflows/visual-dna.md`) so the
identity survives every generation instead of being re-described each time.

---

## Video

Everything above still applies. On top of it:

- **The word "cinematic" is banned** — not in the header, not in GLOBAL LOOK, not in a
  shot. It is the single line that turns a phone video back into a commercial.
- **Frame:** `9:16 vertical phone frame`, restated **inside every shot**. Forbid letterbox,
  pillarbox and 16:9 inserts — multishot models silently flip a later shot to widescreen
  when the prompt reads filmic.
- **Single shot vs multi-shot** — ask, don't assume:
  - *Single* (default): `single unbroken take, no cuts`. One continuous handheld take is
    what most UGC actually is.
  - *Multi*: `N connected phone shots, Xs total, 9:16, Multishot ON`. Every shot must be an
    angle one person with one phone could actually have grabbed — never crew coverage.
    Vary the angle and the moment (selfie arm → held out at the product → set down on the
    counter → mid-use), never the look.
- **Camera:** the phone is in a hand. Slight sway with constant micro-corrections,
  reframing a beat late, selfie-arm at arm's length, or propped on a surface. NEVER dolly,
  crane, gimbal glide, orbit, crash zoom, or a locked tripod master.
- **Product:** it is HANDLED, not displayed — picked up, opened, used, label turned to the
  lens at least once, and locked identical across every shot.
- **Audio:** room tone and the phone's own mic. No score, no SFX layer, no burned-in
  captions or subtitles unless the user explicitly asked (they add those in CapCut, and
  baked-in captions kill reuse).

Seedance's phone-vertical exception in `references/models/seedance25.md` is the same rule
from the model's side — read it before compiling a multi-shot UGC prompt.

---

## The negative list (append it every time)

```
no cinematic colour grade, no teal-and-orange, no shallow depth of field or bokeh,
no anamorphic flare, no studio softbox or rim light, no beauty retouching or skin
smoothing, no film-grain overlay, no perfect symmetry, no watermark, no added text
```

## Aspect

9:16 for social and Stories. 4:3 / 3:4 for a camera-roll photo. Widescreen only if asked.

## Optional era dials (only when the user wants that vibe)

Direct-flash night party · disposable camera with a burned-in date stamp · front-camera
selfie with the arm in frame · screenshot of a video call · mirror selfie with the phone
visible · early-2010s low-light grain.

---

## Parity with the Kolbo app

The web app ships this look as a **Smartphone** cinematic preset, and its wording is the
house baseline — match it so a prompt written here and a preset clicked in the UI produce
the same picture:

- **Camera — Smartphone:** *the everyday look of a phone snapshot, deep depth of field with
  foreground and background both sharp, flat computational-HDR contrast, slightly
  oversharpened detail, candid realism*
- **Focal length:** 24mm · **Lighting:** Window Light · **Colour:** Naturalistic Clean

`list_cinematic_presets` returns the live catalog. Related in-app looks worth knowing:
**Camcorder Tape** (2000s home video), **Reality Show**, **Mockumentary**, and the
**Handheld** movesets for video.

---

## Copy-ready seeds

**Phone still (person):**
```
Candid phone snapshot of {subject} in {real, specific room}, {mid-action}.
Shot on a phone, 24mm wide, tiny sensor — deep depth of field, background as sharp as
the subject. Computational HDR: flat contrast, lifted shadows, highlights at clipping,
over-sharpened detail, faint shadow noise. Lit only by {named source}; {second source}
mixes a different colour temperature into the frame. Framing slightly off-centre with a
few degrees of tilt, caught mid-gesture. Visible skin texture and flyaway hair, creased
clothing, real clutter in the background ({two specific objects}).
9:16 vertical.
no cinematic grade, no bokeh, no rim light, no retouching, no watermark, no text
```

**Product in a real kitchen (new scene, product image as reference):**
```
{Product from the reference} held in a real hand over a kitchen counter, mid-use, cap
beside it. Keep the label artwork, typography, colours and proportions exactly as in the
reference — do not redesign or re-letter the packaging.
Shot on a phone, 24mm wide, deep depth of field. Computational HDR, flat contrast,
over-sharpened detail. Lit by window daylight from the left with a warm ceiling bulb
mixing in. The product is relit by the room: matching light direction and colour, a
contact shadow where it meets the counter, the window reflected in its glossy face,
the same noise level as the rest of the frame.
Unmanicured nails, natural grip, slight motion blur. Crumbs and a mug in the background.
4:3.
no studio background, no rim light, no bokeh, no retouching, no added text
```

**Single-shot UGC video:**
```
Single unbroken take, no cuts, 9:16 vertical phone frame.
{Presenter or @dna} in {everyday room}, TO-CAMERA, talking to the viewer like a friend
while {natural action with the product}. Phone held at arm's length with slight sway and
constant micro-corrections; the frame reframes a beat late.
Available light only: {named source}. Deep focus, flat computational-HDR contrast,
over-sharpened detail.
Audio: room tone and the phone's own mic. No music, no SFX, no captions.
```

---

## QC — look for these before you ship

| Symptom | Cause |
|---|---|
| Background is blurred | you didn't demand deep depth of field |
| Reads as an ad | the word "cinematic" survived, or a rim/key light is in the prompt |
| Product looks pasted in | you didn't relight it into the scene |
| Label text is wrong | you didn't forbid redesigning it / didn't quote the words |
| Face is plastic | no pores/asymmetry/flyaway hair line, or retouching wasn't forbidden |
| Set is empty and clean | you didn't name real clutter |
| A later video shot went widescreen | 9:16 wasn't restated inside every shot |
