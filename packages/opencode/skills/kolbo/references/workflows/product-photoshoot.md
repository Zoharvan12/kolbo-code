# Product Photoshoot — Brand Product Imagery

Load this file when the user wants **brand-quality product images** — studio shots, lifestyle scenes, Pinterest pins, hero banners, social carousels, ad packs, virtual try-ons, conceptual / CGI product shots, or seasonal restyles.

For ad **video** see `workflows/marketing-studio.md`. For composed brand ads (brand kit + ad format + avatar) see `workflows/dtc-ads.md`. For marketplace listings (Amazon main + secondary + A+ content) see `workflows/marketplace-cards.md`.

## The 10 Modes

Pick by intent, not surface keyword. When two modes could apply, prefer the more specific one.

| Mode | When user wants… |
|---|---|
| `product_shot` | Product on neutral / studio / catalog background (Shopify, white-bg) |
| `lifestyle_scene` | Product in a real environment — hands, action, atmosphere (kitchen, gym, outdoor) |
| `closeup_product_with_person` | Tight crop with hands or partial face — beauty application, demonstrating, holding |
| `moodboard_pin` | Vertical 2:3 Pinterest-native pin, moodboard feel |
| `hero_banner` | Wide-format website / email / campaign header |
| `social_carousel` | 3–10 connected slides for IG / LinkedIn / Facebook |
| `ad_creative_pack` | Coordinated pack of static ad variants for Meta / TikTok / Pinterest / Google Ads |
| `virtual_model_tryout` | Product worn or used by an AI-rendered model (fashion, accessories) |
| `conceptual_product` | Surreal / CGI / levitating / splash / sculptural product |
| `restyle` | Transform an EXISTING image's aesthetic, mood, or seasonal context (without changing the subject) |

### Picking the Mode

| User phrasing | Mode |
|---|---|
| neutral / clean / white / studio / catalog / Shopify | `product_shot` |
| scene / in use / kitchen / outdoor / cafe / gym | `lifestyle_scene` |
| hands holding / face with product / beauty application / demonstrating | `closeup_product_with_person` |
| Pinterest / pin / vertical pin | `moodboard_pin` |
| hero / banner / website header / landing page / email header / wide format | `hero_banner` |
| carousel / slide post / multi-slide / swipeable | `social_carousel` |
| ads / ad pack / paid social / Meta / TikTok / Pinterest ads / Google ads | `ad_creative_pack` |
| model wearing / virtual try-on / on body / fashion shoot / lookbook | `virtual_model_tryout` |
| levitating / floating / splash / frozen motion / surreal / CGI / sculptural | `conceptual_product` |
| modify EXISTING image's aesthetic / mood / season — without changing subject | `restyle` |

**Tie-breakers:**
- "Pinterest pin of my product on a kitchen counter" → `moodboard_pin` (Pinterest is the platform)
- "Hero banner showing my product in use" → `hero_banner` (banner format wins)
- "Carousel of my product in different scenes" → `social_carousel` (multi-slide wins)
- "Closeup of person applying my serum" → `closeup_product_with_person` (specific genre wins)

## Mode → Kolbo MCP Routing

The mode determines which Kolbo MCP tool to call and what defaults to use.

