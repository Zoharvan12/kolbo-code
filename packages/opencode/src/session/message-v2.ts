import { BusEvent } from "@/bus/bus-event"
import { SessionID, MessageID, PartID } from "./schema"
import z from "zod"
import { NamedError } from "@opencode-ai/util/error"
import { APICallError, convertToModelMessages, LoadAPIKeyError, type ModelMessage, type UIMessage } from "ai"
import { LSP } from "../lsp"
import { Snapshot } from "@/snapshot"
import { SyncEvent } from "../sync"
import { Database, NotFoundError, and, desc, eq, inArray, lt, or } from "@/storage/db"
import { MessageTable, PartTable, SessionTable } from "./session.sql"
import { ProviderError } from "@/provider/error"
import { iife } from "@/util/iife"
import { errorMessage } from "@/util/error"
import type { SystemError } from "bun"
import type { Provider } from "@/provider/provider"
import { ModelID, ProviderID } from "@/provider/schema"
import { Effect } from "effect"

/** Error shape thrown by Bun's fetch() when gzip/br decompression fails mid-stream */
interface FetchDecompressionError extends Error {
  code: "ZlibError"
  errno: number
  path: string
}

// Kolbo MCP tool names that produce a durable media artifact and therefore should trigger a
// system-reminder asking the model to update .kolbo/production.md. Discovery-only tools
// (list_*, get_*, check_credits, chat_*, transcribe_audio) are intentionally excluded.
//
// Tool names arrive in EITHER form depending on opencode's MCP client sanitizer:
//   - `kolbo_generate_image`           (current — single underscore namespace prefix)
//   - `mcp__kolbo__generate_image`     (older / direct namespacing path)
// Match both. The previous regex matched only the latter, so the nudge silently
// never fired in production — which is why .kolbo/production.md wasn't getting
// created on real media generations.
const KOLBO_GENERATION_TOOL_NAMES = new Set([
  "generate_image",
  "generate_image_edit",
  "generate_video",
  "generate_video_from_image",
  "generate_video_from_video",
  "edit_image",
  "edit_video",
  "generate_elements",
  "generate_first_last_frame",
  "generate_lipsync",
  "generate_music",
  "generate_sound",
  "generate_speech",
  "generate_3d",
  "generate_creative_director",
  "create_visual_dna",
  "upload_media",
])
function isKolboGenerationToolName(tool: string): boolean {
  if (tool.startsWith("kolbo_")) return KOLBO_GENERATION_TOOL_NAMES.has(tool.slice("kolbo_".length))
  if (tool.startsWith("mcp__kolbo__")) return KOLBO_GENERATION_TOOL_NAMES.has(tool.slice("mcp__kolbo__".length))
  return false
}

function isKolboTool(tool: string): boolean {
  return tool.startsWith("kolbo_") || tool.startsWith("mcp__kolbo__")
}

// Auth-expired marker stamped by kolbo-mcp's HTTP client (src/client.js) when
// kolbo-api returns 401. The UI catches the same marker to open the in-app
// reconnect dialog (see app/src/pages/session.tsx and tui/.../session/index.tsx).
//
// Defensive fallback: legacy kolbo-mcp builds (≤ v1.11) emitted the literal
// string `API key is invalid or expired. Fix: run "kolbo auth login" in the
// terminal, then restart this editor.` — and many users still have that cached
// via `npx @kolbo/mcp@latest` until v1.12+ is published / their npm cache
// expires. Match the legacy string too so the sanitizer works on every
// install, not just brand-new ones. Both branches collapse to the same
// "reconnect dialog is open" message for the model.
const KOLBO_AUTH_TAG_RE = /\[KOLBO_AUTH_(EXPIRED|MISSING)\]/
const KOLBO_AUTH_LEGACY_RE =
  /API key is invalid or expired|kolbo auth login|Kolbo API key not found/i
function looksLikeKolboAuthError(text: string): boolean {
  return KOLBO_AUTH_TAG_RE.test(text) || KOLBO_AUTH_LEGACY_RE.test(text)
}

// Replacement copy fed to the model in place of the raw kolbo-api auth error.
// The raw error reads like "API key is invalid or expired... [KOLBO_AUTH_EXPIRED]"
// — if the model sees that, it tends to paraphrase auth-mechanism advice at the
// user. By the time this is rendered the UI has already popped the reconnect
// dialog, so we want the model to (a) NOT talk about API keys or terminals,
// (b) acknowledge briefly, (c) wait for the user to confirm reconnect before
// retrying the same tool call.
const KOLBO_AUTH_SANITIZED_MESSAGE =
  "[KOLBO_AUTH_EXPIRED] Your Kolbo session expired. " +
  "The reconnect dialog has been opened automatically — the user just needs to click Reconnect. " +
  "Do NOT instruct them to open a terminal, run `kolbo auth login`, or copy an API key — those are wrong for desktop/web users and the in-app flow handles it for everyone. " +
  "Reply with one short sentence telling them the dialog is open and you'll continue once they click Reconnect. " +
  "Then wait. Do not call any other kolbo_* tool until they reply — the next call will fail the same way until they reconnect."

