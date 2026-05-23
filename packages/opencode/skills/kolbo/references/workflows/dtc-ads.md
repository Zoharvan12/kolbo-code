# DTC Ads — Composed Brand Image Workflow

Load this file when the user wants a **DTC ad image** composed from brand identity + ad format + optional avatar/product/reference media. For ad **video** see `workflows/marketing-studio.md`. For brand **product imagery** (Pinterest pin, hero banner, ad pack) see `workflows/product-photoshoot.md`. For marketplace listings see `workflows/marketplace-cards.md`.

## What This Is

A DTC ad is built from **5 composable blocks**:

1. **Ad format** — the structural template (headline-driven, bullet-points, us-vs-them, before-after, founder-statement, etc.). Defines the layout shape.
2. **Brand kit** *(optional)* — palette, fonts, logo, tone, voice. Keeps every ad in a campaign visually consistent.
3. **Avatar** *(optional)* — a presenter face (curated character or trained Visual DNA). Use when the brand has a specific founder, model, or recurring presenter.
4. **Product** *(optional)* — the item being sold. One product image, or a product brief from a URL.
5. **Reference media** *(optional)* — up to ~14 reference images to anchor style / composition / setting.

You don't need all 5. The minimum is: a **prompt** + an **ad format**. Everything else is opt-in based on what the user provides.

## End-to-End Flow

```
1. Pick an ad format     → ask user (labeled options, never auto-pick)
2. Pick / build brand kit → workflows/research-first.md persists to .kolbo/brand-kits/<slug>.md
3. Attach avatar          → workflows/visual-dna.md ("character" type DNA)
4. Attach product         → upload_media → reference_images
5. Attach reference media → upload_media → reference_images (up to ~14 total)
6. Generate               → generate_creative_director (multi-variant) or generate_image (single)
7. Deliver                → image URLs + brief one-line summary
```

## Ad Format — Always Ask Explicitly

Picking an ad format is **mandatory and creative** — don't auto-pick from the user's phrasing. The catalogue is small and the choice changes the layout shape dramatically. Always present labeled options:

| Format type | Examples |
|---|---|
| **Headline-driven** | Big hero phrase + small product. "Hero word" style. |
| **Bullet points** | 3–5 benefit bullets + product hero. SaaS / DTC standard. |
| **Us vs Them** | Side-by-side comparison column. Competitor takedown style. |
| **Before / After** | Split frame showing transformation. Great for skincare, fitness, home. |
| **Founder statement** | Founder portrait + quote + product. Trust-builder. |
| **Lifestyle hero** | Product in-use in an aspirational scene. No copy hero. |
| **Pure product** | Clean studio product shot with brand framing. |
| **Testimonial** | Customer quote + face + product. Social proof. |
| **Pattern interrupt** | Bold color block / typographic shock / surreal composition. Scroll-stopper. |

