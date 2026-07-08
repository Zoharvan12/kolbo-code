import { ComponentProps } from "solid-js"
import { MARK_PATH_1, MARK_PATH_2 } from "./logo"

// Generating / working loader: a rounded square with the Kolbo mark inside that
// fills up on loop. Rendered as ONE self-contained SVG with hard width/height
// attributes — an SVG with explicit dimensions cannot be stretched by any CSS,
// flex, or class, which is what kept blowing the old HTML version up to the raw
// logo size. The fill uses SMIL (an animated clip rect in the mark's own
// coordinate space), so it needs no global CSS.
//
// The mark's own viewBox is 389.03×469.15; scaled by 0.128 and centred it fits
// a ~50×60 area inside the 100×100 square.
const MARK_TRANSFORM = "translate(25 20) scale(0.128)"

export function SquareLoader(props: {
  size?: number
  class?: string
  style?: ComponentProps<"svg">["style"]
}) {
  const size = () => props.size ?? 20
  return (
    <svg
      data-component="square-loader"
      class={props.class}
      style={props.style}
      width={size()}
      height={size()}
      viewBox="0 0 100 100"
      fill="none"
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect
        x="0.75"
        y="0.75"
        width="98.5"
        height="98.5"
        rx="18"
        fill="var(--surface-raised-base)"
        stroke="var(--border-weak-base)"
        stroke-width="1.5"
      />
      <defs>
        {/* Clip rect rotated 45° around the mark centre (~195,235) and swept
            downward from the top — a clean top→bottom diagonal fill of the
            whole logo, then repeating. Coordinates are in the mark's native
            space (≈0–470). */}
        <clipPath id="kolbo-square-loader-fill" clipPathUnits="userSpaceOnUse">
          <rect transform="rotate(45 195 235)" x="-1000" width="2000" y="-90" height="0">
            <animate
              attributeName="height"
              values="0;640"
              dur="1.5s"
              calcMode="spline"
              keySplines="0.45 0 0.2 1"
              repeatCount="indefinite"
            />
          </rect>
        </clipPath>
      </defs>
      <g transform={MARK_TRANSFORM} fill="currentColor">
        {/* Base (faint) mark */}
        <g opacity="0.2">
          <path d={MARK_PATH_1} />
          <path d={MARK_PATH_2} />
        </g>
        {/* Fill mark, clipped to the animated rising rect */}
        <g clip-path="url(#kolbo-square-loader-fill)">
          <path d={MARK_PATH_1} />
          <path d={MARK_PATH_2} />
        </g>
      </g>
    </svg>
  )
}