// Self-contained nudge: includes the full stub so the model can act on it
// without having loaded the kolbo SKILL.md. Fires only after a successful
// kolbo_* generation tool call (see KOLBO_GENERATION_TOOL_NAMES), so non-media
// sessions pay zero token cost.
const PRODUCTION_LOG_REMINDER =
  "\n\n<system-reminder>" +
  "This was a Kolbo media-generation tool call. Before your next tool call or final reply, log this artifact to `.kolbo/production.md` in the workspace. " +
  "This file is the durable registry of every URL/id you produce — it survives compaction and is how the user references prior work (\"the rainy scene\", \"scene 3\", \"@maya\"). " +
  "\n\n" +
  "Procedure:\n" +
  "1. If the file does NOT exist (first generation in this workspace): use the `Write` tool with the exact stub below.\n" +
  "2. If the file exists: `Read` it first (Edit requires a prior Read in the same session), then `Edit` to append the new artifact and rewrite the `## 🎯 Now` header.\n" +
  "3. Body sections (below the first `---`) are append-only. To replace a prior artifact, mark the old line `(superseded YYYY-MM-DD)` and add the new entry beneath — never delete.\n" +
  "4. Write entries as the user would reference them (\"the rainy scene\"), not the model's raw output. One bullet per artifact with URL, model, and ISO date. Include the `generation_id` when the tool returns one — needed for `get_generation_status` recovery and retry dedupe.\n" +
  "5. Do not log failures — only successful generations.\n" +
  "\n" +
  "Stub for first-time creation:\n" +
  "```md\n" +
  "<!-- .kolbo/production.md — agent-managed media artifact registry.\n" +
  "     User may hand-edit; agent must Read-before-Edit to reconcile. -->\n" +
  "\n" +
  "# Production Log\n" +
  "\n" +
  "## 🎯 Now\n" +
  "\n" +
  "**Brief:** <paraphrase of user's overall goal in 1-3 sentences>\n" +
  "**Now working on:** <the immediate next step>\n" +
  "**Last updated:** <ISO date>\n" +
  "\n" +
  "---\n" +
  "\n" +
  "## Production: <name from user's request>\n" +
  "\n" +
  "### Cast\n" +
  "### Visual DNA\n" +
  "### Scenes\n" +
  "### Audio\n" +
  "### Final\n" +
  "```\n" +
  "\n" +
  "Subsection headings are suggestions — adapt to the actual production (logos, tracks, models, etc.) and omit empty ones. Do NOT echo the generated URL in your reply text; the chat UI already renders it as a gallery tile." +
  "</system-reminder>"

export namespace MessageV2 {
  export function isMedia(mime: string) {
    return (
      mime.startsWith("image/") ||
      mime.startsWith("audio/") ||
      mime.startsWith("video/") ||
      mime === "application/pdf"
    )
  }

  export const OutputLengthError = NamedError.create("MessageOutputLengthError", z.object({}))
  export const AbortedError = NamedError.create("MessageAbortedError", z.object({ message: z.string() }))
  export const StructuredOutputError = NamedError.create(
    "StructuredOutputError",
    z.object({
      message: z.string(),
      retries: z.number(),
    }),
  )
  export const AuthError = NamedError.create(
    "ProviderAuthError",
    z.object({
      providerID: z.string(),
      message: z.string(),
    }),
  )
  export const APIError = NamedError.create(
    "APIError",
    z.object({
      message: z.string(),
      statusCode: z.number().optional(),
      isRetryable: z.boolean(),
      responseHeaders: z.record(z.string(), z.string()).optional(),
      responseBody: z.string().optional(),
      metadata: z.record(z.string(), z.string()).optional(),
    }),
  )
  export type APIError = z.infer<typeof APIError.Schema>
  export const ContextOverflowError = NamedError.create(
    "ContextOverflowError",
    z.object({ message: z.string(), responseBody: z.string().optional() }),
  )

  export const OutputFormatText = z
    .object({
      type: z.literal("text"),
    })
    .meta({
      ref: "OutputFormatText",
    })

  export const OutputFormatJsonSchema = z
    .object({
      type: z.literal("json_schema"),
      schema: z.record(z.string(), z.any()).meta({ ref: "JSONSchema" }),
      retryCount: z.number().int().min(0).default(2),
    })
    .meta({
      ref: "OutputFormatJsonSchema",
    })

  export const Format = z.discriminatedUnion("type", [OutputFormatText, OutputFormatJsonSchema]).meta({
    ref: "OutputFormat",
  })
  export type OutputFormat = z.infer<typeof Format>

  const PartBase = z.object({
    id: PartID.zod,
    sessionID: SessionID.zod,
    messageID: MessageID.zod,
  })

  export const SnapshotPart = PartBase.extend({
    type: z.literal("snapshot"),
    snapshot: z.string(),
  }).meta({
    ref: "SnapshotPart",
  })
  export type SnapshotPart = z.infer<typeof SnapshotPart>

  export const PatchPart = PartBase.extend({
    type: z.literal("patch"),
    hash: z.string(),
    files: z.string().array(),
  }).meta({
    ref: "PatchPart",
  })
  export type PatchPart = z.infer<typeof PatchPart>

