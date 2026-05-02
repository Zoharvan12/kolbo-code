# Windows Code Signing via SSL.com eSigner — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sign all Windows artifacts (Tauri desktop installer + embedded binary, CLI `.exe` binary) using the SSL.com eSigner OV cloud certificate through GitHub Actions CI/CD — no physical token, no Azure dependency.

**Architecture:** SSL.com eSigner exposes a REST API for cloud signing. `SSLcom/esigner-codesign@v1` (a GitHub Action wrapping CodeSignTool) calls this API. Tauri's existing `signCommand` in `tauri.conf.json` already hooks into a PowerShell script (`script/sign-windows.ps1`) — we replace the Azure logic in that script with CodeSignTool so every binary Tauri bundles gets signed during the build. The CLI `.exe` (built on ubuntu-latest) gets a separate signing step via the same Action after build but before npm publish.

**Tech Stack:** SSL.com eSigner API · SSLcom/esigner-codesign@v1 GitHub Action · CodeSignTool (Java JAR, bundled by the action) · PowerShell (Windows runner) · GitHub Actions secrets

---

## Scope

This plan covers **this repo** (`Zoharvan12/kolbo-code`):
- `Kolbo Code` desktop app (Tauri, NSIS installer + embedded binary)
- `@kolbo/kolbo-code` CLI — the `kolbo.exe` Windows binary shipped in the npm package

Kolbo Studio desktop (`kolbo-desktop`) and the Adobe plugin installer use the same pattern but live in separate repos — treat those as follow-up using this plan as a template.

---

## Files to Create / Modify

| File | Action | Purpose |
|---|---|---|
| `script/sign-windows.ps1` | Modify | Replace Azure Trusted Signing with SSL.com CodeSignTool |
| `.github/workflows/kolbo-desktop-release.yml` | Modify | Pass `SSLCOM_*` secrets into the Windows build step env |
| `.github/workflows/kolbo-release.yml` | Modify | Add Windows CLI binary signing step after build, before npm publish |

---

## Task 1: Gather SSL.com eSigner credentials (manual — do first)

These steps happen in the browser / SSL.com dashboard. No code changes.

- [ ] **Step 1.1 — Activate eSigner cloud signing**

  Go to your SSL.com account → Certificates → click the certificate row (Reference `co-f61ktp9v582`) → click **[activate eSigner cloud signing]**.
  Follow the prompts. You will be shown a **QR code** and a **TOTP base32 secret string** — save the base32 string (you need it as a secret, not just scanned into an authenticator app).

- [ ] **Step 1.2 — Get your credential_id**

  After activation, on the same eSigner panel, open **Developer Tools** → look for `credential_id` in the page JSON, OR call:
  ```
  GET https://cs.ssl.com/csc/v0/credentials/list
  Authorization: Basic base64(username:password)
  ```
  Copy the `credentialID` value for the code-signing certificate (it looks like `b7a8...`).

  Alternatively: open the eSigner dashboard → **eSignerCKA** or **API credentials** section — the credential ID is listed there.

- [ ] **Step 1.3 — Add four GitHub repository secrets**

  Go to `https://github.com/Zoharvan12/kolbo-code/settings/secrets/actions` and add:

  | Secret name | Value |
  |---|---|
  | `SSLCOM_USERNAME` | `zohar@kolbo.ai` (your SSL.com login email) |
  | `SSLCOM_PASSWORD` | your SSL.com account password |
  | `SSLCOM_CREDENTIAL_ID` | the `credentialID` from Step 1.2 |
  | `SSLCOM_TOTP_SECRET` | the base32 TOTP secret from Step 1.1 |

---

## Task 2: Replace Azure signing with SSL.com in sign-windows.ps1

**File:** `script/sign-windows.ps1`

The current script uses Azure Trusted Signing (`TrustedSigning` PowerShell module). We replace the entire body with CodeSignTool via the `SSLcom/esigner-codesign` action's bundled JAR.

