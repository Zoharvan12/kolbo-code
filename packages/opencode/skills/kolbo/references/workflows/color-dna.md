# Color DNA — Brand Palette Grading

Load this file when the user works with Color DNA / color palettes: creating, activating, analyzing, or opting a generation out of palette grading.

Core contract (also in SKILL.md): **Color DNA is sticky and account-wide — at most one palette is active at a time**, and while one is active it strict-grades **every** image and video generation automatically, with no per-call argument.

Operational detail:

- `analyze_color_palette` pulls colors out of 1–5 image URLs **for free** and does **NOT** save anything — use it to draft a palette before creating one.
- `create_color_palette` defaults `is_active: true`, which activates the new palette and deactivates any other active one.
- Per-generation opt-out: `skip_color_palette: true` on `generate_image` / `generate_image_edit` / `generate_video` / `generate_video_from_image`.
- Manage with `list_color_palettes` / `update_color_palette` / `activate_color_palette` / `deactivate_color_palette` / `delete_color_palette` (edit in place — never delete+recreate).
