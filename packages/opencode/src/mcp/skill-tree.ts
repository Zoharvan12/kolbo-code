import fs from "fs"
import os from "os"
import path from "path"
// @ts-ignore — Bun text-import attribute syntax
import SKILL from "../../skills/kolbo/SKILL.md" with { type: "text" }

const MARKERS = [
  "Routing Index — Read These Files on Demand",
  "Step 0 — Bootstrap",
  "Rate Limiting & Batch Generation",
  "Runaway-Loop Guard",
] as const

for (const marker of MARKERS) {
  if (SKILL.includes(marker)) continue
  throw new Error(`Kolbo skill is missing required marker: ${marker}`)
}

function source() {
  const bin = path.dirname(process.execPath)
  return [
    path.join(import.meta.dirname, "../../skills/kolbo"),
    path.join(import.meta.dirname, "../skills/kolbo"),
    path.join(bin, "..", "skills", "kolbo"),
    path.join(bin, "skills", "kolbo"),
    path.join(bin, "..", "Resources", "skills", "kolbo"),
  ].find((dir) =>
    [
      "SKILL.md",
      path.join("references", "models", "prompt-copilot.md"),
      path.join("references", "workflows", "filmmaking.md"),
    ].every((file) => fs.existsSync(path.join(dir, file))),
  )
}

function write(target: string, data: Buffer) {
  try {
    if (fs.readFileSync(target).equals(data)) return
  } catch {}
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, data)
}

function copy(src: string, dest: string) {
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name)
    const target = path.join(dest, entry.name)
    if (entry.isDirectory()) {
      copy(from, target)
      continue
    }
    if (entry.isFile()) write(target, fs.readFileSync(from))
  }
}

export function syncKolboSkillTree(dests?: string[]) {
  const src = source()
  const targets = dests ?? [
    path.join(path.dirname(process.execPath), "..", "skills", "kolbo"),
    path.join(os.homedir(), ".kolbo", "skills", "kolbo"),
  ]
  for (const dest of targets) {
    try {
      if (src && path.resolve(src) !== path.resolve(dest)) {
        copy(src, dest)
        continue
      }
      write(path.join(dest, "SKILL.md"), Buffer.from(SKILL))
    } catch {}
  }
  return { source: src }
}

export { SKILL as KOLBO_SKILL_MD_BUNDLED }