  export const TextPart = PartBase.extend({
    type: z.literal("text"),
    text: z.string(),
    synthetic: z.boolean().optional(),
    ignored: z.boolean().optional(),
    time: z
      .object({
        start: z.number(),
        end: z.number().optional(),
      })
      .optional(),
    metadata: z.record(z.string(), z.any()).optional(),
  }).meta({
    ref: "TextPart",
  })
  export type TextPart = z.infer<typeof TextPart>

  export const ReasoningPart = PartBase.extend({
    type: z.literal("reasoning"),
    text: z.string(),
    metadata: z.record(z.string(), z.any()).optional(),
    time: z.object({
      start: z.number(),
      end: z.number().optional(),
    }),
  }).meta({
    ref: "ReasoningPart",
  })
  export type ReasoningPart = z.infer<typeof ReasoningPart>

  const FilePartSourceBase = z.object({
    text: z
      .object({
        value: z.string(),
        start: z.number().int(),
        end: z.number().int(),
      })
      .meta({
        ref: "FilePartSourceText",
      }),
  })

  export const FileSource = FilePartSourceBase.extend({
    type: z.literal("file"),
    path: z.string(),
  }).meta({
    ref: "FileSource",
  })

  export const SymbolSource = FilePartSourceBase.extend({
    type: z.literal("symbol"),
    path: z.string(),
    range: LSP.Range,
    name: z.string(),
    kind: z.number().int(),
  }).meta({
    ref: "SymbolSource",
  })

  export const ResourceSource = FilePartSourceBase.extend({
    type: z.literal("resource"),
    clientName: z.string(),
    uri: z.string(),
  }).meta({
    ref: "ResourceSource",
  })

  export const FilePartSource = z.discriminatedUnion("type", [FileSource, SymbolSource, ResourceSource]).meta({
    ref: "FilePartSource",
  })

  export const FilePart = PartBase.extend({
    type: z.literal("file"),
    mime: z.string(),
    filename: z.string().optional(),
    url: z.string(),
    source: FilePartSource.optional(),
  }).meta({
    ref: "FilePart",
  })
  export type FilePart = z.infer<typeof FilePart>

  export const AgentPart = PartBase.extend({
    type: z.literal("agent"),
    name: z.string(),
    source: z
      .object({
        value: z.string(),
        start: z.number().int(),
        end: z.number().int(),
      })
      .optional(),
  }).meta({
    ref: "AgentPart",
  })
  export type AgentPart = z.infer<typeof AgentPart>

  export const CompactionPart = PartBase.extend({
    type: z.literal("compaction"),
    auto: z.boolean(),
    overflow: z.boolean().optional(),
  }).meta({
    ref: "CompactionPart",
  })
  export type CompactionPart = z.infer<typeof CompactionPart>

  export const SubtaskPart = PartBase.extend({
    type: z.literal("subtask"),
    prompt: z.string(),
    description: z.string(),
    agent: z.string(),
    model: z
      .object({
        providerID: ProviderID.zod,
        modelID: ModelID.zod,
      })
      .optional(),
    command: z.string().optional(),
  }).meta({
    ref: "SubtaskPart",
  })
  export type SubtaskPart = z.infer<typeof SubtaskPart>

  export const RetryPart = PartBase.extend({
    type: z.literal("retry"),
    attempt: z.number(),
    error: APIError.Schema,
    time: z.object({
      created: z.number(),
    }),
  }).meta({
    ref: "RetryPart",
  })
  export type RetryPart = z.infer<typeof RetryPart>

  export const StepStartPart = PartBase.extend({
    type: z.literal("step-start"),
    snapshot: z.string().optional(),
  }).meta({
    ref: "StepStartPart",
  })
  export type StepStartPart = z.infer<typeof StepStartPart>

  export const StepFinishPart = PartBase.extend({
    type: z.literal("step-finish"),
    reason: z.string(),
    snapshot: z.string().optional(),
    cost: z.number(),
    tokens: z.object({
      total: z.number().optional(),
      input: z.number(),
      output: z.number(),
      reasoning: z.number(),
      cache: z.object({
        read: z.number(),
        write: z.number(),
      }),
    }),
  }).meta({
    ref: "StepFinishPart",
  })
  export type StepFinishPart = z.infer<typeof StepFinishPart>

  export const ToolStatePending = z
    .object({
      status: z.literal("pending"),
      input: z.record(z.string(), z.any()),
      raw: z.string(),
    })
    .meta({
      ref: "ToolStatePending",
    })

  export type ToolStatePending = z.infer<typeof ToolStatePending>

  export const ToolStateRunning = z
    .object({
      status: z.literal("running"),
      input: z.record(z.string(), z.any()),
      title: z.string().optional(),
      metadata: z.record(z.string(), z.any()).optional(),
      time: z.object({
        start: z.number(),
      }),
    })
    .meta({
      ref: "ToolStateRunning",
    })
  export type ToolStateRunning = z.infer<typeof ToolStateRunning>

