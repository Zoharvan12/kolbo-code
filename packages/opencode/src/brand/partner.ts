import fs from "fs"
import path from "path"
import os from "os"
import { xdgConfig } from "xdg-basedir"

/**
 * Partner profile — runtime whitelabel configuration.
 *
 * A single Kolbo CLI binary can serve any number of whitelabel deployments
 * ("partners") by pointing at a different kolbo-api host. Every partner
 * backend exposes the same routes, so the CLI only needs to know which host
 * to talk to and what to call itself in the UI.
 *
 * Resolution order (first match wins):
 *   1. KOLBO_PARTNER_PROFILE=/path/to/partner.json      (explicit file)
 *   2. $XDG_CONFIG_HOME/kolbo/partner.json              (installed by partner's install.sh)
 *   3. KOLBO_API_BASE env var alone                     (implicit profile — derive from host)
 *   4. Built-in Kolbo defaults                          (no partner — normal kolbo.ai)
 *
 * The loader runs once at module load (sync, no Effect, no async) because
 * flag.ts / provider.ts / plugin/kolbo.ts all need these values at import time.
 */
export namespace Partner {
  export interface Profile {
    /** Short lowercase id, e.g. "kolbo" or "sapir". Used in logs and metadata. */
    id: string
    /** Human-visible product name, e.g. "Kolbo" or "Sapir Code". */
    name: string
    /** Bare host for links and messages, e.g. "kolbo.ai" or "sapir.kolbo.ai". */
    domain: string
    /** Base URL of the backend API, e.g. "https://api.kolbo.ai/api". */
    apiBase: string
    /** Base URL of the customer-facing web app, e.g. "https://app.kolbo.ai". */
    appBase: string
    /** Docs URL opened by the TUI help binding. */
    docsUrl: string
    /** URL the upsell dialog opens. */
    upsellUrl: string
    /** Human-readable upsell message shown when credits are exhausted. */
    upsellMessage: string
    /** URL the /share command produces links against (usually same as domain root). */
    shareBase: string
    /** Optional ASCII-art logo lines for the TUI home screen. Falls back to default Kolbo logo when absent. */
    logo?: string[]
  }

  const KOLBO_DEFAULTS: Profile = {
    id: "kolbo",
    name: "Kolbo",
    domain: "kolbo.ai",
    apiBase: "https://api.kolbo.ai/api",
    appBase: "https://app.kolbo.ai",
    docsUrl: "https://docs.kolbo.ai",
    upsellUrl: "https://app.kolbo.ai/pricing",
    upsellMessage: "Free usage exceeded, upgrade at https://app.kolbo.ai/pricing",
    shareBase: "https://kolbo.ai",
  }

