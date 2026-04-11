#!/usr/bin/env bun
/**
 * Kolbo whitelabel publish script.
 *
 * For each entry in whitelabels.json, builds and publishes a tiny npm package
 * @kolbo/<id> that:
 *   1. Depends on @kolbo/kolbo-code (installs the CLI automatically)
 *   2. Runs a postinstall script that drops partner.json into the user's
 *      config directory (~/.config/kolbo/partner.json)
 *
 * Install command for end users:
 *   npm i -g @kolbo/<id>
 */

import { $ } from "bun"
import { fileURLToPath } from "url"
import pkg from "../package.json"

const dir = fileURLToPath(new URL("..", import.meta.url))
process.chdir(dir)

const whitelabels = (await Bun.file("./whitelabels.json").json()) as Array<{
  id: string
  name: string
  apiBase: string
  appBase: string
}>

const version = pkg.version
const mainPkg = "@kolbo/kolbo-code"

for (const wl of whitelabels) {
  const pkgName = `@kolbo/${wl.id}`
  const outDir = `./dist/@kolbo/${wl.id}`

  console.log(`\n→ Building ${pkgName}@${version}`)

  await $`rm -rf ${outDir}`
  await $`mkdir -p ${outDir}`

  // postinstall.js — writes partner.json to the user's config dir
  const postinstall = `#!/usr/bin/env node
const os = require("os")
const path = require("path")
const fs = require("fs")

const profile = ${JSON.stringify({ id: wl.id, name: wl.name, apiBase: wl.apiBase, appBase: wl.appBase }, null, 2)}

const xdg = process.env.XDG_CONFIG_HOME
const configDir = xdg
  ? path.join(xdg, "kolbo")
  : path.join(os.homedir(), ".config", "kolbo")

fs.mkdirSync(configDir, { recursive: true })
const dest = path.join(configDir, "partner.json")
fs.writeFileSync(dest, JSON.stringify(profile, null, 2))
console.log("✓ " + ${JSON.stringify(wl.name)} + " configured at " + dest)
`
  await Bun.file(`${outDir}/postinstall.js`).write(postinstall)

  await Bun.file(`${outDir}/package.json`).write(
    JSON.stringify(
      {
        name: pkgName,
        version,
        description: `${wl.name} — powered by Kolbo.AI`,
        license: pkg.license,
        homepage: pkg.homepage,
        repository: pkg.repository,
        publishConfig: { access: "public" },
        dependencies: {
          [mainPkg]: version,
        },
        scripts: {
          postinstall: "node postinstall.js",
        },
      },
      null,
      2,
    ),
  )

  console.log(`  publishing ${pkgName}@${version}`)
  await $`npm publish --access public --tag latest`.cwd(outDir)
  console.log(`  ✓ published ${pkgName}`)
}

console.log(`\n✅ All whitelabels published.`)
console.log(`\nInstall commands:`)
for (const wl of whitelabels) {
  console.log(`  npm i -g @kolbo/${wl.id}   # ${wl.name}`)
}
