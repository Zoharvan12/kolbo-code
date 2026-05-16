import { Config } from "effect"

function truthy(key: string) {
  const value = process.env[key]?.toLowerCase()
  return value === "true" || value === "1"
}

function falsy(key: string) {
  const value = process.env[key]?.toLowerCase()
  return value === "false" || value === "0"
}

export namespace Flag {
  export const OTEL_EXPORTER_OTLP_ENDPOINT = process.env["OTEL_EXPORTER_OTLP_ENDPOINT"]
  export const OTEL_EXPORTER_OTLP_HEADERS = process.env["OTEL_EXPORTER_OTLP_HEADERS"]

  export const KOLBO_PARTNER_PROFILE = process.env["KOLBO_PARTNER_PROFILE"]
  export const KOLBO_AUTO_SHARE = truthy("KOLBO_AUTO_SHARE")
  export const KOLBO_AUTO_HEAP_SNAPSHOT = truthy("KOLBO_AUTO_HEAP_SNAPSHOT")
  export const KOLBO_GIT_BASH_PATH = process.env["KOLBO_GIT_BASH_PATH"]
  export const KOLBO_CONFIG = process.env["KOLBO_CONFIG"]
  export declare const KOLBO_PURE: boolean
  export declare const KOLBO_TUI_CONFIG: string | undefined
  export declare const KOLBO_CONFIG_DIR: string | undefined
  export declare const KOLBO_PLUGIN_META_FILE: string | undefined
  export const KOLBO_CONFIG_CONTENT = process.env["KOLBO_CONFIG_CONTENT"]
  export const KOLBO_DISABLE_AUTOUPDATE = truthy("KOLBO_DISABLE_AUTOUPDATE")
  export const KOLBO_ALWAYS_NOTIFY_UPDATE = truthy("KOLBO_ALWAYS_NOTIFY_UPDATE")
  export const KOLBO_DISABLE_PRUNE = truthy("KOLBO_DISABLE_PRUNE")
  export const KOLBO_DISABLE_TERMINAL_TITLE = truthy("KOLBO_DISABLE_TERMINAL_TITLE")
  export const KOLBO_SHOW_TTFD = truthy("KOLBO_SHOW_TTFD")
  export const KOLBO_PERMISSION = process.env["KOLBO_PERMISSION"]
  export const KOLBO_DISABLE_DEFAULT_PLUGINS = truthy("KOLBO_DISABLE_DEFAULT_PLUGINS")
  export const KOLBO_DISABLE_LSP_DOWNLOAD = truthy("KOLBO_DISABLE_LSP_DOWNLOAD")
  export const KOLBO_ENABLE_EXPERIMENTAL_MODELS = truthy("KOLBO_ENABLE_EXPERIMENTAL_MODELS")
  export const KOLBO_DISABLE_AUTOCOMPACT = truthy("KOLBO_DISABLE_AUTOCOMPACT")
  export const KOLBO_DISABLE_MODELS_FETCH = truthy("KOLBO_DISABLE_MODELS_FETCH")
  export const KOLBO_DISABLE_MOUSE = truthy("KOLBO_DISABLE_MOUSE")
  export const KOLBO_DISABLE_CLAUDE_CODE = truthy("KOLBO_DISABLE_CLAUDE_CODE")
  export const KOLBO_DISABLE_CLAUDE_CODE_PROMPT =
    KOLBO_DISABLE_CLAUDE_CODE || truthy("KOLBO_DISABLE_CLAUDE_CODE_PROMPT")
  export const KOLBO_DISABLE_CLAUDE_CODE_SKILLS =
    KOLBO_DISABLE_CLAUDE_CODE || truthy("KOLBO_DISABLE_CLAUDE_CODE_SKILLS")
  export const KOLBO_DISABLE_EXTERNAL_SKILLS =
    KOLBO_DISABLE_CLAUDE_CODE_SKILLS || truthy("KOLBO_DISABLE_EXTERNAL_SKILLS")
  export declare const KOLBO_DISABLE_PROJECT_CONFIG: boolean
  export const KOLBO_FAKE_VCS = process.env["KOLBO_FAKE_VCS"]
  export declare const KOLBO_CLIENT: string
  export const KOLBO_SERVER_PASSWORD = process.env["KOLBO_SERVER_PASSWORD"]
  export const KOLBO_SERVER_USERNAME = process.env["KOLBO_SERVER_USERNAME"]
  export const KOLBO_ENABLE_QUESTION_TOOL = truthy("KOLBO_ENABLE_QUESTION_TOOL")

  // Experimental
  export const KOLBO_EXPERIMENTAL = truthy("KOLBO_EXPERIMENTAL")
  export const KOLBO_EXPERIMENTAL_FILEWATCHER = Config.boolean("KOLBO_EXPERIMENTAL_FILEWATCHER").pipe(
    Config.withDefault(false),
  )
  export const KOLBO_EXPERIMENTAL_DISABLE_FILEWATCHER = Config.boolean(
    "KOLBO_EXPERIMENTAL_DISABLE_FILEWATCHER",
  ).pipe(Config.withDefault(false))
  export const KOLBO_EXPERIMENTAL_ICON_DISCOVERY =
    KOLBO_EXPERIMENTAL || truthy("KOLBO_EXPERIMENTAL_ICON_DISCOVERY")

