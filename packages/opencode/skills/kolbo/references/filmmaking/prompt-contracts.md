# Prompt Contracts

Compile from approved project/shot state. Keep explanatory notes outside the generation prompt.

## Strict shot contract

Use for dialogue, continuity, complex blocking, exact synchronization, or failure recovery.

```text
SCENE CONTEXT
<dramatic event, exact active count, duration, editorial job>

ACTIVE REFERENCES
<tag: role, state, action-critical anchors, reference authority>

LOCATION MAP
<landmarks, marks, axis, light direction>

FIRST FRAME AND SPATIAL BLOCKING
<frame-one positions, facing, eyelines, contact, prop/hand state>

FORMAT MODE
<single take or exact cuts, duration, speed, aspect if adapter requires>

OPTICS
<content-matched FOV/signature, focus plan>

CAMERA
<operator position/movement and motivation>

ACTION TIMING / SHOTS
<light executable beats with explicit state bridges>

PHYSICS
<only relevant mass/contact/material laws>

LIGHTING
<source, direction, exposure priority, continuity>

ACTING TASKS
<shared direction and playable tactic/listening behavior>

DIALOGUE
<speaker, exact text, timing, silence/mouth ownership>

AUDIO / MUSIC
<lane, source, ownership, ambience/SFX/score relationship>

STYLE
<project register; do not override identity or geography>

POSITIVE LOCKS
<short restatement of failure-critical facts>
```

Omit empty sections. Do not duplicate all reference descriptions again in final locks.

## Anchored spectacle contract

Use when the model should discover coverage inside fixed truth:

```text
GOAL / SIGNATURE MOMENT
ACTIVE REFERENCES AND STATES
WORLD / GEOGRAPHY ANCHORS
START STATE
MANDATORY BEAT ORDER
PHYSICS / SCALE LAWS
FINAL STATE
CAMERA FREEDOM: <dimensions allowed to vary>
AUDIO LANE
FAILURE-CRITICAL LOCKS
```

State what is fixed and what is free. Avoid locking one camera path while simultaneously asking for bold variation.

## Exploratory coverage contract

Use for b-roll, montage, music inserts, or alternative coverage:

```text
EDITORIAL PURPOSE
IDENTITY / WORLD CONSTANTS
PERFORMANCE OR ACTION LANGUAGE
VISUAL / AUDIO REGISTER
ALLOWED VARIATIONS
EXCLUSIONS ONLY WHEN FAILURE-CRITICAL
```

Request separate variations rather than contradictory camera moves inside one take.

## Dialogue contract

Include:

- current shared event;
- each speaker's tactic;
- listener task;
- exact line ownership and time;
- voice identity plus scene delivery;
- breath/reaction tail;
- eyeline and mouth state;
- ambience behavior under speech.

One short line per clip is often reliable, but do not impose that as a universal model law. Use actual duration/capability and the user's editorial plan.

## Exact-song contract

Include:

- authoritative source audio tag;
- performers and non-performers;
- lyric fragment and waveform-wins rule;
- choreography/beat hits;
- breath seam and final pose/state;
- returned-audio/post-audio policy.

## Workbench patch contract

Return:

```text
ROOT CAUSE
<one causal owner>

PATCH
<only changed section or exact diff>

PRESERVE
<sections/lines that remain unchanged>

EXPECTED PROOF
<visible/audible outcome that confirms the fix>
```

Do not rewrite the whole prompt when one block owns the failure.

## Prompt-card routing

When the caller supports Kolbo prompt cards, tag the final fenced block with the generation mode selected from inputs. Keep all internal shots of one generation inside one card. Keep multiple separate generations as separate cards only when the user requested multiple outputs or the adapter requires a split.
