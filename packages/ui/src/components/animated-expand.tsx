import { animate, type AnimationPlaybackControls } from "motion"
import { createEffect, on, onCleanup, splitProps, type JSX, type ParentProps } from "solid-js"

/**
 * The single source of truth for expand/collapse feel across the app.
 * A no-bounce spring reads as a smooth ease on height — never pops in.
 */
export const EXPAND_SPRING = { type: "spring" as const, visualDuration: 0.35, bounce: 0 }

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true

export interface AnimatedExpandProps extends ParentProps {
  /** When true the content grows to its natural height; when false it shrinks to 0. */
  open: boolean
  class?: string
  classList?: JSX.CustomAttributes<HTMLDivElement>["classList"]
  style?: JSX.CSSProperties
  /** Arbitrary data-* attributes (e.g. data-slot) are forwarded to the wrapper. */
  [key: `data-${string}`]: string | boolean | undefined
}

/**
 * Smoothly grows/shrinks its children on real measured height via Motion One.
 * Overflow is clipped while animating and only released to `visible` after the
 * open animation finishes, so nested popovers/focus rings aren't clipped and
 * content never overlaps siblings mid-grow. Honors `prefers-reduced-motion`.
 */
export function AnimatedExpand(props: AnimatedExpandProps) {
  const [local, rest] = splitProps(props, ["open", "children", "class", "classList", "style"])

  let contentRef: HTMLDivElement | undefined
  let heightAnim: AnimationPlaybackControls | undefined
  const initialOpen = local.open

  createEffect(
    on(
      () => local.open,
      (isOpen) => {
        if (!contentRef) return
        heightAnim?.stop()

        if (prefersReducedMotion()) {
          contentRef.style.height = isOpen ? "auto" : "0px"
          contentRef.style.overflow = isOpen ? "visible" : "hidden"
          return
        }

        if (isOpen) {
          contentRef.style.overflow = "hidden"
          heightAnim = animate(contentRef, { height: "auto" }, EXPAND_SPRING)
          heightAnim.finished.then(() => {
            if (!contentRef || !local.open) return
            contentRef.style.overflow = "visible"
            contentRef.style.height = "auto"
          })
        } else {
          contentRef.style.overflow = "hidden"
          heightAnim = animate(contentRef, { height: "0px" }, EXPAND_SPRING)
        }
      },
      { defer: true },
    ),
  )

  onCleanup(() => heightAnim?.stop())

  return (
    <div
      ref={contentRef}
      class={local.class}
      classList={local.classList}
      style={{
        height: initialOpen ? "auto" : "0px",
        overflow: initialOpen ? "visible" : "hidden",
        ...local.style,
      }}
      {...rest}
    >
      {local.children}
    </div>
  )
}
