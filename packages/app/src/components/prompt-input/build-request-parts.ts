import { getFilename } from "@opencode-ai/util/path"
import { type AgentPartInput, type FilePartInput, type Part, type TextPartInput } from "@opencode-ai/sdk/v2/client"
import type { FileSelection } from "@/context/file"
import { encodeFilePath } from "@/context/file/path"
import type { AgentPart, FileAttachmentPart, ImageAttachmentPart, KolboAssetPart, Prompt } from "@/context/prompt"
import { Identifier } from "@/utils/id"
import { createCommentMetadata, formatCommentNote } from "@/utils/comment-note"
import { mediaLabels } from "./media-labels"

type PromptRequestPart = (TextPartInput | FilePartInput | AgentPartInput) & { id: string }

type ContextFile = {
  key: string
  type: "file"
  path: string
  selection?: FileSelection
  comment?: string
  commentID?: string
  commentOrigin?: "review" | "file"
  preview?: string
}

type BuildRequestPartsInput = {
  prompt: Prompt
  context: ContextFile[]
  images: ImageAttachmentPart[]
  text: string
  messageID: string
  sessionID: string
  sessionDirectory: string
  /** Workspace-linked Kolbo platform project (composer chip). Injected as a
   *  synthetic part so the agent passes project_id on every generation call —
   *  omitted entirely for the default "API Generations" bucket. */
  kolboProject?: { id: string; name: string }
}

const absolute = (directory: string, path: string) => {
  if (path.startsWith("/")) return path
  if (/^[A-Za-z]:[\\/]/.test(path) || /^[A-Za-z]:$/.test(path)) return path
  if (path.startsWith("\\\\") || path.startsWith("//")) return path
  return `${directory.replace(/[\\/]+$/, "")}/${path}`
}

const fileQuery = (selection: FileSelection | undefined) =>
  selection ? `?start=${selection.startLine}&end=${selection.endLine}` : ""

