import { For, Index, Show, createEffect, createMemo, createSignal, onCleanup, onMount, type Accessor } from "solid-js"
import { useSync } from "@/context/sync"
import { useLanguage } from "@/context/language"
import { useServer } from "@/context/server"
import { useSessionLayout } from "@/pages/session/session-layout"
import { AudioWavePlayer, fmt } from "@/pages/session/audio-wave-player"
import { CanvasLibraryView } from "@/pages/session/canvas-library-view"
import { MediaCard } from "@opencode-ai/ui/media-card"
import { usePlatformOps } from "@opencode-ai/ui/context/platform-ops"
import { Mark } from "@opencode-ai/ui/logo"
import { showToast } from "@opencode-ai/ui/toast"
import { useTheme } from "@opencode-ai/ui/theme/context"
import type { Part, ToolPart, ToolStateCompleted } from "@opencode-ai/sdk/v2"
import { isVideoUrl, mediaKey, openKolboLightbox, startMediaDrag } from "@opencode-ai/ui/kolbo-media"
import { type Operation } from "@opencode-ai/ui/kolbo-operation"
import { isGenerationPart, partOp, pendingStartedAt, pendingStuck, stillPending, urlsForCanvas, urlsFromPart } from "./session-canvas-media"
import { allDead, allFound, watch } from "./session-gen-watch"
import { runStart } from "./session-run-clock"

export { isGenerationPart, urlsFromPart }

type MediaKind = "image" | "video" | "audio" | "model"

function classifyUrl(url: string): MediaKind {
  if (isVideoUrl(url)) return "video"
  const lower = url.split("?")[0].toLowerCase()
  if (/\.(mp3|wav|ogg|m4a|flac|aac)$/i.test(lower)) return "audio"
  if (/\.(glb|gltf|fbx|obj|usdz|stl|ply)$/i.test(lower)) return "model"
  return "image"
}

type CanvasMedia = { url: string; kind: MediaKind }

type CanvasCell = {
  key: string
  messageID: string
  partID: string
  tool: string
  completedAt: number
  media: CanvasMedia[]
}

type PendingCell = {
  key: string
  tool: string
  kind: "image" | "video" | "audio" | "model"
  messageID: string
  partID: string
  startedAt: number
}

function pendingKind(op?: Operation): PendingCell["kind"] {
  if (op?.kind === "audio") return "audio"
  if (op?.kind === "video") return "video"
  if (op?.kind === "model3d") return "model"
  return "image"
}

function mediaKind(op: Operation | undefined, url: string): MediaKind {
  if (op?.kind === "audio") return "audio"
  if (op?.kind === "video") return "video"
  if (op?.kind === "model3d") return "model"
  return classifyUrl(url)
}

export function hasKolboMediaInSession(parts: Part[][]): boolean {
  for (const list of parts) {
    if (!list) continue
    for (const part of list) {
      if (part.type !== "tool") continue
      if (!isGenerationPart(part as ToolPart)) continue
      return true
    }
  }
  return false
}

// Cap on how long a still-"running" tool part can persist as a pending cell
// lives in session-canvas-media (PENDING_STUCK_MS / pendingStuck).

function collectCanvasCells(
  messages: { id: string; completedAt?: number }[],
  partsByMessage: Record<string, Part[] | undefined>,
  recovered: Record<string, string[]> = {},
  dead: Record<string, true> = {},
): { cells: CanvasCell[]; pending: PendingCell[] } {
  const cells: CanvasCell[] = []
  const pending: PendingCell[] = []
  const now = Date.now()
  // Track which media has already been added so we don't show the same asset
  // twice. Dedupe by the stored FILENAME (path basename), not the full URL:
  // the same generated file can come back from more than one tool with a
  // different host (raw bucket vs media.kolbo.ai CDN) or different signed
  // query params — e.g. a video returned by both generate_video and the
  // get_generation_status recovery. Exact-URL matching would miss those and
  // render a duplicate cell; the filename carries a per-generation hash so it
  // is unique per asset and safe to key on.
  const seenKeys = new Set<string>()
  for (const message of messages) {
    const parts = partsByMessage[message.id]
    if (!parts) continue
    // If the parent assistant message has completed (success OR fail), any
    // tool part still in a non-terminal state is stuck — the message won't
    // produce another state update for it. Used below to filter pending.
    const messageDone = typeof message.completedAt === "number"
    for (const part of parts) {
      if (part.type !== "tool") continue
      const tool = part as ToolPart
      if (!isGenerationPart(tool)) continue
      const state = tool.state
      const op = partOp(tool)
      const urls = urlsForCanvas(tool, recovered)
      if (urls.length) {
        const completed = state as ToolStateCompleted
        const ended = state.status === "completed" ? completed.time.end : Date.now()
        urls.forEach((url, idx) => {
          // Cross-call dedupe keyed on the filename so the same asset from a
          // different host / query / tool (e.g. a generated image fed into
          // `generate_video_from_image`, or a video echoed by its
          // get_generation_status recovery) only earns one cell.
          // Two keys, because filename alone isn't enough: the same generation
          // echoed by a recovery call (generate_* times out → get_generation_status
          // returns it) can come back under a different filename entirely — a
          // provider URL first, the Kolbo CDN copy second. The generation id is
          // the same in both, so it catches what the filename misses.
          const key = mediaKey(url)
          const genKey = op?.id ? `gen:${op.id}:${idx}` : undefined
          if (seenKeys.has(key)) return
          if (genKey && seenKeys.has(genKey)) return
          seenKeys.add(key)
          if (genKey) seenKeys.add(genKey)
          cells.push({
            key: `${tool.id}:${idx}`,
            messageID: message.id,
            partID: tool.id,
            tool: tool.tool,
            completedAt: ended,
            media: [{ url, kind: mediaKind(op, url) }],
          })
        })
      } else if (state.status === "error") {
        // skip
      } else if (stillPending(tool, recovered, dead)) {
        const startedAt = pendingStartedAt(tool) ?? now
        // Timed-out generate_* is "completed" with no URLs — keep the spinner
        // while recovery runs, but drop abandoned / clock-less zombies.
        if (pendingStuck(tool, { messageDone, now, recovered, startedAt, dead })) continue
        pending.push({
          key: tool.id,
          tool: tool.tool,
          kind: pendingKind(op),
          messageID: message.id,
          partID: tool.id,
          startedAt,
        })
      }
    }
  }
  cells.sort((a, b) => b.completedAt - a.completedAt)
  pending.sort((a, b) => b.startedAt - a.startedAt)
  return { cells, pending }
}

// Canvas reuses the shared lightbox (imported as openKolboLightbox above)
// — it's video-aware, so video cells get a proper player overlay instead
// of opening in a new tab.
const openLightbox = openKolboLightbox

function filenameForMedia(media: CanvasMedia, tool: string, partID: string): string {
  const tail = media.url.split("?")[0].split("/").pop()
  if (tail) return tail
  const ext = media.kind === "video" ? "mp4" : media.kind === "audio" ? "mp3" : media.kind === "model" ? "glb" : "png"
  return `${tool}-${partID}.${ext}`
}

// Shared dark/light detector for media overlay buttons. Reads the theme
// context once at module scope so cells can share a single signal.
function useIsDarkTheme() {
  const theme = useTheme()
  return () => {
    const scheme = theme.colorScheme()
    if (scheme === "dark") return true
    if (scheme === "light") return false
    if (typeof window === "undefined") return false
    return window.matchMedia("(prefers-color-scheme: dark)").matches
  }
}