> **Why PowerShell script**: Tauri's `bundle.windows.signCommand` in `tauri.conf.json` calls this script once per artifact (main binary + installer). Keeping `signCommand` means BOTH the embedded `.exe` and the NSIS `.exe` get signed — not just the outer installer.

- [ ] **Step 2.1 — Verify current file**

  Read the file to confirm it still has the Azure structure before editing:
  ```bash
  cat script/sign-windows.ps1
  ```
  Expected: references to `$env:AZURE_TRUSTED_SIGNING_ENDPOINT` and `Invoke-TrustedSigning`.

- [ ] **Step 2.2 — Replace the script**

  Overwrite `script/sign-windows.ps1` with:

  ```powershell
  param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]] $Path
  )

  $ErrorActionPreference = "Stop"

  if (-not $Path -or $Path.Count -eq 0) {
    throw "At least one path is required"
  }

  if ($env:GITHUB_ACTIONS -ne "true") {
    Write-Host "Skipping Windows signing (not on GitHub Actions)"
    exit 0
  }

  $username     = $env:SSLCOM_USERNAME
  $password     = $env:SSLCOM_PASSWORD
  $credentialId = $env:SSLCOM_CREDENTIAL_ID
  $totpSecret   = $env:SSLCOM_TOTP_SECRET

  if (-not $username -or -not $password -or -not $credentialId -or -not $totpSecret) {
    Write-Host "Skipping Windows signing (SSLCOM_* env vars not set)"
    exit 0
  }

  # CodeSignTool JAR is pre-installed by SSLcom/esigner-codesign action setup step
  # The action sets CODESIGN_TOOL_PATH env var pointing to the JAR
  $jarPath = $env:CODESIGN_TOOL_PATH
  if (-not $jarPath -or -not (Test-Path $jarPath)) {
    # Fallback: search runner tool cache
    $jarPath = Get-ChildItem "$env:RUNNER_TOOL_CACHE\codesigntool" -Recurse -Filter "CodeSignTool.jar" -ErrorAction SilentlyContinue |
               Select-Object -First 1 -ExpandProperty FullName
  }
  if (-not $jarPath) {
    throw "CodeSignTool.jar not found. Ensure the SSLcom/esigner-codesign setup step ran before the Tauri build."
  }

  foreach ($file in $Path) {
    $resolved = Resolve-Path $file -ErrorAction SilentlyContinue
    if (-not $resolved) { Write-Warning "File not found: $file"; continue }

    $filePath = $resolved.Path
    Write-Host "Signing: $filePath"

    $result = java -jar $jarPath sign `
      "-username=$username" `
      "-password=$password" `
      "-credential_id=$credentialId" `
      "-totp_secret=$totpSecret" `
      "-input_file_path=$filePath" `
      -override 2>&1

    if ($LASTEXITCODE -ne 0) {
      Write-Host $result
      throw "Signing failed for $filePath (exit $LASTEXITCODE)"
    }

    Write-Host "✓ Signed: $filePath"
  }
  ```

- [ ] **Step 2.3 — Commit**

  ```bash
  git add script/sign-windows.ps1
  git commit -m "feat: replace Azure Trusted Signing with SSL.com eSigner in sign-windows.ps1"
  ```

---

## Task 3: Update kolbo-desktop-release.yml — Windows signing

**File:** `.github/workflows/kolbo-desktop-release.yml`

Two changes needed:
1. Add a **setup step** that installs CodeSignTool (via `SSLcom/esigner-codesign@v1` in `setup` mode) and exposes `CODESIGN_TOOL_PATH` before Tauri builds
2. Add `SSLCOM_*` env vars to the **Build Tauri app** step so the PS1 script can read them

