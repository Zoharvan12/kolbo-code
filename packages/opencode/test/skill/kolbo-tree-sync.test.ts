import { afterEach, expect, test } from "bun:test"
import fs from "fs"
import os from "os"
import path from "path"
import { MANAGED_FILE, syncKolboSkillTree } from "../../src/mcp/skill-tree"

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true })
})

test("installs the complete Kolbo skill tree", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "kolbo-skill-"))
  roots.push(root)
  const dest = path.join(root, "kolbo")
  const result = syncKolboSkillTree([dest])

  expect(result.source).toBeTruthy()
  expect(fs.existsSync(path.join(dest, "SKILL.md"))).toBe(true)
  expect(fs.existsSync(path.join(dest, "references", "workflows", "filmmaking.md"))).toBe(true)
  expect(fs.existsSync(path.join(dest, "references", "models", "seedance25.md"))).toBe(true)
  expect(fs.existsSync(path.join(dest, "assets", "filmmaking", "shot-card.template.json"))).toBe(true)
  expect(fs.existsSync(path.join(dest, "scripts", "filmmaking", "lint_prompt.py"))).toBe(true)
  expect(JSON.parse(fs.readFileSync(path.join(dest, MANAGED_FILE), "utf8"))).toEqual({
    source: "@kolbo/mcp",
    skill: "kolbo",
    version: fs.readFileSync(path.join(result.source!, "VERSION"), "utf8").trim(),
    packageVersion: "bundled",
  })
})

test("repairs missing routed files in an existing install", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "kolbo-skill-"))
  roots.push(root)
  const dest = path.join(root, "kolbo")
  syncKolboSkillTree([dest])
  const target = path.join(dest, "references", "filmmaking", "blocking-continuity.md")
  fs.rmSync(target)

  syncKolboSkillTree([dest])

  expect(fs.readFileSync(target, "utf8")).toContain("Default to the full approved prior video")
})

test("removes files that no longer belong to the canonical tree", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "kolbo-skill-"))
  roots.push(root)
  const dest = path.join(root, "kolbo")
  syncKolboSkillTree([dest])
  const obsolete = path.join(dest, "obsolete-reference.md")
  fs.writeFileSync(obsolete, "old copy")

  syncKolboSkillTree([dest])

  expect(fs.existsSync(obsolete)).toBe(false)
})
