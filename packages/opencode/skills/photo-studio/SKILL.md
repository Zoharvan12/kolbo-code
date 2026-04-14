---
name: photo-studio
description: >
  Local AI photo generation and editing using FLUX.2 Klein 4B, Z-Image Turbo, and Ollama Gemma4.
  Use when the user wants to generate or edit images locally (no API cost, no rate limits).
  Models at I:/AI-Models/. Script at G:/Projects/Kolbo.AI/github/training-loras/scripts/photo-studio.py
  Keywords: generate image, edit image, flux klein, z-image turbo, local diffusion, photo studio, gemma4
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
| LLM / Vision | Ollama Gemma4 (runs locally at `http://localhost:11434`) |

## How to Run

Always use the ai-toolkit venv (has Flux2KleinPipeline + ZImagePipeline + ollama package):

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
| `--analyze` | off | Analyze `--image` with Gemma4, use as base description |
| `--enhance` | off | Enhance `--prompt` with Gemma4 before generating |
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

### Analyze image and generate variation
```bash
python photo-studio.py \
  --image char.jpg --analyze \
  --prompt "standing upright, full body" \
  --model flux
```

### Auto-enhance a short prompt then generate
```bash
python photo-studio.py \
  --prompt "street fashion guy" --enhance \
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

### Ollama Gemma4 (vision + LLM)
- Used for `--analyze` (describe input image) and `--enhance` (expand prompt)
- Runs locally, no API key, no rate limits
- Model: `gemma4` (9.6GB, multimodal)
- Ollama auto-starts on Windows boot

## When to use which model

| Task | Model |
|------|-------|
| Edit an existing image | `flux` |
| Character body panel generation | `flux` |
| MIRAGE-style portraits | `zimage --adapter` |
| Quick text-to-image | `flux` or `zimage` |
| Portrait + face reference | `flux --image face.jpg` |

## Prompt Tips (Gemma4 is the default prompter)

When the user gives a short/vague prompt, always use `--enhance` to let Gemma4 expand it. For image editing, pair `--analyze --enhance` to get the best context from the source image.
