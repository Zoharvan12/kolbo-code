import { getFilename } from "@opencode-ai/util/path"
import { type AgentPartInput, type FilePartInput, type Part, type TextPartInput } from "@opencode-ai/sdk/v2/client"
import type { FileSelection } from "@/context/file"
import { encodeFilePath } from "@/context/file/path"
import type { AgentPart, FileAttachmentPart, ImageAttachmentPart, Prompt } from "@/context/prompt"
import { Identifier } from "@/utils/id"
import { createCommentMetadata, formatCommentNote } from "@/utils/comment-note"

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

  // Images → sent as multimodal file parts (vision models can process inline)
  // Video/Audio → sent as a text URL reference to the AI (providers don't support video inline),
  //               but kept as file parts in optimisticParts so the UI bubble renders them properly.
  const imageParts: PromptRequestPart[] = []
  const imageOptimisticParts: PromptRequestPart[] = []  // use dataUrl so bubble always renders locally
  const mediaFileParts: PromptRequestPart[] = []  // for optimistic UI only
  const mediaNotes: string[] = []

  for (const attachment of input.images) {
    const url = attachment.publicUrl ?? attachment.dataUrl
    const label = attachment.localPath ?? attachment.filename
    const partId = Identifier.ascending("part")
    const filePart: PromptRequestPart = {
      id: partId,
      type: "file",
      mime: attachment.mime,
      url,
      filename: label,
    }
    if (
      attachment.mime.startsWith("image/") ||
      attachment.mime === "application/pdf" ||
      attachment.mime.startsWith("text/")
    ) {
      // Images, PDFs, and text files: sent as inline file parts so vision /
      // document / text-capable models can read them. Also emit a source note
      // so the agent knows how to reference the file for tool use.
      imageParts.push(filePart)
      // Optimistic part uses dataUrl so the message bubble always renders locally,
      // regardless of whether the CDN upload succeeded or the URL is accessible.
      imageOptimisticParts.push({ ...filePart, url: attachment.dataUrl })
      const kind =
        attachment.mime === "application/pdf"
          ? "PDF"
          : attachment.mime.startsWith("text/")
            ? "File"
            : "Image"
      const sourceParts: string[] = []
      if (attachment.localPath) sourceParts.push(`local path: ${attachment.localPath}`)
      if (attachment.publicUrl) sourceParts.push(`URL: ${attachment.publicUrl}`)
      if (sourceParts.length > 0) {
        const noteId = Identifier.ascending("part")
        const notePart: PromptRequestPart = {
          id: noteId,
          type: "text",
          text: `[${kind} — ${sourceParts.join(" | ")}]`,
          synthetic: true,
        }
        imageParts.push(notePart)
        imageOptimisticParts.push(notePart)
      }
    } else {
      // Video/audio: providers don't support these inline, so pass source info as text
      // so the agent can hand the URL/path to generation tools (ffmpeg, Remotion, etc.).
      const kind = attachment.mime.startsWith("video/") ? "Video" : "Audio"
      const sourceParts: string[] = []
      if (attachment.localPath) sourceParts.push(`local path: ${attachment.localPath}`)
      if (attachment.publicUrl) sourceParts.push(`URL: ${attachment.publicUrl}`)
      else if (attachment.dataUrl && !attachment.dataUrl.startsWith("data:")) sourceParts.push(`URL: ${attachment.dataUrl}`)
      const sourceNote = sourceParts.length > 0 ? ` — ${sourceParts.join(" | ")}` : ""
      mediaNotes.push(`[${kind} attached${sourceNote}]`)
      // keep as file part for the optimistic UI message bubble, using dataUrl for local rendering
      mediaFileParts.push({ ...filePart, url: attachment.dataUrl || url })
    }
  }

  if (mediaNotes.length > 0) {
    requestParts.push({
      id: Identifier.ascending("part"),
      type: "text",
      text: mediaNotes.join("\n"),
    } satisfies PromptRequestPart)
  }

  requestParts.push(...files, ...context, ...agents, ...imageParts)

  // optimisticParts = what the UI shows locally. Video/audio shown as file parts (not text notes).
  // Image parts use dataUrl copies so the bubble always renders even if CDN URL is inaccessible.
  const optimisticRequestParts = [
    ...requestParts.filter((p) => !imageParts.includes(p)),
    ...imageOptimisticParts,
    ...mediaFileParts,
  ]

  return {
    requestParts,
    optimisticParts: optimisticRequestParts.map((part) => toOptimisticPart(part, input.sessionID, input.messageID)),
  }
}
