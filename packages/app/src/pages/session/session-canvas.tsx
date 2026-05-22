import { For, Index, Show, createEffect, createMemo, createSignal, onCleanup, onMount, type Accessor } from "solid-js"
import { useSync } from "@/context/sync"
import { useLanguage } from "@/context/language"
import { useSessionLayout } from "@/pages/session/session-layout"
import { AudioWavePlayer } from "@/pages/session/audio-wave-player"
import { CanvasLibraryView } from "@/pages/session/canvas-library-view"
import { MediaCard } from "@opencode-ai/ui/media-card"
import { usePlatformOps } from "@opencode-ai/ui/context/platform-ops"
import { Mark } from "@opencode-ai/ui/logo"
import { showToast } from "@opencode-ai/ui/toast"
import { useTheme } from "@opencode-ai/ui/theme/context"
import type { Part, ToolPart, ToolStateCompleted, ToolStateRunning } from "@opencode-ai/sdk/v2"
import {
  extractKolboUrls as extractUrls,
  isVideoUrl,
  openKolboLightbox,
} from "@opencode-ai/ui/kolbo-media"

// Kolbo MCP generation tool basenames that the canvas tracks. ONLY tools
// that produce NEWLY-GENERATED media belong here. `upload_media` and
// `create_visual_dna` operate on user-supplied source material, not new
// generations — their URLs are the user's own uploads echoed back, and
// surfacing them in the canvas falsely advertises them as Kolbo outputs
// (and clutters the gallery with input frames the user is just trying to
// process).
const KOLBO_GENERATION_TOOL_NAMES = new Set([
  "generate_image",
  "generate_image_edit",
  "generate_video",
  "generate_video_from_image",
  "generate_video_from_video",
  "edit_image",
  "edit_video",
  "generate_elements",
  "generate_first_last_frame",
  "generate_lipsync",
  "generate_music",
  "generate_sound",
  "generate_speech",
  "generate_3d",
  "generate_creative_director",
])

export function isKolboGenerationTool(tool: string): boolean {
  if (tool.startsWith("kolbo_")) return KOLBO_GENERATION_TOOL_NAMES.has(tool.slice("kolbo_".length))
  if (tool.startsWith("mcp__kolbo__")) return KOLBO_GENERATION_TOOL_NAMES.has(tool.slice("mcp__kolbo__".length))
  return false
}

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

function pendingKind(tool: string): PendingCell["kind"] {
  const base = tool.startsWith("kolbo_")
    ? tool.slice("kolbo_".length)
    : tool.startsWith("mcp__kolbo__")
      ? tool.slice("mcp__kolbo__".length)
      : tool
  if (base.startsWith("generate_music") || base.startsWith("generate_sound") || base.startsWith("generate_speech"))
    return "audio"
  if (
    base.includes("video") ||
    base.includes("lipsync") ||
    base.startsWith("generate_elements") ||
    base.startsWith("generate_first_last_frame")
  )
    return "video"
  if (base.startsWith("generate_3d")) return "model"
  return "image"
}


export function hasKolboMediaInSession(parts: Part[][]): boolean {
  for (const list of parts) {
    if (!list) continue
    for (const part of list) {
      if (part.type !== "tool") continue
      if (!isKolboGenerationTool((part as ToolPart).tool)) continue
      return true
    }
  }
  return false
}

// Cap on how long a still-"running" tool part can persist as a pending cell.
// Beyond this we treat it as stuck/abandoned and drop it from the canvas
// (the generation either errored without updating state, the server-side
// task died, or the message was aborted). 10 minutes is comfortably past
// the slowest legitimate video generations.
const PENDING_STUCK_MS = 10 * 60 * 1000

