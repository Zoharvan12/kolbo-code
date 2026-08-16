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
  try {
    return JSON.parse(value)
  } catch {
    return
  }
}

function record(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object") return
  return value as Record<string, unknown>
}

function http(value: unknown): string[] {
  if (typeof value === "string" && /^https?:\/\//.test(value)) return [value]
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === "string" && /^https?:\/\//.test(item))
}

function mediaUrls(obj: Record<string, unknown>): string[] {
  for (const key of ["urls", "image_urls", "video_urls", "audio_urls", "model_urls"]) {
    const found = http(obj[key])
    if (found.length) return found
  }
  const nested = record(obj.result)
  return nested ? mediaUrls(nested) : []
}

function kindOf(obj: Record<string, unknown>, urls: string[]): string {
  const kind = str(obj.kind)
  if (kind) return kind
  const first = (urls[0] || "").split("?")[0].toLowerCase()
  if (/\.(mp4|mov|webm|mkv)$/.test(first)) return "video"
  if (/\.(mp3|wav|m4a|aac|ogg|flac)$/.test(first)) return "audio"
  if (/\.(glb|gltf|fbx|obj|usdz)$/.test(first)) return "model3d"
  return "image"
}

function marked(obj: Record<string, unknown>, urls: string[], cost: number | undefined, id: string) {
  if (obj.schema === SCHEMA) return true
  if (cost !== undefined) return true
  if (id) return true
  if (typeof obj.widget === "string") return obj.widget === "generation" || obj.widget === "transcript"
  if (["review", "running", "generating", "completed", "failed"].includes(str(obj.phase))) return true
  if (Array.isArray(obj.outputs) && obj.outputs.length > 0) return true
  return urls.length > 0 && typeof obj.model === "string"
}

function lift(obj: Record<string, unknown>): Record<string, unknown> | undefined {
  if (obj.schema === SCHEMA) return obj
  const inner = record(obj.operation)
  if (inner) return lift(inner)
  const sc = record(obj.structuredContent)
  if (sc) return lift(sc)

  const urls = mediaUrls(obj)
  const cost = num(obj.cost) ?? num(obj.cost_credits) ?? num(obj.credits_used)
  const id = str(obj.id) || str(obj.generation_id)
  if (!marked(obj, urls, cost, id)) return

  const modelRaw = obj.model
  const model = typeof modelRaw === "string" ? { id: modelRaw } : (record(modelRaw) ?? {})
  const prompt = typeof obj.prompt === "string" ? obj.prompt : str(obj.prompt_used)
  return {
    schema: SCHEMA,
    id,
    kind: kindOf(obj, urls),
    route: str(obj.route) || str(obj.tool),
    phase: str(obj.phase) === "generating" ? "running" : str(obj.phase) || (urls.length ? "completed" : "running"),
    title: str(obj.title) || "Generation",
    model,
    ...(prompt ? { prompt } : {}),
    ...(cost !== undefined ? { cost } : {}),
    params: Array.isArray(obj.params) ? obj.params : [],
    outputs: urls.length ? urls.map((url) => ({ url, kind: kindOf(obj, urls) })) : obj.outputs,
    actions: Array.isArray(obj.actions) ? obj.actions : [],
  }
}

function unwrap(value: unknown): Record<string, unknown> | undefined {
  if (typeof value === "string") {
    const text = value.trim()
    if (!text.startsWith("{")) return
    return unwrap(json(text))
  }
  const obj = record(value)
  if (!obj) return
  return lift(obj)
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
  return parse(output) ?? parse(metadata?.structuredContent) ?? parse(metadata)
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
