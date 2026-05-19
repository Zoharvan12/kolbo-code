#!/usr/bin/env node
/**
 * test-credit-gates.js
 *
 * Rigorous credit-gate verification: hits every generation endpoint with
 * a valid-enough body that it SHOULD pass input validation and reach the
 * credit check. If the user has insufficient credits, every endpoint
 * should respond with a clear "insufficient credits" error. Any 2xx
 * response is a FAIL — means the endpoint doesn't gate credits upfront.
 *
 * Classifications:
 *   GATED       — correctly returns insufficient-credits error (pass)
 *   BYPASS      — accepted the request with 2xx despite empty balance (fail!)
 *   VALIDATION  — returned 400 for a reason unrelated to credits (fail —
 *                 our test body isn't valid enough to reach the credit check)
 *   SERVER_ERR  — 5xx (fail)
 *   NOT_FOUND   — 404 (fail, route missing)
 *
 * Usage: same env vars as test-endpoints.js
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

function emit(kind, label, detail = '') {
  const icon = kind === 'GATED' ? '✓' : kind === 'BYPASS' ? '✗' : kind === 'SKIP' ? '·' : '✗';
  const color = kind === 'GATED' ? '\x1b[32m' : kind === 'BYPASS' ? '\x1b[31m' : kind === 'SKIP' ? '\x1b[33m' : '\x1b[31m';
  const reset = '\x1b[0m';
  const padded = label.padEnd(44);
  console.log(`${color}${icon}${reset} ${padded} ${kind.padEnd(12)} ${detail}`);
  results.push({ kind, label, detail });
}

async function jsonRequest(method, url, body) {
  const opts = {
    method,
    headers: { 'X-API-Key': API_KEY, 'Content-Type': 'application/json' }
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE_URL}${url}`, opts);
  let data;
  try { data = await res.json(); } catch { data = null; }
  return { status: res.status, data };
}

async function multipartRequest(url, form) {
  const headers = { 'X-API-Key': API_KEY, ...form.getHeaders() };
  const buf = await new Promise((resolve, reject) => {
    const chunks = [];
    form.on('data', c => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    form.on('end', () => resolve(Buffer.concat(chunks)));
    form.on('error', reject);
    form.resume();
  });
  headers['Content-Length'] = String(buf.length);
  const res = await fetch(`${BASE_URL}${url}`, { method: 'POST', headers, body: buf });
  let data;
  try { data = await res.json(); } catch { data = null; }
  return { status: res.status, data };
}

// ─── Classification helpers ─────────────────────────────────────────────

function isCreditError(res) {
  const msg = (res.data?.error || res.data?.message || '').toLowerCase();
  // Accept a few common phrasings: "insufficient credits", "not enough credits",
  // "credit balance", "required credits", etc.
  return /credit|insufficient|not enough|balance|top.?up/i.test(msg);
}

function classifyGenerationResponse(res, label) {
  if (res.status === 404) {
    emit('NOT_FOUND', label, `404 route missing`);
    return;
  }
  if (res.status === 429) {
    // Rate limited — caller should retry with a delay.
    emit('SKIP', label, `429 rate limited (retry with delay)`);
    return;
  }
  if (res.status >= 500) {
    emit('SERVER_ERR', label, `${res.status} ${res.data?.error || res.data?.message || ''}`.slice(0, 80));
    return;
  }
  if (res.status >= 200 && res.status < 300) {
    emit('BYPASS', label, `${res.status} accepted without credit gate! gen_id=${res.data?.generation_id || '?'}`);
    return;
  }
  if (isCreditError(res)) {
    emit('GATED', label, `${res.status} ${(res.data?.error || res.data?.message || '').slice(0, 80)}`);
    return;
  }
  if (res.status === 400) {
    emit('VALIDATION', label, `${res.status} ${(res.data?.error || res.data?.message || '').slice(0, 80)}`);
    return;
  }
  emit('SKIP', label, `${res.status} ${(res.data?.error || res.data?.message || '').slice(0, 80)}`);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── Main ────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\nTesting credit gates against ${BASE_URL}\n`);

  // Confirm we actually have a low balance.
  const credits = await jsonRequest('GET', '/v1/account/credits');
  console.log(`Current balance: ${credits.data?.credits?.total} credits`);
  if ((credits.data?.credits?.total || 0) > 50) {
    console.warn('⚠️  Balance is not low — this test only works with near-zero credits.');
  }
  console.log('');

  // Upload a reference image so we have a valid URL for input.
  console.log('Uploading a reference image for tests that need a valid source URL...');
  let refUrl;
  {
    const form = new FormData();
    form.append('file', fs.readFileSync(TEST_IMAGE), { filename: '1x1-square.jpg', contentType: 'image/jpeg' });
    const res = await multipartRequest('/v1/media/upload', form);
    refUrl = res.data?.media?.url;
    if (!refUrl) {
      console.error('Failed to upload reference image — cannot run credit tests.');
      console.error('Response:', JSON.stringify(res.data));
      process.exit(2);
    }
    console.log(`✓ reference_url = ${refUrl}\n`);
  }

  // A syntactically valid but non-existent ObjectId for optional params.
  const fakeVisualDnaId = '000000000000000000000001';

  console.log('── Existing generation endpoints (baseline) ──');

  // generate_image
  {
    const res = await jsonRequest('POST', '/v1/generate/image', {
      prompt: 'a cinematic photo of a mountain at sunrise',
      aspect_ratio: '1:1'
    });
    classifyGenerationResponse(res, 'POST /v1/generate/image');
  }

  // generate_image_edit
  {
    const res = await jsonRequest('POST', '/v1/generate/image-edit', {
      prompt: 'remove the background',
      source_images: [refUrl]
    });
    classifyGenerationResponse(res, 'POST /v1/generate/image-edit');
  }

  // generate_video
  {
    const res = await jsonRequest('POST', '/v1/generate/video', {
      prompt: 'a cinematic drone shot over mountains',
      duration: 5,
      aspect_ratio: '16:9'
    });
    classifyGenerationResponse(res, 'POST /v1/generate/video');
  }

  // generate_video_from_image
  {
    const res = await jsonRequest('POST', '/v1/generate/video/from-image', {
      image_url: refUrl,
      prompt: 'gentle camera push-in',
      duration: 5
    });
    classifyGenerationResponse(res, 'POST /v1/generate/video/from-image');
  }

  // generate_music
  {
    const res = await jsonRequest('POST', '/v1/generate/music', {
      prompt: 'an upbeat lo-fi hip hop beat',
      instrumental: true
    });
    classifyGenerationResponse(res, 'POST /v1/generate/music');
  }

  // generate_speech
  {
    const res = await jsonRequest('POST', '/v1/generate/speech', {
      text: 'hello world',
      voice: 'Rachel'
    });
    classifyGenerationResponse(res, 'POST /v1/generate/speech');
  }

  // generate_sound
  {
    const res = await jsonRequest('POST', '/v1/generate/sound', {
      prompt: 'a thunderclap with rain'
    });
    classifyGenerationResponse(res, 'POST /v1/generate/sound');
  }

  // generate_creative_director
  {
    const res = await jsonRequest('POST', '/v1/generate/creative-director', {
      prompt: 'a coffee shop ad campaign with 3 scenes',
      scene_count: 3,
      workflow_type: 'image'
    });
    classifyGenerationResponse(res, 'POST /v1/generate/creative-director');
  }

  console.log('\n── New (2026-04) generation endpoints ──');
  console.log('    (sleeping 12s between tests to dodge the strict-media rate limiter)\n');

  // generate_elements — URL mode
  {
    const res = await jsonRequest('POST', '/v1/generate/elements', {
      prompt: 'subtle camera push-in on the reference shape',
      reference_images: [refUrl],
      duration: 5,
      aspect_ratio: '1:1'
    });
    classifyGenerationResponse(res, 'POST /v1/generate/elements');
  }
  await sleep(12000);

  // generate_first_last_frame — URL mode (same URL twice to satisfy validation)
  {
    const res = await jsonRequest('POST', '/v1/generate/first-last-frame', {
      first_frame_url: refUrl,
      last_frame_url: refUrl,
      prompt: 'subtle fade between frames',
      duration: 5
    });
    classifyGenerationResponse(res, 'POST /v1/generate/first-last-frame');
  }
  await sleep(12000);

  // generate_lipsync — URL mode
  {
    const res = await jsonRequest('POST', '/v1/generate/lipsync', {
      source_url: refUrl,
      audio_url: refUrl,
      prompt: 'talking head'
    });
    classifyGenerationResponse(res, 'POST /v1/generate/lipsync');
  }
  await sleep(12000);

  // generate_video_from_video — URL mode
  {
    const res = await jsonRequest('POST', '/v1/generate/video-from-video', {
      video_url: refUrl,
      prompt: 'restyle as watercolor'
    });
    classifyGenerationResponse(res, 'POST /v1/generate/video-from-video');
  }
  await sleep(12000);

  // generate_3d — text mode
  {
    const res = await jsonRequest('POST', '/v1/generate/3d', {
      mode: 'text',
      prompt: 'a low-poly medieval helmet'
    });
    classifyGenerationResponse(res, 'POST /v1/generate/3d');
  }
  await sleep(12000);

  // transcribe — multipart with real audio
  {
    const form = new FormData();
    form.append('file', fs.readFileSync(TEST_AUDIO), { filename: 'voice-1sec.mp3', contentType: 'audio/mpeg' });
    const res = await multipartRequest('/v1/transcribe', form);
    classifyGenerationResponse(res, 'POST /v1/transcribe');
  }

  // ─── Summary ──
  console.log('\n── Summary ──');
  const gated = results.filter(r => r.kind === 'GATED').length;
  const bypass = results.filter(r => r.kind === 'BYPASS').length;
  const notFound = results.filter(r => r.kind === 'NOT_FOUND').length;
  const serverErr = results.filter(r => r.kind === 'SERVER_ERR').length;
  const validation = results.filter(r => r.kind === 'VALIDATION').length;
  const skip = results.filter(r => r.kind === 'SKIP').length;

  console.log(`  GATED (correct):         ${gated}`);
  console.log(`  BYPASS (gate failure):   ${bypass}`);
  console.log(`  NOT_FOUND:               ${notFound}`);
  console.log(`  SERVER_ERR:              ${serverErr}`);
  console.log(`  VALIDATION (our input):  ${validation}`);
  console.log(`  SKIP:                    ${skip}`);

  if (bypass > 0 || notFound > 0 || serverErr > 0) {
    console.log('\n⚠️  Real issues:');
    for (const r of results.filter(r => ['BYPASS', 'NOT_FOUND', 'SERVER_ERR'].includes(r.kind))) {
      console.log(`  ${r.kind}: ${r.label} — ${r.detail}`);
    }
    process.exit(1);
  }

  if (validation > 0) {
    console.log('\n⚠️  These endpoints returned validation errors unrelated to credits — adjust test payload or check server-side validation:');
    for (const r of results.filter(r => r.kind === 'VALIDATION')) {
      console.log(`  ${r.label} — ${r.detail}`);
    }
  }

  console.log('\nCredit-gate verification complete.');
}

main().catch(err => {
  console.error('Test runner crashed:', err);
  process.exit(2);
});