  function readJsonSync(file: string): Partial<Profile> | null {
    try {
      const raw = fs.readFileSync(file, "utf8")
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === "object") return parsed as Partial<Profile>
    } catch {}
    return null
  }

  function parseUrl(url: string): URL | null {
    try {
      return new URL(url)
    } catch {
      return null
    }
  }

  /**
   * Reject URLs that could redirect the CLI to an attacker-controlled
   * backend. `http://` is allowed only for localhost so local dev still
   * works; everything else must be https.
   *
   * This is the first line of defense against `KOLBO_API_BASE=http://evil`
   * credential-theft attacks. A compromised env var (shell RC, dotfile,
   * malware) used to be enough to exfiltrate the user's API key on next
   * login — now it's rejected at load time.
   */
  function assertSafeBase(source: string, urlString: string): void {
    let url: URL
    try {
      url = new URL(urlString)
    } catch {
      throw new Error(`[kolbo] ${source} is not a valid URL: ${urlString}`)
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      throw new Error(`[kolbo] ${source} must use https:// (got ${url.protocol})`)
    }
    if (url.protocol === "http:") {
      const host = url.hostname.toLowerCase()
      const isLocal =
        host === "localhost" ||
        host === "127.0.0.1" ||
        host === "::1" ||
        host === "0.0.0.0" ||
        host.endsWith(".localhost")
      if (!isLocal) {
        throw new Error(
          `[kolbo] ${source} must use https:// for non-local hosts (refusing ${urlString}).\n` +
            `If you really need to point the CLI at a non-HTTPS backend, run it on localhost.`,
        )
      }
    }
  }

  function stripPort(host: string): string {
    return host.replace(/:\d+$/, "")
  }

  /**
   * Derive a partial profile from the API base (and optionally the app base).
   *
   * id / name / domain describe the *product* the user sees, so they always
   * derive from the APP host when one is given — this is what makes
   * `staging.kolbo.ai` + `stagingapi.kolbo.ai` come out as id="staging"
   * instead of id="stagingapi". When only an apiBase is given (e.g. simple
   * sapir.kolbo.ai/api setups), we fall back to deriving everything from it.
   *
   * Scheme is preserved from the source URL so http://localhost works.
   */
  function derive(apiBase: string, appBaseOverride?: string): Partial<Profile> {
    const apiUrl = parseUrl(apiBase)
    if (!apiUrl) return { apiBase }
    const appUrl = (appBaseOverride && parseUrl(appBaseOverride)) || apiUrl
    // The "branding host" is the user-facing app host. When app and api are
    // on different subdomains, this is what id/name/domain are derived from.
    const brandHostname = stripPort(appUrl.host)
    const firstLabel = brandHostname.split(".")[0] || "partner"
    const appOrigin = `${appUrl.protocol}//${appUrl.host}`
    return {
      id: firstLabel,
      name: firstLabel.charAt(0).toUpperCase() + firstLabel.slice(1),
      domain: brandHostname,
      apiBase,
      appBase: appOrigin,
      docsUrl: `${appOrigin}/docs`,
      upsellUrl: `${appOrigin}/pricing`,
      upsellMessage: `Free usage exceeded, subscribe at ${appOrigin}/pricing`,
      shareBase: appOrigin,
    }
  }

  function candidateProfileFiles(): string[] {
    const files: string[] = []
    const explicit = process.env["KOLBO_PARTNER_PROFILE"]
    if (explicit) files.push(explicit)
    const xdg = xdgConfig
    if (xdg) files.push(path.join(xdg, "kolbo", "partner.json"))
    // Fallback for environments where xdg-basedir couldn't resolve (rare)
    files.push(path.join(os.homedir(), ".config", "kolbo", "partner.json"))
    return files
  }

  function load(): Profile {
    // 1 + 2: profile file on disk
    for (const file of candidateProfileFiles()) {
      const data = readJsonSync(file)
      if (data) {
        if (data.apiBase) assertSafeBase(`partner.json (${file}) apiBase`, data.apiBase)
        if (data.appBase) assertSafeBase(`partner.json (${file}) appBase`, data.appBase)
        // A file exists — merge with defaults so partial profiles still work.
        // If the file has apiBase but not appBase, derive the missing fields.
        const derived = data.apiBase ? derive(data.apiBase, data.appBase) : {}
        return { ...KOLBO_DEFAULTS, ...derived, ...data }
      }
    }

    // 3: KOLBO_API_BASE / KOLBO_APP_BASE env vars (the pre-whitelabel escape
    //    hatch — keep working). Both env vars participate in derivation so
    //    docs/pricing/share URLs anchor to the app host. If only KOLBO_APP_BASE
    //    is set we still derive app-anchored URLs (upsell/docs/share) from it
    //    by seeding apiBase with the app origin — otherwise those URLs would
    //    silently stay pinned to https://app.kolbo.ai.
    const envApiBase = process.env["KOLBO_API_BASE"]
    const envAppBase = process.env["KOLBO_APP_BASE"]
    if (envApiBase || envAppBase) {
      if (envApiBase) assertSafeBase("KOLBO_API_BASE", envApiBase)
      if (envAppBase) assertSafeBase("KOLBO_APP_BASE", envAppBase)
      // Loud warning on stderr — env-var overrides are a high-risk surface.
      // If an attacker poisoned a shell RC, we want the user to see it.
      // Only emit ANSI color when attached to a TTY so file-redirected
      // stderr stays clean. Dedupe via an inherited sentinel env var so
      // spawned kolbo subprocesses don't re-print the same warning.
      if (!process.env["KOLBO_OVERRIDE_WARNED"]) {
        try {
          const isTty = Boolean((process.stderr as any).isTTY)
          const open = isTty ? "\x1b[33m" : ""
          const close = isTty ? "\x1b[0m" : ""
          process.stderr.write(
            open +
              "[kolbo] warning: backend overridden by env var —" +
              (envApiBase ? ` KOLBO_API_BASE=${envApiBase}` : "") +
              (envAppBase ? ` KOLBO_APP_BASE=${envAppBase}` : "") +
              close +
              "\n",
          )
        } catch {}
        try {
          process.env["KOLBO_OVERRIDE_WARNED"] = "1"
        } catch {}
      }
      const derived = envApiBase
        ? derive(envApiBase, envAppBase)
        : derive(envAppBase!, envAppBase)
      return { ...KOLBO_DEFAULTS, ...derived }
    }

    // 4: pure Kolbo
    return { ...KOLBO_DEFAULTS }
  }

  export const profile: Profile = load()

  // Convenience exports — prefer these at call sites for readability.
  export const id = profile.id
  export const name = profile.name
  export const domain = profile.domain
  export const apiBase = profile.apiBase
  export const appBase = profile.appBase
  export const docsUrl = profile.docsUrl
  export const upsellUrl = profile.upsellUrl
  export const upsellMessage = profile.upsellMessage
  export const shareBase = profile.shareBase

  /** True when the CLI is running against a non-Kolbo backend. */
  export const isWhitelabel = apiBase !== KOLBO_DEFAULTS.apiBase

  /**
   * Auth provider ID namespaced by API host so that dev, prod, and whitelabel
   * backends each get their own slot in auth.json. This prevents the common
   * "key expired" issue when switching between environments.
   *
   * Examples:
   *   - prod:  "kolbo@api.kolbo.ai"
   *   - dev:   "kolbo@localhost:5050"
   *   - wl:    "kolbo@sapir.kolbo.ai"
   */
  export const authProviderID: string = (() => {
    try {
      return `kolbo@${new URL(apiBase).host}`
    } catch {
      return "kolbo"
    }
  })()

  /** Bare fallback key for backwards compat with pre-namespacing auth.json files. */
  export const authProviderIDLegacy = "kolbo"
}
