import { createSignal, Show, type JSX } from "solid-js"

/**
 * Kobi — Kolbo's director sidekick, and the face of Kolbo Code.
 *
 * Same four states and the same CDN art the kolbo-map Help Widget uses
 * (`kolbiSprites.ts`), so Kobi looks identical across the products and can be
 * redrawn without shipping a new build. Each pose is an animated WebP that
 * carries its own motion — no <video>, no decoder, no sprite-sheet stepping.
 *
 * If the CDN is unreachable the component renders nothing rather than an
 * alt-text box; Kobi is decoration, never the only path to a control.
 */
export type KobiState = "idle" | "thinking" | "processing" | "speaking"

const CDN = "https://media.kolbo.ai/kolboai-media/kobi"

const POSE: Record<KobiState, string> = {
  idle: `${CDN}/kobi-idle.webp`,
  thinking: `${CDN}/kobi-thinking.webp`,
  processing: `${CDN}/kobi-processing.webp`,
  speaking: `${CDN}/kobi-speaking.webp`,
}

export function Kobi(props: {
  /** Which pose to show. Default `idle`. */
  state?: KobiState
  /** Rendered box size in px (square). Default 48. */
  size?: number
  /** Soft aura behind Kobi, echoing his Tron trim. Default true. */
  glow?: boolean
  /** Shown instead of Kobi when the CDN art can't be loaded. */
  fallback?: JSX.Element
  class?: string
}) {
  const [broken, setBroken] = createSignal(false)
  const state = () => props.state ?? "idle"
  const size = () => props.size ?? 48

  return (
    <Show when={!broken()} fallback={props.fallback}>
      <div
        class={`relative flex items-center justify-center shrink-0 ${props.class ?? ""}`}
        style={{ width: `${size()}px`, height: `${size()}px` }}
      >
        <Show when={props.glow !== false}>
          <div
            aria-hidden="true"
            class="absolute rounded-full pointer-events-none"
            style={{
              inset: "-8%",
              background:
                "radial-gradient(circle, rgba(59,130,246,0.45) 0%, rgba(59,130,246,0.18) 55%, transparent 72%)",
              filter: "blur(4px)",
            }}
          />
        </Show>
        <img
          src={POSE[state()]}
          alt=""
          aria-hidden="true"
          draggable={false}
          decoding="async"
          // The Tauri webview sends tauri://localhost as Referer, which
          // Cloudflare hotlink protection on kolbo.ai origins rejects.
          referrerpolicy="no-referrer"
          onError={() => setBroken(true)}
          class="relative size-full object-contain select-none"
        />
      </div>
    </Show>
  )
}
