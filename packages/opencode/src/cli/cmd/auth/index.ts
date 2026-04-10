import { cmd } from "../cmd"
import { Effect, Match } from "effect"
import { UI } from "../../ui"
import { Auth } from "@/auth"
import * as Prompt from "../../effect/prompt"

const println = (msg: string) => Effect.sync(() => UI.println(msg))

const KOLBO_PROVIDER = "kolbo"

const isValidApiKey = (key: string) => {
  return key.startsWith("kolbo_live_") || key.startsWith("kolbo_test_")
}

async function postJson(url: string, body: unknown) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  return r.json() as Promise<any>
}

const loginEffect = Effect.gen(function* () {
  yield* Prompt.intro("Kolbo.AI Login")

  yield* Prompt.log.info("Requesting device code...")

  const response: any = yield* Effect.promise(() =>
    postJson("https://api.kolbo.ai/auth/device/code", {
      client_id: "kolbo-cli",
    }),
  )

  const { user_code, device_code, verification_uri, interval, expires_in } = response

  yield* Prompt.log.info(`Go to: ${verification_uri}`)
  yield* Prompt.log.info(`Enter code: ${UI.Style.TEXT_HIGHLIGHT_BOLD}${user_code}${UI.Style.TEXT_NORMAL}`)

  const s = Prompt.spinner()
  yield* s.start("Waiting for authorization...")

  const poll = (wait: number): Effect.Effect<{ access_token: string; refresh_token: string }, Error> =>
    Effect.gen(function* () {
      yield* Effect.sleep(wait)
      const pollResponse: any = yield* Effect.promise(() =>
        postJson("https://api.kolbo.ai/auth/device/verify", {
          client_id: "kolbo-cli",
          device_code,
        }),
      )
      if (pollResponse.error === "authorization_pending") return yield* poll(wait)
      if (pollResponse.error === "slow_down") return yield* poll(wait + 1000)
      if (pollResponse.access_token) return pollResponse
      throw new Error(pollResponse.error || "Unknown error")
    })

  const result = yield* poll(interval * 1000).pipe(
    Effect.timeout(30000),
    Effect.catchTag("TimeoutError", () => Effect.fail(new Error("Authentication timed out"))),
  )

  yield* Auth.set(KOLBO_PROVIDER, new Auth.Oauth({
    type: "oauth",
    access: result.access_token,
    refresh: result.refresh_token,
    expires: Date.now() + expires_in * 1000,
  }))

  yield* s.stop("Successfully logged in to Kolbo.AI")
  yield* Prompt.outro("Done")
})

const apiKeyEffect = (apiKey: string) =>
  Effect.gen(function* () {
    yield* Prompt.intro("Kolbo.AI API Key")

    if (!isValidApiKey(apiKey)) {
      yield* Prompt.log.info("Invalid API key format. Key must start with kolbo_live_ or kolbo_test_")
      return
    }

    yield* Auth.set(KOLBO_PROVIDER, new Auth.Api({
      type: "api",
      key: apiKey,
    }))

    yield* Prompt.outro("API key saved")
  })

const statusEffect = Effect.gen(function* () {
  const info = yield* Auth.get(KOLBO_PROVIDER)

  if (!info) {
    yield* println("Not logged in to Kolbo.AI")
    return
  }

  yield* Match.valueTags(info, {
    oauth: (oauth) => {
      const expiresAt = new Date(oauth.expires).toLocaleString()
      const isExpired = oauth.expires < Date.now()
      const status = isExpired ? UI.Style.TEXT_DIM + " (expired)" + UI.Style.TEXT_NORMAL : ""
      return println(`Logged in via OAuth${status}\n  Expires: ${expiresAt}`)
    },
    api: (api) => {
      const masked = api.key.slice(0, 12) + "..." + api.key.slice(-4)
      return println(`Logged in via API Key\n  Key: ${masked}`)
    },
    wellknown: () => println("Logged in via WellKnown"),
  })
})

const logoutEffect = Effect.gen(function* () {
  yield* Prompt.intro("Kolbo.AI Logout")

  const info = yield* Auth.get(KOLBO_PROVIDER)
  if (!info) {
    yield* println("Not logged in to Kolbo.AI")
    return
  }

  yield* Auth.remove(KOLBO_PROVIDER)
  yield* Prompt.outro("Logged out from Kolbo.AI")
})

export const AuthLoginCommand = cmd({
  command: "login",
  describe: "Log in via device code flow",
  async handler() {
    UI.empty()
    await Effect.runPromise(loginEffect)
  },
})

export const AuthApiKeyCommand = cmd({
  command: "api-key <key>",
  describe: "Save API key directly",
  builder: (yargs) =>
    yargs.positional("key", {
      describe: "Kolbo API key (kolbo_live_xxx or kolbo_test_xxx)",
      type: "string",
      demandOption: true,
    }),
  async handler(args) {
    UI.empty()
    await Effect.runPromise(apiKeyEffect(args.key))
  },
})

export const AuthStatusCommand = cmd({
  command: "status",
  describe: "Show current auth state",
  async handler() {
    UI.empty()
    await Effect.runPromise(statusEffect)
  },
})

export const AuthLogoutCommand = cmd({
  command: "logout",
  describe: "Clear stored auth",
  async handler() {
    UI.empty()
    await Effect.runPromise(logoutEffect)
  },
})

export const AuthCommand = cmd({
  command: "auth",
  describe: "Kolbo.AI authentication",
  builder: (yargs) =>
    yargs
      .command({
        ...AuthLoginCommand,
        describe: "Log in via device code",
      })
      .command({
        command: "<api-key>",
        describe: "Save API key directly",
        builder: (yargs) =>
          yargs.positional("api-key", {
            describe: "Kolbo API key (kolbo_live_xxx or kolbo_test_xxx)",
            type: "string",
            demandOption: true,
          }),
        handler: async (args) => {
          UI.empty()
          await Effect.runPromise(apiKeyEffect(args.apiKey as string))
        },
      })
      .command({
        ...AuthStatusCommand,
        describe: "Show auth state",
      })
      .command({
        ...AuthLogoutCommand,
        describe: "Clear auth",
      })
      .demandCommand(),
  async handler() {},
})
