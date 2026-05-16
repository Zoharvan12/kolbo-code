import type { Hooks, PluginInput } from "@opencode-ai/plugin"
import { setTimeout as sleep } from "node:timers/promises"
import { Partner } from "../brand/partner"
import { Flag } from "../flag/flag"

const KOLBO_API_BASE = Partner.apiBase
const KOLBO_APP_BASE = Partner.appBase
const OAUTH_POLLING_SAFETY_MARGIN_MS = 3000

export async function KolboAuthPlugin(_input: PluginInput): Promise<Hooks> {
  return {
    auth: {
      // Keep provider as bare "kolbo" so the TUI can look up auth methods via
      // provider.id. The namespaced storage key is handled separately.
      provider: "kolbo",
      async loader(getAuth) {
        const info = await getAuth()
        if (!info) return {}
        const apiKey = info.type === "oauth" ? info.refresh : info.type === "api" ? info.key : undefined
        if (!apiKey) return {}
        return { apiKey }
      },
      methods: [
        {
          type: "oauth",
          label: `Login with ${Partner.name}`,
          async authorize() {
            // Tell the server which client surface is logging in so it can
            // scope the auto-revoke-on-rotate to that surface only — i.e.
            // signing into the desktop app does NOT revoke the terminal CLI's
            // key, and vice versa. Server falls back to 'cli' on unknown
            // values, so older builds without this field keep working.
            const r = await fetch(`${KOLBO_API_BASE}/auth/kolbo-code/device/code`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ client: Flag.KOLBO_CLIENT }),
              // Never follow redirects on an auth endpoint — a 302 would
              // let a compromised edge steer the token exchange elsewhere.
              redirect: "error",
            })
            // Status code is the only thing we surface — body may contain
            // unbounded server text.
            if (!r.ok) throw new Error(`Failed to start device login (${r.status})`)

            const data = (await r.json()) as {
              device_code: string
              user_code: string
              verification_uri: string
              // Optional — kolbo-api added this in the late-2026 batch. When
              // present, it's the verification URL with the user_code already
              // embedded as a query param, so the browser lands on a one-click
              // approval page instead of a "type the code" page.
              verification_uri_complete?: string
              interval?: number
              expires_in?: number
            }

            // Prefer verification_uri_complete when the server provides it —
            // saves the user from typing the user_code. Falls back to the
            // bare verification_uri on older servers (or when the field is
            // missing for any reason).
            const verificationUrl = data.verification_uri_complete || data.verification_uri

            // Defense in depth: even though we fetched this from Partner.apiBase
            // over HTTPS with `redirect: "error"`, we still refuse to open a
            // verification URL whose origin doesn't match the configured
            // appBase. If the backend is ever compromised, the attacker cannot
            // steer the user's browser to an arbitrary phishing page. Validate
            // BOTH the complete and bare forms (the complete form is what we
            // actually hand back, but the bare form is what users may see in
            // logs / fallback paths — if either is hostile, refuse the auth).
            try {
              const expected = new URL(KOLBO_APP_BASE).origin
              for (const candidate of [data.verification_uri, verificationUrl]) {
                const got = new URL(candidate).origin
                if (got !== expected) {
                  throw new Error(`Refusing untrusted verification_uri origin (${got} != ${expected})`)
                }
              }
            } catch (e) {
              throw new Error(`Invalid verification_uri from device code endpoint: ${(e as Error).message}`)
            }

            const interval = Math.max(1, data.interval ?? 5) * 1000
            const expiresAt = Date.now() + (data.expires_in ?? 900) * 1000

            return {
              url: verificationUrl,
              instructions: `Enter code: ${data.user_code}`,
              method: "auto" as const,
              async callback() {
                while (Date.now() < expiresAt) {
                  await sleep(interval + OAUTH_POLLING_SAFETY_MARGIN_MS)
                  let response: Response
                  try {
                    response = await fetch(
                      `${KOLBO_API_BASE}/auth/kolbo-code/device/token?code=${encodeURIComponent(data.device_code)}`,
                      { redirect: "error" },
                    )
                  } catch {
                    continue
                  }
                  if (response.status === 202) continue
                  if (!response.ok) {
                    if (response.status === 400) {
                      const body = (await response.json().catch(() => ({}))) as any
                      if (body?.error === "expired") return { type: "failed" as const }
                    }
                    continue
                  }
                  const result = (await response.json()) as any
                  if (result?.status === "approved" && result?.api_key) {
                    return {
                      type: "success" as const,
                      refresh: result.api_key,
                      access: result.api_key,
                      expires: 0,
                    }
                  }
                }
                return { type: "failed" as const }
              },
            }
          },
        },
      ],
    },
  }
}