// ─── Batch selection state (session-scoped via SessionCanvas mount) ───────────
// Batch mode + selected URL set. Kept at module scope so the state survives
// Kobalte popover unmount cycles when the side panel collapses/reopens.
const [batchMode, setBatchMode] = createSignal(false)
const [selectedUrls, setSelectedUrls] = createSignal<Set<string>>(new Set<string>())

function toggleSelected(url: string) {
  setSelectedUrls((prev) => {
    const next = new Set<string>(prev)
    if (next.has(url)) next.delete(url)
    else next.add(url)
    return next
  })
  // If the user just deselected the last item, drop out of batch mode so
  // they can interact with cells (lightbox / hover) normally again.
  if (selectedUrls().size === 0) setBatchMode(false)
}

function clearSelection() {
  setSelectedUrls(new Set<string>())
}

function exitBatchMode() {
  clearSelection()
  setBatchMode(false)
}

// Per-session set of canvas media URLs the user has hidden ("delete from
// canvas"). This is a soft hide — the underlying generation/tool result is
// untouched, just filtered out of the canvas view. Persisted to localStorage
// so it survives reload. Signal-backed so filtering reacts instantly.
const HIDDEN_KEY_PREFIX = "kolbo-canvas-hidden:"
function loadHidden(sessionID: string): Set<string> {
  try {
    const raw = localStorage.getItem(HIDDEN_KEY_PREFIX + sessionID)
    if (!raw) return new Set()
    const arr = JSON.parse(raw)
    return new Set(Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : [])
  } catch {
    return new Set()
  }
}
function saveHidden(sessionID: string, set: Set<string>) {
  try {
    localStorage.setItem(HIDDEN_KEY_PREFIX + sessionID, JSON.stringify([...set]))
  } catch {}
}

// ─── Cell ─────────────────────────────────────────────────────────────────────