function collectCanvasCells(
  messages: { id: string; completedAt?: number }[],
  partsByMessage: Record<string, Part[] | undefined>,
): { cells: CanvasCell[]; pending: PendingCell[] } {
  const cells: CanvasCell[] = []
  const pending: PendingCell[] = []
  const now = Date.now()
  // Track which URLs have already been added so we don't show the same media
  // twice. The same URL can appear in multiple tool results — e.g. an image
  // generated earlier is later passed back as an input to a video tool,
  // which echoes it in its `image_url`/`image_urls` field. Without dedup the
  // canvas shows the source photo next to its derived video.
  const seenUrls = new Set<string>()
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
      if (!isKolboGenerationTool(tool.tool)) continue
      const state = tool.state
      if (state.status === "completed") {
        const completed = state as ToolStateCompleted
        const urls = extractUrls(completed.output)
        if (urls.length === 0) continue
        urls.forEach((url, idx) => {
          // Cross-call dedupe: same URL legitimately reappearing in a
          // later tool's output (e.g. a generated image fed into
          // `generate_video_from_image` and the video tool's response
          // still references it) only earns one cell — the original.
          if (seenUrls.has(url)) return
          seenUrls.add(url)
          cells.push({
            key: `${tool.id}:${idx}`,
            messageID: message.id,
            partID: tool.id,
            tool: tool.tool,
            completedAt: completed.time.end,
            media: [{ url, kind: classifyUrl(url) }],
          })
        })
      } else if (state.status === "error") {
        // skip
      } else {
        const running = state as ToolStateRunning
        const startedAt = running.time?.start ?? now
        // Drop tools that are stuck: either the parent message is already
        // done (no more updates coming) or they've been "running" longer
        // than any real generation should take. Without this, the canvas
        // shows ghost spinners forever for aborted / crashed generations.
        if (messageDone) continue
        if (now - startedAt > PENDING_STUCK_MS) continue
        pending.push({
          key: tool.id,
          tool: tool.tool,
          kind: pendingKind(tool.tool),
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

function CanvasCellView(props: { cell: CanvasCell; onHide?: (url: string) => void }) {
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
        const url = current()?.url
        if (!url || !e.dataTransfer) return
        e.dataTransfer.setData("text/uri-list", url)
        e.dataTransfer.setData("text/plain", url)
        e.dataTransfer.effectAllowed = "copy"
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
                        controlslist="nodownload nofullscreen noremoteplayback noplaybackrate"
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
    </div>
  )
}

function PendingCellView(props: { cell: PendingCell }) {
  // Pending cells don't know aspect ratio yet — use a sensible default per kind
  // so they reserve realistic space (videos tend wider, images squarer).
  const fallbackAspect = createMemo(() => {
    if (props.cell.kind === "video") return 16 / 9
    if (props.cell.kind === "audio") return 16 / 2.5
    return 1
  })
  const whitelabelLogo =
    typeof import.meta !== "undefined"
      ? (import.meta.env?.VITE_WHITELABEL_LOGO as string | undefined)
      : undefined

  // Wall-clock counter so the user can tell at a glance whether a generation
  // is making progress or frozen. Ticks once per second; freezes when the
  // cell unmounts.
  const [now, setNow] = createSignal(Date.now())
  const id = setInterval(() => setNow(Date.now()), 1000)
  onCleanup(() => clearInterval(id))
  const elapsedLabel = createMemo(() => {
    const s = Math.max(0, Math.floor((now() - props.cell.startedAt) / 1000))
    const m = Math.floor(s / 60)
    const r = s % 60
    return `${m}:${r.toString().padStart(2, "0")}`
  })

  return (
    <div
      class="relative rounded-xl overflow-hidden flex items-center justify-center kolbo-canvas-cell"
      style={
        props.cell.kind === "audio"
          ? {
              height: "72px",
              background:
                "linear-gradient(135deg, var(--background-stronger) 0%, var(--surface-recess-base) 100%)",
            }
          : {
              "aspect-ratio": fallbackAspect().toString(),
              background:
                "linear-gradient(135deg, var(--background-stronger) 0%, var(--surface-recess-base) 100%)",
            }
      }
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
          style="width:36px;height:36px;border-radius:12px;background:color-mix(in srgb, var(--background-base) 92%, transparent);box-shadow:0 4px 12px color-mix(in srgb, var(--text-base) 12%, transparent)"
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
  const ops = usePlatformOps()
  const { view } = useSessionLayout()

  // Lazy-mount the library on first switch, then keep it mounted (see the
  // <Show when={librarySeen()}> below).
  const [librarySeen, setLibrarySeen] = createSignal(false)
  createEffect(() => {
    if (view().canvas.mode() === "library") setLibrarySeen(true)
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
      const cached = pendingByKey.get(p.key)
      if (cached) {
        stablePending.push(cached)
      } else {
        pendingByKey.set(p.key, p)
        stablePending.push(p)
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
          box-shadow:
            inset 0 0 0 1px color-mix(in srgb, var(--text-base) 12%, transparent),
            0 6px 18px color-mix(in srgb, var(--text-base) 10%, transparent);
          transform: translateY(-1px);
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
        .kolbo-canvas-cell video::-webkit-media-controls-fullscreen-button,
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

      {/* Toolbar — swaps to selection bar when items are selected */}
      <div
        class="flex items-center justify-between px-4 py-2.5 shrink-0 gap-3"
        style="border-bottom:1px solid color-mix(in srgb, var(--text-base) 8%, transparent);background:color-mix(in srgb, var(--background-base) 85%, transparent);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)"
      >
        <Show
          when={batchMode() || selectedUrls().size > 0}
          fallback={
            <>
              <div class="flex items-center gap-2 min-w-0">
                {/* Session/Library toggle pill — left side of the toolbar. */}
                <div
                  role="tablist"
                  aria-label="Canvas mode"
                  class="flex items-center rounded-md p-0.5"
                  style="background:color-mix(in srgb, var(--text-base) 6%, transparent);border:1px solid color-mix(in srgb, var(--text-base) 10%, transparent)"
                >
                  {(["session", "library"] as const).map((m) => (
                    <button
                      type="button"
                      role="tab"
                      aria-selected={view().canvas.mode() === m}
                      onClick={() => view().canvas.setMode(m)}
                      class="px-2 py-0.5 rounded text-11-regular transition-colors"
                      classList={{
                        "bg-surface-base text-text-strong shadow-sm": view().canvas.mode() === m,
                        "text-text-weak hover:text-text-base": view().canvas.mode() !== m,
                      }}
                      style={view().canvas.mode() === m
                        ? "font-weight:600"
                        : "font-weight:500"}
                    >
                      {lang.t(("canvas.tab." + m) as any)}
                    </button>
                  ))}
                </div>
                <span
                  class="text-text-weak"
                  style="font-size:10px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase"
                >
                  {lang.t("canvas.density")}
                </span>
              </div>

              <div class="flex items-center gap-2.5 min-w-0">
                <input
                  type="range"
                  min="1"
                  max="8"
                  step="1"
                  value={cols()}
                  onInput={(e) => view().canvas.setGridCols(parseInt(e.currentTarget.value, 10))}
                  title={lang.t("canvas.density.cols", { count: cols() })}
                  aria-label={lang.t("canvas.density")}
                  class="kolbo-canvas-slider"
                  style={{ "--kolbo-slider-fill": sliderFillBg() }}
                />
                <div
                  class="flex items-center justify-center shrink-0"
                  style="min-width:24px;height:22px;border-radius:6px;padding:0 6px;background:color-mix(in srgb, var(--text-base) 6%, transparent);color:var(--text-strong);font-size:11px;font-weight:600;font-variant-numeric:tabular-nums"
                >
                  {cols()}
                </div>
                <Show when={view().canvas.mode() !== "library"}>
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
                </Show>
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

      {/* Library is lazy-mounted on first switch and then kept mounted via
          CSS-hide so subsequent toggles preserve scroll position, batch
          selection, fetched pages, etc. Mounting both Session and Library
          at once on first canvas open made the panel blank for ~2s while
          the 1700-line library tree initialized — the lazy gate fixes that. */}
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
                        <CanvasCellView cell={entry.item} onHide={hideMedia} />
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
