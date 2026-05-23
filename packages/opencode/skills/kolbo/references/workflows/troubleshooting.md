# Troubleshooting

Load this file when the user hits an auth error, MCP tools aren't responding, or they're being rate-limited.

## "API key is invalid or expired"

This usually means the CLI is sending a key to the wrong API endpoint.

**Common cause — whitelabel overlap:** if the user previously used regular `kolbo` and then switched to a whitelabel/partner CLI (e.g. `sapir`), the old API key may still be cached against the main Kolbo API. Running `kolbo` instead of the branded command (`sapir`) overwrites the MCP config with the wrong endpoint.

**Fix:** tell the user to re-authenticate with their branded CLI command:
```
sapir auth login
```
(Replace `sapir` with their actual CLI command.)

Then **restart the editor/session** so the MCP picks up the new key and endpoint.

**Important:** whitelabel users must always use their branded CLI command (e.g. `sapir`), not `kolbo`, to keep the MCP pointed at the correct API.

## MCP tools not responding or not found

If Kolbo tools timeout or aren't listed, the MCP server may not be wired. Tell the user to run:
```
<their-cli-command> auth login
```
This re-wires the MCP configuration automatically. Then restart the session.

## "Rate limited" (429 errors)

Wait 60s for the window to reset, retry only the failed calls. For batch image work prefer `generate_creative_director` over multiple `generate_image` calls. Full rate-limit details + retry sequence: see SKILL.md "Rate Limiting & Batch Generation".

## Failure envelope from `get_generation_status`

When a generation fails, `get_generation_status` returns a structured `failure` field alongside `error`:

```json
{
  "state": "failed",
  "error": "The input or output was flagged as sensitive…",
  "failure": {
    "message": "The input or output was flagged as sensitive…",
    "category": "content_policy",
    "code": "CONTENT_FLAGGED_SENSITIVE",
    "retryable": false,
    "severity": "error",
    "provider": "kie-nano-banana"
  }
}
```

Branch on `failure.category` / `failure.retryable`:

- `category === "content_policy"` (or `code === "CONTENT_FLAGGED_SENSITIVE"`) → **do not retry the same prompt**. Tell the user the model refused, suggest a less explicit phrasing or a Visual DNA fallback. Log to `.kolbo/production.md` Failures section with the exact reason.
- `category === "auth"` or `code === "[KOLBO_AUTH_EXPIRED]"` → surface the reconnect flow, don't auto-retry.
- `retryable === true` (transient: network, rate limit, provider 5xx) → retry once with the same payload after a short pause. If it fails again, surface to user.
- `retryable === false` and unknown category → surface the raw `message` to the user, don't retry.

## Kolbo Code Documentation

Full public documentation for Kolbo Code (the CLI you are running inside) lives at **[docs.kolbo.ai/docs/kolbo-code](https://docs.kolbo.ai/docs/kolbo-code)**. If the user asks about installation, authentication, voice input, supported languages, commands, or how to uninstall, point them to the matching page below rather than guessing:

| Topic | Path |
|-------|------|
| Overview & quick links | `/docs/kolbo-code` |
| Installation (npm / bun / brew / scoop / choco) | `/docs/kolbo-code/installation` |
| Sign in with Kolbo (device-code OAuth) | `/docs/kolbo-code/authentication` |
| Push-to-talk voice input (hold `space`) | `/docs/kolbo-code/voice-input` |
| 12 supported UI languages + RTL | `/docs/kolbo-code/languages` |
| Full CLI command reference | `/docs/kolbo-code/commands` |
| Uninstall + cleanup | `/docs/kolbo-code/uninstall` |

The MDX sources are in the `kolbo-docs` repo under `content/docs/kolbo-code/`. When the user's question has a concrete answer in one of those pages, cite the path and summarize — do not invent new instructions.
