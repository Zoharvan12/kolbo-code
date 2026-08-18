# Thumbnails — YouTube, Shorts, Reels, TikTok covers

Load this file when the user wants a **thumbnail, video cover, first-frame card, or
channel art**: "thumbnail for my video", "YouTube cover", "Shorts cover", "make it
clickable", "higher CTR".

A thumbnail is not a nice image at small size. It is a different craft with a different
success test: **it is judged at ~200px inside a scrolling feed, next to a hundred others.**
Everything below follows from that.

---

## The four layers

Every thumbnail that works has exactly these, in this order of importance.

### 1. ONE hero subject — 40–70% of the frame

A face with a big, readable emotion (eyes visible, mouth doing something), or a single
object caught mid-action. Crop tight — chest-up for a person.

Kill on sight: full-body wide shots, three competing focal points, a floating UI panel, an
abstract gradient, "a person at a desk". If the concept has no surprise, wit, or
impossibility in it, it will not stop a scroll — write the concept as one sentence first,
and if that sentence is boring, invent harder before generating.

### 2. Extreme separation

The subject must pop off the background: a dark field behind a bright subject, or one
saturated accent against its complement. **Mid-tone on mid-tone is the number-one
unreadable-thumbnail failure.** Muted, tasteful palettes lose in a feed.

### 3. Text — 2 to 4 words, maximum

- Quote the exact words in the prompt: `render only this text: "STOP DOING THIS"`.
- Topmost layer, above every element and effect.
- Roughly **35–45% of the canvas width**. Heavy condensed sans.
- White or a single accent colour with a **thick dark outline or a solid backing bar** —
  raw text on a busy image is illegible small.
- Upper or lower third. **Never across the face.**
- Forbid everything else explicitly: `no other text, no taglines, no watermark, no logo,
  no captions, no placeholder text`.

Long strings come back mangled from every image model. If the user wrote a sentence, put
three words on the image and tell them the rest belongs in the video title. For brand
names, spell them letter-by-letter in the prompt and raise quality when the type is small.

**Depth trick:** let the subject overlap one word slightly (subject in front of one
letter). Instant production value.

### 4. Platform-safe composition

| Format | Rules |
|---|---|
| **16:9 — YouTube** | Centre-weighted. Nothing critical in the outer 15%: the duration chip sits bottom-right and the red progress bar covers the bottom edge on watched videos. |
| **9:16 — Shorts / Reels / TikTok** | Every critical element must survive a **centre-square crop** (feeds and grids crop vertical media to its middle). Keep the top ~15% and the bottom ~20% clear of the platform's title, avatar, caption and buttons. |
| **1:1** | Community posts and square feeds. |

**Verification is a release gate, not a suggestion:** view the render at ~200px, and for
9:16 crop the centre square first. If the words or the face don't survive, iterate.

---

## Model choice

Text fidelity is the entire constraint. Pick the image model that renders type most
reliably, and raise the quality setting when the words are small or multi-font. If the
words come back garbled twice, generate the image **text-free** and tell the user to set
the type in the Canvas tool — a clean plate plus real type beats a third mangled attempt.

## Routing in Kolbo

| Ask | Tool |
|---|---|
| One cover | `generate_image` (a single `text_to_image`) |
| Several options at once | The in-app **Thumbnail Generator** — topic + style + font + aspect, and it fans out 4–8 art-directed variations in one run (it uses Creative Director underneath) |
| A batch with a locked character or product | `generate_creative_director` with a Visual DNA attached |
| Cover for a video the user already made | Never crop a frame out of the video — generate a fresh comp. A film frame is exposed for motion, not for a 200px grid |

## Variation ladder

When producing a set, vary the **concept**, never the words. This is the ladder the in-app
tool uses, and it is a good default order:

1. Bold dynamic — high contrast, dramatic light, scroll-stopping energy
2. Clean minimal — one focal point, premium negative space
3. Vibrant saturated — rich colour, maximum visual impact
4. Cinematic wide — epic scale, movie-poster feeling
5. Close-up dramatic — intense subject detail, emotional impact
6. Typography-forward — the text is the hero, graphic art direction
7. Dark moody — deep shadows, selective highlights
8. Flat bright illustration — playful shapes, bold outlines

## Faces

If the channel has a host, lock them with a **character Visual DNA**
(`workflows/visual-dna.md`) so every thumbnail in the series is the same person. Expression
is the payload: shock, delight, disbelief, triumph. A neutral face is a wasted thumbnail.

## Phone-shot thumbnails

A "raw / authentic" cover is a real style — a phone-shot frame with big type over it beats
a polished render for vlog and UGC channels. Build the plate from
`workflows/ugc-smartphone.md`, then apply the text rules above unchanged. The type stays
graphic and deliberate even when the photo is deliberately casual.

---

## Checklist

- [ ] One subject, 40–70% of frame, tight crop
- [ ] Subject separates hard from the background
- [ ] ≤ 4 words, quoted verbatim, everything else forbidden
- [ ] Text has an outline or backing bar, sits off the face
- [ ] Correct aspect, critical content inside the safe area
- [ ] Checked at 200px (and centre-cropped first, for 9:16)
- [ ] No watermark, no stray words, no gibberish letters
