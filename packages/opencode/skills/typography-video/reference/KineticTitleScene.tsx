/**
 * KineticTitleScene — Full-screen kinetic text card
 *
 * bgStyle="solid"         — always-on dark background (default)
 * bgStyle="dynamic_panel" — bg wipes in before text, wipes out after text gone
 * bgStyle="transparent"   — no background (composite over footage, render with alpha codec)
 *
 * ALL words land simultaneously (staggered by 4 frames each).
 * Alternating solid / outline / accent treatment.
 * Based on Higgsfield / SOUL 2.0 reference style.
 */
import React from "react";
import { useCurrentFrame, useVideoConfig, spring, interpolate, Easing } from "remotion";
import { loadFont as loadPoppins } from "@remotion/google-fonts/Poppins";
import { loadFont as loadHeebo } from "@remotion/google-fonts/Heebo";

const { fontFamily: poppins } = loadPoppins();
const { fontFamily: heebo } = loadHeebo();

export interface KineticTitleProps {
  words: string[];           // 2–4 words, each on its own line
  subtext?: string;          // optional small line below
  accentColor?: string;      // default brand blue
  language?: string;         // "en" | "he"
  bgStyle?: "solid" | "dynamic_panel" | "transparent";
  durationInFrames: number;
  fps: number;
}

const BRAND_BLUE = "#60a5fa";
const STAGGER = 4; // frames between each word entrance

// How many frames the bg leads the text on entry, and trails it on exit
const BG_LEAD = 10;   // bg starts wiping in 10 frames before text
const BG_TRAIL = 12;  // bg stays for 12 frames after text is gone

