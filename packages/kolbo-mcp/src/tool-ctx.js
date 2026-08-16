const { AsyncLocalStorage } = require("async_hooks")
const { finish } = require("./operation")

const store = new AsyncLocalStorage()

function run(ctx, fn) {
  return store.run(ctx, fn)
}

function current() {
  return store.getStore()
}

function extra() {
  return current()?.extra
}

function reply(result, payload, phase) {
  const ctx = current() || {}
  return finish(ctx.name, ctx.args, result, payload, phase)
}

function wrap(server) {
  const orig = server.tool.bind(server)
  server.tool = (name, description, schema, handler) => {
    if (typeof handler !== "function") return orig(name, description, schema, handler)
    return orig(name, description, schema, async (args, extraArg) => {
      return run({ name, args, extra: extraArg }, () => handler(args, extraArg))
    })
  }
}

module.exports = { run, current, extra, reply, wrap }
