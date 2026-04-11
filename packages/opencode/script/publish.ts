#!/usr/bin/env bun
/**
 * Kolbo CLI publish script — npm only.
 *
 * Expects `bun run script/build.ts` to have been run first, producing
 * platform binary packages under ./dist/@kolbo-cli/kolbo-<os>-<arch>/.
 *
 * Creates a wrapper package at ./dist/@kolbo-cli/kolbo/ that declares every
 * platform binary as an optionalDependency. When a user runs
 * `npm i -g @kolbo-cli/kolbo`, npm only installs the binary package that
 * matches their OS/CPU; the bin/kolbo launcher finds and execs it.
 *
 * Publishes everything to the npm registry under the @kolbo-cli scope.
 */

import { $ } from "bun"
import pkg from "../package.json"
import { Script } from "@opencode-ai/script"
import { fileURLToPath } from "url"

const dir = fileURLToPath(new URL("..", import.meta.url))
process.chdir(dir)

const WRAPPER_NAME = "@kolbo/kolbo-code"
const WRAPPER_BIN = "kolbo"

// 1. Discover platform binary packages produced by build.ts
const binaries: Record<string, string> = {}
for (const filepath of new Bun.Glob("*/*/package.json").scanSync({ cwd: "./dist" })) {
  const data = await Bun.file(`./dist/${filepath}`).json()
  if (!data?.name || !data?.version) continue
  binaries[data.name] = data.version
}
console.log("Found platform binaries:", binaries)

if (Object.keys(binaries).length === 0) {
  console.error("No platform binary packages found under ./dist. Did you run build.ts?")
  process.exit(1)
}

const version = Object.values(binaries)[0]
console.log(`Publishing @${WRAPPER_NAME}@${version} (${Script.channel})`)

// 2. Scaffold the wrapper package at dist/@kolbo-cli/kolbo/
const wrapperDir = `./dist/${WRAPPER_NAME}`
await $`rm -rf ${wrapperDir}`
await $`mkdir -p ${wrapperDir}/bin`
await $`cp -r ./bin/${WRAPPER_BIN} ${wrapperDir}/bin/${WRAPPER_BIN}`

// Copy license if present
try {
  await Bun.file(`${wrapperDir}/LICENSE`).write(await Bun.file("../../LICENSE").text())
} catch {
  // no root LICENSE, not fatal
}

await Bun.file(`${wrapperDir}/package.json`).write(
  JSON.stringify(
    {
      name: WRAPPER_NAME,
      version,
      license: pkg.license,
      description: pkg.description,
      homepage: pkg.homepage,
      repository: pkg.repository,
      bin: { [WRAPPER_BIN]: `./bin/${WRAPPER_BIN}` },
      optionalDependencies: binaries,
      publishConfig: { access: "public" },
    },
    null,
    2,
  ),
)

// 3. Publish each platform package in parallel
const tasks = Object.entries(binaries).map(async ([name]) => {
  const scoped = name.split("/")
  const subdir = scoped.length === 2 ? `./dist/${name}` : `./dist/${name}`
  if (process.platform !== "win32") {
    await $`chmod -R 755 .`.cwd(subdir)
  }
  console.log(`→ publishing ${name}`)
  // --provenance: cryptographically binds the package to this GitHub Actions
  // run via Sigstore. Mitigates maintainer-token-theft republishing (Shai-Hulud
  // class attacks). Requires `id-token: write` in the workflow, which
  // kolbo-release.yml already sets.
  await $`npm publish --access public --provenance --tag ${Script.channel}`.cwd(subdir)
  console.log(`  published ${name}`)
})
await Promise.all(tasks)

// 4. Publish the wrapper package last so optionalDependencies resolve
console.log(`→ publishing ${WRAPPER_NAME}`)
await $`npm publish --access public --provenance --tag ${Script.channel}`.cwd(wrapperDir)
console.log(`  published ${WRAPPER_NAME}`)

console.log(`\n✅ Done. Install with: npm i -g ${WRAPPER_NAME}@${Script.channel}`)
