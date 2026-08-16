/**
 * Shared Kolbo generation contract — `kolbo.operation/1`.
 *
 * MCP owns every capability (tools, knobs, models, next-actions). Hosts
 * (Kolbo Code, Claude, …) paint the same envelope in their own design.
 * Adding a tool / knob / action is an MCP-only change.
 */

const SCHEMA = "kolbo.operation/1"

const KINDS = new Set(["image", "video", "audio", "model3d"])

const RATIOS = ["1:1", "9:16", "16:9", "4:5", "3:2", "2:3", "3:4", "21:9"]
const IMG_RES = ["1K", "2K", "3K", "4K"]
const VID_RES = ["720p", "1080p", "1440p", "2160p"]

function titleize(name) {
  return String(name || "")
    .replace(/^(kolbo_|mcp__kolbo__)/, "")
    .replace(/_/g, " ")
    .replace(/^./, (c) => c.toUpperCase())
}

function basename(tool) {
  const s = String(tool || "")
  if (s.startsWith("kolbo_")) return s.slice("kolbo_".length)
  if (s.startsWith("mcp__kolbo__")) return s.slice("mcp__kolbo__".length)
  const colon = s.lastIndexOf(":")
  if (colon >= 0) return s.slice(colon + 1)
  return s
}

function firstUrl(value) {
  if (typeof value === "string" && /^https?:\/\//.test(value)) return value
  if (!Array.isArray(value)) return
  return value.find((item) => typeof item === "string" && /^https?:\/\//.test(item))
}

function promptOf(args) {
  for (const key of ["prompt", "text", "text_prompt", "description", "edit_prompt"]) {
    if (typeof args[key] === "string" && args[key]) return args[key]
  }
}

function skipKeys() {
  return new Set([
    "prompt",
    "text",
    "text_prompt",
    "description",
    "edit_prompt",
    "model",
    "reference_images",
    "source_images",
    "source_video",
    "reference_videos",
    "image_url",
    "video_url",
    "audio_url",
    "audio",
    "source",
    "files",
    "visual_dna_ids",
    "moodboard_id",
    "moodboard_ids",
    "preset_id",
    "session_id",
    "first_frame_url",
    "last_frame_url",
    "first_frame",
    "last_frame",
    "elements",
  ])
}

function knobs(spec, args) {
  const seen = new Set()
  const out = []
  for (const knob of spec.knobs || []) {
    seen.add(knob.id)
    const value = args[knob.id] ?? knob.value
    out.push({
      id: knob.id,
      type: knob.type,
      ...(Array.isArray(knob.options) ? { options: knob.options } : {}),
      required: !!knob.required,
      ...(value !== undefined ? { value } : {}),
    })
  }
  for (const [id, raw] of Object.entries(args || {})) {
    if (seen.has(id) || skipKeys().has(id)) continue
    const type = typeof raw
    if (type !== "string" && type !== "number" && type !== "boolean") continue
    out.push({ id, type, value: raw })
  }
  return out
}

function media(urls, kind, thumb) {
  return (urls || [])
    .filter((url) => typeof url === "string" && url.length > 0)
    .map((url) => ({
      url,
      kind,
      ...(thumb ? { thumbnail: thumb } : {}),
    }))
}

function urlsOf(result, payload) {
  if (Array.isArray(payload?.urls) && payload.urls.length) return payload.urls.filter((u) => typeof u === "string")
  if (Array.isArray(result?.result?.urls) && result.result.urls.length) {
    return result.result.urls.filter((u) => typeof u === "string")
  }
  if (Array.isArray(payload?.scenes)) {
    return payload.scenes.flatMap((scene) => [
      ...(Array.isArray(scene.image_urls) ? scene.image_urls : []),
      ...(Array.isArray(scene.video_urls) ? scene.video_urls : []),
    ]).filter((u) => typeof u === "string")
  }
  return []
}

function costOf(result, payload) {
  if (typeof result?.credits_used === "number") return result.credits_used
  if (typeof payload?.credits_used === "number") return payload.credits_used
  if (typeof payload?.cost_credits === "number") return payload.cost_credits
}

function previewOf(spec, args, payload, result) {
  return (
    spec.preview?.(args || {}) ||
    (typeof payload?.thumbnail_url === "string" ? payload.thumbnail_url : undefined) ||
    (typeof result?.result?.thumbnail_url === "string" ? result.result.thumbnail_url : undefined)
  )
}

const SPECS = {
  generate_image: {
    kind: "image",
    route: "text_to_img",
    title: "Text to image",
    knobs: [
      { id: "aspect_ratio", type: "enum", options: RATIOS },
      { id: "resolution", type: "enum", options: IMG_RES },
      { id: "num_images", type: "number" },
    ],
    preview: (args) => firstUrl(args.reference_images),
    actions: (urls) => [
      { id: "edit", label: "Edit", tool: "generate_image_edit", args: { source_images: urls.slice(0, 1) } },
      { id: "animate", label: "Animate", tool: "generate_video_from_image", args: { image_url: urls[0] } },
    ],
  },
  generate_image_edit: {
    kind: "image",
    route: "image_editing",
    title: "Edit image",
    knobs: [
      { id: "aspect_ratio", type: "enum", options: RATIOS },
      { id: "resolution", type: "enum", options: IMG_RES },
      { id: "num_images", type: "number" },
    ],
    preview: (args) => firstUrl(args.source_images),
    actions: (urls) => [
      { id: "edit", label: "Edit again", tool: "generate_image_edit", args: { source_images: urls.slice(0, 1) } },
      { id: "animate", label: "Animate", tool: "generate_video_from_image", args: { image_url: urls[0] } },
    ],
  },
  generate_creative_director: {
    kind: "image",
    route: "text_to_img",
    title: "Creative director",
    knobs: [
      { id: "scene_count", type: "number" },
      { id: "aspect_ratio", type: "enum", options: RATIOS },
      { id: "resolution", type: "enum", options: [...IMG_RES, ...VID_RES] },
      { id: "duration", type: "number" },
      { id: "workflow_type", type: "enum", options: ["image", "video"] },
    ],
    preview: (args) => firstUrl(args.reference_images),
    actions: (urls) => [
      { id: "edit", label: "Edit scene", tool: "generate_image_edit", args: { source_images: urls.slice(0, 1) } },
    ],
  },
  generate_video: {
    kind: "video",
    route: "text_to_video",
    title: "Text to video",
    knobs: [
      { id: "aspect_ratio", type: "enum", options: RATIOS },
      { id: "resolution", type: "enum", options: VID_RES },
      { id: "duration", type: "number" },
    ],
    preview: (args) => firstUrl(args.reference_images),
    actions: (urls) => [
      { id: "edit", label: "Edit", tool: "edit_video", args: { video_url: urls[0] } },
      { id: "restyle", label: "Restyle", tool: "generate_video_from_video", args: { source_video: urls[0] } },
    ],
  },
  generate_video_from_image: {
    kind: "video",
    route: "img_to_video",
    title: "Image to video",
    knobs: [
      { id: "aspect_ratio", type: "enum", options: RATIOS },
      { id: "resolution", type: "enum", options: VID_RES },
      { id: "duration", type: "number" },
    ],
    preview: (args) => firstUrl(args.image_url),
    actions: (urls) => [
      { id: "edit", label: "Edit", tool: "edit_video", args: { video_url: urls[0] } },
      { id: "restyle", label: "Restyle", tool: "generate_video_from_video", args: { source_video: urls[0] } },
    ],
  },
  generate_video_from_video: {
    kind: "video",
    route: "video_to_video",
    title: "Video to video",
    knobs: [
      { id: "aspect_ratio", type: "enum", options: RATIOS },
      { id: "resolution", type: "enum", options: VID_RES },
      { id: "duration", type: "number" },
    ],
    preview: (args) => firstUrl(args.source_video),
    actions: (urls) => [
      { id: "edit", label: "Edit", tool: "edit_video", args: { video_url: urls[0] } },
    ],
  },
  generate_elements: {
    kind: "video",
    route: "elements",
    title: "Elements",
    knobs: [
      { id: "aspect_ratio", type: "enum", options: RATIOS },
      { id: "resolution", type: "enum", options: VID_RES },
      { id: "duration", type: "number" },
    ],
    preview: (args) => firstUrl(args.reference_images),
    actions: (urls) => [
      { id: "edit", label: "Edit", tool: "edit_video", args: { video_url: urls[0] } },
    ],
  },
  generate_first_last_frame: {
    kind: "video",
    route: "firstlastgenerations",
    title: "First last frame",
    knobs: [
      { id: "aspect_ratio", type: "enum", options: RATIOS },
      { id: "resolution", type: "enum", options: VID_RES },
      { id: "duration", type: "number" },
    ],
    preview: (args) => firstUrl(args.first_frame_url) || firstUrl(args.first_frame),
    actions: (urls) => [
      { id: "edit", label: "Edit", tool: "edit_video", args: { video_url: urls[0] } },
    ],
  },
  generate_lipsync: {
    kind: "video",
    route: "lipsync-video",
    title: "Lipsync",
    knobs: [],
    preview: (args) => firstUrl(args.source),
    actions: (urls) => [
      { id: "edit", label: "Edit", tool: "edit_video", args: { video_url: urls[0] } },
    ],
  },
  generate_music: {
    kind: "audio",
    route: "music_gen",
    title: "Music",
    knobs: [
      { id: "instrumental", type: "boolean" },
      { id: "vocal_gender", type: "enum", options: ["male", "female"] },
    ],
    actions: () => [],
  },
  generate_speech: {
    kind: "audio",
    route: "text_to_speech",
    title: "Speech",
    knobs: [{ id: "language", type: "string" }],
    actions: () => [],
  },
  generate_sound: {
    kind: "audio",
    route: "text_to_sound",
    title: "Sound",
    knobs: [{ id: "duration", type: "number" }],
    actions: () => [],
  },
  generate_3d: {
    kind: "model3d",
    route: "3d_text_to_model",
    title: "3D model",
    knobs: [
      { id: "mode", type: "enum", options: ["text", "single", "multi"] },
      { id: "topology", type: "string" },
    ],
    preview: (args) => firstUrl(args.reference_images),
    actions: () => [],
  },
  edit_image: {
    kind: "image",
    route: "image_editing",
    title: "Edit image",
    knobs: [
      { id: "operation", type: "enum", options: ["upscale", "reframe", "removebg", "enhance_skin", "magic_edit"], required: true },
      { id: "aspect_ratio", type: "enum", options: RATIOS },
      { id: "scale", type: "number" },
    ],
    preview: (args) => firstUrl(args.image_url),
    actions: (urls) => [
      { id: "edit", label: "Edit again", tool: "edit_image", args: { image_url: urls[0] } },
    ],
  },
  edit_video: {
    kind: "video",
    route: "video_to_video",
    title: "Edit video",
    knobs: [
      { id: "operation", type: "enum", options: ["upscale", "reframe", "generate_audio", "remove_watermark", "face_swap", "extend", "magic_edit", "lipsync"], required: true },
      { id: "aspect_ratio", type: "enum", options: RATIOS },
      { id: "duration", type: "number" },
    ],
    preview: (args) => firstUrl(args.video_url),
    actions: (urls) => [
      { id: "edit", label: "Edit again", tool: "edit_video", args: { video_url: urls[0] } },
    ],
  },
  get_generation_status: {
    kind: "image",
    route: "status",
    title: "Generation",
    knobs: [],
    actions: (urls, args, kind) => {
      if (kind === "video") {
        return [{ id: "edit", label: "Edit", tool: "edit_video", args: { video_url: urls[0] } }]
      }
      if (kind === "image") {
        return [{ id: "edit", label: "Edit", tool: "generate_image_edit", args: { source_images: urls.slice(0, 1) } }]
      }
      return []
    },
  },
}

function infer(name) {
  const n = String(name || "").toLowerCase()
  const kind = n.includes("3d")
    ? "model3d"
    : n.includes("music") || n.includes("speech") || n.includes("sound") || n.includes("audio") || n.includes("voice")
      ? "audio"
      : n.includes("video") || n.includes("lipsync") || n.includes("elements") || n.includes("frame")
        ? "video"
        : "image"
  return {
    kind,
    route: name,
    title: titleize(name),
    knobs: [],
    preview: (args) =>
      firstUrl(args.image_url) ||
      firstUrl(args.source_images) ||
      firstUrl(args.reference_images) ||
      firstUrl(args.video_url) ||
      firstUrl(args.source_video),
    actions: () => [],
  }
}

function specOf(tool) {
  const name = basename(tool)
  const spec = SPECS[name] || infer(name)
  return { ...spec, knobs: spec.knobs || [] }
}

function known(tool) {
  return !!SPECS[basename(tool)]
}

function operation(input) {
  const kind = KINDS.has(input.kind) ? input.kind : "image"
  const model = input.model && typeof input.model === "object" ? input.model : { id: "" }
  return {
    schema: SCHEMA,
    id: String(input.id || ""),
    kind,
    route: String(input.route || ""),
    phase: String(input.phase || "review"),
    title: String(input.title || ""),
    model: {
      id: String(model.id || ""),
      ...(model.name ? { name: String(model.name) } : {}),
    },
    ...(input.prompt ? { prompt: String(input.prompt) } : {}),
    ...(input.preview ? { preview: String(input.preview) } : {}),
    ...(typeof input.estimate === "number" ? { estimate: input.estimate } : {}),
    ...(typeof input.cost === "number" ? { cost: input.cost } : {}),
    ...(input.error ? { error: String(input.error) } : {}),
    params: Array.isArray(input.params) ? input.params : [],
    outputs: Array.isArray(input.outputs) ? input.outputs : [],
    actions: Array.isArray(input.actions) ? input.actions : [],
    ...(input.progress ? { progress: input.progress } : {}),
  }
}

function describe(tool, args) {
  const name = basename(tool)
  if (!SPECS[name] && !inferable(name)) return null
  const spec = specOf(tool)
  const input = args && typeof args === "object" ? args : {}
  if (name === "generate_creative_director" && input.workflow_type === "video") {
    spec.kind = "video"
    spec.route = "text_to_video"
  }
  return operation({
    phase: "review",
    id: typeof input.generation_id === "string" ? input.generation_id : "",
    kind: spec.kind,
    route: spec.route,
    title: spec.title,
    model: { id: typeof input.model === "string" ? input.model : "" },
    prompt: promptOf(input),
    preview: spec.preview?.(input),
    params: knobs(spec, input),
    outputs: [],
    actions: [],
  })
}

function inferable(name) {
  return /^(generate_|edit_)/.test(name) || name === "get_generation_status"
}

function kindFrom(result, spec) {
  const type = String(result?.type || result?.result?.type || "").toLowerCase()
  if (type.includes("video")) return "video"
  if (type.includes("audio") || type.includes("music") || type.includes("speech") || type.includes("sound")) return "audio"
  if (type.includes("3d") || type.includes("model")) return "model3d"
  if (type.includes("image")) return "image"
  return spec.kind
}

function complete(tool, args, result, payload, phase) {
  const spec = specOf(tool)
  const input = args && typeof args === "object" ? args : {}
  const body = payload && typeof payload === "object" ? payload : {}
  if (basename(tool) === "generate_creative_director" && (input.workflow_type === "video" || body.scenes?.some((s) => s.video_urls?.length))) {
    spec.kind = "video"
    spec.route = "text_to_video"
  }
  const kind = kindFrom(result, spec)
  const id =
    (typeof result?.generation_id === "string" && result.generation_id) ||
    (typeof body.generation_id === "string" && body.generation_id) ||
    (typeof result?.id === "string" && result.id) ||
    ""
  const urls = urlsOf(result, body)
  const modelId = body.model || result?.result?.model || input.model || ""
  const thumb = previewOf(spec, input, body, result)
  const next = typeof spec.actions === "function" ? spec.actions(urls, input, kind) : []
  return operation({
    phase: phase || "completed",
    id,
    kind,
    route: spec.route === "status" ? (result?.type || spec.route) : spec.route,
    title: spec.title,
    model: { id: String(modelId) },
    prompt: (typeof body.prompt_used === "string" && body.prompt_used) || promptOf(input),
    preview: thumb,
    cost: costOf(result, body),
    error: result?.error || body.error,
    params: knobs(spec, input),
    outputs: media(urls, kind, thumb),
    actions: (phase || "completed") === "completed" ? next : [],
    progress: body.progress,
  })
}

function pack(payload, env) {
  const body = payload && typeof payload === "object" ? payload : {}
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            ...body,
            generation_id: env.id || body.generation_id,
            credits_used: env.cost ?? body.credits_used,
            cost_credits: env.cost ?? body.credits_used ?? body.cost_credits,
            ...env,
          },
          null,
          2,
        ),
      },
    ],
  }
}

function finish(tool, args, result, payload, phase) {
  return pack(payload, complete(tool, args, result, payload, phase))
}

module.exports = {
  SCHEMA,
  SPECS,
  operation,
  describe,
  complete,
  pack,
  finish,
  basename,
  known,
}
