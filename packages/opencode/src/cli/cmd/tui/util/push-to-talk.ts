/**
 * Push-to-talk realtime transcription for the Kolbo TUI.
 *
 * Holds the mic + Socket.IO + PCM16 pipeline that feeds the kolbo-api
 * realtime Scribe endpoint. The prompt component owns the keybind state
 * (space hold / release detection) and calls start()/stop() here.
 *
 * Pipeline:
 *   sox -d → raw PCM16 LE @ 16kHz mono → base64 chunks → Socket.IO
 *     `scribe:audio` events → kolbo-api → ElevenLabs Scribe v2 Realtime
 *     → `scribe:partial_transcript` / `scribe:committed_transcript` events
 *
 * Auth: reads the kolbo device-code API key from Global auth.json and
 * passes it as `auth.token` on the Socket.IO handshake. The kolbo-api
 * socket middleware accepts `kolbo_live_*` API keys (in addition to
 * JWTs) as of the realtime-scribe rollout.
 *
 * Cost: kolbo-api charges zero credits when `source: 'chat'` is used.
 */

import { spawn, type ChildProcess } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { randomUUID } from "node:crypto"
import { io, type Socket } from "socket.io-client"
import which from "which"
// ffmpeg-static exports the absolute path to a bundled platform-specific
// ffmpeg binary. Using this removes the "user must install ffmpeg" friction
// that blocked voice input before — ffmpeg just exists after `bun install`.
import ffmpegStaticPath from "ffmpeg-static"

import { Global } from "@/global"
import { Partner } from "@/brand/partner"

export namespace PushToTalk {
  /**
   * All user-visible errors are returned as structured codes so the prompt
   * component (which has access to the i18n context) can translate them.
   * push-to-talk.ts itself has no `useI18n()` — it's a plain utility module
   * that runs outside the Solid tree.
   */
  export type ErrorCode =
    | "notLoggedIn"
    | "noMicBackend"
    | "micSpawnFailed" // params: { kind, error }
    | "micRuntime" // params: { kind, error }
    | "transportFailed" // params: { error }
    | "backendTimeout"
    | "serverError" // params: { error }    — server-side message (English from ElevenLabs)

  export type ErrorInfo = { code: ErrorCode; params?: Record<string, string> }

  export interface StartOptions {
    /** Interim, not-yet-final text — safe to display but do not commit to buffer. */
    onPartial?: (text: string) => void
    /** Final chunk — safe to append to the prompt buffer. */
    onCommitted?: (text: string) => void
    /** Anything went wrong (auth, mic, socket, backend). */
    onError?: (info: ErrorInfo) => void
    /** Server acknowledged the stop — transcription is fully flushed. */
    onStopped?: () => void
  }

  export interface Session {
    /** Gracefully stop: commit, wait for final transcript, then close. */
    stop(): void
    /** Hard cancel: kill mic + socket immediately, no final commit. */
    cancel(): void
  }

  export type StartResult = { ok: true; session: Session } | { ok: false; error: ErrorInfo }

  /**
   * Start a realtime transcription session.
   * Returns { ok: false } synchronously-ish if prerequisites fail (no auth,
   * no sox binary). Transport/backend errors surface through `onError`.
   */
  // Caches — survive across PTT sessions to avoid repeated I/O on every press.
  let cachedToken: string | undefined
  let cachedMicCmd: MicCommand | undefined

