<!-- Schema and preserve-vocabulary distilled from patterns observed across a
     22,000-prompt open corpus (YouMind-OpenLab/ai-image-prompts-skill, MIT).
     Patterns and field frequencies only — no prompt text or assets were copied. -->

# Prompt Structure — Structured Blocks, Reference Contracts, Reusable Templates

Load this file when a still-image request is **complex** (many elements that must all
land), an **edit that must not drift**, or a **template the user will run more than once**.

Simple asks do not need any of this. "A watercolor cat on a windowsill" is a finished
prompt — structure added to a simple request just gives the model more surface to
misread. Reach for these three tools only when the picture has parts that fight.

---

## 1. Structured blocks — for complex scenes

When a single paragraph has to carry a subject, a wardrobe, a pose, an environment, a
light setup and a camera, prose starts losing elements. Break it into labelled blocks so
each one is independently checkable. This is the schema that recurs across thousands of
working prompts, in frequency order — use the blocks the picture needs, skip the rest:

```
output_goal:   one sentence — what the finished image IS
subject:       identity, expression, pose, wardrobe, accessories
environment:   location, background, props, atmosphere
lighting:      type, direction, quality, mood
camera:        shot size, lens, angle, focus, depth of field
composition:   framing, subject placement, negative space
style:         medium, rendering, colour palette, reference era
negative:      what must NOT appear
aspect_ratio:  the target canvas
```

Rules that make it work rather than just look organised:

- **`output_goal` first, one sentence.** It is the model's summary of intent, and it
  catches briefs that contradict themselves before you write 400 words.
- **One fact per field.** `"lighting": "hard noon sun from camera-left, deep short
  shadows"` — not a paragraph.
- **Nest only where it earns it.** `subject.hair`, `subject.expression`, `subject.pose`
  are worth splitting when they matter; otherwise keep `subject` flat.
- **`negative` is a real field, not a mood.** Name objects and treatments to exclude
  ("no text, no watermark, no extra fingers, no lens flare"), not qualities to avoid.
- **Never restate a block's content inside another block.** Style written into every
  field is how a picture ends up over-styled and identical in every region.
- JSON-ish, YAML-ish or plain labelled lines all work. Pick one and stay in it.

## 2. The reference contract — how an edit stops drifting

This is the highest-value pattern in the file. "Keep everything else the same" is too
vague to hold, and it is why a chain of edits quietly turns a person into someone else.
An edit prompt opens with an explicit contract:

```
reference_image:
  use_uploaded_image: true
  identity_lock: face_only | full_subject | product | scene | none
  preserve: [ <the exact properties that must survive> ]
edit_scope: <the ONE thing that changes>
```

**`identity_lock` says how much is frozen:**

| Mode | What travels | Typical use |
|---|---|---|
| `face_only` | the face, nothing else | put this person in a new scene, outfit or style |
| `full_subject` | face, body, wardrobe | same person, same clothes, new environment |
| `product` | the object's design | the product in a new setting or lighting |
| `scene` | the environment | same room, different subject |
| `none` | nothing — a style reference only | borrow a look, not a thing |

**`preserve` is a list of properties, never an adjective.** Name what actually drifts,
in the order it drifts:

- **People** — facial bone structure, nose shape, eye spacing, jawline, hairline and
  hairstyle, skin tone and texture, expression, body proportions.
- **Products** — label artwork, typography, logo placement, colours, proportions,
  closure or cap, material finish.
- **Scenes** — camera angle, layout, background objects, lighting direction.

**`edit_scope` names ONE change.** "Change only the background to a night street." A
prompt that re-describes the whole picture is a re-generation, and the model will
re-imagine exactly the parts you wanted frozen.

**Restate the whole contract on every iteration.** Drift is cumulative — the third edit
in a chain is where the face goes. Never write "same as before".

Two more invariants worth stating outright: natural anatomy must stay accurate, and a
preserved object keeps its true scale relative to hands and surfaces.

If the user has not uploaded anything, there is no reference contract to write — that is
a from-scratch generation, and `text_to_image` is the tool.

## 3. Reusable templates — named slots

When the user wants a recipe rather than one picture ("for every product", "every
episode cover", "swap the character"), write the prompt once and mark the variable parts
as named slots carrying a working default:

```
{argument name="product name" default="the serum bottle"}
```

- Slot only what changes per run — subject, product name, on-image text, brand colour,
  setting. Everything else stays literal, which is what makes the look reproducible.
- **Every slot needs a default that actually renders**, so the template works unfilled.
- Name slots for what they are — `"hero headline"`, `"character identity"` — never
  `var1`.
- **Reuse one slot name everywhere that value appears.** A nine-frame storyboard that
  names the product in four frames uses one slot four times, not four slots.
- A variation set is one template plus a single stated variation axis (angle, mood,
  palette). Vary that axis only — a set whose look drifts between frames is not a set.
- Deliver the filled version and say which slots to swap next time.

---

## Which tool for which ask

| The ask | Reach for |
|---|---|
| One simple picture | none of this — write good prose |
| Many elements that must all land | structured blocks |
| Editing an upload; identity must survive | reference contract (+ blocks if complex) |
| "I'll run this again for each X" | named slots |
| A set of variations | one template + one variation axis |

Related: `workflows/ugc-smartphone.md` for the phone-shot look (its product rules are the
reference contract applied to packaging), `workflows/visual-dna.md` for locking identity
across many generations rather than one edit, and `models/gpt-image.md` /
`models/nano-banana.md` for per-model phrasing.
