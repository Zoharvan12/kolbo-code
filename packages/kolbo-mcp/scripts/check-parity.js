#!/usr/bin/env node
/**
 * check-parity.js
 *
 * Diffs the SDK routes in `kolbo-api/src/modules/sdk/index.js` against the
 * MCP tool surface in `kolbo-mcp/src/tools/*.js` and reports:
 *
 *   1. SDK routes that have NO matching MCP tool (the big ones — user-facing
 *      features exposed in the SDK but invisible through MCP).
 *   2. MCP tools calling paths the SDK no longer exposes (stale refs).
 *
 * Exits with code 1 if any mismatch is found. Run this before every release.
 *
 *   node scripts/check-parity.js
 *
 * Assumptions:
 *   - kolbo-api is at `../kolbo-api` relative to this repo (override with
 *     KOLBO_API_PATH env var if your layout differs).
 *   - The parity is not strict on method (some MCP tools call GET on a route
 *     the SDK exposes as both GET and POST). The script compares METHOD+PATH
 *     tuples and flags gaps in both directions.
 */

const fs = require('fs');
const path = require('path');

const MCP_REPO = path.resolve(__dirname, '..');
const KOLBO_API = process.env.KOLBO_API_PATH
  || path.resolve(MCP_REPO, '..', 'kolbo-api');

const SDK_INDEX = path.join(KOLBO_API, 'src', 'modules', 'sdk', 'index.js');
// Some kolbo-api routes the MCP relies on aren't mounted under the SDK
// module — they live in their own top-level modules and are mounted at the
// API root (creditUsage at /credit-usage, artifact at /v1/artifact). Without
// scanning them here, the parity check would false-positive every release.
// Add new entries when MCP tools call out to non-SDK route modules.
const EXTRA_ROUTE_SOURCES = [
  { file: path.join(KOLBO_API, 'src', 'modules', 'creditUsage', 'index.js'), mountPath: '/credit-usage' },
  { file: path.join(KOLBO_API, 'src', 'modules', 'artifact', 'routes.js'), mountPath: '/v1/artifact' },
];
const MCP_TOOLS_DIR = path.join(MCP_REPO, 'src', 'tools');

function readFileOrBail(p) {
  if (!fs.existsSync(p)) {
    console.error(`ERROR: file not found: ${p}`);
    console.error('If your repo layout differs, set KOLBO_API_PATH.');
    process.exit(2);
  }
  return fs.readFileSync(p, 'utf8');
}

// CI / standalone-checkout escape hatch: when kolbo-api isn't available on
// disk (e.g. publish workflow only checks out kolbo-mcp), there's nothing to
// diff against. Skip with a warning instead of failing — local runs and the
// prepublishOnly hook on a dev machine still enforce the parity check.
if (!fs.existsSync(SDK_INDEX)) {
  console.log('Parity check: kolbo-mcp tools vs kolbo-api SDK routes\n');
  console.log(`WARN: kolbo-api not found at ${SDK_INDEX}`);
  console.log('Skipping parity check (likely running in CI without the private kolbo-api repo).');
  console.log('Local runs will still enforce parity via prepublishOnly.');
  process.exit(0);
}

/**
 * Normalize an Express-style path to a comparable form:
 *   '/chat/conversations/:sessionId/messages' → '/v1/chat/conversations/:param/messages'
 *   '/v1/visual-dna/:id' → '/v1/visual-dna/:param'
 */
function normalizePath(p) {
  let out = p;
  // Ensure /v1 prefix
  if (!out.startsWith('/v1/') && out !== '/v1') {
    out = '/v1' + (out.startsWith('/') ? out : '/' + out);
  }
  // Strip trailing ?querystring (plain strings only — template literals handled separately)
  out = out.split('?')[0];
  // Replace Express :params with a placeholder
  out = out.replace(/:[a-zA-Z0-9_]+/g, ':param');
  // Collapse trailing slash
  if (out.length > 1 && out.endsWith('/')) out = out.slice(0, -1);
  return out;
}

