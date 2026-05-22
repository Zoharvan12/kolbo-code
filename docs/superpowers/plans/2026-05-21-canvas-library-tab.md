# Canvas — Library tab (Kolbo Media Library SDK, v1 lean)

## Context

Today the Canvas side panel only shows **session-derived** media — assets generated in the current chat (parsed from `sync.data.part[messageID]` tool outputs). The user wants a second mode that browses their **entire Kolbo Media Library**, the same content that appears in the kolbo.ai web app sidebar and the Adobe plugin.

The public **Media Library SDK** (`GET /v1/media`, `GET /v1/media/folders`) already exists and returns exactly the shape Canvas needs. Auth is `X-API-Key: kolbo_live_...`. We do **not** need to ask the user to paste a key: after `kolbo auth login`, the stored OAuth `access` token *is* a `kolbo_live_*` API key (see `kolbo.ts:99-102`), and the existing `/kolbo-artifact-publish` route at `global.ts:810-816` already forwards it as `X-API-Key`. We mirror that pattern.

The risk is feature-creep — the web app ships favorites, folders CRUD, trash, batch ops, NSFW blur, "use in chat", drag-out, training-lab, etc. We deliberately ship a **lean Library tab** first. Everything else is deferred.

## Scope (v1)

A second mode inside the Canvas panel: **Session** (current behavior) and **Library** (new). Default = Session per session, persisted.

`Library` shows:
- Same masonry grid + density slider + `CanvasCell` cells as Session (visual parity).
- **Project picker** (header dropdown) — lists user's projects via proxied `GET /project`, persists selection in `localStorage` under `kolbo.canvas.library.projectId`. Default = user's first project (matches publish flow). "All projects" option = omit `project_id`.
- Search input (250ms debounce → `search=` param).
- Type chips: **All · Images · Videos · Audio** (→ `type=image|video|audio`).
- Category chips: **All · AI · Uploaded · Favorites** (→ `category=ai|uploaded|favorites`).
- Folder popover (icon button): lists `/v1/media/folders`, selecting one pins a removable folder chip (→ `folder_id=`).
- **Favorites: fetch + toggle.** `is_favorited` from the response renders a filled-star badge on the cell. Hovering reveals a star button; clicking toggles via `POST /v1/media/:id/favorite` (optimistic UI, rollback on error). Star also appears on Session-mode cells whose `url` matches a known library item (best-effort, skip if too costly).
- **NSFW blur.** When `nsfw_detected === true`, the cell renders the thumbnail behind a `backdrop-filter: blur(24px)` overlay + a small "NSFW — tap to reveal" caption. Tap/click toggles reveal per-cell (session-scoped, not persisted). Lightbox opens unblurred only after reveal.
- Infinite scroll (IntersectionObserver sentinel) using `pagination.has_next`.
- Click → existing `openLightbox()`. Hover → existing `MediaCard` download.
- Source-type tag (`AI` / `UP`) in each cell's bottom-left corner.
- States: 6-tile shimmer skeleton on first page, caption row on subsequent pages, empty/error states with retry.

**Out of v1 (defer):** folder CRUD, "use in chat", batch select, sort options, drag-out into composer, edit/delete, training-lab filter.

## UX (narrow panel ~360–480px, RTL-safe)

- **Toolbar row 1**: 2-segment pill `Session · Library` (replaces current Canvas title), density slider at the far end. Pill is `role="tablist"`, arrow-key nav.
- **Toolbar row 2** (Library only): **project picker** (left, ~50% width, Kobalte `Select` — "All projects" + named projects) + **search input** (right, fills the rest, ⌘K hint when empty, 250ms debounce). Below 400px, project picker collapses to icon-only with current project name truncated.
- **Toolbar row 3** (Library only): horizontally-scrollable chip strip — type chips, 1px divider, category chips, trailing folder icon button. Chips are 22px text-only with underline-on-active (no fills). Two `role="radiogroup"`s (type, category) so SRs announce groups distinctly.
- **Cell affordances** (Library only): top-right hover slot holds the favorite star (filled when `is_favorited`); bottom-left holds the source-type tag (`AI` / `UP`). NSFW cells render a blur layer + "Reveal" caption that intercepts click until acknowledged.
- **Body**: existing masonry; same density slider applies. Result-count announced via a polite live region after each fetch.
- **RTL**: mirror row order via existing `rtl()` helper + `flex-direction: row-reverse`; density slider, project picker, and cell tag positions mirror.

Rationale: chips (not a category dropdown) because A/B-ing AI vs Uploaded is the dominant Library task — two taps via dropdown kills exploration. Cost is one extra row, cheap in a tall panel.

## Backend — four proxy routes

