# Marketplace Cards — Amazon / Shopify / eBay Listings

Load this file when the user wants **marketplace listing visuals** — main image, secondary product images, infographics, or A+ content modules for Amazon, Shopify, eBay, Etsy, Walmart, or similar.

For generic brand product photography (Pinterest, hero banner, lifestyle, ad pack) see `workflows/product-photoshoot.md`. For ad video see `workflows/marketing-studio.md`. For composed DTC ads see `workflows/dtc-ads.md`.

## What This Is

Marketplace listings need a **specific, compliance-aware visual system** that's different from brand campaign imagery:

- **Main image** — strict marketplace rules (typically pure white background, product fills 85% of frame, no text, no props, no shadows). This is the conversion-critical thumbnail.
- **Secondary product images** — multi-angle, detail shots, lifestyle, "what's in the box". Show the product from every angle a shopper needs before clicking buy.
- **A+ content / Enhanced Brand Content (Amazon)** — long-form modules below the fold: hero banner, pain-point grid, feature comparison, ingredients breakdown, efficacy proof, how-to-use steps, brand endorsement / founder story.

## The 4 Bundle Scopes

When the user asks for a common bundle, fire one call per scope:

| Scope | Creates |
|---|---|
| `main` | 1 marketplace main image |
| `product-images` | main image + 5 secondary images |
| `aplus` | main image + 7 A+ content modules |
| `full-set` | main image + 5 secondary + 7 A+ modules (13 assets total) |

Use a **custom subset** of the asset list below when the user wants a non-standard combination (e.g. "just main + infographic + lifestyle").

## The 13 Asset Types

| Asset | Purpose | Aspect ratio | Model preference |
|---|---|---|---|
| `main_image` | Marketplace thumbnail — strict compliance: pure white bg, product fills 85% of frame, no text, no props | `1:1` | Nano Banana 2 (clean studio render) |
| `infographic` | Feature callouts with text labels and product hero | `1:1` or `4:5` | **GPT Image 2** (dense on-image text) |
| `multi_angle` | 4-up grid showing front / back / sides of product | `1:1` | Nano Banana 2 |
| `detail_shot` | Macro shot of texture / material / mechanism | `1:1` | Nano Banana 2 |
| `lifestyle` | Product in use in real environment | `1:1` or `4:5` | Nano Banana 2 |
| `whats_in_box` | Flat-lay showing the product + accessories laid out neatly | `1:1` | Nano Banana 2 |
| `aplus_hero_banner` | Wide A+ header — brand identity hit | `3:1` | GPT Image 2 |
| `aplus_pain_points` | 3-up grid showing the problem this product solves | `16:9` | GPT Image 2 (text) |
| `aplus_features` | 3-up or 4-up feature breakdown with labels | `16:9` | GPT Image 2 |
| `aplus_ingredients` | Ingredients / materials breakdown (skincare, food, supplements) | `16:9` | GPT Image 2 |
| `aplus_efficacy` | Before/after, % stats, clinical results — proof block | `16:9` | GPT Image 2 (charts + text) |
| `aplus_how_to_use` | Numbered step-by-step usage instructions | `16:9` | GPT Image 2 |
| `aplus_endorsement` | Founder story, brand mission, testimonial-style | `16:9` | Nano Banana 2 (people) + GPT Image 2 (text overlay) |

## Kolbo MCP Routing

For **bundles** (`product-images`, `aplus`, `full-set`): use `generate_creative_director` with `scene_count` = number of assets in the bundle. Pass the product image as `reference_images[0]` so it appears consistently across every asset. Each scene's prompt encodes one asset type.

For **single `main` image** or **custom subset** of ≤ 2 assets: `generate_image` per asset, fired in parallel (single response, multiple tool calls).

For **multi-angle** specifically: this is one image with a 4-up grid composition — use `generate_image` with a prompt describing the 2×2 layout, NOT `generate_creative_director`. (Or alternatively, fire 4 separate `generate_image` calls and composite the grid yourself — depends on user preference.)

**Always pass the product photo** as `reference_images` for every call. `@image1` references it in the prompt. If the user gave a URL instead of a photo, run `workflows/research-first.md` first.

## Main Image Compliance Rules (HARD)

Different marketplaces have different rules. The **strictest is Amazon's**, which most other marketplaces follow:

1. **Pure white background** (`#FFFFFF`, no gradients, no shadow tone).
2. **Product fills ≥ 85% of the frame** — minimal margin.
3. **NO text** — no logos baked in, no callouts, no "NEW" stickers, no watermarks.
4. **NO props** — just the product. No hands, no models, no styling pieces.
5. **NO multiple products** — single hero (variant grids go in secondary, not main).
6. **NO color borders / decorative frames**.