| Mode | Primary tool | Model preference | aspect_ratio | Count default |
|---|---|---|---|---|
| `product_shot` | `generate_image` | GPT Image 2 (clean studio look + dense label text) | `1:1` | 1 or `num_images: 3` for variants |
| `lifestyle_scene` | `generate_image` | Nano Banana 2 (best lifestyle realism) | `1:1` or `4:5` | 1 or `num_images: 3` |
| `closeup_product_with_person` | `generate_image` | Nano Banana 2 | `1:1` or `4:5` | 1 |
| `moodboard_pin` | `generate_image` | Nano Banana 2 | **`2:3`** (Pinterest native) | 1 or `num_images: 3` |
| `hero_banner` | `generate_image` | GPT Image 2 (large format + brand text) | `16:9` or `3:1` | 1 |
| `social_carousel` | **`generate_creative_director`** with `scene_count: 3–10` | Nano Banana 2 | `1:1` (IG) or `4:5` | `scene_count` |
| `ad_creative_pack` | **`generate_creative_director`** with `scene_count: 4–8` | GPT Image 2 or Nano Banana 2 | Mixed per ad placement (`1:1`, `9:16`, `1.91:1`) — fire one director call per aspect | `scene_count` |
| `virtual_model_tryout` | `generate_image_edit` with character Visual DNA + product source | Nano Banana Pro (identity-sensitive edits) | `1:1`, `4:5`, or `9:16` | 1–3 |
| `conceptual_product` | `generate_image` | Nano Banana 2 or GPT Image 2 | `1:1` or `2:3` | 1–4 |
| `restyle` | `generate_image_edit` with `source_images: [existing]` | Same model that produced the original (or Nano Banana 2 for safe re-render) | Inherit from source | 1–3 |

**For multi-output modes** (`social_carousel`, `ad_creative_pack`), always use `generate_creative_director` — never fire ≥2 `generate_image` calls in a loop. See `models/creative-director.md`.

**Always validate** `aspect_ratio` and `resolution` against the chosen model's `supported_aspect_ratios` / `supported_resolutions` via `list_models` — see SKILL.md "Resolution / Aspect / Duration — validate against caps".

## Pre-Generation Interview (CRITICAL)

Ask **at most 4 short questions** before submitting, always with **labeled options, never open-ended**. Skip a question whose answer is obvious from context (uploaded image, prior turn, brand memory in `.kolbo/brand-kits/`).

Pick the question stack based on user state:

### Type A — Uploaded a product photo, said "make me images / photoshoots"

1. **How many?** `[1 / 3 / 5]`
2. **What style/mood?** `[Clean studio / Lifestyle / Conceptual / With a model / Other]`
3. **Where will you use them?** `[Shopify / Instagram / Pinterest / Paid ads / Website hero]`
4. **Brand colors to match?** (skip if a brand kit exists at `.kolbo/brand-kits/<slug>.md`)

### Type B — Uploaded a product photo + named a use case

E.g. "make ads for my product", "make a Pinterest pin", "make a hero banner". Mode is obvious. Ask only the gaps:

1. **How many?** (only if multi-output mode)
2. **What's the offer / mood / hook?**
3. **Anything in particular to emphasize?**

### Type C — Text only, no product photo

1. **Can you upload a product photo?** (preferred — much higher fidelity)
2. **If not, describe the product** — category, packaging, color, distinctive features
3. **What style?** `[Clean studio / Lifestyle / Conceptual / With a model / Other]`
4. **Where will you use it?** `[Shopify / Instagram / Pinterest / Paid ads / Website hero]`

### Type D — Uploaded existing image, "redo / change vibe / different version"

→ Mode: `restyle`

1. **What aesthetic?** `[Clean girl / Cottagecore / Quiet luxury / Dark academia / Y2K / Other]`
2. **Seasonal context?** `[Christmas / Valentine's / Halloween / Black Friday / None]`
3. **What to preserve, what to change?** (only if ambiguous)

### Type E — Model wearing a product (fashion, accessories)

→ Mode: `virtual_model_tryout`