function favKey(url: string) {
  let s = url.trim()
  if (s.startsWith("http://")) s = "https://" + s.slice(7)
  const i = s.search(/[?#]/)
  return i === -1 ? s : s.slice(0, i)
}

function CanvasCellView(props: {
  cell: CanvasCell
  onHide?: (url: string) => void
  favorited?: boolean
  onFavorite?: () => void
}) {
  const cellLang = useLanguage()
  // Each cell now holds exactly ONE media item; no slider/index/grouping.
  // Aspect ratio is resolved BEFORE the visible <img>/<video> mounts via
  // pre-decode (see effect below). This means the cell renders at its
  // correct shape on first paint — no placeholder snap, no column reflow
  // when the image finishes loading.
  //
  // Performance: at 500+ cells, pre-decoding all of them and rendering all
  // <img>/<video> elements upfront would saturate the browser. The cell
  // uses content-visibility:auto (browser-level skip-paint for off-screen
  // elements) PLUS an IntersectionObserver gate — pre-decode and the
  // visible media element only mount once the cell scrolls within ~800px
  // of the viewport. Once mounted, cells stay mounted (one-shot reveal)
  // so scrolling back doesn't re-fetch.
  const [aspect, setAspect] = createSignal<number | null>(null)
  const [revealed, setRevealed] = createSignal(false)
  // Loaded = first frame / image decode has actually landed. While
  // false (and revealed), the cell shows a spinner overlay so the user
  // sees feedback instead of a stalled-looking black tile + play
  // button. Reset to false whenever the source URL changes so the
  // spinner reappears for the new media.
  const [mediaLoaded, setMediaLoaded] = createSignal(false)
  createEffect(() => {
    // Track URL changes — accessing props.cell.media[0]?.url makes this
    // memo reactive, so a swapped URL re-shows the spinner.
    void props.cell.media[0]?.url
    setMediaLoaded(false)
  })
  const isDark = useIsDarkTheme()
  let cellRoot: HTMLDivElement | undefined

  const current = createMemo(() => props.cell.media[0])
  const currentAspect = createMemo(() => {
    const m = current()
    if (!m) return 1
    if (m.kind === "audio") return 16 / 2.5
    if (m.kind === "model") return 1
    return aspect() ?? 1
  })

  const setAspectFor = (ratio: number) => {
    if (!isFinite(ratio) || ratio <= 0) return
    if (aspect() != null) return
    setAspect(ratio)
  }

  // IntersectionObserver gate: `revealed` tracks live visibility within
  // ~1500px of viewport (about 2 screens of overscan in either direction).
  // When scrolled FAR out, revealed flips back to false and the video
  // element unmounts — frees the decoder, drops the metadata buffer, and
  // (critically) bounds total memory regardless of session size. The
  // cached `aspect()` signal survives the unmount so the placeholder
  // shows at the right shape and re-entering doesn't reflow.
  //
  // onMount (not createEffect) so it runs AFTER the ref binding settles
  // — createEffect could run before cellRoot is set and miss its first
  // observation chance.
  onMount(() => {
    if (!cellRoot) {
      setRevealed(true)
      return
    }
    if (typeof IntersectionObserver === "undefined") {
      setRevealed(true)
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          setRevealed(e.isIntersecting)
        }
      },
      { rootMargin: "1500px 0px", threshold: 0 },
    )
    io.observe(cellRoot)
    onCleanup(() => io.disconnect())
  })

  // Pre-decode the IMAGE off-DOM so we know its aspect ratio before the
  // visible <img> mounts. This avoids the "1:1 → real aspect" snap when
  // the image finishes loading. Gated on revealed() — no off-screen work.
  //
  // Videos used to do this too, but spinning up an off-DOM <video> just
  // to read videoWidth/videoHeight doubles the live decoder count for
  // every video cell (WebKit caps concurrent <video>s ~16) and risks a
  // partial leak if the load never resolves. The visible <video> already
  // reports its aspect via onLoadedMetadata on render, so the off-DOM
  // probe was pure waste.
  createEffect(() => {
    if (!revealed()) return
    const m = current()
    if (!m) return
    if (m.kind !== "image") return // video → visible element handles aspect
    if (aspect() != null) return // already known
    let alive = true
    const img = new Image()
    img.decoding = "async"
    img.src = m.url
    img
      .decode()
      .then(() => {
        if (!alive) return
        if (img.naturalWidth > 0 && img.naturalHeight > 0) {
          setAspectFor(img.naturalWidth / img.naturalHeight)
        }
      })
      .catch(() => {
        // decode() rejects for some formats; the visible <img>'s own onLoad
        // will resolve aspect as a fallback.
      })
    onCleanup(() => {
      alive = false
    })
  })

  const isSelected = createMemo(() => {
    const m = current()
    return m ? selectedUrls().has(m.url) : false
  })

  const handlePrimaryClick = (url: string) => {
    if (batchMode()) {
      toggleSelected(url)
    } else {
      openLightbox(url)
    }
  }

  return (
    <div
      ref={cellRoot}
      class="group relative rounded-xl overflow-hidden bg-background-base transition-all duration-200 ease-out kolbo-canvas-cell"
      classList={{ "kolbo-canvas-cell-selected": isSelected() }}
      style={
        current()?.kind === "audio"
          // Audio cells use a fixed height instead of an aspect-ratio so
          // they don't grow tall (and empty) at wide column counts or crop
          // the controls at narrow ones. The player has a known intrinsic
          // height; just match it.
          ? { height: "72px" }
          : { "aspect-ratio": currentAspect().toString() }
      }
      // Drag-to-prompt: the cell's URL is already a public Kolbo CDN
      // link, so dropping it on the prompt input attaches it BY
      // REFERENCE — no re-upload of bytes. Existing drop handler in
      // packages/app/src/components/prompt-input/attachments.ts reads
      // text/uri-list and short-circuits the upload path when the URL
      // is http(s). This means the agent can pipe canvas outputs
      // directly into the next generation (image → video, etc.)
      // without round-tripping through file bytes.
      draggable={true}
      onDragStart={(e) => {
        e.stopPropagation()
        startMediaDrag(e.dataTransfer, current()?.url ?? "")
      }}
      // Right-click → copy the public CDN URL. Audio cells in particular
      // had no other way to grab the link (image/video use the browser's
      // native context menu on the <img>/<video>, but the AudioWavePlayer
      // is custom and intercepts that). Override at the cell level so all
      // three media kinds behave identically.
      onContextMenu={(e) => {
        const url = current()?.url
        if (!url) return
        e.preventDefault()
        void navigator.clipboard
          .writeText(url)
          .then(() => showToast({ variant: "success", icon: "circle-check", title: "Link copied" }))
          .catch(() => showToast({ variant: "error", title: "Couldn't copy link" }))
      }}
    >
      <Show when={revealed() && current()} keyed>
        {(m) => (
          <MediaCard
            src={m.url}
            path={m.url}
            filename={filenameForMedia(m, props.cell.tool, props.cell.partID)}
            // Audio cells are short and own their full horizontal layout
            // (play / time / waveform / integrated download). The hover-
            // revealed corner buttons collide with player content at narrow
            // column counts, so we suppress them and let the player provide
            // its own download control.
            hideHoverButtons={m.kind === "audio"}
            onRemove={props.onHide ? () => props.onHide!(m.url) : undefined}
            removeLabel={cellLang.t("canvas.hide.tooltip")}
          >
            <div class="relative size-full">
              <Show when={m.kind === "image"}>
                <button
                  type="button"
                  onClick={(e) => {
                    if (batchMode()) {
                      e.preventDefault()
                      e.stopPropagation()
                    }
                    handlePrimaryClick(m.url)
                  }}
                  aria-label={props.cell.tool}
                  class="block size-full p-0 m-0 border-0 bg-transparent"
                  classList={{ "cursor-zoom-in": !batchMode(), "cursor-pointer": batchMode() }}
                >
                  <img
                    src={m.url}
                    alt={props.cell.tool}
                    loading="lazy"
                    onLoad={(e) => {
                      const img = e.currentTarget
                      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
                        setAspectFor(img.naturalWidth / img.naturalHeight)
                      }
                      setMediaLoaded(true)
                    }}
                    style={{
                      display: "block",
                      width: "100%",
                      height: "100%",
                      "object-fit": "cover",
                      background: "var(--surface-recess-base)",
                      transition: "transform 0.4s cubic-bezier(0.22,1,0.36,1), opacity 0.2s ease",
                      opacity: mediaLoaded() ? 1 : 0,
                    }}
                    class="group-hover:scale-[1.03]"
                  />
                </button>
              </Show>
              <Show when={m.kind === "video"}>
                {(() => {
                  // Show first-frame poster + play overlay until user clicks
                  // play. Browsers render the first frame as the visible
                  // content of a <video preload="metadata"> that hasn't been
                  // played. We just hide the controls and add a centered play
                  // button on top. On click, we flip `playing` which reveals
                  // native controls and auto-plays the video. The same
                  // <video> element stays mounted so the seek position +
                  // decoded metadata are preserved.
                  const [playing, setPlaying] = createSignal(false)
                  let videoRef: HTMLVideoElement | undefined
                  return (
                    <div
                      class="relative size-full"
                      classList={{ "cursor-zoom-in": !playing() && !batchMode(), "cursor-pointer": !playing() && batchMode() }}
                      onClick={(e) => {
                        if (playing()) return
                        e.preventDefault()
                        e.stopPropagation()
                        handlePrimaryClick(m.url)
                      }}
                    >
                      <video
                        ref={videoRef}
                        // URL fragment `#t=0.05` positions playback at
                        // 0.05s. autoplay+muted+playsinline satisfies
                        // every engine's autoplay policy and forces the
                        // decoder to actually produce a frame (preload
                        // alone fetches container data, no frames).
                        // onLoadedData pauses + freezes on that frame.
                        // The user reads the frozen frame as a poster;
                        // clicking play unmutes and resumes from there.
                        //
                        // Perf: paired with the IntersectionObserver
                        // reveal gate (revealed()), only ~20–40 cells
                        // are mounted at once, regardless of session
                        // size. Scrolling unmounts far-away cells so
                        // memory stays bounded.
                        src={m.url.includes("#") ? m.url : `${m.url}#t=0.05`}
                        preload="auto"
                        muted
                        playsinline
                        autoplay
                        controls={playing()}
                        // WebKit/macOS pops a floating "Start PiP" button
                        // top-left and an audio-toggle top-right on hover —
                        // these collide with our checkbox + download
                        // buttons. Disable PiP and strip the overflow
                        // controls (CSS in the canvas-cell style block
                        // also hides the WebKit PiP placeholder element).
                        disablepictureinpicture
                        controlslist="nodownload noremoteplayback noplaybackrate"
                        onLoadedMetadata={(e) => {
                          const v = e.currentTarget
                          if (v.videoWidth > 0 && v.videoHeight > 0) {
                            setAspectFor(v.videoWidth / v.videoHeight)
                          }
                        }}
                        onLoadedData={(e) => {
                          if (playing()) return
                          const v = e.currentTarget
                          // Just pause — do NOT change preload to "none".
                          // Setting preload="none" after pause evicts the
                          // decoded frame buffer on WebKit, sending the
                          // tile back to black. The browser's own memory
                          // pressure handler will release decoded frames
                          // when actually needed; we don't need to hint
                          // it manually.
                          try { v.pause() } catch {}
                        }}
                        style={{
                          display: "block",
                          width: "100%",
                          height: "100%",
                          "object-fit": "cover",
                          background: "var(--surface-recess-base)",
                        }}
                      />
                      <Show when={!playing()}>
                        <button
                          type="button"
                          aria-label={`Play ${props.cell.tool}`}
                          onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            setPlaying(true)
                            // Unmute on user gesture + start playback. Both
                            // need to happen in the same microtask the click
                            // lands in, or autoplay policy will block.
                            const v = videoRef
                            if (v) {
                              v.muted = false
                              void v.play().catch(() => {
                                // If unmuted playback is blocked, fall back to
                                // muted — at least the video starts visible
                                // while the user can manually unmute via the
                                // native controls.
                                v.muted = true
                                void v.play().catch(() => {})
                              })
                            }
                          }}
                          class="absolute inset-0 flex items-center justify-center cursor-pointer group/play"
                          style="background:linear-gradient(180deg, color-mix(in srgb, #000 0%, transparent) 0%, color-mix(in srgb, #000 30%, transparent) 100%)"
                        >
                          <span
                            aria-hidden="true"
                            class="flex items-center justify-center transition-transform duration-150 ease-out group-hover/play:scale-110"
                            style="width:56px;height:56px;border-radius:50%;background:color-mix(in srgb, #000 55%, transparent);backdrop-filter:blur(4px);box-shadow:0 4px 18px color-mix(in srgb, #000 35%, transparent);border:1px solid color-mix(in srgb, #fff 18%, transparent)"
                          >
                            <svg width="22" height="22" viewBox="0 0 22 22" fill="#fff" style="margin-left:3px">
                              <path d="M5 3.5v15l13-7.5L5 3.5Z" />
                            </svg>
                          </span>
                        </button>
                      </Show>
                    </div>
                  )
                })()}
              </Show>
              <Show when={m.kind === "audio"}>
                <AudioWavePlayer
                  src={m.url}
                  onDownload={() => {
                    // Anchor-tag download — handles data: and same-origin
                    // URLs natively; for cross-origin without a CORS header
                    // the browser opens the URL in a new tab, which is the
                    // expected fallback for our CDN-hosted assets.
                    const a = document.createElement("a")
                    a.href = m.url
                    a.download = filenameForMedia(m, props.cell.tool, props.cell.partID)
                    a.rel = "noopener noreferrer"
                    a.target = "_blank"
                    document.body.appendChild(a)
                    a.click()
                    document.body.removeChild(a)
                  }}
                />
              </Show>
              <Show when={m.kind === "model"}>
                <a
                  href={m.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  class="size-full flex flex-col items-center justify-center gap-3 text-text-base hover:text-text-strong transition-colors"
                  style="background:linear-gradient(135deg, var(--background-stronger) 0%, var(--surface-recess-base) 100%)"
                >
                  <div
                    style="width:54px;height:54px;border-radius:14px;display:flex;align-items:center;justify-content:center;background:color-mix(in srgb, var(--text-base) 5%, transparent);border:1px solid color-mix(in srgb, var(--text-base) 10%, transparent)"
                  >
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                      <path d="M12 2 3 7v10l9 5 9-5V7l-9-5Zm0 0v20M3 7l9 5 9-5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" />
                    </svg>
                  </div>
                  <span class="text-[10px] font-semibold tracking-[0.16em] uppercase text-text-weak">
                    {m.url.split(".").pop()?.split("?")[0]?.toUpperCase() ?? "3D"}
                  </span>
                </a>
              </Show>
            </div>
          </MediaCard>
        )}
      </Show>

      {/* Selection checkbox — rounded square, high-contrast white-on-image
          with shadow ring so it pops on any photo. Always visible in batch
          mode, fades in on cell hover otherwise. For audio cells (short and
          dominated by the player) we suppress the hover-only appearance so
          the checkbox doesn't strobe over the play button — it only shows
          when actually in batch mode or already selected. */}
      <Show when={current()} keyed>
        {(m) => (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              if (!batchMode()) setBatchMode(true)
              toggleSelected(m.url)
            }}
            aria-label={isSelected() ? "Deselect" : "Select"}
            aria-pressed={isSelected()}
            class="absolute z-20 flex items-center justify-center transition-all duration-150"
            classList={{
              // Image/video: top-left corner. Audio: vertically centered on
              // the left so it sits inline with the play button instead of
              // colliding with it (the cell is only 72px tall).
              "top-2 left-2": m.kind !== "audio",
              "top-1/2 -translate-y-1/2 left-1.5": m.kind === "audio",
              "opacity-100": batchMode() || isSelected(),
              "opacity-0 group-hover:opacity-100": !batchMode() && !isSelected(),
            }}
            style={isSelected()
              ? "width:22px;height:22px;border-radius:6px;background:var(--surface-info-base);color:var(--text-on-info-base, #fff);border:1px solid color-mix(in srgb, var(--surface-info-base) 50%, #fff);box-shadow:0 1px 2px rgba(0,0,0,0.06), 0 6px 14px color-mix(in srgb, var(--surface-info-base) 35%, transparent)"
              : isDark()
                ? "width:22px;height:22px;border-radius:6px;background:rgba(28,28,32,0.78);color:rgba(255,255,255,0.92);border:1px solid rgba(255,255,255,0.18);backdrop-filter:blur(8px) saturate(140%);-webkit-backdrop-filter:blur(8px) saturate(140%);box-shadow:0 1px 2px rgba(0,0,0,0.30), 0 6px 16px rgba(0,0,0,0.40)"
                : "width:22px;height:22px;border-radius:6px;background:rgba(255,255,255,0.92);color:#18181b;border:1px solid rgba(0,0,0,0.08);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);box-shadow:0 1px 2px rgba(0,0,0,0.06), 0 6px 16px rgba(0,0,0,0.18)"}
          >
            <Show when={isSelected()}>
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                <path d="M3.5 8.5l3 3 6-6" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </Show>
          </button>
        )}
      </Show>
      <Show when={props.onFavorite && current()}>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            props.onFavorite?.()
          }}
          class="kolbo-fav-btn absolute z-20 flex items-center justify-center size-[28px] rounded-full transition-all duration-150"
          classList={{
            "top-2 left-[36px]": current()?.kind !== "audio",
            "top-1/2 -translate-y-1/2 left-10": current()?.kind === "audio",
            "opacity-100": !!props.favorited,
            "opacity-0 group-hover:opacity-100": !props.favorited,
          }}
          style="background:rgba(0,0,0,0.78);border:1px solid rgba(255,255,255,0.18);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);box-shadow:0 4px 16px rgba(0,0,0,0.4)"
          title={props.favorited ? cellLang.t("canvas.library.favorite.remove") : cellLang.t("canvas.library.favorite.add")}
          aria-pressed={!!props.favorited}
        >
          <Show
            when={props.favorited}
            fallback={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.85)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
            }
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="#eab308" stroke="none">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
          </Show>
        </button>
      </Show>
    </div>
  )
}

