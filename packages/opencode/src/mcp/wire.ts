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
// Single source of truth for the Kolbo skill: the canonical SKILL.md is
// inlined at build time via Bun's `with { type: "text" }` import. There is
// only ONE place to edit — packages/opencode/skills/kolbo/SKILL.md — and the
// compiled binary always carries that exact content. No separate condensed
// fallback, no drift between source and embedded copy.
// @ts-ignore — Bun text-import attribute syntax
import KOLBO_SKILL_MD_BUNDLED from "../../skills/kolbo/SKILL.md" with { type: "text" }
import { Auth } from "../auth"
import { Partner } from "../brand/partner"
import { Global } from "../global"

// Build-time integrity guard: catches a botched build where the text-import
// silently returns an empty string or has lost a canonical section. If the
// `with { type: "text" }` attribute ever regresses (toolchain change, bundler
// swap, accidental refactor), this fails loudly at module load instead of
// shipping users a binary that writes an empty SKILL.md to disk and breaks
// every MCP session afterwards. The markers are stable anchors picked from
// distinct sections of the current SKILL.md (post v0.4.0 progressive-disclosure
// restructure) — touching any one is intentional, dropping all is not.
//
// When you trim/move a section out of SKILL.md, update the marker list here
// to a still-present anchor from the same conceptual area.
const KOLBO_SKILL_MARKERS = [
  "Routing Index — Read These Files on Demand", // core: the progressive-disclosure index
  "Step 0 — Bootstrap",                          // core: auth/MCP wiring check
  "Rate Limiting & Batch Generation",            // core: still in SKILL.md
  "Runaway-Loop Guard",                          // core: still in SKILL.md
] as const
for (const marker of KOLBO_SKILL_MARKERS) {
  if (!KOLBO_SKILL_MD_BUNDLED.includes(marker)) {
    throw new Error(
      `wire.ts: bundled SKILL.md is missing required marker "${marker}" — ` +
        `the text-import may have failed or the canonical SKILL.md was over-trimmed. ` +
        `Fix packages/opencode/skills/kolbo/SKILL.md, then rebuild.`,
    )
  }
}

function writeJsonAtomic(target: string, data: unknown, mode: number) {
  const content = JSON.stringify(data, null, 2)
  const tmp = `${target}.tmp.${process.pid}.${Math.random().toString(36).slice(2, 10)}`
  fs.writeFileSync(tmp, content, { mode })
  try { fs.chmodSync(tmp, mode) } catch {}
  fs.renameSync(tmp, target)
}


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

    // Read the existing kolbo.json BEFORE building the MCP env so we can
    // reuse a previously-persisted caller-session-id (keeps it stable across
    // sidecar restarts).
    const configFile = path.join(configDir, "kolbo.json")
    let existing: Record<string, any> = {}
    if (fs.existsSync(configFile)) {
      try { existing = JSON.parse(fs.readFileSync(configFile, "utf8")) } catch {}
    }

    // Build MCP environment — include KOLBO_API_URL only for non-production
    const mcpEnv: Record<string, string> = { KOLBO_API_KEY: apiKey }
    if (apiBase) mcpEnv.KOLBO_API_URL = apiBase

    // Stable per-app-launch identifier the MCP forwards to kolbo-api as the
    // X-Kolbo-Caller-Session-Id header. kolbo-api tags every CreditUsage
    // record with it so the desktop UI's "media N" counter and the
    // `get_session_usage` MCP tool can aggregate spend without enumerating
    // individual generation_ids. Persisted in the kolbo.json so it stays
    // stable across MCP respawns within the same opencode process.
    const existingCallerSessionId = existing.mcp?.kolbo?.environment?.KOLBO_CALLER_SESSION_ID
    const callerSessionId = existingCallerSessionId || `kolbo-code:${crypto.randomUUID()}`
    mcpEnv.KOLBO_CALLER_SESSION_ID = callerSessionId
    // Run the MCP via the bundled Kolbo CLI binary instead of `npx -y @kolbo/mcp@latest`.
    // The CLI ships a `kolbo mcp serve` subcommand that hosts the same MCP server
    // inline, so users no longer need Node.js / npx on their machine and we no
    // longer fight npm registry availability, corporate proxies, or PATH issues.
    // `process.execPath` is the absolute path of the currently-running Kolbo CLI
    // executable — same binary the desktop app spawns as the sidecar, the same
    // binary a global `kolbo` install puts on PATH. Auto-updates ride along with
    // CLI updates instead of npx cache invalidation.
    const expectedCommand = [process.execPath, "mcp", "serve"]
    const currentKey = existing.mcp?.kolbo?.environment?.KOLBO_API_KEY
    const currentUrl = existing.mcp?.kolbo?.environment?.KOLBO_API_URL
    const currentCallerSession = existing.mcp?.kolbo?.environment?.KOLBO_CALLER_SESSION_ID
    const currentCommand = existing.mcp?.kolbo?.command
    const commandDrift = JSON.stringify(currentCommand) !== JSON.stringify(expectedCommand)
    const currentTimeout = existing.mcp?.kolbo?.timeout
    let needsWrite =
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

    // Single source of truth: the canonical SKILL.md is inlined into the
    // compiled binary at build time (see KOLBO_SKILL_MD_BUNDLED import at
    // the top of this file). There is exactly ONE place to edit the skill
    // — packages/opencode/skills/kolbo/SKILL.md — and the binary always
    // ships that exact content. No remote fetch (the kolbo-docs repo is
    // private, the raw URL 404s anyway), no condensed-fallback drift, no
    // bundle-path resolution gymnastics.
    //
    // We do still write the skill to BOTH ~/.config/kolbo/skills/ AND
    // ~/.kolbo/skills/ because opencode's loader scans both and the
    // first-seen copy wins. A stale ~/.kolbo/ copy from a previous CLI
    // version would otherwise silently shadow the new bundled content.
    // Keeping both locations byte-identical with the embedded canonical
    // means the agent always reads the same SKILL the binary was built
    // with — no drift possible.
    const skillContent = KOLBO_SKILL_MD_BUNDLED
    const skillDests = [
      path.join(configDir, "skills", "kolbo", "SKILL.md"),
      path.join(os.homedir(), ".kolbo", "skills", "kolbo", "SKILL.md"),
    ]
    for (const skillDest of skillDests) {
      try {
        fs.mkdirSync(path.dirname(skillDest), { recursive: true })
        let currentSkill: string | null = null
        try { currentSkill = fs.readFileSync(skillDest, "utf8") } catch {}
        if (currentSkill !== skillContent) {
          fs.writeFileSync(skillDest, skillContent)
        }
      } catch {
        // Continue to the next location even if one write fails
      }
    }
  } catch {
    // Non-fatal
  }
}