  export async function start(opts: StartOptions): Promise<StartResult> {
    const token = cachedToken ?? loadKolboToken()
    if (!token) return { ok: false, error: { code: "notLoggedIn" } }
    cachedToken = token

    const mic = cachedMicCmd ?? (await resolveMicCommand())
    if (!mic) return { ok: false, error: { code: "noMicBackend" } }
    cachedMicCmd = mic

    const sessionId = randomUUID()
    const { origin, path } = socketConfig()

    const socket: Socket = io(origin, {
      path,
      auth: { token },
      // Allow polling as a fallback — raw websocket upgrades can fail on
      // corporate proxies or when kolbo-api is behind certain reverse
      // proxies. Socket.IO will still upgrade to websocket when possible.
      transports: ["websocket", "polling"],
      reconnection: false,
      timeout: 5000,
      forceNew: true,
    })

    // Safety watchdog — if the backend never acks scribe:session_started
    // within 5s after we emit scribe:start, surface a visible error rather
    // than sitting there hot-miking into the void.
    let readyWatchdog: ReturnType<typeof setTimeout> | null = setTimeout(() => {
      if (sessionReady || stopped) return
      opts.onError?.({ code: "backendTimeout" })
      cleanup()
    }, 5000)

    let micProc: ChildProcess | null = null
    let stopped = false
    let sessionReady = false
    // Declared here so `cleanup` (below) can reference it; assigned by the
    // scribe:start retry loop further down.
    let startRetryTimer: ReturnType<typeof setTimeout> | null = null
    /**
     * Audio arrives from sox a few ms before the backend confirms the session
     * is ready for chunks. Buffer early bytes and flush once `scribe:session_started`
     * comes back so no speech is dropped at the very start.
     */
    const audioQueue: string[] = []

    const flushQueue = () => {
      while (audioQueue.length > 0) {
        const chunk = audioQueue.shift()!
        socket.emit("scribe:audio", { sessionId, audio: chunk, commit: false })
      }
    }

    const cleanup = () => {
      if (stopped) return
      stopped = true
      if (readyWatchdog) {
        clearTimeout(readyWatchdog)
        readyWatchdog = null
      }
      if (startRetryTimer) {
        clearTimeout(startRetryTimer)
        startRetryTimer = null
      }
      try {
        micProc?.kill()
      } catch {}
      try {
        socket.removeAllListeners()
        socket.disconnect()
      } catch {}
    }

    // ---- Socket wiring ----

    /**
     * Race condition workaround: kolbo-api's `io.on("connection")` is async
     * and does `await updateLiveUsers(...)` + other setup BEFORE registering
     * `socket.on("scribe:start", ...)` at index.js:4973. If we emit too fast,
     * the event arrives before the listener exists and Socket.IO drops it
     * silently. The web client dodges this because getUserMedia() adds a
     * natural ~200ms delay.
     *
     * Fix: wait 300ms after connect before emitting scribe:start once.
     * Each emission creates a new ElevenLabs WebSocket on the server, so
     * retrying creates orphaned sessions that cause "WebSocket not open"
     * errors when audio arrives. One attempt + the 5s readyWatchdog is
     * sufficient.
     */
    const startPayload = {
      sessionId,
      source: "chat", // ← kolbo-api treats 'chat' as free
      options: {
        model_id: "scribe_v2_realtime",
        language_code: null,
        include_timestamps: true,
        commit_strategy: "vad",
        audio_format: "pcm_16000",
        enable_diarization: false,
      },
    }

    socket.on("connect", () => {
      // Delay the start emit to let the server finish its async connection
      // setup (updateLiveUsers, registering socket handlers, etc.).
      startRetryTimer = setTimeout(() => {
        if (stopped || sessionReady) return
        socket.emit("scribe:start", startPayload)
      }, 300)
    })

    socket.on("connect_error", (err: Error & { description?: any; type?: string; context?: any }) => {
      const detail = [
        `message=${err.message}`,
        err.type ? `type=${err.type}` : "",
        err.description ? `desc=${JSON.stringify(err.description)}` : "",
        err.context ? `ctx=${JSON.stringify(err.context)}` : "",
        `origin=${origin}`,
        `path=${path}`,
      ].filter(Boolean).join(" | ")
      fs.appendFileSync(`${Global.Path.data}/ptt-debug.log`, `[${new Date().toISOString()}] ${detail}\n`)
      opts.onError?.({ code: "transportFailed", params: { error: err.message } })
      cleanup()
    })

    socket.on("scribe:session_started", (data: { sessionId: string }) => {
      if (data.sessionId !== sessionId) return
      sessionReady = true
      if (readyWatchdog) {
        clearTimeout(readyWatchdog)
        readyWatchdog = null
      }
      if (startRetryTimer) {
        clearTimeout(startRetryTimer)
        startRetryTimer = null
      }
      flushQueue()
    })

    socket.on("scribe:partial_transcript", (data: { sessionId: string; text: string }) => {
      if (data.sessionId !== sessionId || !data.text) return
      opts.onPartial?.(data.text)
    })

    socket.on("scribe:committed_transcript", (data: { sessionId: string; text: string }) => {
      if (data.sessionId !== sessionId || !data.text) return
      opts.onCommitted?.(data.text)
    })

    socket.on("scribe:error", (data: { sessionId: string; error: string }) => {
      if (data.sessionId !== sessionId) return
      // Only treat session-ending errors as fatal. Transient audio-send
      // failures (e.g. "WebSocket connection not open" during startup race)
      // should not tear down the whole session — the server may still be
      // setting up and subsequent chunks will succeed.
      const fatal =
        /rate limit/i.test(data.error) ||
        /session id is required/i.test(data.error) ||
        /failed to start/i.test(data.error)
      if (fatal) {
        opts.onError?.({ code: "serverError", params: { error: data.error } })
        cleanup()
      }
    })

    socket.on("scribe:stopped", (data: { sessionId: string }) => {
      if (data.sessionId !== sessionId) return
      // Notify the UI that the server acked the stop, but do NOT cleanup
      // yet — late committed_transcript events from ElevenLabs can still
      // arrive after the server's stop ack. The 1.5s timeout in stop()
      // will handle final teardown.
      opts.onStopped?.()
    })

    socket.on("scribe:closed", (data: { sessionId: string }) => {
      if (data.sessionId !== sessionId) return
      cleanup()
    })

    // ---- Mic wiring (ffmpeg/sox → raw PCM16LE → base64) ----

    try {
      micProc = spawn(mic.bin, mic.args, { stdio: ["ignore", "pipe", "pipe"] })
    } catch (err) {
      cleanup()
      return {
        ok: false,
        error: { code: "micSpawnFailed", params: { kind: mic.kind, error: (err as Error).message } },
      }
    }

    micProc.on("error", (err) => {
      opts.onError?.({ code: "micRuntime", params: { kind: mic.kind, error: err.message } })
      cleanup()
    })

    micProc.stderr?.on("data", () => {})

    micProc.stdout?.on("data", (chunk: Buffer) => {
      if (stopped) return
      const base64 = chunk.toString("base64")
      if (sessionReady) {
        socket.emit("scribe:audio", { sessionId, audio: base64, commit: false })
      } else {
        audioQueue.push(base64)
      }
    })

    return {
      ok: true,
      session: {
        stop() {
          if (stopped) return
          // Flush any remaining queued audio, then signal commit + stop.
          try {
            if (sessionReady) {
              flushQueue()
            }
            socket.emit("scribe:stop", { sessionId })
          } catch {}
          try {
            micProc?.kill()
          } catch {}
          // Give the server ~1.5s to push any final committed_transcript
          // event before we tear the socket down. After that, cleanup()
          // is idempotent — scribe:stopped from the server also triggers it.
          setTimeout(cleanup, 1500)
        },
        cancel() {
          cleanup()
        },
      },
    }
  }

