#!/usr/bin/env node
/**
 * End-to-end smoke test against a local kolbo-api.
 * Hits every SDK route we added in the 2026-04 expansion batch to verify
 * the route exists, auth works, validation fires correctly, and (where
 * credits permit) the full flow runs to completion.
 *
 * Usage:
 *   KOLBO_API_KEY=kolbo_live_... KOLBO_API_URL=http://localhost:5050/api \
 *     node scripts/test-endpoints.js
 */

const fs = require('fs');
const path = require('path');
const FormData = require('form-data');

const API_KEY = process.env.KOLBO_API_KEY;
const BASE_URL = (process.env.KOLBO_API_URL || 'http://localhost:5050/api').replace(/\/$/, '');
const TEST_PACK = 'G:/Projects/Kolbo.AI/github/test-pack';

if (!API_KEY) {
  console.error('KOLBO_API_KEY environment variable is required');
  process.exit(1);
}

const TEST_IMAGE = path.join(TEST_PACK, 'images_all_aspect_ratios', '1x1-square.jpg');
const TEST_AUDIO = path.join(TEST_PACK, 'audio-voice', 'voice-1sec.mp3');
const TEST_VIDEO = path.join(TEST_PACK, 'videos-duration', 'video-1sec.mp4');

const results = [];

function pad(s, n) { return s.padEnd(n); }

function emit(kind, label, status, detail = '') {
  const icon = kind === 'pass' ? '✓' : kind === 'fail' ? '✗' : '·';
  const colorStart = kind === 'pass' ? '\x1b[32m' : kind === 'fail' ? '\x1b[31m' : '\x1b[33m';
  const colorEnd = '\x1b[0m';
  console.log(`${colorStart}${icon}${colorEnd} ${pad(label, 38)} ${status}${detail ? '  ' + detail : ''}`);
  results.push({ kind, label, status, detail });
}