1. **Model archetype?** (suggest 2–3 based on brand audience — don't open-end)
2. **Environment?** `[Studio clean / Outdoor natural / Street style / Editorial / Home cozy]`
3. **Framing?** `[Full body / Three-quarter / Waist up / Closeup on product area]`

### Type F — Vague request, unclear subject

E.g. "make me something cool for my brand".

1. **What product or topic?**
2. **Goal?** `[Sell on a marketplace / Build awareness / Run paid ads / Update website]`
3. **Upload a reference image?**

After answers → return to the relevant Type A–E.

## Brand Kit Integration

Before any generation, check if `.kolbo/brand-kits/<slug>.md` exists for the brand:

- **Exists** → Read it. Pull `primary_color`, `accent_color`, `fonts`, `logo_url`. Bake hex codes + named fonts into the prompt. Pass the logo as `reference_images[0]` if relevant.
- **Doesn't exist** but user gave a brand URL → Run `workflows/research-first.md` first to build one.
- **Doesn't exist** and user gave no URL → Proceed without; ask in Type A's question 4 if relevant.

## Multi-Variant Strategy

For `count > 1` on a single-output mode (`product_shot`, `lifestyle_scene`, `closeup_product_with_person`, `moodboard_pin`, `hero_banner`, `conceptual_product`):

- Use `num_images: N` on `generate_image` — same prompt, different seeds, fast.
- Variations come from the model's randomness, not intentional direction.

For `social_carousel` / `ad_creative_pack` (multi-output by design):

- Use `generate_creative_director` with `scene_count: N`.
- Each scene gets its **own intentional prompt** (different angle / framing / mood / palette) — not paraphrased copies of one scene.
- Pass the same `visual_dna_ids` and `reference_images` across all scenes to lock product identity.

## Output Discipline

- Call the chosen MCP tool — single command, no preamble.
- For multi-output: `generate_creative_director` returns N URLs; share them as individual lines (do NOT build an HTML grid artifact — the canvas already shows the gallery).
- For single-output: one image URL.
- Log every URL + model + resolution + mode into `.kolbo/production.md` under `### <Mode>` subsection.

## UX Rules

1. **Pick the mode by intent**, not surface keyword. The user saying "Pinterest" → `moodboard_pin` regardless of what's IN the image.
2. **Ask at most 4 labeled-option questions** before generating. Skip any question whose answer is obvious.
3. **Always confirm aspect ratio + resolution + count** before firing — they materially change output and cost.
4. **Reuse brand kits** — Read `.kolbo/brand-kits/<slug>.md` before generating.
5. **Strict NO uninvited additions** — "NO captions, NO subtitles, NO watermarks, NO extra text beyond what's specified" in every prompt.
6. **No auto-retry on failure** — surface and let the user adjust.

## Prompt Template Seeds

### `product_shot`
```
Clean studio product photograph of @image1 (the product),
centered on a {neutral white | seamless gradient | catalog beige} background.
Soft front-fill + subtle rim light, no harsh shadows, no reflections.
Tack-sharp focus on the product, slight depth-of-field falloff on the background.
{Brand palette: primary #..., accent #...}
NO captions, NO watermarks, NO extra text.
```

### `lifestyle_scene`
```
@image1 (the product) in a {real-world scene description},
natural {time-of-day} light, {natural action involving the product}.
Photographic, editorial style, {iPhone | 35mm film | medium format} feel.
{Optional: include hands, partial face — never identifiable people}.
{Brand palette baked into props/clothing}.
NO captions, NO watermarks.
```

### `moodboard_pin`
```
Vertical 2:3 Pinterest pin, moodboard aesthetic.
@image1 (the product) integrated into a {seasonal/aesthetic theme} flatlay or scene.
{Aesthetic anchor: cottagecore / quiet luxury / Y2K / clean girl / dark academia}.
Soft natural light, low-saturation editorial palette,
optional textural overlay (paper, linen, marble).
Centered hero composition, generous negative space at top for pin overlay.
NO captions, NO text.
```

### `restyle`
```
@image1 — preserve {subject / composition / camera angle / framing} exactly.
Change ONLY the {aesthetic / season / mood} to {target aesthetic description}.
Keep product geometry, label legibility, and identifying details unchanged.
{Specific change list, e.g.: "swap warm tones for cool blue/silver, add subtle snowflake bokeh,
shift wood prop to ceramic, keep everything else identical"}.
```

(More seeds belong here as we learn from real Kolbo generations — append, don't replace.)
