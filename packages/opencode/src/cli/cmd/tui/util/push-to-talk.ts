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

// ---- Temporary debug logger ------------------------------------------------
// The TUI owns stdout/stderr, so console.log is invisible. Write a trace of
// the PTT lifecycle to a rotating log file the user can tail.
//   tail -f "$env:LOCALAPPDATA/../../.local/share/kolbo/log/push-to-talk.log"
// (or just look in Global.Path.log/push-to-talk.log)
// Remove this block once PTT is stable.
const PTT_LOG_FILE = path.join(Global.Path.log, "push-to-talk.log")
function pttLog(msg: string): void {
  try {
    fs.appendFileSync(PTT_LOG_FILE, `${new Date().toISOString()} ${msg}\n`)
  } catch {}
}

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
  export async function start(opts: StartOptions): Promise<StartResult> {
    pttLog("start() called")

    const token = loadKolboToken()
    if (!token) {
      pttLog("start() aborted: no token in auth.json")
      return { ok: false, error: { code: "notLoggedIn" } }
    }
    pttLog(`start() token loaded, prefix=${token.slice(0, 15)} length=${token.length}`)

    const mic = await resolveMicCommand()
    if (!mic) {
      pttLog("start() aborted: resolveMicCommand returned null")
      return { ok: false, error: { code: "noMicBackend" } }
    }
    pttLog(`start() mic=${mic.kind} bin=${mic.bin}`)
    pttLog(`start() mic args=${JSON.stringify(mic.args)}`)

    const sessionId = randomUUID()
    const origin = socketOrigin()
    pttLog(`start() origin=${origin} sessionId=${sessionId}`)

    const socket: Socket = io(origin, {
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
     * Fix: retry the scribe:start emit up to 5 times at 300ms intervals until
     * the server responds with `scribe:session_started`. The server's
     * connection setup typically completes in <300ms but we give it headroom.
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
    let startAttempts = 0
    const MAX_START_ATTEMPTS = 5
    const emitStart = () => {
      if (stopped || sessionReady) return
      startAttempts++
      socket.emit("scribe:start", startPayload)
      pttLog(`scribe:start emitted (attempt ${startAttempts}/${MAX_START_ATTEMPTS})`)
      if (startAttempts < MAX_START_ATTEMPTS) {
        startRetryTimer = setTimeout(emitStart, 300)
      }
    }

    socket.on("connect", () => {
      pttLog(`socket connect event fired, sid=${socket.id}`)
      emitStart()
    })

    socket.on("connect_error", (err: Error) => {
      pttLog(`connect_error: ${err.message}`)
      opts.onError?.({ code: "transportFailed", params: { error: err.message } })
      cleanup()
    })

    socket.on("disconnect", (reason: string) => {
      pttLog(`disconnect: ${reason}`)
    })

    // Log ALL incoming events to catch anything unexpected the server sends.
    socket.onAny((event: string, ...args: unknown[]) => {
      pttLog(`incoming event: ${event} args=${JSON.stringify(args).slice(0, 300)}`)
    })

    socket.on("scribe:session_started", (data: { sessionId: string }) => {
      if (data.sessionId !== sessionId) return
      pttLog("scribe:session_started received — session is ready")
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
      pttLog(`committed_transcript: "${data.text}"`)
      opts.onCommitted?.(data.text)
    })

    socket.on("scribe:error", (data: { sessionId: string; error: string }) => {
      if (data.sessionId !== sessionId) return
      pttLog(`scribe:error: ${data.error}`)
      opts.onError?.({ code: "serverError", params: { error: data.error } })
      cleanup()
    })

    socket.on("scribe:stopped", (data: { sessionId: string }) => {
      if (data.sessionId !== sessionId) return
      pttLog("scribe:stopped received")
      opts.onStopped?.()
      cleanup()
    })

    socket.on("scribe:closed", (data: { sessionId: string }) => {
      if (data.sessionId !== sessionId) return
      pttLog("scribe:closed received")
      cleanup()
    })

    // ---- Mic wiring (ffmpeg/sox → raw PCM16LE → base64) ----

    try {
      micProc = spawn(mic.bin, mic.args, { stdio: ["ignore", "pipe", "pipe"] })
      pttLog(`mic spawned, pid=${micProc.pid}`)
    } catch (err) {
      pttLog(`mic spawn threw: ${(err as Error).message}`)
      cleanup()
      return {
        ok: false,
        error: { code: "micSpawnFailed", params: { kind: mic.kind, error: (err as Error).message } },
      }
    }

    micProc.on("error", (err) => {
      pttLog(`mic process error: ${err.message}`)
      opts.onError?.({ code: "micRuntime", params: { kind: mic.kind, error: err.message } })
      cleanup()
    })

    micProc.on("exit", (code, signal) => {
      pttLog(`mic process exit code=${code} signal=${signal}`)
    })

    // Capture ffmpeg/sox stderr for diagnostics — normally it prints progress
    // lines we don't care about, but if the mic fails to open or permissions
    // are wrong this is where the error shows up.
    micProc.stderr?.on("data", (d: Buffer) => {
      const text = d.toString()
      if (text.trim().length > 0) pttLog(`mic stderr: ${text.trim().slice(0, 300)}`)
    })

    let sawFirstChunk = false
    let audioChunksSent = 0
    let audioBytesSeen = 0
    micProc.stdout?.on("data", (chunk: Buffer) => {
      if (stopped) return
      audioBytesSeen += chunk.length
      if (!sawFirstChunk) {
        sawFirstChunk = true
        pttLog(`mic first stdout chunk, bytes=${chunk.length}`)
      }
      const base64 = chunk.toString("base64")
      if (sessionReady) {
        socket.emit("scribe:audio", { sessionId, audio: base64, commit: false })
        audioChunksSent++
        if (audioChunksSent === 1) pttLog("first scribe:audio emitted to server")
        if (audioChunksSent % 50 === 0) pttLog(`${audioChunksSent} chunks sent, ${audioBytesSeen} raw bytes`)
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
              socket.emit("scribe:audio", { sessionId, audio: "", commit: true })
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
   * Partner.apiBase looks like `https://api.kolbo.ai/api` — Socket.IO connects
   * to the origin (no /api suffix) since the server mounts `io` at root.
   */
  function socketOrigin(): string {
    try {
      const u = new URL(Partner.apiBase)
      return `${u.protocol}//${u.host}`
    } catch {
      return Partner.apiBase
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