  // ---- helpers ----

  function loadKolboToken(): string | undefined {
    try {
      const file = path.join(Global.Path.data, "auth.json")
      const raw = fs.readFileSync(file, "utf8")
      const data = JSON.parse(raw) as Record<string, { type?: string; refresh?: string; access?: string; key?: string }>
      const kolbo = data.kolbo
      if (!kolbo) return undefined
      if (kolbo.type === "oauth") return kolbo.refresh ?? kolbo.access
      if (kolbo.type === "api") return kolbo.key
      return undefined
    } catch {
      return undefined
    }
  }

  /**
   * Parse Partner.apiBase into an origin + Socket.IO path.
   *
   * Partner.apiBase looks like `https://api.kolbo.ai/api` or
   * `https://stagingapi.kolbo.ai/api`. Socket.IO needs the origin
   * (protocol + host) separately, and when the API is mounted at a
   * sub-path (e.g. `/api`), we must tell the Socket.IO client to use
   * `<sub-path>/socket.io` instead of the default `/socket.io`.
   */
  function socketConfig(): { origin: string; path: string } {
    try {
      const u = new URL(Partner.apiBase)
      const origin = `${u.protocol}//${u.host}`
      // Socket.IO is mounted at the server root, NOT under the /api sub-path.
      // Partner.apiBase includes "/api" for REST routes, but the Socket.IO
      // server listens on the default "/socket.io" path.
      return { origin, path: "/socket.io" }
    } catch {
      return { origin: Partner.apiBase, path: "/socket.io" }
    }
  }

