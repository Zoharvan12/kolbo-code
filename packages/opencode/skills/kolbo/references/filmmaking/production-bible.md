# Production Bible and Continuity State

Use durable project state for any recurring cast, world, location, prop, voice, visual register, or multi-shot production.

## Sources of truth

Maintain these layers:

1. **Production bible** — project-wide creative and technical truth.
2. **Asset registry** — every approved character, state, location, prop, vehicle, creature, audio, diagram, and motion reference.
3. **Scene card** — dramatic event, geography, active states, coverage plan, and scene-level constants.
4. **Shot card** — one generation's exact inputs, intent, timing, final state, and edit relationship.
5. **Continuity ledger** — state entering and leaving each approved shot.
6. **Generation log** — prompt version, one change, result, verdict, and selected take.

Use the JSON/CSV templates in `assets/` as starting artifacts. Keep project-owned files outside this skill folder.

## Production bible

Capture only facts that should survive many scenes:

- project ID, title, format, runtime target, genre, tone, logline, story goal;
- period and world laws, including forbidden anachronisms;
- visual worlds/registers, palette logic, light laws, texture, capture grammar;
- character IDs, immutable identity anchors, performance engine, voice identity, state variants;
- location IDs, material/geography anchors, light direction, time/weather variants, available angles;
- prop/vehicle/creature IDs, scale, material, states, ownership, action limitations;
- audio policy, score policy, language/accent rules, subtitle policy;
- default model adapters and verified capability snapshot;
- naming/version policy and approval gates.

Do not store shot-specific improvisation as global truth.

## Asset identity and states

Treat identity and state separately.

- Identity answers: who/what is this across the project?
- State answers: what exact version appears now—wardrobe, wetness, wound, dirt, damage, age phase, prop configuration, upside-down orientation?

Create a new immutable state asset when a meaningful visible condition changes. Never overload one tag with mutually exclusive states. Preserve prior approved states.

Prefer a stable naming pattern:

```text
@char_<PROJECT>_<name>_<state>_vN
@loc_<PROJECT>_<name>_<time-weather>_sN_vN
@prop_<PROJECT>_<name>_<state>_sN_vN
@vehicle_<PROJECT>_<name>_<view-state>_vN
@staging_<PROJECT>_<scene-shot>_vN
@audio_<PROJECT>_<character-or-track>_<section>_vN
```

Use only legal identifiers supported by the destination platform. One asset has one canonical active tag.

## Scene card

Record:

- structural goal, open jeopardy, event/reversal/value shift;
- shared acting direction and each character's motive/task;
- location variant, map, landmarks, camera side, 180-degree axis, light law;
- entering character/prop/environment states;
- planned coverage and edit arc;
- scene-level audio bed and score intention;
- unresolved assets or risks.

## Shot card

Record:

- shot ID and scene ID;
- editorial job and dramatic beat;
- generation family/mode, model, duration, aspect, control density;
- active assets and exact state tags;
- first frame, blocking, camera side, eyelines, action/timing;
- acting tasks, dialogue/audio ownership;
- physics and light constraints;
- final frame/state and intended cut relationship;
- prompt path/version, output candidates, approval/QC state.

A shot card is the compiler input. The model prompt is a derived artifact, not the source of production truth.

## Continuity ledger

Track explicit entering and leaving values for:

- character position, facing, eyeline, posture, breath, emotional pressure;
- wardrobe, hair, dirt, wetness, blood, injury, transformation;
- prop owner, hand, orientation, open/closed/loaded/broken state;
- vehicle/creature position, motion vector, damage, occupants;
- location time, weather, light direction, practical states, debris;
- camera side, screen direction, lens family, motion state;
- last spoken line, mouth state, ambience, score/SFX tail.

Update only from an approved take or deliberate story change. Do not let an accidental generation artifact become canon without explicit approval.

## Version and change discipline

- Never overwrite an approved asset state or prompt version.
- Change one causal variable per diagnostic iteration whenever possible.
- Record the observed result, not only “failed.”
- Preserve the selected take and the exact prompt/model/settings that created it.
- After repeated identical failures, reclassify the problem as asset, shot design, capability, or model mismatch.

## Compilation rule

Compile the current shot from the bible, asset registry, scene card, shot card, and incoming continuity state. Include only active facts. Re-anchor all details the model cannot infer from attached inputs; omit lore the shot cannot show or hear.
