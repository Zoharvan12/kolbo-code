import { onCleanup, onMount } from "solid-js"
import { showToast } from "@opencode-ai/ui/toast"
import { usePrompt, type ContentPart, type ImageAttachmentPart } from "@/context/prompt"
import { useLanguage } from "@/context/language"
import { uuid } from "@/utils/uuid"
import { getCursorPosition } from "./editor-dom"
import { attachmentMime, mimeFromUrl, MAX_MEDIA_BYTES } from "./files"
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
  serverUrl?: () => string | undefined
}

const inAppMediaPattern = /\.(png|jpe?g|gif|webp|avif|bmp|svg|mp4|webm|mov|avi|mkv|m4v|mp3|wav|ogg|m4a|aac|flac|opus)(\?.*)?$/i

export function createPromptAttachments(input: PromptAttachmentsInput) {
  const prompt = usePrompt()
  const language = useLanguage()

  // Track in-flight upload abort controllers so we can cancel on remove
  const uploadAborts = new Map<string, AbortController>()
  // Store file/blob references for retry
  const uploadFiles = new Map<string, { blob: Blob; mime: string; filename: string }>()

  const warn = () => {
    showToast({
      title: language.t("prompt.toast.pasteUnsupported.title"),
      description: language.t("prompt.toast.pasteUnsupported.description"),
    })
  }

  const warnTooLarge = () => {
    showToast({
      title: language.t("prompt.toast.fileTooLarge.title"),
      description: language.t("prompt.toast.fileTooLarge.description"),
    })
  }

  async function uploadAttachment(id: string, blob: Blob, mime: string, filename: string) {
    const serverUrl = input.serverUrl?.()
    if (!serverUrl) {
      // No server URL — leave as base64 (graceful fallback)
      prompt.updateImageAttachment(id, { uploading: false })
      return
    }

    // Cache file info for retry
    uploadFiles.set(id, { blob, mime, filename })

    const controller = new AbortController()
    uploadAborts.set(id, controller)

    const form = new FormData()
    form.append("file", blob, filename)

    try {
      const res = await fetch(`${serverUrl}/global/kolbo-files-upload`, {
        method: "POST",
        body: form,
        signal: controller.signal,
      })
      uploadAborts.delete(id)

      if (!res.ok) {
        const isTooBig = res.status === 413
        throw new Error(isTooBig ? "File too large for server" : `Upload failed (HTTP ${res.status})`)
      }

      const data = (await res.json()) as { url?: string; error?: { message: string } }
      if (data.url) {
        prompt.updateImageAttachment(id, { uploading: false, publicUrl: data.url })
      } else {
        throw new Error(data.error?.message ?? "No URL in upload response")
      }
    } catch (e) {
      uploadAborts.delete(id)
      if ((e as Error).name === "AbortError") return // cancelled by user removing attachment
      prompt.updateImageAttachment(id, {
        uploading: false,
        uploadError: (e as Error).message,
      })
    }
  }

  const retryAttachment = (id: string) => {
    const stored = uploadFiles.get(id)
    if (!stored) return
    prompt.updateImageAttachment(id, { uploading: true, uploadError: undefined })
    void uploadAttachment(id, stored.blob, stored.mime, stored.filename)
  }

  const add = async (file: File, toast = true) => {
    const mime = await attachmentMime(file)
    if (!mime) {
      if (toast) warn()
      return false
    }

    // Size guard (200 MB for all media)
    if (file.size > MAX_MEDIA_BYTES) {
      if (toast) warnTooLarge()
      return false
    }

    const editor = input.editor()
    if (!editor) return false

    const url = await dataUrl(file, mime)
    if (!url) return false

    // Extract local path if the platform exposes it (Electron/Tauri)
    const localPath = (file as File & { path?: string }).path ?? undefined

    const id = uuid()
    const isMedia = mime.startsWith("image/") || mime.startsWith("audio/") || mime.startsWith("video/")

    const attachment: ImageAttachmentPart = {
      type: "image",
      id,
      filename: file.name,
      mime,
      dataUrl: url,
      localPath,
      uploading: isMedia,  // only media gets uploaded; text/pdf stays as base64
    }
    const cursor = prompt.cursor() ?? getCursorPosition(editor)
    prompt.set([...prompt.current(), attachment], cursor)

    if (isMedia) {
      void uploadAttachment(id, file, mime, file.name)
    }

    return true
  }

  const addAttachment = (file: File) => add(file)

  // Add an attachment given a filesystem path (desktop native picker returns paths, not File objects).
  // The server reads the file from disk and uploads it, so we don't need file:// access in the WebView.
  const addAttachmentFromPath = async (filePath: string) => {
    const mime = mimeFromUrl(filePath) ?? "application/octet-stream"
    const filename = filePath.split(/[\\/]/).pop() || "file"
    const isMedia = mime.startsWith("image/") || mime.startsWith("audio/") || mime.startsWith("video/")

    const editor = input.editor()
    if (!editor) return false

    const id = uuid()
    // Use file:// URL for local preview; the actual upload happens server-side
    const fileUrl = "file:///" + filePath.replace(/\\/g, "/").replace(/^\/+/, "")

    const attachment: ImageAttachmentPart = {
      type: "image",
      id,
      filename,
      mime,
      dataUrl: fileUrl,
      localPath: filePath,
      uploading: isMedia,
    }
    const cursor = prompt.cursor() ?? getCursorPosition(editor)
    prompt.set([...prompt.current(), attachment], cursor)

    if (isMedia) {
      const serverUrl = input.serverUrl?.()
      if (!serverUrl) {
        prompt.updateImageAttachment(id, { uploading: false })
        return true
      }
      uploadFiles.set(id, { blob: new Blob(), mime, filename }) // store for retry
      const controller = new AbortController()
      uploadAborts.set(id, controller)

      void (async () => {
        try {
          const res = await fetch(`${serverUrl}/global/kolbo-files-upload-from-path`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ path: filePath }),
            signal: controller.signal,
          })
          uploadAborts.delete(id)
          if (!res.ok) throw new Error(`Upload failed (HTTP ${res.status})`)
          const data = (await res.json()) as { url?: string; error?: { message: string } }
          if (data.url) {
            prompt.updateImageAttachment(id, { uploading: false, publicUrl: data.url })
          } else {
            throw new Error(data.error?.message ?? "No URL in upload response")
          }
        } catch (e) {
          uploadAborts.delete(id)
          if ((e as Error).name === "AbortError") return
          prompt.updateImageAttachment(id, { uploading: false, uploadError: (e as Error).message })
        }
      })()
    }

    return true
  }

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
    // Cancel in-flight upload
    uploadAborts.get(id)?.abort()
    uploadAborts.delete(id)
    uploadFiles.delete(id)

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

  // Attaches a URL (http/https, data:, or file://) directly without uploading the bytes.
  // - http(s): already public → set as publicUrl
  // - file://: local path reference → keep as-is (AI uses local tools: ffmpeg, Remotion, etc.)
  // - data:: in-memory blob → upload to get a public URL
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

    const id = uuid()

    if (url.startsWith("http://") || url.startsWith("https://")) {
      // Already a public URL — use directly, no upload needed
      const attachment: ImageAttachmentPart = {
        type: "image",
        id,
        filename,
        mime,
        dataUrl: url,
        publicUrl: url,
        uploading: false,
      }
      prompt.set([...prompt.current(), attachment], prompt.cursor())
      return true
    }

    if (url.startsWith("file://")) {
      // Local file tree reference — keep path as-is for local tool use
      const localPath = url.slice("file://".length)
      const attachment: ImageAttachmentPart = {
        type: "image",
        id,
        filename,
        mime,
        dataUrl: url,
        localPath,
        uploading: false,
      }
      prompt.set([...prompt.current(), attachment], prompt.cursor())
      return true
    }

    // data: URL — upload to get a public URL
    const attachment: ImageAttachmentPart = {
      type: "image",
      id,
      filename,
      mime,
      dataUrl: url,
      uploading: true,
    }
    prompt.set([...prompt.current(), attachment], prompt.cursor())

    // Convert data URL to Blob and upload
    void (async () => {
      try {
        const res = await fetch(url)
        const blob = await res.blob()
        await uploadAttachment(id, blob, mime!, filename)
      } catch {
        prompt.updateImageAttachment(id, { uploading: false, uploadError: "Failed to read data URL" })
      }
    })()

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
      const files = Array.from(dropped)
      let anyHandled = false
      for (const file of files) {
        const ok = await add(file, false)
        if (ok) {
          anyHandled = true
          continue
        }
        // Unrecognized type (e.g. .zip, folder) — if the platform exposes a local
        // path (Tauri/Electron), add it as a file-reference @mention so the agent
        // can still use it. Falls back to a toast if no path is available.
        const localPath = (file as File & { path?: string }).path
        if (localPath) {
          input.focusEditor()
          input.addPart({ type: "file", path: localPath, content: "@" + localPath, start: 0, end: 0 })
          anyHandled = true
        }
      }
      if (!anyHandled && files.length > 0) warn()
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
    addAttachmentFromPath,
    removeAttachment,
    retryAttachment,
    handlePaste,
    // Exposed so the form element can bind them directly for redundancy
    handleDragOver,
    handleDragLeave,
    handleDrop,
  }
}
