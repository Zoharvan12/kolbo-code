# Marketing Studio — UGC, Ads & Branded Video

Load this file when the user wants **branded ad video** — UGC, unboxing, product showcase, TV spot, virtual try-on, or any "make me an ad / commercial / creator video" request.

For ad **images** (Pinterest pin, hero banner, ad creative pack) see `workflows/product-photoshoot.md`.
For **marketplace listings** (Amazon main + secondary + A+ content) see `workflows/marketplace-cards.md`.
For the **DTC ads engine flow** (brand kit + ad format + avatar + product) see `workflows/dtc-ads.md`.

## The 9 Marketing Modes

| Mode | What it's for | Hook/Setting allowed? |
|---|---|:-:|
| `ugc` | **Default.** Casual, organic-feel content from a presenter | ✅ |
| `ugc_how_to` | Tutorial / explainer — "here's how to use this" | ✅ |
| `ugc_unboxing` | Unboxing reveal — "just got this in the mail" | ✅ |
| `product_showcase` | Clean product highlight, polished | ❌ |
| `product_review` | Presenter giving an opinion on the product | ✅ |
| `tv_spot` | Broadcast-style commercial, higher production | ❌ |
| `wild_card` | Experimental — model picks the vibe | ❌ |
| `ugc_virtual_try_on` | Person trying on clothing / accessories — UGC vibe | ✅ |
| `virtual_try_on` | Same but polished, model-driven | ❌ |

**"Hook/Setting allowed"** = whether reusable opening hook prompts and scene-setting prompts can be prepended to the user prompt. Polished modes (`product_showcase`, `tv_spot`, `wild_card`, `virtual_try_on`) ignore hooks/settings.

**Default when the user doesn't specify a mode:** `ugc`.

## Picking the Mode

| User phrasing | Mode |
|---|---|
| "UGC", "creator video", "talking head", "phone-shot", "selfie video", "vlogger" | `ugc` |
| "tutorial", "how to use", "demonstrate", "walkthrough", "explainer" | `ugc_how_to` |
| "unboxing", "just got this", "reveal", "first impression" | `ugc_unboxing` |
| "product showcase", "highlight reel", "showroom" | `product_showcase` |
| "review", "my take on", "comparing X to Y", "honest opinion" | `product_review` |
| "TV ad", "commercial", "broadcast", "polished ad spot" | `tv_spot` |
| "surprise me", "something different", "experimental" | `wild_card` |
| "try on" / "wearing the X" + organic vibe | `ugc_virtual_try_on` |
| "fashion shoot", "lookbook", polished try-on | `virtual_try_on` |

If the user mentions a product / brand but no mode word, default to `ugc`. If they say "ad" without "TV ad" / "commercial" / "broadcast", default to `ugc` (most modern ads are UGC-shaped).

## Mode → Kolbo MCP Routing

The mode determines which Kolbo MCP tool to call, what defaults to set, and what's forbidden.

| Mode | Primary tool | aspect_ratio | duration | sound_enabled | Captions / watermarks |
|---|---|---|---|:-:|:-:|
| `ugc`, `ugc_how_to`, `ugc_unboxing`, `ugc_virtual_try_on`, `product_review` | `generate_video_from_image` (frame-first) OR `generate_elements` (Visual DNA → video) | **`9:16`** | model's `default_duration` (5–8s) | OFF | **Never add** |
| `product_showcase` | `generate_creative_director` with `workflow_type: "video"` (for multi-shot) OR `generate_video` (single) | `16:9` or `1:1` | 5–10s | ON if model supports `sound_generation_type: "native"` | Allowed if user asks |
| `tv_spot` | `generate_creative_director` with `workflow_type: "video"` (3–6 shots for a beat structure) | `16:9` | 15–30s total | ON (full audio + dialogue) | Allowed if part of the spot |
| `virtual_try_on` | `generate_elements` with character Visual DNA + product as `reference_images` | `9:16` or `4:5` | 5–8s | OFF | Never add |
| `wild_card` | User's chosen model with broader prompt latitude (no mode-specific defaults) | User's pick | User's pick | User's pick | User's pick |

**Pick the actual model** with `list_models({ type: "..." })` and validate caps before firing — see SKILL.md "Resolution / Aspect / Duration — validate against caps".

## UGC Family Defaults (CRITICAL)

When ANY `ugc*` mode is selected, snap to these unless the user explicitly overrides:

| Setting | UGC default | Why |
|---|---|---|
| `aspect_ratio` | `9:16` | TikTok / Reels / Shorts are vertical-first |
| Visual aesthetic | Phone-shot, handheld, natural lighting | UGC works because it doesn't look produced |
| Camera language | Slight handheld sway, selfie-arm framing, key light from window/screen | NOT slow dollies, NOT crane moves, NOT studio key |
| Energy | "Talking to a friend" — casual, direct-to-camera, occasional gestures | Not theatrical, not staged |
| **Captions / subtitles / text overlays** | **NEVER add** unless explicitly requested | Users add captions in CapCut / native editor; baked-in captions limit reuse |
| **Brand watermarks / lower-thirds / banners** | **NEVER add** unless explicitly requested | Same reason |
| Music / SFX | OFF by default unless asked | They'll layer their own audio in post |
| Length | Model's `default_duration` (typically 5–8s) | Shorter = more usable for the algorithm |

**Phrases that activate UGC defaults:** "UGC", "user-generated", "creator video", "TikTok", "Reels", "Shorts", "POV", "selfie video", "phone-shot", "vlogger", "talking head" (when context implies social media), "for social", "Instagram video", "YouTube short".