  export const ToolStateCompleted = z
    .object({
      status: z.literal("completed"),
      input: z.record(z.string(), z.any()),
      output: z.string(),
      title: z.string(),
      metadata: z.record(z.string(), z.any()),
      time: z.object({
        start: z.number(),
        end: z.number(),
        compacted: z.number().optional(),
      }),
      attachments: FilePart.array().optional(),
    })
    .meta({
      ref: "ToolStateCompleted",
    })
  export type ToolStateCompleted = z.infer<typeof ToolStateCompleted>

  export const ToolStateError = z
    .object({
      status: z.literal("error"),
      input: z.record(z.string(), z.any()),
      error: z.string(),
      metadata: z.record(z.string(), z.any()).optional(),
      time: z.object({
        start: z.number(),
        end: z.number(),
      }),
    })
    .meta({
      ref: "ToolStateError",
    })
  export type ToolStateError = z.infer<typeof ToolStateError>

  export const ToolState = z
    .discriminatedUnion("status", [ToolStatePending, ToolStateRunning, ToolStateCompleted, ToolStateError])
    .meta({
      ref: "ToolState",
    })

  export const ToolPart = PartBase.extend({
    type: z.literal("tool"),
    callID: z.string(),
    tool: z.string(),
    state: ToolState,
    metadata: z.record(z.string(), z.any()).optional(),
  }).meta({
    ref: "ToolPart",
  })
  export type ToolPart = z.infer<typeof ToolPart>

  const Base = z.object({
    id: MessageID.zod,
    sessionID: SessionID.zod,
  })

  export const User = Base.extend({
    role: z.literal("user"),
    time: z.object({
      created: z.number(),
    }),
    format: Format.optional(),
    summary: z
      .object({
        title: z.string().optional(),
        body: z.string().optional(),
        diffs: Snapshot.FileDiff.array(),
      })
      .optional(),
    agent: z.string(),
    model: z.object({
      providerID: ProviderID.zod,
      modelID: ModelID.zod,
      variant: z.string().optional(),
    }),
    system: z.string().optional(),
    tools: z.record(z.string(), z.boolean()).optional(),
  }).meta({
    ref: "UserMessage",
  })
  export type User = z.infer<typeof User>

  export const Part = z
    .discriminatedUnion("type", [
      TextPart,
      SubtaskPart,
      ReasoningPart,
      FilePart,
      ToolPart,
      StepStartPart,
      StepFinishPart,
      SnapshotPart,
      PatchPart,
      AgentPart,
      RetryPart,
      CompactionPart,
    ])
    .meta({
      ref: "Part",
    })
  export type Part = z.infer<typeof Part>

  export const Assistant = Base.extend({
    role: z.literal("assistant"),
    time: z.object({
      created: z.number(),
      completed: z.number().optional(),
    }),
    error: z
      .discriminatedUnion("name", [
        AuthError.Schema,
        NamedError.Unknown.Schema,
        OutputLengthError.Schema,
        AbortedError.Schema,
        StructuredOutputError.Schema,
        ContextOverflowError.Schema,
        APIError.Schema,
      ])
      .optional(),
    parentID: MessageID.zod,
    modelID: ModelID.zod,
    providerID: ProviderID.zod,
    /**
     * @deprecated
     */
    mode: z.string(),
    agent: z.string(),
    path: z.object({
      cwd: z.string(),
      root: z.string(),
    }),
    summary: z.boolean().optional(),
    cost: z.number(),
    tokens: z.object({
      total: z.number().optional(),
      input: z.number(),
      output: z.number(),
      reasoning: z.number(),
      cache: z.object({
        read: z.number(),
        write: z.number(),
      }),
    }),
    structured: z.any().optional(),
    variant: z.string().optional(),
    finish: z.string().optional(),
  }).meta({
    ref: "AssistantMessage",
  })
  export type Assistant = z.infer<typeof Assistant>

  export const Info = z.discriminatedUnion("role", [User, Assistant]).meta({
    ref: "Message",
  })
  export type Info = z.infer<typeof Info>

  export const Event = {
    Updated: SyncEvent.define({
      type: "message.updated",
      version: 1,
      aggregate: "sessionID",
      schema: z.object({
        sessionID: SessionID.zod,
        info: Info,
      }),
    }),
    Removed: SyncEvent.define({
      type: "message.removed",
      version: 1,
      aggregate: "sessionID",
      schema: z.object({
        sessionID: SessionID.zod,
        messageID: MessageID.zod,
      }),
    }),
    PartUpdated: SyncEvent.define({
      type: "message.part.updated",
      version: 1,
      aggregate: "sessionID",
      schema: z.object({
        sessionID: SessionID.zod,
        part: Part,
        time: z.number(),
      }),
    }),
    PartDelta: BusEvent.define(
      "message.part.delta",
      z.object({
        sessionID: SessionID.zod,
        messageID: MessageID.zod,
        partID: PartID.zod,
        field: z.string(),
        delta: z.string(),
      }),
    ),
    PartRemoved: SyncEvent.define({
      type: "message.part.removed",
      version: 1,
      aggregate: "sessionID",
      schema: z.object({
        sessionID: SessionID.zod,
        messageID: MessageID.zod,
        partID: PartID.zod,
      }),
    }),
  }

  export const WithParts = z.object({
    info: Info,
    parts: z.array(Part),
  })
  export type WithParts = z.infer<typeof WithParts>

