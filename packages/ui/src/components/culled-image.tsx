import { createSignal, onCleanup, splitProps, type JSX } from "solid-js"

const BLANK = "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=="

type Props = JSX.ImgHTMLAttributes<HTMLImageElement> & {
  /** How far outside the viewport to keep the real source attached. */
  margin?: string
}

/**
 * Viewport-culled <img> — same idea as kolbo-map's CulledImage.
 * Off-screen tiles swap to a 1x1 GIF so the browser can drop decoded bitmaps
 * and we don't download every library thumb on first paint.
 *
 * Brief leave of the rootMargin (masonry reflow / scroll jitter) must not
 * blank the src — that painted black holes across the grid. Grace the cull.
 */
export function CulledImage(props: Props) {
  const [local, rest] = splitProps(props, ["src", "margin", "class", "style"])
  const [near, setNear] = createSignal(false)
  let node: HTMLImageElement | undefined
  let leave: ReturnType<typeof setTimeout> | undefined

  const observe = (el: HTMLImageElement) => {
    node = el
    if (typeof IntersectionObserver === "undefined") {
      setNear(true)
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        const hit = entries.some((e) => e.isIntersecting)
        if (hit) {
          if (leave) clearTimeout(leave)
          leave = undefined
          setNear(true)
          return
        }
        if (leave) return
        leave = setTimeout(() => {
          leave = undefined
          setNear(false)
        }, 1500)
      },
      { rootMargin: local.margin ?? "400px" },
    )
    io.observe(el)
    onCleanup(() => {
      io.disconnect()
      if (leave) clearTimeout(leave)
    })
  }

  return (
    <img
      {...rest}
      ref={observe}
      src={near() ? local.src : BLANK}
      class={local.class}
      style={local.style}
      loading="lazy"
      decoding="async"
    />
  )
}
