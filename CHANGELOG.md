# Changelog

All notable changes to Kolbo Code. Coordinates with the kolbo-api and
kolbo-mcp companion repos — entries note the cross-repo touchpoints
where relevant.

## 2.1.22 — 2026-05-16

### Visual DNA + image-gen routing
- **Smart Select bias for DNA**: when `visual_dna_ids` is present in the
  request, the kolbo-api router pool is filtered to models that can
  honor refs (DB `editingModelIdentifier` set, or `-image-editing` /
  `-edit` / `/image-to-image` / `/controlnet` convention probes). The
  router LLM only sees DNA-capable models. No more silent t2i picks
  that drop the DNA payload. (kolbo-api `imageGeneration/controller.js`,
  `referenceImageEditingIntegration.js`.)
- **Video-to-video model-type guard**: rejects image-to-video models
  (e.g. `wan-2.7-image-to-video`) when the route is
  `POST /v1/generate/video-from-video`. Returns 400 `WRONG_MODEL_TYPE`
  with a clear list of valid v2v alternatives instead of forwarding to
  KIE and getting the cryptic `"generate playground failed, task id is
  blank"` 422. Stops the credit-burning retry loop. (kolbo-api
  `videoToVideoGeneration/controller.js`.)
- **Convention fallback in routing**: when the DB record lacks
  `editingModelIdentifier`, the router probes `${id}-image-editing` /
  `${id}-edit` / `${id}/image-to-image` / `${id}/controlnet` so newly-
  added models work without manual DB backfill. Logs a warning so the
  gap is visible.

### Failure handling
- **Structured failure envelopes**: kolbo-api's
  `extractServiceErrorStructured` returns
  `{ message, category, code, retryable, severity, provider }`. The
  image-gen single-model error path saves the envelope to
  `error_details` and emits it on the FAILED websocket event so the UI
  can render precise error states.
- **SDK `getStatus` returns failure envelope**: alongside the legacy
  `error` field, MCP/SDK callers now get a `failure` object so the
  agent can branch on `content_policy` vs `auth` vs transient causes.
- **MCP polling retry-with-backoff** (kolbo-mcp v1.12.1): transient
  network errors / 5xx / 408 / 425 / 429 during status polling no
  longer abort the loop. Exponential backoff capped at 30 s, with a
  30-failure safety valve. Backend restarts mid-generation are now
  invisible to the agent.
- **Media-trim fallback**: kolbo-api's chat completion endpoint used
  to 400 when the request carried >10 media parts, killing the turn.
  Now trims to the most-recent N parts and replaces older media with a
  text breadcrumb pointing the agent at `.kolbo/production.md`. Cap
  bumped to 25 (Gemini Flash Lite handles 100+ easily).

### Canvas
- **Drag-to-prompt**: canvas cells set `text/uri-list` + `text/plain`
  on `dragstart` so dropping a cell on the prompt input attaches the
  public CDN URL by reference. No byte re-upload. Agent can pipe canvas
  outputs straight into the next generation (image → video, etc.).
