# Visual DNA — Character / Style Consistency

Load this file when the user wants character or style consistency across multiple images/videos, OR when any generation call passes `visual_dna_ids`, OR when the user references a stored DNA by name.

## What Visual DNA Is

Visual DNA profiles capture the visual "identity" of a character, style, product, or scene from reference media. Pass `visual_dna_ids` to any compatible generation tool — the server expands the DNA's reference images and auto-routes to the model's edit variant when appropriate.

## Workflow

1. **Create** a profile with `create_visual_dna` — provide reference images (max 4 — if the user gives more, pick the 4 most representative or ask which to keep; never pass 5+), optionally video and audio.
2. **Types**: `character` (default), `style`, `product`, `scene`, `environment`.
3. **Use** the profile by passing its `id` in `visual_dna_ids` in: `generate_image`, `generate_creative_director`, `generate_elements`, `generate_video_from_image`, `generate_video_from_video`, `generate_first_last_frame`.
4. **List/inspect** profiles with `list_visual_dnas` / `get_visual_dna`.

**Server-side auto-routing:** passing `visual_dna_ids` is enough — the server expands the DNA's reference images and auto-routes the selected text-to-image model to its image-editing variant (e.g. `nano-banana-2` → `nano-banana-2-image-editing`). You do NOT need to also pass `reference_images` when using DNA. If the chosen model has no edit variant at all, the server falls back to using the DNA's images as style references on the t2i model. DNA payloads are never silently dropped.

## ⚠️ Pre-flight: Verify the Visual DNA Exists Before Using It (MANDATORY)

NEVER reference a Visual DNA by name, role, or assumed identity without first confirming it exists in the user's library. This is a frequent failure mode: the user mentions a character ("אסתר", "Maya", "the model from before"), the agent assumes a matching Visual DNA exists, calls `generate_image` / `generate_elements` with a guessed or fabricated `visual_dna_ids` value, and the generation fails or produces the wrong identity.

**Before** any generation call that uses `visual_dna_ids`:

1. Call `list_visual_dnas` to get the actual available DNAs (id + name).
2. Match the user's reference (by name, type, or your `.kolbo/production.md` log) to a real DNA in that list.
3. If there is **no match**, STOP and ask the user one of:
   - "I don't see a Visual DNA named <X> in your library. Do you want me to create one now (I'll need reference image(s)), use an existing DNA (<list>), or proceed without DNA using direct reference images?"
4. Only proceed once you have a real `vdna_*` id confirmed by either the list or a fresh `create_visual_dna` call you just made.

Do NOT:
- Invent a Visual DNA id or assume one exists from context.
- Use the same DNA id for a different character because "it sounded close."
- Carry a DNA id from `.kolbo/production.md` into a new generation without re-confirming it still exists (`list_visual_dnas` is cheap — call it).

When the user says "use the model אסתר" but you've only created a DNA for "זוהר", you MUST ask before generating — never silently substitute or guess.

## ⚠️ Don't re-fetch / re-list your own outputs (CRITICAL)