  const Cursor = z.object({
    id: MessageID.zod,
    time: z.number(),
  })
  type Cursor = z.infer<typeof Cursor>

  export const cursor = {
    encode(input: Cursor) {
      return Buffer.from(JSON.stringify(input)).toString("base64url")
    },
    decode(input: string) {
      return Cursor.parse(JSON.parse(Buffer.from(input, "base64url").toString("utf8")))
    },
  }

  const info = (row: typeof MessageTable.$inferSelect) =>
    ({
      ...row.data,
      id: row.id,
      sessionID: row.session_id,
    }) as MessageV2.Info

  const part = (row: typeof PartTable.$inferSelect) =>
    ({
      ...row.data,
      id: row.id,
      sessionID: row.session_id,
      messageID: row.message_id,
    }) as MessageV2.Part

  const older = (row: Cursor) =>
    or(
      lt(MessageTable.time_created, row.time),
      and(eq(MessageTable.time_created, row.time), lt(MessageTable.id, row.id)),
    )

  function hydrate(rows: (typeof MessageTable.$inferSelect)[]) {
    const ids = rows.map((row) => row.id)
    const partByMessage = new Map<string, MessageV2.Part[]>()
    if (ids.length > 0) {
      const partRows = Database.use((db) =>
        db
          .select()
          .from(PartTable)
          .where(inArray(PartTable.message_id, ids))
          .orderBy(PartTable.message_id, PartTable.id)
          .all(),
      )
      for (const row of partRows) {
        const next = part(row)
        const list = partByMessage.get(row.message_id)
        if (list) list.push(next)
        else partByMessage.set(row.message_id, [next])
      }
    }

    return rows.map((row) => ({
      info: info(row),
      parts: partByMessage.get(row.id) ?? [],
    }))
  }

  function providerMeta(metadata: Record<string, any> | undefined) {
    if (!metadata) return undefined
    const { providerExecuted: _, ...rest } = metadata
    return Object.keys(rest).length > 0 ? rest : undefined
  }

