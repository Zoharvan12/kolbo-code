#!/usr/bin/env node
// Generate the 12 split kolbo-* skills (the public `kolbo-skills` package shape)
// from the canonical monolithic skill at packages/opencode/skills/kolbo.
//
// Canonical is the ONLY editable source for body content. Routing frontmatter
// (description triggers, argument-hint, allowed-tools) is hand-authored per skill
// in script/split-skills/frontmatter/<name>.yml — the generator preserves it.
//
//   node script/build-split-skills.mjs [--out DIR] [--check]
//
// --check exits non-zero if DIR differs from what we would generate, so CI can
// prove the published package is in sync with canonical.

import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))
const pkgRoot = path.resolve(here, "..")
const CANON = path.join(pkgRoot, "skills", "kolbo")
const CONF = path.join(here, "split-skills")

const args = process.argv.slice(2)
const check = args.includes("--check")
const outIdx = args.indexOf("--out")
const OUT = outIdx === -1 ? path.join(pkgRoot, "dist", "split-skills") : path.resolve(args[outIdx + 1])

const map = JSON.parse(fs.readFileSync(path.join(CONF, "map.json"), "utf8"))
const version = fs.readFileSync(path.join(CANON, "VERSION"), "utf8").trim()

// --- split canonical SKILL.md into `## ` sections -------------------------
const canonical = fs.readFileSync(path.join(CANON, "SKILL.md"), "utf8")
const sections = new Map()
{
  let title = null
  let buf = []
  for (const line of canonical.split(/\r?\n/)) {
    const m = /^## (.+?)\s*$/.exec(line)
    if (m) {
      if (title) sections.set(title, buf.join("\n").trimEnd())
      title = m[1]
      buf = [line]
    } else if (title) {
      buf.push(line)
    }
  }
  if (title) sections.set(title, buf.join("\n").trimEnd())
}

const section = (name) => {
  const body = sections.get(name)
  if (body === undefined) {
    throw new Error(
      `canonical SKILL.md has no section "## ${name}" — it was renamed or removed.\n` +
        `Fix script/split-skills/map.json, or restore the heading. Known headings:\n` +
        [...sections.keys()].map((k) => `  ## ${k}`).join("\n"),
    )
  }
  return body
}

const readCanon = (rel) => {
  const p = path.join(CANON, rel)
  if (!fs.existsSync(p)) throw new Error(`map.json points at a missing canonical file: ${rel}`)
  return fs.readFileSync(p, "utf8").trimEnd()
}

// Canonical reference files are standalone documents starting at `# `. Inlined
// into a skill they must sit under the skill's own H1, so push every ATX heading
// down one level (`#`→`##`) and keep the hierarchy intact. Fenced code is skipped
// so shell comments and markdown samples are never rewritten.
const demote = (md) => {
  let fence = null
  return md
    .split("\n")
    .map((line) => {
      const f = /^\s*(```+|~~~+)/.exec(line)
      if (f) {
        if (!fence) fence = f[1][0]
        else if (line.trimStart().startsWith(fence)) fence = null
        return line
      }
      if (fence) return line
      return /^#{1,5} /.test(line) ? "#" + line : line
    })
    .join("\n")
}

// --- build the tree in memory --------------------------------------------
const tree = new Map() // relative path -> contents

const stamp =
  "<!-- AUTO-GENERATED from kolbo-code packages/opencode/skills/kolbo — DO NOT EDIT.\n" +
  "     Edit the canonical skill and let .github/workflows/sync-skill-to-plugin.yml regenerate this. -->"

for (const skill of map.skills) {
  const fmPath = path.join(CONF, "frontmatter", `${skill.name}.yml`)
  if (!fs.existsSync(fmPath)) throw new Error(`missing routing frontmatter: script/split-skills/frontmatter/${skill.name}.yml`)
  const fm = fs
    .readFileSync(fmPath, "utf8")
    .trimEnd()
    .replace(/^version:.*$/m, `version: ${version}`)

  const frontmatter = `---\n${/^version:/m.test(fm) ? fm : `version: ${version}\n${fm}`}\n---`

  const body = [
    stamp,
    `# ${skill.title}`,
    ...map.sharedSections.map(section),
    ...(skill.sections ?? []).map(section),
    ...(skill.sources ?? []).map((rel) => demote(readCanon(rel))),
  ]
    .join("\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd()

  tree.set(path.join(skill.name, "SKILL.md"), `${frontmatter}\n\n${body}\n`)

  for (const rel of skill.references ?? []) {
    tree.set(path.join(skill.name, "references", path.basename(rel)), readCanon(rel) + "\n")
  }
}

tree.set("VERSION", `${version}\n`)

// The plugin manifest's skill list is derived data — emit it so a skill added or
// retired in map.json can never drift from what the marketplace advertises.
// The sync workflow splices this into .claude-plugin/marketplace.json with jq.
tree.set(
  "skills.manifest.json",
  JSON.stringify(
    {
      version,
      skills: map.skills.map((s) => ({
        name: s.name.replace(/^kolbo-/, ""),
        path: s.name,
        invoke: `/kolbo:${s.name.replace(/^kolbo-/, "")}`,
      })),
    },
    null,
    2,
  ) + "\n",
)
tree.set(
  "GENERATED.md",
  [
    "# AUTO-GENERATED — do not edit",
    "",
    `This tree is generated from kolbo-code, the single source of truth (skill v${version}).`,
    "",
    "- Canonical body content: `packages/opencode/skills/kolbo/`",
    "- Routing frontmatter: `packages/opencode/script/split-skills/frontmatter/`",
    "- Generator: `packages/opencode/script/build-split-skills.mjs`",
    "- Distribution: `.github/workflows/sync-skill-to-plugin.yml`",
    "",
    "Hand-edits here are overwritten on the next canonical push. Change canonical instead.",
    "",
  ].join("\n"),
)

// --- emit or verify -------------------------------------------------------
const retired = map.retired ?? []

if (check) {
  const stale = []
  for (const [rel, want] of tree) {
    const p = path.join(OUT, rel)
    const got = fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null
    if (got !== want) stale.push(rel + (got === null ? " (missing)" : " (differs)"))
  }
  for (const rel of listGenerated(OUT)) {
    if (!tree.has(rel)) stale.push(rel + " (orphaned)")
  }
  for (const name of retired) {
    if (fs.existsSync(path.join(OUT, name))) stale.push(name + " (retired, still published)")
  }
  if (stale.length) {
    console.error(`split skills are out of sync with canonical:\n${stale.map((s) => "  " + s).join("\n")}`)
    process.exit(1)
  }
  console.log(`split skills in sync with canonical (v${version})`)
} else {
  for (const name of [...map.skills.map((s) => s.name), ...retired]) {
    fs.rmSync(path.join(OUT, name), { recursive: true, force: true })
  }
  for (const [rel, contents] of tree) {
    const p = path.join(OUT, rel)
    fs.mkdirSync(path.dirname(p), { recursive: true })
    fs.writeFileSync(p, contents)
  }
  console.log(`generated ${map.skills.length} split skills (v${version}) → ${OUT}`)
}

// Only walks directories this generator owns, so unrelated repo files
// (README, LICENSE, .claude-plugin, setup/, scripts/) are never flagged.
function listGenerated(root) {
  const out = []
  for (const skill of map.skills) {
    const dir = path.join(root, skill.name)
    if (!fs.existsSync(dir)) continue
    for (const f of fs.readdirSync(dir, { recursive: true, withFileTypes: true })) {
      if (f.isFile()) out.push(path.relative(root, path.join(f.parentPath ?? f.path, f.name)))
    }
  }
  return out
}
