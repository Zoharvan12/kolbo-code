# Research-First Creative — Scrape Before Generating

Load this file when the brief involves a real brand, product URL, audience, or market — especially for ads, marketing creative, or anything tied to identity / brand palette / on-image text.

## Why

When the user gives you a **product URL, brand reference, or "make X for Y audience" brief**, don't jump straight to prompts. Spend one turn researching first — the cost of a single research turn is far less than 10 mis-aimed generations.

## When to do research-first

- Any URL appears in the brief (product page, landing page, brand site)
- The brief names a brand, product, or company you don't already have context on
- The brief targets a specific audience / language / market with conventions you should respect (Hebrew/Israeli, Japanese, Gen-Z TikTok, B2B SaaS, luxury, etc.)
- The brief explicitly says "research" / "תחקור" / "look up" / "find examples" / "check best practices"

## How to research (parallel calls in one response)

Fire these IN PARALLEL — they're independent reads:

1. **`WebSearch`** for prompt-engineering patterns specific to the chosen model. **The model name in the search query MUST be the literal model the user named** — never substitute a generic / default / "popular" model. If the user said "nano banana 2", search for `"nano banana 2" prompt …`, NOT `"flux" prompt …` or `"midjourney" prompt …`. The same HARD RULE that applies to *calling* the named model applies to *researching* it. Examples (replace `<model>` with the user's exact wording):
   - `"<model>" prompt engineering ad image text rendering`
   - `"<model>" hex color font specification advertising prompt`
   - `"<model>" hebrew text RTL rendering` (or any user-named language)
2. **`WebSearch`** for the audience / market design conventions:
   - `<audience> advertising design trends <year>`
   - `<language> typography <use case> RTL/LTR best practices`
3. **`WebFetch`** the product URL with a precise extraction prompt (see below).
4. (Optional) `WebSearch` for competitor / reference visuals to set bar.

## Extracting the product page (WebFetch prompt template)

Don't ask WebFetch a vague "what is this page" — ask for structured extraction:

```
Extract from this page, in compact bullets:
1. Product name + one-line value proposition.
2. 3–5 concrete capabilities/benefits (user-facing language).
3. All product hero / screenshot image URLs visible in the page.
4. Brand color hex codes — pull from inline `style=`, `<style>` tags, or
   linked CSS, ignoring generic UI defaults (#fff/#000). Identify which
   color plays which role (primary CTA, headline text, background, accent).
5. Brand voice signals (tone, target user, formality).
6. Any explicit fonts named in CSS or visible.
```

## Re-host every external image via `upload_media`

The bulk-API rule applies: external URLs in `reference_images` / `source_images` / `image_url` cause **400 Bad Request**. Pipeline:

1. `Bash: curl -fsSL "<external-url>" -o /tmp/<name>.<ext>` (or use WebFetch where it returns the binary)
2. `mcp__kolbo__upload_media` with the local file → returns Kolbo CDN URL
3. Use the returned CDN URL in any subsequent generation call
4. Log both URLs in the production log (so the user can trace provenance)

## Synthesizing the research

In the production log create:
```md
### Research notes
- Prompt patterns for <model>: …
- Audience conventions: …

### Product brief
- Name: …
- Value prop: …
- Capabilities: …, …, …

### Brand palette
- primary: #...
- accent: #...
- text: #...
- bg: #...

### Re-hosted assets
- hero_1: <kolbo CDN url>  (from <original url>)
```

## Persist as a Reusable Brand Kit

After research, **persist the brand-identity bits into a reusable file** at `.kolbo/brand-kits/<slug>.md` so future generations in any session can read it instead of re-scraping. This is the durable, cross-session record (the production log is per-production; brand kits are per-brand).

**Slug rule:** lowercase, single token, derived from the domain (`drinkolipop` from `drinkolipop.com`, `acme_skincare` from `acme-skincare.io`). Strip TLD and hyphens.

**Brand kit file schema** (use `Write` for first creation; `Read → Edit` for updates):

```md
<!-- .kolbo/brand-kits/<slug>.md — agent-managed brand identity registry.
     Reusable across all generations for this brand. Read first before scraping. -->

# Brand Kit: <Brand Name>

url: https://...
fetched: 2026-05-23
last_refreshed: 2026-05-23

## Identity
brand_name: ...
tagline: ...
business_overview: <1-2 sentences>
industry: <fashion | beauty | food | beverage | electronics | saas | ...>

## Visuals
logo_url: <kolbo CDN url, re-hosted via upload_media>
primary_color: #...
accent_color: #...
text_color: #...
bg_color: #...
fonts:
  headline: <font name>
  body: <font name>
  mono: <font name, optional>

## Voice & Audience
tone: <playful | refined | technical | bold | warm | ...>
target_user: <one-line persona>
formality: <casual | professional | luxury>

## Hero Assets (re-hosted via upload_media)
- hero_1: <kolbo CDN url>  (from <original url>)
- hero_2: <kolbo CDN url>  (from <original url>)
- product_1: <kolbo CDN url>  (from <original url>)

## Notes
- Any brand-specific gotchas, design rules, do-not-show items
```

### When to READ a brand kit

Before any generation tied to a known brand — **always** Read first:

- User mentions a brand by name ("make a Pinterest pin for OliPop")
- User pastes a brand URL again ("make ads for drinkolipop.com")
- User says "use the same brand as last time" / "match our brand"
- Any DTC ad / product photoshoot / marketplace card request where the brand is implicit

If `.kolbo/brand-kits/<slug>.md` exists, **skip the research-first workflow entirely** for the brand-extraction parts (palette, logo, fonts, voice). Still do `WebSearch` for fresh prompt-engineering patterns or audience trends if needed.

If it doesn't exist and there's a URL, run the full research workflow above and **end by persisting the brand kit**.

### When to UPDATE a brand kit

- User explicitly says "the brand updated their colors / logo / fonts"
- Brand kit is >90 days old AND the user is starting a major campaign (refresh recommended, not mandatory)
- Generation results look "off-brand" and palette is suspect — refresh to verify

Update by `Read → Edit`. Bump `last_refreshed`. Keep older asset URLs in place (they still work) and append new ones.

### Brand-kit reuse downstream

The other workflow files consume the brand kit:

- `workflows/dtc-ads.md` — pulls palette + fonts + logo into every ad prompt
- `workflows/product-photoshoot.md` — bakes hex codes into prompts; uses logo as `reference_images[0]`
- `workflows/marketplace-cards.md` — palette + fonts critical for A+ module consistency
- `workflows/marketing-studio.md` — voice/tone shapes UGC presenter dialogue; palette shapes any branded overlays

Always cite the brand-kit slug in the production log so reviewers can trace which kit drove a given generation.

## Building prompts informed by the research

When generating ad / marketing creative based on this research:

- **Exact hex codes for every color** — `#FF4D2E` not "orange". Match brand palette.
- **On-image text in literal double quotes** — `"שלום עולם"` not `Hebrew greeting`. Specify language and direction (RTL/LTR) when non-English.
- **Per text element**: position, font weight, point size, color hex, alignment.
- **Forbid uninvited additions** — explicitly tell the model: NO captions, NO subtitles, NO watermarks, NO extra text beyond what's specified. Same rule as UGC defaults.
- **Use research findings to shape composition** — e.g. if research said "Israeli social ads favor bold contrast and minimal copy", reflect that.
- Always **approve the concept + sample prompts with the user** before firing the full batch when the batch is ≥4 ads or the user said "approve first".

## Skipping research is OK when…

- User gave no URL, no brand, no audience-specific signal — pure creative ("make a sunset")
- User said "skip research" / "just generate" / "I have the prompt ready"
- The brief is for a single quick draft
