const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Kolbo API HTTP client wrapper
 *
 * Auth resolution (first match wins):
 *   1. KOLBO_API_KEY env var          — explicit key, always honored
 *   2. CLI auth store (auth.json)     — auto-shared with `kolbo auth login`
 *
 * API base resolution (mirrors CLI partner.ts):
 *   1. KOLBO_API_URL env var          — explicit override
 *   2. KOLBO_API_BASE env var         — same as CLI
 *   3. partner.json on disk           — whitelabel config
 *   4. https://api.kolbo.ai/api       — default
 */

class KolboApiError extends Error {
  constructor(message, { code, status, data } = {}) {
    super(message);
    this.name = 'KolboApiError';
    this.code = code || null;
    this.status = status || null;
    this.data = data || null;
  }
}

// ---------------------------------------------------------------------------
// Partner / whitelabel resolution (mirrors CLI's brand/partner.ts)
// ---------------------------------------------------------------------------

function readJsonSync(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (_) {
    return null;
  }
}

/**
 * Resolve the API base URL, checking the same sources as the CLI:
 *   1. KOLBO_API_URL / KOLBO_API_BASE env vars
 *   2. partner.json files (KOLBO_PARTNER_PROFILE, XDG_CONFIG_HOME, ~/.config)
 *   3. Default: https://api.kolbo.ai/api
 */
function resolveApiBase() {
  // Env vars take priority
  const fromEnv = process.env.KOLBO_API_URL || process.env.KOLBO_API_BASE;
  if (fromEnv) return fromEnv.replace(/\/$/, '');

  // Partner profile files (same order as CLI)
  const candidates = [];
  if (process.env.KOLBO_PARTNER_PROFILE) {
    candidates.push(process.env.KOLBO_PARTNER_PROFILE);
  }
  const xdgConfig = process.env.XDG_CONFIG_HOME || (
    process.platform === 'win32'
      ? path.join(os.homedir(), '.config')
      : path.join(os.homedir(), '.config')
  );
  candidates.push(path.join(xdgConfig, 'kolbo', 'partner.json'));

  for (const file of candidates) {
    const data = readJsonSync(file);
    if (data && data.apiBase) return data.apiBase.replace(/\/$/, '');
  }

  return 'https://api.kolbo.ai/api';
}

// ---------------------------------------------------------------------------
// CLI auth store reader
// ---------------------------------------------------------------------------

/**
 * XDG data dir — same logic as the `xdg-basedir` npm package the CLI uses.
 * On Windows with Git Bash / MSYS2 this resolves to ~/.local/share (matching
 * what the CLI actually writes to).
 */
function xdgDataDir() {
  if (process.env.XDG_DATA_HOME) return process.env.XDG_DATA_HOME;
  if (process.platform === 'win32') {
    // xdg-basedir on Windows: LOCALAPPDATA → ~/.local/share fallback
    return process.env.LOCALAPPDATA || path.join(os.homedir(), '.local', 'share');
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support');
  }
  return path.join(os.homedir(), '.local', 'share');
}

/**
 * Read the Kolbo Code auth store. Kolbo Code writes credentials to
 * <xdg-data>/kolbo/auth.json after device-code login.
 *
 * On Windows (Git Bash / MSYS2) xdg-basedir resolves to ~/.local/share,
 * so we check multiple candidates to be safe.
 */
