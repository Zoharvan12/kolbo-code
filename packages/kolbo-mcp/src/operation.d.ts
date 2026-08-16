export const SCHEMA: "kolbo.operation/1"

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

export function operation(input: Partial<Operation> & { phase?: string }): Operation
export function describe(tool: string, args?: Record<string, unknown>): Operation | null
export function complete(
  tool: string,
  args: Record<string, unknown> | undefined,
  result: Record<string, unknown> | undefined,
  payload?: Record<string, unknown>,
  phase?: string,
): Operation
export function pack(payload: Record<string, unknown> | undefined, env: Operation): { content: Array<{ type: "text"; text: string }> }
export function finish(
  tool: string,
  args: Record<string, unknown> | undefined,
  result: Record<string, unknown> | undefined,
  payload?: Record<string, unknown>,
  phase?: string,
): { content: Array<{ type: "text"; text: string }> }
export function basename(tool: string): string
export function known(tool: string): boolean
