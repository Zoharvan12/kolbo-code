import { onCleanup, onMount } from "solid-js"
import { showToast } from "@opencode-ai/ui/toast"
import { usePrompt, type ContentPart, type ImageAttachmentPart } from "@/context/prompt"
import { useLanguage } from "@/context/language"
import { uuid } from "@/utils/uuid"
import { getCursorPosition } from "./editor-dom"
import { attachmentMime, mimeFromUrl } from "./files"
import { normalizePaste, pasteMode } from "./paste"

function dataUrl(file: File, mime: string) {
  return new Promise<string>((resolve) => {
    const reader = new FileReader()
    reader.addEventListener("error", () => resolve(""))
    reader.addEventListener("load", () => {
      const value = typeof reader.result === "string" ? reader.result : ""
      const idx = value.indexOf(",")
      if (idx === -1) {
        resolve(value)
        return
      }
      resolve(`data:${mime};base64,${value.slice(idx + 1)}`)
    })
    reader.readAsDataURL(file)
  })
}

type PromptAttachmentsInput = {
  editor: () => HTMLDivElement | undefined
  isDialogActive: () => boolean
  setDraggingType: (type: "image" | "@mention" | null) => void
  focusEditor: () => void
  addPart: (part: ContentPart) => boolean
  readClipboardImage?: () => Promise<File | null>
}

const inAppMediaPattern = /\.(png|jpe?g|gif|webp|avif|bmp|svg|mp4|webm|mov|avi|mkv|m4v|mp3|wav|ogg|m4a|aac|flac|opus)(\?.*)?$/i

