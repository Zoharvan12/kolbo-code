# Filmmaking Router

Operate as a filmmaking system, not merely a prompt writer. Preserve project truth across generations while compiling every generation into a self-contained instruction the selected model can execute.

## Start here

1. Identify the requested production stage and deliverable.
2. Read only the reference files required by the routing table below.
3. Preserve or establish the relevant production truth before writing a shot.
4. Choose generation mode, control density, craft packs, audio lane, and model adapter.
5. Produce the requested artifact in the user's language; keep generation prompts in English unless the user requests otherwise.
6. Run the applicable audit. For saved prompt/package artifacts, run the bundled validators.

Do not generate media, spend credits, or contact external systems unless the user explicitly asks. Do not silently change an existing billable prompt beyond the requested scope. In Workbench mode, patch the failed section and keep proven sections byte-stable whenever practical.

## Route the work

Read [routing.md](references/filmmaking/routing.md) for the full decision rules.

| Request | Mode | Read |
|---|---|---|
| Any multi-asset or multi-scene production — film, ad, episode, campaign, recurring or multiple characters | Production planning | `references/workflows/production-planning.md` **first** — map assets, build the DNAs, confirm the set, only then shoot |
| Premise, outline, screenplay, weak scene | Development | `scene-engine.md`, then `workflows.md` |
| Character, location, prop, state, voice, or production preparation | Pre-production | `asset-preproduction.md`, `production-bible.md`; add `acting-direction.md` for recurring characters |
| One generation-ready video prompt | Direction | `prompt-contracts.md`, selected craft references, then the model adapter |
| Connected dialogue or performance | Direction | `acting-direction.md`, `blocking-continuity.md`, `audio-dialogue-music.md`, model adapter |
| Music video, dance, singing, or exact song | Direction | `audio-dialogue-music.md`, `cinematography.md`, `blocking-continuity.md`, model adapter |
| Difficult action, transformation, scale, vehicle, creature, water, or impossible gravity | Direction | `physics-action.md`, `blocking-continuity.md`, `cinematography.md`, model adapter |
| Broken result or prompt | Audit | `validation.md` plus only the craft/model references implicated by the failure |
| Revise one failed behavior without losing what worked | Workbench | `validation.md` and the relevant craft reference |
| Multi-scene, episode, commercial, music video, or feature workflow | Production | `production-bible.md`, `workflows.md`, `validation.md` |

For Seedance 2.5, always read [seedance-2-5.md](references/models/seedance25.md) before final compilation. Treat capability numbers as a dated adapter snapshot and verify them against current provider/catalog truth when real money or production delivery depends on them.

## Keep two layers separate

### Project truth

Maintain durable facts outside individual prompts:

- story goal, world laws, period, genre, tone, and visual registers;
- characters, immutable identity anchors, states, wardrobe, injuries, performance engines, and voices;
- locations, landmark geometry, light direction, axes, and available coverage;
- props, vehicles, creatures, scale laws, ownership, hand state, damage, and versions;
- scene and shot cards, continuity state, coverage, generation attempts, and editorial needs.

Use the templates in `assets/filmmaking/` when the task benefits from saved project state. Read [production-bible.md](references/filmmaking/production-bible.md) before creating or updating them.

### Generation island

Compile only what the current generation needs. A video model cannot resolve “same as before” unless the needed state is restated. Include active truth explicitly, but do not carry inactive characters, stale tags, old props, irrelevant backstory, or previous-shot prose.

Kolbo Visual DNA is semantic project truth, not merely reference imagery. Read and preserve the saved DNA type and analyzed context: character DNAs own identity/state/performance/voice; environment and scene DNAs own location/geography/light; product DNAs own prop/product identity, scale, material, and state; style DNAs own the visual register. Keep exact tags and never reinterpret one DNA type as another.

## Compile a shot

Read [prompt-contracts.md](references/filmmaking/prompt-contracts.md) for exact structures.

Before writing, establish:

