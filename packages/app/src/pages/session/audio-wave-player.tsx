import { createSignal, For, onCleanup } from "solid-js"

// Decorative waveform (not decoded from audio) — same sine+variance shape
// used by the Adobe plugin's music history cards. Computed once at module
// load and shared across every instance, so 40 cells cost ~40 numbers.
const BAR_COUNT = 40
const BAR_HEIGHTS: number[] = (() => {
  const arr: number[] = []
  for (let i = 0; i < BAR_COUNT; i++) {
    const base = Math.sin((i / BAR_COUNT) * Math.PI) * 60 + 20
    const variance = Math.sin(i * 0.5) * 15 + Math.cos(i * 0.8) * 10
    arr.push(Math.max(15, Math.min(95, base + variance)))
  }
  return arr
})()

const fmt = (t: number): string => {
  if (!Number.isFinite(t) || t < 0) return "0:00"
  const m = Math.floor(t / 60)
  const s = Math.floor(t % 60).toString().padStart(2, "0")
  return `${m}:${s}`
}

const hasKnownDuration = (d: number): boolean =>
  Number.isFinite(d) && d > 0

export function AudioWavePlayer(props: { src: string; onDownload?: () => void }) {
  const [playing, setPlaying] = createSignal(false)
  const [progress, setProgress] = createSignal(0)
  const [currentTime, setCurrentTime] = createSignal(0)
  const [duration, setDuration] = createSignal(0)
  let audio: HTMLAudioElement | undefined
  let waveformEl: HTMLDivElement | undefined

  const toggle = () => {
    if (!audio) return
    if (audio.paused) void audio.play().catch(() => {})
    else audio.pause()
  }

  const seek = (e: MouseEvent) => {
    if (!audio || !waveformEl) return
    const dur = audio.duration
    if (!hasKnownDuration(dur)) return
    const rect = waveformEl.getBoundingClientRect()
    // Player is force-locked to LTR via both `dir="ltr"` AND inline
    // `direction: ltr`, so this mapping is always physical left-to-right.
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    audio.currentTime = pct * dur
    setProgress(pct)
    setCurrentTime(audio.currentTime)
  }

  onCleanup(() => {
    if (audio) {
      try {
        audio.pause()
        audio.removeAttribute("src")
        audio.load()
      } catch {}
    }
  })

  return (
    <div
      dir="ltr"
      // Two layers of LTR enforcement:
      //  - `dir="ltr"` attribute (HTML-level direction)
      //  - inline `direction: ltr` (CSS-level, overrides any cascading
      //    `[dir=rtl] ... { direction: rtl }` rule in the surrounding app)
      // Plus `unicode-bidi: isolate` so the player can't bleed bidi state
      // into or out of the surrounding RTL canvas.
      // Left padding clears the canvas selection checkbox, which for audio
      // cells is repositioned to the vertical-center-left (~22px wide at
      // x:6) so it sits inline with the play button rather than colliding
      // with it. Right padding stays tight since the download control is
      // now integrated into the player itself.
      class="size-full flex items-center"
      style="height:100%;direction:ltr;unicode-bidi:isolate;padding-left:32px;padding-right:12px;gap:10px;background:linear-gradient(135deg, color-mix(in srgb, var(--surface-info-base) 35%, var(--background-stronger)) 0%, var(--background-stronger) 100%)"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        aria-label={playing() ? "Pause" : "Play"}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          toggle()
        }}
        class="flex items-center justify-center transition-transform duration-150 hover:scale-105 flex-shrink-0"
        style="width:34px;height:34px;border-radius:50%;background:color-mix(in srgb, var(--surface-info-base) 85%, transparent);color:var(--text-on-info-base, #fff);box-shadow:0 4px 14px color-mix(in srgb, var(--surface-info-base) 30%, transparent);border:1px solid color-mix(in srgb, #fff 12%, transparent)"
      >
        {playing() ? (
          <svg width="13" height="13" viewBox="0 0 14 14" fill="currentColor">
            <rect x="2" y="1" width="3.5" height="12" rx="0.8" />
            <rect x="8.5" y="1" width="3.5" height="12" rx="0.8" />
          </svg>
        ) : (
          <svg width="13" height="13" viewBox="0 0 14 14" fill="currentColor" style="margin-left:2px">
            <path d="M3 1.5v11l9-5.5L3 1.5Z" />
          </svg>
        )}
      </button>

      {/* Time sits next to the play button (left side). Keeping it here
          instead of past the waveform means it never collides with the
          download button (top-right) and it never visually overlaps the
          waveform bars even when the cell is narrow. */}
      <div
        class="text-[11px] flex-shrink-0 tabular-nums"
        style="color:var(--text-weak);font-variant-numeric:tabular-nums;min-width:32px"
      >
        {fmt(currentTime())}
        {hasKnownDuration(duration()) && (
          <>
            <span style="opacity:0.45"> / </span>
            {fmt(duration())}
          </>
        )}
      </div>

      <div
        ref={waveformEl}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          seek(e)
        }}
        class="flex-1 min-w-0 flex items-center cursor-pointer"
        // overflow:hidden + box-sizing:border-box ensure the container's
        // rendered width === its rect.width, so click math (clientX -
        // rect.left) / rect.width maps 1:1 to the visible bars even when
        // the cell is narrow. Without this, bars with a min-width would
        // overflow the container and clicks past rect.right would clamp
        // incorrectly.
        style="height:36px;gap:2px;direction:ltr;overflow:hidden;box-sizing:border-box"
      >
        <For each={BAR_HEIGHTS}>
          {(h, i) => {
            const isPlayed = () => i() / BAR_COUNT < progress()
            return (
              <div
                style={{
                  // No min-width: bars must be free to shrink so 40 of them
                  // always fit the container exactly. With min-width set,
                  // bars overflow past the container's right edge at narrow
                  // cells and the seek calculation (which uses container
                  // rect.width) jumps to the wrong time.
                  flex: "1 1 0",
                  "min-width": "0",
                  height: `${h}%`,
                  "border-radius": "2px",
                  background: isPlayed()
                    ? "linear-gradient(to top, color-mix(in srgb, var(--surface-info-base) 90%, transparent), color-mix(in srgb, var(--surface-info-base) 55%, #fff))"
                    : "linear-gradient(to top, color-mix(in srgb, var(--surface-info-base) 22%, transparent), color-mix(in srgb, var(--surface-info-base) 38%, transparent))",
                  transition: "background 0.12s ease",
                }}
              />
            )
          }}
        </For>
      </div>

      {/* Integrated download button — replaces MediaCard's hover button
          that's suppressed for audio cells. Sits inside the player layout
          so it never collides with the waveform or checkbox. Hidden until
          a handler is wired up. */}
      {props.onDownload && (
        <button
          type="button"
          aria-label="Download"
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            props.onDownload?.()
          }}
          class="flex items-center justify-center transition-transform duration-150 hover:scale-105 flex-shrink-0"
          style="width:26px;height:26px;border-radius:6px;background:color-mix(in srgb, var(--text-base) 8%, transparent);color:var(--text-base);border:1px solid color-mix(in srgb, var(--text-base) 12%, transparent)"
        >
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path
              d="M8 2v8m0 0l3-3m-3 3l-3-3M3 13h10"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </button>
      )}

      <audio
        ref={audio}
        src={props.src}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={(e) => {
          const a = e.currentTarget
          setCurrentTime(a.currentTime)
          if (hasKnownDuration(a.duration)) {
            setProgress(a.currentTime / a.duration)
            if (duration() !== a.duration) setDuration(a.duration)
          }
        }}
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration
          if (hasKnownDuration(d)) setDuration(d)
        }}
        onDurationChange={(e) => {
          const d = e.currentTarget.duration
          if (hasKnownDuration(d)) setDuration(d)
        }}
        onEnded={() => {
          setPlaying(false)
          setProgress(0)
          setCurrentTime(0)
        }}
        style="display:none"
      />
    </div>
  )
}