When the user says "make me an ad" without naming a format, offer 3 of these in a labeled question (don't dump all 9). Pick the 3 that best fit the product / brand / phase the user mentioned.

## Brand Kit Reuse

If `.kolbo/brand-kits/<slug>.md` exists for the brand (see `workflows/research-first.md`), **Read it first** and pull `primary_color`, `accent_color`, `text_color`, `bg_color`, `fonts`, `tone`, `target_user`, `logo_url`. Bake these into the prompt:

- Exact hex codes for every color (`#FF4D2E` not "orange")
- Named fonts (`Inter Bold for headline, Inter Regular for body`)
- Tone descriptors from `### Voice & Audience`
- Logo as `reference_images[0]` with `@image1` reference in the prompt ("place logo from `@image1` top-left at 8% width, no recolor")

If no brand kit exists and the user gives a brand URL, run `workflows/research-first.md` to build one. Then come back here.

## Avatar Workflow

For ads featuring a specific presenter (founder, recurring model, character):

1. **Check if a Visual DNA exists** — `list_visual_dnas`. Match by name or recent use.
2. **If yes** — pass `visual_dna_ids: ["<id>"]` and reference as `@<dna-name>` in the prompt.
3. **If no** and the user wants a specific person — create one per `workflows/visual-dna.md` (always generate 2 reference images first; lock single-token lowercase name).
4. **If no** and the brief doesn't need a specific face — skip the avatar entirely; the model will synthesize a plausible presenter.

## Product Workflow

For ads featuring a specific product:

| User provides | Do |
|---|---|
| **Product photo** (local file or URL) | `upload_media({ source })` → tag as `@image1` in prompt → log to `.kolbo/production.md` under `### Products` |
| **Product URL only** (no photo) | Run `workflows/research-first.md` first to scrape hero images + brand palette; re-host via `upload_media` → use Kolbo CDN URL |
| **Multiple angles** | Upload all in parallel (one `upload_media` call each) → pass all in `reference_images` → tag `@image1`, `@image2`, … per `workflows/visual-dna.md` reference-tagging rules |
| **Nothing — text only** | Ask once: "Do you have a product photo? It dramatically improves fidelity." If they say no, proceed text-only but warn quality may be lower |

**Always log products in `.kolbo/production.md`** so subsequent ads in the same workspace reuse the same CDN URL without re-uploading.

## Reference Media Cap

Up to **~14 reference images per call**. Higher = the model gets confused about which reference plays which role. Use **`@image1` / `@image2` / …** tags to bind each reference to a role:

```
Headline ad with @maya (the founder) holding @image1 (the product),
shot in the style of @image2 (lifestyle reference).
Match the palette from the brand kit (#FF4D2E primary, #1A1A1A text).
```

See `workflows/visual-dna.md` for the full tagging system.

## Generate

**Pick the right Kolbo MCP tool based on output count:**

- **Single ad image** → `generate_image` with `model: "<from list_models>"`. Use Nano Banana 2 for character/lifestyle, GPT Image 2 for layouts with dense on-image text or infographics, Nano Banana Pro for hero/brand-final assets.
- **Multi-variant set** (3–8 variants of the same ad concept with different palettes / angles / hooks) → `generate_creative_director` with `scene_count`. The director plans each variant's prompt internally.
- **Identical prompt, just different seeds** (rare for ads — usually you want varied direction) → `generate_image` with `num_images: 1–4`.

## Output Settings — Always Confirm

These materially change output and cost. Ask once, labeled options, before firing:

| Setting | Common options for ads |
|---|---|
| `aspect_ratio` | `1:1` (IG feed) / `9:16` (Reels / TikTok / Stories) / `4:5` (IG portrait) / `16:9` (YouTube, banners) / `1.91:1` (Facebook feed) |
| `resolution` | `1K` (drafts, fast iteration) / `2K` (standard delivery) / `4K` (hero / print) |
| Quantity | `1` (test) / `3–4` (variant exploration) / `8` (full ad pack via Creative Director) |

Default-to-cheapest when the user hasn't expressed a quality intent and the difference is ≤ 2× cost.

## Failure Handling

- **Content-policy refusal** → don't retry the same prompt. Suggest less-explicit phrasing or a different product framing.
- **Brand asset not loading** (logo URL 404, hex code typo) → fix the brand kit file, then retry.
- **Watermarks / extra text appearing uninvited** → add explicit prompt constraints: "NO captions, NO subtitles, NO watermarks, NO extra text beyond what's specified." This is the most common DTC ad failure mode — models love to invent copy.
- **Generic 5xx / rate-limit** → retry ONCE with the same payload after a short pause. See SKILL.md "Detecting failed generations".

## UX Rules

1. **Always pick an ad format explicitly** with the user — never auto-pick.
2. **Always confirm aspect ratio + resolution + quantity** before firing.
3. **Always check for a brand kit** before scraping fresh — `Read .kolbo/brand-kits/<slug>.md` first.
4. **Always log products + brand kits in `.kolbo/production.md`** so future ads reuse instead of re-uploading / re-scraping.
5. **No auto-retry on failure** — surface the reason and let the user adjust.
6. **Strict NO uninvited additions** in every ad prompt: "NO captions, NO subtitles, NO watermarks, NO extra text beyond what's specified."