1. The dramatic event and the shot's job in the edit.
2. Active references and exact state variants.
3. First visible frame and final state.
4. Geography, axis, screen direction, eyelines, and prop/hand state.
5. Action feasibility inside the duration.
6. Acting tasks for performers and listeners.
7. Camera grammar and control density.
8. Audio ownership, exact words/lyrics, and whether music is native, source-driven, or reserved for post.
9. Model capability limits and target generation mode.

Prompt-length limits apply to the entire compiled generation prompt as one string, including whitespace, headers, timecodes, dialogue, audio, and locks. Count after compilation; read the cap from `max_prompt_length` via `list_models` (see `models/seedance25.md`).

**Seedance 2 / Seedance 2.5 / `generate_elements` — Locked Intro is the only compile shape.** Read `references/models/seedance.md` (and `seedance25.md` for 2.5 caps). Do not emit the SCENE CONTEXT / OPTICS / ACTION department pack below as the generation prompt. Every Visual DNA in play must be `@ExactName` in CAST and in each shot — never "the left man" or a possessive.

```text
Total: Xs / N shots / AR
[GLOBAL LOOK – LOCKED, APPLIES TO EVERY SHOT]
[CAST – IDENTICAL IN EVERY SHOT]   ← @DNAName per person
[LOCATION]
SHOT N — 0:00–0:02 — …
```

The SCENE CONTEXT pack in `prompt-contracts.md` is an **audit / pre-compile checklist** for non-Seedance models and Workbench diagnosis — not the default Elements prompt.

For anchored or exploratory work on other models, collapse compatible blocks and protect only non-negotiables. Never manufacture a rigid skeleton when a looser model-native prompt is more likely to succeed.

## Preserve continuity

Track both kinds:

- **Within-generation continuity:** positions, axis, gaze, wardrobe, props, injuries, lighting, motion, audio ownership, and state across internal cuts.
- **Across-generation continuity:** the exact final state of shot N becomes explicit input truth for shot N+1. Preserve emotional carry, breath, body tension, dirt/wetness/damage, prop hand, screen direction, ambience, and dialogue seam.

Never rely on memory alone for a substantial production. Update the continuity ledger after an approved shot or deliberate script/state change.

## Workbench revisions

When a generation fails:

1. Compare intended versus observed result.
2. Identify one primary failure owner: asset, state, dramatic design, blocking, acting, optics, camera, timing, physics, lighting, audio, model capability, or prompt contradiction.
3. Change the smallest causal unit.
4. Preserve every proven line or block.
5. Log the change and verdict.
6. After repeated failures, redesign the shot: bake the state into an asset, add a staging/layout reference, reduce actions, split the shot, change the angle, or switch model/mode.

Do not keep polishing adjectives when the shot is physically or structurally overconstrained.

## Validate

Read [validation.md](references/filmmaking/validation.md). At minimum check:

- all referenced assets exist and match the intended state;
- no stale, invented, dangling, or conflicting tags;
- character and prop counts remain feasible;
- duration, timecodes, shot count, and dialogue fit;
- continuous-take and cut instructions do not conflict;
- one actor owns each spoken/sung line;
- camera freedom does not contradict strict geography;
- model limits and prompt budget are respected;
- final frame state is explicit enough for the next shot;
- the result is usable without reading hidden reasoning.

Run:

```powershell
python scripts/filmmaking/validate_film_package.py <project-folder>
python scripts/filmmaking/lint_prompt.py <prompt.txt> --shot-card <shot-card.json> --model seedance-2.5
```

Fix errors before delivery. Report warnings that represent genuine creative tradeoffs rather than silently flattening the user's intent.

## Production workflows

Read [workflows.md](references/filmmaking/workflows.md) for single shots, dialogue scenes, music performance, connected sequences, impossible shots, and feature workflows.

This workflow is part of the canonical Kolbo skill. The Kolbo Code sync pipeline mirrors it to MCP and plugin consumers; product surfaces may compile the same filmmaking truth through their own model adapters.
