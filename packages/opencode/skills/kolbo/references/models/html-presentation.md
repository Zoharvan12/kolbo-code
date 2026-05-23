<!-- PARITY: this file mirrors getHtmlPresentationSystemPrompt() + HTML_ARTIFACT_BOILERPLATE
     in kolbo-api/src/config/systemPrompt.js (lines ~1377–1515).
     When that function changes, update this file in the same session. -->

# HTML Presentation — Build Rules

Load this file when the user wants to **build / create / generate an HTML presentation, slide deck, or pitch deck**. For landing pages see `models/landing-page.md`; for any other interactive HTML artifact (dashboard, game, chart, widget) see `models/visual-code.md`.

**Kolbo Code routing:** write the artifact as a single HTML block in your reply. The Kolbo Code panel renders it as a previewable artifact card. Optionally call `publish_html_artifact({ title, content })` afterward to get a public `sites.kolbo.ai` URL.

## 🚨 NON-NEGOTIABLE: Viewport Fitting

Every single slide MUST fit exactly within 100vh. **No scrolling within a slide, ever.** If content doesn't fit, SPLIT into multiple slides. This is the #1 rule, no exceptions.

Apply these invariants to EVERY slide in EVERY deck:
- Every `.slide` element has: `height: 100vh; height: 100dvh; overflow: hidden;` and a centered flex/grid layout.
- ALL font sizes and spacing use `clamp(min, preferred, max)` — **never fixed px/rem**. Example: `font-size: clamp(2.5rem, 5vw, 5rem);`.
- Content containers need explicit `max-height` constraints.
- Images: `max-height: min(50vh, 400px); object-fit: contain;`.
- Include short-viewport breakpoints: `@media (max-height: 700px)`, `(max-height: 600px)`, `(max-height: 500px)` — reduce font sizes / hide decoration / tighten gaps at each.
- Add `@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; } }`.
- Never negate CSS functions directly. `-clamp()` is silently ignored. Use `calc(-1 * clamp(...))`.

## 🚨 NON-NEGOTIABLE: Content Density Limits per Slide

| Slide Type     | Maximum Content |
| -------------- | --------------- |
| Title slide    | 1 heading + 1 subtitle + optional tagline |
| Content slide  | 1 heading + 4–6 bullets OR 1 heading + 2 short paragraphs |
| Feature grid   | 1 heading + max 6 cards (2×3 or 3×2) |
| Code slide     | 1 heading + 8–10 lines of code max |
| Quote slide    | 1 quote (≤3 lines) + attribution |
| Image slide    | 1 heading + 1 image (max 60vh height) |

**Content exceeds limits? Split into more slides. Never cram, never shrink fonts to fit, never enable scrolling.**

## Deck Length & Structure

- **Default 8–12 slides** unless the user specifies otherwise. **Hard cap 16 slides** — bigger decks become unwieldy.
- Pick a structure based on the purpose:
  - **Pitch deck**: Hook → Problem → Solution → How it works → Traction → Market → Team → Ask
  - **Product / feature demo**: Title → Why → What → How (3 features) → Demo → Pricing → Next steps
  - **Educational**: Title → Learning goals → Concept 1 → Concept 2 → Concept 3 → Example → Recap → Q&A
  - **Status / review**: Title → Wins → Numbers → Challenges → Next quarter → Ask
- **One idea per slide.** Headlines lead: short, declarative, ideally <8 words. Body copy supports.

## Slide Layout Palette (vary these — never use the same layout twice in a row)

- **Title slide**: oversized headline, subtitle, optional brand mark / date / speaker name.
- **Content slide**: headline + 4–6 bullets OR 2-column split (text left, visual right).
- **Quote / pull-quote**: big quote, attribution, optional accent.
- **Data slide**: big number (kpi) + label + small supporting chart (Chart.js).
- **Image-led slide**: full-bleed image with caption overlay.
- **Comparison slide**: side-by-side with checkmarks/crosses.
- **Process / flow slide**: numbered steps with arrows / chevrons.
- **Closing / CTA slide**: short CTA, contact, thank-you.

## Aesthetic Direction — COMMIT BOLDLY

**Pick a clear conceptual direction and execute it with precision.** No timid middle-ground choices. Bold maximalism and refined minimalism both work — what matters is intentionality.

Before writing CSS, pick ONE aesthetic and commit:
- **Bold Signal** — high-contrast monochrome + one electric accent, oversized type
- **Electric Studio** — saturated brand color, generous whitespace, geometric accents
- **Dark Botanical** — near-black + deep emerald + warm gold, organic curves
- **Creative Voltage** — bright neon palette, kinetic typography, motion-led
- **Neon Cyber** — black + cyan + magenta, scanlines / grid lines, terminal vibes
- **Split Pastel** — soft duotones, rounded geometry, friendly playful
- **Notebook Tabs** — paper textures, marker-style annotations, hand-drawn shapes
- **Paper & Ink** — cream + black + warm red, classical serif, editorial restraint
- **Swiss Modern** — pure white + black + one accent, grid-disciplined, helvetica-class fonts
- **Vintage Editorial** — sepia / cream tones, classical serif headlines, golden-ratio layouts
- **Pastel Geometry** — soft palette, bold shapes, layered transparencies
- Or invent one that matches the topic. Don't always default to the same look.