**Phrases that OVERRIDE UGC defaults** (use them as-given, not as UGC): "commercial", "ad spot" (without UGC), "cinematic", "broadcast", "TV ad", "horizontal", "16:9", "landscape", "billboard". When the user uses one of these, switch to `product_showcase` or `tv_spot` mode.

## Hooks & Settings (concept)

Hooks and settings are **reusable opening angles / scene contexts** that get prepended to the user's prompt. Kolbo does not yet expose these as first-class MCP primitives, but the concept is portable:

- **Hook** = the opening line / angle of the ad (the first 1–2 seconds that earn the scroll). Example hooks: "POV: you just discovered X", "Why I stopped buying Y", "3 reasons this X is worth it", "Watch this before you buy a Y".
- **Setting** = the scene/environment context. Example settings: "in a bright minimalist kitchen", "walking in a busy city street", "on a yoga mat at golden hour".

**When the user asks for an ad and doesn't specify the opening**, offer 2–3 hook options (one-liner each) in a labeled-question style — never freeform "what hook?" Same for setting if the brief is location-agnostic.

**Whitelist rule:** hooks/settings only make sense for `ugc`, `ugc_how_to`, `ugc_unboxing`, `product_review`, `ugc_virtual_try_on`. For `product_showcase`, `tv_spot`, `wild_card`, `virtual_try_on` — skip hooks/settings; those modes are concept-driven not hook-driven.

**Mutually exclusive with ad references** (next section). Pick one path per generation.

## Ad References (modeling new ads after existing ones)

Sometimes the user has a reference ad they want to model the new ad after — their own previous winning ad, a competitor's ad, or a viral video. Kolbo path:

1. **Upload the reference video** via `upload_media` (returns CDN URL).
2. **Pass it as `reference_videos`** to `generate_elements`, OR as `source_video` to `generate_video_from_video` (if you want to actually restyle / re-shoot the reference).
3. **Describe in the prompt** what to preserve from the reference (`@video1`'s pacing / camera move / lighting / cut rhythm) and what to change (subject / product / setting).
4. **Tag with `@video1`** per `workflows/visual-dna.md` reference-tagging rules.

**Mutually exclusive with hooks/settings** — pick one composition path per generation. Either reference-driven (use `@video1`) or composed-from-blocks (hook + setting + product). Mixing produces muddled output.

## Avatars (= Visual DNA characters)

What other platforms call "preset avatars" or "custom avatars" Kolbo calls **Visual DNA characters**. Two ways to get one:

- **Existing character** — use `list_visual_dnas` to find one the user has already created.
- **New character** — create with `create_visual_dna({ type: "character", name, images: [...] })`. See `workflows/visual-dna.md` for the full creation flow (pre-flight, naming rule, generate-reference-images-first).

**For UGC modes:** an avatar is optional if the brief clearly mentions a person (the model can synthesize one). Pass `visual_dna_ids` when the user wants a *specific* presenter — their face, the brand founder, a previously trained character.

**Always use `@<dna-name>` in the prompt** when passing `visual_dna_ids` — see `workflows/visual-dna.md` `@name` rules.

## Products (image upload + reference)

For ads that feature a specific product:

1. **Upload product photo** via `upload_media` → Kolbo CDN URL.
2. **Pass as `reference_images`** to `generate_creative_director` / `generate_elements` / `generate_video_from_image`.
3. **Tag with `@image1`** in the prompt.
4. **Log in `.kolbo/production.md`** under a `### Products` subsection so future ads in the same workspace reuse the same CDN URL (don't re-upload).

If the user gives a **product URL** instead of a photo, see `workflows/research-first.md` — scrape, extract images, re-host via `upload_media`, persist as a brand kit at `.kolbo/brand-kits/<slug>.md`.

## UX Rules

1. **Always pick a mode explicitly.** Don't auto-pick from one ambiguous word. If the user said "make me an ad" with no other signal, offer labeled options: `[UGC / TV Spot / Product Showcase / Surprise me]`.
2. **Always confirm aspect ratio + duration + sound** before firing — these materially change output and cost. One question, labeled options.
3. **Default UGC settings are hard rules** — captions OFF, music OFF, watermarks OFF — even when the user doesn't mention them. Only flip when they ask.
4. **No auto-retry on failure.** If the generation fails (content policy, model OOM), surface the reason and let the user adjust prompt or product.
5. **Show results without dumping URLs** — see SKILL.md "Generated URLs in chat".

## Prompt Template Seed for UGC

```
UGC selfie video, vertical 9:16, handheld phone aesthetic.
{presenter description or @<dna-name>} in {everyday setting},
{energy level: relaxed | enthusiastic | curious | reactive}.
They {natural action with the product/subject},
talking directly to camera.
Phone-shot lighting (window/screen key light),
slight handheld sway, no cinematic moves.
Style: authentic creator content, NOT polished commercial.
Sound: ambient room tone only, no music, no SFX overlay.
```

## Prompt Template Seed for TV Spot

```
3-shot broadcast commercial, cinematic 16:9.

Shot 1 [0–5s] — {establishing hook}: {wide angle subject + camera move}, {lighting}, {tone setter}.
Shot 2 [5–15s] — {product reveal / demo}: {medium shot with product in focus}, {practical action}, {emotional beat}.
Shot 3 [15–25s] — {payoff + CTA}: {close-up or pull-back}, {brand line in dialogue or SFX}, {final hold}.

Style: {brand mood — e.g., warm + premium / clean + modern / bold + youthful}.
Audio: full mix — dialogue + score + SFX. Music: {genre/tempo}.
```

(Run via `generate_creative_director` with `workflow_type: "video"`, `scene_count: 3`.)
