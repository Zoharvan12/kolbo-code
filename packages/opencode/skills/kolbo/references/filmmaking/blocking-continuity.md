# Blocking, Geography, and Continuity

Use this pack for multiple subjects, dialogue, recurring locations, cross-shot continuity, or any result where characters flip, teleport, swap, duplicate, or lose props.

## Build the map before the shot

Record stable scene geography independently of camera prose:

- landmark names and screen/world relationships;
- entrances, exits, furniture, hazards, levels, and movement paths;
- key light direction;
- one side of the 180-degree line for coverage;
- character starting marks and recurring prop homes.

Tie people to visible landmarks. Prefer “at the stage edge, one stride from the exit door” over an unsupported abstract coordinate. Use measurable distances only when they genuinely help the target model.

## First-frame contract

State exactly what frame one contains when occupancy matters:

- active character count;
- screen position and depth layer;
- body facing and eyeline;
- contact with landmarks/props;
- camera side and shot size;
- motion already in progress or deliberate stillness.

Do not automatically add an empty establishing beat. Use a short master/positioning image only when it serves continuity or editorial intent.

## Position grammar

For each important subject specify as needed:

- screen-left/center/right;
- foreground/midground/background;
- facing direction and torso orientation;
- gaze target;
- relation/contact to landmark;
- movement direction/path;
- hand/prop state;
- permitted moment of relocation.

Body direction and eye direction are separate facts.

## Internal cuts

At every cut preserve or deliberately change:

- camera side and screen direction;
- subject marks, facing, eyelines, and posture;
- wardrobe, hair, wounds, dirt, wetness;
- prop owner, hand, orientation, damage;
- environmental debris, smoke, fire, water, practical lights;
- emotional pressure and breath;
- audio tail and mouth state.

Begin the new shot on a physically possible continuation or explicit temporal/spatial reset. Do not use “continues from before” as the only instruction.

## Across generations

Record the approved final state of shot N and compile it into shot N+1. Use the continuity ledger rather than reinterpreting the previous prompt.

Default to the full approved prior video plus explicit final-state prose. The video owns motion cadence, performance, ambience, temporal carry, and the actual landing state. Do not automatically extract or attach its last frame merely because the next shot is connected.

Add a last-frame or staging still only when exact opening geometry is essential, or after a video-only attempt failed on blocking, axis, eyeline, prop-hand state, or composition. When both references are used, keep their authority non-overlapping: the prior video owns temporal behavior; the still owns only the new shot's opening crop, pose, facing, positions, and geometry.

Continuity can intentionally break for ellipsis, montage, dream logic, or a revealed camera-side change, but name the transition in the edit plan.

## Staging/layout references

Use a staging reference when prose cannot reliably hold multi-character geometry.

### Diagram construction

- Build a front-view composition map from the intended camera side, not a top-down floor plan unless the model has proven it can use one.
- Use thin muted outlines or another low-style-mass representation.
- Keep one distinct color per figure/path.
- Preserve crop, pose, facing, scale, and anchoring furniture.
- Avoid rendered names/letters if they may bleed into the video.
- Version every retake from the real source frame, not from a progressively degraded diagram.

### Connector

In the video prompt, bind diagram identities textually:

```text
<staging tag> controls position, pose, facing, and path only.
BLUE figure = <character tag> at <mark> facing <target>.
Visual identity, wardrobe, materials, light, and grade come from character/location references.
```

Attach strong identity/location references before the staging reference when attachment order affects the model.

### Anti-bleed discipline

Do not describe the diagram's graphic aesthetics inside the final video prompt. State positively where the final picture's style and identity come from.

## Depth and trajectory helpers

Use a depth map when the difficult problem is volume, scale, or occlusion. Use trajectory paths when the problem is a thrown object, bullet, creature, vehicle, camera path, or character cross. Define start, path, end, trigger beat, and owner.

## Count and scale laws

For critical counts or scale, write:

- the intended count/measure;
- visible proof in the frame;
- relationship to a known person/object;
- what state must not multiply during motion.

Avoid contradictory repeated bans. One clear law near the protected action plus a concise final restatement is usually stronger.

## Audit failures

Flag:

- “left of him” without a stable camera/world anchor;
- changing map facts between shots;
- camera crossing the line without showing it;
- gaze directions that do not meet;
- prop teleportation or hand swap;
- asset state reset after a cut;
- diagram controlling style rather than geometry;
- overly free camera instruction in a strict geography shot;
- active references that are not visible or required.