- [ ] **Step 3.1 — Add CodeSignTool setup step**

  In `.github/workflows/kolbo-desktop-release.yml`, find this block (around line 177):
  ```yaml
        - name: Build Tauri app
          uses: tauri-apps/tauri-action@v0
  ```

  Insert a new step **before** `Build Tauri app`, only for Windows:
  ```yaml
        - name: Setup SSL.com CodeSignTool (Windows)
          if: matrix.platform == 'windows-latest'
          uses: SSLcom/esigner-codesign@v1
          with:
            command: get_credential_ids
            username: ${{ secrets.SSLCOM_USERNAME }}
            password: ${{ secrets.SSLCOM_PASSWORD }}
            credential_id: ${{ secrets.SSLCOM_CREDENTIAL_ID }}
            totp_secret: ${{ secrets.SSLCOM_TOTP_SECRET }}
            malware_block: "false"
  ```

  > **Note:** Using `get_credential_ids` as the command is a lightweight probe that installs the tool and validates credentials without signing anything. The action sets up Java + downloads CodeSignTool into the runner and exports `CODESIGN_TOOL_PATH`. The actual signing happens inside the PS1 via the same JAR.

  Actually, a cleaner approach: use `command: sign` on a dummy call is overkill. The action doesn't have a pure "setup" mode. Instead, we'll **download the JAR ourselves** in the setup step and set `CODESIGN_TOOL_PATH`:

  ```yaml
        - name: Setup SSL.com CodeSignTool (Windows)
          if: matrix.platform == 'windows-latest'
          shell: pwsh
          run: |
            $toolDir = Join-Path $env:RUNNER_TOOL_CACHE "codesigntool"
            New-Item -ItemType Directory -Force -Path $toolDir | Out-Null
            $zipPath = Join-Path $toolDir "codesigntool.zip"
            Invoke-WebRequest -Uri "https://www.ssl.com/download/codesigntool-for-windows/" -OutFile $zipPath -UseBasicParsing
            Expand-Archive -Path $zipPath -DestinationPath $toolDir -Force
            $jar = Get-ChildItem $toolDir -Recurse -Filter "CodeSignTool.jar" | Select-Object -First 1 -ExpandProperty FullName
            echo "CODESIGN_TOOL_PATH=$jar" >> $env:GITHUB_ENV
            Write-Host "CodeSignTool installed at: $jar"
  ```

  > The SSL.com download page for Windows is at their official site. The actual direct URL to use is the one from their developer docs — verify it from the SSL.com dashboard under **Developer Tools → CodeSignTool**.

- [ ] **Step 3.2 — Add SSLCOM env vars to the Tauri build step**

  Find the existing `Build Tauri app` step (around line 178):
  ```yaml
        - name: Build Tauri app
          uses: tauri-apps/tauri-action@v0
          env:
            GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
            TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
            TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}
            APPLE_SIGNING_IDENTITY: ${{ secrets.APPLE_IDENTITY }}
  ```

  Add the four SSLCOM vars to the `env` block:
  ```yaml
          env:
            GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
            TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
            TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}
            APPLE_SIGNING_IDENTITY: ${{ secrets.APPLE_IDENTITY }}
            SSLCOM_USERNAME: ${{ secrets.SSLCOM_USERNAME }}
            SSLCOM_PASSWORD: ${{ secrets.SSLCOM_PASSWORD }}
            SSLCOM_CREDENTIAL_ID: ${{ secrets.SSLCOM_CREDENTIAL_ID }}
            SSLCOM_TOTP_SECRET: ${{ secrets.SSLCOM_TOTP_SECRET }}
  ```

- [ ] **Step 3.3 — Commit**

  ```bash
  git add .github/workflows/kolbo-desktop-release.yml
  git commit -m "feat: add SSL.com eSigner signing to Windows desktop build"
  ```

---

## Task 4: Sign CLI Windows binary in kolbo-release.yml

**File:** `.github/workflows/kolbo-release.yml`

The CLI is built on ubuntu-latest. The Windows binary (`kolbo.exe`) is cross-compiled and then bundled into the npm package. `SSLcom/esigner-codesign@v1` works on Linux (it uses Java) so we can sign the `.exe` before publishing.

