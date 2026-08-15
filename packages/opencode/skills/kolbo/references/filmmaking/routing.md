# Routing

Use this file to choose the minimum effective workflow and context.

## 1. Select the production stage

| Stage | User intent | Primary deliverable |
|---|---|---|
| Development | Invent, structure, write, or repair story material | Premise, outline, scene, sequence, screenplay pages, structural audit |
| Pre-production | Prepare stable inputs before spending generations | Production bible, asset plan, character/location/prop/voice/state specification, storyboard |
| Direction | Turn an approved shot or scene into executable model instructions | Shot card, generation prompt, blocking map prompt, audio plan |
| Audit | Diagnose a prompt or generated result | Root cause, failed contract, smallest corrective action |
| Workbench | Revise a known prompt after a failed take | Section-level patch plus unchanged remainder |
| Production | Coordinate many shots and downstream editorial needs | Shot list, continuity ledger, generation log, coverage/QC status |

If the user asks for several stages, preserve order: Development → Pre-production → Direction → Audit/Workbench → Production/QC.

## 2. Select the generation family and mode

Decide from inputs and intended output, not from the model brand.

| Intent and inputs | Mode |
|---|---|
| Existing source video must change | video-to-video |
| Required start and end images | first/last frame |
| One still is the exact opening frame and must animate | image-to-video |
| Character, location, product, prop, diagram, or multimodal references define a new scene | elements/reference-driven |
| Explicit words-only generation, no references | text-to-video |
| Source waveform drives performance | audio-driven/lip-sync capable mode |

Start/end-frame intent outranks Elements. Existing-video edit outranks fresh generation. Do not ask which mode when the evidence is sufficient.

## 3. Select control density

### Strict

Use when one wrong detail invalidates the take:

- dialogue and lip ownership;
- precise multi-person blocking or 180-degree axis;
- prop hand, count, scale, state, injury, or contact;
- exact timing, choreography, lyrics, or cut points;
- repeated generation failure;
- expensive hero shot or cross-shot continuity seam.

Specify first frame, time windows, positions, camera side, physical causality, dialogue ownership, and explicit failure locks. Keep each time window light enough to execute.

### Anchored

Use when key facts must hold but variation may improve the result:

- spectacular action with known start/end anchors;
- creature or vehicle motion where physics and scale must hold;
- reveal, rescue, transformation, or impossible shot;
- cinematic coverage where exact camera path is not essential.

Lock identity, geography, state, essential beats, physics, and final state. Grant freedom only to named dimensions such as camera path, shot size, or moment-to-moment staging.

### Exploratory

Use when variation is the point:

- montage and b-roll;
- music-video inserts and alternate coverage;
- mood exploration;
- early visual development.

Keep identity, world, period, audio ownership, safety, and editorial objective fixed. Invite a bounded range of camera or performance solutions.

## 4. Select the audio lane

| Lane | Use when | Required truth |
|---|---|---|
| Dialogue | Actors speak exact lines | speaker, verbatim text, timing, voice identity, listener behavior, silence ownership |
| Exact-song lip-sync | A supplied waveform must own the mouth | source asset, performer ownership, exact lyrics/phonetics, breath seams, non-performer mouth behavior |
| Native music performance | The model should create or perform a musical moment | musical structure, performers, vocal ownership, tempo/beat behavior, desired score/SFX relationship |
| Ambience/SFX only | Music belongs in post or silence is dramatic | environment bed, timed effects, no-score instruction if model supports it |
| Post-production music | Picture should remain edit-friendly | continuous ambience and clean dialogue/SFX; score brief tracked separately |

Do not turn “no music” into “no audio.” Preserve requested dialogue, ambience, and effects.

## 5. Select craft packs

Load a pack only when a relevant signal is present:

- **Story:** scene, sequence, goal, stakes, reversal, value shift, screenplay, weak dramatic beat.
- **Assets:** recurring identity, new state, location plate, prop, vehicle, crowd, character sheet, stress test.
- **Acting:** speaking, listening, reaction, close-up, dead eyes, flat performance, overacting, subtext.
- **Blocking:** more than one subject, dialogue coverage, recurring location, screen direction, position drift, staging map.
- **Cinematography:** shot size, lens, camera path, style, reveal, edit grammar, perspective.
- **Physics:** contact, weight, vehicle, creature, water, particles, weapon, fall, jump, transformation, impossible gravity.
- **Audio:** speech, song, lip-sync, score, sound design, ambience, voice continuity.

## 6. Select the adapter

Read the target model adapter last so it can translate the creative plan into actual limits and syntax. Never let the adapter replace the story, performance, or production truth.

If the model is unspecified, ask only when the answer materially changes the deliverable. Otherwise produce a model-neutral shot card and state which adapter remains unresolved.

## 7. Select output depth

- If the user asks only for a prompt, lead with the prompt and keep notes short.
- If the user asks for an audit, give the root cause and patch, not a complete rewrite unless required.
- If the user asks for a workflow, produce saved-state artifacts before generation prompts.
- If essential production truth is missing and guessing would risk paid generations, ask at most three targeted questions. Otherwise choose defensible defaults and label them outside the prompt.
