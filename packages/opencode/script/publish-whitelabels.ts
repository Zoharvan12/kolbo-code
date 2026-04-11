#!/usr/bin/env bun
/**
 * Kolbo whitelabel publish script.
 *
 * For each entry in whitelabels.json, builds and publishes a tiny npm package
 * @kolbo/<id> that:
 *   1. Depends on @kolbo/kolbo-code (installs the CLI automatically)
 *   2. Exposes a branded binary named after the whitelabel (e.g. `sapir`)
 *      that sets KOLBO_PARTNER_PROFILE and delegates to the kolbo launcher
 *   3. Bundles partner.json so no file-system writes are needed at runtime
 *
 * Install + usage:
 *   npm i -g @kolbo/sapir
 *   sapir          ← branded command, always uses Sapir config
 *   kolbo          ← still works if user wants the generic name
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
  await $`mkdir -p ${outDir}/bin`

  // partner.json bundled inside the package — no disk writes needed
  const profile = { id: wl.id, name: wl.name, apiBase: wl.apiBase, appBase: wl.appBase }
  await Bun.file(`${outDir}/partner.json`).write(JSON.stringify(profile, null, 2))

  // bin/<id> — sets KOLBO_PARTNER_PROFILE to the bundled file, then execs kolbo
  const binScript = `#!/usr/bin/env node
const path = require("path")
const { spawnSync } = require("child_process")

// Point to the partner profile bundled inside this package
process.env.KOLBO_PARTNER_PROFILE = path.join(__dirname, "..", "partner.json")

// Resolve the kolbo launcher from @kolbo/kolbo-code installed alongside
let kolboLauncher
try {
  kolboLauncher = path.join(
    path.dirname(require.resolve("@kolbo/kolbo-code/package.json")),
    "bin", "kolbo"
  )
} catch {
  console.error("Could not find @kolbo/kolbo-code. Try: npm i -g @kolbo/${wl.id}")
  process.exit(1)
}

const result = spawnSync(process.execPath, [kolboLauncher, ...process.argv.slice(2)], {
  stdio: "inherit",
  env: process.env,
})
process.exit(result.status ?? 0)
`
  await Bun.file(`${outDir}/bin/${wl.id}`).write(binScript)
  if (process.platform !== "win32") {
    await $`chmod +x ${outDir}/bin/${wl.id}`
  }

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
        bin: { [wl.id]: `./bin/${wl.id}` },
        dependencies: {
          [mainPkg]: version,
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
console.log(`\nInstall + usage:`)
for (const wl of whitelabels) {
  console.log(`  npm i -g @kolbo/${wl.id}   →   ${wl.id}`)
}
