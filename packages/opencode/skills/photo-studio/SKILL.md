---
name: photo-studio
description: >
  Local AI photo generation and editing using FLUX.2 Klein 4B and Z-Image Turbo.
  Use when the user wants to generate or edit images locally (no API cost, no rate limits).
  Models at I:/AI-Models/. Script at G:/Projects/Kolbo.AI/github/training-loras/scripts/photo-studio.py
  Keywords: generate image, edit image, flux klein, z-image turbo, local diffusion, photo studio
---

# Photo Studio — Local AI Image Generation & Editing

## Infrastructure

| Component | Path |
|-----------|------|
| Script | `G:/Projects/Kolbo.AI/github/training-loras/scripts/photo-studio.py` |
| Python venv | `G:/Projects/Kolbo.AI/github/ai-toolkit/venv/Scripts/python.exe` |
| FLUX.2 Klein 4B | `I:/AI-Models/flux2-klein-4b/` |
| Z-Image Turbo | `I:/AI-Models/z-image-turbo/` |
| Z-Image Adapter | `I:/AI-Models/z-image-turbo-adapter/zimage_turbo_training_adapter_v2.safetensors` |
| Vision / LLM | **Kolbo MCP** — `upload_media` → `chat_send_message` (Gemini) |

## How to Run

Always use the ai-toolkit venv (has Flux2KleinPipeline + ZImagePipeline):

```bash
"G:/Projects/Kolbo.AI/github/ai-toolkit/venv/Scripts/python.exe" \
  "G:/Projects/Kolbo.AI/github/training-loras/scripts/photo-studio.py" \
  [args...]
```

## CLI Reference

| Flag | Default | Description |
|------|---------|-------------|
| `--prompt "..."` | — | Text prompt |
| `--image path.jpg` | — | Input image (FLUX editing only) |
| `--model flux\|zimage` | `flux` | Model to use |
| `--output result.jpg` | `output_<ts>.jpg` | Output path |
| `--width N` | 1152 | Width in pixels |
| `--height N` | 2048 | Height in pixels |
| `--steps N` | 20 | Inference steps |
| `--cfg N` | 3.5 | Guidance scale |
| `--seed N` | random | Deterministic seed |
| `--adapter` | off | Load Z-Image Turbo adapter (zimage only) |

## Common Recipes

### Text-to-image (portrait)
```bash
python photo-studio.py \
  --prompt "full-body front view, woman in designer dress, cinematic lighting" \
  --model flux --width 1152 --height 2048
```

### Edit existing image
```bash
python photo-studio.py \
  --image input.jpg \
  --prompt "wide full-body view of the subject, cinematic" \
  --model flux --width 1152 --height 2048
```

### Analyze image then generate variation
```
# Step 1: Analyze the image with Kolbo MCP (Gemini vision)
upload_media({ source: "/abs/path/to/char.jpg" })
→ { url: "https://cdn.kolbo.ai/..." }

chat_send_message({
  message: "Describe this person in detail: clothing, pose, features, style. Output as a generation prompt.",
  model: "gemini-2.5-pro",
  media_urls: ["<url from upload>"]
})
→ { content: "detailed description..." }

# Step 2: Use the description as the prompt
python photo-studio.py \
  --prompt "<description from Gemini> standing upright, full body" \
  --model flux
```

### Enhance a short prompt then generate
```
# Step 1: Enhance the prompt with Kolbo MCP
chat_send_message({
  message: "Expand this into a detailed image generation prompt for a photorealistic portrait: 'street fashion guy'",
})
→ { content: "A young man in his mid-20s wearing..." }

# Step 2: Generate with the enhanced prompt
python photo-studio.py \
  --prompt "<enhanced prompt from Kolbo>" \
  --model zimage --width 1152 --height 2048
```

### Z-Image with adapter (MIRAGE-style)
```bash
python photo-studio.py \
  --prompt "cinematic full-body portrait, editorial" \
  --model zimage --adapter --width 1152 --height 1536 --cfg 4.0
```

## Model Notes

### FLUX.2 Klein 4B (`--model flux`)
- Class: `Flux2KleinPipeline` (diffusers)
- Supports both text-to-image AND image editing via `image` param
- Good default: `--steps 20 --cfg 3.5`
- ~13GB VRAM needed

### Z-Image Turbo (`--model zimage`)
- Class: `ZImagePipeline` (diffusers), uses Qwen3 text encoder
- Text-to-image ONLY (no image editing)
- **8 NFEs, no CFG** — distilled model, per official README. More steps = waste, CFG > 0 = wrong
- Default: `--steps 8 --cfg 0.0 --width 1152 --height 2048` (~30s per image)
- Add `--adapter` to load the v2 training adapter

### Vision & Prompt Enhancement — Kolbo MCP
- For image analysis: `upload_media` → `chat_send_message` with `media_urls` + `model: "gemini-2.5-pro"`
- For prompt enhancement: `chat_send_message` asking Kolbo to expand a short prompt
- Do NOT use `--analyze` or `--enhance` flags (those call a local model that is no longer used)

## When to use which model

| Task | Model |
|------|-------|
| Edit an existing image | `flux` |
| Character body panel generation | `flux` |
| MIRAGE-style portraits | `zimage --adapter` |
| Quick text-to-image | `flux` or `zimage` |
| Portrait + face reference | `flux --image face.jpg` |

## Prompt Tips

When the user gives a short/vague prompt, always use `chat_send_message` to let Kolbo AI (Gemini/Claude) expand it before passing to the script. For image editing, first analyze the source image via `upload_media` → `chat_send_message` with Gemini vision, then use the description as the base prompt.
