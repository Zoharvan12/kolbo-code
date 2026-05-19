# @kolbo/mcp

Use [Kolbo AI](https://kolbo.ai) as native tools in Claude Code and Claude Desktop via MCP (Model Context Protocol).

Generate images, videos, music, speech, sound effects, multi-scene campaigns, and conversational chat — all from natural language in your coding environment. 100+ AI models behind Smart Select routing, with reusable Visual DNA profiles for character/style consistency.

## Quick Setup

### 1. Get an API Key

Create a key at [app.kolbo.ai](https://app.kolbo.ai) or via the [API](https://docs.kolbo.ai/developer-api).

### 2. Add to Claude Code

Add to `.claude/settings.json`:

```json
{
  "mcpServers": {
    "kolbo": {
      "command": "npx",
      "args": ["-y", "@kolbo/mcp@latest"],
      "env": {
        "KOLBO_API_KEY": "kolbo_live_..."
      }
    }
  }
}
```

### 3. Use it

Just ask Claude naturally:

- *"Generate an image of a sunset over mountains"*
- *"Create a 5-second video of waves crashing"*
- *"Build a 4-scene storyboard for a coffee shop ad"*
- *"Remove the background from this image"*
- *"Make a lo-fi hip hop beat"*
- *"Read this out loud with a British female voice"*
- *"Ask Claude about the latest AI news with web search on"*
- *"Analyze this video and tell me what prompts are shown on screen"*
- *"What's in this image?"*
- *"Create a Visual DNA profile called 'Alex' from these images"*

## Available Tools (51)

**Generation**
| Tool | Description |
|------|-------------|
| `generate_image` | Text → image |
| `generate_image_edit` | Existing image(s) + prompt → edited image |
| `generate_video` | Text → video |
| `generate_video_from_image` | Still image + motion prompt → video |
| `generate_video_from_video` | Input video + prompt → restyled video (video-to-video) |
| `generate_elements` | Reference images/videos + prompt → animated video |
| `generate_first_last_frame` | First frame + last frame → interpolated video |
| `generate_lipsync` | Source image/video + audio → lipsynced video |
| `generate_creative_director` | One brief → N coordinated scenes (image or video) |
| `generate_music` | Text (+ optional lyrics) → song |
| `generate_speech` | Text + voice → spoken audio |
| `generate_sound` | Text → sound effect |
| `generate_3d` | Text or reference images → 3D model (GLB/FBX/OBJ/USDZ) |
| `transcribe_audio` | Audio/video URL or file → text + SRT subtitles |

Every image/video/creative-director tool accepts `visual_dna_ids` and `moodboard_id` for character/style consistency across outputs — you can compose `create_visual_dna` → `generate_image` (with the DNA applied server-side) in a single agent turn. `generate_creative_director` also accepts `moodboard_ids` plural for blending.

Every generation tool also accepts an optional `resolution` arg. Images use `"1K"` (~1024px) / `"2K"` (Full HD) / `"3K"` (QHD) / `"4K"` (UHD); videos use vertical-pixel tiers like `"720p"` / `"1080p"` / `"1440p"` / `"2160p"`. Values are model-dependent — call `list_models` and read the chosen model's `supported_resolutions` and `resolutionMultipliers`. Omit to use the model default.

**Chat & Vision**
| Tool | Description |
|------|-------------|
| `chat_send_message` | Multi-turn chat with any Kolbo model. Pass `media_urls` to analyze images, videos, or audio — auto-routes to Gemini for vision. Supports web search and deep think. |
| `chat_list_conversations` | List past chat threads |
| `chat_get_messages` | Fetch messages in a conversation |

**Visual DNA** (reusable character/style/product profiles)
| Tool | Description |
|------|-------------|
| `create_visual_dna` | Create a profile from URLs or local files |
| `list_visual_dnas` | List your profiles |
| `get_visual_dna` | Fetch one profile |
| `delete_visual_dna` | Delete a profile |

**Moodboards**
| Tool | Description |
|------|-------------|
| `list_moodboards` | Browse presets + your moodboards |
| `get_moodboard` | Fetch one moodboard with all image URLs |

**Media Library**
| Tool | Description |
|------|-------------|
| `upload_media` | Upload a local file (or remote URL) → stable Kolbo CDN URL for reuse |
| `list_media` | Browse media library — filter by `project_id`, `folder_id`, `type`, `category` (ai / uploaded / edited / favorites / training-lab), `source_type`, `sort`, `search`, pagination |
| `list_media_folders` | List the user's media folders (owned + shared) — discover `folder_id` values to pass to `list_media` |
| `create_media_folder` | Create a new folder (name, optional description / color / icon) |
| `update_media_folder` | Rename / recolor / re-icon a folder (owner only) |
| `delete_media_folder` | Soft-delete a folder (owner only; items remain in library) |
| `add_media_to_folder` | Add up to 500 media items to a folder (idempotent) |
| `remove_media_from_folder` | Remove media items from a folder |
| `share_media_folder` | Share a folder by user email (owner only) |
| `unshare_media_folder` | Revoke a user's access to a folder (owner only) |
| `favorite_media` | Mark a media item as favorited (idempotent) — pass `media_id` from `list_media` |
| `unfavorite_media` | Remove a media item from favorites (idempotent) — pass `media_id` from `list_media` |
| `get_media` | Fetch one media item's full details by id |
| `delete_media` | Soft-delete a media item (30-day trash) |
| `restore_media` | Restore a trashed item |
| `permanently_delete_media` | Hard-delete (NOT reversible — confirm with user first) |
| `move_media` | Re-assign a media item to a different project |
| `bulk_delete_media` | Soft-delete up to 1000 items in one call |
| `bulk_restore_media` | Restore up to 1000 trashed items |
| `bulk_permanently_delete_media` | Hard-delete up to 1000 (NOT reversible) |
| `bulk_move_media` | Move up to 1000 items to a project (atomic — all-or-nothing) |
| `move_folder_contents` | Move every item in a folder to a project |
| `get_media_stats` | Counts + storage bytes per type (optionally per project) |

**Discovery & Account**
| Tool | Description |
|------|-------------|
| `list_models` | Current model catalog with costs and capabilities |
| `list_voices` | TTS voices (presets + cloned) |
| `list_presets` | Generation presets across image/video/music/text-to-video catalogs |
| `check_credits` | Check credit balance |
| `get_generation_status` | Poll a generation by ID (fallback if a tool times out) |

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `KOLBO_API_KEY` | Yes | Your Kolbo API key |
| `KOLBO_API_URL` | No | Custom API URL (default: `https://api.kolbo.ai/api`) |

## Links

- [API Documentation](https://docs.kolbo.ai/developer-api)
- [Kolbo AI Platform](https://kolbo.ai)
- [Get API Key](https://app.kolbo.ai)