  /**
   * Mic command resolver — picks whatever's available.
   *
   * Preference order:
   *   1. ffmpeg-static bundled binary — the normal path. Zero install
   *      friction, always works after `bun install`. This is how every
   *      serious Node multimedia CLI ships ffmpeg.
   *   2. System ffmpeg on PATH — fallback for platforms where the
   *      ffmpeg-static prebuild doesn't exist (e.g. exotic Linux arches)
   *      or has been disabled/deleted.
   *   3. System sox on PATH — last-ditch fallback. Simpler command-line
   *      than ffmpeg but much less commonly installed.
   *
   * Returns null only if all three fail — which in practice means
   * something is wrong with the install.
   */
  type MicCommand = { kind: "ffmpeg" | "sox"; bin: string; args: string[] }

  async function resolveMicCommand(): Promise<MicCommand | null> {
    // 1. Bundled ffmpeg (ffmpeg-static). The package's default export is
    //    either a string path or null on unsupported platforms. We also
    //    verify the file actually exists — the install script could have
    //    been skipped (e.g. not in trustedDependencies) leaving a null
    //    path or a stale stub.
    const bundled = resolveBundledFfmpeg()
    if (bundled) {
      const args = await buildFfmpegArgs(bundled)
      if (args) return { kind: "ffmpeg", bin: bundled, args }
    }
    // 2. System ffmpeg
    const systemFfmpeg = await tryWhich("ffmpeg")
    if (systemFfmpeg) {
      const args = await buildFfmpegArgs(systemFfmpeg)
      if (args) return { kind: "ffmpeg", bin: systemFfmpeg, args }
    }
    // 3. System sox
    const soxPath = await tryWhich("sox")
    if (soxPath) {
      return {
        kind: "sox",
        bin: soxPath,
        args: [
          "-d", // default input device (platform-agnostic)
          "-q", // quiet
          "-c",
          "1", // mono
          "-r",
          "16000", // 16 kHz — matches Scribe pcm_16000
          "-b",
          "16", // 16-bit
          "-e",
          "signed-integer",
          "-t",
          "raw",
          "-", // stdout
        ],
      }
    }
    return null
  }

  async function tryWhich(bin: string): Promise<string | null> {
    try {
      return await which(bin)
    } catch {
      return null
    }
  }

  /**
   * Resolve the bundled ffmpeg binary path from the `ffmpeg-static` package.
   *
   * The package's install script downloads a platform-specific ffmpeg
   * binary on `bun install`. On Bun this only runs if the package is
   * listed in the root `trustedDependencies` array — otherwise install
   * scripts are skipped for security and `ffmpegStaticPath` ends up
   * pointing to a path that doesn't exist. We stat the file to verify.
   */
  function resolveBundledFfmpeg(): string | null {
    const p = ffmpegStaticPath as string | null
    if (!p) return null
    try {
      if (fs.statSync(p).isFile()) return p
    } catch {}
    return null
  }

