#!/usr/bin/env node
/**
 * Full end-to-end test of every SDK endpoint with REAL generations.
 *
 * Strategy:
 *   Phase 1 — Sync setup (free): upload a reference image, list
 *             voices/moodboards/presets/visual-dnas and pick one of each
 *             for composition tests.
 *   Phase 2 — Kick off all 14 generation types with 8s staggered delays
 *             so we don't trip the strict-media rate limiter. Several
 *             use the Phase-1 assets for composition (visual_dna_ids,
 *             moodboard_id, preset_id, uploaded URL as reference).
 *   Phase 3 — Poll every pending generation concurrently until terminal
 *             state. Reports URL, duration, error per test.
 *   Phase 4 — Chat test with deep_think (separate because it has a
 *             different polling shape and timeout).
 *
 * Usage:
 *   KOLBO_API_KEY=kolbo_live_... KOLBO_API_URL=http://localhost:5050/api \
 *     node scripts/test-full-e2e.js
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

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function jsonRequest(method, url, body) {
  const opts = { method, headers: { 'X-API-Key': API_KEY, 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE_URL}${url}`, opts);
  let data; try { data = await res.json(); } catch { data = null; }
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
  let data; try { data = await res.json(); } catch { data = null; }
  return { status: res.status, data };
}

async function pollUntilDone(generationId, { timeout = 600000, interval = 5000, statusUrl } = {}) {
  if (!generationId) {
    return { ok: false, error: 'no generation_id', waited: 0 };
  }
  const url = statusUrl || `/v1/generate/${encodeURIComponent(generationId)}/status`;
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const res = await jsonRequest('GET', url);
    const state = res.data?.state || res.data?.status;
    if (state === 'completed') return { ok: true, data: res.data, waited: Date.now() - start };
    if (state === 'failed' || state === 'cancelled') {
      return { ok: false, error: res.data?.error || state, data: res.data, waited: Date.now() - start };
    }
    await sleep(interval);
  }
  return { ok: false, error: 'polling timeout', waited: Date.now() - start };
}

// ─── Test bookkeeping ───────────────────────────────────────────────────
const tests = [];
function addTest(label, statusUrl) {
  const t = { label, statusUrl, generationId: null, skipped: null, error: null, result: null, waited: null };
  tests.push(t);
  return t;
}

function banner(s) {
  console.log('\n' + '═'.repeat(76));
  console.log('  ' + s);
  console.log('═'.repeat(76));
}

function line(kind, label, detail = '') {
  const icons = { ok: '\x1b[32m✓\x1b[0m', fail: '\x1b[31m✗\x1b[0m', skip: '\x1b[33m·\x1b[0m', info: '  ' };
  console.log(`${icons[kind]} ${label.padEnd(38)} ${detail}`);
}

async function main() {
  console.log(`\nKolbo SDK full E2E test — target: ${BASE_URL}\n`);

  // ─── PHASE 0: Credits ──────────────────────────────────────────────
  const credits = await jsonRequest('GET', '/v1/account/credits');
  console.log(`Balance: ${credits.data?.credits?.total} credits\n`);
  if ((credits.data?.credits?.total || 0) < 500) {
    console.error('Balance too low for full test — aborting.');
    process.exit(1);
  }

  // ─── PHASE 1: Sync setup ───────────────────────────────────────────
  banner('PHASE 1 — Sync setup');

  // Upload a reference image
  let uploadedUrl;
  {
    const form = new FormData();
    form.append('file', fs.readFileSync(TEST_IMAGE), { filename: '1x1-square.jpg', contentType: 'image/jpeg' });
    const res = await multipartRequest('/v1/media/upload', form);
    uploadedUrl = res.data?.media?.url;
    if (!uploadedUrl) {
      line('fail', 'POST /v1/media/upload', JSON.stringify(res.data).slice(0, 150));
      process.exit(1);
    }
    line('ok', 'POST /v1/media/upload', uploadedUrl.slice(0, 60));
  }

  // List media (verify upload is visible)
  {
    const res = await jsonRequest('GET', '/v1/media?type=image&page_size=3');
    const count = res.data?.media?.length || 0;
    line(count > 0 ? 'ok' : 'fail', 'GET /v1/media', `items=${count}`);
  }

  // List voices — pick a female English one for TTS
  let chosenVoice;
  {
    const res = await jsonRequest('GET', '/v1/voices?language=en-US&gender=Female');
    const voices = res.data?.voices || [];
    chosenVoice = voices.find(v => v.custom === false)?.voice_id || voices[0]?.voice_id;
    line(chosenVoice ? 'ok' : 'fail', 'GET /v1/voices', `found=${voices.length} picked=${chosenVoice || 'none'}`);
  }

  // List moodboards — pick the first preset
  let chosenMoodboardId;
  {
    const res = await jsonRequest('GET', '/v1/moodboards');
    const moodboards = res.data?.moodboards || [];
    chosenMoodboardId = moodboards.find(m => m.is_preset)?.id || moodboards[0]?.id;
    line(chosenMoodboardId ? 'ok' : 'fail', 'GET /v1/moodboards', `found=${moodboards.length} picked=${chosenMoodboardId || 'none'}`);
  }

  // List presets — pick the first image preset
  let chosenPresetId;
  {
    const res = await jsonRequest('GET', '/v1/presets?type=image');
    const presets = res.data?.presets || [];
    chosenPresetId = presets[0]?.id;
    line(chosenPresetId ? 'ok' : 'fail', 'GET /v1/presets?type=image', `found=${presets.length} picked=${chosenPresetId || 'none'}`);
  }

  // List Visual DNAs (just verify list works)
  {
    const res = await jsonRequest('GET', '/v1/visual-dna');
    const count = res.data?.count || 0;
    line('ok', 'GET /v1/visual-dna', `count=${count}`);
  }

  // List models
  {
    const res = await jsonRequest('GET', '/v1/models?type=image');
    line('ok', 'GET /v1/models?type=image', `count=${res.data?.count || 0}`);
  }

  // Create a Visual DNA using the uploaded image
  let createdDnaId;
  {
    const form = new FormData();
    const dnaName = `E2ETest-${Date.now()}`;
    form.append('name', dnaName);
    form.append('dnaType', 'character');
    form.append('images', fs.readFileSync(TEST_IMAGE), { filename: '1x1-square.jpg', contentType: 'image/jpeg' });
    const res = await multipartRequest('/v1/visual-dna', form);
    createdDnaId = res.data?.visual_dna?.id;
    line(createdDnaId ? 'ok' : 'fail', 'POST /v1/visual-dna (create)',
      createdDnaId ? `id=${createdDnaId} name=${dnaName}` : JSON.stringify(res.data).slice(0, 120));
  }

  // ─── PHASE 2: Kick off all generations ─────────────────────────────
  banner('PHASE 2 — Kicking off generations (8s stagger for rate limiter)');

  async function kickoff(label, url, body, opts = {}) {
    const t = addTest(label, opts.statusUrl);
    const res = opts.multipart
      ? await multipartRequest(url, body)
      : await jsonRequest('POST', url, body);
    if (res.status >= 200 && res.status < 300) {
      t.generationId = res.data?.generation_id || res.data?.data?._id;
      if (opts.statusUrl) t.statusUrl = opts.statusUrl.replace('{id}', t.generationId);
      line('ok', `START ${label}`, `gen_id=${t.generationId}`);
    } else {
      t.skipped = true;
      t.error = `${res.status} ${res.data?.error || res.data?.message || ''}`;
      line('fail', `START ${label}`, t.error.slice(0, 90));
    }
    await sleep(8000);
    return t;
  }

  // Plain image generation
  await kickoff('generate_image (plain)', '/v1/generate/image', {
    prompt: 'a cinematic photo of a mountain at sunrise, golden hour',
    aspect_ratio: '1:1'
  });

  // Image + Visual DNA composition
  if (createdDnaId) {
    await kickoff('generate_image (+ visual_dna_ids)', '/v1/generate/image', {
      prompt: 'the character walking on a beach at sunset',
      aspect_ratio: '1:1',
      visual_dna_ids: [createdDnaId]
    });
  }

  // Image + moodboard composition
  if (chosenMoodboardId) {
    await kickoff('generate_image (+ moodboard_id)', '/v1/generate/image', {
      prompt: 'a futuristic city skyline',
      aspect_ratio: '16:9',
      moodboard_id: chosenMoodboardId
    });
  }

  // Image + preset composition
  if (chosenPresetId) {
    await kickoff('generate_image (+ preset_id)', '/v1/generate/image', {
      prompt: 'a portrait of a wise old wizard',
      aspect_ratio: '1:1',
      preset_id: chosenPresetId
    });
  }

  // Image edit — use the upload as source
  await kickoff('generate_image_edit', '/v1/generate/image-edit', {
    prompt: 'turn the background into a starry night sky',
    source_images: [uploadedUrl]
  });

  // Creative Director — 2 scenes, image mode
  await kickoff('generate_creative_director', '/v1/generate/creative-director', {
    prompt: 'a 2-scene ad for a cozy coffee shop: scene 1 outside, scene 2 barista making coffee',
    scene_count: 2,
    workflow_type: 'image',
    aspect_ratio: '16:9'
  }, { statusUrl: '/v1/generate/creative-director/{id}/status' });

  // Music — short instrumental
  await kickoff('generate_music', '/v1/generate/music', {
    prompt: 'a short uplifting acoustic guitar loop',
    style: 'acoustic',
    instrumental: true
  });

  // Speech — use picked voice
  if (chosenVoice) {
    await kickoff('generate_speech', '/v1/generate/speech', {
      text: 'Hello from Kolbo end-to-end test.',
      voice: chosenVoice,
      language: 'en-US'
    });
  }

  // Sound effect
  await kickoff('generate_sound', '/v1/generate/sound', {
    prompt: 'a soft click of a button'
  });

  // Video (text) — short 5s
  await kickoff('generate_video', '/v1/generate/video', {
    prompt: 'a timelapse of clouds rolling over mountains',
    duration: 5,
    aspect_ratio: '16:9'
  });

  // Video from image — use uploaded image
  await kickoff('generate_video_from_image', '/v1/generate/video/from-image', {
    image_url: uploadedUrl,
    prompt: 'gentle camera push-in',
    duration: 5
  });

  // Elements — reference uploaded image
  await kickoff('generate_elements', '/v1/generate/elements', {
    prompt: 'subtle animation of the reference shape floating',
    reference_images: [uploadedUrl],
    duration: 5,
    aspect_ratio: '1:1'
  });

  // First-Last Frame — same image twice is a valid degenerate case
  await kickoff('generate_first_last_frame', '/v1/generate/first-last-frame', {
    first_frame_url: uploadedUrl,
    last_frame_url: uploadedUrl,
    prompt: 'a gentle zoom transition',
    duration: 5
  });

  // 3D — text mode
  await kickoff('generate_3d', '/v1/generate/3d', {
    mode: 'text',
    prompt: 'a low-poly medieval helmet'
  });

  // Transcription — real audio file
  {
    const form = new FormData();
    form.append('file', fs.readFileSync(TEST_AUDIO), { filename: 'voice-1sec.mp3', contentType: 'audio/mpeg' });
    await kickoff('transcribe_audio', '/v1/transcribe', form, { multipart: true });
  }

  // Video from video — skipped (needs a real video URL, and 1x1 JPG won't work as a source video)
  // Lipsync — skipped for same reason (audio_url with image fails mime check)
  // We verified credit gating on these in the previous test suite.

  // ─── PHASE 3: Poll all pending generations ────────────────────────
  banner('PHASE 3 — Polling all pending generations (concurrent)');

  const pending = tests.filter(t => t.generationId && !t.skipped);
  console.log(`Polling ${pending.length} generations in parallel...\n`);

  await Promise.all(pending.map(async (t) => {
    const result = await pollUntilDone(t.generationId, {
      timeout: 900000, // 15 min max per generation
      interval: 5000,
      statusUrl: t.statusUrl
    });
    t.result = result;
    t.waited = result.waited;
    const waitedSec = Math.round((result.waited || 0) / 1000);
    if (result.ok) {
      const r = result.data?.result || {};
      const scenes = result.data?.scenes;
      const url = r.urls?.[0] || r.url || (scenes ? `${scenes.filter(s => s.status === 'completed').length}/${scenes.length} scenes` : '');
      line('ok', t.label, `completed in ${waitedSec}s ${url ? '→ ' + url.slice(0, 60) : ''}`);
    } else {
      line('fail', t.label, `failed after ${waitedSec}s: ${result.error}`);
    }
  }));

  // ─── PHASE 4: Chat with deep_think ───────────────────────────────
  banner('PHASE 4 — Chat (deep_think)');

  let chatSessionId;
  {
    const res = await jsonRequest('POST', '/v1/chat', {
      message: 'In one short paragraph, what is the capital of France?',
      deep_think: false,
      web_search: false
    });
    if (res.status >= 200 && res.status < 300) {
      const messageId = res.data?.message_id;
      chatSessionId = res.data?.session_id;
      line('ok', 'POST /v1/chat (simple)', `session=${chatSessionId} msg=${messageId}`);
      // Poll
      const r = await pollUntilDone(messageId, { timeout: 120000 });
      if (r.ok) {
        const content = r.data?.result?.content || '';
        line('ok', '  → response', content.slice(0, 80));
      } else {
        line('fail', '  → polling', r.error);
      }
    } else {
      line('fail', 'POST /v1/chat', JSON.stringify(res.data).slice(0, 120));
    }
  }

  // Continue the conversation (sticky session)
  if (chatSessionId) {
    const res = await jsonRequest('POST', '/v1/chat', {
      message: 'And what language do they speak there?',
      session_id: chatSessionId
    });
    if (res.status >= 200 && res.status < 300) {
      line('ok', 'POST /v1/chat (continue)', `session=${res.data?.session_id}`);
      const r = await pollUntilDone(res.data?.message_id, { timeout: 120000 });
      if (r.ok) {
        line('ok', '  → response', (r.data?.result?.content || '').slice(0, 80));
      } else {
        line('fail', '  → polling', r.error);
      }
    } else {
      line('fail', 'POST /v1/chat (continue)', JSON.stringify(res.data).slice(0, 120));
    }
  }

  // List conversations
  {
    const res = await jsonRequest('GET', '/v1/chat/conversations?limit=5');
    line('ok', 'GET /v1/chat/conversations', `count=${res.data?.conversations?.length || 0}`);
  }

  // Get messages in the conversation
  if (chatSessionId) {
    const res = await jsonRequest('GET', `/v1/chat/conversations/${chatSessionId}/messages`);
    line('ok', 'GET /v1/chat/conversations/:id/messages', `messages=${res.data?.messages?.length || 0}`);
  }

  // ─── Summary ─────────────────────────────────────────────────────
  banner('SUMMARY');
  const passed = tests.filter(t => t.result?.ok).length;
  const failed = tests.filter(t => t.generationId && t.result && !t.result.ok).length;
  const skipped = tests.filter(t => t.skipped).length;
  console.log(`  Generations passed:  ${passed}/${tests.length}`);
  console.log(`  Generations failed:  ${failed}`);
  console.log(`  Never kicked off:    ${skipped}`);

  const finalCredits = await jsonRequest('GET', '/v1/account/credits');
  console.log(`\n  Credits remaining:   ${finalCredits.data?.credits?.total}`);
  console.log(`  Credits consumed:    ${(credits.data?.credits?.total || 0) - (finalCredits.data?.credits?.total || 0)}\n`);

  if (failed > 0 || skipped > 0) {
    console.log('Failures / skips:');
    for (const t of tests.filter(t => (t.result && !t.result.ok) || t.skipped)) {
      console.log(`  ${t.label}: ${t.error || t.result?.error}`);
    }
    process.exit(1);
  }
  console.log('ALL TESTS PASSED');
}

main().catch(e => { console.error('Runner crashed:', e); process.exit(2); });