/**
 * Normalize a template-literal path captured from MCP tool source:
 *   `/v1/chat/conversations${qs ? '?' + qs : ''}` → '/v1/chat/conversations'
 *   `/v1/chat/conversations/${encodeURIComponent(id)}/messages${qs ? '?'+qs : ''}`
 *     → '/v1/chat/conversations/:param/messages'
 *
 * Heuristic: ${...} blocks containing '?' or '&' are querystring appenders
 * (drop them); other ${...} blocks are path segments (replace with :param).
 */
function normalizeTemplatePath(raw) {
  let out = raw;
  // Drop ${...} blocks that look like querystring handlers
  out = out.replace(/\$\{[^}]*[?&][^}]*\}/g, '');
  // Replace remaining ${...} with :param
  out = out.replace(/\$\{[^}]*\}/g, ':param');
  // Apply standard normalization
  return normalizePath(out);
}

function parseSdkRoutes(src) {
  // Match router.METHOD('/path', ...) for POST/GET/DELETE/PUT/PATCH
  const re = /router\.(post|get|delete|put|patch)\(\s*['"`]([^'"`]+)['"`]/g;
  const routes = new Set();
  let m;
  while ((m = re.exec(src)) !== null) {
    const method = m[1].toUpperCase();
    const p = normalizePath(m[2]);
    routes.add(`${method} ${p}`);
  }
  return routes;
}

// Parse routes from a non-SDK module file and prefix each one with the path
// the module is mounted at on the API root. Express style: a module file
// declares `router.get('/by-caller-session', ...)` and is mounted via
// `app.use('/credit-usage', creditUsageRouter)` — the full external path
// then becomes `/credit-usage/by-caller-session`.
function parseExtraModuleRoutes(src, mountPath) {
  const re = /router\.(post|get|delete|put|patch)\(\s*['"`]([^'"`]+)['"`]/g;
  const routes = new Set();
  let m;
  while ((m = re.exec(src)) !== null) {
    const method = m[1].toUpperCase();
    // Glue mount path + local route, then normalize. normalizePath will
    // ensure the /v1 prefix where appropriate.
    let local = m[2];
    if (!local.startsWith('/')) local = '/' + local;
    const full = (mountPath + local).replace(/\/+/g, '/');
    routes.add(`${method} ${normalizePath(full)}`);
  }
  return routes;
}

function normalizeMethod(method) {
  const m = method.toUpperCase();
  return m === 'POSTMULTIPART' ? 'POST' : m;
}

function addCall(calls, key, filename) {
  if (!calls.has(key)) calls.set(key, new Set());
  calls.get(key).add(filename);
}

function parseMcpToolCalls() {
  // Scan every *.js file in src/tools for client.METHOD calls.
  const files = fs.readdirSync(MCP_TOOLS_DIR).filter(f => f.endsWith('.js'));
  const calls = new Map(); // key = "METHOD path", value = Set of filenames
  const loosePaths = new Map(); // key = path (method-agnostic), value = Set of filenames

  // Strict: client.METHOD(literal) — captures both method and path.
  const reTemplate = /client\.(post|get|delete|put|patch|postMultipart)\(\s*`([^`]+)`/g;
  const rePlain = /client\.(post|get|delete|put|patch|postMultipart)\(\s*(['"])([^'"]+)\2/g;

  // Loose: any string or template literal starting with /v1/ ANYWHERE in the
  // file. Catches cases where the path is assigned to a variable first
  // (e.g. `const path = '/v1/models'; client.get(path)`) or passed as an
  // option to a helper (e.g. `pollUntilDone(..., { statusUrl: '/v1/...' })`).
  const reLoosePlain = /(['"])(\/v1\/[^'"]*)\1/g;
  const reLooseTemplate = /`(\/v1\/[^`]*)`/g;

  for (const f of files) {
    const src = fs.readFileSync(path.join(MCP_TOOLS_DIR, f), 'utf8');

    // Strict pass
    let m;
    reTemplate.lastIndex = 0;
    while ((m = reTemplate.exec(src)) !== null) {
      const method = normalizeMethod(m[1]);
      const p = normalizeTemplatePath(m[2]);
      addCall(calls, `${method} ${p}`, f);
    }
    rePlain.lastIndex = 0;
    while ((m = rePlain.exec(src)) !== null) {
      const method = normalizeMethod(m[1]);
      const p = normalizePath(m[3]);
      addCall(calls, `${method} ${p}`, f);
    }

    // Loose pass
    reLoosePlain.lastIndex = 0;
    while ((m = reLoosePlain.exec(src)) !== null) {
      const p = normalizePath(m[2]);
      if (!loosePaths.has(p)) loosePaths.set(p, new Set());
      loosePaths.get(p).add(f);
    }
    reLooseTemplate.lastIndex = 0;
    while ((m = reLooseTemplate.exec(src)) !== null) {
      const p = normalizeTemplatePath(m[1]);
      if (!loosePaths.has(p)) loosePaths.set(p, new Set());
      loosePaths.get(p).add(f);
    }
  }
  return { calls, loosePaths };
}

// ────────────────────────────────────────────────────────────────────────────

console.log('Parity check: kolbo-mcp tools vs kolbo-api SDK routes\n');

const sdkSrc = readFileOrBail(SDK_INDEX);
const sdkRoutes = parseSdkRoutes(sdkSrc);

// Extra modules contribute routes for the STALE check only (so MCP calls
// into /credit-usage and /v1/artifact aren't flagged as targeting nonexistent
// endpoints) — but NOT for the GAP check, because most of those modules'
// routes are admin / internal and aren't meant to surface as MCP tools.
// Missing extra files warn but don't fatal — better to over-report stale
// MCP calls than to silently skip the whole check on a layout change.
const auxSdkRoutes = new Set();
for (const { file, mountPath } of EXTRA_ROUTE_SOURCES) {
  if (!fs.existsSync(file)) {
    console.warn(`WARN: extra route source missing, skipping: ${file}`);
    continue;
  }
  const extraSrc = fs.readFileSync(file, 'utf8');
  for (const route of parseExtraModuleRoutes(extraSrc, mountPath)) {
    auxSdkRoutes.add(route);
  }
}

const { calls: mcpCalls, loosePaths: mcpLoosePaths } = parseMcpToolCalls();

// Routes the SDK exposes but MCP never references
const missingInMcp = [];
for (const route of sdkRoutes) {
  const [, routePath] = route.split(' ', 2);
  if (!mcpCalls.has(route) && !mcpLoosePaths.has(routePath)) {
    missingInMcp.push(route);
  }
}

// Routes the MCP calls via client.METHOD but neither the core SDK module
// nor any aux module exposes (truly stale references).
const missingInSdk = [];
for (const [route, files] of mcpCalls) {
  if (!sdkRoutes.has(route) && !auxSdkRoutes.has(route)) {
    missingInSdk.push({ route, files: [...files] });
  }
}

const totalSdk = sdkRoutes.size;
const totalMcp = mcpCalls.size;
console.log(`  SDK routes in kolbo-api:           ${totalSdk}`);
console.log(`  MCP strict client.METHOD calls:    ${totalMcp}`);
console.log(`  MCP loose /v1/ path references:    ${mcpLoosePaths.size}`);
console.log('');

let failed = false;

if (missingInMcp.length > 0) {
  failed = true;
  console.log(`GAP: ${missingInMcp.length} SDK route(s) have no matching MCP tool:`);
  for (const r of missingInMcp.sort()) {
    console.log(`  - ${r}`);
  }
  console.log('  Add a matching MCP tool in src/tools/*.js. See CLAUDE.md "Adding a New Tool".');
  console.log('');
} else {
  console.log('OK: every SDK route has a matching MCP tool.');
}

if (missingInSdk.length > 0) {
  failed = true;
  console.log(`\nSTALE: ${missingInSdk.length} MCP tool call(s) target SDK routes that don't exist:`);
  for (const { route, files } of missingInSdk.sort((a, b) => a.route.localeCompare(b.route))) {
    console.log(`  - ${route}  (called from: ${files.join(', ')})`);
  }
  console.log('  The SDK route may have been renamed/removed. Update the MCP tool to match.');
  console.log('');
}

if (failed) {
  console.log('\nParity check FAILED.');
  process.exit(1);
} else {
  console.log('\nParity check passed.');
}