  /**
   * Build ffmpeg args for the current OS. Raw PCM16LE mono 16kHz to stdout.
   *
   * Platform input specs:
   *   - darwin: avfoundation, `":0"` = no video, default audio device
   *   - linux:  pulse, "default" = system default source (falls back to
   *             alsa "default" if pulse is unavailable)
   *   - win32:  dshow requires an exact device name — no "default" spelling
   *             works across ffmpeg builds, so we enumerate once and use
   *             the first audio device we find
   */
  async function buildFfmpegArgs(ffmpegPath: string): Promise<string[] | null> {
    const raw = ["-f", "s16le", "-ar", "16000", "-ac", "1", "-"]
    const base = ["-hide_banner", "-loglevel", "error"]

    if (process.platform === "darwin") {
      return [...base, "-f", "avfoundation", "-i", ":0", ...raw]
    }
    if (process.platform === "linux") {
      return [...base, "-f", "pulse", "-i", "default", ...raw]
    }
    if (process.platform === "win32") {
      const device = await enumerateWindowsAudioDevice(ffmpegPath)
      if (!device) return null
      return [...base, "-f", "dshow", "-i", `audio=${device}`, ...raw]
    }
    return null
  }

  /**
   * On Windows, ffmpeg's dshow backend can't use a generic "default" input —
   * it needs the literal device name. Run a probe invocation to list audio
   * devices and pick the first one tagged `(audio)`.
   *
   * ffmpeg's output format varies by build. Older builds print section
   * headers like "DirectShow video devices" / "DirectShow audio devices",
   * but recent builds (including ffmpeg-static 5.2.0's b6.0 binary) just
   * inline the type on each line:
   *
   *   [dshow @ ...] "USB3 Video" (video)
   *   [dshow @ ...] "Microphone (Realtek High Definition Audio)" (audio)
   *   [dshow @ ...]   Alternative name "@device_cm_{...}\wave_..."
   *
   * So we scan line-by-line for any line ending in `(audio)` and grab the
   * quoted device name — works with or without section headers.
   */
  function enumerateWindowsAudioDevice(ffmpegPath: string): Promise<string | null> {
    return new Promise((resolve) => {
      let stderr = ""
      let settled = false
      const done = (value: string | null) => {
        if (settled) return
        settled = true
        resolve(value)
      }
      try {
        const p = spawn(ffmpegPath, ["-hide_banner", "-list_devices", "true", "-f", "dshow", "-i", "dummy"], {
          stdio: ["ignore", "ignore", "pipe"],
        })
        p.stderr?.on("data", (d: Buffer) => {
          stderr += d.toString()
        })
        p.on("error", () => done(null))
        p.on("close", () => done(parseWindowsAudioDevice(stderr)))
        // Safety timeout — device enumeration should take <1s. dshow's
        // probe with `-i dummy` exits immediately after listing, but set
        // a watchdog in case it ever hangs.
        setTimeout(() => {
          try {
            p.kill()
          } catch {}
          done(parseWindowsAudioDevice(stderr))
        }, 4000)
      } catch {
        done(null)
      }
    })
  }

  /** Exported-for-test-in-mind parser. Returns the first `(audio)` device name. */
  function parseWindowsAudioDevice(stderr: string): string | null {
    const lines = stderr.split(/\r?\n/)
    for (const line of lines) {
      // Only consider primary device lines, not "Alternative name" lines —
      // the alternative names are GUID paths that also happen to contain
      // quotes and `(audio)` isn't present on them, but we want to be
      // defensive and match only lines where both a quoted name AND the
      // `(audio)` tag appear.
      if (!/\(audio\)\s*$/i.test(line)) continue
      const match = line.match(/"([^"]+)"/)
      if (match) return match[1]
    }
    return null
  }
}