**File:** `packages/opencode/src/server/routes/global.ts`

Add four routes next to the existing `/kolbo-artifact-publish` route (`global.ts:788-843`). All follow that route's auth + error-mapping pattern verbatim, only the upstream URL/verb differs:

```
GET  /kolbo-media
  query: project_id?, folder_id?, type?, category?, source?, search?, sort?, page?, page_size?
  → forwards to `${Partner.apiBase}/v1/media?<query>` with X-API-Key

GET  /kolbo-media-folders
  → forwards to `${Partner.apiBase}/v1/media/folders` with X-API-Key

POST   /kolbo-media/:id/favorite   → POST   ${apiBase}/v1/media/:id/favorite   (adds, idempotent)
DELETE /kolbo-media/:id/favorite   → DELETE ${apiBase}/v1/media/:id/favorite   (removes, idempotent)
  → kolbo-api ships idempotent POST=add / DELETE=remove. No combined toggle.
    Client decides verb based on current `is_favorited` state (with optimistic
    override map for rollback on error).

GET  /kolbo-projects
  → forwards to `${Partner.apiBase}/project` with X-API-Key
  → returns the user's projects list (drives the project picker; same source
    artifact.ts:49 uses to auto-pick projects[0]._id)
```

Auth resolution: `Auth.get(Partner.authProviderID) ?? Auth.get(Partner.authProviderIDLegacy)` → extract `apiKey` from `auth.type === "oauth" ? auth.access : auth.type === "api" ? auth.key`. If absent → 401 `{ error: { type: "auth" } }` (client renders "Sign in to Kolbo" state, same UX as artifact publish failure).

No retry/cache logic in v1 — let the client `createResource` and SDK rate-limiter (300 req/min / IP) handle it.

## Frontend — extend Canvas + new view

**Files:**

| Path | Change |
|---|---|
| `packages/app/src/pages/session/session-canvas.tsx` | (a) Extract `CanvasCellView`, masonry layout, density slider, and `openLightbox()` into module-scope helpers (already mostly factored — just expose). (b) Read `view().canvas.mode()` and render `<LibraryView/>` when `mode === "library"`, else current code. (c) Render the new 2-segment pill in the toolbar (replacing the title). Keep `canvasFit` signal — applies to both modes. |
| `packages/app/src/pages/session/canvas-library-view.tsx` *(new)* | The Library mode. Owns: filters signal `{ projectId, search, type, category, folderId }` (debounced search), a `createResource` per filters tuple that calls `/api/global/kolbo-media`, a `pages: Item[][]` signal accumulating pages, an IntersectionObserver sentinel that bumps `page` when `has_next`, a `Set<string>` of `revealedNsfw` ids (session-scoped), a `Map<id, boolean>` of optimistic `favoriteOverrides` for toggle UI. Project picker fetches `/api/global/kolbo-projects` once and caches in a module-scope signal; persists selected `projectId` to `localStorage` (`kolbo.canvas.library.projectId`). Reuses exported `CanvasCellView` via a thin `LibraryCellView` wrapper that adds the favorite star, NSFW blur overlay, and source-type tag. |
| `packages/app/src/context/layout.tsx` | Extend the `canvas` namespace (`layout.tsx:877-901`) with `mode: () => "session" \| "library"` + `setMode(next)`. Mirror the `gridCols` / `dismissed` pattern. Add `canvasMode?: "session" \| "library"` to `SessionView` (line ~48). |
| `packages/app/src/i18n/en.ts` | New keys (canvas-related keys live around `en.ts:564-574`): `canvas.tab.session`, `canvas.tab.library`, `canvas.library.empty.title`, `canvas.library.empty.caption.filtered`, `canvas.library.empty.caption.default`, `canvas.library.search.placeholder`, `canvas.library.project.all`, `canvas.library.project.pick`, `canvas.library.filter.type.{all,images,videos,audio}`, `canvas.library.filter.category.{all,ai,uploaded,favorites}`, `canvas.library.folder.pick`, `canvas.library.favorite.add`, `canvas.library.favorite.remove`, `canvas.library.nsfw.hidden`, `canvas.library.nsfw.reveal`, `canvas.library.error`, `canvas.library.retry`, `canvas.library.signedOut`. Run `translation-master` agent for the 11 other locales. |
| `packages/opencode/src/server/routes/global.ts` | Add `GET /kolbo-media`, `GET /kolbo-media-folders`, `POST /kolbo-media/:id/favorite`, `GET /kolbo-projects` proxies (see backend section). |

