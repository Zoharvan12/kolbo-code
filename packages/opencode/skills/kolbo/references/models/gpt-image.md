<!-- PARITY: this file mirrors getGptImagePromptSystemPrompt() in
     kolbo-api/src/config/systemPrompt.js (lines ~858–965).
     When that function changes, update this file in the same session. -->

# GPT Image 2 — Prompt Rules

Load this file when the user wants a **GPT Image 2 / gpt-image-2** image (OpenAI). For other image models see `models/nano-banana.md`, `models/creative-director.md`, or `models/prompt-copilot.md`.

**Kolbo MCP routing:** call `generate_image` (text-to-image) or `generate_image_edit` (edits with `source_images`). Pass `model: "gpt-image-2"` when the user named it; otherwise consult `list_models({ type: "text_to_img" })`.

## CRITICAL Kolbo Platform Rules

- **Resolution and aspect ratio are MCP-tool params** (`aspect_ratio`, `resolution`) — NEVER include `size=`, `1024x1536`, aspect-ratio tags, or any resolution syntax inside the `prompt` field.
- Pass aspect / resolution as separate tool parameters. Quality (`low` / `medium` / `high`) is its own param too — never bake it into the prompt text.
- Do not write Python, `client.images.generate`, OpenAI SDK code, or `size=` keyword arguments. The user is generating through Kolbo's MCP tools.

## Universal Prompting Rules (apply to EVERY prompt)

- **Structure + goal**: write prompts in a consistent order — background/scene → subject → key details → constraints → declared intended use (ad / UI mock / infographic / poster / logo / etc.). The "intended use" line sets the mode and polish level.
- **Format**: prefer skimmable templates over clever syntax. Use short labeled segments or line breaks for complex requests. Minimal, descriptive paragraph, JSON-like, instruction-style, or tag-based all work — pick whichever is most maintainable for that asset.
- **Specificity + quality cues**: be concrete about materials, shapes, textures, and medium (photo / watercolor / 3D render / vector). Add targeted quality levers only when needed (`film grain`, `textured brushstrokes`, `macro detail`).
- **Photorealism trigger**: include the literal word **"photorealistic"** to engage the model's photorealistic mode. Supporting phrases: "real photograph", "taken on a real camera", "professional photography", "iPhone photo", "35mm film". Camera specs (lens mm, aperture) work for high-level look but are loosely interpreted — use for vibe, not physics.
- **Composition**: specify framing/viewpoint (close-up, wide, top-down), perspective (eye-level, low-angle), lighting/mood (soft diffuse, golden hour, high-contrast). If layout matters, call out placement ("logo top-right", "subject centered, negative space on left").
- **People, pose, action**: describe scale, body framing, gaze, object interactions ("full body visible, feet included", "looking down at the open book, not at the camera", "hands naturally gripping the handlebar").
- **Constraints — what changes vs what stays**: state exclusions and invariants explicitly. For edits use **"change only X" + "keep everything else the same"**, and re-state the preserve list on every iteration to prevent drift. Common invariants: identity, geometry, layout, brand elements, camera angle, saturation, contrast, labels, surrounding objects. Always include "no watermark, no extra text, no logos/trademarks" unless the brief specifies otherwise.
- **Text in images**: put literal text in **quotes** or **ALL CAPS**, specify typography (font style, size, color, placement). For tricky words / brand names, spell letter-by-letter. Recommend quality **high** when text is small, dense, or multi-font.
- **Multi-image inputs**: reference each input by number with a short description ("Image 1: product photo… Image 2: style reference…") and describe the interaction ("apply Image 2's style to Image 1", "place the dog from Image 2 next to the woman in Image 1"). Use `@image1` / `@image2` tags — see `workflows/visual-dna.md`.
- **Iterate, don't overload**: prefer a clean base prompt + single-change follow-ups ("make lighting warmer", "remove the extra tree", "restore the original background") over one giant prompt.

## Latency vs Fidelity (recommend `quality` param)

- **low**: high-volume batches, drafts, ideation, latency-sensitive cases. Often "good enough" — default for variant exploration.
- **medium**: balanced. Style probing, normal exploration.
- **high**: final assets, small/dense text, multi-font layouts, close-up portraits, identity-sensitive edits, infographics, diagrams, posters, UI with labels, scientific visuals, slides with charts/footnotes.

## Use Cases (text → image)

### Infographics, diagrams, scientific visuals, slides/charts
- Treat as artifact spec, not illustration request. Name exact deliverable. Define hierarchy. Provide real text/data verbatim in quotes.
- Demand: readable typography, polished spacing, no decorative clutter, no stock-photo treatment.
- Recommend: `quality: "high"`, landscape `aspect_ratio` for deck/slide outputs.

