# Whitelabel Integration Runbook

Step-by-step guide to onboarding a new whitelabel partner end-to-end across
the three repos: **kolbo-api** (backend), **kolbo-map** (web frontend), and
**kodu** (CLI).

Sapir is the reference implementation — every step references the Sapir files
you can copy and adapt.

> **Assumptions for this runbook**
> - Partner name: `acme` (replace throughout)
> - Partner domain: `acme.kolbo.ai` (or `acme.com` — either works, just keep it consistent)
> - Droplet IP: `X.X.X.X` (provision before starting)
> - All three repos checked out locally under `G:\Projects\Kolbo.AI\github\`

---

## Part 1 — Backend (kolbo-api)

### 1.1 Provision infrastructure

Before touching code:

- [ ] Create a DigitalOcean droplet (2GB minimum, Ubuntu 22.04)
- [ ] Create a new MongoDB Atlas database for the partner (isolated data)
- [ ] Create a new DigitalOcean Spaces bucket: `kolbo-acme`
- [ ] Create a new Stripe account or sub-account if partner takes payments
- [ ] Point DNS: `acme.kolbo.ai` → droplet IP (or partner's custom domain)
- [ ] Decide ports: API on `5050`, frontend on `8080` (standard Kolbo ports)

### 1.2 Create the backend branch

```bash
cd G:\Projects\Kolbo.AI\github\kolbo-api
git checkout master
git pull origin master
git checkout -b whitelabel-acme-api
```

Branch from `master` (same as Sapir). All whitelabel branches are kept
continuously synced with master so they always carry the latest CLI auth
routes, chat routes, and any backend features. You don't need to worry
about the new partner branch being stale.

### 1.3 Create the PM2 ecosystem config

Copy the Sapir template and rename everywhere:

```bash
cp ecosystem.whitelabel-sapir.config.js ecosystem.whitelabel-acme.config.js
```

Edit the new file — replace every `sapir` with `acme`:

- `name: 'kolbo-api-whitelabel-acme'`
- `cwd: '/var/www/kolbo-api-whitelabel-acme'`
- `env_file: '/var/www/kolbo-api-whitelabel-acme/.env'`
- `error_file: '/var/log/pm2/kolbo-api-whitelabel-acme-error.log'`
- `out_file: '/var/log/pm2/kolbo-api-whitelabel-acme-out.log'`
- `log_file: '/var/log/pm2/kolbo-api-whitelabel-acme.log'`

### 1.4 Create the droplet setup script

Copy and adapt Sapir's setup script:

```bash
cp scripts/deployment/setup-whitelabel-sapir.sh scripts/deployment/setup-whitelabel-acme.sh
```

In the new script, update:

- `APP_DIR="/var/www/kolbo-api-whitelabel-acme"`
- Git clone path and branch: `git checkout whitelabel-acme-api`
- `.env` template values:
  - `FRONTEND_URL=https://acme.kolbo.ai`
  - `CLIENT_APP_BASE_URL=https://acme.kolbo.ai` **← CRITICAL: this is what the CLI device-code endpoint returns as `verification_uri`. If wrong, CLI login breaks.**
  - `API_BASE_URL=https://acme.kolbo.ai` (public API URL, not droplet IP)
  - `CORS_ORIGIN=https://acme.kolbo.ai,http://localhost:3000,http://localhost:8080`
  - `MONGODB_URI=` → new Atlas connection string
  - `DO_SPACES_MEDIA_BUCKET=kolbo-acme`
  - `DO_SPACES_URL=https://kolbo-acme.ams3.digitaloceanspaces.com`
  - `ADMIN_EMAIL=admin@acme.com`
  - `STRIPE_SECRET_KEY` and `END_POINT_SECRET` → partner's Stripe credentials
- Ecosystem config filename: `ecosystem.whitelabel-acme.config.js`
- GitHub secret names: `WHITELABEL_ACME_SSH_KEY`, `WHITELABEL_ACME_HOST`, `WHITELABEL_ACME_USER`

### 1.5 CLI routes are automatically present

All whitelabel backend branches are kept continuously synced with `master`,
so the CLI routes (`/auth/kolbo-cli/device/*`, `/kolbo/v1/*`) are always
available on every whitelabel branch. **No manual verification or sync
needed.** This is a guarantee of the repo's workflow, not a check you have
to do per-partner.