const mention = /(^|[\s([{"'])@(\S+)/g

const parseCommentMentions = (comment: string) => {
  return Array.from(comment.matchAll(mention)).flatMap((match) => {
    const path = (match[2] ?? "").replace(/[.,!?;:)}\]"']+$/, "")
    if (!path) return []
    return [path]
  })
}

const isFileAttachment = (part: Prompt[number]): part is FileAttachmentPart => part.type === "file"
const isAgentAttachment = (part: Prompt[number]): part is AgentPart => part.type === "agent"
const isKolboAsset = (part: Prompt[number]): part is KolboAssetPart => part.type === "kolbo-asset"

const IMAGE_EXT_MIME: Record<string, string> = {
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
}

const imageMime = (url: string) => {
  const ext = url.split("?")[0]?.split(".").pop()?.toLowerCase() ?? ""
  return IMAGE_EXT_MIME[ext] ?? "image/jpeg"
}

const toOptimisticPart = (part: PromptRequestPart, sessionID: string, messageID: string): Part => {
  if (part.type === "text") {
    return {
      id: part.id,
      type: "text",
      text: part.text,
      synthetic: part.synthetic,
      ignored: part.ignored,
      time: part.time,
      metadata: part.metadata,
      sessionID,
      messageID,
    }
  }
  if (part.type === "file") {
    return {
      id: part.id,
      type: "file",
      mime: part.mime,
      filename: part.filename,
      url: part.url,
      source: part.source,
      sessionID,
      messageID,
    }
  }
  return {
    id: part.id,
    type: "agent",
    name: part.name,
    source: part.source,
    sessionID,
    messageID,
  }
}

export function buildRequestParts(input: BuildRequestPartsInput) {
  const requestParts: PromptRequestPart[] = [
    {
      id: Identifier.ascending("part"),
      type: "text",
      text: input.text,
    },
  ]

  const files = input.prompt.filter(isFileAttachment).map((attachment) => {
    const path = absolute(input.sessionDirectory, attachment.path)
    return {
      id: Identifier.ascending("part"),
      type: "file",
      mime: "text/plain",
      url: `file://${encodeFilePath(path)}${fileQuery(attachment.selection)}`,
      filename: getFilename(attachment.path),
      source: {
        type: "file",
        text: {
          value: attachment.content,
          start: attachment.start,
          end: attachment.end,
        },
        path,
      },
    } satisfies PromptRequestPart
  })

  const agents = input.prompt.filter(isAgentAttachment).map((attachment) => {
    return {
      id: Identifier.ascending("part"),
      type: "agent",
      name: attachment.name,
      source: {
        value: attachment.content,
        start: attachment.start,
        end: attachment.end,
      },
    } satisfies PromptRequestPart
  })

  const used = new Set(files.map((part) => part.url))
  const context = input.context.flatMap((item) => {
    const path = absolute(input.sessionDirectory, item.path)
    const url = `file://${encodeFilePath(path)}${fileQuery(item.selection)}`
    const comment = item.comment?.trim()
    if (!comment && used.has(url)) return []
    used.add(url)

    const filePart = {
      id: Identifier.ascending("part"),
      type: "file",
      mime: "text/plain",
      url,
      filename: getFilename(item.path),
    } satisfies PromptRequestPart

    if (!comment) return [filePart]

    const mentions = parseCommentMentions(comment).flatMap((path) => {
      const url = `file://${encodeFilePath(absolute(input.sessionDirectory, path))}`
      if (used.has(url)) return []
      used.add(url)
      return [
        {
          id: Identifier.ascending("part"),
          type: "file",
          mime: "text/plain",
          url,
          filename: getFilename(path),
        } satisfies PromptRequestPart,
      ]
    })

    return [
      {
        id: Identifier.ascending("part"),
        type: "text",
        text: formatCommentNote({ path: item.path, selection: item.selection, comment }),
        synthetic: true,
        metadata: createCommentMetadata({
          path: item.path,
          selection: item.selection,
          comment,
          preview: item.preview,
          origin: item.commentOrigin,
        }),
      } satisfies PromptRequestPart,
      filePart,
      ...mentions,
    ]
  })

  // All media (image/video/audio/PDF/text) → sent as multimodal file parts.
  // The backend (provider/transform.ts unsupportedParts) gracefully degrades to
  // a clear "model does not support X" text part when the chosen model can't
  // handle that modality, so we no longer pre-filter on the client.
  const imageParts: PromptRequestPart[] = []
  const imageOptimisticParts: PromptRequestPart[] = []

  // Computed over ALL attachments, not just the ones that made it past the
  // publicUrl guard below, so the numbering matches what the composer shows.
  const handles = mediaLabels(input.images)

  for (const [index, attachment] of input.images.entries()) {
    // Never ship data:/blob: into the session — those bytes stay in every
    // later turn and blow the context window. Wait for the CDN URL.
    const url = attachment.publicUrl
    if (!url || !/^https?:\/\//.test(url)) continue
    const label = attachment.localPath ?? attachment.filename
    const partId = Identifier.ascending("part")
    const filePart: PromptRequestPart = {
      id: partId,
      type: "file",
      mime: attachment.mime,
      url,
      filename: label,
    }
    imageParts.push(filePart)
    imageOptimisticParts.push(filePart)

    const kind = attachment.mime.startsWith("image/")
      ? "Image"
      : attachment.mime.startsWith("video/")
        ? "Video"
        : attachment.mime.startsWith("audio/")
          ? "Audio"
          : attachment.mime === "application/pdf"
            ? "PDF"
            : "File"
    const sourceParts: string[] = []
    if (attachment.localPath) sourceParts.push(`local path: ${attachment.localPath}`)
    if (attachment.publicUrl) sourceParts.push(`URL: ${attachment.publicUrl}`)
    if (sourceParts.length > 0) {
      const notePart: PromptRequestPart = {
        id: Identifier.ascending("part"),
        type: "text",
        // The `@handle` comes first so the model can bind a mention like
        // "@image2" in the prompt text to this specific attachment.
        text: `[@${handles[index]} — ${kind} — ${sourceParts.join(" | ")}]`,
        synthetic: true,
      }
      imageParts.push(notePart)
      imageOptimisticParts.push(notePart)
    }
  }

  // Visual DNA / moodboard mentions. The `@name` / `#name` token already sits in
  // the prompt text (kolbo-api's parsers resolve it there), so what these parts add
  // is the id — VisualDNA.name has no uniqueness constraint and the parser takes
  // first-match, so the name alone can bind the wrong character — plus the reference
  // image, which the server inlines as base64 for http(s) media URLs.
  const kolboAssetParts = input.prompt.filter(isKolboAsset).flatMap((asset): PromptRequestPart[] => {
    const label = asset.kind === "moodboard" ? "Moodboard" : "Visual DNA"
    const field = asset.kind === "moodboard" ? "moodboard_id" : "visual_dna_ids"
    const parts: PromptRequestPart[] = [
      {
        id: Identifier.ascending("part"),
        type: "text",
        text: `[${label} "${asset.content}" → id ${asset.id}. Pass this id as ${field} and keep "${asset.content}" verbatim in the generation prompt.]`,
        synthetic: true,
      },
    ]
    if (asset.thumbnail?.startsWith("http")) {
      parts.push({
        id: Identifier.ascending("part"),
        type: "file",
        mime: imageMime(asset.thumbnail),
        url: asset.thumbnail,
        filename: `${asset.name}.${asset.thumbnail.split("?")[0]?.split(".").pop() ?? "jpg"}`,
      })
    }
    return parts
  })

  // Workspace-linked Kolbo project — same idea as the asset ids above: the
  // binding is per-call on the API, so the agent must be told on EVERY submit,
  // not once per session (context can be compacted away between turns).
  const kolboProjectParts: PromptRequestPart[] = input.kolboProject?.id
    ? [
        {
          id: Identifier.ascending("part"),
          type: "text",
          // Two hard-won constraints encoded here: (1) the binding is per-call
          // on the API and context can be compacted away, so repeat on every
          // submit; (2) kolbo-api's resolveSdkTarget IGNORES project_id when a
          // session_id is passed — a session created under a previous project
          // silently swallows generations after the user switches, so a switch
          // must also mean fresh sessions.
          text: `[Kolbo platform project for this workspace: "${input.kolboProject.name}" → project_id ${input.kolboProject.id}. This SUPERSEDES any earlier project binding in this conversation. Pass project_id: "${input.kolboProject.id}" on EVERY Kolbo generation, upload, and session tool call — it is per-call, never sticky. NEVER reuse a session_id that was created under a different project: the API ignores project_id when session_id is present, so after a project change omit session_id and let a fresh session be created.]`,
          synthetic: true,
        },
      ]
    : []

  requestParts.push(...files, ...context, ...agents, ...kolboAssetParts, ...kolboProjectParts, ...imageParts)

  const optimisticRequestParts = [
    ...requestParts.filter((p) => !imageParts.includes(p)),
    ...imageOptimisticParts,
  ]

  return {
    requestParts,
    optimisticParts: optimisticRequestParts.map((part) => toOptimisticPart(part, input.sessionID, input.messageID)),
  }
}