// Shared 1Hz ticker for all PendingCellView elapsed counters. One interval
// for the whole app instead of one per cell — N parallel generations no
// longer mean N timers + N signal writes per second.
const [sharedTickNow, setSharedTickNow] = createSignal(Date.now())
let sharedTickRefs = 0
let sharedTickId: ReturnType<typeof setInterval> | null = null
function useSharedTick() {
  sharedTickRefs++
  if (sharedTickRefs === 1) {
    sharedTickId = setInterval(() => setSharedTickNow(Date.now()), 1000)
  }
  onCleanup(() => {
    sharedTickRefs--
    if (sharedTickRefs === 0 && sharedTickId !== null) {
      clearInterval(sharedTickId)
      sharedTickId = null
    }
  })
  return sharedTickNow
}

function PendingCellView(props: { cell: PendingCell }) {
  const fallbackAspect = createMemo(() => {
    if (props.cell.kind === "video") return 16 / 9
    if (props.cell.kind === "audio") return 16 / 2.5
    return 1
  })
  const whitelabelLogo =
    typeof import.meta !== "undefined"
      ? (import.meta.env?.VITE_WHITELABEL_LOGO as string | undefined)
      : undefined

  // m:ss formatter shared with audio-wave-player — keep the import path
  // local-relative to avoid cycles (sibling file in the same dir).
  const now = useSharedTick()
  const elapsedLabel = createMemo(() => fmt(Math.max(0, (now() - props.cell.startedAt) / 1000)))

  // Audio gets a dedicated row: a 72px-tall box with a 64px spinner centred in
  // it left the elapsed counter overlapping the ring and acres of dead width.
  // A left-aligned mark + equalizer + elapsed reads as an audio item instead.
  if (props.cell.kind === "audio")
    return (
      <div
        class="relative rounded-xl overflow-hidden flex items-center gap-3 px-4 kolbo-canvas-cell"
        style={{
          height: "72px",
          background: "linear-gradient(135deg, var(--background-stronger) 0%, var(--surface-recess-base) 100%)",
        }}
        title={props.cell.tool}
      >
        <div
          class="shrink-0 flex items-center justify-center"
          style="width:32px;height:32px;border-radius:10px;background:color-mix(in srgb, var(--text-base) 5%, transparent);border:1px solid color-mix(in srgb, var(--text-base) 10%, transparent)"
        >
          {whitelabelLogo ? (
            <img src={whitelabelLogo} alt="" style="width:18px;height:18px;object-fit:contain;opacity:0.92" />
          ) : (
            <Mark class="w-4 h-4 opacity-90" />
          )}
        </div>
        <div class="flex items-end gap-[3px] flex-1 min-w-0" style="height:24px" aria-hidden="true">
          <For each={[0.55, 0.9, 0.35, 0.75, 1, 0.45, 0.85, 0.3, 0.65, 0.95, 0.4, 0.7]}>
            {(scale, i) => (
              <span
                style={`flex:1;max-width:4px;height:${Math.round(scale * 24)}px;border-radius:2px;background:var(--text-base);opacity:0.35;transform-origin:bottom;animation:kolbo-eq ${0.9 + (i() % 4) * 0.15}s ease-in-out ${(i() % 5) * 0.11}s infinite`}
              />
            )}
          </For>
        </div>
        <div
          class="shrink-0 text-text-weak"
          style="font-size:10px;font-variant-numeric:tabular-nums;opacity:0.7"
          aria-live="polite"
        >
          {elapsedLabel()}
        </div>
      </div>
    )

  return (
    <div
      class="relative rounded-xl overflow-hidden flex items-center justify-center kolbo-canvas-cell"
      style={{
        "aspect-ratio": fallbackAspect().toString(),
        background: "linear-gradient(135deg, var(--background-stronger) 0%, var(--surface-recess-base) 100%)",
      }}
      title={props.cell.tool}
    >
      <div class="relative" style="width:64px;height:64px;display:flex;align-items:center;justify-content:center">
        {/* dual-ring spinner: outer faint, inner accent */}
        <span
          style="position:absolute;inset:0;border-radius:50%;border:2px solid color-mix(in srgb, var(--text-base) 10%, transparent);"
          aria-hidden="true"
        />
        <span
          style="position:absolute;inset:0;border-radius:50%;border:2px solid transparent;border-top-color:var(--text-base);animation:kolbo-spin 0.95s cubic-bezier(0.65,0,0.35,1) infinite"
          aria-hidden="true"
        />
        <div
          class="relative flex items-center justify-center"
          style="width:36px;height:36px;border-radius:12px;background:color-mix(in srgb, var(--text-base) 5%, transparent);border:1px solid color-mix(in srgb, var(--text-base) 10%, transparent);box-shadow:0 4px 12px rgba(0, 0, 0, 0.22)"
        >
          {whitelabelLogo ? (
            <img src={whitelabelLogo} alt="" style="width:22px;height:22px;object-fit:contain;opacity:0.92" />
          ) : (
            <Mark class="w-5 h-5 opacity-90" />
          )}
        </div>
      </div>
      {/* elapsed counter — sits just under the spinner so the user can see
          the generation is alive even when the server-side wait runs long. */}
      <div
        class="absolute bottom-2 left-1/2 -translate-x-1/2 text-text-weak"
        style="font-size:10px;font-variant-numeric:tabular-nums;opacity:0.7"
        aria-live="polite"
      >
        {elapsedLabel()}
      </div>
    </div>
  )
}