### Photorealism
- Prompt as if a real photo is being captured in the moment. Use photography language (lens, lighting, framing). Explicitly ask for **real texture** — pores, wrinkles, fabric wear, imperfections.
- Avoid words that imply studio polish ("glamorized", "heavily retouched") unless that's the brief.

### Logos
- Brand personality + use case + clean, original mark + strong silhouette + balanced negative space + scales from small to large. Flat design, minimal strokes, no gradients unless essential. Plain background, generous padding, centered. "Original, non-infringing".
- Recommend: `quality: "medium"`, square or portrait `aspect_ratio`; pass `num_images: 4` for variants.

### Ads / marketing creatives
- Write like a creative brief: brand, audience, culture, concept, composition, exact copy. Let the model make taste decisions inside boundaries.
- Quote the tagline verbatim, demand exactly one rendering, integrated into the layout.

### Story-to-comic / multi-panel
- Define the narrative as a sequence of clear visual beats — one per panel. Number each panel and describe action concretely. For multi-panel sets, prefer `generate_creative_director` with `scene_count` — see `models/creative-director.md`.

### UI mockups
- Describe the product **as if it already exists**. Focus on layout, hierarchy, spacing, real interface elements. Avoid concept-art language. Place inside a device frame when relevant ("iPhone frame").

### Translation in images (edit)
- "Translate the text to <lang>. Do not change any other aspect of the image. Preserve typography style, placement, spacing, and hierarchy. Translate verbatim. No reflow unless necessary. Do not edit logos, icons, or imagery."

## Use Cases (text + image → image, edits)

For edits, the prompt should be tight and constraint-heavy. Call `generate_image_edit` with `source_images: [...]`.

### Style transfer
- "Use the same style from the input image. Generate <new subject/scene>. Keep <palette/texture/brushwork> consistent. Background: <X>. Framing: <Y>. No extra elements."

### Virtual try-on
- Lock the person (face, body shape, pose, hair, expression). Change garments only. Demand realistic fit (draping, folds, occlusion), consistent lighting and shadows so it doesn't look pasted on. No accessories/text/logos unless asked.

### Drawing → photoreal render
- "Preserve exact layout, proportions, perspective. Add realism via plausible materials, lighting, environment. Do not add new elements or text."

### Product mockup / extraction
- Plain opaque background, centered product, crisp silhouette, no halos/fringing. Preserve geometry and label legibility exactly. Only light polishing + subtle contact shadow. No restyling.

### Marketing creative with in-image text
- Quote copy exactly. Demand "verbatim, no extra characters, exactly once". Specify font style, contrast, kerning, placement.

### Lighting / weather transformation
- Change ONLY environmental conditions (lighting direction/quality, shadows, atmosphere, precipitation, wetness). Preserve identity, geometry, camera angle, object placement.

### Object removal
- "Remove the <X>. Do not change anything else." Keep edits surgical. Re-state every invariant.

### Person → scene compositing
- Ground realism: natural lighting, believable detail, no cinematic grading unless asked. Lock subject identity, expression, body. Higher input fidelity helps likeness across larger scene edits.

### Multi-image referencing / compositing
- Specify which input to transplant ("the dog from `@image2`"), where it goes ("right next to the woman in `@image1`"), and what stays ("scene, background, framing"). Match lighting, perspective, scale, and shadows.

### Interior design swap (precision edit)
- "Replace ONLY <object> with <new object>. Preserve camera angle, room lighting, floor shadows, surrounding objects. Photorealistic contact shadows and fabric texture."

### Character consistency across pages (children's book / story art)
- Step 1: establish a **character anchor** — lock appearance, proportions, outfit, palette, personality on a plain background. Better yet: create a Visual DNA (see `workflows/visual-dna.md`).
- Step 2+: feed the anchor (or DNA via `visual_dna_ids`) as input. "Continue the story using `@<dna-name>`. Do not redesign. Same <outfit/features/palette>. New scene: <X>."

## Output Discipline

- Pass the prompt as the `prompt` field on `generate_image` / `generate_image_edit`.
- **NEVER** include resolution/size/aspect/ratio strings inside the prompt body.
- When summarizing the call to the user, mention 3 things separately from the prompt:
  - **Aspect / Resolution preset:** `<portrait | landscape | square | wide / 2K>` with a one-line why
  - **Quality:** `<low | medium | high>` with a one-line why
  - **Why this works:** 1 line on the key prompting choice (constraint clarity / text fidelity / identity lock / etc.)
- If the user asks in any language other than English, write explanations in their language but keep the prompt itself English.
- Suggest small, single-change iterations for follow-ups rather than re-writing the whole prompt.
