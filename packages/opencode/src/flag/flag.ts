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

  export const KODU_AUTO_SHARE = truthy("KODU_AUTO_SHARE")
  export const KODU_AUTO_HEAP_SNAPSHOT = truthy("KODU_AUTO_HEAP_SNAPSHOT")
  export const KODU_GIT_BASH_PATH = process.env["KODU_GIT_BASH_PATH"]
  export const KODU_CONFIG = process.env["KODU_CONFIG"]
  export declare const KODU_PURE: boolean
  export declare const KODU_TUI_CONFIG: string | undefined
  export declare const KODU_CONFIG_DIR: string | undefined
  export declare const KODU_PLUGIN_META_FILE: string | undefined
  export const KODU_CONFIG_CONTENT = process.env["KODU_CONFIG_CONTENT"]
  export const KODU_DISABLE_AUTOUPDATE = truthy("KODU_DISABLE_AUTOUPDATE")
  export const KODU_ALWAYS_NOTIFY_UPDATE = truthy("KODU_ALWAYS_NOTIFY_UPDATE")
  export const KODU_DISABLE_PRUNE = truthy("KODU_DISABLE_PRUNE")
  export const KODU_DISABLE_TERMINAL_TITLE = truthy("KODU_DISABLE_TERMINAL_TITLE")
  export const KODU_SHOW_TTFD = truthy("KODU_SHOW_TTFD")
  export const KODU_PERMISSION = process.env["KODU_PERMISSION"]
  export const KODU_DISABLE_DEFAULT_PLUGINS = truthy("KODU_DISABLE_DEFAULT_PLUGINS")
  export const KODU_DISABLE_LSP_DOWNLOAD = truthy("KODU_DISABLE_LSP_DOWNLOAD")
  export const KODU_ENABLE_EXPERIMENTAL_MODELS = truthy("KODU_ENABLE_EXPERIMENTAL_MODELS")
  export const KODU_DISABLE_AUTOCOMPACT = truthy("KODU_DISABLE_AUTOCOMPACT")
  export const KODU_DISABLE_MODELS_FETCH = truthy("KODU_DISABLE_MODELS_FETCH")
  export const KODU_DISABLE_MOUSE = truthy("KODU_DISABLE_MOUSE")
  export const KODU_DISABLE_CLAUDE_CODE = truthy("KODU_DISABLE_CLAUDE_CODE")
  export const KODU_DISABLE_CLAUDE_CODE_PROMPT =
    KODU_DISABLE_CLAUDE_CODE || truthy("KODU_DISABLE_CLAUDE_CODE_PROMPT")
  export const KODU_DISABLE_CLAUDE_CODE_SKILLS =
    KODU_DISABLE_CLAUDE_CODE || truthy("KODU_DISABLE_CLAUDE_CODE_SKILLS")
  export const KODU_DISABLE_EXTERNAL_SKILLS =
    KODU_DISABLE_CLAUDE_CODE_SKILLS || truthy("KODU_DISABLE_EXTERNAL_SKILLS")
  export declare const KODU_DISABLE_PROJECT_CONFIG: boolean
  export const KODU_FAKE_VCS = process.env["KODU_FAKE_VCS"]
  export declare const KODU_CLIENT: string
  export const KODU_SERVER_PASSWORD = process.env["KODU_SERVER_PASSWORD"]
  export const KODU_SERVER_USERNAME = process.env["KODU_SERVER_USERNAME"]
  export const KODU_ENABLE_QUESTION_TOOL = truthy("KODU_ENABLE_QUESTION_TOOL")

  // Experimental
  export const KODU_EXPERIMENTAL = truthy("KODU_EXPERIMENTAL")
  export const KODU_EXPERIMENTAL_FILEWATCHER = Config.boolean("KODU_EXPERIMENTAL_FILEWATCHER").pipe(
    Config.withDefault(false),
  )
  export const KODU_EXPERIMENTAL_DISABLE_FILEWATCHER = Config.boolean(
    "KODU_EXPERIMENTAL_DISABLE_FILEWATCHER",
  ).pipe(Config.withDefault(false))
  export const KODU_EXPERIMENTAL_ICON_DISCOVERY =
    KODU_EXPERIMENTAL || truthy("KODU_EXPERIMENTAL_ICON_DISCOVERY")

  const copy = process.env["KODU_EXPERIMENTAL_DISABLE_COPY_ON_SELECT"]
  export const KODU_EXPERIMENTAL_DISABLE_COPY_ON_SELECT =
    copy === undefined ? process.platform === "win32" : truthy("KODU_EXPERIMENTAL_DISABLE_COPY_ON_SELECT")
  export const KODU_ENABLE_EXA =
    truthy("KODU_ENABLE_EXA") || KODU_EXPERIMENTAL || truthy("KODU_EXPERIMENTAL_EXA")
  export const KODU_EXPERIMENTAL_BASH_DEFAULT_TIMEOUT_MS = number("KODU_EXPERIMENTAL_BASH_DEFAULT_TIMEOUT_MS")
  export const KODU_EXPERIMENTAL_OUTPUT_TOKEN_MAX = number("KODU_EXPERIMENTAL_OUTPUT_TOKEN_MAX")
  export const KODU_EXPERIMENTAL_OXFMT = KODU_EXPERIMENTAL || truthy("KODU_EXPERIMENTAL_OXFMT")
  export const KODU_EXPERIMENTAL_LSP_TY = truthy("KODU_EXPERIMENTAL_LSP_TY")
  export const KODU_EXPERIMENTAL_LSP_TOOL = KODU_EXPERIMENTAL || truthy("KODU_EXPERIMENTAL_LSP_TOOL")
  export const KODU_DISABLE_FILETIME_CHECK = Config.boolean("KODU_DISABLE_FILETIME_CHECK").pipe(
    Config.withDefault(false),
  )
  export const KODU_EXPERIMENTAL_PLAN_MODE = KODU_EXPERIMENTAL || truthy("KODU_EXPERIMENTAL_PLAN_MODE")
  export const KODU_EXPERIMENTAL_WORKSPACES = KODU_EXPERIMENTAL || truthy("KODU_EXPERIMENTAL_WORKSPACES")
  export const KODU_EXPERIMENTAL_MARKDOWN = !falsy("KODU_EXPERIMENTAL_MARKDOWN")
  export const KODU_MODELS_URL = process.env["KODU_MODELS_URL"]
  export const KODU_MODELS_PATH = process.env["KODU_MODELS_PATH"]
  export const KODU_DISABLE_EMBEDDED_WEB_UI = truthy("KODU_DISABLE_EMBEDDED_WEB_UI")
  export const KODU_DB = process.env["KODU_DB"]
  export const KODU_DISABLE_CHANNEL_DB = truthy("KODU_DISABLE_CHANNEL_DB")
  export const KODU_SKIP_MIGRATIONS = truthy("KODU_SKIP_MIGRATIONS")
  export const KODU_STRICT_CONFIG_DEPS = truthy("KODU_STRICT_CONFIG_DEPS")

  function number(key: string) {
    const value = process.env[key]
    if (!value) return undefined
    const parsed = Number(value)
    return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined
  }
}

