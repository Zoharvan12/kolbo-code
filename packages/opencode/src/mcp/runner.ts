import fs from "fs"
import { createRequire } from "module"
import path from "path"
import { pathToFileURL } from "url"

const root = import.meta.dir
const state = path.join(root, "current.json")
const pkg = (dir: string) => path.join(dir, "node_modules", "@kolbo", "mcp", "package.json")
const valid = (version: unknown) => typeof version === "string" && /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)

function read() {
  try {
    const data = JSON.parse(fs.readFileSync(state, "utf8"))
    return {
      version: valid(data.version) ? data.version as string : null,
      blocked: valid(data.blocked) ? data.blocked as string : null,
    }
  } catch {
    return { version: null, blocked: null }
  }
}

function write(data: { version: string | null; blocked?: string | null }) {
  const tmp = `${state}.tmp.${process.pid}.${Math.random().toString(36).slice(2, 10)}`
  fs.writeFileSync(tmp, JSON.stringify(data), { mode: 0o600 })
  try { fs.chmodSync(tmp, 0o600) } catch {}
  fs.renameSync(tmp, state)
}

function version(dir: string) {
  try {
    const data = JSON.parse(fs.readFileSync(pkg(dir), "utf8"))
    return valid(data.version) ? data.version as string : null
  } catch {
    return null
  }
}

function current() {
  const ver = read().version
  if (!ver) return null
  const dir = path.join(root, ver)
  return version(dir) === ver ? dir : null
}

function entry(dir: string) {
  try {
    return createRequire(path.join(dir, "package.json")).resolve("@kolbo/mcp")
  } catch {
    return null
  }
}

async function latest() {
  try {
    // GitHub is the Kolbo-controlled approval gate. npm `latest` alone would
    // let a compromised publisher push code directly into every desktop.
    const res = await fetch("https://raw.githubusercontent.com/Zoharvan12/kolbo-mcp/main/package.json", {
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return null
    const data = await res.json() as { name?: unknown; version?: unknown }
    if (data.name !== "@kolbo/mcp") return null
    return valid(data.version) ? data.version as string : null
  } catch {
    return null
  }
}

async function install(ver: string) {
  const dir = path.join(root, ver)
  if (version(dir) === ver) return dir

  const tmp = path.join(root, `.install-${ver}-${process.pid}`)
  fs.rmSync(tmp, { recursive: true, force: true })
  fs.mkdirSync(tmp, { recursive: true })
  await Bun.write(path.join(tmp, "package.json"), JSON.stringify({ private: true, dependencies: { "@kolbo/mcp": ver } }))

  const env = { ...process.env, BUN_BE_BUN: "1" }
  const child = Bun.spawn([process.execPath, "install", "--production", "--ignore-scripts", "--no-progress"], {
    cwd: tmp,
    env,
    stdin: "ignore",
    stdout: "ignore",
    stderr: "ignore",
  })
  let timer: ReturnType<typeof setTimeout> | undefined
  const code = await Promise.race([
    child.exited,
    new Promise<number>((resolve) => {
      timer = setTimeout(() => {
        child.kill()
        resolve(1)
      }, 30000)
    }),
  ])
  if (timer) clearTimeout(timer)
  if (code !== 0 || version(tmp) !== ver) {
    fs.rmSync(tmp, { recursive: true, force: true })
    return null
  }

  if (fs.existsSync(dir) && version(dir) !== ver) fs.rmSync(dir, { recursive: true, force: true })
  try {
    fs.renameSync(tmp, dir)
  } catch {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
  if (version(dir) !== ver) return null
  return dir
}

async function probe(dir: string) {
  const file = entry(dir)
  if (!file) return false
  const child = Bun.spawn([process.execPath, file], {
    env: { ...process.env, BUN_BE_BUN: "1" },
    stdin: "pipe",
    stdout: "pipe",
    stderr: "ignore",
  })
  child.stdin.write(`${JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "kolbo-updater", version: "1" },
    },
  })}\n`)
  child.stdin.end()
  let timer: ReturnType<typeof setTimeout> | undefined
  const output = await Promise.race([
    new Response(child.stdout).text(),
    new Promise<null>((resolve) => {
      timer = setTimeout(() => {
        child.kill()
        resolve(null)
      }, 10000)
    }),
  ])
  if (timer) clearTimeout(timer)
  child.kill()
  if (!output) return false
  return output.split("\n").some((line) => {
    try {
      const data = JSON.parse(line)
      return data.id === 1 && typeof data.result === "object"
    } catch {
      return false
    }
  })
}

async function start(dir: string) {
  const file = entry(dir)
  if (!file) return false
  return import(pathToFileURL(file).href).then(async (mod) => {
    const main = mod.main ?? mod.default?.main ?? mod.default
    if (typeof main !== "function") return false
    await main()
    process.stdin.resume()
    await new Promise<void>((resolve) => {
      process.stdin.once("close", resolve)
      process.stdin.once("end", resolve)
    })
    process.exit(0)
  }).catch(() => false)
}

const data = read()
const old = current()
const fresh = await latest()
const next = fresh && fresh !== data.blocked ? await install(fresh).catch(() => null) : null

if (next && (!old || path.resolve(next) !== path.resolve(old))) {
  if (await probe(next).catch(() => false)) {
    write({ version: fresh })
    await start(next)
  }
  write({ version: old ? version(old) : null, blocked: fresh })
}

if (old) await start(old)

// First launch while offline, update-service outage, or a bad package: keep the
// agent usable with the MCP compiled into this Kolbo Code release.
const env = { ...process.env }
delete env.BUN_BE_BUN
const child = Bun.spawn([process.execPath, "mcp", "serve"], {
  env,
  stdin: "inherit",
  stdout: "inherit",
  stderr: "inherit",
})
process.exit(await child.exited)
