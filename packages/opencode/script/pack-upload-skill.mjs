#!/usr/bin/env node
// Pack the canonical kolbo skill as a Claude.ai / Codex / ChatGPT upload zip.
//
//   node script/pack-upload-skill.mjs [--out FILE]
//
// Required zip layout (both hosts reject a flat SKILL.md at the zip root):
//
//   kolbo.zip
//   └── kolbo/
//       ├── SKILL.md
//       ├── references/
//       ├── assets/
//       └── scripts/
//
// Claude.ai caps `description` at 200 characters. Canonical keeps the long
// routing description for Claude Code; this packer rewrites ONLY the copy
// inside the zip. Extra frontmatter keys are left as-is (hosts ignore them).

import fs from "node:fs"
import path from "node:path"
import zlib from "node:zlib"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))
const CANON = path.resolve(here, "..", "skills", "kolbo")
const args = process.argv.slice(2)
const outIdx = args.indexOf("--out")
const OUT =
  outIdx === -1
    ? path.resolve(here, "..", "dist", "kolbo.zip")
    : path.resolve(args[outIdx + 1])

// Claude.ai: 200. Codex: 500. One string has to clear the tighter cap.
const UPLOAD_DESCRIPTION =
  "Generate images, video, music, speech, sound, 3D, Visual DNA and Creative Director sets via Kolbo AI. Use for filmmaking, ads, product shots. Not FFmpeg, motion graphics, or code."

if (UPLOAD_DESCRIPTION.length > 200) {
  throw new Error(
    `upload description is ${UPLOAD_DESCRIPTION.length} chars; Claude.ai max is 200`,
  )
}

const NAME = "kolbo"
const skillMd = fs.readFileSync(path.join(CANON, "SKILL.md"), "utf8")
const packedMd = withUploadDescription(skillMd, UPLOAD_DESCRIPTION)

const entries = [{ rel: `${NAME}/SKILL.md`, buf: Buffer.from(packedMd, "utf8") }]
for (const file of listFiles(CANON)) {
  const relUnix = file.replaceAll(path.sep, "/")
  if (relUnix === "SKILL.md") continue
  entries.push({
    rel: `${NAME}/${relUnix}`,
    buf: fs.readFileSync(path.join(CANON, file)),
  })
}
entries.sort((a, b) => a.rel.localeCompare(b.rel))

const CRC_TABLE = new Uint32Array(256)
for (let n = 0; n < 256; n++) {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  CRC_TABLE[n] = c >>> 0
}

fs.mkdirSync(path.dirname(OUT), { recursive: true })
fs.writeFileSync(OUT, buildZip(entries))

const kb = Math.max(1, Math.round(fs.statSync(OUT).size / 1024))
console.log(`packed ${entries.length} files (${kb} KB) → ${OUT}`)
console.log(`description ${UPLOAD_DESCRIPTION.length}/200 chars`)

function withUploadDescription(text, desc) {
  const replaced = text.replace(
    /^description:\s*\|[\s\S]*?(?=^[a-z-]+:)/m,
    `description: ${JSON.stringify(desc)}\n`,
  )
  if (replaced === text) {
    throw new Error("canonical SKILL.md description block was not found — packer cannot rewrite it")
  }
  return replaced
}

function listFiles(dir, prefix = "") {
  const out = []
  for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
    if (name.name === ".DS_Store" || name.name === "GENERATED.md") continue
    const rel = prefix ? `${prefix}/${name.name}` : name.name
    const full = path.join(dir, name.name)
    if (name.isDirectory()) out.push(...listFiles(full, rel))
    else if (name.isFile()) out.push(rel)
  }
  return out
}

// Deterministic ZIP (fixed 1980-01-01 timestamps) so CI doesn't commit a new
// binary on every run when the skill content hasn't changed.
function buildZip(files) {
  const local = []
  const central = []
  let offset = 0
  const dosTime = 0
  const dosDate = (1 << 5) | 1 // 1980-01-01

  for (const { rel, buf } of files) {
    const name = Buffer.from(rel, "utf8")
    const crc = crc32(buf)
    const compressed = zlib.deflateRawSync(buf)
    const localHeader = Buffer.alloc(30)
    localHeader.writeUInt32LE(0x04034b50, 0)
    localHeader.writeUInt16LE(20, 4)
    localHeader.writeUInt16LE(0, 6)
    localHeader.writeUInt16LE(8, 8)
    localHeader.writeUInt16LE(dosTime, 10)
    localHeader.writeUInt16LE(dosDate, 12)
    localHeader.writeUInt32LE(crc, 14)
    localHeader.writeUInt32LE(compressed.length, 18)
    localHeader.writeUInt32LE(buf.length, 22)
    localHeader.writeUInt16LE(name.length, 26)
    localHeader.writeUInt16LE(0, 28)

    const centralHeader = Buffer.alloc(46)
    centralHeader.writeUInt32LE(0x02014b50, 0)
    centralHeader.writeUInt16LE(20, 4)
    centralHeader.writeUInt16LE(20, 6)
    centralHeader.writeUInt16LE(0, 8)
    centralHeader.writeUInt16LE(8, 10)
    centralHeader.writeUInt16LE(dosTime, 12)
    centralHeader.writeUInt16LE(dosDate, 14)
    centralHeader.writeUInt32LE(crc, 16)
    centralHeader.writeUInt32LE(compressed.length, 20)
    centralHeader.writeUInt32LE(buf.length, 24)
    centralHeader.writeUInt16LE(name.length, 28)
    centralHeader.writeUInt16LE(0, 30)
    centralHeader.writeUInt16LE(0, 32)
    centralHeader.writeUInt16LE(0, 34)
    centralHeader.writeUInt16LE(0, 36)
    centralHeader.writeUInt32LE(0, 38)
    centralHeader.writeUInt32LE(offset, 42)

    local.push(localHeader, name, compressed)
    central.push(centralHeader, name)
    offset += 30 + name.length + compressed.length
  }

  const centralSize = central.reduce((n, b) => n + b.length, 0)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(0, 4)
  eocd.writeUInt16LE(0, 6)
  eocd.writeUInt16LE(files.length, 8)
  eocd.writeUInt16LE(files.length, 10)
  eocd.writeUInt32LE(centralSize, 12)
  eocd.writeUInt32LE(offset, 16)
  eocd.writeUInt16LE(0, 20)

  return Buffer.concat([...local, ...central, eocd])
}

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  }
  return (c ^ 0xffffffff) >>> 0
}
