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
import crypto from "crypto"
import fs from "fs"
import os from "os"
import path from "path"
// @ts-ignore — Bun text-import attribute syntax
import KOLBO_MCP_RUNNER from "./runner.ts" with { type: "text" }
import { syncKolboSkillTree } from "./skill-tree"
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


/**
 * @returns `keyChanged` — whether the KOLBO_API_KEY written to kolbo.json
 * differs from what was there before. Callers use this to decide whether a
 * running MCP child is now holding a stale credential: the key is injected as
 * a spawn-time env var, so rewriting the file alone does NOT reach a process
 * that is already running. See healKolboMcpAuth below.
 */
export async function ensureKolboMcpWired(): Promise<{ keyChanged: boolean }> {
  let keyChanged = false
  try {
    const auth = (await Auth.get(Partner.authProviderID)) ?? (await Auth.get(Partner.authProviderIDLegacy))
    if (!auth) return { keyChanged }

    const apiKey = auth.type === "api" ? auth.key : auth.type === "oauth" ? auth.access : undefined
    if (!apiKey) return { keyChanged }

    // Resolve the API base: stored metadata → partner profile (env/file) → null
    // When null, the MCP runs against its own compiled-in default (production Kolbo).
    const metadataApiBase = auth.type === "api" ? auth.metadata?.apiBase : undefined
    const apiBase = metadataApiBase || (Partner.isWhitelabel ? Partner.apiBase : null)

    const configDir = Global.Path.config
    fs.mkdirSync(configDir, { recursive: true })

    // Read the existing kolbo.json BEFORE building the MCP env so we can
    // reuse a previously-persisted caller-session-id (keeps it stable across
    // sidecar restarts).
    const configFile = path.join(configDir, "kolbo.json")
    let existing: Record<string, any> = {}
    if (fs.existsSync(configFile)) {
      try { existing = JSON.parse(fs.readFileSync(configFile, "utf8")) } catch {}
    }

    // Stable per-app-launch identifier the MCP forwards to kolbo-api as the
    // X-Kolbo-Caller-Session-Id header. kolbo-api tags every CreditUsage
    // record with it so the desktop UI's "media N" counter and the
    // `get_session_usage` MCP tool can aggregate spend without enumerating
    // individual generation_ids. Persisted in the kolbo.json so it stays
    // stable across MCP respawns within the same opencode process.
    // Build MCP environment — include KOLBO_API_URL only for non-production
    const mcpEnv: Record<string, string> = { KOLBO_API_KEY: apiKey }
    if (apiBase) mcpEnv.KOLBO_API_URL = apiBase

    const existingCallerSessionId = existing.mcp?.kolbo?.environment?.KOLBO_CALLER_SESSION_ID
    const callerSessionId = existingCallerSessionId || `kolbo-code:${crypto.randomUUID()}`
    mcpEnv.KOLBO_CALLER_SESSION_ID = callerSessionId

    // The compiled Kolbo executable doubles as a Bun runtime. Write a tiny
    // runner beside the config; every MCP start reads Kolbo's approved MCP
    // version, installs that exact package into a versioned cache, and runs it.
    // This gives users new tools on their next app launch without requiring a
    // Kolbo Code release, while retaining the bundled MCP as an offline fallback.
    const dir = path.join(configDir, "mcp")
    const runner = path.join(dir, "runner.ts")
    fs.mkdirSync(dir, { recursive: true })
    if (!fs.existsSync(runner) || fs.readFileSync(runner, "utf8") !== KOLBO_MCP_RUNNER) {
      const tmp = `${runner}.tmp.${process.pid}.${Math.random().toString(36).slice(2, 10)}`
      fs.writeFileSync(tmp, KOLBO_MCP_RUNNER, { mode: 0o600 })
      try { fs.chmodSync(tmp, 0o600) } catch {}
      fs.renameSync(tmp, runner)
    }

    const expectedCommand = [process.execPath, runner]
    const currentKey = existing.mcp?.kolbo?.environment?.KOLBO_API_KEY
    const currentUrl = existing.mcp?.kolbo?.environment?.KOLBO_API_URL
    const currentCallerSession = existing.mcp?.kolbo?.environment?.KOLBO_CALLER_SESSION_ID
    const currentCommand = existing.mcp?.kolbo?.command
    const commandDrift = JSON.stringify(currentCommand) !== JSON.stringify(expectedCommand)
    const currentTimeout = existing.mcp?.kolbo?.timeout
    // Only meaningful when a key was already on file: the very first wiring
    // (undefined → key) is a fresh install, not a rotation, and there is no
    // running child holding a stale value to heal.
    keyChanged = Boolean(currentKey) && currentKey !== apiKey
    let needsWrite =
      existing.mcp?.kolbo?.type !== "local" ||
      currentKey !== apiKey ||
      currentUrl !== mcpEnv.KOLBO_API_URL ||
      currentCallerSession !== callerSessionId ||
      commandDrift ||
      currentTimeout !== 1800000
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

    // Install the complete progressive-disclosure tree. A config-level
    // SKILL.md shadows the built-in copy, so writing only that entry file makes
    // every references/ route point at a file that does not exist.
    syncKolboSkillTree([
      path.join(configDir, "skills", "kolbo"),
      path.join(os.homedir(), ".kolbo", "skills", "kolbo"),
    ])
  } catch {
    // Non-fatal
  }
  return { keyChanged }
}

/**
 * Self-heal a Kolbo MCP auth failure without bothering the user.
 *
 * THE FAILURE THIS FIXES: the Kolbo MCP is a *local* server, spawned once with
 * KOLBO_API_KEY baked into its process environment. Inference, by contrast,
 * reads the key live from auth.json on every request. So when the key rotates
 * — a second machine signing in, a re-auth, a re-mint — inference keeps working
 * while the already-running MCP child keeps the snapshot it was born with and
 * 401s forever. The user is fully logged in; only one child process disagrees.
 *
 * Until now the ONLY thing that fixed this was the reconnect dialog, and not
 * because it re-authenticated anything: its `dispose()` tore down MCP state, so
 * the next request re-spawned the child from the updated file. Users were being
 * asked to "reconnect" an account that was never disconnected.
 *
 * `connect()` re-reads the config from disk, so disconnect+connect is enough to
 * hand the child the current key.
 *
 * @returns true if the key had rotated and the client was restarted — the
 * caller should simply retry. False means the stored key is what the child is
 * already using, i.e. the credential itself is genuinely dead and only a real
 * re-auth will help.
 */
export async function healKolboMcpAuth(): Promise<boolean> {
  const { keyChanged } = await ensureKolboMcpWired().catch(() => ({ keyChanged: false }))
  if (!keyChanged) return false
  // Imported lazily: mcp/index.ts pulls in the whole Effect service graph, and
  // wire.ts is imported from server startup paths that must stay cheap.
  const { MCP } = await import("./index.js")
  await MCP.disconnect("kolbo").catch(() => {})
  await MCP.connect("kolbo").catch(() => {})
  return true
}