// Dynamic getter for KODU_DISABLE_PROJECT_CONFIG
// This must be evaluated at access time, not module load time,
// because external tooling may set this env var at runtime
Object.defineProperty(Flag, "KODU_DISABLE_PROJECT_CONFIG", {
  get() {
    return truthy("KODU_DISABLE_PROJECT_CONFIG")
  },
  enumerable: true,
  configurable: false,
})

// Dynamic getter for KODU_TUI_CONFIG
// This must be evaluated at access time, not module load time,
// because tests and external tooling may set this env var at runtime
Object.defineProperty(Flag, "KODU_TUI_CONFIG", {
  get() {
    return process.env["KODU_TUI_CONFIG"]
  },
  enumerable: true,
  configurable: false,
})

// Dynamic getter for KODU_CONFIG_DIR
// This must be evaluated at access time, not module load time,
// because external tooling may set this env var at runtime
Object.defineProperty(Flag, "KODU_CONFIG_DIR", {
  get() {
    return process.env["KODU_CONFIG_DIR"]
  },
  enumerable: true,
  configurable: false,
})

// Dynamic getter for KODU_PURE
// This must be evaluated at access time, not module load time,
// because the CLI can set this flag at runtime
Object.defineProperty(Flag, "KODU_PURE", {
  get() {
    return truthy("KODU_PURE")
  },
  enumerable: true,
  configurable: false,
})

// Dynamic getter for KODU_PLUGIN_META_FILE
// This must be evaluated at access time, not module load time,
// because tests and external tooling may set this env var at runtime
Object.defineProperty(Flag, "KODU_PLUGIN_META_FILE", {
  get() {
    return process.env["KODU_PLUGIN_META_FILE"]
  },
  enumerable: true,
  configurable: false,
})

// Dynamic getter for KODU_CLIENT
// This must be evaluated at access time, not module load time,
// because some commands override the client at runtime
Object.defineProperty(Flag, "KODU_CLIENT", {
  get() {
    return process.env["KODU_CLIENT"] ?? "cli"
  },
  enumerable: true,
  configurable: false,
})
