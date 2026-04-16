/**
 * ensureKolboMcpWired — lightweight module for wiring the Kolbo MCP config.
 *
 * Extracted from cli/cmd/providers.ts so it can be imported by the server
 * routes (server/routes/provider.ts) WITHOUT pulling in the full CLI module
 * chain (cli/cmd/providers → Plugin → Session → ...), which caused a
 * module-initialization ordering crash in the compiled Bun binary.
 *
 * Only imports lightweight, server-safe modules.
 */
import fs from "fs"
import path from "path"
import { Auth } from "../auth"
import { Partner } from "../brand/partner"
import { Global } from "../global"

function writeJsonAtomic(target: string, data: unknown, mode: number) {
  const content = JSON.stringify(data, null, 2)
  const tmp = `${target}.tmp.${process.pid}.${Math.random().toString(36).slice(2, 10)}`
  fs.writeFileSync(tmp, content, { mode })
  try { fs.chmodSync(tmp, mode) } catch {}
  fs.renameSync(tmp, target)
}

const KOLBO_SKILL_MD = `---
name: kolbo
description: Generate images, videos, music, speech, sound effects, 3D models, and more using Kolbo AI. Use when asked to create any visual, audio, or video content — or to manage media, check credits, or list available AI models.
---

# Kolbo AI — Creative Generation

You have access to the full Kolbo AI platform via MCP tools. Use them to generate images, videos, music, speech, sound effects, 3D models, transcribe audio, and manage media.

## Available Tools

### Generation
| Tool | Description |
|------|-------------|
| \`generate_image\` | Create images from text prompts. Returns image URL(s). |
| \`generate_image_edit\` | Edit an existing image with a text instruction. |
| \`generate_creative_director\` | Run a multi-scene image campaign from a brief. |
| \`generate_video\` | Create videos from text. Returns video URL. |
| \`generate_video_from_image\` | Animate a static image into video. |
| \`generate_video_from_video\` | Transform or restyle an existing video. |
| \`generate_elements\` | Generate compositable image elements (transparent PNG). |
| \`generate_first_last_frame\` | Generate a video interpolated between two frames. |
| \`generate_lipsync\` | Sync a person's lips to an audio track in a video. |
| \`generate_music\` | Create music from descriptions. Returns audio URL. |
| \`generate_speech\` | Convert text to speech. Returns audio URL. |
| \`generate_sound\` | Generate sound effects. Returns audio URL. |
| \`generate_3d\` | Create a 3D model from a text prompt or image. |
| \`transcribe_audio\` | Transcribe audio/video to text, SRT subtitles, or word-level SRT. |

### Discovery & Account
| Tool | Description |
|------|-------------|
| \`list_models\` | Browse available AI models filtered by type. |
| \`list_voices\` | List available TTS voices. |
| \`list_presets\` | List saved generation presets. |
| \`check_credits\` | Check remaining Kolbo credit balance. |
| \`get_generation_status\` | Poll status of an in-progress generation by ID. |

### Media Library
| Tool | Description |
|------|-------------|
| \`upload_media\` | Upload a local file or URL to Kolbo CDN. Returns public URL. |
| \`list_media\` | Browse your media library. |

### Visual DNA (Style Profiles)
| Tool | Description |
|------|-------------|
| \`create_visual_dna\` | Create a style/character consistency profile from reference images. |
| \`list_visual_dnas\` | List your Visual DNA profiles. |
| \`get_visual_dna\` | Get details of a specific Visual DNA profile. |
| \`delete_visual_dna\` | Delete a Visual DNA profile. |

### Moodboards
| Tool | Description |
|------|-------------|
| \`list_moodboards\` | List your moodboards. |
| \`get_moodboard\` | Get images and metadata from a moodboard. |

### Chat (Multi-model, Vision & Analysis)
| Tool | Description |
|------|-------------|
| \`chat_send_message\` | Send a message to a Kolbo chat conversation. Supports image/video analysis via vision models (e.g. gemini-2.5-pro). |
| \`chat_list_conversations\` | List your chat conversations. |
| \`chat_get_messages\` | Get messages from a specific conversation. |

## Workflow

1. **Check credits** — call \`check_credits\` before generating to confirm balance
2. **Discover models** — call \`list_models\` with a \`type\` filter to get current model identifiers. Models change frequently; never hardcode them.
3. **Generate** — call the appropriate tool. Pass the \`identifier\` from \`list_models\` as \`model\`, or omit it to let Kolbo auto-select the best model.
4. **Result** — the tool polls internally and returns the final URL when ready.

## Model Types

Use these values with \`list_models\`:

| Type | Use for |
|------|---------|
| \`image\` | Image generation |
| \`image_edit\` | Image editing |
| \`video\` | Text-to-video |
| \`video_from_image\` | Image-to-video animation |
| \`video_from_video\` | Video transformation |
| \`music\` | Music generation |
| \`speech\` | Text-to-speech |
| \`sound\` | Sound effects |
| \`3d\` | 3D model generation |

## Tips

- **Images** are fastest (~10–30s). \`enhance_prompt: true\` is on by default.
- **Video** takes longest (~1–5 min). Check \`supported_durations\` and \`supported_aspect_ratios\` from \`list_models\` before generating.
- **Music** supports \`style\`, \`instrumental\`, and \`lyrics\` parameters.
- **Speech** — call \`list_voices\` to pick a voice, then pass its \`identifier\` to \`generate_speech\`.
- **Visual DNA** — use \`create_visual_dna\` to lock in a character or style, then reference it in generation tools for consistency.
- **Video/image analysis** — use \`chat_send_message\` with a vision-capable model (e.g. \`gemini-2.5-pro\`).
- If a generation times out, use \`get_generation_status\` with the returned generation ID to retrieve the result.
- Models marked \`recommended: true\` in \`list_models\` are Kolbo's top picks for quality and speed.
- **Cost hierarchy** (cheapest → most expensive): speech ≈ sound < images < music ≈ 3D < video < lipsync.

## Examples

> "Generate an image of a neon-lit Tokyo street at night"
> "Create a 5-second video of ocean waves"
> "Make a lo-fi hip hop beat, instrumental only"
> "Convert this text to speech: Welcome to Kolbo"
> "Animate this image into a short video"
> "Transcribe this video and give me SRT subtitles"
> "What image models are available?"
> "Check my credit balance"
> "Analyze this image and describe its style"

## Troubleshooting

### "API key is invalid or expired"
This usually means the CLI is sending a key to the wrong API endpoint.

**Common cause — whitelabel overlap:** if the user previously used regular \`kolbo\` and then switched to a whitelabel CLI (e.g. \`sapir\`), the old API key may still be cached against the main Kolbo API. Running the whitelabel command (\`kolbo\`) instead of the branded one (\`sapir\`) overwrites the MCP config with the wrong endpoint.

**Fix:** tell the user to run their branded CLI's auth command, for example:
\`\`\`
sapir auth login
\`\`\`
Then **restart this editor/session** so the MCP picks up the new key.

**Important:** users must always use their branded CLI command (e.g. \`sapir\`), not \`kolbo\`, to avoid the config being overwritten with the wrong API endpoint.

### MCP tools not responding
If Kolbo tools timeout or aren't found, the MCP server may not be wired. Tell the user to run:
\`\`\`
<their-cli-command> auth login
\`\`\`
This re-wires the MCP config automatically.
`