### 1.6 Commit and push

```bash
git add ecosystem.whitelabel-acme.config.js scripts/deployment/setup-whitelabel-acme.sh
git commit -m "feat(whitelabel): add acme deployment config"
git push origin whitelabel-acme-api
```

### 1.7 Deploy to the droplet

SSH into the droplet and run the setup script:

```bash
ssh root@X.X.X.X
curl -o setup.sh https://raw.githubusercontent.com/Zoharvan12/kolbo-api/whitelabel-acme-api/scripts/deployment/setup-whitelabel-acme.sh
chmod +x setup.sh
./setup.sh
```

After it finishes:

- [ ] Edit `/var/www/kolbo-api-whitelabel-acme/.env` and fill in real API keys
- [ ] `pm2 restart kolbo-api-whitelabel-acme`
- [ ] `pm2 logs kolbo-api-whitelabel-acme` — confirm no errors
- [ ] `curl http://localhost:5050/health` — confirm server responds

### 1.8 Set up HTTPS / reverse proxy

Point `acme.kolbo.ai` at the droplet via Nginx + Let's Encrypt (or
Cloudflare). The external URL **must** match `CLIENT_APP_BASE_URL` in `.env`,
or device-code login will return a verification URL pointing at the wrong
host.

### 1.9 Smoke-test the CLI routes from outside

```bash
# Should return a device_code + verification_uri
curl -X POST https://acme.kolbo.ai/api/auth/kolbo-cli/device/code \
  -H 'Content-Type: application/json' -d '{}'

# Should return { available, reserved, total }
curl https://acme.kolbo.ai/api/kolbo/v1/balance \
  -H 'X-API-Key: test'
```

If both respond, the backend is ready.

### 1.10 Set up GitHub Actions deployment (optional but recommended)

Add GitHub secrets to `Zoharvan12/kolbo-api`:

- `WHITELABEL_ACME_SSH_KEY` — private key from step 1.7
- `WHITELABEL_ACME_HOST` — droplet IP
- `WHITELABEL_ACME_USER` — `root`

Create `.github/workflows/deploy-whitelabel-acme.yml` (copy from Sapir's
workflow if it exists, update branch names and secret names).

---

## Part 2 — Web Frontend (kolbo-map)

The frontend must expose two pages the CLI relies on, plus show the partner's
brand throughout.

### 2.1 Create the frontend branch

```bash
cd G:\Projects\Kolbo.AI\github\kolbo-map
git checkout master
git pull origin master
git checkout -b whitelabel-acme
```

### 2.2 Required pages for the CLI flow

The Kolbo CLI relies on two partner-hosted pages:

| Path | What it does | Required? |
|---|---|---|
| `/device` | Branded "enter your CLI code" approval page | **Yes** — CLI login fails without it |
| `/pricing` | Where users go when they hit the credit upsell dialog | Yes |
| `/docs` | Docs link opened from TUI help menu | Optional — not strictly CLI-blocking |

**`/device` contract:**

- Accept `?user_code=XXXXXX` query param (or show an input field)
- User enters their Kolbo account credentials + approves the code
- Frontend calls the partner's own backend to mark the `device_code` as
  approved (kolbo-api already has this endpoint — check
  `src/modules/auth/device-code.js` for the approval route)
- After approval, the CLI's polling loop picks up the issued API key