function readCliAuthKey() {
  const dataDir = xdgDataDir();
  const candidates = [
    path.join(dataDir, 'kolbo', 'auth.json'),
  ];
  // Windows fallback: also check ~/.local/share if LOCALAPPDATA was primary
  if (process.platform === 'win32' && dataDir !== path.join(os.homedir(), '.local', 'share')) {
    candidates.push(path.join(os.homedir(), '.local', 'share', 'kolbo', 'auth.json'));
  }

  // Determine the API host for namespaced auth lookup
  const apiBase = process.env.KOLBO_API_URL || process.env.KOLBO_API_BASE || '';
  let apiHost = null;
  try { apiHost = new URL(apiBase).host; } catch (_) {}
  if (!apiHost) {
    // Check partner.json for the API host
    const partnerCandidates = [];
    if (process.env.KOLBO_PARTNER_PROFILE) partnerCandidates.push(process.env.KOLBO_PARTNER_PROFILE);
    const xdgCfg = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
    partnerCandidates.push(path.join(xdgCfg, 'kolbo', 'partner.json'));
    for (const f of partnerCandidates) {
      const p = readJsonSync(f);
      if (p && p.apiBase) { try { apiHost = new URL(p.apiBase).host; } catch (_) {} break; }
    }
  }
  if (!apiHost) apiHost = 'api.kolbo.ai';

  for (const file of candidates) {
    try {
      const auth = JSON.parse(fs.readFileSync(file, 'utf8'));
      // Try namespaced key first (e.g. "kolbo@api.kolbo.ai"), then bare "kolbo"
      const entry = auth[`kolbo@${apiHost}`] || auth.kolbo;
      if (!entry) continue;
      if (entry.type === 'oauth' && entry.refresh) return entry.refresh;
      if (entry.type === 'api' && entry.key) return entry.key;
    } catch (_) {
      // File doesn't exist or isn't valid JSON — try next
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Burst control
// ---------------------------------------------------------------------------
// Caps in-flight requests so multi-step tool calls (file upload + generate +
// poll status) don't fan out past the kolbo-api global rate limit. The SDK
// tier on the server is 5000 req/min per API key; 6 in-flight × typical 2s
// latency keeps us at ~180/min — plenty of headroom.
const MAX_CONCURRENT = 6;
let inFlight = 0;
const waiting = [];

function acquireSlot() {
  if (inFlight < MAX_CONCURRENT) {
    inFlight++;
    return Promise.resolve();
  }
  return new Promise((resolve) => waiting.push(resolve));
}

function releaseSlot() {
  if (waiting.length > 0) {
    waiting.shift()();
  } else {
    inFlight = Math.max(0, inFlight - 1);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Parse retry hint from a 429 response. Honors (in order):
 *   - body.retryAfter (kolbo-api shape)
 *   - Retry-After header (RFC, seconds)
 *   - RateLimit-Reset header (seconds until reset)
 * Falls back to 5s. Caps at 60s so we don't hang the tool call forever.
 */
function parseRetryAfter(response, body) {
  let seconds = null;
  if (body && typeof body.retryAfter === 'number') seconds = body.retryAfter;
  if (seconds == null) {
    const ra = response.headers.get('retry-after');
    if (ra) {
      const n = Number(ra);
      if (Number.isFinite(n)) seconds = n;
    }
  }
  if (seconds == null) {
    const reset = response.headers.get('ratelimit-reset');
    if (reset) {
      const n = Number(reset);
      if (Number.isFinite(n)) seconds = n;
    }
  }
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) seconds = 5;
  return Math.min(seconds, 60) * 1000;
}

// ---------------------------------------------------------------------------
// HTTP client
// ---------------------------------------------------------------------------

class KolboClient {
  constructor() {
    this.baseUrl = resolveApiBase();
    this._envKey = process.env.KOLBO_API_KEY || null;
    this._authStoreKey = null; // lazy-loaded
    this.apiKey = this._envKey || this._readAuthStore();

    if (!this.apiKey) {
      // No key in env OR auth store. The Kolbo Code parent process should
      // never spawn us in this state (it injects the key into env after the
      // user signs in). If this fires, the parent will catch it via the
      // [KOLBO_AUTH_MISSING] tag and surface the in-app sign-in flow.
      throw new Error(
        'Kolbo API key not found. Sign in to Kolbo to continue. [KOLBO_AUTH_MISSING]'
      );
    }
  }

  _readAuthStore() {
    this._authStoreKey = readCliAuthKey();
    return this._authStoreKey;
  }

  /**
   * On 401, re-read the CLI auth store in case the user re-authenticated
   * since the MCP server started. Returns true if a new key was found.
   */
  _tryRefreshKey() {
    if (this._envKey) {
      // Env var is set but invalid — can't override it, but try auth store
      const fresh = readCliAuthKey();
      if (fresh && fresh !== this._envKey) {
        this.apiKey = fresh;
        return true;
      }
      return false;
    }
    const fresh = readCliAuthKey();
    if (fresh && fresh !== this.apiKey) {
      this.apiKey = fresh;
      return true;
    }
    return false;
  }

  async request(method, reqPath, body = null) {
    await acquireSlot();
    try {
      const result = await this._doRequestWithRetry(method, reqPath, body);

      // On 401, try re-reading auth store and retry once
      if (result._status === 401 && this._tryRefreshKey()) {
        return this._doRequestWithRetry(method, reqPath, body);
      }
      return result;
    } finally {
      releaseSlot();
    }
  }

  async _doRequestWithRetry(method, reqPath, body = null) {
    try {
      return await this._doRequest(method, reqPath, body);
    } catch (err) {
      if (err instanceof KolboApiError && err.status === 429) {
        const delay = err.data?._kolboRetryAfterMs ?? 5000;
        await sleep(delay);
        return this._doRequest(method, reqPath, body);
      }
      throw err;
    }
  }

  async _doRequest(method, reqPath, body = null) {
    const url = `${this.baseUrl}${reqPath}`;
    const headers = {
      'X-API-Key': this.apiKey,
      'Content-Type': 'application/json'
    };
    // Stable per-app-launch identifier from the parent process (Kolbo Code
    // sets this in the MCP env when spawning us). kolbo-api tags every
    // CreditUsage record with it so the desktop UI and the get_session_usage
    // tool can aggregate spend without enumerating individual generations.
    const callerSessionId = process.env.KOLBO_CALLER_SESSION_ID;
    if (callerSessionId) {
      headers['X-Kolbo-Caller-Session-Id'] = callerSessionId;
    }
    const options = {
      method,
      headers,
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);
    let data;
    try {
      data = await response.json();
    } catch (_) {
      throw new KolboApiError(`API error: ${response.status} ${response.statusText}`, {
        status: response.status,
        data: null
      });
    }

    if (response.status === 429) {
      throw new KolboApiError('Rate limited by Kolbo API. Retrying after backoff.', {
        status: 429,
        data: { ...(data || {}), _kolboRetryAfterMs: parseRetryAfter(response, data) },
      });
    }

    if (!response.ok || data.success === false) {
      const message = data.error || data.message || `API error: ${response.status}`;
      const code = data.code || null;
      let fullMessage = code ? `${message} [${code}]` : message;
      if (response.status === 401) {
        // Tag the response so the retry logic in request() can see it AND so
        // the Kolbo Code parent process can intercept this error before the
        // agent sees it — trigger the in-app reconnect flow, refresh the key,
        // and transparently retry the tool call. Never instruct the user to
        // open a terminal: most users run Kolbo Code as a desktop / web app
        // and have no terminal context.
        data._status = 401;
        data._kolbo_auth_expired = true;
        fullMessage = `${fullMessage} [KOLBO_AUTH_EXPIRED]`;
      }
      throw new KolboApiError(fullMessage, {
        code,
        status: response.status,
        data
      });
    }

    return data;
  }

  async post(reqPath, body) {
    return this.request('POST', reqPath, body);
  }

  async get(reqPath) {
    return this.request('GET', reqPath);
  }

  async put(reqPath, body = null) {
    return this.request('PUT', reqPath, body);
  }

  async patch(reqPath, body = null) {
    return this.request('PATCH', reqPath, body);
  }

  async delete(reqPath, body = null) {
    return this.request('DELETE', reqPath, body);
  }

  async postMultipart(reqPath, formData) {
    await acquireSlot();
    try {
      const result = await this._doMultipartWithRetry(reqPath, formData);
      if (result._status === 401 && this._tryRefreshKey()) {
        return this._doMultipartWithRetry(reqPath, formData);
      }
      return result;
    } finally {
      releaseSlot();
    }
  }

  async _doMultipartWithRetry(reqPath, formData) {
    try {
      return await this._doMultipart(reqPath, formData);
    } catch (err) {
      if (err instanceof KolboApiError && err.status === 429) {
        const delay = err.data?._kolboRetryAfterMs ?? 5000;
        await sleep(delay);
        return this._doMultipart(reqPath, formData);
      }
      throw err;
    }
  }

  async _doMultipart(reqPath, formData) {
    const url = `${this.baseUrl}${reqPath}`;
    const headers = {
      'X-API-Key': this.apiKey,
      ...formData.getHeaders()
    };
    // Same caller-session header as JSON requests — see _doRequest.
    const callerSessionId = process.env.KOLBO_CALLER_SESSION_ID;
    if (callerSessionId) {
      headers['X-Kolbo-Caller-Session-Id'] = callerSessionId;
    }

    // Serialize form-data to a Buffer before passing to fetch(). Node's
    // built-in fetch (undici) can't consume legacy Node.js streams from
    // the `form-data` package, causing "fetch failed" on local file uploads.
    const body = formData.getBuffer();
    headers['Content-Length'] = String(body.length);

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body
    });

    let data;
    try {
      data = await response.json();
    } catch (_) {
      throw new KolboApiError(`API error: ${response.status} ${response.statusText}`, {
        status: response.status,
        data: null
      });
    }

    if (response.status === 429) {
      throw new KolboApiError('Rate limited by Kolbo API. Retrying after backoff.', {
        status: 429,
        data: { ...(data || {}), _kolboRetryAfterMs: parseRetryAfter(response, data) },
      });
    }

    if (!response.ok || data.success === false) {
      const message = data.error || data.message || `API error: ${response.status}`;
      const code = data.code || null;
      let fullMessage = code ? `${message} [${code}]` : message;
      if (response.status === 401) {
        // Multipart uploads: same auth-expired contract as _doRequest. The
        // Kolbo Code parent process intercepts [KOLBO_AUTH_EXPIRED] and runs
        // the in-app reconnect flow — no terminal command needed.
        data._status = 401;
        data._kolbo_auth_expired = true;
        fullMessage = `${fullMessage} [KOLBO_AUTH_EXPIRED]`;
      }
      throw new KolboApiError(fullMessage, {
        code,
        status: response.status,
        data
      });
    }

    return data;
  }
}

module.exports = KolboClient;
module.exports.KolboApiError = KolboApiError;