export async function ensureKolboMcpWired(): Promise<void> {
  try {
    const auth = (await Auth.get(Partner.authProviderID)) ?? (await Auth.get(Partner.authProviderIDLegacy))
    if (!auth) return

    const apiKey = auth.type === "api" ? auth.key : auth.type === "oauth" ? auth.access : undefined
    if (!apiKey) return

    // Resolve the API base: stored metadata → partner profile (env/file) → null
    // When null, the MCP runs against its own compiled-in default (production Kolbo).
    const metadataApiBase = auth.type === "api" ? auth.metadata?.apiBase : undefined
    const apiBase = metadataApiBase || (Partner.isWhitelabel ? Partner.apiBase : null)

    const configDir = Global.Path.config
    fs.mkdirSync(configDir, { recursive: true })

    // Build MCP environment — include KOLBO_API_URL only for non-production
    const mcpEnv: Record<string, string> = { KOLBO_API_KEY: apiKey }
    if (apiBase) mcpEnv.KOLBO_API_URL = apiBase

    // Inject MCP entry — always sync key and URL
    const configFile = path.join(configDir, "kolbo.json")
    let existing: Record<string, any> = {}
    if (fs.existsSync(configFile)) {
      try { existing = JSON.parse(fs.readFileSync(configFile, "utf8")) } catch {}
    }
    // Pin @latest so npx re-resolves against the npm registry on every
    // launch instead of reusing its cache. This gives Kolbo MCP users
    // auto-updates without us running any upgrade machinery ourselves.
    // Offline? npx silently falls back to the cached version.
    const expectedCommand = ["npx", "-y", "@kolbo/mcp@latest"]
    const currentKey = existing.mcp?.kolbo?.environment?.KOLBO_API_KEY
    const currentUrl = existing.mcp?.kolbo?.environment?.KOLBO_API_URL
    const currentCommand = existing.mcp?.kolbo?.command
    const commandDrift = JSON.stringify(currentCommand) !== JSON.stringify(expectedCommand)
    const currentTimeout = existing.mcp?.kolbo?.timeout
    let needsWrite = currentKey !== apiKey || currentUrl !== mcpEnv.KOLBO_API_URL || commandDrift || currentTimeout !== 1800000
    if (needsWrite) {
      existing.mcp = {
        ...existing.mcp,
        kolbo: {
          type: "local",
          command: expectedCommand,
          environment: mcpEnv,
          timeout: 1800000,
        },
      }
    }

    // Inject default MCPs — only add entries that don't already exist
    const { DEFAULT_MCPS } = await import("./catalog.js")
    for (const [name, cfg] of Object.entries(DEFAULT_MCPS)) {
      if (!existing.mcp?.[name]) {
        existing.mcp = { ...existing.mcp, [name]: cfg }
        needsWrite = true
      }
    }

    if (needsWrite) {
      writeJsonAtomic(configFile, existing, 0o600)
    }

    // Fetch the latest skill from kolbo-docs so we can ship skill updates
    // without cutting a new CLI release. raw.githubusercontent.com has a
    // ~5min CDN cache, so updates propagate within minutes of a commit.
    // If the fetch fails (offline, GitHub down, broken commit), fall back
    // to the compiled-in KOLBO_SKILL_MD so the skill is always present.
    const skillDir = path.join(configDir, "skills", "kolbo")
    fs.mkdirSync(skillDir, { recursive: true })
    const skillDest = path.join(skillDir, "SKILL.md")

    const SKILL_URL = "https://raw.githubusercontent.com/Zoharvan12/kolbo-docs/main/skills/kolbo/SKILL.md"
    let skillContent = KOLBO_SKILL_MD
    try {
      const r = await fetch(SKILL_URL, { signal: AbortSignal.timeout(3000) })
      if (r.ok) {
        const remote = await r.text()
        if (remote.startsWith("---")) skillContent = remote
      }
    } catch {}

    let currentSkill: string | null = null
    try { currentSkill = fs.readFileSync(skillDest, "utf8") } catch {}
    if (currentSkill !== skillContent) {
      fs.writeFileSync(skillDest, skillContent)
    }
  } catch {
    // Non-fatal
  }
}
