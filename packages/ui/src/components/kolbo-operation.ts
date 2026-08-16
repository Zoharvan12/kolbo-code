/**
 * Host-side reader for the shared Kolbo operation envelope.
 * Walks `params` / `outputs` / `actions` only — never inspects a tool name.
 */

export const SCHEMA = "kolbo.operation/1"

export type Kind = "image" | "video" | "audio" | "model3d"
export type Phase = "review" | "running" | "completed" | "failed"

export type Param = {
  id: string
  type: string
  value?: unknown
  options?: string[]
  required?: boolean
}

export type Media = {
  url: string
  kind?: Kind | string
  thumbnail?: string
  mime?: string
}

export type Action = {
  id: string
  label: string
  tool: string
  args?: Record<string, unknown>
}

export type Operation = {
  schema: typeof SCHEMA
  id: string
  kind: Kind | string
  route: string
  phase: Phase | string
  title: string
  model: { id: string; name?: string }
  prompt?: string
  preview?: string
  estimate?: number
  cost?: number
  error?: string
  params: Param[]
  outputs: Media[]
  actions: Action[]
  progress?: { pct?: number; label?: string }
}

function json(value: string): unknown {
  return JSON.parse(value)
}

function record(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object") return
  return value as Record<string, unknown>
}

function unwrap(value: unknown): Record<string, unknown> | undefined {
  if (typeof value === "string") {
    const text = value.trim()
    if (!text.startsWith("{")) return
    return unwrap(json(text))
  }
  const obj = record(value)
  if (!obj) return
  if (obj.schema === SCHEMA) return obj
  return unwrap(obj.operation)
}

function str(value: unknown): string {
  return typeof value === "string" ? value : ""
}

function num(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function paramsOf(value: unknown): Param[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    const obj = record(item)
    if (!obj || typeof obj.id !== "string") return []
    return [
      {
        id: obj.id,
        type: str(obj.type) || "string",
        ...(obj.value !== undefined ? { value: obj.value } : {}),
        ...(Array.isArray(obj.options) ? { options: obj.options.filter((x): x is string => typeof x === "string") } : {}),
        ...(obj.required === true ? { required: true } : {}),
      },
    ]
  })
}

function outputsOf(value: unknown): Media[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    const obj = record(item)
    if (!obj || typeof obj.url !== "string") return []
    return [
      {
        url: obj.url,
        ...(obj.kind ? { kind: str(obj.kind) } : {}),
        ...(typeof obj.thumbnail === "string" ? { thumbnail: obj.thumbnail } : {}),
        ...(typeof obj.mime === "string" ? { mime: obj.mime } : {}),
      },
    ]
  })
}

function actionsOf(value: unknown): Action[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    const obj = record(item)
    if (!obj || typeof obj.id !== "string" || typeof obj.label !== "string") return []
    return [
      {
        id: obj.id,
        label: obj.label,
        tool: str(obj.tool),
        ...(record(obj.args) ? { args: record(obj.args) } : {}),
      },
    ]
  })
}

export function parse(value: unknown): Operation | undefined {
  const obj = unwrap(value)
  if (!obj) return
  const model = record(obj.model) ?? {}
  return {
    schema: SCHEMA,
    id: str(obj.id),
    kind: str(obj.kind) || "image",
    route: str(obj.route),
    phase: str(obj.phase) || "review",
    title: str(obj.title),
    model: {
      id: str(model.id),
      ...(typeof model.name === "string" ? { name: model.name } : {}),
    },
    ...(typeof obj.prompt === "string" ? { prompt: obj.prompt } : {}),
    ...(typeof obj.preview === "string" ? { preview: obj.preview } : {}),
    ...(num(obj.estimate) !== undefined ? { estimate: num(obj.estimate) } : {}),
    ...(num(obj.cost) !== undefined ? { cost: num(obj.cost) } : {}),
    ...(typeof obj.error === "string" ? { error: obj.error } : {}),
    params: paramsOf(obj.params),
    outputs: outputsOf(obj.outputs),
    actions: actionsOf(obj.actions),
    ...(record(obj.progress)
      ? {
          progress: {
            ...(num(record(obj.progress)!.pct) !== undefined ? { pct: num(record(obj.progress)!.pct) } : {}),
            ...(typeof record(obj.progress)!.label === "string" ? { label: String(record(obj.progress)!.label) } : {}),
          },
        }
      : {}),
  }
}

export function read(output?: string, metadata?: Record<string, unknown>): Operation | undefined {
  return parse(output) ?? parse(metadata)
}

export function costOf(op: Operation | undefined, raw?: unknown): number | undefined {
  if (typeof op?.cost === "number") return op.cost
  if (typeof op?.estimate === "number") return op.estimate
  const obj = typeof raw === "string" ? record(raw.startsWith("{") ? json(raw) : undefined) : record(raw)
  if (!obj) return
  return num(obj.cost) ?? num(obj.cost_credits) ?? num(obj.credits_used)
}

export function urlsOf(op: Operation | undefined): string[] {
  if (!op) return []
  return op.outputs.map((item) => item.url).filter(Boolean)
}

export function player(op: Operation): "image" | "video" | "audio" | "model3d" {
  if (op.kind === "audio" || op.kind === "video" || op.kind === "model3d" || op.kind === "image") return op.kind
  const mime = op.outputs[0]?.mime
  if (typeof mime === "string") {
    if (mime.startsWith("audio/")) return "audio"
    if (mime.startsWith("video/")) return "video"
    if (mime.includes("model") || mime.includes("gltf") || mime.includes("glb")) return "model3d"
  }
  return "image"
}

export function card(op: Operation) {
  return {
    title: op.title,
    phase: op.phase,
    kind: op.kind,
    player: player(op),
    params: op.params,
    actions: op.actions,
    outputs: op.outputs,
    cost: op.cost,
    estimate: op.estimate,
    preview: op.preview,
    prompt: op.prompt,
    progress: op.progress,
    id: op.id,
    model: op.model,
    error: op.error,
  }
}

export function advertised(value: unknown): boolean {
  return !!parse(value)
}
