---
name: kolbo
description: Generate images, videos, music, speech, and sound effects using Kolbo AI. Use when asked to create any visual, audio, or video content — or to list available AI models or check credit balance.
---

# Kolbo AI — Creative Generation

You have access to the Kolbo AI platform via MCP tools. Use them to generate images, videos, music, speech, and sound effects directly from conversation.

## Available Tools

| Tool | Description |
|------|-------------|
| `generate_image` | Create images from text prompts. Returns image URL(s). |
| `generate_video` | Create videos from text. Returns video URL. |
| `generate_video_from_image` | Animate a static image into video. Returns video URL. |
| `generate_music` | Create music from descriptions. Returns audio URL. |
| `generate_speech` | Convert text to speech. Returns audio URL. |
| `generate_sound` | Generate sound effects. Returns audio URL. |
| `list_models` | Browse available AI models filtered by type. |
| `check_credits` | Check remaining Kolbo credit balance. |
| `get_generation_status` | Poll status of an in-progress generation by ID. |

## Workflow

1. **Check credits** — call `check_credits` before generating to confirm balance
2. **Discover models** — call `list_models` with a `type` filter to get current model identifiers. Models change frequently; never hardcode them.
3. **Generate** — call the appropriate tool. Pass the `identifier` from `list_models` as `model`, or omit it to let Kolbo auto-select the best model.
4. **Result** — the tool polls internally and returns the final URL when ready.

## Model Types

Use these values with `list_models`:

| Type | Use for |
|------|---------|
| `image` | Image generation |
| `video` | Text-to-video |
| `video_from_image` | Image-to-video animation |
| `music` | Music generation |
| `speech` | Text-to-speech |
| `sound` | Sound effects |

## Tips

- **Images** are fastest (~10–30s). `enhance_prompt: true` is on by default.
- **Video** takes longest (~1–5 min). Check `supported_durations` and `supported_aspect_ratios` from `list_models` before generating.
- **Music** supports `style`, `instrumental`, and `lyrics` parameters.
- **Speech** — pass a voice `identifier` from `list_models` for a consistent voice.
- If a video generation times out, use `get_generation_status` with the returned generation ID to retrieve the result.
- Models marked `recommended: true` in `list_models` are Kolbo's top picks for quality and speed.

## Examples

> "Generate an image of a neon-lit Tokyo street at night"
> "Create a 5-second video of ocean waves"
> "Make a lo-fi hip hop beat, instrumental only"
> "Convert this text to speech: Welcome to Kolbo"
> "Animate this image into a short video"
> "What image models are available?"
> "Check my credit balance"
