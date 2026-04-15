---
title: Motion Design & Video Production
impact: HIGH
impactDescription: transforms generic animations into professional motion graphics with cinematic camera work, beat-driven timing, and production-quality transitions
tags: motion-design, announcement-video, cinematic, camera, beat, whip-pan, word-reveal, production
---

## Beat-Driven Absolute Timeline

**Never** nest `<Sequence>` components for multi-scene videos. Define a single `T` object with absolute frame positions — the whole timeline becomes readable and easy to adjust.

**Incorrect (fragile nested sequences):**

```tsx
<Sequence from={0} durationInFrames={60}>
  <SceneA />
</Sequence>
<Sequence from={60} durationInFrames={90}>
  <SceneB />
</Sequence>
```

**Correct (absolute beat timeline):**

```tsx
const T = {
  intro:       0,
  codeScene:   58,
  terminal:    98,
  terminalEnd: 248,
  shipScene:   252,
  cta:         450,
  TOTAL:       560,
} as const;

// Components self-hide outside their window:
if (frame < at || frame >= exit) return null;
```

---

## Camera Rig — Handheld + 3D Tilt + Z Dolly

Every production video needs a camera layer. Wire it once, all content gets it.

```tsx
// Slow Z dolly into each section
const camZ = frame < T.terminal
  ? interpolate(frame, [0, T.terminal], [-120, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.quad) })
  : 0;

// Organic breathing tilt (barely perceptible — felt not seen)
const camTiltY = Math.sin(frame / 180) * 1.2;
const camTiltX = Math.cos(frame / 240) * 0.8;

// Ultra-slow handheld drift
const driftX = Math.sin(frame * 0.028) * 3.0 + Math.sin(frame * 0.061) * 1.5;
const driftY = Math.cos(frame * 0.035) * 2.5 + Math.cos(frame * 0.073) * 1.2;

// Beat-synced camera kick
const impactAmt = ALL_BEATS.reduce((acc, bf) => {
  const d = frame - bf;
  if (d >= 0 && d < 22) {
    const peak = BIG_BEATS.has(bf) ? 22 : 13;
    return acc + interpolate(d, [0, 22], [peak, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
  }
  return acc;
}, 0);

const shakeX = driftX + Math.sin(frame * 0.71) * impactAmt * 0.65;
const shakeY = driftY + Math.cos(frame * 0.83) * impactAmt * 0.35;
const shakeRot = Math.sin(frame * 0.022) * 0.25 + Math.sin(frame * 0.57) * impactAmt * 0.025;
```

JSX structure — outer shake, inner 3D perspective:

```tsx
<div style={{
  position: 'absolute', inset: 0,
  transform: `translateX(${shakeX + whipX}px) translateY(${shakeY}px) rotate(${shakeRot}deg)`,
  filter: whipBlur > 0 ? `blur(${whipBlur}px)` : undefined,
}}>
  <div style={{ position: 'absolute', inset: 0, perspective: '1400px', perspectiveOrigin: '50% 50%' }}>
    <div style={{
      position: 'absolute', inset: 0,
      transform: `rotateX(${camTiltX}deg) rotateY(${camTiltY}deg) translateZ(${camZ}px)`,
      transformStyle: 'preserve-3d',
    }}>
      {/* All scene content here */}
    </div>
  </div>
</div>
```

---

## Whip Pan Between Sections

Fast lateral translateX + motion blur. Apply to the whole content wrapper at section cut frames.

```tsx
const WHIP_FRAMES = [T.terminal, T.shipScene, T.cta]; // all major cuts
const WHIP_HALF = 4; // frames each side = 8 total = 0.27s

const { whipX, whipBlur } = WHIP_FRAMES.reduce(
  (acc, tf) => {
    const d = frame - tf;
    if (d >= -WHIP_HALF && d < WHIP_HALF) {
      const x = d < 0
        ? interpolate(d, [-WHIP_HALF, 0], [0, -420], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.in(Easing.cubic) })
        : interpolate(d, [0, WHIP_HALF], [420, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
      const blur = interpolate(Math.abs(d), [0, WHIP_HALF], [22, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
      return { whipX: acc.whipX + x, whipBlur: Math.max(acc.whipBlur, blur) };
    }
    return acc;
  },
  { whipX: 0, whipBlur: 0 },
);
```

No overlay effects needed. The displacement + blur IS the transition.

---

## Masked Word Reveal — Soft Gradient Window

**Never use `overflow: hidden`** for word reveals — causes hard cuts at container edges.
Use CSS `mask-image` gradient instead. Words slide through a soft dissolve zone.

```tsx
const maskGrad = [
  'transparent calc(50% - 185px)',
  'black calc(50% - 105px)',
  'black calc(50% + 105px)',
  'transparent calc(50% + 185px)',
].join(', ');

<div style={{
  position: 'absolute', inset: 0,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  maskImage: `linear-gradient(to bottom, ${maskGrad})`,
  WebkitMaskImage: `linear-gradient(to bottom, ${maskGrad})`,
}}>
  {words.map((word, i) => {
    const wordAt = at + i * stagger; // stagger: 6-10 frames per word
    const enterY = interpolate(frame, [wordAt, wordAt + enterDur], [215, 0], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic),
    });
    const exitY = interpolate(frame, [exit - exitDur, exit], [0, -215], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.in(Easing.cubic),
    });
    return (
      <span key={i} style={{ transform: `translateY(${enterY + exitY}%)`, display: 'inline-block', lineHeight: 1 }}>
        {word}
      </span>
    );
  })}
</div>
```

**Font size guide:**
- Brand / hero reveal: `fontSize: 192, fontWeight: 900, letterSpacing: '-8px'`
- Section headlines: `fontSize: 128, fontWeight: 800, letterSpacing: '-4px'`
- Never drop below 128px for main titles — inconsistency reads as a bug

---

## Impact Flash System

Beat-synced white flash — screen-space overlay, outside the camera rig.

```tsx
const ALL_BEATS = [T.intro, T.codeScene, T.shipScene, T.cta];
const BIG_BEATS = new Set([T.intro, T.cta]);

const flashOpacity = ALL_BEATS.reduce((acc, bf) => {
  const d = frame - bf;
  if (d >= 0 && d < 8) {
    const peak = BIG_BEATS.has(bf) ? 0.14 : 0.07;
    return Math.max(acc, interpolate(d, [0, 8], [peak, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }));
  }
  return acc;
}, 0);

{flashOpacity > 0.005 && (
  <div style={{ position: 'absolute', inset: 0, background: 'white', opacity: flashOpacity, pointerEvents: 'none' }} />
)}
```

Only add flash beats for major section cuts — not for UI elements fading in within a scene.

---

## Narrative Order — Promise Before Proof

Text headlines BEFORE recordings/demos, not after.

- ✅ `"Code anything."` → terminal recording → `"Ship anything."` → desktop recording  
- ❌ terminal recording → `"Code anything."` (that's a caption, not a headline)

## Cold Open — No Warmup

Frame 0 = the brand name or strongest visual. No intro slides, no warmup.  
If you have a brand name, open on it at 192px. Let the first word be the hook.

## Avoid Copy Redundancy

Adjacent phrases must not repeat words or contradict each other.
- ❌ `"Beyond code."` immediately followed by a `"Code."` beat
- ❌ `"Code anything."` then `"Create anything."` (same structure, same word)
- ✅ `"Code anything."` → `"Ship anything."` (different verb, completes a story arc)

## One Logo Rule

Never show the product logo twice. If it appears in a mid-video reveal (e.g. orbit converge scene), remove it from the CTA. Use text only at the end.
