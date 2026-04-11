# Security Policy — Kolbo CLI

## IMPORTANT — No AI-generated reports

We do **not** accept AI-generated security reports. We receive a large number of
these and we do not have the resources to triage them. If you submit one, it will
be closed without review and may result in a ban from the project.

A real report includes a concrete reproduction, file/line references, and a
clearly-stated impact. If your report does not have those, please do not file it.

---

## Threat Model

### Overview

The Kolbo CLI (`@kolbo-cli/kolbo`) is an AI coding agent that runs locally on
the user's machine. It provides an agent system with access to powerful tools
including shell execution, file operations, and HTTP access. It is a fork of
the open-source [opencode](https://github.com/anomalyco/opencode) project,
rebranded for Kolbo.AI and routed through `kolbo-api` for managed inference.

### No sandbox — the human is the security boundary

The Kolbo CLI does **not** sandbox the agent. The permission system exists as a
UX feature to help users stay aware of what actions the agent is taking — it
prompts for confirmation before executing commands, writing files, fetching URLs,
etc. It is **not** designed to provide security isolation.

By design, an action you approve runs with your full user privileges. If you
need true isolation, run the Kolbo CLI inside a Docker container, a VM, or a
fresh user account.

### What is in scope

The following are in scope for security reports:

- **Credential theft / token exfiltration** outside of user-approved actions
  (e.g. tokens leaked into log files, sent to attacker hosts via env-var
  override, or readable by other local users due to wrong file permissions).
- **Server-side request forgery (SSRF)** in the `webfetch` tool or any other
  outbound HTTP path — e.g. fetching `http://169.254.169.254/` (cloud metadata),
  RFC1918, loopback, or link-local addresses without an explicit user opt-in.
- **Symlink / path-traversal escapes** of the project boundary on file
  read / write / edit tools without the external-directory permission prompt
  firing.
- **Library injection into MCP subprocesses** via inherited environment
  variables (`LD_PRELOAD`, `DYLD_INSERT_LIBRARIES`, `NODE_OPTIONS`,
  `PYTHONPATH`, `PERL5OPT`, `RUBYOPT`, etc.) when the parent shell environment
  is poisoned.
- **OAuth / device-code flow bypasses** — e.g. token exchange that follows a
  redirect to an attacker-controlled host, malformed `auth.command` in
  `.well-known/kolbo` causing arbitrary command execution without user
  confirmation, or the local server binding to a non-loopback interface
  without authentication.
- **Zip-slip / path traversal** in archive extraction (LSP server installers).
- **Config-file poisoning** that achieves code execution on next launch — for
  example, an MCP `command` containing a relative path that shadows a system
  binary, or an `mcp.url` that ships tool calls over cleartext HTTP to a
  non-local host.
- **Atomic-write or torn-read failures** on credential files (`auth.json`,
  `kolbo.json`) that could expose tokens during the write window or corrupt
  state across concurrent CLI invocations.

### Out of scope

| Category | Rationale |
| --- | --- |
| **Anything you explicitly approved** | The permission prompt is the security boundary. If you approved a `bash` command and it deleted your files, that's the documented model — not a vulnerability. |
| **Sandbox escapes** | The permission system is not a sandbox. See above. |
| **LLM provider data handling** | Data sent to the AI provider you configure is governed by their privacy policy, not ours. |
| **Behavior of MCP servers you install** | External MCP servers you configure are outside our trust boundary once they are launched. We harden how they are launched (env scrubbing, URL validation), but we do not vet their behavior. |
| **Behavior of npm plugins you install** | Same as MCP — once you install a plugin, you trust its code. We do not currently sandbox plugin execution. |
| **Server access when authenticated** | If you set `KOLBO_SERVER_PASSWORD` and bind the server to a network interface, exposing the API to authenticated callers is the documented behavior. |
| **AI-generated content** | Hallucinations, biased outputs, or prompt-injected suggestions from the LLM are model behavior, not CLI vulnerabilities. The LLM is untrusted by design. |
| **Denial-of-service against your own machine** | The agent uses your CPU, disk, and network. Resource-exhaustion attacks against the local user are not in scope. |
| **Physical access** | Anyone with physical access to your unlocked machine can read `auth.json` regardless of any defense we ship. |

---

## Hardening already in place

These are the defenses currently shipped in the CLI. Knowing them up front saves
researchers time and helps you target genuinely new findings:

### Credential storage
- `auth.json` and `kolbo.json` are written **atomically** via temp-file +
  `chmod` + rename, with mode `0o600` on POSIX. On Windows, file permissions
  follow the user account ACL (Unix mode bits are a no-op).
- The OAuth device-code flow uses `redirect: "error"` on every fetch, so a
  redirect cannot steer the token exchange to an attacker after the initial
  HTTPS check passes.
- All backend overrides (`KOLBO_API_BASE`, `KOLBO_APP_BASE`, `partner.json`)
  are validated to be HTTPS unless pointing at a localhost address. A loud
  stderr warning fires whenever an env-var override is in use.

### Outbound HTTP / SSRF
- `webfetch` resolves DNS and rejects RFC1918, CGNAT, loopback, link-local,
  cloud-metadata, multicast, and reserved IPv4 ranges. IPv6 loopback,
  link-local, ULA, multicast, and **both decimal and hex IPv4-mapped forms**
  (`::ffff:10.0.0.1` and `::ffff:a00:1`) are blocked.
- `webfetch` follows redirects manually (max 5 hops) and re-validates each
  hop, so a publicly-resolvable URL cannot 302 into a private address.
- The `.well-known/kolbo` auth flow rejects non-HTTPS URLs, validates the
  fetched JSON shape, blocks shell metacharacters in `argv[0]`, requires
  explicit user confirmation showing the exact command, and uses
  `redirect: "error"` on the fetch.
- The remote-config fetch in `config.ts` validates the URL with the same
  public-IP check before reading any auth tokens into the process environment.

### File system
- `read`, `write`, and `edit` tools resolve symlinks via `realpath` *before*
  the project-boundary check, so a symlink inside the worktree pointing at
  `/etc/shadow` correctly trips the external-directory permission prompt.
- Archive extraction (`util/archive.ts`) enumerates zip entries via
  `unzip -Z1` (POSIX) or `System.IO.Compression.ZipFile` (Windows) and
  refuses absolute paths, `..` segments, and any entry that normalizes
  outside `destDir`.

### Subprocess hardening
- MCP local subprocess spawn scrubs dynamic-loader and interpreter
  environment variables (`LD_PRELOAD`, `LD_LIBRARY_PATH`, `LD_AUDIT`,
  `DYLD_INSERT_LIBRARIES`, `DYLD_LIBRARY_PATH`, `DYLD_FRAMEWORK_PATH`,
  `DYLD_FALLBACK_LIBRARY_PATH`, `DYLD_FALLBACK_FRAMEWORK_PATH`,
  `NODE_OPTIONS`, `PYTHONSTARTUP`, `PYTHONPATH`, `PERL5OPT`, `PERL5LIB`,
  `RUBYOPT`, `RUBYLIB`) from the inherited environment. The MCP config can
  still set them explicitly, but they are never silently inherited.
- MCP remote URLs are validated to be HTTPS (or `http://localhost`) before
  the transport is constructed, closing the cleartext-exfil vector via a
  poisoned config.

### Local server
- The CLI's local HTTP server (used by `kolbo serve`, `acp`, `web`, and the
  TUI's headless mode) refuses to bind to any non-loopback interface
  (including `0.0.0.0` and via `--mdns`) unless `KOLBO_SERVER_PASSWORD` is
  set. It throws at startup otherwise.

### Logging
- Common secret patterns (GitHub tokens, OpenAI/Anthropic `sk-` keys, AWS
  access key IDs, Google API keys, Slack tokens, JWTs, `Authorization`
  headers, env-style password assignments, PEM private key blocks, Kolbo API
  keys) are redacted from log lines and from the persisted `bash` tool
  preview/metadata before being written to disk. The raw command output is
  still returned to the LLM so legitimate workflows that emit credentials
  (e.g. `aws sts get-caller-identity`) keep working.

### Tests
- Regression tests for the redaction patterns and the SSRF private-IP
  blocklist live in `packages/opencode/test/util/redact.test.ts` and
  `packages/opencode/test/util/safe-url.test.ts`. Please make sure any fix
  you propose is accompanied by a test that pins the behavior.

---

## Known limitations (roadmap)

These are honest gaps. They are not vulnerabilities we are unaware of —
they are tracked work that requires server coordination, native dependencies,
or release-process changes:

1. **CLI tokens are stored as a file, not in an OS keystore.** Migration to
   Apple Keychain / Windows Credential Manager / libsecret is on the roadmap.
2. **The OAuth device-code flow does not use PKCE.** Tokens currently never
   expire. This is a server-side change coordinated with `kolbo-api`.
3. **The `curl | bash` install script is not signed.** Use the npm or
   package-manager install paths if you need supply-chain integrity.
   Signed install scripts are on the roadmap.
4. **LSP server binaries are downloaded without signature pinning.** They
   are fetched over HTTPS from upstream registries (npm, GitHub releases),
   but we do not maintain a SHA256 manifest.
5. **No third-party penetration test, no SOC 2, no ISO 27001.** Enterprise
   customers with specific certification requirements should contact us
   before deploying at scale.
6. **Plugins run unsandboxed.** A compromised npm plugin you install has the
   same powers as the CLI itself. Same risk model as VS Code extensions.

---

## Reporting a Security Issue

We appreciate responsible disclosure and will acknowledge your contributions.

**Preferred channel:** [GitHub Security Advisories](https://github.com/Zoharvan12/kolbo-cli/security/advisories/new)
on the `Zoharvan12/kolbo-cli` repository. This creates a private advisory that
only the maintainers can see.

**Email:** If you cannot use the GitHub flow, send the report to
`support@kolbo.ai` with `[security report]` in the subject line. Please include:

- A clear description of the issue and its impact
- A minimal reproduction (commands, file paths, line references)
- The affected version (`kolbo --version`) and platform
- Your suggested fix, if any

**What happens next:**
1. We will acknowledge receipt within **5 business days**.
2. We will keep you updated on triage progress as we investigate.
3. If we accept the report, we will work with you on a fix and a coordinated
   disclosure timeline (typically **90 days** from acknowledgement, shortened
   for critical issues).
4. We will credit you in the security advisory and the changelog unless you
   ask us not to.

**Please do not:**
- Publicly disclose the issue before the coordinated date.
- Test against production Kolbo.AI infrastructure that you are not authorized
  to access.
- Exfiltrate or modify data belonging to other users.

### Escalation

If you have not received acknowledgement within **5 business days** of your
initial report via the GitHub advisory flow, please follow up by email at
`support@kolbo.ai` referencing the advisory ID.
