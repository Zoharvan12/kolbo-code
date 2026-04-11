import type { Hooks, PluginInput } from "@opencode-ai/plugin"
import { setTimeout as sleep } from "node:timers/promises"
import { Partner } from "../brand/partner"

const KOLBO_API_BASE = Partner.apiBase
const OAUTH_POLLING_SAFETY_MARGIN_MS = 3000

export async function KolboAuthPlugin(_input: PluginInput): Promise<Hooks> {
  return {
    auth: {
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
            const r = await fetch(`${KOLBO_API_BASE}/auth/kolbo-cli/device/code`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: "{}",
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
              interval?: number
              expires_in?: number
            }

            const interval = Math.max(1, data.interval ?? 5) * 1000
            const expiresAt = Date.now() + (data.expires_in ?? 900) * 1000

            return {
              url: data.verification_uri,
              instructions: `Enter code: ${data.user_code}`,
              method: "auto" as const,
              async callback() {
                while (Date.now() < expiresAt) {
                  await sleep(interval + OAUTH_POLLING_SAFETY_MARGIN_MS)
                  let response: Response
                  try {
                    response = await fetch(
                      `${KOLBO_API_BASE}/auth/kolbo-cli/device/token?code=${encodeURIComponent(data.device_code)}`,
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
