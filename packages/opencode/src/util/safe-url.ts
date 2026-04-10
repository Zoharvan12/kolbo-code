/**
 * SSRF defenses for outbound HTTP.
 *
 * Guards against the LLM (or a prompt-injected document) telling the CLI
 * to fetch from cloud metadata endpoints, private networks, loopback, or
 * link-local addresses. Without this, webfetch can be used to exfiltrate
 * internal data or pivot into the corporate network.
 *
 * Note on DNS rebinding: Node's `fetch` re-resolves DNS per request, so a
 * malicious server could return a public IP here and a private IP on the
 * real fetch. Full mitigation requires a custom undici Agent that pins
 * the resolved address; this is a future hardening item. For now, single-
 * lookup SSRF (the common case) is blocked.
 */
import dns from "dns/promises"
import net from "net"

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map((x) => Number(x))
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) {
    return true
  }
  const [a, b] = parts
  if (a === 0) return true // "this network"
  if (a === 10) return true // RFC1918
  if (a === 127) return true // loopback
  if (a === 169 && b === 254) return true // link-local + AWS/GCP/Azure metadata (169.254.169.254)
  if (a === 172 && b >= 16 && b <= 31) return true // RFC1918
  if (a === 192 && b === 0) return true // 192.0.0.0/24, 192.0.2.0/24 reserved
  if (a === 192 && b === 168) return true // RFC1918
  if (a === 100 && b >= 64 && b <= 127) return true // CGNAT
  if (a >= 224) return true // multicast + reserved
  return false
}

function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase().replace(/%.*$/, "") // strip zone id
  if (lower === "::1" || lower === "::") return true
  if (lower.startsWith("fe80:") || lower.startsWith("fe80::")) return true // link-local
  if (/^f[cd][0-9a-f]{2}:/.test(lower)) return true // unique local
  if (lower.startsWith("ff")) return true // multicast
  // IPv4-mapped: ::ffff:a.b.c.d
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
  if (mapped) return isPrivateIPv4(mapped[1])
  // Deprecated IPv4-compatible: ::a.b.c.d
  const compat = lower.match(/^::(\d+\.\d+\.\d+\.\d+)$/)
  if (compat) return isPrivateIPv4(compat[1])
  return false
}

function isBlockedHostname(host: string): boolean {
  // Canonicalize: lowercase + strip trailing dot (FQDN form). Without this,
  // `localhost.` or `metadata.google.internal.` would slip past the exact
  // equality checks below.
  const h = host.toLowerCase().replace(/\.+$/, "")
  // Common names for local / metadata services
  if (h === "localhost") return true
  if (h.endsWith(".localhost")) return true
  if (h.endsWith(".local")) return true // mDNS
  if (h === "metadata.google.internal") return true
  if (h === "metadata") return true
  return false
}

/**
 * Validates that a URL is safe to fetch from.
 * Throws with a user-facing message if the URL resolves to a private,
 * loopback, link-local, or metadata address.
 */
export async function assertPublicUrl(urlString: string): Promise<void> {
  let url: URL
  try {
    url = new URL(urlString)
  } catch {
    throw new Error("Invalid URL")
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("URL must use http:// or https://")
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, "") // strip IPv6 brackets

  if (isBlockedHostname(hostname)) {
    throw new Error(`Refusing to fetch from internal host: ${hostname}`)
  }

  const ipVersion = net.isIP(hostname)
  let addresses: string[]
  if (ipVersion) {
    addresses = [hostname]
  } else {
    try {
      const resolved = await dns.lookup(hostname, { all: true, verbatim: true })
      addresses = resolved.map((r) => r.address)
    } catch {
      throw new Error(`Could not resolve hostname: ${hostname}`)
    }
  }

  for (const addr of addresses) {
    const v = net.isIP(addr)
    if (v === 4 && isPrivateIPv4(addr)) {
      throw new Error(`Refusing to fetch from private/internal address (${addr})`)
    }
    if (v === 6 && isPrivateIPv6(addr)) {
      throw new Error(`Refusing to fetch from private/internal address (${addr})`)
    }
  }
}