- **JSON-aware URL extraction**: extracts only from designated tool-
  output fields (`urls`, `image_urls`, `video_urls`, `audio_urls`,
  `model_urls`, plus singular variants). Stops the canvas from
  duplicating echoed source URLs (video tool's `image_url` echo) or
  picking up URLs mentioned in `_followup_hint` / `prompt_used`.
- **Cross-call dedupe**: same URL appearing in multiple tool results
  earns one canvas cell — the original.
- **Drop `upload_media` + `create_visual_dna` from canvas tracking**:
  they produce echoes of user inputs, not new generations. Cleaner
  gallery.
- **Structural-equality short-circuit** in the `collected()` memo:
  unrelated tool streaming (list_media, chat, etc.) no longer flickers
  the gallery — same item refs → same wrapper object → no downstream
  invalidation.
- **Stuck pending-card filter**: pending cells whose parent assistant
  message has `time.completed` set, or that have been "running" >10
  minutes, are filtered out. No more zombie spinners for crashed
  generations.
- **Video tile fixes**: `disablepictureinpicture` + `controlslist`
  suppress the WebKit native overlay buttons that were overlapping the
  checkbox + download controls.
- **Loading-state opacity** on image tiles (fade in once decoded).
- **Shared lightbox**: canvas now uses the same video-aware lightbox
  as chat — clicking a video tile opens an in-app player with proper
  decoder cleanup on close.

### Chat / markdown rendering
- **Compact media chip system**: agent-quoted URLs (`![](url)` and
  `<a href="…">`) render as inline 32×32 thumbnails instead of full-
  width row-stacked images. Three siblings per chip: thumb (click →
  lightbox), copy-link icon, download icon. Hover-revealed actions,
  tooltips, click feedback ("Link copied" flash). Drops the old
  full-width row layout for catalog-style replies.
- **Video chip = first-frame poster**: the same `#t=0.05` +
  autoplay/muted/playsinline + pause-on-loadeddata trick the canvas
  uses; tile freezes on the first decoded frame.
- **Lazy-loading via IntersectionObserver**: video chip `<video>`
  elements defer their `src` until near the viewport. A message with
  6+ videos no longer fires 6 simultaneous MB downloads on render.
- **Video lightbox**: the in-app overlay now handles video too —
  `<video controls autoplay>` with proper close handler that pauses,
  clears `src`, and calls `load()` so WebKit releases the decoder.
- **Grid grouping**: consecutive media-only blocks fold into a single
  flex-wrap row instead of N full-width paragraphs.
- **Per-block auto bidi direction**: each `<p>`, `<li>`, `<h*>`, etc.
  gets `dir="auto"` so Hebrew/English mixed messages flow per-block in
  the natural direction. CSS converted to logical properties
  (`text-align: start`, `padding-inline-start/end`) so text-align no
  longer forces all blocks to the root's direction.

### Credits — real-time refresh
- **Desktop**: `prompt-input.tsx` now refreshes balance + media spend
  the moment a Kolbo MCP tool completes (createMemo on completed-tool
  count, scoped to the most recent assistant message to avoid O(M*P)
  scans on long sessions). No more 12-second polling lag after a
  generation lands.
- **TUI**: sidebar context subscribes to `message.part.updated`
  events from the plugin event bus; same eager refresh as desktop.

### Prompt input
- **Drop URL → attach by reference**: drag a media URL from the
  canvas onto the prompt input → attachment is created with
  `publicUrl` set directly (no upload). Agent receives the same URL as
  input for downstream tools.
- **Video attachment first-frame poster**: replaces `autoplay loop`
  (continuous decode, slow black start) with the shared first-frame
  helper. Tiles show their first decoded frame in <1 s.

### Mid-turn agent runtime override (server-side only, gated)
- New `Session.runtimeAgent` field (SQLite column +
  `setRuntimeAgent()` Effect method + drizzle migration). Session loop
  re-reads the session each step and uses
  `sessionLive.runtimeAgent ?? lastUser.agent`, so a future composer-
  dock / TUI keybind that flips plan ↔ build ↔ auto-approve will take
  effect on the next loop step instead of the next user message. **HTTP
  route + UI hookups still pending** — schema is in place but no user-
  facing change yet.

### Kolbo Skill (`SKILL.md`)
- **Failure detection** (CRITICAL): three failure modes (explicit
  error, completed-with-no-URL, timeout-or-hang), recovery via
  `get_generation_status`, never claim success before verifying URLs.
- **Reading failure envelopes**: branch on `failure.category` /
  `failure.retryable` (content_policy → rephrase, auth → reconnect,
  transient → retry).
- **Multi-output → `generate_creative_director` by default**: when the
  user wants ≥2 related outputs, prefer the director (one brief, N
  coherent scenes, parallel internally) over parallel
  `generate_image` calls. Only use parallel `generate_image` when the
  user dictates per-image prompts word-for-word.
- **Character-driven video — frames first**: generate stills via
  `generate_creative_director` + `visual_dna_ids` first; confirm with
  user; then animate each frame via `generate_video_from_image`. Don't
  jump straight from DNA to `generate_elements`/`generate_video`.
- **Video-EDITING → ONE call**: explicit override of frames-first when
  the user references an existing video and asks to modify it. Single
  `generate_video_from_video` call. Lists valid v2v model identifiers,
  warns against picking image-to-video models for v2v.
- **Runaway-loop guard**: 3+ same-tool calls in a turn = stop, surface
  what you have. Don't auto-retry on success. Don't speculatively fire
  multiple expensive video calls.
- **Don't re-fetch own outputs** (CRITICAL): no `list_media`,
  `get_media`, `chat_send_message`-with-media_urls on URLs you just
  generated. Generated URLs are already in `.kolbo/production.md` +
  the canvas.
- **Visual DNA routing**: documents that `visual_dna_ids` alone is
  sufficient — server expands DNA into refs and auto-routes to the
  edit variant.

### Code reuse / single source of truth
- **`kolbo-media.ts` shared module** (`packages/ui/src/components/`):
  central home for `KOLBO_OUTPUT_FIELDS`, `extractKolboUrls`,
  `KOLBO_VIDEO_EXT_RE`, `isVideoUrl`, `firstFramePosterSrc`,
  `pauseOnFirstFrame`, `openKolboLightbox`. Replaces 4 duplicate copies
  of the URL-extraction logic, 3 inconsistent video regexes (the
  canvas one was missing `.ogv`), and 2 lightbox implementations.
- **Canonical SKILL.md import**: removed the 92-line inline
  `KOLBO_SKILL_MD` stub from `providers.ts`. Both `providers.ts` and
  `mcp/wire.ts` now import the canonical
  `packages/opencode/skills/kolbo/SKILL.md` via
  `with { type: "text" }`. No more drift between the trimmed stub and
  the real ~1500-line SKILL.
- **`md.d.ts`**: TypeScript module declaration for `*.md` imports.

### Known follow-ups (NOT in this version)
- Runtime agent HTTP route + desktop dock + TUI keybind hookups.
- Imperative lightbox + chip DOM construction could be Solid
  components — current state is functional but verbose.
- Hard server-side cap on same-tool concurrency per turn as a belt-
  and-suspenders backstop against agent loops (the SKILL guidance is
  the soft fix).