## Typography — DISTINCTIVE FONTS ONLY

**Never use system fonts. Never use Inter, Roboto, or Arial.** Pull from Google Fonts or Fontshare. Pair a distinctive display font with a refined body font:
- Editorial: `'Fraunces'` / `'Playfair Display'` / `'DM Serif Display'` + `'Source Sans 3'` body
- Modern technical: `'Bricolage Grotesque'` / `'Instrument Serif'` / `'Geist'` + `'IBM Plex Sans'` body
- Bold creative: `'Boldonse'` / `'Anton'` / `'Archivo Black'` + `'Manrope'` body
- Mono accent: `'JetBrains Mono'` / `'Geist Mono'` / `'IBM Plex Mono'`
- **Avoid `'Space Grotesk'` for everything** — it's an LLM cliché. Pick something else most of the time.

Hebrew: `'Heebo'`, `'Rubik'`, `'Frank Ruhl Libre'`, `'Assistant'`. Arabic: `'Cairo'`, `'Tajawal'`, `'IBM Plex Sans Arabic'`, `'Reem Kufi'`.

## Color & Background

- Commit to a cohesive palette. **Dominant color with sharp accents beats timid evenly-distributed palettes.** Use CSS custom properties (`:root { --bg: ...; --fg: ...; --accent: ...; }`).
- Backgrounds with atmosphere, not solid colors: layered gradients, gradient meshes, subtle noise texture (data-URI SVG noise), geometric patterns, grain overlays, scanlines, dot grids.
- ❌ NEVER: default purple/violet gradient on white background — instant AI-slop signal.

## Motion — High-Impact, Not Scattered

- One well-orchestrated page-load with staggered reveals (`animation-delay` ladder) beats scattered micro-interactions sprinkled everywhere.
- Slide transitions: `transform: translateX()` + `opacity` with 300–500ms ease-out cubic-bezier. No bouncy / corny effects.
- Use CSS keyframes for everything. GSAP via CDN ONLY if you need a timeline or scroll-trigger.
- Always include the `prefers-reduced-motion` media query.

## Slide Mechanics

- Each slide = `<section class="slide">` inside `<main id="deck">`.
- Only ONE slide visible at a time. Non-active slides: `display: none` (or `opacity: 0; pointer-events: none` if cross-fading). Active slide: `.active` with the slide-type's display.
- Navigation:
  - Arrow keys: `ArrowRight` / `Space` → next, `ArrowLeft` → prev. `Home` / `End` → first/last.
  - On-screen prev/next buttons at bottom corners, semi-transparent.
  - Slide counter "3 / 10" in a corner.
  - Press `F` for fullscreen (`document.documentElement.requestFullscreen()`). `Esc` exits.
  - Press number keys 1–9 to jump to that slide.
  - **RTL decks**: swap arrow direction — right arrow → previous, left arrow → next.
- Subtle progress bar at the very top, fills as the user advances.

## RTL / Multilingual

- Detect language. Set `<html lang="he" dir="rtl">` (or appropriate) when content is Hebrew / Arabic / Persian / Urdu.
- Use Tailwind logical properties (`me-*`, `ms-*`, `ps-*`, `pe-*`, `text-start`, `text-end`) or CSS logical properties (`margin-inline-start`).
- Headline fonts: use locale-appropriate fonts (see Typography section).

## Real Content, Not Lorem Ipsum

- If the user gave you content, use it verbatim where appropriate.
- If they gave a topic only, **invent plausible specific content** for that topic — real numbers, real-sounding quotes, real-feeling section headings. Never "Lorem ipsum", never "Insert your text here".

## Output Discipline — HTML Artifact (NON-NEGOTIABLE)

- Your reply MUST contain exactly ONE ` ```html ... ``` ` fenced code block with a COMPLETE, self-contained HTML document.
- Document must start with `<!DOCTYPE html>` and include `<html>`, `<head>` (with `<meta charset="UTF-8">` + `<meta name="viewport" content="width=device-width, initial-scale=1">`), and `<body>`.
- Embed ALL CSS inside `<style>` and ALL JavaScript inside `<script>`. No external CSS files, no relative asset paths. CDN URLs are fine.
- Approved CDN libraries (use only what you need): Tailwind `<script src="https://cdn.tailwindcss.com"></script>`, GSAP, Chart.js, D3.js, Three.js, Lucide Icons, Framer Motion, React 18 + Babel standalone, Vue 3, date-fns.
- Outside the html block you can write a one-line lead-in and a short 1–2 line note about how to iterate. Nothing else.
- If the user wrote in any language other than English, write your lead-in / closing note in their language. Inside the HTML, match the in-page copy to the user's language and set the appropriate `lang` + `dir` attributes.

## Media Integration

If the conversation contains generated Kolbo media URLs (images, videos, audio), USE the actual URLs inside `<img>` / `<video>` / `<audio>` tags. Never substitute placeholder images or gradient backgrounds when real assets are available.

## Publishing

After the user approves the deck, offer `publish_html_artifact({ title, content })` to get a shareable `sites.kolbo.ai` URL. Server dedupes by content hash — re-publishing identical bytes returns the same URL. The page is served with strict CSP, so it cannot exfiltrate data; CDN frameworks still load.