**Reuses (no new code):**
- `CanvasCellView` for grid cells.
- Masonry layout + density slider already in `session-canvas.tsx` (`columnBuckets` lines 503-509; density slider lines 565-581).
- Existing `openLightbox()` (`session-canvas.tsx:176`).
- Existing `MediaCard` (`@opencode-ai/ui/media-card`) for download.
- Existing `kolbo:open-canvas` event so the header Canvas button keeps working.
- Existing Kobalte `Popover` (used in model picker) for folder dropdown.

**`BackendMediaItem → CanvasCell` mapping:**
```
{
  key: item.id,
  messageID: "library",
  partID: item.id,
  tool: "library",
  completedAt: new Date(item.created_at).getTime(),
  media: [{ url: item.url, kind: item.type as MediaKind }],
}
```
The `thumbnail_url` is passed alongside so `MediaCard` shows the thumb but downloads the full `url`.

## Auth — no new UI

The OAuth `access` value stored after `kolbo auth login` is already a `kolbo_live_*` API key (confirmed `kolbo.ts:99-102` + `global.ts:813`). No "paste your API key" prompt. If unauthenticated, Library renders a sign-in state ("Sign in to Kolbo to browse your library") with a button that triggers the existing auth dialog — same path the reconnect flow uses.

## Verification (end-to-end)

1. `bun dev:desktop` from repo root, sign in via `kolbo auth login` (or already signed-in build).
2. Open Canvas via the header button → confirm 2-segment pill, default `Session`, current behavior unchanged.
3. Switch to `Library` → first-page fetch hits `GET /api/global/kolbo-media` (proxy) → upstream `GET ${apiBase}/v1/media`. Verify in network tab.
4. Toggle each type chip → `type=image|video|audio` param sent.
5. Toggle each category chip → `category=ai|uploaded|favorites` param sent.
6. Type a query → 250ms debounce → `search=...` sent.
7. Open folder popover → `GET /v1/media/folders` hits → pick a folder → chip pins, `folder_id=...` sent.
8. Project picker → switching project re-fetches with new `project_id`; selection survives close/reopen via `localStorage`. "All projects" omits the param.
9. Favorites → click a cell's star → optimistic flip + `POST /v1/media/:id/favorite` → response confirms; on failure, star rolls back and toast surfaces error. Toggle `category=favorites` → grid filters to favorited items only.
10. NSFW → seed/find an item with `nsfw_detected=true` → cell renders blurred with "Reveal" caption; click reveals just that cell; lightbox respects reveal state; reload resets (session-scoped).
11. Scroll to the bottom → `page=2` fetched, items append, sentinel re-arms.
12. Click an image cell → existing lightbox opens. Hover → `MediaCard` download saves the file.
13. Close Canvas, reopen → `mode` + project selection persist.
14. RTL: toggle locale to `he` → header row, project picker, chip strip, and cell tag mirror correctly.
15. Sign out → Library shows sign-in state, no crash.
16. `bun turbo typecheck` clean.
17. Run `translation-master` for the new i18n keys.

## Upstream SDK status (as of 2026-05-15)

kolbo-api has shipped a broad media library surface. `@kolbo/mcp` v1.11.0 mirrors it as MCP tools. We call `/v1/media/*` over HTTP from the opencode server (proxy routes); MCP isn't on the critical path for this UI.

**Consumed in v1 (this plan):**
- `GET    /v1/media` — list with `project_id`, `folder_id`, `category`, `source_type`, `type`, `search`, `sort`, `page`, `page_size`. Response items include `is_favorited`, `nsfw_detected`, `prompt`, dimensions, duration, attribution.
- `GET    /v1/media/folders` — folder list (owned + shared).
- `POST   /v1/media/:id/favorite` — add (idempotent).
- `DELETE /v1/media/:id/favorite` — remove (idempotent).
- `GET    /project` — for the project picker.

**Available but deferred (post-v1):**
- Lifecycle: `GET /v1/media/:id`, `DELETE /v1/media/:id` (soft), `POST /v1/media/:id/restore`, `DELETE /v1/media/:id/permanent`, `POST /v1/media/bulk/{delete,permanent,restore,move}`, `GET /v1/media/stats`. Soft-delete with an undo toast is the most natural next-tier add — cheap to wire because the proxy pattern is identical and the UI is just one hover affordance. Bulk ops, trash view, and stats need their own UX pass.
- Folder write side: `POST/PUT/DELETE /v1/media/folders/...`, `POST/DELETE /v1/media/folders/:id/share/...`. v1 is read-only on folders.

**No upstream blockers** remain for this plan. The parallel task of updating `kolbo-docs/skills/kolbo/SKILL.md` and `claude-code-skill.mdx` to reflect the new 11 lifecycle tools is **out of scope here** — it lives in `kolbo-docs`, not in this repo, and only affects what the LLM knows when generating media calls. Track it separately.