- [ ] **Step 4.1 — Locate the Windows binary after build**

  In `packages/opencode/script/build.ts`, the Windows binary is output to:
  ```
  packages/opencode/dist/kolbo-windows-x64/bin/kolbo.exe
  ```
  Verify this path by checking the build output directory structure:
  ```bash
  cat packages/opencode/script/build.ts | grep -A5 "windows"
  ```

- [ ] **Step 4.2 — Add signing step after build, before npm publish**

  In `.github/workflows/kolbo-release.yml`, find this block (around line 85):
  ```yaml
        - name: Publish to npm
          env:
            NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
  ```

  Insert a new step **before** `Publish to npm`:
  ```yaml
        - name: Sign Windows CLI binary
          uses: SSLcom/esigner-codesign@v1
          with:
            command: sign
            username: ${{ secrets.SSLCOM_USERNAME }}
            password: ${{ secrets.SSLCOM_PASSWORD }}
            credential_id: ${{ secrets.SSLCOM_CREDENTIAL_ID }}
            totp_secret: ${{ secrets.SSLCOM_TOTP_SECRET }}
            file_path: packages/opencode/dist/kolbo-windows-x64/bin/kolbo.exe
            malware_block: "false"
            override: "true"
          continue-on-error: true
  ```

  > `continue-on-error: true` means a signing failure won't block the npm publish — useful during the initial rollout. Remove it once signing is confirmed working in CI.

- [ ] **Step 4.3 — Commit**

  ```bash
  git add .github/workflows/kolbo-release.yml
  git commit -m "feat: sign Windows CLI binary via SSL.com eSigner before npm publish"
  ```

---

## Task 5: Test the pipeline end-to-end

- [ ] **Step 5.1 — Verify secrets are present**

  Go to `https://github.com/Zoharvan12/kolbo-code/settings/secrets/actions` and confirm all four `SSLCOM_*` secrets are listed.

- [ ] **Step 5.2 — Trigger desktop release (draft)**

  Go to **Actions → kolbo-desktop-release → Run workflow**, set a test version (`0.0.1-signing-test`) and `draft: true`. Watch the Windows job logs for:
  - `Setup SSL.com CodeSignTool (Windows)` — should show the JAR path
  - During Tauri build, the PS1 script should log `Signing: ...` and `✓ Signed: ...` for each binary
  - No `Skipping Windows signing` messages

- [ ] **Step 5.3 — Verify signature on the produced .exe**

  Download the draft release `.exe`. On any Windows machine run:
  ```powershell
  Get-AuthenticodeSignature ".\Kolbo Code_0.0.1-signing-test_x64-setup.exe" | Select-Object Status, SignerCertificate
  ```
  Expected output:
  ```
  Status              : Valid
  SignerCertificate   : [Subject: CN=Zohar Vanunu Productions LLC, ...]
  ```

- [ ] **Step 5.4 — Trigger CLI release (dev tag)**

  Go to **Actions → kolbo-release → Run workflow**, tag=`dev`, no version. Watch for:
  - `Sign Windows CLI binary` step — should complete with exit 0
  - npm package published with signed binary

- [ ] **Step 5.5 — Delete draft test release**

  ```bash
  gh release delete desktop-v0.0.1-signing-test --yes -R Zoharvan12/kolbo-code
  gh release delete-tag v0.0.1-signing-test --yes -R Zoharvan12/kolbo-code 2>/dev/null || true
  ```

---

## Follow-up (separate plans, same pattern)

- **Kolbo Studio desktop** (`kolbo-desktop` repo): same Task 2–5 pattern, but the signing script and workflow are in that repo
- **Adobe plugin installer**: sign the `.exe`/`.msi` artifact in its release workflow using `SSLcom/esigner-codesign@v1`

---

## Key SSL.com Reference

- eSigner dashboard: your SSL.com account → Certificates → row `co-f61ktp9v582` → eSigner section
- CodeSignTool docs: https://www.ssl.com/guide/esigner-codesigntool-command-guide/
- GitHub Action: `SSLcom/esigner-codesign@v1` (source: github.com/SSLcom/esigner-codesign)
- Certificate valid until: **Apr 22, 2027**
