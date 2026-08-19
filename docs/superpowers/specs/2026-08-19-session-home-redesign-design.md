# Session Home Redesign — Design Spec

**Date:** 2026-08-19
**Approved by:** Zohar (via brainstorming session with visual mockups; mockup history in `.superpowers/brainstorm/43152-1787128250/content/`)

## Problem

1. **"Project" confuses users.** A project is a folder on disk, but nothing says so. Worse, two unrelated things are both called "project": the local workspace folder and the Kolbo platform project (cloud bucket) where generations land. Users can also end up working **outside any project**: `session-new-view.tsx` falls back to `sync.project?.worktree ?? sdk.directory`, so a session silently runs in whatever cwd the server started in.
2. **The new-session page is boring.** Static logo, icon+text starter rows. Reference direction: Higgsfield-style thumbnail cards (see user-supplied reference). It should "feel fun" — and Kobi (the animated mascot, `packages/ui/src/components/kobi.tsx`, 4 CDN-hosted animated WebP poses) is absent from the page that most needs him.
3. **Generations land in a junk drawer.** Every SDK generation defaults to the "API Generations" Kolbo project unless `project_id` is passed. Users have no way to choose from the app.

## Decisions (all confirmed with Zohar)

| Topic | Decision |
|---|---|
| Project entry | "New project" dialog: **Name + Save-in location** (user picks where; prefilled default e.g. `Documents/Kolbo Projects`), creates `<location>/<name>`. "Open existing folder" demoted to secondary link. |
| No-project state | Composer **disabled** until a project is open; remove the `?? sdk.directory` fallback. |
| Cloud project default | **Auto-link by name**: creating a local project auto-creates/links a same-named Kolbo platform project. Existing workspaces keep defaulting to API Generations until the user switches. |
| Cloud project control | Chip in the **composer footer** (next to model selector, visible in every session): `☁ <project> ▾` → dropdown of account projects + "Create new…". Persisted per workspace. Injected into session context so the agent passes `project_id` on every generation call. |
| Page layout | Animated Kobi (idle; `thinking` while the user types) + title + project line + **composer front and center** + "or jump straight in" divider + category chips + thumbnail card grid. |
| Card media | **Static AI-generated stills**, one per card, hosted on `media.kolbo.ai` CDN (same as Kobi art, `referrerpolicy="no-referrer"`). No video loops (explicitly rejected for now). |
| Starters killed | "Generate 4 images", "Compose music or voiceover". |
| Starters added | **Fashion campaign** (guided flow), **Create a presentation**, **Direct a scene** (renamed/replacing "short film" ambition). |
| Starters kept (row 2) | Product photoshoot, Animate a product, AI influencer, Make a short video. Plus kept: Build a landing page, Create a UGC ad. |

## Design

### 1. New Project dialog (project = folder fix)

- Fields: **Project name** (text), **Save in** (path display + "Change…" opening the OS directory picker; default `~/Documents/Kolbo Projects`, remembered after first use).
- Live preview line: `Will create: …\Kolbo Projects\Summer Campaign`.
- Explainer copy: "A project is a folder on your computer. Everything we make — images, videos, pages — is saved inside it."
- Primary CTA creates the folder via a small opencode-server route (the server owns fs access for both desktop and web clients; mkdir -p semantics, path-validated) and opens it as the workspace.
- Secondary link below the dialog: "Open an existing folder" → current directory-picker flow.
- On create, fire the **cloud auto-link** (section 3). Failure to auto-link is non-blocking (chip shows API Generations; user can retry from the chip).

### 2. Composer gating

- When no project is open, the prompt input renders disabled with hint copy ("Create or open a project to start") and the New Project CTA adjacent.
- Remove `?? sdk.directory` fallback in `session-new-view.tsx` (`projectRoot`) and audit for any sibling fallbacks on the session-start path.

### 3. Kolbo cloud-project selector

- **Server (kolbo-code, `packages/opencode/src/server/routes/global.ts`):** two proxy routes following the existing `/kolbo-balance` auth idiom (server-side key from the auth store, silent degrade when logged out):
  - `GET /kolbo-projects` → upstream `GET /v1/projects` (paginated; fetch page 1 with a generous limit + pass-through `search`), module-level TTL cache (~5 min) keyed by API key. Projection: `{ id, name, is_default, thumbnail_url }`.
  - `POST /kolbo-projects` → upstream `POST /v1/projects` (create by name) — used by auto-link and "Create new…".
