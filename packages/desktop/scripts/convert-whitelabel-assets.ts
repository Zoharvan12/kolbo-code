#!/usr/bin/env bun
/**
 * Converts source splash images for a whitelabel into the required asset formats:
 *   - NSIS sidebar BMP  (164×314 px) → src-tauri/assets/{slug}-nsis-sidebar.bmp
 *   - NSIS header BMP   (150×57  px) → src-tauri/assets/{slug}-nsis-header.bmp
 *   - Loading screen    (copy)        → ../../app/public/whitelabels/{slug}/splash.jpg
 *
 * Usage:
 *   bun run scripts/convert-whitelabel-assets.ts <slug> \
 *     --vertical /path/to/vertical.jpeg \
 *     --wide     /path/to/wide.jpeg
 *
 * Example (Sapir):
 *   bun run scripts/convert-whitelabel-assets.ts sapir \
 *     --vertical "C:/Users/Zohar/Downloads/vertical.jpeg" \
 *     --wide     "C:/Users/Zohar/Downloads/wide.jpeg"
 */

import { parseArgs } from "node:util"
import { existsSync, mkdirSync, copyFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import sharp from "sharp"

const { positionals, values } = parseArgs({
  args: Bun.argv.slice(2),
  allowPositionals: true,
  options: {
    vertical: { type: "string" },
    wide: { type: "string" },
  },
})

const slug = positionals[0]
if (!slug) {
  console.error("Usage: convert-whitelabel-assets.ts <slug> --vertical <path> --wide <path>")
  process.exit(1)
}

const verticalPath = values.vertical
const widePath = values.wide

if (!verticalPath || !widePath) {
  console.error("Both --vertical and --wide image paths are required")
  process.exit(1)
}

for (const p of [verticalPath, widePath]) {
  if (!existsSync(p)) {
    console.error(`File not found: ${p}`)
    process.exit(1)
  }
}

/** Write a 24-bit uncompressed BMP from raw RGB pixel data (top-down order). */
function writeBmp(outPath: string, pixels: Buffer, width: number, height: number) {
  const rowSize = Math.ceil((width * 3) / 4) * 4 // rows padded to 4 bytes
  const pixelDataSize = rowSize * height
  const fileSize = 54 + pixelDataSize
  const buf = Buffer.alloc(fileSize, 0)

  // File header
  buf.write("BM", 0, "ascii")
  buf.writeUInt32LE(fileSize, 2)
  buf.writeUInt32LE(54, 10) // pixel data offset

  // DIB header (BITMAPINFOHEADER)
  buf.writeUInt32LE(40, 14)  // header size
  buf.writeInt32LE(width, 18)
  buf.writeInt32LE(height, 22) // positive = bottom-up
  buf.writeUInt16LE(1, 26)   // color planes
  buf.writeUInt16LE(24, 28)  // bits per pixel
  buf.writeUInt32LE(0, 30)   // compression (none)
  buf.writeUInt32LE(pixelDataSize, 34)
  buf.writeInt32LE(2835, 38) // x ppm (~72 DPI)
  buf.writeInt32LE(2835, 42) // y ppm

  // Pixel data: BMP stores rows bottom-up, each pixel BGR
  for (let y = 0; y < height; y++) {
    const bmpRow = height - 1 - y // BMP row index (bottom-up)
    const rowStart = 54 + bmpRow * rowSize
    for (let x = 0; x < width; x++) {
      const src = (y * width + x) * 3
      const dst = rowStart + x * 3
      buf[dst] = pixels[src + 2]!     // B
      buf[dst + 1] = pixels[src + 1]! // G
      buf[dst + 2] = pixels[src]!     // R
    }
  }

  writeFileSync(outPath, buf)
}

const root = resolve(import.meta.dir, "..")
const assetsDir = resolve(root, "src-tauri/assets")
const splashDir = resolve(root, "../app/public/whitelabels", slug)

mkdirSync(splashDir, { recursive: true })

// NSIS sidebar: 164×314 px
const sidebarOut = resolve(assetsDir, `${slug}-nsis-sidebar.bmp`)
const sidebarW = 164, sidebarH = 314
const sidebarPixels = await sharp(verticalPath)
  .resize(sidebarW, sidebarH, { fit: "cover", position: "center" })
  .removeAlpha()
  .raw()
  .toBuffer()
writeBmp(sidebarOut, sidebarPixels, sidebarW, sidebarH)
console.log(`✓ NSIS sidebar → ${sidebarOut}`)

// NSIS header: 150×57 px
const headerOut = resolve(assetsDir, `${slug}-nsis-header.bmp`)
const headerW = 150, headerH = 57
const headerPixels = await sharp(widePath)
  .resize(headerW, headerH, { fit: "cover", position: "center" })
  .removeAlpha()
  .raw()
  .toBuffer()
writeBmp(headerOut, headerPixels, headerW, headerH)
console.log(`✓ NSIS header  → ${headerOut}`)

// Loading screen splash (copy vertical image as-is)
const splashOut = resolve(splashDir, "splash.jpg")
copyFileSync(verticalPath, splashOut)
console.log(`✓ Splash image → ${splashOut}`)

console.log(`\nDone! Commit these files:`)
console.log(`  packages/desktop/src-tauri/assets/${slug}-nsis-sidebar.bmp`)
console.log(`  packages/desktop/src-tauri/assets/${slug}-nsis-header.bmp`)
console.log(`  packages/app/public/whitelabels/${slug}/splash.jpg`)