export function createPromptAttachments(input: PromptAttachmentsInput) {
  const prompt = usePrompt()
  const language = useLanguage()

  const warn = () => {
    showToast({
      title: language.t("prompt.toast.pasteUnsupported.title"),
      description: language.t("prompt.toast.pasteUnsupported.description"),
    })
  }

  const add = async (file: File, toast = true) => {
    const mime = await attachmentMime(file)
    if (!mime) {
      if (toast) warn()
      return false
    }

    // Video/audio: we only have a File object here (no local path), so skip them.
    // They can still be attached via drag from the file tree (file:// path reference).
    if (mime.startsWith("audio/") || mime.startsWith("video/")) return false

    const editor = input.editor()
    if (!editor) return false

    const url = await dataUrl(file, mime)
    if (!url) return false

    const attachment: ImageAttachmentPart = {
      type: "image",
      id: uuid(),
      filename: file.name,
      mime,
      dataUrl: url,
    }
    const cursor = prompt.cursor() ?? getCursorPosition(editor)
    prompt.set([...prompt.current(), attachment], cursor)
    return true
  }

  const addAttachment = (file: File) => add(file)

  const addAttachments = async (files: File[], toast = true) => {
    let found = false

    for (const file of files) {
      const ok = await add(file, false)
      if (ok) found = true
    }

    if (!found && files.length > 0 && toast) warn()
    return found
  }

  const removeAttachment = (id: string) => {
    const current = prompt.current()
    const next = current.filter((part) => part.type !== "image" || part.id !== id)
    prompt.set(next, prompt.cursor())
  }

  const handlePaste = async (event: ClipboardEvent) => {
    const clipboardData = event.clipboardData
    if (!clipboardData) return

    event.preventDefault()
    event.stopPropagation()

    const files = Array.from(clipboardData.items).flatMap((item) => {
      if (item.kind !== "file") return []
      const file = item.getAsFile()
      return file ? [file] : []
    })

    if (files.length > 0) {
      await addAttachments(files)
      return
    }

    const plainText = clipboardData.getData("text/plain") ?? ""

    // Desktop: Browser clipboard has no images and no text, try platform's native clipboard for images
    if (input.readClipboardImage && !plainText) {
      const file = await input.readClipboardImage()
      if (file) {
        await addAttachment(file)
        return
      }
    }

    if (!plainText) return

    const text = normalizePaste(plainText)

    const put = () => {
      if (input.addPart({ type: "text", content: text, start: 0, end: 0 })) return true
      input.focusEditor()
      return input.addPart({ type: "text", content: text, start: 0, end: 0 })
    }

    if (pasteMode(text) === "manual") {
      put()
      return
    }

    const inserted = typeof document.execCommand === "function" && document.execCommand("insertText", false, text)
    if (inserted) return

    put()
  }

  const hasFileTypes = (types: readonly string[]) =>
    types.some((t) => t.toLowerCase() === "files")

  const handleDragOver = (event: DragEvent) => {
    if (input.isDialogActive()) return
    event.preventDefault()
    if (event.dataTransfer) event.dataTransfer.dropEffect = "copy"
    const types = event.dataTransfer?.types ?? []
    if (hasFileTypes(types)) {
      input.setDraggingType("image")
    } else if (types.includes("text/uri-list") || types.includes("text/html")) {
      // In-app media drag (image/video/audio rendered in chat)
      input.setDraggingType("image")
    } else if (types.includes("text/plain")) {
      input.setDraggingType("@mention")
    }
  }

  const handleDragLeave = (event: DragEvent) => {
    if (input.isDialogActive()) return
    // Only clear when the cursor leaves the whole window
    if (!event.relatedTarget) {
      input.setDraggingType(null)
    }
  }

  // Attaches a URL (http/https or data:) directly without downloading.
  const attachFromUrl = (url: string): boolean => {
    let mime: string | undefined
    let filename: string
    if (url.startsWith("data:")) {
      mime = url.match(/^data:([^;]+);/)?.[1]
      filename = `media.${mime?.split("/")[1] ?? "bin"}`
    } else {
      mime = mimeFromUrl(url)
      filename = url.split("/").pop()?.split("?")[0] || "media"
    }
    if (!mime) return false
    const attachment: ImageAttachmentPart = { type: "image", id: uuid(), filename, mime, dataUrl: url }
    prompt.set([...prompt.current(), attachment], prompt.cursor())
    return true
  }

  const handleDrop = async (event: DragEvent) => {
    if (input.isDialogActive()) return
    event.preventDefault()
    event.stopPropagation()
    input.setDraggingType(null)

    // 1. Local file path reference (e.g. dragged from file tree)
    const plainText = event.dataTransfer?.getData("text/plain") ?? ""
    if (plainText.startsWith("file:")) {
      const url = plainText.trim()
      const mime = mimeFromUrl(url)
      if (mime) {
        // Media file — store as a lightweight file:// path reference
        attachFromUrl(url)
      } else {
        const filePath = url.slice("file:".length)
        input.focusEditor()
        input.addPart({ type: "file", path: filePath, content: "@" + filePath, start: 0, end: 0 })
      }
      return
    }

    // 2. Filesystem file objects (drag from OS file manager)
    const dropped = event.dataTransfer?.files
    if (dropped && dropped.length > 0) {
      await addAttachments(Array.from(dropped))
      return
    }

    // 3. In-app media drag: image/video/audio rendered in the chat
    //    URI list takes priority; fall back to plain text if it looks like a URL
    const uriList = event.dataTransfer?.getData("text/uri-list") ?? ""
    const mediaUrl =
      uriList.split(/\r?\n/).find((line) => line.trim() && !line.startsWith("#"))?.trim() ||
      (plainText.startsWith("http") && inAppMediaPattern.test(plainText) ? plainText : "")

    if (mediaUrl && (mediaUrl.startsWith("data:") || inAppMediaPattern.test(mediaUrl))) {
      attachFromUrl(mediaUrl)
    }
  }

  onMount(() => {
    // Use explicit addEventListener with {passive:false} so preventDefault() is always honoured
    document.addEventListener("dragover", handleDragOver, { passive: false })
    document.addEventListener("dragleave", handleDragLeave)
    document.addEventListener("drop", handleDrop)
    onCleanup(() => {
      document.removeEventListener("dragover", handleDragOver)
      document.removeEventListener("dragleave", handleDragLeave)
      document.removeEventListener("drop", handleDrop)
    })
  })

  return {
    addAttachment,
    addAttachments,
    removeAttachment,
    handlePaste,
    // Exposed so the form element can bind them directly for redundancy
    handleDragOver,
    handleDragLeave,
    handleDrop,
  }
}
