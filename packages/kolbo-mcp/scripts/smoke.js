#!/usr/bin/env node
/**
 * smoke.js — simulate a real `npx -y @kolbo/mcp` install and boot the server.
 *
 * Why this is painful instead of `require('../src/index.js')`:
 *   The dev node_modules is pinned by the lockfile, so it hides exactly the
 *   bug class we were burned by in 1.2.0 — the SDK dep was declared with
 *   `^1.26.0`, locally resolved to 1.26.0, smoke passed, but `npx` resolved
 *   to 1.29.0 on users' machines and exploded on `server.tool()` because
 *   the schema shape had been broken by an SDK bump. Dev was fine, prod was
 *   dead. The only test that catches that is a FRESH install.
 *
 * What this does:
 *   1. `npm pack` — build the exact tarball that would be published.
 *   2. Extract it into a temp dir.
 *   3. `npm install --omit=dev` in that temp dir — fresh resolution, no
 *      lockfile, no dev deps. This is what `npx` does under the hood.
 *   4. Boot the server with a dummy key + stdin closed, wait for it to
 *      either fail (bad) or start blocking on stdin (good — registration
 *      succeeded and it's now waiting for the MCP transport).
 *   5. Kill it, clean up, report.
 *
 * Runs as `prepublishOnly`, so a broken install CANNOT ship.
 */

const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PKG_ROOT = path.resolve(__dirname, '..');
const BOOT_WAIT_MS = 4000; // how long to wait for the server to prove it's alive

function sh(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32', ...opts });
  if (res.status !== 0) {
    const out = (res.stdout || '').toString();
    const err = (res.stderr || '').toString();
    throw new Error(`${cmd} ${args.join(' ')} failed (exit ${res.status})\nstdout:\n${out}\nstderr:\n${err}`);
  }
  return (res.stdout || '').toString();
}

function rmrf(p) {
  try { fs.rmSync(p, { recursive: true, force: true }); } catch (_) {}
}

async function main() {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kolbo-mcp-smoke-'));
  const installDir = path.join(tmpRoot, 'install');
  fs.mkdirSync(installDir, { recursive: true });

  try {
    // 1. Pack the current source into a tarball in tmpRoot.
    console.log('[smoke] packing tarball...');
    const packOut = sh('npm', ['pack', '--pack-destination', tmpRoot], { cwd: PKG_ROOT });
    // npm pack prints the filename on the last non-empty line of stdout.
    const tarballName = packOut.trim().split('\n').map(l => l.trim()).filter(Boolean).pop();
    const tarballPath = path.join(tmpRoot, tarballName);
    if (!fs.existsSync(tarballPath)) {
      throw new Error(`npm pack produced "${tarballName}" but no file at ${tarballPath}`);
    }

    // 2. Install that tarball into an empty dir — fresh resolution, no lockfile.
    //    This is the same resolution path `npx -y @kolbo/mcp` takes.
    console.log('[smoke] installing into fresh temp dir (this is the real test)...');
    fs.writeFileSync(path.join(installDir, 'package.json'), JSON.stringify({ name: 'kolbo-mcp-smoke-probe', version: '0.0.0', private: true }, null, 2));
    sh('npm', ['install', '--omit=dev', '--no-audit', '--no-fund', '--loglevel=error', tarballPath], { cwd: installDir });

    // 3. Boot the freshly-installed server and verify registration succeeds.
    //    We can't do a full handshake without an MCP client, but we CAN
    //    verify that the process doesn't die during tool registration (which
    //    is what broke 1.2.0). Strategy: spawn, wait BOOT_WAIT_MS, check it's
    //    still alive and hasn't printed "Failed to start".
    const entry = path.join(installDir, 'node_modules', '@kolbo', 'mcp', 'src', 'index.js');
    if (!fs.existsSync(entry)) {
      throw new Error(`Installed package is missing expected entry: ${entry}`);
    }
    console.log('[smoke] booting server (pid will be killed after ~4s)...');
    const child = spawn(process.execPath, [entry], {
      cwd: installDir,
      env: { ...process.env, KOLBO_API_KEY: 'dummy_smoke_test' },
      stdio: ['pipe', 'pipe', 'pipe']
    });
    let stderr = '';
    let stdout = '';
    child.stderr.on('data', d => { stderr += d.toString(); });
    child.stdout.on('data', d => { stdout += d.toString(); });

    const exited = new Promise(resolve => child.once('exit', code => resolve(code)));
    const timer = new Promise(resolve => setTimeout(() => resolve('timeout'), BOOT_WAIT_MS));
    const outcome = await Promise.race([exited, timer]);

    if (outcome !== 'timeout') {
      // Process exited before we killed it — that's a bug (it should be
      // blocking on stdio waiting for MCP JSON-RPC frames).
      throw new Error(`server exited on its own with code ${outcome}.\nstderr:\n${stderr}\nstdout:\n${stdout}`);
    }
    // Still alive → registration succeeded → we're good. Kill it.
    child.kill('SIGTERM');
    await exited.catch(() => {});

    if (/Failed to start/i.test(stderr)) {
      throw new Error(`server printed a startup error:\n${stderr}`);
    }

    console.log('[smoke] OK — fresh install boots cleanly, all tools registered.');
  } finally {
    rmrf(tmpRoot);
  }
}

main().catch(err => {
  console.error('[smoke] FAILED:', err.message || err);
  process.exit(1);
});