  export const toModelMessagesEffect = Effect.fnUntraced(function* (
    input: WithParts[],
    model: Provider.Model,
    options?: { stripMedia?: boolean },
  ) {
    const result: UIMessage[] = []
    const toolNames = new Set<string>()
    // Track media from tool results that need to be injected as user messages
    // for providers that don't support media in tool results.
    //
    // OpenAI-compatible APIs only support string content in tool results, so we need
    // to extract media and inject as user messages. Other SDKs (anthropic, google,
    // bedrock) handle type: "content" with media parts natively.
    //
    // Only apply this workaround if the model actually supports image input -
    // otherwise there's no point extracting images.
    const supportsMediaInToolResults = (() => {
      if (model.api.npm === "@ai-sdk/anthropic") return true
      if (model.api.npm === "@ai-sdk/openai") return true
      if (model.api.npm === "@ai-sdk/amazon-bedrock") return true
      if (model.api.npm === "@ai-sdk/google-vertex/anthropic") return true
      if (model.api.npm === "@ai-sdk/google") {
        const id = model.api.id.toLowerCase()
        return id.includes("gemini-3") && !id.includes("gemini-2")
      }
      return false
    })()

    const toModelOutput = (options: { toolCallId: string; input: unknown; output: unknown }) => {
      const output = options.output
      if (typeof output === "string") {
        return { type: "text", value: output }
      }

      if (typeof output === "object") {
        const outputObject = output as {
          text: string
          attachments?: Array<{ mime: string; url: string }>
        }
        const attachments = (outputObject.attachments ?? []).filter((attachment) => {
          return attachment.url.startsWith("data:") && attachment.url.includes(",")
        })

        return {
          type: "content",
          value: [
            ...(outputObject.text ? [{ type: "text", text: outputObject.text }] : []),
            ...attachments.map((attachment) => ({
              type: "media",
              mediaType: attachment.mime,
              data: iife(() => {
                const commaIndex = attachment.url.indexOf(",")
                return commaIndex === -1 ? attachment.url : attachment.url.slice(commaIndex + 1)
              }),
            })),
          ],
        }
      }

      return { type: "json", value: output as never }
    }

    for (const msg of input) {
      if (msg.parts.length === 0) continue

      if (msg.info.role === "user") {
        const userMessage: UIMessage = {
          id: msg.info.id,
          role: "user",
          parts: [],
        }
        result.push(userMessage)
        for (const part of msg.parts) {
          if (part.type === "text" && !part.ignored)
            userMessage.parts.push({
              type: "text",
              text: part.text,
            })
          // text/plain and directory files are converted into text parts, ignore them
          if (part.type === "file" && part.mime !== "text/plain" && part.mime !== "application/x-directory") {
            if (options?.stripMedia && isMedia(part.mime)) {
              userMessage.parts.push({
                type: "text",
                text: `[Attached ${part.mime}: ${part.filename ?? "file"}]`,
              })
            } else {
              userMessage.parts.push({
                type: "file",
                url: part.url,
                mediaType: part.mime,
                filename: part.filename,
              })
            }
          }

          if (part.type === "compaction") {
            userMessage.parts.push({
              type: "text",
              text: "What did we do so far?",
            })
          }
          if (part.type === "subtask") {
            userMessage.parts.push({
              type: "text",
              text: "The following tool was executed by the user",
            })
          }
        }
      }

      if (msg.info.role === "assistant") {
        const differentModel = `${model.providerID}/${model.id}` !== `${msg.info.providerID}/${msg.info.modelID}`
        const media: Array<{ mime: string; url: string }> = []

        if (
          msg.info.error &&
          !(
            MessageV2.AbortedError.isInstance(msg.info.error) &&
            msg.parts.some((part) => part.type !== "step-start" && part.type !== "reasoning")
          )
        ) {
          continue
        }
        const assistantMessage: UIMessage = {
          id: msg.info.id,
          role: "assistant",
          parts: [],
        }
        for (const part of msg.parts) {
          if (part.type === "text")
            assistantMessage.parts.push({
              type: "text",
              text: part.text,
              ...(differentModel ? {} : { providerMetadata: part.metadata }),
            })
          if (part.type === "step-start")
            assistantMessage.parts.push({
              type: "step-start",
            })
          if (part.type === "tool") {
            toolNames.add(part.tool)
            if (part.state.status === "completed") {
              // Nudge: after every successful Kolbo media-generation MCP tool call, append a
              // system-reminder to the tool result so the model logs the artifact to
              // .kolbo/production.md before its next tool call. See SKILL.md "Production Log".
              const isKolboGenerationTool = isKolboGenerationToolName(part.tool)
              const productionLogNudge =
                isKolboGenerationTool && !part.state.time.compacted ? PRODUCTION_LOG_REMINDER : ""
              // Sanitize Kolbo auth-expired errors that come through as a
              // "completed" tool result with the auth tag in the output text.
              // (MCP returns 4xx as data, not as a thrown error, in some paths.)
              const rawOutput =
                typeof part.state.output === "string" ? part.state.output : ""
              const isKolboAuthExpired =
                isKolboTool(part.tool) && looksLikeKolboAuthError(rawOutput)
              const outputText = part.state.time.compacted
                ? "[Old tool result content cleared]"
                : isKolboAuthExpired
                ? KOLBO_AUTH_SANITIZED_MESSAGE
                : part.state.output + productionLogNudge
              const attachments = part.state.time.compacted || options?.stripMedia ? [] : (part.state.attachments ?? [])

              // For providers that don't support media in tool results, extract media files
              // (images, PDFs) to be sent as a separate user message
              const mediaAttachments = attachments.filter((a) => isMedia(a.mime))
              const nonMediaAttachments = attachments.filter((a) => !isMedia(a.mime))
              if (!supportsMediaInToolResults && mediaAttachments.length > 0) {
                media.push(...mediaAttachments)
              }
              const finalAttachments = supportsMediaInToolResults ? attachments : nonMediaAttachments

              const output =
                finalAttachments.length > 0
                  ? {
                      text: outputText,
                      attachments: finalAttachments,
                    }
                  : outputText

              assistantMessage.parts.push({
                type: ("tool-" + part.tool) as `tool-${string}`,
                state: "output-available",
                toolCallId: part.callID,
                input: part.state.input,
                output,
                ...(part.metadata?.providerExecuted ? { providerExecuted: true } : {}),
                ...(differentModel ? {} : { callProviderMetadata: providerMeta(part.metadata) }),
              })
            }
            if (part.state.status === "error") {
              const output = part.state.metadata?.interrupted === true ? part.state.metadata.output : undefined
              // Sanitize Kolbo auth-expired errors before the model sees them
              // (see KOLBO_AUTH_SANITIZED_MESSAGE for rationale).
              const errorText = part.state.error ?? ""
              const isKolboAuthExpired =
                isKolboTool(part.tool) &&
                (looksLikeKolboAuthError(errorText) ||
                  (typeof output === "string" && looksLikeKolboAuthError(output)))
              if (isKolboAuthExpired) {
                assistantMessage.parts.push({
                  type: ("tool-" + part.tool) as `tool-${string}`,
                  state: "output-available",
                  toolCallId: part.callID,
                  input: part.state.input,
                  output: KOLBO_AUTH_SANITIZED_MESSAGE,
                  ...(part.metadata?.providerExecuted ? { providerExecuted: true } : {}),
                  ...(differentModel ? {} : { callProviderMetadata: providerMeta(part.metadata) }),
                })
              } else if (typeof output === "string") {
                assistantMessage.parts.push({
                  type: ("tool-" + part.tool) as `tool-${string}`,
                  state: "output-available",
                  toolCallId: part.callID,
                  input: part.state.input,
                  output,
                  ...(part.metadata?.providerExecuted ? { providerExecuted: true } : {}),
                  ...(differentModel ? {} : { callProviderMetadata: providerMeta(part.metadata) }),
                })
              } else {
                assistantMessage.parts.push({
                  type: ("tool-" + part.tool) as `tool-${string}`,
                  state: "output-error",
                  toolCallId: part.callID,
                  input: part.state.input,
                  errorText: part.state.error,
                  ...(part.metadata?.providerExecuted ? { providerExecuted: true } : {}),
                  ...(differentModel ? {} : { callProviderMetadata: providerMeta(part.metadata) }),
                })
              }
            }
            // Handle pending/running tool calls to prevent dangling tool_use blocks
            // Anthropic/Claude APIs require every tool_use to have a corresponding tool_result
            if (part.state.status === "pending" || part.state.status === "running")
              assistantMessage.parts.push({
                type: ("tool-" + part.tool) as `tool-${string}`,
                state: "output-error",
                toolCallId: part.callID,
                input: part.state.input,
                errorText: "[Tool execution was interrupted]",
                ...(part.metadata?.providerExecuted ? { providerExecuted: true } : {}),
                ...(differentModel ? {} : { callProviderMetadata: providerMeta(part.metadata) }),
              })
          }
          if (part.type === "reasoning") {
            assistantMessage.parts.push({
              type: "reasoning",
              text: part.text,
              ...(differentModel ? {} : { providerMetadata: part.metadata }),
            })
          }
        }
        if (assistantMessage.parts.length > 0) {
          result.push(assistantMessage)
          // Inject pending media as a user message for providers that don't support
          // media (images, PDFs) in tool results
          if (media.length > 0) {
            result.push({
              id: MessageID.ascending(),
              role: "user",
              parts: [
                {
                  type: "text" as const,
                  text: "Attached image(s) from tool result:",
                },
                ...media.map((attachment) => ({
                  type: "file" as const,
                  url: attachment.url,
                  mediaType: attachment.mime,
                })),
              ],
            })
          }
        }
      }
    }

    const tools = Object.fromEntries(Array.from(toolNames).map((toolName) => [toolName, { toModelOutput }]))

    return yield* Effect.promise(() =>
      convertToModelMessages(
        result.filter((msg) => msg.parts.some((part) => part.type !== "step-start")),
        {
          //@ts-expect-error (convertToModelMessages expects a ToolSet but only actually needs tools[name]?.toModelOutput)
          tools,
        },
      ),
    )
  })

