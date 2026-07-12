/**
 * Voice dictation for the desktop app — realtime transcription into the
 * prompt input, mirroring the TUI's push-to-talk pipeline
 * (packages/opencode/src/cli/cmd/tui/util/push-to-talk.ts) but using the
 * webview's own audio stack instead of spawning ffmpeg:
 *
 *   getUserMedia → AudioContext (16kHz PCM16) → base64 chunks → Socket.IO
 *     `scribe:audio` events → kolbo-api → ElevenLabs Scribe v2 Realtime
 *     → `scribe:partial_transcript` / `scribe:committed_transcript`
 *
 * Auth: the sidecar's /global/kolbo-auth-context route hands us the user's
 * Kolbo API key + apiBase; we pass the key as `auth.token` on the Socket.IO
 * handshake — exactly what the TUI and the kolbo-map web client do.
 *
 * Cost: kolbo-api charges zero credits when `source: 'chat'` is used.
 */
import { createSignal, onCleanup } from "solid-js"
import { io, type Socket } from "socket.io-client"

export type DictationState = "idle" | "starting" | "recording" | "stopping"

export type DictationErrorCode = "notLoggedIn" | "micDenied" | "connectFailed" | "serverError"

export interface VoiceDictationOptions {
  /** Sidecar base URL (globalSDK.url) — used to fetch /global/kolbo-auth-context. */
  baseUrl: () => string
  /** Final transcript chunk — safe to insert into the prompt buffer. */
  onCommitted: (text: string) => void
  /** Anything went wrong (auth, mic, socket, backend). */
  onError: (code: DictationErrorCode) => void
}