Sapir already has this page (you mentioned "the frontend of sapir already
updated") — use it as the reference implementation.

### 2.3 Environment / brand config

In `kolbo-map`, set the partner's branding at build time via whatever env
mechanism the frontend uses (look for a `VITE_*` config or a brand JSON):

- Product name: `Acme`
- Logo assets
- Primary color
- API base URL: `https://acme.kolbo.ai/api`

### 2.4 Deploy

Deploy `kolbo-map` to wherever `acme.kolbo.ai` serves its web UI. Typical
setup: Nginx on the same droplet serves the built static files at `/` and
proxies `/api/*` to `localhost:5050`.

### 2.5 Smoke test

Open `https://acme.kolbo.ai/device` in a browser — should render the branded
device-approval page. Open `https://acme.kolbo.ai/pricing` — should render
the partner's pricing page.

---

## Part 3 — CLI (kodu)

**Zero code changes on the CLI side.** The Kolbo CLI is already whitelabel-aware
(see [WHITELABEL.md](./WHITELABEL.md)). All that's needed is to host a
`partner.json` profile and a tiny install script on the partner's domain.

### 3.1 Create the partner profile

Host this at `https://acme.kolbo.ai/partner.json`:

```json
{
  "id": "acme",
  "name": "Acme Code",
  "domain": "acme.kolbo.ai",
  "apiBase": "https://acme.kolbo.ai/api",
  "appBase": "https://acme.kolbo.ai",
  "docsUrl": "https://acme.kolbo.ai/docs",
  "upsellUrl": "https://acme.kolbo.ai/pricing",
  "shareBase": "https://acme.kolbo.ai"
}
```

**Minimal version** (everything derived from `apiBase`):

```json
{
  "name": "Acme Code",
  "apiBase": "https://acme.kolbo.ai/api"
}
```

### 3.2 Create the install script

Host this at `https://acme.kolbo.ai/install.sh`:

```bash
#!/bin/bash
set -e

echo "Installing Acme CLI..."

# 1. Write the partner profile
CONFIG_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/kolbo"
mkdir -p "$CONFIG_DIR"
cat > "$CONFIG_DIR/partner.json" <<'EOF'
{
  "id": "acme",
  "name": "Acme Code",
  "apiBase": "https://acme.kolbo.ai/api"
}
EOF

# 2. Install the CLI (same npm package every partner uses)
if ! command -v npm &> /dev/null; then
  echo "npm is required. Install Node.js first: https://nodejs.org"
  exit 1
fi

npm install -g @kolbo-cli/kolbo

echo ""
echo "Done. Run 'kolbo auth login' to sign in."
```

### 3.3 (Optional) Windows install script

Host at `https://acme.kolbo.ai/install.ps1`:

```powershell
$configDir = "$env:APPDATA\kolbo"
New-Item -ItemType Directory -Force -Path $configDir | Out-Null
@'
{
  "id": "acme",
  "name": "Acme Code",
  "apiBase": "https://acme.kolbo.ai/api"
}
'@ | Set-Content "$configDir\partner.json"

npm install -g @kolbo-cli/kolbo
Write-Host "Done. Run 'kolbo auth login' to sign in."
```

### 3.4 End-user install command

Document for partner users:

```bash
# macOS / Linux
curl -fsSL https://acme.kolbo.ai/install.sh | sh

# Windows (PowerShell)
irm https://acme.kolbo.ai/install.ps1 | iex
```

Then:

```bash
kolbo auth login
```

CLI opens `https://acme.kolbo.ai/device?user_code=XXXXXX`, user approves, CLI
gets an API key, all chat traffic routes through the partner's kolbo-api. Done.

---

## Part 4 — End-to-end verification

Run these checks after everything is deployed, before handing off to the
partner:

### 4.1 Backend reachability

```bash
curl -X POST https://acme.kolbo.ai/api/auth/kolbo-cli/device/code \
  -H 'Content-Type: application/json' -d '{}'
```

Expected: JSON with `device_code`, `user_code`, `verification_uri` pointing
at `https://acme.kolbo.ai/device?...`.

### 4.2 CLI end-to-end

On a clean machine (or delete `~/.config/kolbo/` first):

```bash
curl -fsSL https://acme.kolbo.ai/install.sh | sh
kolbo auth login
```

Expected flow:

1. CLI prints a code like `ABCD-1234`
2. Browser opens `https://acme.kolbo.ai/device?user_code=ABCD-1234`
3. **Page shows Acme branding, not Kolbo branding**
4. User signs in with Acme account, approves
5. CLI shows "Logged into Acme Code"
6. TUI header shows "Acme" not "Kolbo"
7. `kolbo` ← run a simple prompt → response streams from Acme's backend
8. Hit `?` → help menu → "Open docs" opens `https://acme.kolbo.ai/docs`

### 4.3 Credit balance + upsell

- [ ] TUI sidebar shows credit balance (fetched from `acme.kolbo.ai/api/kolbo/v1/balance`)
- [ ] When free tier is exhausted, upsell dialog points at `https://acme.kolbo.ai/pricing`

### 4.4 Switching between partners

On the same machine:

```bash
# Use Acme
kolbo  # uses ~/.config/kolbo/partner.json → Acme

# Temporarily switch to Sapir for one session
KOLBO_PARTNER_PROFILE=/tmp/sapir.json kolbo

# Or unset and get pure Kolbo
rm ~/.config/kolbo/partner.json
kolbo
```

Each profile has its own auth credentials stored under the internal `"kolbo"`
provider key, so switching profiles requires re-login (by design — prevents
cross-partner key leakage).

---

## Part 5 — Ongoing maintenance

### 5.1 When Kolbo releases a new CLI version

**Nothing to do per-partner.** Partners automatically get the new version
when their users run `npm install -g @kolbo-cli/kolbo` or when the CLI's
built-in auto-update triggers.

### 5.2 When kolbo-api gets a new feature

Partner branches stay auto-synced with `master`, so code propagates without
any per-partner merge work. What you still need to do per-partner when a
backend change lands:

1. SSH to the partner's droplet
2. `cd /var/www/kolbo-api-whitelabel-acme && git pull`
3. `pm2 restart kolbo-api-whitelabel-acme`
4. Check logs for errors

If the change introduces new env vars, also update the partner's `.env`
before restarting.

### 5.3 When kolbo-map gets a new feature

Same pattern as 5.2, but for the `kolbo-map` repo and the frontend deploy.

### 5.4 Keeping track of partners

Maintain a simple registry — suggested location: `kolbo-api/WHITELABELS.md`

| Partner | API branch | Droplet IP | Domain | MongoDB | Stripe | Deployed |
|---|---|---|---|---|---|---|
| Sapir | whitelabel-sapir-api | 167.71.50.155 | sapir.kolbo.ai | sapir-cluster | separate | ✅ |
| Acme | whitelabel-acme-api | X.X.X.X | acme.kolbo.ai | acme-cluster | separate | ⏳ |

---

## Quick reference — files touched per new partner

| Repo | New files | Modified files |
|---|---|---|
| **kolbo-api** | `ecosystem.whitelabel-acme.config.js`, `scripts/deployment/setup-whitelabel-acme.sh` | (new branch only, no files on master) |
| **kolbo-map** | Brand config / theme override | (new branch only) |
| **kodu (CLI)** | **None** — CLI is already whitelabel-aware | **None** |

Partner-hosted (on `acme.kolbo.ai`):
- `/install.sh` (+ optional `/install.ps1`)
- `/partner.json`
- `/device` page (served by kolbo-map build)
- `/pricing` page (served by kolbo-map build)
- `/docs` page (optional, served by kolbo-map build)

---

## Troubleshooting

### CLI login opens `https://app.kolbo.ai/device` instead of partner's page

**Cause:** `CLIENT_APP_BASE_URL` not set (or wrong) in the partner's kolbo-api
`.env`. Device-code endpoint falls back to hardcoded default.

**Fix:** SSH to droplet, edit `.env`, set `CLIENT_APP_BASE_URL=https://acme.kolbo.ai`,
`pm2 restart`.

### CLI shows "Logged into Kolbo" instead of "Logged into Acme Code"

**Cause:** Partner profile not loaded. Either `partner.json` is missing, has
the wrong path, or the install script didn't write it.

**Fix:**
```bash
cat ~/.config/kolbo/partner.json  # should exist and contain Acme config
KOLBO_PARTNER_PROFILE=~/.config/kolbo/partner.json kolbo auth login  # force-load
```

### CLI login returns 404 on `/auth/kolbo-cli/device/code`

**Cause:** Partner branches auto-sync from master so the routes are always
in the source tree — if you still see a 404, the droplet hasn't pulled the
latest commit.

**Fix:**
```bash
ssh root@<droplet>
cd /var/www/kolbo-api-whitelabel-acme
git pull
pm2 restart kolbo-api-whitelabel-acme
```

### Chat requests return 401 `X-API-Key`

**Cause:** Partner's kolbo-api auth middleware not accepting the key format
the CLI sends, or the device-token endpoint issued a key the chat endpoint
doesn't recognize.

**Fix:** Check kolbo-api logs. The device-code flow and the chat auth must
share the same key store — usually a bug in the partner branch diverging
from master.

### Chat responses come from Kolbo's backend, not the partner's

**Cause:** Something cached the Kolbo API URL. Usually the `auth.metadata.apiBase`
field in `~/.local/share/kolbo/auth.json`.

**Fix:**
```bash
kolbo auth logout kolbo
rm ~/.config/kolbo/kolbo.json  # MCP config with stale URL
kolbo auth login
```