  export function toModelMessages(
    input: WithParts[],
    model: Provider.Model,
    options?: { stripMedia?: boolean },
  ): Promise<ModelMessage[]> {
    return Effect.runPromise(toModelMessagesEffect(input, model, options))
  }

  export function page(input: { sessionID: SessionID; limit: number; before?: string }) {
    const before = input.before ? cursor.decode(input.before) : undefined
    const where = before
      ? and(eq(MessageTable.session_id, input.sessionID), older(before))
      : eq(MessageTable.session_id, input.sessionID)
    const rows = Database.use((db) =>
      db
        .select()
        .from(MessageTable)
        .where(where)
        .orderBy(desc(MessageTable.time_created), desc(MessageTable.id))
        .limit(input.limit + 1)
        .all(),
    )
    if (rows.length === 0) {
      const row = Database.use((db) =>
        db.select({ id: SessionTable.id }).from(SessionTable).where(eq(SessionTable.id, input.sessionID)).get(),
      )
      if (!row) throw new NotFoundError({ message: `Session not found: ${input.sessionID}` })
      return {
        items: [] as MessageV2.WithParts[],
        more: false,
      }
    }

    const more = rows.length > input.limit
    const slice = more ? rows.slice(0, input.limit) : rows
    const items = hydrate(slice)
    items.reverse()
    const tail = slice.at(-1)
    return {
      items,
      more,
      cursor: more && tail ? cursor.encode({ id: tail.id, time: tail.time_created }) : undefined,
    }
  }

  export function* stream(sessionID: SessionID) {
    const size = 50
    let before: string | undefined
    while (true) {
      const next = page({ sessionID, limit: size, before })
      if (next.items.length === 0) break
      for (let i = next.items.length - 1; i >= 0; i--) {
        yield next.items[i]
      }
      if (!next.more || !next.cursor) break
      before = next.cursor
    }
  }

  export function parts(message_id: MessageID) {
    const rows = Database.use((db) =>
      db.select().from(PartTable).where(eq(PartTable.message_id, message_id)).orderBy(PartTable.id).all(),
    )
    return rows.map(
      (row) =>
        ({
          ...row.data,
          id: row.id,
          sessionID: row.session_id,
          messageID: row.message_id,
        }) as MessageV2.Part,
    )
  }

  export function get(input: { sessionID: SessionID; messageID: MessageID }): WithParts {
    const row = Database.use((db) =>
      db
        .select()
        .from(MessageTable)
        .where(and(eq(MessageTable.id, input.messageID), eq(MessageTable.session_id, input.sessionID)))
        .get(),
    )
    if (!row) throw new NotFoundError({ message: `Message not found: ${input.messageID}` })
    return {
      info: info(row),
      parts: parts(input.messageID),
    }
  }

  export function filterCompacted(msgs: Iterable<MessageV2.WithParts>) {
    const result = [] as MessageV2.WithParts[]
    const completed = new Set<string>()
    for (const msg of msgs) {
      result.push(msg)
      if (
        msg.info.role === "user" &&
        completed.has(msg.info.id) &&
        msg.parts.some((part) => part.type === "compaction")
      )
        break
      if (msg.info.role === "assistant" && msg.info.summary && msg.info.finish && !msg.info.error)
        completed.add(msg.info.parentID)
    }
    result.reverse()
    return result
  }