export function createVoiceDictation(opts: VoiceDictationOptions) {
  const [state, setState] = createSignal<DictationState>("idle")
  const [partial, setPartial] = createSignal("")

  let socket: Socket | null = null
  let mediaStream: MediaStream | null = null
  let audioCtx: AudioContext | null = null
  let processor: ScriptProcessorNode | null = null
  let sessionId = ""
  let sessionReady = false
  let timers: ReturnType<typeof setTimeout>[] = []
  // Audio can arrive before the backend acks the session — buffer and flush
  // on scribe:session_started so the first words aren't dropped.
  let audioQueue: string[] = []

  const later = (fn: () => void, ms: number) => {
    const t = setTimeout(fn, ms)
    timers.push(t)
    return t
  }

  const teardown = () => {
    for (const t of timers) clearTimeout(t)
    timers = []
    audioQueue = []
    sessionReady = false
    try {
      processor?.disconnect()
    } catch {}
    processor = null
    try {
      audioCtx?.close()
    } catch {}
    audioCtx = null
    for (const track of mediaStream?.getTracks() ?? []) {
      try {
        track.stop()
      } catch {}
    }
    mediaStream = null
    try {
      socket?.removeAllListeners()
      socket?.disconnect()
    } catch {}
    socket = null
    setPartial("")
    setState("idle")
  }

  const fail = (code: DictationErrorCode) => {
    teardown()
    opts.onError(code)
  }

  const flushQueue = () => {
    if (!socket) return
    while (audioQueue.length > 0) {
      socket.emit("scribe:audio", { sessionId, audio: audioQueue.shift()!, commit: false })
    }
  }

  async function start() {
    if (state() !== "idle") return
    setState("starting")

    // 1. Auth — the sidecar owns the Kolbo API key.
    let apiKey = ""
    let apiBase = ""
    try {
      const base = opts.baseUrl().replace(/\/+$/, "")
      const res = await fetch(`${base}/global/kolbo-auth-context`)
      if (res.status === 401) return fail("notLoggedIn")
      if (!res.ok) return fail("connectFailed")
      const data = (await res.json()) as { apiKey?: string; apiBase?: string }
      if (!data.apiKey || !data.apiBase) return fail("notLoggedIn")
      apiKey = data.apiKey
      apiBase = data.apiBase
    } catch {
      return fail("connectFailed")
    }

    // 2. Microphone. Request 16kHz mono; the browser resamples if the
    // hardware doesn't support it natively.
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      })
    } catch {
      return fail("micDenied")
    }
    if (state() !== "starting") return teardown() // cancelled mid-await

    // 3. Socket.IO to kolbo-api. Socket.IO lives at the server root, not
    // under the /api sub-path that apiBase includes for REST routes.
    sessionId = crypto.randomUUID()
    let origin = apiBase
    try {
      const u = new URL(apiBase)
      origin = `${u.protocol}//${u.host}`
    } catch {}

    socket = io(origin, {
      path: "/socket.io",
      auth: { token: apiKey },
      transports: ["websocket", "polling"],
      reconnection: false,
      timeout: 5000,
      forceNew: true,
    })

    // Watchdog — never sit there hot-miking if the backend doesn't ack.
    later(() => {
      if (!sessionReady && state() !== "idle") fail("connectFailed")
    }, 6000)

    socket.on("connect", () => {
      // kolbo-api registers its scribe handlers asynchronously after the
      // connection event — emitting immediately can be silently dropped.
      // Same 300ms grace the TUI uses.
      later(() => {
        socket?.emit("scribe:start", {
          sessionId,
          source: "chat", // kolbo-api treats 'chat' as free
          options: {
            model_id: "scribe_v2_realtime",
            language_code: null,
            include_timestamps: true,
            commit_strategy: "vad",
            audio_format: "pcm_16000",
            enable_diarization: false,
          },
        })
      }, 300)
    })

    socket.on("connect_error", () => fail("connectFailed"))

    socket.on("scribe:session_started", (data: { sessionId: string }) => {
      if (data.sessionId !== sessionId) return
      sessionReady = true
      flushQueue()
    })

    socket.on("scribe:partial_transcript", (data: { sessionId: string; text: string }) => {
      if (data.sessionId !== sessionId || !data.text) return
      setPartial(data.text)
    })

    socket.on("scribe:committed_transcript", (data: { sessionId: string; text: string }) => {
      if (data.sessionId !== sessionId || !data.text) return
      setPartial("")
      opts.onCommitted(data.text)
    })

    socket.on("scribe:error", (data: { sessionId: string; error: string }) => {
      if (data.sessionId !== sessionId) return
      // Only session-ending errors are fatal — transient audio-send failures
      // during startup resolve on their own (same rule as the TUI).
      if (/rate limit|session id is required|failed to start/i.test(data.error)) fail("serverError")
    })

    socket.on("scribe:closed", (data: { sessionId: string }) => {
      if (data.sessionId !== sessionId) return
      teardown()
    })

    // 4. Audio pipeline: Float32 @ ctx rate → Int16 @ 16kHz → base64.
    try {
      audioCtx = new AudioContext({ sampleRate: 16000 })
    } catch {
      // Some WebKit builds reject custom sample rates — fall back to the
      // hardware rate and decimate manually below.
      audioCtx = new AudioContext()
    }
    const source = audioCtx.createMediaStreamSource(mediaStream)
    processor = audioCtx.createScriptProcessor(4096, 1, 1)
    const inputRate = audioCtx.sampleRate
    processor.onaudioprocess = (e) => {
      if (state() === "idle") return
      const f32 = e.inputBuffer.getChannelData(0)
      const chunk = encodePcm16Base64(f32, inputRate)
      if (sessionReady && socket) {
        socket.emit("scribe:audio", { sessionId, audio: chunk, commit: false })
      } else {
        audioQueue.push(chunk)
      }
    }
    source.connect(processor)
    processor.connect(audioCtx.destination)

    setState("recording")
  }

  function stop() {
    if (state() !== "recording" && state() !== "starting") return
    setState("stopping")
    try {
      if (sessionReady) flushQueue()
      socket?.emit("scribe:stop", { sessionId })
    } catch {}
    // Stop capturing immediately…
    try {
      processor?.disconnect()
    } catch {}
    for (const track of mediaStream?.getTracks() ?? []) {
      try {
        track.stop()
      } catch {}
    }
    // …but give the server ~1.5s to push the final committed_transcript
    // before tearing the socket down (scribe:closed also triggers teardown).
    later(teardown, 1500)
  }

  function toggle() {
    if (state() === "recording" || state() === "starting") stop()
    else if (state() === "idle") void start()
  }

  onCleanup(teardown)

  return { state, partial, toggle, stop }
}

/**
 * Convert a Float32 audio buffer to base64-encoded PCM16LE at 16kHz.
 * When the AudioContext couldn't be opened at 16kHz, decimate by linear
 * interpolation — quality is plenty for speech recognition.
 */
function encodePcm16Base64(f32: Float32Array, inputRate: number): string {
  let samples: Float32Array = f32
  if (inputRate !== 16000) {
    const ratio = inputRate / 16000
    const out = new Float32Array(Math.floor(f32.length / ratio))
    for (let i = 0; i < out.length; i++) {
      const pos = i * ratio
      const lo = Math.floor(pos)
      const hi = Math.min(lo + 1, f32.length - 1)
      out[i] = f32[lo] + (f32[hi] - f32[lo]) * (pos - lo)
    }
    samples = out
  }
  const i16 = new Int16Array(samples.length)
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    i16[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }
  const bytes = new Uint8Array(i16.buffer)
  let bin = ""
  for (let i = 0; i < bytes.length; i += 8192) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 8192))
  }
  return btoa(bin)
}