  const copy = process.env["KOLBO_EXPERIMENTAL_DISABLE_COPY_ON_SELECT"]
  export const KOLBO_EXPERIMENTAL_DISABLE_COPY_ON_SELECT =
    copy === undefined ? process.platform === "win32" : truthy("KOLBO_EXPERIMENTAL_DISABLE_COPY_ON_SELECT")
  export const KOLBO_ENABLE_EXA =
    truthy("KOLBO_ENABLE_EXA") || KOLBO_EXPERIMENTAL || truthy("KOLBO_EXPERIMENTAL_EXA")
  export const KOLBO_EXPERIMENTAL_BASH_DEFAULT_TIMEOUT_MS = number("KOLBO_EXPERIMENTAL_BASH_DEFAULT_TIMEOUT_MS")
  export const KOLBO_EXPERIMENTAL_OUTPUT_TOKEN_MAX = number("KOLBO_EXPERIMENTAL_OUTPUT_TOKEN_MAX")
  export const KOLBO_CACHE_TOOLS = truthy("KOLBO_CACHE_TOOLS")
  export const KOLBO_EXPERIMENTAL_OXFMT = KOLBO_EXPERIMENTAL || truthy("KOLBO_EXPERIMENTAL_OXFMT")
  export const KOLBO_EXPERIMENTAL_LSP_TY = truthy("KOLBO_EXPERIMENTAL_LSP_TY")
  export const KOLBO_EXPERIMENTAL_LSP_TOOL = KOLBO_EXPERIMENTAL || truthy("KOLBO_EXPERIMENTAL_LSP_TOOL")
  export const KOLBO_DISABLE_FILETIME_CHECK = Config.boolean("KOLBO_DISABLE_FILETIME_CHECK").pipe(
    Config.withDefault(false),
  )
  export const KOLBO_EXPERIMENTAL_PLAN_MODE = KOLBO_EXPERIMENTAL || truthy("KOLBO_EXPERIMENTAL_PLAN_MODE")
  export const KOLBO_EXPERIMENTAL_WORKSPACES = KOLBO_EXPERIMENTAL || truthy("KOLBO_EXPERIMENTAL_WORKSPACES")
  export const KOLBO_EXPERIMENTAL_MARKDOWN = !falsy("KOLBO_EXPERIMENTAL_MARKDOWN")
  export const KOLBO_MODELS_URL = process.env["KOLBO_MODELS_URL"]
  export const KOLBO_MODELS_PATH = process.env["KOLBO_MODELS_PATH"]
  export const KOLBO_DISABLE_EMBEDDED_WEB_UI = truthy("KOLBO_DISABLE_EMBEDDED_WEB_UI")
  export const KOLBO_DB = process.env["KOLBO_DB"]
  export const KOLBO_DISABLE_CHANNEL_DB = truthy("KOLBO_DISABLE_CHANNEL_DB")
  export const KOLBO_SKIP_MIGRATIONS = truthy("KOLBO_SKIP_MIGRATIONS")
  export const KOLBO_STRICT_CONFIG_DEPS = truthy("KOLBO_STRICT_CONFIG_DEPS")

  function number(key: string) {
    const value = process.env[key]
    if (!value) return undefined
    const parsed = Number(value)
    return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined
  }
}

// Dynamic getter for KOLBO_DISABLE_PROJECT_CONFIG
// This must be evaluated at access time, not module load time,
// because external tooling may set this env var at runtime
Object.defineProperty(Flag, "KOLBO_DISABLE_PROJECT_CONFIG", {
  get() {
    return truthy("KOLBO_DISABLE_PROJECT_CONFIG")
  },
  enumerable: true,
  configurable: false,
})

// Dynamic getter for KOLBO_TUI_CONFIG
// This must be evaluated at access time, not module load time,
// because tests and external tooling may set this env var at runtime
Object.defineProperty(Flag, "KOLBO_TUI_CONFIG", {
  get() {
    return process.env["KOLBO_TUI_CONFIG"]
  },
  enumerable: true,
  configurable: false,
})

// Dynamic getter for KOLBO_CONFIG_DIR
// This must be evaluated at access time, not module load time,
// because external tooling may set this env var at runtime
Object.defineProperty(Flag, "KOLBO_CONFIG_DIR", {
  get() {
    return process.env["KOLBO_CONFIG_DIR"]
  },
  enumerable: true,
  configurable: false,
})

// Dynamic getter for KOLBO_PURE
// This must be evaluated at access time, not module load time,
// because the CLI can set this flag at runtime
Object.defineProperty(Flag, "KOLBO_PURE", {
  get() {
    return truthy("KOLBO_PURE")
  },
  enumerable: true,
  configurable: false,
})

// Dynamic getter for KOLBO_PLUGIN_META_FILE
// This must be evaluated at access time, not module load time,
// because tests and external tooling may set this env var at runtime
Object.defineProperty(Flag, "KOLBO_PLUGIN_META_FILE", {
  get() {
    return process.env["KOLBO_PLUGIN_META_FILE"]
  },
  enumerable: true,
  configurable: false,
})

// Dynamic getter for KOLBO_CLIENT
// This must be evaluated at access time, not module load time,
// because some commands override the client at runtime
Object.defineProperty(Flag, "KOLBO_CLIENT", {
  get() {
    return process.env["KOLBO_CLIENT"] ?? "cli"
  },
  enumerable: true,
  configurable: false,
})