  export const filterCompactedEffect = Effect.fnUntraced(function* (sessionID: SessionID) {
    return filterCompacted(stream(sessionID))
  })

  // Surfaced as the typed error message AND matched by SessionRetry to keep
  // self-healing semantics in sync — see retry.ts.
  export const CONNECTION_INTERRUPTED_MESSAGE = "Connection interrupted"

  // OpenSSL / socket / undici prose patterns. Lives here so retry.ts can match
  // against the same set without drift when a new TLS alert string appears.
  export const TRANSIENT_NETWORK_MESSAGE_RE =
    /SSL alert|tlsv1 alert|ssl3_read_bytes|socket hang up|Connection (?:closed|reset|terminated|aborted)|network is unreachable/i

  // Transient TCP/TLS/socket errors that are safe to retry after a fresh
  // handshake — long-idle keep-alive sockets get torn down upstream
  // (`SSL alert number 80`) and only a new connection clears the state.
  function isTransientNetworkError(e: unknown): boolean {
    if (!(e instanceof Error)) return false
    const code = (e as SystemError).code
    if (code) {
      if (/^(ECONNRESET|ETIMEDOUT|EPIPE|EAI_AGAIN|ENETUNREACH|ENETDOWN|EHOSTUNREACH)$/.test(code)) return true
      if (code.startsWith("UND_ERR_")) return true
    }
    return TRANSIENT_NETWORK_MESSAGE_RE.test(e.message)
  }

  export function fromError(
    e: unknown,
    ctx: { providerID: ProviderID; aborted?: boolean },
  ): NonNullable<Assistant["error"]> {
    switch (true) {
      case e instanceof DOMException && e.name === "AbortError":
        return new MessageV2.AbortedError(
          { message: e.message },
          {
            cause: e,
          },
        ).toObject()
      case MessageV2.OutputLengthError.isInstance(e):
        return e
      case LoadAPIKeyError.isInstance(e):
        return new MessageV2.AuthError(
          {
            providerID: ctx.providerID,
            message: e.message,
          },
          { cause: e },
        ).toObject()
      case isTransientNetworkError(e):
        return new MessageV2.APIError(
          {
            message: CONNECTION_INTERRUPTED_MESSAGE,
            isRetryable: true,
            metadata: {
              code: (e as SystemError).code ?? "",
              syscall: (e as SystemError).syscall ?? "",
              message: (e as Error).message ?? "",
            },
          },
          { cause: e },
        ).toObject()
      case e instanceof Error && (e as FetchDecompressionError).code === "ZlibError":
        if (ctx.aborted) {
          return new MessageV2.AbortedError({ message: e.message }, { cause: e }).toObject()
        }
        return new MessageV2.APIError(
          {
            message: "Response decompression failed",
            isRetryable: true,
            metadata: {
              code: (e as FetchDecompressionError).code,
              message: e.message,
            },
          },
          { cause: e },
        ).toObject()
      case APICallError.isInstance(e):
        const parsed = ProviderError.parseAPICallError({
          providerID: ctx.providerID,
          error: e,
        })
        if (parsed.type === "context_overflow") {
          return new MessageV2.ContextOverflowError(
            {
              message: parsed.message,
              responseBody: parsed.responseBody,
            },
            { cause: e },
          ).toObject()
        }

        if (parsed.statusCode === 401) {
          return new MessageV2.AuthError(
            {
              providerID: ctx.providerID,
              message: parsed.message,
            },
            { cause: e },
          ).toObject()
        }

        return new MessageV2.APIError(
          {
            message: parsed.message,
            statusCode: parsed.statusCode,
            isRetryable: parsed.isRetryable,
            responseHeaders: parsed.responseHeaders,
            responseBody: parsed.responseBody,
            metadata: parsed.metadata,
          },
          { cause: e },
        ).toObject()
      case e instanceof Error && ctx.providerID === "kolbo" && /unable to connect|cannot connect|ECONNREFUSED|ENOTFOUND|fetch failed/i.test(e.message):
        // For the Kolbo provider, connection-level errors almost always mean an
        // expired or revoked token (the Kolbo API is always reachable). Map to
        // AuthError so the re-auth dialog shows automatically.
        return new MessageV2.AuthError(
          {
            providerID: ctx.providerID,
            message: e.message,
          },
          { cause: e },
        ).toObject()
      case e instanceof Error:
        return new NamedError.Unknown({ message: errorMessage(e) }, { cause: e }).toObject()
      default:
        try {
          const parsed = ProviderError.parseStreamError(e)
          if (parsed) {
            if (parsed.type === "context_overflow") {
              return new MessageV2.ContextOverflowError(
                {
                  message: parsed.message,
                  responseBody: parsed.responseBody,
                },
                { cause: e },
              ).toObject()
            }
            return new MessageV2.APIError(
              {
                message: parsed.message,
                isRetryable: parsed.isRetryable,
                responseBody: parsed.responseBody,
              },
              {
                cause: e,
              },
            ).toObject()
          }
        } catch {}
        return new NamedError.Unknown({ message: JSON.stringify(e) }, { cause: e }).toObject()
    }
  }
}
