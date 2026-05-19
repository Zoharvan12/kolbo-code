/* Shared helpers for MCP tools. No server.tool() registrations here.
 *
 * This file centralizes the URL-or-local-path → Buffer resolver used by
 * every tool that accepts file-ish arguments (visual_dna, elements,
 * first_last_frame, lipsync, video_from_video, transcription, media upload,
 * future additions). It also owns the SSRF guard applied to any URL we
 * fetch on the user's local machine.
 *
 * SSRF defense in depth:
 *   1. Only http: / https: protocols.
 *   2. Block IP literals in private / loopback / link-local / multicast /
 *      reserved ranges (IPv4 and IPv6).
 *   3. Block common internal hostnames (localhost, *.local, *.internal,
 *      metadata.google.internal, metadata.goog).
 *   4. Manual redirect following so every hop is re-validated (a crafted
 *      public URL could 302 to 169.254.169.254 — global fetch would follow
 *      silently).
 *
 * If you add a new tool that fetches URLs, import resolveToBuffer from here
 * rather than reinventing the guard.
 */

const fs = require('fs');
const path = require('path');
const net = require('net');

const MAX_FILE_BYTES = 500 * 1024 * 1024; // 500 MB — larger than visual_dna because
                                           // lipsync/v2v/transcription accept full
                                           // videos and long audio tracks.
const VISUAL_DNA_MAX_BYTES = 25 * 1024 * 1024; // kept for visual_dna backward-compat
const MAX_REDIRECTS = 5;

function isHttpUrl(s) {
  return typeof s === 'string' && /^https?:\/\//i.test(s);
}

function isPrivateIPv4(ip) {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some(p => Number.isNaN(p) || p < 0 || p > 255)) return true;
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true; // includes 169.254.169.254 cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 192 && b === 0 && parts[2] === 0) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a >= 224) return true;
  return false;
}

