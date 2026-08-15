import fs from "fs"
import os from "os"
import path from "path"
// @ts-ignore — Bun text-import attribute syntax
import SKILL from "../../skills/kolbo/SKILL.md" with { type: "text" }

const MANAGED_FILE = ".kolbo-managed.json"

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

function version(src?: string) {
  if (!src) return "bundled"
  try {
    return fs.readFileSync(path.join(src, "VERSION"), "utf8").trim()
  } catch {
    return "bundled"
  }
}

function replace(src: string | undefined, dest: string) {
  const parent = path.dirname(dest)
  const temp = path.join(parent, `.${path.basename(dest)}.tmp-${process.pid}-${Date.now()}`)
  fs.mkdirSync(parent, { recursive: true })
  fs.rmSync(temp, { recursive: true, force: true })
  fs.mkdirSync(temp, { recursive: true })
  try {
    if (src) copy(src, temp)
    else write(path.join(temp, "SKILL.md"), Buffer.from(SKILL))
    write(
      path.join(temp, MANAGED_FILE),
      Buffer.from(
        `${JSON.stringify({ source: "@kolbo/mcp", skill: "kolbo", version: version(src), packageVersion: "bundled" }, null, 2)}\n`,
      ),
    )
    fs.rmSync(dest, { recursive: true, force: true })
    fs.renameSync(temp, dest)
  } catch (error) {
    fs.rmSync(temp, { recursive: true, force: true })
    throw error
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
      if (src && path.resolve(src) === path.resolve(dest)) continue
      replace(src, dest)
    } catch {}
  }
  return { source: src }
}

export { MANAGED_FILE, SKILL as KOLBO_SKILL_MD_BUNDLED }
