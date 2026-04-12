import { Auth } from "../../auth"
import { cmd } from "./cmd"
import * as prompts from "@clack/prompts"
import { UI } from "../ui"
import { ModelsDev } from "../../provider/models"
import { map, pipe, sortBy, values } from "remeda"
import path from "path"
import os from "os"
import fs from "fs"
import { Config } from "../../config/config"
import { Global } from "../../global"
import { Plugin } from "../../plugin"
import { Instance } from "../../project/instance"
import type { Hooks } from "@opencode-ai/plugin"
import { Process } from "../../util/process"
import { text } from "node:stream/consumers"
import open from "open"
import { Partner } from "../../brand/partner"
import { assertPublicUrl } from "../../util/safe-url"

const KOLBO_API_BASE = Partner.apiBase

/**
 * Atomic JSON write: serialize to a sibling .tmp, set permissions on the
 * temp file BEFORE it becomes the real file, then rename. Prevents torn
 * reads and world-readable windows. Mode is a no-op on Windows but is
 * still applied for cross-platform hygiene.
 */
function writeJsonAtomic(target: string, data: unknown, mode: number) {
  const content = JSON.stringify(data, null, 2)
  const tmp = `${target}.tmp.${process.pid}.${Math.random().toString(36).slice(2, 10)}`
  fs.writeFileSync(tmp, content, { mode })
  try { fs.chmodSync(tmp, mode) } catch {}
  fs.renameSync(tmp, target)
}

