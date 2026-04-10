# Kolbo CLI — Whitelabel Guide

The Kolbo CLI supports running against any whitelabel backend that exposes
the same kolbo-api route surface (e.g. a partner named "Sapir" deployed at
`sapir.kolbo.ai`). A single published CLI binary serves any number of
partners — branding is runtime configuration, not a separate build.

## How it works

At startup, the CLI loads a **partner profile** that tells it:

- Which API host to talk to (`apiBase`)
- Which web UI host for docs/pricing/share links (`appBase`)
- What to call itself in the UI (`name`, `domain`)

Every partner backend runs the same kolbo-api code, so the CLI only needs to
be pointed at a different host — there's no per-partner binary, no per-partner
build.

## Profile resolution order

First match wins:

1. `KOLBO_PARTNER_PROFILE=/path/to/partner.json` — explicit file override
2. `$XDG_CONFIG_HOME/kolbo/partner.json` — installed by the partner's installer
3. `KOLBO_API_BASE` / `KOLBO_APP_BASE` env vars — derive a profile from the host
4. Built-in Kolbo defaults (pure kolbo.ai)

## Profile format

```json
{
  "id": "sapir",
  "name": "Sapir Code",
  "domain": "sapir.kolbo.ai",
  "apiBase": "https://sapir.kolbo.ai/api",
  "appBase": "https://sapir.kolbo.ai",
  "docsUrl": "https://sapir.kolbo.ai/docs",
  "upsellUrl": "https://sapir.kolbo.ai/pricing",
  "upsellMessage": "Free usage exceeded, subscribe at https://sapir.kolbo.ai/pricing",
  "shareBase": "https://sapir.kolbo.ai"
}
```

Only `apiBase` is strictly required — everything else is derived from it if
omitted. You can ship a minimal two-field profile and the CLI fills in the
rest:

```json
{
  "name": "Sapir Code",
  "apiBase": "https://sapir.kolbo.ai/api"
}
```

## Partner installer recipe

Each partner hosts an install script that writes the profile and installs the
published CLI:

```bash
#!/bin/bash
# https://sapir.kolbo.ai/install.sh
set -e

CONFIG_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/kolbo"
mkdir -p "$CONFIG_DIR"
cat > "$CONFIG_DIR/partner.json" <<'EOF'
{
  "id": "sapir",
  "name": "Sapir Code",
  "apiBase": "https://sapir.kolbo.ai/api"
}
EOF

npm install -g @kolbo-cli/kolbo
```

Users run:

```bash
curl -fsSL https://sapir.kolbo.ai/install.sh | sh
kolbo auth login
```

...and the CLI authenticates against Sapir's backend, routes chat traffic
through it, and shows Sapir's branding throughout the UI.

## Backend contract

A whitelabel backend must expose these routes at whatever host it uses as
`apiBase`:

| Method | Path                                          | Purpose                         |
| ------ | --------------------------------------------- | ------------------------------- |
| POST   | `/auth/kolbo-cli/device/code`                 | Start device-code login flow    |
| GET    | `/auth/kolbo-cli/device/token?code=…`         | Poll for approval / issue key   |
| POST   | `/kolbo/v1/chat/completions`                  | OpenAI-compatible chat endpoint |
| GET    | `/kolbo/v1/models`                            | OpenAI-compatible model list    |
| GET    | `/kolbo/v1/balance`                           | Credit balance (TUI sidebar)    |

The device-code endpoint returns a `verification_uri` — the backend controls
that URL, so the partner's own branded "enter code" page at
`<partner-domain>/device` is shown to users without any CLI-side changes.

## Local development

For running the CLI against a local kolbo-api while developing:

```bash
# packages/opencode/.env (gitignored)
KOLBO_API_BASE=http://localhost:5050/api
KOLBO_APP_BASE=http://localhost:8080
```

No profile file needed — the env vars drive derivation. `http://` scheme is
preserved, and docs/pricing/share URLs anchor to `KOLBO_APP_BASE`.

## What stays as "Kolbo" (and why)

A few strings intentionally stay hardcoded to Kolbo even for whitelabels:

- **OpenRouter / Vercel `HTTP-Referer` headers** — these identify our product
  to third-party AI providers when users bring their own keys. They're
  attribution metadata, not brand-visible to end users.
- **JSON `$schema` URLs** — these are IDE autocomplete hints pointing at
  static schema files. Hosting per-partner schemas isn't worth the complexity.
- **`@kolbo-cli/kolbo` npm package name** — partners install the same package
  via their own installer scripts.
- **Internal auth provider id `"kolbo"`** — the key used in `auth.json` and
  `kolbo.db`. Keeping this constant means users can switch profiles without
  re-authenticating from scratch.