// ─── Main component ──────────────────────────────────────────────────────────

export function SessionCanvas(props: { sessionID: Accessor<string | undefined> }) {
  const sync = useSync()
  const lang = useLanguage()
  const server = useServer()
  const ops = usePlatformOps()
  const { view } = useSessionLayout()
  const serverBase = createMemo(() => server.current?.http.url ?? "")

  // Lazy-mount the library on first switch, then keep it mounted (see the
  // <Show when={librarySeen()}> below).
  const [librarySeen, setLibrarySeen] = createSignal(false)
  // Library is the only canvas surface — pin mode so persisted "session"
  // views from older builds flip over automatically.
  createEffect(() => {
    if (view().canvas.mode() !== "library") view().canvas.setMode("library")
  })
  createEffect(() => {
    if (view().canvas.mode() === "library") setLibrarySeen(true)
  })
  // Pre-mount the library tree right after first paint (two rAFs) so the
  // session→library toggle is always an instant CSS-hide flip, never an
  // on-click ~1700-line bootstrap that froze the whole app. content-visibility
  // on the cells keeps this mount cheap even for media-heavy sessions.
  onMount(() => {
    requestAnimationFrame(() => requestAnimationFrame(() => setLibrarySeen(true)))
  })

  // Reset batch state whenever the session changes — selection is per-session.
  createEffect(() => {
    void props.sessionID()
    exitBatchMode()
  })

  const [downloading, setDownloading] = createSignal(false)
  const downloadAllSelected = async () => {
    if (downloading()) return
    const urls = Array.from(selectedUrls())
    if (urls.length === 0) return
    setDownloading(true)
    let saved = 0
    let failed = 0
    const savedPaths: string[] = []
    try {
      if (ops.downloadFile) {
        for (const url of urls) {
          try {
            const path = await ops.downloadFile(url)
            savedPaths.push(path)
            saved++
          } catch {
            failed++
          }
        }
      } else {
        // Web fallback — open each in a new tab (no path tracking possible)
        for (const url of urls) {
          try {
            const open = ops.openLink ?? ((u: string) => window.open(u, "_blank", "noopener,noreferrer"))
            open(url)
            saved++
          } catch {
            failed++
          }
        }
      }
    } finally {
      setDownloading(false)
    }

    // Mirror the single-download toast UX: surface "Open in folder" +
    // "Change folder" actions, same i18n keys, same icon.
    const toastActions: { label: string; onClick: () => void }[] = []
    const lastPath = savedPaths[savedPaths.length - 1]
    if (lastPath && ops.revealFile)
      toastActions.push({
        label: lang.t("ui.download.openInFolder"),
        onClick: () => void ops.revealFile!(lastPath),
      })
    if (ops.changeDownloadFolder)
      toastActions.push({
        label: lang.t("ui.download.changeFolder"),
        onClick: () => void ops.changeDownloadFolder!(),
      })

    showToast({
      variant: failed > 0 ? "error" : "success",
      icon: failed > 0 ? undefined : "circle-check",
      title:
        failed > 0
          ? lang.t("canvas.downloadSelected.partialFailed", { count: failed })
          : lang.t("canvas.downloadSelected.toast", { count: saved }),
      description:
        saved > 0 && failed === 0
          ? lang.t("canvas.downloadSelected.toastDescription", { count: saved })
          : undefined,
      actions: toastActions.length > 0 ? toastActions : undefined,
    })
    exitBatchMode()
  }

  const messages = createMemo(() => {
    const id = props.sessionID()
    if (!id) return []
    return sync.data.message[id] ?? []
  })

  // Per-session hidden URLs — populated from localStorage when session id
  // changes, mutated by the hide button on each tile.
  const [hidden, setHidden] = createSignal<Set<string>>(new Set())
  createEffect(() => {
    const id = props.sessionID()
    setHidden(() => (id ? loadHidden(id) : new Set<string>()))
  })
  const hideMedia = (url: string) => {
    const id = props.sessionID()
    if (!id) return
    setHidden((prev) => {
      if (prev.has(url)) return prev
      const next = new Set(prev)
      next.add(url)
      saveHidden(id, next)
      return next
    })
  }
  const hideSelected = () => {
    const id = props.sessionID()
    if (!id) return
    const urls = Array.from(selectedUrls())
    if (urls.length === 0) return
    setHidden((prev) => {
      const next = new Set(prev)
      for (const u of urls) next.add(u)
      saveHidden(id, next)
      return next
    })
    showToast({
      variant: "success",
      title: lang.t("canvas.hideSelected.toast", { count: urls.length }),
    })
    exitBatchMode()
  }

  // Stabilize cell / pending refs across memo invalidations.
  // collectCanvasCells is pure and allocates new objects every call; without
  // this cache, the same media (same key, same URL) gets a new reference on
  // every streamed token, which cascades through allEntries → <For> →
  // CanvasCellView mount → <img> mount → visible flicker / refetch on every
  // upstream update.
  // Caching by key alone is safe because a completed generation is immutable
  // (its URL doesn't change) and a pending generation only ever transitions
  // from "running" to either "completed" (with a different cells-side key
  // `tool.id:idx` vs pending key `tool.id`) or "error" (drops out entirely).
  const cellByKey = new Map<string, CanvasCell>()
  const pendingByKey = new Map<string, PendingCell>()
  // Keep the previous result so that when nothing meaningful changed
  // we return the SAME object reference. The collector memo runs on
  // every sync.data.part tick (every streamed token from every tool —
  // including `list_media`, `analyze_image`, chat streaming, etc.) but
  // 99% of those ticks don't add/remove any canvas-relevant cells. If we
  // returned a new wrapper object each tick, every downstream memo
  // (cells/pending/allEntries/columnBuckets) would invalidate, the For
  // loops would re-evaluate, and even though item refs are stable the
  // IntersectionObserver-gated cells would briefly re-evaluate revealed()
  // / aspect — which is the visible "flash" the user sees.
  let previousCollected: { cells: CanvasCell[]; pending: PendingCell[] } = { cells: [], pending: [] }
  const arraysEqualByRef = <T,>(a: readonly T[], b: readonly T[]) =>
    a.length === b.length && a.every((v, i) => v === b[i])
  createEffect(() => {
    const check = ops.generationStatus
    if (!check) return
    const parts = sync.data.part as Record<string, Part[] | undefined>
    for (const list of Object.values(parts)) {
      if (!list) continue
      for (const part of list) {
        if (part.type !== "tool") continue
        const tool = part as ToolPart
        if (!isGenerationPart(tool) || !stillPending(tool, allFound(), allDead())) continue
        const id = partOp(tool)?.id
        if (id) watch(id, check)
      }
    }
  })

  const collected = createMemo(() => {
    const raw = collectCanvasCells(
      // completedAt comes from AssistantMessage.time.completed (set when
      // the message stream finishes, success or fail). Pending cells for
      // a "done" parent message are stuck and get filtered out below.
      messages().map((m) => ({
        id: m.id,
        completedAt: m.role === "assistant" ? m.time?.completed : undefined,
      })),
      sync.data.part as Record<string, Part[] | undefined>,
      allFound(),
      allDead(),
    )
    const stableCells: CanvasCell[] = []
    const liveCellKeys = new Set<string>()
    for (const c of raw.cells) {
      const cached = cellByKey.get(c.key)
      if (cached) {
        stableCells.push(cached)
      } else {
        cellByKey.set(c.key, c)
        stableCells.push(c)
      }
      liveCellKeys.add(c.key)
    }
    for (const k of cellByKey.keys()) {
      if (!liveCellKeys.has(k)) cellByKey.delete(k)
    }

    const stablePending: PendingCell[] = []
    const livePendingKeys = new Set<string>()
    for (const p of raw.pending) {
      // Per-tool clock so a long session run doesn't inflate every spinner
      // to "96:07" and so part flicker doesn't reset the counter to 0.
      const startedAt = runStart(p.key, true, p.startedAt)
      const cached = pendingByKey.get(p.key)
      if (cached) {
        if (cached.startedAt !== startedAt) cached.startedAt = startedAt
        stablePending.push(cached)
      } else {
        const next = startedAt === p.startedAt ? p : { ...p, startedAt }
        pendingByKey.set(p.key, next)
        stablePending.push(next)
      }
      livePendingKeys.add(p.key)
    }
    for (const k of pendingByKey.keys()) {
      if (!livePendingKeys.has(k)) pendingByKey.delete(k)
    }

    // Structural-equality short-circuit: same items in same order → return
    // the previous wrapper unchanged so downstream memos don't fire.
    if (
      arraysEqualByRef(stableCells, previousCollected.cells) &&
      arraysEqualByRef(stablePending, previousCollected.pending)
    ) {
      return previousCollected
    }
    previousCollected = { cells: stableCells, pending: stablePending }
    return previousCollected
  })

  const cells = createMemo(() => {
    const h = hidden()
    if (h.size === 0) return collected().cells
    return collected().cells.filter((c) => !c.media.some((m) => h.has(m.url)))
  })
  const pending = createMemo(() => collected().pending)
  const cols = createMemo(() => view().canvas.gridCols())

  // Distribute items into N columns in ROW order so newest entries occupy
  // the first visible row across columns, not the first column top-to-bottom.
  // Pending cells go first since they're the most recent activity.
  type Entry =
    | { kind: "pending"; item: PendingCell }
    | { kind: "done"; item: CanvasCell }
  // Stabilize entry wrapper refs across memo invalidations. Without this,
  // every streamed token rebuilds new {kind, item} objects, and downstream
  // <For> (which keys by reference) would unmount + remount EVERY visible
  // cell on every tick — that's the cascade flicker that survives image
  // load. Cache by item key (tool.id for pending, tool.id:idx for cells)
  // so an entry whose underlying item didn't change keeps the same ref.
  const entryByKey = new Map<string, Entry>()
  const allEntries = createMemo<Entry[]>(() => {
    const next: Entry[] = []
    const live = new Set<string>()
    for (const item of pending()) {
      const k = item.key
      const cached = entryByKey.get(k)
      let entry: Entry
      if (cached && cached.kind === "pending" && cached.item === item) {
        entry = cached
      } else {
        entry = { kind: "pending" as const, item }
        entryByKey.set(k, entry)
      }
      next.push(entry)
      live.add(k)
    }
    for (const item of cells()) {
      const k = item.key
      const cached = entryByKey.get(k)
      let entry: Entry
      if (cached && cached.kind === "done" && cached.item === item) {
        entry = cached
      } else {
        entry = { kind: "done" as const, item }
        entryByKey.set(k, entry)
      }
      next.push(entry)
      live.add(k)
    }
    // GC entries whose underlying items disappeared (e.g., pending → done
    // swap, where the pending's key drops out and a new done key appears).
    for (const k of entryByKey.keys()) {
      if (!live.has(k)) entryByKey.delete(k)
    }
    return next
  })
  const columnBuckets = createMemo<Entry[][]>(() => {
    const n = Math.max(1, cols())
    const items = allEntries()
    const buckets: Entry[][] = Array.from({ length: n }, () => [])
    items.forEach((entry, i) => buckets[i % n].push(entry))
    return buckets
  })

  // Pre-computed slider track gradient that fills up to the thumb.
  const sliderFillBg = createMemo(() => {
    const pct = ((cols() - 1) / 7) * 100
    return (
      `linear-gradient(to right, ` +
      `color-mix(in srgb, var(--text-base) 65%, transparent) 0%, ` +
      `color-mix(in srgb, var(--text-base) 65%, transparent) ${pct}%, ` +
      `color-mix(in srgb, var(--text-base) 12%, transparent) ${pct}%, ` +
      `color-mix(in srgb, var(--text-base) 12%, transparent) 100%)`
    )
  })

  const hasContent = createMemo(() => cells().length > 0 || pending().length > 0)

  const [fav, setFav] = createSignal<Record<string, boolean>>({})
  const asked = new Set<string>()
  createEffect(() => {
    const base = serverBase()
    if (!base) return
    const urls = cells().flatMap((c) => c.media.map((m) => m.url)).filter(Boolean)
    const fresh = urls.filter((u) => {
      const k = favKey(u)
      if (asked.has(k)) return false
      asked.add(k)
      return true
    })
    if (fresh.length === 0) return
    void fetch(`${base}/global/kolbo-favorite-status`, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ urls: fresh }),
    })
      .then((r) => r.json())
      .then((body: { data?: Record<string, boolean> }) => {
        const data = body.data ?? {}
        setFav((prev) => {
          const next = { ...prev }
          for (const [url, on] of Object.entries(data)) next[favKey(url)] = !!on
          return next
        })
      })
      .catch(() => {})
  })
  const isFav = (url?: string) => !!url && !!fav()[favKey(url)]
  const toggleFav = async (cell: CanvasCell) => {
    const media = cell.media[0]
    const base = serverBase()
    if (!media || !base) return
    const key = favKey(media.url)
    const next = !fav()[key]
    setFav((prev) => ({ ...prev, [key]: next }))
    const kind = media.kind === "video" ? "video" : media.kind === "audio" ? "audio" : "image"
    try {
      const res = await fetch(`${base}/global/kolbo-favorite-toggle`, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ url: media.url, item_type: kind }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setFav((prev) => ({ ...prev, [key]: !next }))
        showToast({
          variant: "error",
          title:
            (body as { error?: { type?: string; message?: string } }).error?.type === "ITEM_NOT_FOUND" ||
            res.status === 404
              ? "Not in your library yet — try again in a moment"
              : ((body as { error?: { message?: string } }).error?.message ?? "Couldn't update favorite"),
        })
        return
      }
      const on = (body as { data?: { isFavorited?: boolean } }).data?.isFavorited
      if (typeof on === "boolean") setFav((prev) => ({ ...prev, [key]: on }))
      showToast({
        variant: "success",
        title: (typeof on === "boolean" ? on : next)
          ? lang.t("canvas.library.favorite.add")
          : lang.t("canvas.library.favorite.remove"),
      })
    } catch (e) {
      setFav((prev) => ({ ...prev, [key]: !next }))
      showToast({ variant: "error", title: (e as Error).message || "Couldn't update favorite" })
    }
  }

  return (
    <div class="flex flex-col h-full overflow-hidden">
      {/* Inline keyframes + range-slider + cell hover styling */}
      <style>{`
        @keyframes kolbo-spin { to { transform: rotate(360deg) } }
        @keyframes kolbo-canvas-empty-pulse {
          0%, 100% { transform: scale(1); opacity: 0.85 }
          50% { transform: scale(1.04); opacity: 1 }
        }

        /* Cells: clean — no permanent outline, just an extremely subtle
           inner ring that strengthens on hover with a soft lift.
           content-visibility: auto = browser-level virtualization. Cells
           far off-screen are skipped during paint / layout / style. Paired
           with contain-intrinsic-size so the browser knows roughly how
           tall each cell will be before it's resolved (prevents scroll
           jank when scrolling into unresolved sections). Critical for
           500+ cell sessions. */
        .kolbo-canvas-cell {
          box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--text-base) 5%, transparent);
          transition: box-shadow 0.18s ease, transform 0.18s ease;
          content-visibility: auto;
          contain-intrinsic-size: 1px 280px;
        }
        .kolbo-canvas-cell:hover {
          /* Inset border follows --text-base (subtle theme-tinted edge — fine
             in both modes). The OUTER drop shadow must stay dark in both
             modes; a theme-following shadow goes bright-white in dark mode
             and reads as a "burned" glow around the image. */
          box-shadow:
            inset 0 0 0 1px color-mix(in srgb, var(--text-base) 12%, transparent),
            0 6px 18px rgba(0, 0, 0, 0.22);
          transform: translateY(-1px);
        }
        .kolbo-fav-btn:hover svg[stroke="rgba(255,255,255,0.85)"] {
          stroke: #fbbf24;
          filter: drop-shadow(0 0 3px rgba(251, 191, 36, 0.4));
        }
        .kolbo-canvas-cell-selected,
        .kolbo-canvas-cell-selected:hover {
          box-shadow:
            inset 0 0 0 2px var(--surface-info-base),
            0 6px 18px color-mix(in srgb, var(--surface-info-base) 22%, transparent);
        }

        /* Suppress WebKit/macOS native video overlays (PiP placeholder,
           start-playback button, panel) that pop in on hover and collide
           with our checkbox/download buttons. The native controls only
           come back when controls={true} (during playback). */
        .kolbo-canvas-cell video::-webkit-media-controls-start-playback-button,
        .kolbo-canvas-cell video::-webkit-media-controls-overlay-play-button,
        .kolbo-canvas-cell video::-internal-media-controls-overflow-button,
        .kolbo-canvas-cell video::-webkit-media-controls-picture-in-picture-button {
          display: none !important;
          -webkit-appearance: none !important;
        }
        .kolbo-canvas-cell video:not([controls])::-webkit-media-controls,
        .kolbo-canvas-cell video:not([controls])::-webkit-media-controls-panel,
        .kolbo-canvas-cell video:not([controls])::-webkit-media-controls-enclosure {
          display: none !important;
          -webkit-appearance: none !important;
        }

        /* Density slider — track shows fill from min up to current value.
           Force direction:ltr so the fill gradient and thumb position stay
           in sync regardless of page direction (otherwise RTL flips the
           slider's internal coordinate system and the fill looks reversed). */
        .kolbo-canvas-slider {
          -webkit-appearance: none;
          appearance: none;
          width: 120px;
          height: 18px;
          background: transparent;
          cursor: pointer;
          outline: none;
          padding: 0;
          margin: 0;
          direction: ltr;
        }
        .kolbo-canvas-slider::-webkit-slider-runnable-track {
          height: 5px;
          border-radius: 999px;
          background: var(--kolbo-slider-fill, color-mix(in srgb, var(--text-base) 12%, transparent));
        }
        .kolbo-canvas-slider::-moz-range-track {
          height: 5px;
          border-radius: 999px;
          background: var(--kolbo-slider-fill, color-mix(in srgb, var(--text-base) 12%, transparent));
        }
        .kolbo-canvas-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: var(--background-base);
          border: 2px solid var(--text-base);
          margin-top: -5.5px;
          box-shadow: 0 2px 6px color-mix(in srgb, var(--text-base) 22%, transparent);
          transition: transform 0.12s ease, box-shadow 0.15s ease;
        }
        .kolbo-canvas-slider:hover::-webkit-slider-thumb {
          transform: scale(1.18);
          box-shadow: 0 3px 10px color-mix(in srgb, var(--text-base) 30%, transparent);
        }
        .kolbo-canvas-slider:active::-webkit-slider-thumb {
          transform: scale(1.05);
        }
        .kolbo-canvas-slider::-moz-range-thumb {
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: var(--background-base);
          border: 2px solid var(--text-base);
          box-shadow: 0 2px 6px color-mix(in srgb, var(--text-base) 22%, transparent);
        }
        .kolbo-canvas-slider:focus-visible::-webkit-slider-thumb {
          box-shadow:
            0 0 0 4px color-mix(in srgb, var(--surface-info-base) 35%, transparent),
            0 2px 6px color-mix(in srgb, var(--text-base) 22%, transparent);
        }
      `}</style>

      {/* Library owns density + scope; Session/Library toggle removed. */}
      <Show when={view().canvas.mode() === "session"}>
      <div
        class="flex items-center justify-between px-4 py-2.5 shrink-0 gap-3"
        style="border-bottom:1px solid color-mix(in srgb, var(--text-base) 8%, transparent);background:color-mix(in srgb, var(--background-base) 85%, transparent);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)"
      >
        <Show
          when={batchMode() || selectedUrls().size > 0}
          fallback={
            <>
              <div class="flex items-center gap-2 min-w-0" />
              <div class="flex items-center gap-2.5 min-w-0">
                <button
                  type="button"
                  onClick={() => setBatchMode(true)}
                  title={lang.t("canvas.select")}
                  aria-label={lang.t("canvas.select")}
                  class="flex items-center justify-center shrink-0 transition-colors"
                  style="height:22px;padding:0 8px;border-radius:6px;background:color-mix(in srgb, var(--text-base) 6%, transparent);color:var(--text-strong);border:1px solid color-mix(in srgb, var(--text-base) 10%, transparent);font-size:11px;font-weight:600;letter-spacing:0.02em;display:inline-flex;gap:5px;align-items:center"
                >
                  <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                    <rect x="2" y="2" width="12" height="12" rx="2.5" stroke="currentColor" stroke-width="1.5" />
                    <path d="M5 8.5l2 2 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
                  </svg>
                  {lang.t("canvas.select")}
                </button>
              </div>
            </>
          }
        >
          {/* Selection bar — refined: subtle, theme-tokened, breathy */}
          <div class="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={exitBatchMode}
              title={lang.t("canvas.cancelSelection")}
              aria-label={lang.t("canvas.cancelSelection")}
              class="flex items-center justify-center transition-colors hover:bg-background-stronger"
              style="width:22px;height:22px;border-radius:6px;background:transparent;color:var(--text-weak)"
            >
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
              </svg>
            </button>
            <span class="text-text-strong" style="font-size:12px;font-weight:600;letter-spacing:-0.005em">
              {lang.t("canvas.selected.count", { count: selectedUrls().size })}
            </span>
          </div>

          <div class="flex items-center gap-1">
            <Show when={selectedUrls().size > 0}>
              <button
                type="button"
                onClick={() => clearSelection()}
                disabled={downloading()}
                class="transition-colors hover:text-text-base disabled:opacity-50"
                style="height:24px;padding:0 8px;border-radius:6px;background:transparent;color:var(--text-weak);font-size:11px;font-weight:500"
              >
                {lang.t("canvas.clearSelection")}
              </button>
            </Show>
            <Show when={selectedUrls().size > 0}>
              <button
                type="button"
                disabled={downloading()}
                onClick={() => hideSelected()}
                class="flex items-center justify-center transition-colors hover:text-text-base disabled:opacity-50"
                style="height:24px;padding:0 10px;border-radius:6px;background:transparent;color:var(--text-weak);font-size:11px;font-weight:500;display:inline-flex;gap:6px;align-items:center"
                title={lang.t("canvas.hide.tooltip")}
              >
                <svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path
                    d="M2.5 4.5h11M6 4.5V3a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1.5M4.5 4.5l.6 9a1.5 1.5 0 0 0 1.5 1.4h2.8a1.5 1.5 0 0 0 1.5-1.4l.6-9M7 7.5v4.5M9 7.5v4.5"
                    stroke="currentColor"
                    stroke-width="1.5"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
                {lang.t("canvas.hideSelected")}
              </button>
            </Show>
            <button
              type="button"
              disabled={selectedUrls().size === 0 || downloading()}
              onClick={() => void downloadAllSelected()}
              class="flex items-center justify-center transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110"
              style="height:24px;padding:0 10px;border-radius:6px;background:var(--surface-info-base);color:var(--text-on-info-base, #fff);font-size:11px;font-weight:600;letter-spacing:0.01em;display:inline-flex;gap:6px;align-items:center;box-shadow:0 1px 2px color-mix(in srgb, var(--surface-info-base) 30%, transparent), 0 4px 10px color-mix(in srgb, var(--surface-info-base) 22%, transparent)"
            >
              <Show when={downloading()} fallback={
                <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                  <path d="M8 2v8m0 0l3-3m-3 3l-3-3M3 13h10" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
              }>
                <span
                  aria-hidden="true"
                  style="display:inline-block;width:11px;height:11px;border-radius:50%;border:1.5px solid currentColor;border-top-color:transparent;animation:kolbo-spin 0.85s linear infinite"
                />
              </Show>
              {lang.t("canvas.downloadSelected")}
            </button>
          </div>
        </Show>
      </div>
      </Show>

      {/* Library is the only canvas surface; Session view stays in the tree
          for now but is unreachable from the UI. */}
      <Show when={librarySeen()}>
        <div
          class="flex-1 min-h-0 flex flex-col"
          classList={{ hidden: view().canvas.mode() !== "library" }}
        >
          <CanvasLibraryView sessionID={props.sessionID} />
        </div>
      </Show>
      <Show when={view().canvas.mode() === "session"}>
      <Show
        when={hasContent()}
        fallback={
          <div class="flex-1 flex flex-col items-center justify-center px-8 text-center gap-5">
            <div
              class="relative flex items-center justify-center"
              style="width:88px;height:88px;border-radius:24px;background:linear-gradient(135deg, color-mix(in srgb, var(--surface-info-base) 22%, var(--background-stronger)) 0%, var(--background-stronger) 100%);box-shadow:0 8px 28px color-mix(in srgb, var(--text-base) 8%, transparent), inset 0 0 0 1px color-mix(in srgb, var(--text-base) 6%, transparent);animation:kolbo-canvas-empty-pulse 4s ease-in-out infinite"
            >
              <Mark class="w-9 h-9" />
            </div>
            <div class="flex flex-col gap-1.5 max-w-[260px]">
              <div class="text-text-strong" style="font-size:13px;font-weight:600;letter-spacing:-0.005em">
                {lang.t("canvas.empty")}
              </div>
            </div>
          </div>
        }
      >
        <div class="flex-1 min-h-0 overflow-y-auto p-3">
          <div class="flex gap-3 items-start">
            {/* Index for the outer = fixed N columns so column wrappers never
                unmount, only their contents change.
                <For> on the inner = key by entry reference. Entry refs are
                memoized by item key (see entryByKey above), so a stable
                CanvasCell that just shifts position because a pending was
                added/removed gets its DOM moved, not remounted. Without
                that, streaming tokens caused every visible cell to
                unmount+remount on every memo invalidation — the worst kind
                of flicker. */}
            <Index each={columnBuckets()}>
              {(bucket) => (
                <div class="flex-1 min-w-0 flex flex-col gap-3">
                  <For each={bucket()}>
                    {(entry) =>
                      entry.kind === "pending" ? (
                        <PendingCellView cell={entry.item} />
                      ) : (
                        <CanvasCellView
                          cell={entry.item}
                          onHide={hideMedia}
                          favorited={isFav(entry.item.media[0]?.url)}
                          onFavorite={() => void toggleFav(entry.item)}
                        />
                      )
                    }
                  </For>
                </div>
              )}
            </Index>
          </div>
        </div>
      </Show>
      </Show>
    </div>
  )
}