export const KineticTitleScene: React.FC<KineticTitleProps> = ({
  words = ["WENT", "VIRAL"],
  subtext,
  accentColor = BRAND_BLUE,
  language = "en",
  bgStyle = "solid",
  durationInFrames = 150,
  fps = 30,
}) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  const isHebrew = language === "he" || language === "iw";
  const fontFamily = isHebrew ? heebo : poppins;
  const isVertical = height > width;
  const accent = accentColor;
  const isDynamic = bgStyle === "dynamic_panel";
  const isTransparent = bgStyle === "transparent";

  // ── Text timing ──────────────────────────────────────────────────────────
  // Dynamic: text starts after bg has partially appeared
  const textOffset = isDynamic ? BG_LEAD : 0;
  const textExitStart = durationInFrames - (isDynamic ? BG_TRAIL + 12 : 12);

  const exitOpacity = interpolate(
    frame,
    [textExitStart, textExitStart + 12],
    [1, 0],
    { extrapolateRight: "clamp" }
  );

  // Global entrance scale
  const globalScale = interpolate(frame - textOffset, [0, 20], [1.04, 1.0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  // ── Background panel timing ───────────────────────────────────────────────
  // BG enters: wipes left→right starting at frame 0
  const bgEnterDuration = 18;
  const bgEnterProgress = interpolate(frame, [0, bgEnterDuration], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  // BG exits: wipes left→right starting after text is fully gone
  const bgExitStart = textExitStart + 12;
  const bgExitProgress = interpolate(
    frame,
    [bgExitStart, bgExitStart + 14],
    [0, 1],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.in(Easing.cubic),
    }
  );

  // scaleX wipe — most reliable in Remotion headless Chrome
  // Enter: scaleX grows 0→1 from LEFT origin  (reveals left to right)
  // Exit:  scaleX shrinks 1→0 from RIGHT origin (removes left to right)
  const bgScaleX = isDynamic
    ? (frame < bgExitStart
        ? interpolate(bgEnterProgress, [0, 1], [0, 1])
        : interpolate(bgExitProgress,  [0, 1], [1, 0]))
    : 1;
  const bgTransformOrigin = isDynamic && frame >= bgExitStart ? "right center" : "left center";

  const showBg = !isTransparent;

  // ── Accent scan line across bg (cinematic HUD feel) ──────────────────────
  const scanY = interpolate(frame, [0, durationInFrames], [0, height], {
    extrapolateRight: "clamp",
  });
  const scanOpacity = isDynamic
    ? bgEnterProgress * (1 - bgExitProgress) * 0.12
    : 0.06;

  // ── Font size ─────────────────────────────────────────────────────────────
  const baseFontSize = isVertical
    ? Math.round(width * 0.22)
    : Math.round(height * 0.26);

  // ── Word styles: solid → outline → accent ────────────────────────────────
  const wordStyles = (i: number) => {
    const mod = i % 3;
    if (mod === 0) return { color: "#ffffff",   stroke: "none",  shadow: `0 0 40px ${accent}44` };
    if (mod === 1) return { color: "transparent", stroke: accent, shadow: `0 0 30px ${accent}44` };
    return                 { color: accent,     stroke: "none",  shadow: `0 0 50px ${accent}88` };
  };

  // ── Separator line ────────────────────────────────────────────────────────
  const SepLine = ({ delay }: { delay: number }) => {
    const lineW = interpolate(frame - delay, [0, 16], [0, 1], {
      extrapolateRight: "clamp",
      easing: Easing.out(Easing.cubic),
    });
    return (
      <div style={{
        width: `${lineW * 100}%`,
        height: 1,
        background: `linear-gradient(${isHebrew ? "270deg" : "90deg"}, transparent, ${accent}88, transparent)`,
        marginBottom: 2,
        marginTop: 2,
      }} />
    );
  };

  return (
    <div style={{
      width, height,
      // dynamic_panel: outer is transparent — the animated inner panel owns the background
      background: (isTransparent || isDynamic) ? "transparent" : "#07070f",
      overflow: "hidden",
      position: "relative",
      fontFamily,
      direction: isHebrew ? "rtl" : "ltr",
    }}>

      {/* ── Background panel (with clip-path wipe) ── */}
      {showBg && (
        <div style={{
          position: "absolute", inset: 0,
          transform: isDynamic ? `scaleX(${bgScaleX})` : undefined,
          transformOrigin: isDynamic ? bgTransformOrigin : undefined,
        }}>
          {/* Dark fill */}
          <div style={{ position: "absolute", inset: 0, background: "#07070f" }} />

          {/* Grid lines */}
          <div style={{
            position: "absolute", inset: 0,
            backgroundImage: [
              `linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px)`,
              `linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)`,
            ].join(", "),
            backgroundSize: "60px 60px",
            pointerEvents: "none",
          }} />

          {/* Diagonal corner accent */}
          <div style={{
            position: "absolute",
            top: -60,
            left: isHebrew ? undefined : -60,
            right: isHebrew ? -60 : undefined,
            width: 300, height: 300,
            background: `linear-gradient(${isHebrew ? "225deg" : "135deg"}, ${accent}18 0%, transparent 60%)`,
            pointerEvents: "none",
          }} />

          {/* Vignette */}
          <div style={{
            position: "absolute", inset: 0,
            background: "radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.65) 100%)",
            pointerEvents: "none",
          }} />

          {/* Horizontal scan line (slow drift) */}
          <div style={{
            position: "absolute",
            left: 0, right: 0,
            top: scanY,
            height: 1,
            background: `linear-gradient(90deg, transparent, ${accent}, transparent)`,
            opacity: scanOpacity,
            pointerEvents: "none",
          }} />

          {/* Bright edge line at wipe front — sits at the right edge of the scaled panel */}
          {isDynamic && bgScaleX > 0 && bgScaleX < 1 && (
            <div style={{
              position: "absolute",
              top: 0, bottom: 0,
              right: 0,
              width: Math.round(2 / Math.max(bgScaleX, 0.05)), // compensate for scaleX compression
              background: `linear-gradient(180deg, transparent, ${accent}, ${accent}, transparent)`,
              opacity: 0.9,
              boxShadow: `0 0 16px ${accent}, 0 0 32px ${accent}88`,
            }} />
          )}
        </div>
      )}

      {/* ── Word stack ── */}
      <div style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        paddingLeft:  isHebrew ? 0 : isVertical ? 32 : 64,
        paddingRight: isHebrew ? (isVertical ? 32 : 64) : 0,
        paddingTop: isVertical ? 40 : 30,
        transform: `scale(${globalScale})`,
        opacity: exitOpacity,
      }}>
        {words.map((word, i) => {
          const delay = textOffset + i * STAGGER;
          const wordScale = spring({
            frame: Math.max(0, frame - delay),
            fps,
            from: 0,
            to: 1,
            config: { damping: 9, stiffness: 350 },
          });
          const wordY = interpolate(
            frame - delay, [0, 14], [40, 0],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) }
          );
          const ws = wordStyles(i);

          const glitchAmt = i === 0
            ? interpolate(frame - textOffset, [0, 1, 3], [12, 4, 0], { extrapolateRight: "clamp" })
            : 0;

          return (
            <React.Fragment key={i}>
              {i > 0 && <SepLine delay={textOffset + (i - 1) * STAGGER + 6} />}
              <div style={{
                position: "relative",
                transform: `translateY(${wordY}px) scaleY(${wordScale})`,
                transformOrigin: isHebrew ? "top right" : "top left",
                lineHeight: 0.85,
                overflow: "visible",
              }}>
                {glitchAmt > 0 && (
                  <div style={{
                    position: "absolute",
                    fontSize: baseFontSize,
                    fontWeight: 900,
                    color: accent,
                    textTransform: isHebrew ? "none" : "uppercase",
                    letterSpacing: isHebrew ? 0 : -2,
                    transform: `translateX(${glitchAmt}px)`,
                    opacity: 0.45,
                    mixBlendMode: "screen",
                    userSelect: "none",
                  }}>{word}</div>
                )}
                <div style={{
                  fontSize: baseFontSize,
                  fontWeight: 900,
                  color: ws.color,
                  textTransform: isHebrew ? "none" : "uppercase",
                  letterSpacing: isHebrew ? 0 : -2,
                  WebkitTextStroke: ws.stroke !== "none" ? `4px ${ws.stroke}` : undefined,
                  textShadow: ws.shadow !== "none" ? ws.shadow : undefined,
                  whiteSpace: "nowrap",
                  userSelect: "none",
                }}>{word}</div>
              </div>
            </React.Fragment>
          );
        })}

        {subtext && (() => {
          const stDelay = textOffset + words.length * STAGGER + 10;
          const stOpacity = interpolate(frame - stDelay, [0, 14], [0, 1], {
            extrapolateLeft: "clamp", extrapolateRight: "clamp",
          });
          return (
            <div style={{
              fontSize: Math.round(baseFontSize * 0.17),
              fontWeight: 600,
              color: "rgba(255,255,255,0.45)",
              textTransform: isHebrew ? "none" : "uppercase",
              letterSpacing: isHebrew ? 0 : 5,
              marginTop: 20,
              opacity: stOpacity * exitOpacity,
            }}>{subtext}</div>
          );
        })()}
      </div>

      {/* ── Viewfinder corners ── */}
      {Math.floor(frame / 10) % 2 === 0 && [
        { top: 24, left: 24,  borderTopWidth: 2, borderLeftWidth: 2  },
        { top: 24, right: 24, borderTopWidth: 2, borderRightWidth: 2 },
        { bottom: 24, left: 24,  borderBottomWidth: 2, borderLeftWidth: 2  },
        { bottom: 24, right: 24, borderBottomWidth: 2, borderRightWidth: 2 },
      ].map((pos, i) => (
        <div key={i} style={{
          position: "absolute", width: 20, height: 20,
          borderColor: accent, borderStyle: "solid", borderWidth: 0,
          opacity: isTransparent ? exitOpacity * 0.5 : 0.5,
          ...pos,
        }} />
      ))}

      {/* ── Frame counter ── */}
      <div style={{
        position: "absolute",
        bottom: isVertical ? 32 : 24,
        right: isHebrew ? undefined : 36,
        left: isHebrew ? 36 : undefined,
        fontSize: 11,
        fontFamily: "monospace",
        color: `${accent}66`,
        letterSpacing: 3,
        opacity: exitOpacity,
      }}>
        {String(frame).padStart(4, "0")}
      </div>
    </div>
  );
};