- **Auto-link:** on local-project creation, `POST /kolbo-projects { name }`; if a same-named project already exists upstream, use it (search first, create on miss). Store the resulting id in per-workspace persistence.
- **Persistence:** per-workspace store (same mechanism as other per-project client state), key e.g. `kolboProjectId` + `kolboProjectName`.
- **Chip UI:** composer footer, next to the model selector. Shows linked project name (or "API Generations"). Dropdown = account projects (filterable) + "Create new…". Selecting updates persistence immediately.
- **Injection:** the selected project id/name is added to the session context (system-prompt fragment on session start, and updated on change), instructing the agent: *"All Kolbo generations in this workspace belong to project <name> — pass project_id=<id> on every generation/upload call."* Prompt-level, no MCP transport change.

### 4. New-session page (`packages/app/src/components/session/session-new-view.tsx`)

- Replace static logo with `<Kobi state={typing ? "thinking" : "idle"} size={84} />` (component exists; glow on).
- Title/subtitle: keep `session.new.title`; new subtitle copy referencing presentations→films range.
- Project context line under subtitle: local project name + truncated path + branch (existing data).
- Composer unchanged in function, visually promoted (single column, generous width).
- Divider: "or jump straight in".
- **Category chips:** All / Marketing / Film & Video / Images / Web & Docs / Audio. Client-side filter over the starter list. Each starter declares `categories: string[]`.
- **Card grid:** 3 columns (responsive), 16:10 thumbnail, title + one-line body, hover lift. Thumbnail `<img>` with `referrerpolicy="no-referrer"` + kind-colored gradient fallback on error (same degrade philosophy as Kobi/mediaGrid).
- Starter data moves from icon-keyed entries to `{ key, categories, thumbnail, tag?, requires? }` config. i18n keys stay in `en.ts` (`session.new.starter.<key>.*`); new keys added for the new starters, removed keys deleted.

### 5. Starter set (final)

Row 1:
1. **Fashion campaign** — tag "Guided flow"; card shows step strip (Plan → Pick character ×4 → DNA → Campaign). Prompt encodes hard stops: present a written plan and WAIT for approval → generate 4 base-character candidates and WAIT for the user to pick → lock winner as Visual DNA → produce the campaign set with it.
2. **Direct a scene** — tag "Seedance 2.5". Prompt: one continuous multi-shot scene, up to 2 Visual DNA characters (offer to pick from `list_visual_dnas` or create).
3. **Create a UGC ad** — tag "Needs: product + face". Clicking seeds the prompt AND opens the attachment picker; prompt instructs the agent to confirm both references (product photo, creator ref) are attached before producing, and to ask for them if missing.
4. **Create a presentation** — full deck (content + visuals), agent builds an HTML deck.
5. **Build a landing page** — unchanged behavior.

Row 2 (unchanged prompts, new card chrome): Make a short video · Product photoshoot · Animate a product · AI influencer.

### 6. Card thumbnails (asset pipeline)

- 9 stills, generated once with Kolbo image models (art direction: bold, colorful, editorial; consistent set), uploaded to `media.kolbo.ai/kolboai-media/kolbo-code/starters/<key>.webp`.
- Generation batch requires Zohar's explicit sign-off before spending credits (his standing rule).
- URLs hard-coded in the starter config (same approach as Kobi's CDN art) so art can be redrawn without an app release.

## Error handling

- CDN thumbnail fails → gradient fallback tile (never a broken image).
- Kolbo logged out → chip hidden or shows "Sign in to choose a project"; proxy returns `[]` silently (matches `/kolbo-balance`).
- Auto-link failure → non-blocking, defaults to API Generations, retriable from chip.
- Folder creation failure (permissions/exists) → inline dialog error; "already exists" offers "Open it instead".

## Testing

- Unit: starter config/filter logic; chip persistence; proxy route projections (existing route-test patterns).
- Existing `submit.test.ts` unaffected (composer function unchanged).
- Manual/e2e: no-project gating (composer disabled, no cwd fallback), dialog create→open flow, chip select→context injection (verify a generation lands in the chosen Kolbo project), category filter, RTL (he.ts) layout of the card grid.

## Out of scope

- Video-loop card thumbnails (future upgrade path noted; static stills now).
- TUI parity.
- Migrating existing workspaces' past generations between Kolbo projects.
