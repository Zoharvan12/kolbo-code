---
name: storytelling
description: >
  Narrative structure and storytelling for video content. Explainer arc templates, hook types,
  the 30-second retention rule, pacing by duration, the "but-therefore" method, concept
  introduction patterns. Use when scripting explainer videos, educational content, or any
  narrative-driven video.
  Keywords: storytelling, narrative, script, explainer, hook, arc, structure, pacing, retention,
  educational, concept, story, writing, script structure
---

# Storytelling & Narrative Structure for Video

## The Explainer Arc Template (3 minutes)

Scale proportionally for other lengths.

```
[0:00 - 0:08]  HOOK
               Pattern interrupt or counterintuitive claim. 1-2 sentences max.
               Visual: striking image or animation that creates curiosity.

[0:08 - 0:30]  TENSION / INFORMATION GAP
               "Here's what most people think... but that's not quite right."
               Establish stakes: why should I care?

[0:30 - 0:50]  CONCEPT 1 (Foundation)
               Simplest building block needed. ONE idea, ONE visual.
               End with a "but" or "therefore" transition.

[0:50 - 1:15]  CONCEPT 2 (Complication)
               Build on Concept 1. Introduce the wrinkle.
               Visual: transform/evolve the previous visual.

[1:15 - 1:20]  PALETTE CLEANSER
               Brief pause, visual gag, or "let that sink in" moment.
               Gives working memory a beat to consolidate.

[1:20 - 1:50]  CONCEPT 3 (Key Insight)
               The "aha" moment. Core of the video.
               1-3 seconds of deliberate silence after the reveal.
               Visual: the most polished animation in the video.

[1:50 - 2:20]  PROOF / EXAMPLE
               Concrete demonstration: "Watch what happens when..."
               Show the insight working in a specific case.

[2:20 - 2:45]  IMPLICATIONS / "SO WHAT?"
               Connect back to the real world. "This means that..."
               Scale from specific back to general.

[2:45 - 3:00]  REFRAME + CLOSE
               Callback to the hook. Restate core insight in one sentence.
               Optional: open a new curiosity gap.
```

## Scaling by Duration

| Length | Concepts | Hook | Tension | Core | Proof | Close |
|--------|----------|------|---------|------|-------|-------|
| 1 min | 1-2 | 5s | 10s | 30s | 10s | 5s |
| 2 min | 2-3 | 8s | 15s | 60s | 25s | 12s |
| 3 min | 3-5 | 8s | 22s | 100s | 30s | 15s |
| 5 min | 5-8 | 10s | 30s | 180s | 50s | 20s |

## Hook Types

| Type | Pattern | Best For |
|------|---------|----------|
| **Contrarian** | "Everything you've been told about X is wrong." | Science/myth-busting |
| **Outcome** | "By the end of this video, you'll understand X." | Math/concept explainers |
| **Mystery** | "In 1987, something impossible happened..." | Story-driven content |
| **Stakes** | "This one mistake costs people X every year." | Practical/how-to |

## The 30-Second Rule

50% of viewer drop-off happens in the first 30 seconds. The hook + tension setup MUST be complete by second 30. Retention curves that survive the 30-second cliff typically retain 40-60% through the full video.

## The "But-Therefore" Method

Never connect sections with "and then." Always use **"but"** or **"therefore."**

**Bad:** "Atoms have electrons, AND THEN those electrons have energy levels, AND THEN..."

**Good:** "Atoms have electrons. BUT those electrons can only exist at specific energy levels. THEREFORE, when they jump between levels, they release light at exact frequencies."

Each "but" creates tension. Each "therefore" resolves it. This is the engine of narrative momentum.

## Concept Introduction Pattern

For each new concept in the video:

1. **Name it** — give the concept a label the viewer can hold onto
2. **Show it** — visual representation (never just explain with words)
3. **Contrast it** — "unlike X, this works by..."
4. **Apply it** — concrete example in the real world
5. **Connect it** — link to the previous concept with "but" or "therefore"

## Pacing by Content Energy

| Energy Level | Pacing | Visual Change Rate |
|-------------|--------|-------------------|
| High (promo, action) | Fast cuts, 1-2s per shot | Every 1-2 seconds |
| Medium (tutorial, explainer) | Balanced, 3-5s per shot | Every 3-4 seconds |
| Low (meditation, documentary) | Let scenes breathe, 5-10s | Every 5-8 seconds |

## Common Mistakes

- **Info dump at the start** — frontload curiosity, not information
- **No stakes** — "here's a cool fact" vs "this changes how you should think about X"
- **Too many concepts** — one concept per minute is the maximum for retention
- **Missing the "aha"** — every video needs ONE clear revelation moment
- **Symmetric structure** — the most important concept should be at 60-70% through the video, not in the middle
- **No callback** — the close should reference the hook, creating a satisfying loop

---

## Kolbo MCP Integration

Use storytelling structure to guide Kolbo generation workflows:

**Scripted Explainer Workflow:**
1. Write script using the arc template above
2. `generate_speech` → narrate each section
3. `generate_image` or `generate_video` per scene (with visual direction from script)
4. `generate_music` → background track matching the energy arc
5. Compose in Remotion or FFmpeg following the timing structure
6. `transcribe_audio` → generate captions for accessibility

**AI-Assisted Scripting:**
Use `chat_send_message` with a video-capable model to brainstorm scripts. Feed the arc template as context and ask the AI to fill in each section for your topic.

**Creative Director for Visual Storyboarding:**
`generate_creative_director` with 4-8 scenes mapped to the arc sections:
- Scene 1: Hook visual
- Scene 2-3: Concept visuals
- Scene 4: Key insight / "aha" visual
- Scene 5-6: Proof / example
- Scene 7-8: Close / callback