function isPrivateIPv6(ip) {
  const lower = ip.toLowerCase();
  if (lower === '::' || lower === '::1') return true;
  if (lower.startsWith('fe80:') || lower.startsWith('fe8') ||
      lower.startsWith('fe9') || lower.startsWith('fea') ||
      lower.startsWith('feb')) return true;
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true;
  if (lower.startsWith('ff')) return true;
  // IPv4-mapped / compat in dotted form: ::ffff:1.2.3.4 or ::1.2.3.4
  const mappedDot = lower.match(/^::(?:ffff:)?(\d+\.\d+\.\d+\.\d+)$/);
  if (mappedDot) return isPrivateIPv4(mappedDot[1]);
  // IPv4-mapped in pure hex form: ::ffff:7f00:1 (Node normalizes
  // ::ffff:127.0.0.1 → ::ffff:7f00:1). Extract last 2 hextets → 4 bytes.
  const mappedHex = lower.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (mappedHex) {
    const hi = parseInt(mappedHex[1], 16);
    const lo = parseInt(mappedHex[2], 16);
    const dotted = `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
    return isPrivateIPv4(dotted);
  }
  return false;
}

function isBlockedHostname(hostname) {
  // new URL('http://[::1]/').hostname returns "[::1]" (brackets kept).
  // Strip them so net.isIP and our private-range checks see the bare address.
  let host = hostname.toLowerCase();
  if (host.startsWith('[') && host.endsWith(']')) host = host.slice(1, -1);
  const blockedNames = new Set([
    'localhost',
    'ip6-localhost',
    'ip6-loopback',
    'metadata.google.internal',
    'metadata.goog'
  ]);
  if (blockedNames.has(host)) return true;
  if (host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.localhost')) return true;
  const ipFamily = net.isIP(host);
  if (ipFamily === 4 && isPrivateIPv4(host)) return true;
  if (ipFamily === 6 && isPrivateIPv6(host)) return true;
  return false;
}

function assertSafeUrl(rawUrl) {
  let u;
  try { u = new URL(rawUrl); }
  catch (_) { throw new Error(`Invalid URL: ${rawUrl}`); }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new Error(`Unsupported URL protocol "${u.protocol}" — only http/https allowed`);
  }
  if (isBlockedHostname(u.hostname)) {
    throw new Error(`Refusing to fetch from private / loopback / metadata host: ${u.hostname}`);
  }
  return u;
}

async function safeFetch(rawUrl) {
  let current = rawUrl;
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    assertSafeUrl(current);
    const res = await fetch(current, { redirect: 'manual' });
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      const next = new URL(res.headers.get('location'), current).toString();
      current = next;
      continue;
    }
    return res;
  }
  throw new Error(`Too many redirects fetching ${rawUrl}`);
}

function guessFilename(source, fallbackExt) {
  if (isHttpUrl(source)) {
    try {
      const u = new URL(source);
      const base = path.basename(u.pathname) || `upload${fallbackExt}`;
      return base.includes('.') ? base : `${base}${fallbackExt}`;
    } catch (_) {
      return `upload${fallbackExt}`;
    }
  }
  return path.basename(source);
}

function guessContentType(filename) {
  const ext = path.extname(filename).toLowerCase();
  const map = {
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
    '.webp': 'image/webp', '.gif': 'image/gif', '.bmp': 'image/bmp',
    '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm',
    '.mkv': 'video/x-matroska', '.avi': 'video/x-msvideo',
    '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
    '.m4a': 'audio/mp4', '.flac': 'audio/flac', '.aac': 'audio/aac'
  };
  return map[ext] || 'application/octet-stream';
}

/**
 * Resolve a URL or absolute local path into an in-memory Buffer.
 *   - URLs: fetched via safeFetch (SSRF-guarded, manual redirect handling)
 *   - Local paths: read via fs.readFileSync (must be absolute)
 *
 * @param {string} source - URL or absolute local path
 * @param {'image'|'video'|'audio'} kind - hint for default filename extension
 * @param {Object} [opts]
 * @param {number} [opts.maxBytes] - override the default size cap
 * @returns {Promise<{buffer: Buffer, filename: string, contentType: string, size: number}>}
 */
async function resolveToBuffer(source, kind, opts = {}) {
  const maxBytes = opts.maxBytes || MAX_FILE_BYTES;
  const defaultExt = kind === 'image' ? '.png' : kind === 'video' ? '.mp4' : '.mp3';

  if (isHttpUrl(source)) {
    const res = await safeFetch(source);
    if (!res.ok) throw new Error(`Failed to fetch ${source}: ${res.status} ${res.statusText}`);
    const contentLen = parseInt(res.headers.get('content-length') || '0', 10);
    if (contentLen && contentLen > maxBytes) {
      throw new Error(`File at ${source} (${contentLen} bytes) exceeds ${maxBytes}-byte limit`);
    }
    const arrayBuf = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuf);
    if (buffer.length > maxBytes) {
      throw new Error(`File at ${source} (${buffer.length} bytes) exceeds ${maxBytes}-byte limit`);
    }
    const filename = guessFilename(source, defaultExt);
    return {
      buffer,
      filename,
      contentType: res.headers.get('content-type') || guessContentType(filename),
      size: buffer.length
    };
  }

  if (!path.isAbsolute(source)) {
    throw new Error(`Local file paths must be absolute: ${source}`);
  }
  const stat = fs.statSync(source);
  if (stat.size > maxBytes) {
    throw new Error(`File ${source} (${stat.size} bytes) exceeds ${maxBytes}-byte limit`);
  }
  const buffer = fs.readFileSync(source);
  const filename = path.basename(source);
  return {
    buffer,
    filename,
    contentType: guessContentType(filename),
    size: buffer.length
  };
}

/**
 * Extract real, multiplier-adjusted credit cost from a polled getStatus
 * response. kolbo-api returns `credits_used` (final number deducted) and
 * `credits_breakdown` (per-CreditUsage detail) when the generation is
 * complete. Returns `{}` when the API didn't include them so spreading
 * the result into a tool's response object is a no-op (forward-compatible
 * with old kolbo-api versions).
 *
 * Usage in every generation tool:
 *   return {
 *     content: [{ type: 'text', text: JSON.stringify({
 *       urls: result.result.urls,
 *       model: result.result.model,
 *       ...creditFields(result),   // adds credits_used + credits_breakdown
 *       _followup_hint: '...',
 *     }, null, 2) }]
 *   };
 */
function creditFields(polledResult) {
  if (!polledResult) return {};
  const out = {};
  if (typeof polledResult.credits_used === 'number') {
    out.credits_used = polledResult.credits_used;
  }
  if (Array.isArray(polledResult.credits_breakdown) && polledResult.credits_breakdown.length) {
    out.credits_breakdown = polledResult.credits_breakdown;
  }
  return out;
}

module.exports = {
  MAX_FILE_BYTES,
  VISUAL_DNA_MAX_BYTES,
  isHttpUrl,
  assertSafeUrl,
  safeFetch,
  guessFilename,
  guessContentType,
  resolveToBuffer,
  creditFields,
};
