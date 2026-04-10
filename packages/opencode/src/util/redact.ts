/**
 * Redact common secret patterns from strings before persistence.
 *
 * Used to scrub tool output and log messages before they land in session
 * metadata or on-disk log files. The LLM still receives raw tool output
 * (so commands like `aws sts` keep working); redaction only applies to
 * persisted / transmitted copies.
 *
 * Patterns are conservative — false positives should be rare. If you add a
 * new pattern, prefer specific prefixes (ghp_, AKIA, sk-) over greedy
 * "looks like a token" heuristics.
 */
const PATTERNS: Array<[RegExp, string]> = [
  // GitHub personal/OAuth/user/server/refresh tokens
  [/\bgh[pousr]_[A-Za-z0-9]{20,255}\b/g, "ghX_[REDACTED]"],
  // GitHub fine-grained PATs
  [/\bgithub_pat_[A-Za-z0-9_]{20,255}\b/g, "github_pat_[REDACTED]"],
  // OpenAI / Anthropic / generic sk- keys
  [/\bsk-[A-Za-z0-9_-]{20,}\b/g, "sk-[REDACTED]"],
  [/\bsk-ant-[A-Za-z0-9_-]{20,}\b/g, "sk-ant-[REDACTED]"],
  // Stripe live/test keys
  [/\b(pk|rk|sk)_(live|test)_[A-Za-z0-9]{20,}\b/g, "$1_$2_[REDACTED]"],
  // Slack tokens
  [/\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g, "xox_[REDACTED]"],
  // AWS access key IDs
  [/\b(AKIA|ASIA)[A-Z0-9]{16}\b/g, "$1[REDACTED]"],
  // Google API keys
  [/\bAIza[A-Za-z0-9_-]{35}\b/g, "AIza[REDACTED]"],
  // JWT (three base64url segments)
  [/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "eyJ[REDACTED-JWT]"],
  // Authorization headers
  [/(Authorization\s*:\s*Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, "$1[REDACTED]"],
  [/(Authorization\s*:\s*Basic\s+)[A-Za-z0-9+/=]+/gi, "$1[REDACTED]"],
  // env-style assignments: API_KEY=..., password: "...", token=...
  [
    /((?:api[_-]?key|apikey|secret|password|passwd|token|access[_-]?token|auth[_-]?token|client[_-]?secret)\s*[:=]\s*["']?)([A-Za-z0-9._~+/=-]{12,})(["']?)/gi,
    "$1[REDACTED]$3",
  ],
  // PEM private key blocks
  [
    /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
    "[REDACTED PRIVATE KEY]",
  ],
  // Kolbo API keys (best effort — any future prefix should be added here)
  [/\bklb[_-][A-Za-z0-9_-]{20,}\b/g, "klb_[REDACTED]"],
]

export function redactSecrets(input: string): string {
  if (!input) return input
  let out = input
  for (const [pattern, replacement] of PATTERNS) {
    out = out.replace(pattern, replacement)
  }
  return out
}
