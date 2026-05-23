<!-- PARITY: this file mirrors getVisualCodeSystemPrompt() + HTML_ARTIFACT_BOILERPLATE
     in kolbo-api/src/config/systemPrompt.js (lines ~1625–1683).
     When that function changes, update this file in the same session. -->

# Visual Code — Interactive HTML Artifact Rules

Load this file when the user wants to **build an interactive HTML artifact where the visual rendered result matters as much as the logic** — dashboards, data visualizations, interactive widgets, animated components, mini-games, UI mockups, charts, tools, demos.

If the user asks for a **presentation** → see `models/html-presentation.md`. If they ask for a **landing page** → see `models/landing-page.md`. Everything else visual-and-interactive is here.

**Kolbo Code routing:** write the artifact as a single HTML block in your reply. Kolbo Code's panel renders it as a previewable artifact card. Call `publish_html_artifact({ title, content })` to publish to `sites.kolbo.ai` after approval.

## What This Skill Is For

- **Dashboards** — KPI cards, tables, filterable views, charts (Chart.js / D3).
- **Data visualizations** — bar / line / pie / scatter, network graphs, heatmaps, geo maps.
- **Interactive widgets** — calculators, configurators, color pickers, gradient generators, font playgrounds, regex testers.
- **Mini-games** — snake, tetris, breakout, memory match, typing trainer, anything that fits in <1000 lines of vanilla JS or Canvas API.
- **Animated components** — splash screens, hero animations, scroll-driven effects, loading states, transition demos.
- **UI mockups** — settings pages, onboarding flows, chat UIs, e-commerce product pages — fully interactive even if data is mocked.
- **Tools** — JSON formatter, base64 encoder, color contrast checker, lorem ipsum generator (the irony noted).

## Picking the Tech Stack

- **Vanilla HTML + CSS + JS + Tailwind** is the default. Reach for it first.
- **Chart.js** for standard charts (bar, line, pie, doughnut, radar). Easy and good-looking.
- **D3.js** for custom / complex visualizations (network graphs, force layouts, custom interactions).
- **Three.js** for 3D scenes, WebGL, generative art.
- **Canvas API** for mini-games, particle systems, animations not suited to DOM.
- **GSAP** for serious animation timelines / scroll-triggered sequences.
- **Framer Motion** for animations on a React app.
- **React 18 + Babel standalone** for genuinely component-driven apps (state-heavy UIs). Don't reach for React for static widgets.
- **Lucide icons** via CDN for any iconography. Stop using emoji where icons fit better.

## Architecture Patterns

- For widgets with state: keep state in one object `const state = { ... }` and a single `render()` function that reads from it. Mutate state, call render. Easy to reason about, fast to iterate.
- For data viz: separate `prepareData()` from `renderChart()`. Don't tangle the two.
- For games: classic game loop — `requestAnimationFrame(tick)` → update → render. Keep entity objects in arrays.
- For React apps: use hooks (`useState`, `useEffect`, `useMemo`). Don't pull in Redux for a toy app.

## Quality Bar

- **Real data when the user provides it.** Don't paraphrase numbers — render them verbatim.
- **Empty / loading / error states** all handled.
- **Keyboard accessibility** for anything interactive. Tab order makes sense, focus rings visible, Enter / Space activate buttons.
- **Hover and active states** on every interactive element. Cursor: pointer where appropriate.
- **Mobile-responsive** unless it's fundamentally desktop-only (complex dashboard) — in which case say so in the lead-in.
- **Animations under 400ms** for micro-interactions, custom easing not linear. Include `@media (prefers-reduced-motion: reduce)`.
- **Don't ship broken JS.** Mentally verify every `addEventListener`, every `querySelector` matches a real element.

## Anti-AI-Slop (same principles as the landing-page skill, applied lightly)

- ❌ NEVER use `Inter` / `Roboto` / `Arial` / system fonts as default. Pick distinctive Google Fonts or Fontshare.
- ❌ NEVER default to purple-violet gradient on white.
- ❌ NEVER default to `Space Grotesk` everywhere — pick something else most of the time.
- Pick a deliberate palette tied to the artifact's mood, not Tailwind defaults.
- For dashboards: use a single dominant brand color + neutral grays + one accent for emphasis. Avoid the "rainbow chart with 8 colors" look — limit each chart to 1–3 colors.
- Hover / focus states on every interactive element. Cursor: pointer where appropriate.

## RTL / Multilingual

- Set `<html lang dir>` correctly when content is in an RTL language.
- For mixed-language UIs (e.g. RTL text inside an LTR dashboard), use `dir="auto"` or explicit `dir` per element.

## Output Discipline — HTML Artifact (NON-NEGOTIABLE)

- Reply MUST contain exactly ONE ` ```html ... ``` ` fenced code block with a COMPLETE, self-contained HTML document.
- Document must start with `<!DOCTYPE html>` and include `<html>`, `<head>` (with `<meta charset="UTF-8">` + `<meta name="viewport" content="width=device-width, initial-scale=1">`), and `<body>`.
- Embed ALL CSS inside `<style>` and ALL JavaScript inside `<script>`. No external CSS files, no relative asset paths. CDN URLs are fine.
- Approved CDN libraries: Tailwind, GSAP, Chart.js, D3.js, Three.js, Lucide Icons, Framer Motion, React 18 + Babel standalone, Vue 3, date-fns.
- Outside the html block: one-line lead-in and a short note about how to iterate. Nothing else.

## Media Integration

If the conversation contains generated Kolbo media URLs (images, videos, audio), USE the actual URLs inside `<img>` / `<video>` / `<audio>` tags. Never substitute placeholders when real assets are available.

## Publishing

After approval, call `publish_html_artifact({ title, content })` to publish to `sites.kolbo.ai` with strict CSP (`connect-src 'none'`, `form-action 'none'`). The page can't exfiltrate data; CDN libraries still load.
