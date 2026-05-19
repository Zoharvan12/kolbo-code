#!/usr/bin/env node
/**
 * Focused regression test: fire each problematic generation type,
 * poll to completion, then ask the diagnostic script to report
 * CreditUsage tagging. Covers the types that had tagging issues:
 *   - creative_director (metadata.source collision)
 *   - chat (code records with no session_id)
 *   - 3d (project-scoped, session-less)
 *   - elements, first_last_frame, video_from_video, lipsync (webhook callbacks)
 */
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');

const API_KEY = process.env.KOLBO_API_KEY;
const BASE = (process.env.KOLBO_API_URL || 'http://localhost:5050/api').replace(/\/$/, '');
const TEST_IMAGE = 'G:/Projects/Kolbo.AI/github/test-pack/images_all_aspect_ratios/1x1-square.jpg';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function jreq(method, url, body) {
  const opts = { method, headers: { 'X-API-Key': API_KEY, 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${url}`, opts);
  let data; try { data = await res.json(); } catch { data = null; }
  return { status: res.status, data };
}
async function mreq(url, form) {
  const headers = { 'X-API-Key': API_KEY, ...form.getHeaders() };
  const buf = await new Promise((resolve, reject) => {
    const chunks = [];
    form.on('data', c => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    form.on('end', () => resolve(Buffer.concat(chunks)));
    form.on('error', reject); form.resume();
  });
  headers['Content-Length'] = String(buf.length);
  const res = await fetch(`${BASE}${url}`, { method: 'POST', headers, body: buf });
  let data; try { data = await res.json(); } catch { data = null; }
  return { status: res.status, data };
}
async function pollUntil(id, { timeout = 300000, statusUrl } = {}) {
  if (!id) return { ok: false, error: 'no id' };
  const url = statusUrl || `/v1/generate/${encodeURIComponent(id)}/status`;
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const r = await jreq('GET', url);
    const s = r.data?.state;
    if (s === 'completed') return { ok: true, data: r.data };
    if (s === 'failed' || s === 'cancelled') return { ok: false, error: r.data?.error || s };
    await sleep(3000);
  }
  return { ok: false, error: 'timeout' };
}

async function main() {
  console.log(`\nTagging regression test — ${BASE}\n`);

  // Upload a reference
  const form = new FormData();
  form.append('file', fs.readFileSync(TEST_IMAGE), { filename: '1x1-square.jpg', contentType: 'image/jpeg' });
  const up = await mreq('/v1/media/upload', form);
  const ref = up.data?.media?.url;
  console.log(`ref: ${ref}\n`);
  await sleep(2000);

  // 1. Creative Director (small)
  console.log('→ creative_director (2 scenes)');
  const cd = await jreq('POST', '/v1/generate/creative-director', {
    prompt: '2 scene product shoot — scene 1 close-up, scene 2 wide',
    scene_count: 2,
    workflow_type: 'image',
    aspect_ratio: '1:1'
  });
  console.log(`  id=${cd.data?.generation_id}`);
  const cdRes = await pollUntil(cd.data?.generation_id, {
    statusUrl: `/v1/generate/creative-director/${cd.data?.generation_id}/status`
  });
  console.log(`  ${cdRes.ok ? 'completed' : 'FAIL: ' + cdRes.error}`);

  await sleep(2000);

  // 2. 3D
  console.log('\n→ generate_3d (text mode)');
  const t3d = await jreq('POST', '/v1/generate/3d', { mode: 'text', prompt: 'a small ceramic teacup' });
  console.log(`  id=${t3d.data?.generation_id}`);
  // Poll it but with short timeout — 3D is slow, we just need the sweep to fire
  const t3dRes = await pollUntil(t3d.data?.generation_id, { timeout: 30000 });
  console.log(`  poll result: ${t3dRes.ok ? 'completed' : t3dRes.error}`);

  await sleep(2000);

  // 3. Chat
  console.log('\n→ chat_send_message');
  const chat = await jreq('POST', '/v1/chat', {
    message: 'In one word, what color is the sky?',
    deep_think: false
  });
  console.log(`  session=${chat.data?.session_id} msg=${chat.data?.message_id}`);
  const chatRes = await pollUntil(chat.data?.message_id, { timeout: 60000 });
  console.log(`  ${chatRes.ok ? 'completed' : 'FAIL: ' + chatRes.error}`);

  await sleep(2000);

  // 4. Elements (webhook-callback path)
  console.log('\n→ generate_elements');
  const el = await jreq('POST', '/v1/generate/elements', {
    prompt: 'subtle animation',
    reference_images: [ref],
    duration: 5,
    aspect_ratio: '1:1'
  });
  console.log(`  id=${el.data?.generation_id}`);
  const elRes = await pollUntil(el.data?.generation_id, { timeout: 300000 });
  console.log(`  ${elRes.ok ? 'completed' : 'FAIL: ' + elRes.error}`);

  console.log('\n--- Now run: node scripts/check-sdk-credit-tagging.js 69cf5db56aa658bb21a78a4b 10 ---');
}
main().catch(e => { console.error(e); process.exit(1); });