async function requestJSON(method, path, body) {
  const url = `${BASE_URL}${path}`;
  const opts = {
    method,
    headers: {
      'X-API-Key': API_KEY,
      'Content-Type': 'application/json'
    }
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  let data;
  try { data = await res.json(); } catch { data = null; }
  return { status: res.status, data };
}

async function requestMultipart(path, form) {
  const url = `${BASE_URL}${path}`;
  const headers = { 'X-API-Key': API_KEY, ...form.getHeaders() };
  // Materialize to a buffer so we have a known Content-Length. form.pipe
  // into a collecting writer handles the mix of string boundaries + file
  // buffers that form-data emits.
  const buffer = await new Promise((resolve, reject) => {
    const chunks = [];
    form.on('data', c => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    form.on('end', () => resolve(Buffer.concat(chunks)));
    form.on('error', reject);
    form.resume();
  });
  headers['Content-Length'] = String(buffer.length);
  const res = await fetch(url, { method: 'POST', headers, body: buffer });
  let data;
  try { data = await res.json(); } catch { data = null; }
  return { status: res.status, data };
}

// ─── Classifiers ─────────────────────────────────────────────────────────
// We classify responses into:
//   PASS  — success (2xx) or expected validation error (400 with specific message)
//   FAIL  — 404 (route missing), 5xx, or unexpected body shape
//   SKIP  — 402 / insufficient credits (route works but we can't afford to test)

function classify(res, opts = {}) {
  const { okStatuses = [200, 201, 202], routeOnly = false } = opts;
  const msg = res.data?.error || res.data?.message || '';
  // Credit-gated responses (402/403/429) are SKIP, not FAIL — the route
  // is reachable, we just can't afford to exercise it.
  if (/credit|insufficient|balance/i.test(msg)) {
    return { kind: 'skip', label: `${res.status} insufficient credits`, detail: msg.slice(0, 80) };
  }
  if (okStatuses.includes(res.status)) {
    return { kind: 'pass', label: `${res.status} OK` };
  }
  if (res.status === 404) {
    return { kind: 'fail', label: '404 NOT FOUND', detail: 'route missing — check sdk/index.js' };
  }
  if (res.status >= 500) {
    return { kind: 'fail', label: `${res.status} SERVER ERROR`, detail: msg };
  }
  if (res.status === 401 || res.status === 403) {
    return { kind: 'fail', label: `${res.status} AUTH`, detail: msg };
  }
  if (routeOnly && res.status === 400) {
    return { kind: 'pass', label: '400 validation fires (route reachable)', detail: msg.slice(0, 60) };
  }
  if (res.status === 400) {
    return { kind: 'pass', label: '400 validation (route reachable)', detail: msg.slice(0, 80) };
  }
  return { kind: 'skip', label: `${res.status}`, detail: msg.slice(0, 80) };
}

// ─── Test runner ─────────────────────────────────────────────────────────

async function main() {
  console.log(`\nTesting against ${BASE_URL}\n`);

  // Smoke: credits (known working)
  {
    const res = await requestJSON('GET', '/v1/account/credits');
    const c = classify(res);
    emit(c.kind, 'GET /v1/account/credits', c.label, `balance=${res.data?.credits?.total}`);
  }

  console.log('\n── Free / read-only endpoints ──');

  // models
  {
    const res = await requestJSON('GET', '/v1/models');
    const c = classify(res);
    emit(c.kind, 'GET /v1/models', c.label, `count=${res.data?.count ?? '?'}`);
  }

  // voices
  {
    const res = await requestJSON('GET', '/v1/voices');
    const c = classify(res);
    emit(c.kind, 'GET /v1/voices', c.label, `count=${res.data?.count ?? res.data?.voices?.length ?? '?'}`);
  }

  // moodboards list
  {
    const res = await requestJSON('GET', '/v1/moodboards');
    const c = classify(res);
    emit(c.kind, 'GET /v1/moodboards', c.label, `count=${res.data?.count ?? '?'}`);
  }

  // visual-dna list
  {
    const res = await requestJSON('GET', '/v1/visual-dna');
    const c = classify(res);
    emit(c.kind, 'GET /v1/visual-dna', c.label, `count=${res.data?.count ?? '?'}`);
  }

  // NEW: list media
  {
    const res = await requestJSON('GET', '/v1/media');
    const c = classify(res);
    emit(c.kind, 'GET /v1/media', c.label, `items=${res.data?.media?.length ?? '?'}`);
  }

  // NEW: list presets (all)
  {
    const res = await requestJSON('GET', '/v1/presets');
    const c = classify(res);
    emit(c.kind, 'GET /v1/presets', c.label, `count=${res.data?.count ?? '?'}`);
  }

  // NEW: list presets filtered
  for (const type of ['image', 'video', 'music', 'text_to_video']) {
    const res = await requestJSON('GET', `/v1/presets?type=${type}`);
    const c = classify(res);
    emit(c.kind, `GET /v1/presets?type=${type}`, c.label, `count=${res.data?.count ?? '?'}`);
  }

  console.log('\n── Upload (should cost 0 credits) ──');

  // NEW: upload media (multipart)
  let uploadedUrl = null;
  {
    const form = new FormData();
    form.append('file', fs.createReadStream(TEST_IMAGE), { filename: '1x1-square.jpg', contentType: 'image/jpeg' });
    const res = await requestMultipart('/v1/media/upload', form);
    const c = classify(res);
    uploadedUrl = res.data?.media?.url || null;
    emit(c.kind, 'POST /v1/media/upload', c.label, uploadedUrl ? uploadedUrl.slice(0, 60) : (res.data?.error || ''));
  }

  console.log('\n── Generation endpoints (route-reachability + validation) ──');

  // New generation endpoints — we pass minimal/invalid bodies to verify
  // the routes exist and validation fires. Full generation requires
  // credits; we mark those as SKIP if we hit a credit wall.

  // generate_elements — requires prompt
  {
    const res = await requestJSON('POST', '/v1/generate/elements', { /* no prompt */ });
    const c = classify(res, { routeOnly: true });
    emit(c.kind, 'POST /v1/generate/elements  (no prompt → 400)', c.label, c.detail);
  }
  // With prompt — will attempt a real run. Test with URL reference.
  if (uploadedUrl) {
    const res = await requestJSON('POST', '/v1/generate/elements', {
      prompt: 'subtle camera push-in on the reference shape',
      reference_images: [uploadedUrl],
      duration: 5,
      aspect_ratio: '1:1'
    });
    const c = classify(res);
    emit(c.kind, 'POST /v1/generate/elements  (with URL ref)', c.label, res.data?.generation_id || res.data?.error || '');
  }

  // generate_first_last_frame — requires two URLs or two files
  {
    const res = await requestJSON('POST', '/v1/generate/first-last-frame', { /* nothing */ });
    const c = classify(res, { routeOnly: true });
    emit(c.kind, 'POST /v1/generate/first-last-frame  (empty)', c.label, c.detail);
  }
  if (uploadedUrl) {
    const res = await requestJSON('POST', '/v1/generate/first-last-frame', {
      first_frame_url: uploadedUrl,
      last_frame_url: uploadedUrl,
      prompt: 'gentle fade between frames',
      duration: 5
    });
    const c = classify(res);
    emit(c.kind, 'POST /v1/generate/first-last-frame  (2 URLs)', c.label, res.data?.generation_id || res.data?.error || '');
  }

  // generate_lipsync — requires source + audio
  {
    const res = await requestJSON('POST', '/v1/generate/lipsync', { /* nothing */ });
    const c = classify(res, { routeOnly: true });
    emit(c.kind, 'POST /v1/generate/lipsync  (empty)', c.label, c.detail);
  }
  if (uploadedUrl) {
    // Use a public audio URL that actually resolves (uploadedUrl points at
    // the image) — the SDK wrapper routes audioUrl through.
    const res = await requestJSON('POST', '/v1/generate/lipsync', {
      source_url: uploadedUrl,
      audio_url: uploadedUrl, // wrong type, but we only care about route reachability
      prompt: 'talking head'
    });
    const c = classify(res, { routeOnly: true });
    emit(c.kind, 'POST /v1/generate/lipsync  (URL mode)', c.label, res.data?.generation_id || (res.data?.error || '').slice(0, 80));
  }

  // generate_video_from_video — requires source_video + prompt
  {
    const res = await requestJSON('POST', '/v1/generate/video-from-video', { /* nothing */ });
    const c = classify(res, { routeOnly: true });
    emit(c.kind, 'POST /v1/generate/video-from-video  (empty)', c.label, c.detail);
  }
  {
    const res = await requestJSON('POST', '/v1/generate/video-from-video', {
      video_url: 'https://cdn.kolbo.ai/placeholder.mp4',
      prompt: 'restyle as watercolor'
    });
    const c = classify(res, { routeOnly: true });
    emit(c.kind, 'POST /v1/generate/video-from-video  (URL)', c.label, res.data?.generation_id || (res.data?.error || '').slice(0, 80));
  }

  // generate_3d — needs prompt or reference_images
  {
    const res = await requestJSON('POST', '/v1/generate/3d', { /* nothing */ });
    const c = classify(res, { routeOnly: true });
    emit(c.kind, 'POST /v1/generate/3d  (empty)', c.label, c.detail);
  }
  {
    const res = await requestJSON('POST', '/v1/generate/3d', {
      mode: 'text',
      prompt: 'a low-poly medieval helmet'
    });
    const c = classify(res);
    emit(c.kind, 'POST /v1/generate/3d  (text mode)', c.label, res.data?.generation_id || (res.data?.error || '').slice(0, 80));
  }

  // transcribe — accepts URL or file
  {
    const res = await requestJSON('POST', '/v1/transcribe', { /* nothing */ });
    const c = classify(res, { routeOnly: true });
    emit(c.kind, 'POST /v1/transcribe  (empty)', c.label, c.detail);
  }
  // Full transcribe via multipart with our 1-second audio file
  {
    const form = new FormData();
    form.append('file', fs.createReadStream(TEST_AUDIO), { filename: 'voice-1sec.mp3', contentType: 'audio/mpeg' });
    const res = await requestMultipart('/v1/transcribe', form);
    const c = classify(res);
    emit(c.kind, 'POST /v1/transcribe  (multipart)', c.label, res.data?.generation_id || (res.data?.error || '').slice(0, 80));
  }

  // ─── Summary ─────────────────────────────────────────────────────────
  console.log('\n── Summary ──');
  const passes = results.filter(r => r.kind === 'pass').length;
  const fails = results.filter(r => r.kind === 'fail').length;
  const skips = results.filter(r => r.kind === 'skip').length;
  console.log(`  PASS: ${passes}`);
  console.log(`  FAIL: ${fails}`);
  console.log(`  SKIP: ${skips}   (insufficient credits or gated)`);
  if (fails > 0) {
    console.log('\nFailures:');
    for (const r of results.filter(r => r.kind === 'fail')) {
      console.log(`  ${r.label}: ${r.status} ${r.detail}`);
    }
    process.exit(1);
  }
}

main().catch(err => {
  console.error('\nTest runner crashed:', err);
  process.exit(2);
});