After a generation tool returns its URLs, those URLs are **already** in the canvas (the desktop app's gallery panel) and in `.kolbo/production.md`. Do **NOT** call `list_media`, `get_media`, `get_media_stats`, `list_visual_dnas`, or `chat_send_message` with `media_urls` on those URLs just to "verify" or "fetch thumbnails of the results":

- It burns credits and time for zero new information.
- Every such tool call streams partial output into the session, which forces the desktop canvas to re-evaluate (visible flicker on the gallery tiles).
- The thumbnails returned by `list_media` / `get_media` are the SAME asset you just generated.

**Only call list/get media tools when:**
- The user explicitly asks ("what do I have in my library?", "show me my old DNAs").
- You need details about something generated in an **earlier session** that you don't have a record of.
- You're chasing a specific user reference like "the rainy clip from yesterday" that isn't in the current chat's `.kolbo/production.md`.

For media you generated this session, you already know the prompt, model, and result URL — write that into `.kolbo/production.md` and reference it from context.

## ⚠️ Presenting list results — show thumbnails (MANDATORY)

When you display the result of `list_visual_dnas`, `list_media`, `list_moodboards`, or any other tool that returns items with image/thumbnail URLs, render each item's thumbnail as a markdown image so the user can actually see what they have. The chat view auto-renders both `![](url)` markdown and bare image URLs, plus auto-injects a player below links to videos/audio.

Do NOT dump a text-only bullet list of ids + names when a thumbnail field is available in the response.

**Visual DNA listing format:**
```
Visual DNAs (6):
1. **Maya** — `vdna_abc` (character)
   ![Maya](https://cdn.kolbo.ai/.../maya-thumb.jpg)
2. **Tokyo Neon** — `vdna_xyz` (style)
   ![Tokyo Neon](https://cdn.kolbo.ai/.../tokyo-thumb.jpg)
```

**Media listing format:**
```
1. **rain-loop.mp4** — `med_abc` (video, 5s, 1080p)
   https://cdn.kolbo.ai/.../rain-loop.mp4
2. **coffee-01.png** — `med_def` (image, 1024x1024)
   ![](https://cdn.kolbo.ai/.../coffee-01.png)
```

Fields to read for the image source (use the first one present on the item): `thumbnail`, `thumbnail_url`, `preview_url`, `url`, `image`. For videos and audio, use the file `url` directly.

## ⚠️ @name Syntax — ALWAYS use it when passing visual_dna_ids (MANDATORY)

Whenever a generation call passes `visual_dna_ids` (even just one), the prompt MUST refer to each Visual DNA by `@<exact-name>` — the literal `name` field as it was set in `create_visual_dna` and as it appears in `list_visual_dnas`. This is how the engine binds the DNA to a role in the scene. Without `@name`, the engine guesses, drops the DNA, or blends multiple DNAs together.

**Use the actual stored name, programmatically.** When you call `list_visual_dnas` (or `create_visual_dna`), read the `name` field off the response and use that exact string after the `@`. Do NOT:

- Translate the name into another language ("אסתר" / "esther" / "אסתי" — pick whichever string is in `name` and use ONLY that one).
- Invent a friendlier alias ("the model", "המודל", "her").
- Write the character's name in plain text without the `@` prefix.
- Drop the `@name` when only one DNA is passed — the engine still needs the binding so it knows the DNA is the *subject* and not a passive style.

**Wrong** (DNA `name` is `esther_model`, user wrote prompt in Hebrew):
```
prompt: "אסתר לובשת שרשרת זהב, פורטרט חצי גוף"
visual_dna_ids: ["vdna_abc"]
```
The engine sees plain text "אסתר" and has no idea it should bind to the DNA.

**Right:**
```
prompt: "@esther_model לובשת שרשרת זהב, פורטרט חצי גוף"
visual_dna_ids: ["vdna_abc"]   // esther_model
```

**Multi-DNA example:**
```
prompt: "@dana standing in @shop, picking up a product"
visual_dna_ids: ["vdna_abc",  // dana
                 "vdna_xyz"]  // shop
```

**How `@name` actually binds:** kolbo-api parses the prompt for `@<name>` mentions, queries the DB for a Visual DNA whose `name` matches (case-insensitive), and **replaces the `@name` token with that DNA's stored `systemPrompt`**. If no `@name` is in the prompt, the systemPrompt never gets injected — the `visual_dna_ids` slot is effectively wasted.

The match is **literal and case-insensitive**, so:
- The `@name` must equal the stored `name` field (e.g. if `name: "esther_model"` → write `@esther_model`, not `@Esther`, not `@אסתר`, not `@the model`).
- Any-language characters are supported — if the DNA was created with `name: "אסתר"` you write `@אסתר`. Use the EXACT stored string.
- Mentions terminate at punctuation (`.,!?`), double-spaces, another `@`, or end of string. So `@maya, wearing...` matches `maya`.

This composes with `@image1` / `@image2` positional tags for plain reference/source images — see "Reference Tagging" below.

### ⚠️ Naming rule for `create_visual_dna` — NO SPACES (MANDATORY)

The `name` you set MUST be a **single token, lowercase, no spaces, ASCII-safe** — `esther_model`, `dana`, `tokyo_neon`, `brand_red`. Never `Sarah Johnson`, never `the red dress`.

Reason: the prompt parser stops the `@<token>` match at the first space (and at `.,!?` punctuation). So `@Sarah Johnson` matches *only* `Sarah` — if no DNA named `Sarah` exists, the mention is silently dropped and the DNA never binds. A single-token name is the only way to guarantee inline `@name` works in any sentence, in any language, without forcing the user to write awkward punctuation around it.

Use underscores for multi-word concepts (`old_town`, not `Old Town`). When the user proposes a name with spaces, accept the intent but collapse it into a single token before storing (`"Sarah Johnson"` → `sarah_johnson`) and tell them once how you'll refer to it. Source of truth: [kolbo-docs / Visual DNA & @ References](https://docs.kolbo.ai/kolbo-code/visual-dna).

## Reference Tagging — `@image1` / `@video1` / `@Audio1`

When a generation call passes ANY references (`reference_images`, `source_images`, `reference_videos`, `source_videos`, `reference_audio`, `elements`, OR `visual_dna_ids`), name them inside the prompt so the model knows **which asset plays which role**. Without tags, the engine guesses and the wrong reference bleeds into the wrong slot.

**Tag namespaces, used together:**

| Tag | Refers to | Order rule |
|---|---|---|
| `@image1`, `@image2`, … | Plain images in `reference_images` / `source_images` | Position in the array — `@image1` = `images[0]` |
| `@video1`, `@video2`, … | Videos in `reference_videos` / `source_videos` / video `elements` slots | Position in the array |
| `@Audio1`, `@Audio2`, … | Audio in `reference_audio` / `audio` slots (lipsync source, music style ref, voice clone, etc.) | Position in the array |
| `@<dna-name>` | A Visual DNA — use the literal `name` field | Name-based, never positional |

**Reserved**: `@Image\d+`, `@Video\d+`, `@Audio\d+` are reserved by the Kinovi Omni Reference parser — they are NOT looked up as Visual DNAs. Never name a Visual DNA `Image1` / `Video2` / etc. (kolbo-api rejects this on creation).

**How to write a tagged prompt:**

```
Place @maya at the coffee-shop counter from @image1, wearing the leather jacket from @image2.
Keep the warm window light from @image1; ignore the people in the background of @image2.
```

```
Animate @maya walking through @video1's snowy street, matching the camera move of @video1; ignore the people in @video1.
```

```
Lipsync @video1's speaker to the dialogue track @Audio1, keeping the original ambient room tone of @video1.
```

**Rules:**

1. **Order is contract.** `@imageN` / `@videoN` / `@AudioN` are bound to position N in the array you pass. Reordering silently changes what each tag points to — don't reorder mid-conversation; if you need to add a new ref, append it rather than inserting.
2. **For edits, the source is `@image1` (or `@video1`).** In `generate_image_edit`, the first entry of `source_images` is the canonical base.
3. **Visual DNA tags are name-based, not positional.** `@maya` always means the DNA you registered as `name: "maya"`, regardless of where its id sits in `visual_dna_ids`.
4. **Tag every reference you actually pass.** If you pass a reference but never mention it in the prompt, the engine often treats it as decorative — either drop it or name it explicitly.
5. **Tags carry across the production log.** When you log a generation to `.kolbo/production.md`, write the prompt with the tags intact and record the `@name → URL` / `@name → vdna_id` binding alongside.
6. **Tag even single-reference calls when a DNA, video, or audio is involved.** Single plain image with no DNA can use prose ("this image"), but as soon as the call also carries a DNA, a video ref, or an audio ref, tag every asset so the engine knows the subject vs. the modifier role.

**Failure modes the tags fix:**

| Without tags | With tags |
|---|---|
| "Combine these two images" → engine averages them | "Put the subject from @image1 into the scene of @image2" |
| "Same character, new outfit" with 2 refs → wrong face | "Keep @maya's face from the Visual DNA; apply the outfit from @image1" |
| "Edit this" with 3 source images → engine edits whichever is first | "In @image1, replace the sky with the sky from @image2" |
| "Lipsync this video to this audio" with 2 audio tracks → wrong track picked | "Lipsync @video1 to @Audio1; ignore @Audio2 (that's the music bed)" |
| "Match this video's style" with 2 video refs → blended motion | "Use @video1's camera move; use @video2's color grade" |
| "Music like this" with a reference track → engine ignores it | "Compose in the style of @Audio1, but slower and without vocals" |

## Mixing References, Visual DNAs, and Moodboards

You can combine all three reference types in a single call — they're additive, not exclusive. The system blends them; the model uses whichever it can interpret best for the prompt.

| Tool | `source_images` | `reference_images` | `visual_dna_ids` | `moodboard_id` |
|---|:-:|:-:|:-:|:-:|
| `generate_image` | — | ✅ | ✅ | ✅ |
| `generate_image_edit` | ✅ required | — (source_images plays this role) | ✅ | ✅ |
| `generate_creative_director` | — | ✅ (applied to every scene) | ✅ (locks character across scenes) | ✅ / `moodboard_ids` |
| `generate_elements` (video) | — | ✅ (also `reference_videos`, `audio_url`) | ✅ | — |

**Practical combinations:**
- *"Make her in a Tokyo street, matching this mood board, with the same face as Visual DNA Maya"* → `generate_image` with `visual_dna_ids=[maya], moodboard_id=tokyo_neon`. No `reference_images` needed.
- *"Same character, but place her like in this composition"* → `generate_image` with `visual_dna_ids=[maya], reference_images=[layout.png]`. The DNA owns the *face*; the reference owns the *pose/composition*.
- *"Edit this photo to give her the leather-jacket look from Visual DNA Maya"* → `generate_image_edit` with `source_images=[photo.png], visual_dna_ids=[maya]`. Source is what's edited; the DNA injects the wardrobe identity.
- *"4 angles of this character, brand-styled"* → `generate_creative_director` with `scene_count=4, visual_dna_ids=[maya], moodboard_id=brand_x`. DNA keeps the face; moodboard sets the look.
- *"Generate 6 product hero shots; here are 3 reference comp images and our brand moodboard"* → `generate_creative_director` with `scene_count=6, reference_images=[comp1, comp2, comp3], moodboard_id=brand_x`. No DNA needed if it's a product not a face.

**Rule of thumb:**
- Need an **identity** (face, character, specific product) to stay constant → `visual_dna_ids`.
- Need a **composition / pose / mood reference** → `reference_images`.
- Need an **overall style / palette / brand look** → `moodboard_id`.
- Need all three at once → pass all three. They compose.

## Visual DNA Limits

Read `max_visual_dna` from `list_models` for the exact cap, AND `supports_visual_dna` for the on/off boolean. A model can support DNA without an explicit cap, or have a non-null cap but silently ignore DNA on certain paths (e.g. `generate_video`). Typical ranges: image models (non-Kling) up to **8**, Kling image models **3**, Elements video models **3–5**, everything else up to **3**.

## ⚠️ Visual DNA Creation — Always Generate Reference Images First (MANDATORY)

**Before calling `create_visual_dna` for a character**, always generate 2 reference images first and include them alongside any user-provided images. These give the Visual DNA engine multi-angle coverage and dramatically improve consistency.

**Step 1 — Generate both images in parallel (one `generate_image` call each, fire simultaneously):**

1. **4-angle character sheet** — prompt: `"[character description], character reference sheet showing front view, back view, left side view, right side view, four panels arranged in a 2x2 grid, neutral solid background, full body, photorealistic"`, aspect ratio `16:9`
2. **Close-up portrait** — prompt: `"[character description], close-up portrait, face and shoulders, neutral solid background, soft studio lighting, photorealistic"`, aspect ratio `1:1`

**Step 2 — Call `create_visual_dna`** with:
- `images`: the 4-angle sheet URL first, then the close-up URL — **plus** the user's reference photo(s) only if they provided one (i.e. a real person or existing character they want to match). If they gave no reference image, the 2 generated images alone are sufficient.
- `type`: `"character"`
- `name`: single-token lowercase descriptive name (see naming rule above)

**Why:** A single reference photo only shows one angle. The close-up gives the engine facial detail; the 4-angle sheet gives it body geometry and pose range. Together they produce far more consistent generations.

**Skip this only if** the user explicitly says "just use my image as-is" or provides 3+ reference images already covering multiple angles.

## When to Use

- User wants the same character across multiple **images** or a campaign → `generate_image` / `generate_creative_director` with `visual_dna_ids`
- User wants to animate a character in video using **elements models** (Seedance 2, Kling O3 Reference, Grok Imagine, Veo 3.1, etc.) → `generate_elements` with `visual_dna_ids`
- User wants a consistent brand style across a campaign → `generate_creative_director` with `visual_dna_ids`
- User references "keep the same look", "same character", or "use that character"
- User provides reference photos of a person/product to maintain consistency
- User asks to put a character in a specific environment or scene → create both a character Visual DNA and an environment Visual DNA, use `@name` syntax to place them

## ⚠️ When NOT to Use Visual DNA

- **Animating an image** → `generate_video_from_image`; the source image IS the reference, don't add `visual_dna_ids`.
- **Video DNA support is limited to `generate_elements`** (Seedance 2, Kling O3 Reference, Grok Imagine). `generate_video`, `generate_video_from_image`, and `generate_first_last_frame` all ignore `visual_dna_ids` — for character-consistent video, route through `generate_elements`.