Bake these into every `main_image` prompt as explicit prohibitions:

```
Pure white background (#FFFFFF), seamless studio sweep.
Product (@image1) centered, fills 85% of frame.
Tack-sharp focus, no shadows on background, soft contact shadow only.
NO text, NO logos, NO captions, NO props, NO models, NO decorative borders.
Photographic, catalog-grade, neutral color.
```

## Secondary Image Strategy

5-image standard set (when the user says `product-images` scope):

1. **Lifestyle** — product in use, real environment
2. **Detail / texture** — macro of the key material or feature
3. **Multi-angle** — 4-up showing all sides
4. **What's-in-the-box** — flat-lay of components
5. **Scale / size reference** — product next to a hand or known-size object

Adjust based on category: skincare needs ingredients close-up + texture-on-skin; apparel needs front + back + on-model + detail + size chart; electronics needs ports/buttons close-up + size comparison.

## A+ Content Strategy

A+ modules tell a story below the fold. Standard 7-module flow:

1. `aplus_hero_banner` — brand identity / aspirational hero
2. `aplus_pain_points` — what problem we solve
3. `aplus_features` — how we solve it (3–4 differentiators)
4. `aplus_ingredients` (skincare/food/supplements) OR materials/specs (electronics/apparel)
5. `aplus_efficacy` — proof (before/after, % stats, third-party data)
6. `aplus_how_to_use` — usage steps
7. `aplus_endorsement` — founder story / mission / testimonial

For dense-text modules (`aplus_features`, `aplus_pain_points`, `aplus_efficacy`, `aplus_how_to_use`): always recommend **GPT Image 2** at `resolution: "2K"` or `"4K"` (text needs the higher tier to stay sharp).

## Brand Kit Reuse

Check `.kolbo/brand-kits/<slug>.md` before generating. Pull `primary_color`, `accent_color`, `text_color`, `bg_color`, `fonts`. Bake into every A+ module prompt — marketplace pages live or die on visual consistency across the 13 assets.

## Pre-Generation Interview

Ask 2–3 short labeled questions before firing:

1. **Which marketplace?** `[Amazon US / Amazon EU / Shopify / Etsy / eBay / Walmart / Other]` — affects compliance rules
2. **Which bundle?** `[main / product-images / aplus / full-set / custom subset]`
3. **Brand kit?** Auto-detect from `.kolbo/brand-kits/<slug>.md`; otherwise ask if brand colors / fonts should be applied

Skip questions whose answer is obvious from the request.

## Output Discipline

- For bundles: `generate_creative_director` returns N URLs. Present them in chat as a numbered list, one URL per line, with the asset name as label:
  ```
  Marketplace cards ready:
  1. Main image: https://...
  2. Lifestyle: https://...
  3. Detail shot: https://...
  ...
  ```
  Do NOT wrap them in an HTML grid artifact — the canvas already shows the gallery.
- Log all URLs to `.kolbo/production.md` under `## Production: <product name>` → `### Marketplace Cards` subsection.
- If a `main_image` came back with text / props (compliance failure), surface the issue and re-fire with stronger prompt prohibitions — don't ship a non-compliant main image.

## Existing Main-Image Reuse

If the user already has an approved `main_image` from a prior session and wants to generate only secondary / A+ assets that match it:

1. Look up the main image URL from `.kolbo/production.md`.
2. Pass it as `reference_images[0]` (in addition to the product photo) so the new assets match the main's exact rendering style — same lighting, same color cast, same product orientation.
3. Tag it as `@image2` in the prompt: "Match the product rendering from `@image2` exactly — same angle, same lighting, same color cast."

## UX Rules

1. **Always ask which marketplace** — compliance rules vary.
2. **Strict compliance prompts on main_image** — explicit NO text / NO props / NO models / NO borders.
3. **Always reuse brand kit** — Read `.kolbo/brand-kits/<slug>.md` first; pass palette + fonts to every A+ module.
4. **Recommend GPT Image 2 + 2K/4K for dense-text A+ modules** — Nano Banana renders text well but GPT Image 2 wins at multi-line technical layouts.
5. **For bundles, always use `generate_creative_director`** — never fire 13 parallel `generate_image` calls.
6. **Log everything to `.kolbo/production.md`** — marketplace listings get updated quarterly; reuse beats regenerate.
