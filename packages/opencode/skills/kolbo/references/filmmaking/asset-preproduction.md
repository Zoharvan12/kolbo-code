# Asset Pre-production

Build stable inputs before expensive continuity work.

## Asset contract

Treat an asset as:

```text
canonical tag + immutable state + approved descriptor + reference media + provenance + stress-test status
```

The descriptor and media have different jobs. Media carries appearance. Text declares role, state, critical anchors, scale, ownership, and constraints the model might drop.

For Kolbo Visual DNA, treat `dnaType` and the saved analyzed description/system prompt as authoritative asset data. Compile by role:

- `character` → identity, physical state, wardrobe, performance, speaking voice, and singing voice;
- `environment` / `scene` → location volume, landmarks, geography, materials, light, atmosphere, and available coverage;
- `product` → recurring prop/product identity, scale, material, ownership, interaction state, and damage/version;
- `style` → visual register only.

Never flatten every DNA into CAST or infer role only from its images. Exact tags remain immutable.

## Character assets

Create a canonical identity source and separate state variants.

For a reference sheet, capture at minimum:

- a high-information close portrait;
- full-body front and back or equivalent coverage;
- neutral readable light and background;
- empty hands unless an object is permanently inseparable;
- optional smile/mouth state for speaking characters;
- stable skin, hair, proportions, marks, and silhouette.

Avoid baking a scene-specific grade, rim light, camera gimmick, or prop into the base identity asset. Create new state assets for wardrobe, wetness, wounds, dirt, age phase, transformation, gravity orientation, or action-critical pose.

## Location assets

Create plates that communicate volume, material, landmarks, and one coherent light logic.

- Prefer a three-quarter view for spatial readability.
- Include visible anchors used for blocking.
- Separate day/night/weather/light states.
- Create reverse/background plates for dialogue-heavy locations.
- Keep people and movable action props out unless they are permanent environmental facts.
- Record which qualities a location reference controls: geography, materials, atmosphere, light, palette, or optics.

Do not let a location reference silently control the shot's framing unless explicitly intended.

## Props, vehicles, creatures, and crowds

Define action-critical states separately: open/closed, intact/broken, clean/bloody, hidden/revealed, front/back interior, loaded/unloaded, wings folded/open.

Record scale with visible comparisons. For crowds, decide whether one crowd asset plus selected lead extras is more stable than many individual references.

## Impossible-shot preparation

Move difficult truth into the input when prose repeatedly fails:

- rotate/invert the character state for shifted gravity;
- build a first/last frame;
- create a staging/layout reference;
- use a depth map for volume;
- use a motion reference for complex choreography;
- create a purpose-built prop or creature state;
- generate a new location angle rather than asking the video model to invent it.

This is not cheating; it is production design.

## Surgical image revision

Preserve the original and change one thing:

```text
CHANGE: the single intended difference.
PRESERVE: identity, composition, camera, wardrobe, props, lighting, shadows, palette, texture, and every unaffected element.
```

Never run an approved identity source repeatedly through full-frame transformation when a masked/local edit can preserve it. Version every approved variant.

## Stress testing

Test assets in the conditions that matter:

- multiple shot sizes and actions;
- real target locations and lighting;
- dialogue, laughter, distress, and unusual poses;
- alongside recurring co-stars and props;
- across the intended model/mode.

If the same failure survives prompt fixes, rebuild the asset or state. A beautiful sheet that fails motion is not production-ready.

## Approval gate

Do not begin continuity-heavy production until the required cast, locations, props, states, voices, and world rules are named, versioned, and sufficiently stress-tested. For exploratory tests, label temporary assets and prevent them from becoming canonical accidentally.