const KOLBO_SKILL_MD = `---
name: kolbo
description: Generate images, videos, music, speech, and sound effects using Kolbo AI. Use when asked to create any visual, audio, or video content — or to list available AI models or check credit balance.
---

# Kolbo AI — Creative Generation

You have access to the Kolbo AI platform via MCP tools. Use them to generate images, videos, music, speech, and sound effects directly from conversation.

## Available Tools

| Tool | Description |
|------|-------------|
| \`generate_image\` | Create images from text prompts. Returns image URL(s). |
| \`generate_video\` | Create videos from text. Returns video URL. |
| \`generate_video_from_image\` | Animate a static image into video. Returns video URL. |
| \`generate_music\` | Create music from descriptions. Returns audio URL. |
| \`generate_speech\` | Convert text to speech. Returns audio URL. |
| \`generate_sound\` | Generate sound effects. Returns audio URL. |
| \`list_models\` | Browse available AI models filtered by type. |
| \`check_credits\` | Check remaining Kolbo credit balance. |
| \`get_generation_status\` | Poll status of an in-progress generation by ID. |

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
| \`video\` | Text-to-video |
| \`video_from_image\` | Image-to-video animation |
| \`music\` | Music generation |
| \`speech\` | Text-to-speech |
| \`sound\` | Sound effects |

## Tips

- **Images** are fastest (~10–30s). \`enhance_prompt: true\` is on by default.
- **Video** takes longest (~1–5 min). Check \`supported_durations\` and \`supported_aspect_ratios\` from \`list_models\` before generating.
- **Music** supports \`style\`, \`instrumental\`, and \`lyrics\` parameters.
- **Speech** — pass a voice \`identifier\` from \`list_models\` for a consistent voice.
- If a video generation times out, use \`get_generation_status\` with the returned generation ID to retrieve the result.
- Models marked \`recommended: true\` in \`list_models\` are Kolbo's top picks for quality and speed.

## Examples

> "Generate an image of a neon-lit Tokyo street at night"
> "Create a 5-second video of ocean waves"
> "Make a lo-fi hip hop beat, instrumental only"
> "Convert this text to speech: Welcome to Kolbo"
> "Animate this image into a short video"
> "What image models are available?"
> "Check my credit balance"

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
    const auth = await Auth.get("kolbo")
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
    const { DEFAULT_MCPS } = await import("../../mcp/catalog.js")
    for (const [name, cfg] of Object.entries(DEFAULT_MCPS)) {
      if (!existing.mcp?.[name]) {
        existing.mcp = { ...existing.mcp, [name]: cfg }
        needsWrite = true
      }
    }

    if (needsWrite) {
      // Atomic write pattern: tmp file → chmod → rename. Keeps readers
      // from seeing a half-written kolbo.json (JSON parse errors) and
      // closes the window where the file is briefly world-readable
      // between writeFileSync and chmodSync.
      // 0o600 is a no-op on Windows; OS-keystore migration is tracked
      // separately.
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
        // Sanity check: the real skill file starts with YAML frontmatter.
        // Guards against a GitHub error page being written as SKILL.md.
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

async function kolboDeviceLogin(): Promise<string | null> {
  // 1. Request a device code from kolbo-api
  let init: { device_code: string; user_code: string; verification_uri: string; interval?: number; expires_in?: number }
  try {
    // redirect:"error" — the device-code endpoint must never redirect.
    // A 302 here could steer the token exchange to an attacker-controlled
    // host after the https+allowlist check has already passed.
    const r = await fetch(`${KOLBO_API_BASE}/auth/kolbo-code/device/code`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
      redirect: "error",
    })
    if (!r.ok) {
      prompts.log.error(`Failed to start device login (${r.status})`)
      return null
    }
    init = (await r.json()) as any
  } catch {
    // Don't echo raw error — may contain server response bodies / paths.
    prompts.log.error(`Could not reach ${KOLBO_API_BASE}. Check your network and try again.`)
    return null
  }

  const { device_code, user_code, verification_uri } = init
  const interval = Math.max(1, init.interval ?? 5) * 1000
  const expiresAt = Date.now() + (init.expires_in ?? 900) * 1000

  prompts.log.info(
    `Open ${verification_uri} in your browser and enter the code:\n\n    ${user_code}\n`,
  )
  open(verification_uri).catch(() => {})

  const spinner = prompts.spinner()
  spinner.start("Waiting for approval in your browser...")
  try {
    while (Date.now() < expiresAt) {
      await new Promise((r) => setTimeout(r, interval))
      let r: Response
      try {
        r = await fetch(
          `${KOLBO_API_BASE}/auth/kolbo-code/device/token?code=${encodeURIComponent(device_code)}`,
          { redirect: "error" },
        )
      } catch {
        continue
      }
      if (r.status === 202) continue
      if (r.status === 400) {
        const body = (await r.json().catch(() => ({}))) as any
        if (body?.error === "expired") {
          // Generic message — we don't want to leak device-code lifecycle
          // details that would help an attacker enumerate valid codes.
          spinner.stop("Login failed, please try again")
          return null
        }
        continue
      }
      if (!r.ok) continue
      const data = (await r.json()) as any
      if (data?.status === "approved" && data?.api_key) {
        spinner.stop("Approved")
        return data.api_key
      }
    }
    spinner.stop("Timed out waiting for approval")
    return null
  } catch {
    // Don't echo raw error to user.
    spinner.stop("Login failed")
    return null
  }
}

type PluginAuth = NonNullable<Hooks["auth"]>

async function handlePluginAuth(plugin: { auth: PluginAuth }, provider: string, methodName?: string): Promise<boolean> {
  let index = 0
  if (methodName) {
    const match = plugin.auth.methods.findIndex((x) => x.label.toLowerCase() === methodName.toLowerCase())
    if (match === -1) {
      prompts.log.error(
        `Unknown method "${methodName}" for ${provider}. Available: ${plugin.auth.methods.map((x) => x.label).join(", ")}`,
      )
      process.exit(1)
    }
    index = match
  } else if (plugin.auth.methods.length > 1) {
    const method = await prompts.select({
      message: "Login method",
      options: [
        ...plugin.auth.methods.map((x, index) => ({
          label: x.label,
          value: index.toString(),
        })),
      ],
    })
    if (prompts.isCancel(method)) throw new UI.CancelledError()
    index = parseInt(method)
  }
  const method = plugin.auth.methods[index]

  await new Promise((r) => setTimeout(r, 10))
  const inputs: Record<string, string> = {}
  if (method.prompts) {
    for (const prompt of method.prompts) {
      if (prompt.when) {
        const value = inputs[prompt.when.key]
        if (value === undefined) continue
        const matches = prompt.when.op === "eq" ? value === prompt.when.value : value !== prompt.when.value
        if (!matches) continue
      }
      if (prompt.condition && !prompt.condition(inputs)) continue
      if (prompt.type === "select") {
        const value = await prompts.select({
          message: prompt.message,
          options: prompt.options,
        })
        if (prompts.isCancel(value)) throw new UI.CancelledError()
        inputs[prompt.key] = value
      } else {
        const value = await prompts.text({
          message: prompt.message,
          placeholder: prompt.placeholder,
          validate: prompt.validate ? (v) => prompt.validate!(v ?? "") : undefined,
        })
        if (prompts.isCancel(value)) throw new UI.CancelledError()
        inputs[prompt.key] = value
      }
    }
  }

  if (method.type === "oauth") {
    const authorize = await method.authorize(inputs)

    if (authorize.url) {
      prompts.log.info("Go to: " + authorize.url)
    }

    if (authorize.method === "auto") {
      if (authorize.instructions) {
        prompts.log.info(authorize.instructions)
      }
      const spinner = prompts.spinner()
      spinner.start("Waiting for authorization...")
      const result = await authorize.callback()
      if (result.type === "failed") {
        spinner.stop("Failed to authorize", 1)
      }
      if (result.type === "success") {
        const saveProvider = result.provider ?? provider
        if ("refresh" in result) {
          const { type: _, provider: __, refresh, access, expires, ...extraFields } = result
          await Auth.set(saveProvider, {
            type: "oauth",
            refresh,
            access,
            expires,
            ...extraFields,
          })
        }
        if ("key" in result) {
          await Auth.set(saveProvider, {
            type: "api",
            key: result.key,
          })
        }
        spinner.stop("Login successful")
      }
    }

    if (authorize.method === "code") {
      const code = await prompts.text({
        message: "Paste the authorization code here: ",
        validate: (x) => (x && x.length > 0 ? undefined : "Required"),
      })
      if (prompts.isCancel(code)) throw new UI.CancelledError()
      const result = await authorize.callback(code)
      if (result.type === "failed") {
        prompts.log.error("Failed to authorize")
      }
      if (result.type === "success") {
        const saveProvider = result.provider ?? provider
        if ("refresh" in result) {
          const { type: _, provider: __, refresh, access, expires, ...extraFields } = result
          await Auth.set(saveProvider, {
            type: "oauth",
            refresh,
            access,
            expires,
            ...extraFields,
          })
        }
        if ("key" in result) {
          await Auth.set(saveProvider, {
            type: "api",
            key: result.key,
          })
        }
        prompts.log.success("Login successful")
      }
    }

    prompts.outro("Done")
    return true
  }

  if (method.type === "api") {
    if (method.authorize) {
      const result = await method.authorize(inputs)
      if (result.type === "failed") {
        prompts.log.error("Failed to authorize")
      }
      if (result.type === "success") {
        const saveProvider = result.provider ?? provider
        await Auth.set(saveProvider, {
          type: "api",
          key: result.key,
        })
        prompts.log.success("Login successful")
      }
      prompts.outro("Done")
      return true
    }
  }

  return false
}

export function resolvePluginProviders(input: {
  hooks: Hooks[]
  existingProviders: Record<string, unknown>
  disabled: Set<string>
  enabled?: Set<string>
  providerNames: Record<string, string | undefined>
}): Array<{ id: string; name: string }> {
  const seen = new Set<string>()
  const result: Array<{ id: string; name: string }> = []

  for (const hook of input.hooks) {
    if (!hook.auth) continue
    const id = hook.auth.provider
    if (seen.has(id)) continue
    seen.add(id)
    if (Object.hasOwn(input.existingProviders, id)) continue
    if (input.disabled.has(id)) continue
    if (input.enabled && !input.enabled.has(id)) continue
    result.push({
      id,
      name: input.providerNames[id] ?? id,
    })
  }

  return result
}

export const ProvidersCommand = cmd({
  command: "providers",
  aliases: ["auth"],
  describe: "manage AI providers and credentials",
  builder: (yargs) =>
    yargs.command(ProvidersListCommand).command(ProvidersLoginCommand).command(ProvidersLogoutCommand).demandCommand(),
  async handler() {},
})

export const ProvidersListCommand = cmd({
  command: "list",
  aliases: ["ls"],
  describe: "list providers and credentials",
  async handler(_args) {
    UI.empty()
    const authPath = path.join(Global.Path.data, "auth.json")
    const homedir = os.homedir()
    const displayPath = authPath.startsWith(homedir) ? authPath.replace(homedir, "~") : authPath
    prompts.intro(`Credentials ${UI.Style.TEXT_DIM}${displayPath}`)
    const results = Object.entries(await Auth.all())
    const database = await ModelsDev.get()

    for (const [providerID, result] of results) {
      const name = database[providerID]?.name || providerID
      prompts.log.info(`${name} ${UI.Style.TEXT_DIM}${result.type}`)
    }

    prompts.outro(`${results.length} credentials`)

    const activeEnvVars: Array<{ provider: string; envVar: string }> = []

    for (const [providerID, provider] of Object.entries(database)) {
      for (const envVar of provider.env) {
        if (process.env[envVar]) {
          activeEnvVars.push({
            provider: provider.name || providerID,
            envVar,
          })
        }
      }
    }

    if (activeEnvVars.length > 0) {
      UI.empty()
      prompts.intro("Environment")

      for (const { provider, envVar } of activeEnvVars) {
        prompts.log.info(`${provider} ${UI.Style.TEXT_DIM}${envVar}`)
      }

      prompts.outro(`${activeEnvVars.length} environment variable` + (activeEnvVars.length === 1 ? "" : "s"))
    }
  },
})

export const ProvidersLoginCommand = cmd({
  command: "login [url]",
  describe: "log in to a provider",
  builder: (yargs) =>
    yargs
      .positional("url", {
        describe: "kolbo auth provider",
        type: "string",
      })
      .option("provider", {
        alias: ["p"],
        describe: "provider id or name to log in to (skips provider selection)",
        type: "string",
      })
      .option("method", {
        alias: ["m"],
        describe: "login method label (skips method selection)",
        type: "string",
      }),
  async handler(args) {
    await Instance.provide({
      directory: process.cwd(),
      async fn() {
        UI.empty()
        prompts.intro("Add credential")
        if (args.url) {
          const url = args.url.replace(/\/+$/, "")
          // .well-known/kolbo auth hands us an arbitrary command array and
          // we spawn it — the authoritative-looking filename makes this
          // more dangerous than it looks. Lock it down:
          //   1. URL must be https and public (no file://, no RFC1918)
          //   2. Command array must be shaped correctly and contain no
          //      obvious shell-metacharacters in argv[0]
          //   3. User must explicitly confirm the exact command before
          //      we spawn it, no matter how trusted the origin looks.
          let parsedUrl: URL
          try {
            parsedUrl = new URL(url)
          } catch {
            prompts.log.error(`Invalid URL: ${url}`)
            prompts.outro("Done")
            return
          }
          if (parsedUrl.protocol !== "https:") {
            prompts.log.error(`Refusing non-HTTPS well-known URL: ${url}`)
            prompts.outro("Done")
            return
          }
          try {
            await assertPublicUrl(url)
          } catch (e: any) {
            prompts.log.error(e?.message ?? "Refusing to fetch from internal address")
            prompts.outro("Done")
            return
          }
          let wellknown: any
          try {
            // redirect:"error" closes the assertPublicUrl bypass — a
            // trusted-looking server could otherwise 302 us into
            // http://169.254.169.254/ (cloud metadata) and we'd happily
            // follow. A legitimate /.well-known/kolbo never needs to
            // redirect.
            const r = await fetch(`${url}/.well-known/kolbo`, { redirect: "error" })
            wellknown = await r.json()
          } catch {
            prompts.log.error(`Could not fetch ${url}/.well-known/kolbo`)
            prompts.outro("Done")
            return
          }
          if (
            !wellknown?.auth?.command ||
            !Array.isArray(wellknown.auth.command) ||
            wellknown.auth.command.length === 0 ||
            wellknown.auth.command.some((x: unknown) => typeof x !== "string")
          ) {
            prompts.log.error("Invalid .well-known/kolbo response (missing or malformed auth.command)")
            prompts.outro("Done")
            return
          }
          const cmdArr: string[] = wellknown.auth.command
          // Reject shell-metacharacters in argv[0]. Spawn is not a shell,
          // but an attacker could still trick users into running something
          // that looks innocuous at a glance.
          if (/[;&|`$<>\n\r]/.test(cmdArr[0])) {
            prompts.log.error("Refusing command with shell metacharacters")
            prompts.outro("Done")
            return
          }
          const displayCmd = cmdArr
            .map((x) => (/[\s"'$`]/.test(x) ? JSON.stringify(x) : x))
            .join(" ")
          prompts.log.warn(
            `About to run a command from ${url}/.well-known/kolbo:\n\n    ${displayCmd}\n\n` +
              `This command will run with your full user privileges. Only approve if you trust this server.`,
          )
          const confirm = await prompts.confirm({
            message: `Run this command?`,
            initialValue: false,
          })
          if (prompts.isCancel(confirm) || !confirm) {
            prompts.log.info("Cancelled")
            prompts.outro("Done")
            return
          }
          prompts.log.info(`Running \`${displayCmd}\``)
          const proc = Process.spawn(cmdArr, {
            stdout: "pipe",
          })
          if (!proc.stdout) {
            prompts.log.error("Failed")
            prompts.outro("Done")
            return
          }
          const [exit, token] = await Promise.all([proc.exited, text(proc.stdout)])
          if (exit !== 0) {
            prompts.log.error("Failed")
            prompts.outro("Done")
            return
          }
          await Auth.set(url, {
            type: "wellknown",
            key: wellknown.auth.env,
            token: token.trim(),
          })
          prompts.log.success("Logged into " + url)
          prompts.outro("Done")
          return
        }
        // Kolbo builds (main + whitelabel) skip provider selection — go straight to Kolbo login
        if (!args.provider) {
          const key = await kolboDeviceLogin()
          if (!key) {
            prompts.log.error("Login failed")
            prompts.outro("Done")
            return
          }
          const metadata: Record<string, string> = {}
          if (Partner.isWhitelabel) metadata.apiBase = KOLBO_API_BASE
          await Auth.set("kolbo", { type: "api", key, metadata })
          prompts.log.success(`Logged into ${Partner.name}`)
          await ensureKolboMcpWired()
          prompts.outro("Done")
          return
        }

        await ModelsDev.refresh(true).catch(() => {})

        const config = await Config.get()

        const disabled = new Set(config.disabled_providers ?? [])
        const enabled = config.enabled_providers ? new Set(config.enabled_providers) : undefined

        const providers = await ModelsDev.get().then((x) => {
          const filtered: Record<string, (typeof x)[string]> = {}
          for (const [key, value] of Object.entries(x)) {
            if ((enabled ? enabled.has(key) : true) && !disabled.has(key)) {
              filtered[key] = value
            }
          }
          return filtered
        })

        const priority: Record<string, number> = {
          kolbo: 0,
          openai: 1,
          "github-copilot": 2,
          google: 3,
          anthropic: 4,
          openrouter: 5,
          vercel: 6,
        }
        const pluginProviders = resolvePluginProviders({
          hooks: await Plugin.list(),
          existingProviders: providers,
          disabled,
          enabled,
          providerNames: Object.fromEntries(Object.entries(config.provider ?? {}).map(([id, p]) => [id, p.name])),
        })
        const options = [
          ...pipe(
            providers,
            values(),
            sortBy(
              (x) => priority[x.id] ?? 99,
              (x) => x.name ?? x.id,
            ),
            map((x) => ({
              label: x.name,
              value: x.id,
              hint: {
                kolbo: "recommended — pay with your Kolbo.AI credits",
                openai: "ChatGPT Plus/Pro or API key",
              }[x.id],
            })),
          ),
          ...pluginProviders.map((x) => ({
            label: x.name,
            value: x.id,
            hint: "plugin",
          })),
        ]

        let provider: string
        if (args.provider) {
          const input = args.provider
          const byID = options.find((x) => x.value === input)
          const byName = options.find((x) => x.label.toLowerCase() === input.toLowerCase())
          const match = byID ?? byName
          if (!match) {
            prompts.log.error(`Unknown provider "${input}"`)
            process.exit(1)
          }
          provider = match.value
        } else {
          const selected = await prompts.autocomplete({
            message: "Select provider",
            maxItems: 8,
            options: [
              ...options,
              {
                value: "other",
                label: "Other",
              },
            ],
          })
          if (prompts.isCancel(selected)) throw new UI.CancelledError()
          provider = selected as string
        }

        const plugin = await Plugin.list().then((x) => x.findLast((x) => x.auth?.provider === provider))
        if (plugin && plugin.auth) {
          const handled = await handlePluginAuth({ auth: plugin.auth }, provider, args.method)
          if (handled) return
        }

        if (provider === "other") {
          const custom = await prompts.text({
            message: "Enter provider id",
            validate: (x) => (x && x.match(/^[0-9a-z-]+$/) ? undefined : "a-z, 0-9 and hyphens only"),
          })
          if (prompts.isCancel(custom)) throw new UI.CancelledError()
          provider = custom.replace(/^@ai-sdk\//, "")

          const customPlugin = await Plugin.list().then((x) => x.findLast((x) => x.auth?.provider === provider))
          if (customPlugin && customPlugin.auth) {
            const handled = await handlePluginAuth({ auth: customPlugin.auth }, provider, args.method)
            if (handled) return
          }

          prompts.log.warn(
            `This only stores a credential for ${provider} - you will need configure it in kolbo.json, check the docs for examples.`,
          )
        }

        if (provider === "amazon-bedrock") {
          prompts.log.info(
            "Amazon Bedrock authentication priority:\n" +
              "  1. Bearer token (AWS_BEARER_TOKEN_BEDROCK or /connect)\n" +
              "  2. AWS credential chain (profile, access keys, IAM roles, EKS IRSA)\n\n" +
              "Configure via kolbo.json options (profile, region, endpoint) or\n" +
              "AWS environment variables (AWS_PROFILE, AWS_REGION, AWS_ACCESS_KEY_ID, AWS_WEB_IDENTITY_TOKEN_FILE).",
          )
        }

        if (provider === "kolbo") {
          const key = await kolboDeviceLogin()
          if (!key) {
            prompts.log.error("Login failed")
            prompts.outro("Done")
            return
          }
          const metadata: Record<string, string> = {}
          if (Partner.isWhitelabel) metadata.apiBase = KOLBO_API_BASE
          await Auth.set("kolbo", { type: "api", key, metadata })
          prompts.log.success(`Logged into ${Partner.name}`)

          // Auto-inject Kolbo MCP + skill into global config (idempotent)
          try {
            const configDir = Global.Path.config
            fs.mkdirSync(configDir, { recursive: true })

            // 1. Write MCP entry to kolbo.json
            const configFile = path.join(configDir, "kolbo.json")
            let existing: Record<string, any> = {}
            if (fs.existsSync(configFile)) {
              try { existing = JSON.parse(fs.readFileSync(configFile, "utf8")) } catch {}
            }
            const mcpEnv: Record<string, string> = { KOLBO_API_KEY: key }
            if (Partner.isWhitelabel) mcpEnv.KOLBO_API_URL = Partner.apiBase
            if (existing.mcp?.kolbo?.environment?.KOLBO_API_KEY !== key) {
              existing.mcp = {
                ...existing.mcp,
                kolbo: {
                  type: "local",
                  command: ["npx", "-y", "@kolbo/mcp"],
                  environment: mcpEnv,
                  timeout: 1800000,
                },
              }
              // Atomic write — file contains the Kolbo API key.
              writeJsonAtomic(configFile, existing, 0o600)
            }

            // 2. Write the Kolbo skill file so the agent knows how to use the MCP tools
            const skillDir = path.join(configDir, "skills", "kolbo")
            fs.mkdirSync(skillDir, { recursive: true })
            const skillDest = path.join(skillDir, "SKILL.md")
            if (!fs.existsSync(skillDest)) {
              fs.writeFileSync(skillDest, KOLBO_SKILL_MD)
            }

            prompts.log.info("Kolbo MCP tools connected — image, video, music and more are now available as tools")
          } catch {
            // Non-fatal: MCP wiring is a nice-to-have, don't block login
          }

          prompts.outro("Done")
          return
        }

        if (provider === "vercel") {
          prompts.log.info("You can create an api key at https://vercel.link/ai-gateway-token")
        }

        if (["cloudflare", "cloudflare-ai-gateway"].includes(provider)) {
          prompts.log.info(
            "Cloudflare AI Gateway can be configured with CLOUDFLARE_GATEWAY_ID, CLOUDFLARE_ACCOUNT_ID, and CLOUDFLARE_API_TOKEN environment variables. Read more: https://docs.kolbo.ai/providers/#cloudflare-ai-gateway",
          )
        }

        const key = await prompts.password({
          message: "Enter your API key",
          validate: (x) => (x && x.length > 0 ? undefined : "Required"),
        })
        if (prompts.isCancel(key)) throw new UI.CancelledError()
        await Auth.set(provider, {
          type: "api",
          key,
        })

        prompts.outro("Done")
      },
    })
  },
})

export const ProvidersLogoutCommand = cmd({
  command: "logout",
  describe: "log out from a configured provider",
  async handler(_args) {
    UI.empty()
    const credentials = await Auth.all().then((x) => Object.entries(x))
    prompts.intro("Remove credential")
    if (credentials.length === 0) {
      prompts.log.error("No credentials found")
      return
    }
    const database = await ModelsDev.get()
    const providerID = await prompts.select({
      message: "Select provider",
      options: credentials.map(([key, value]) => ({
        label: (database[key]?.name || key) + UI.Style.TEXT_DIM + " (" + value.type + ")",
        value: key,
      })),
    })
    if (prompts.isCancel(providerID)) throw new UI.CancelledError()
    await Auth.remove(providerID)
    prompts.outro("Logout successful")
  },
})
