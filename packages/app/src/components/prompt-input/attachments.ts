import { onCleanup, onMount } from "solid-js"
import { showToast } from "@opencode-ai/ui/toast"
import { usePrompt, type ContentPart, type ImageAttachmentPart } from "@/context/prompt"
import { useLanguage } from "@/context/language"
import { uuid } from "@/utils/uuid"
import { getCursorPosition } from "./editor-dom"
import { attachmentMime, mimeFromUrl, MAX_MEDIA_BYTES } from "./files"
import { normalizePaste, pasteMode } from "./paste"

// Client-side upload dedup cache (SHA-256 → CDN URL) and the in-flight upload
// tracker the submit-side awaits before reading prompt parts. Mirrors the TUI's
// `kolboUploadCache` + `inFlightAttachments` in
// packages/opencode/src/cli/cmd/tui/component/prompt/index.tsx.
const UPLOAD_CACHE_MAX = 200
const uploadCache = new Map<string, string>()
// Path-based cache for /global/kolbo-files-upload-from-path. The WebView never
// sees the bytes (the sidecar reads the file), so content-hash isn't available;
// the path itself is the strongest stable key we have. Re-attaching the same
// local file skips the network roundtrip and reuses the CDN URL.
const pathUploadCache = new Map<string, string>()
export const inFlightAttachments = new Set<Promise<void>>()

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", bytes)
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("")
}

function cachePut(hash: string, url: string) {
  if (uploadCache.size >= UPLOAD_CACHE_MAX) {
    const oldest = uploadCache.keys().next().value
    if (oldest) uploadCache.delete(oldest)
  }
  uploadCache.set(hash, url)
}

function pathCachePut(path: string, url: string) {
  if (pathUploadCache.size >= UPLOAD_CACHE_MAX) {
    const oldest = pathUploadCache.keys().next().value
    if (oldest) pathUploadCache.delete(oldest)
  }
  pathUploadCache.set(path, url)
}

// Runs `fn` and keeps a handle in inFlightAttachments until it settles. Submit
// drains the set before reading prompt parts — bypass this and a fast Enter
// after attach will ship a base64 dataUrl instead of a CDN URL.
function trackInFlight(fn: () => Promise<void>): Promise<void> {
  const work = fn()
  inFlightAttachments.add(work)
  void work.finally(() => inFlightAttachments.delete(work))
  return work
}

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

function shouldRetryAsImage(result: { url?: string; status: number }, mime: string) {
  if (result.url) return false
  if (!mime.startsWith("image/")) return false
  if (result.status < 400 || result.status >= 500) return false
  return result.status !== 401 && result.status !== 413 && result.status !== 429
}

// Re-encode through a Canvas as a last-ditch fallback when the server rejects
// the original image. Emits PNG if alpha < 255 anywhere, JPEG otherwise.
async function reencodeImageViaCanvas(blob: Blob, filename: string): Promise<{ blob: Blob; mime: string; filename: string } | undefined> {
  if (typeof document === "undefined" || typeof Image === "undefined") return undefined
  const objectUrl = URL.createObjectURL(blob)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.addEventListener("load", () => resolve(el))
      el.addEventListener("error", () => reject(new Error("decode failed")))
      el.src = objectUrl
    })
    const canvas = document.createElement("canvas")
    canvas.width = img.naturalWidth || img.width
    canvas.height = img.naturalHeight || img.height
    if (canvas.width === 0 || canvas.height === 0) return undefined
    const ctx = canvas.getContext("2d")
    if (!ctx) return undefined
    ctx.drawImage(img, 0, 0)
    let hasAlpha = false
    try {
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data
      for (let i = 3; i < data.length; i += 4) {
        if (data[i] < 255) {
          hasAlpha = true
          break
        }
      }
    } catch {
      // CORS-tainted canvas — assume no alpha and continue.
    }
    const outMime = hasAlpha ? "image/png" : "image/jpeg"
    const ext = hasAlpha ? "png" : "jpg"
    const outBlob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, outMime, hasAlpha ? undefined : 0.92),
    )
    if (!outBlob) return undefined
    const base = filename.replace(/\.[^.]+$/, "") || "image"
    return { blob: outBlob, mime: outMime, filename: `${base}.${ext}` }
  } catch {
    return undefined
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
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

// Probe an upload-endpoint JSON body for a usable HTTPS URL. kolbo-api's
// `/kolbo/v1/files` returns `{url}` on first upload but has been observed to
// return different shapes (e.g. nested under `file`/`data`) for deduplicated
// uploads, so we check the common spots before giving up.
function extractUploadUrl(body: unknown): string | undefined {
  if (!body || typeof body !== "object") return undefined
  const b = body as Record<string, any>
  const candidates: unknown[] = [
    b.url,
    b.publicUrl,
    b.public_url,
    b.cdn_url,
    b.cdnUrl,
    b.file?.url,
    b.data?.url,
    b.result?.url,
  ]
  for (const c of candidates) {
    if (typeof c === "string" && /^https?:\/\//i.test(c)) return c
  }
  return undefined
}

export function createPromptAttachments(input: PromptAttachmentsInput) {
  const prompt = usePrompt()
  const language = useLanguage()

  // Track in-flight upload abort controllers so we can cancel on remove
  const uploadAborts = new Map<string, AbortController>()
  // Store file/blob references for retry
  const uploadFiles = new Map<string, { blob: Blob; mime: string; filename: string }>()
  // Blob URLs created for chip previews — revoked on remove or when the public
  // CDN URL arrives, otherwise the bytes pin in memory until the page reloads.
  const previewUrls = new Map<string, string>()
  const releasePreview = (id: string) => {
    const url = previewUrls.get(id)
    if (url) {
      URL.revokeObjectURL(url)
      previewUrls.delete(id)
    }
  }

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

  async function postUpload(
    serverUrl: string,
    blob: Blob,
    filename: string,
    signal: AbortSignal,
  ): Promise<{ url?: string; status: number; errorMessage?: string }> {
    const form = new FormData()
    form.append("file", blob, filename)
    const res = await fetch(`${serverUrl}/global/kolbo-files-upload`, {
      method: "POST",
      body: form,
      signal,
    })
    if (!res.ok) {
      let errorMessage: string | undefined
      try {
        const body = (await res.json()) as { error?: { message?: string } }
        errorMessage = body?.error?.message
      } catch {}
      return { status: res.status, errorMessage }
    }
    const data = (await res.json()) as Record<string, any>
    // kolbo-api dedup responses have been observed to nest the public URL under
    // different keys (`url`, `file.url`, `data.url`) instead of the canonical
    // top-level `url`. Probe the common shapes so an already-uploaded file
    // doesn't silently lose its URL and force the agent to re-upload via MCP.
    const url = extractUploadUrl(data)
    if (!url) {
      console.warn("[kolbo-files-upload] 200 OK but no URL in response", data)
    }
    return { url, status: res.status, errorMessage: data?.error?.message }
  }

  async function uploadAttachment(id: string, blob: Blob, mime: string, filename: string) {
    const serverUrl = input.serverUrl?.()
    if (!serverUrl) {
      prompt.updateImageAttachment(id, {
        uploading: false,
        uploadError: "Upload server unavailable",
      })
      return
    }

    // Cache file info for retry
    uploadFiles.set(id, { blob, mime, filename })

    const controller = new AbortController()
    uploadAborts.set(id, controller)

    return trackInFlight(async () => {
      try {
        // SHA-256 dedup — re-attaching the same image hits the cache and
        // skips the network roundtrip. Keeps a stable URL across turns.
        const bytes = await blob.arrayBuffer()
        const hash = await sha256Hex(bytes)
        const cached = uploadCache.get(hash)
        if (cached) {
          uploadAborts.delete(id)
          prompt.updateImageAttachment(id, { uploading: false, publicUrl: cached })
          // Keep video/audio blob preview alive — it's used by the optimistic
          // message bubble (which reads `dataUrl`, not `publicUrl`). Revoked on
          // chip remove via `removeAttachment`.
          return
        }

        let result = await postUpload(serverUrl, blob, filename, controller.signal)

        // Server rejected an image with a non-auth/size/rate 4xx? Re-encode via
        // Canvas (handles weird formats / decodable-but-corrupt files) and retry.
        if (shouldRetryAsImage(result, mime)) {
          const converted = await reencodeImageViaCanvas(blob, filename)
          if (converted) {
            result = await postUpload(serverUrl, converted.blob, converted.filename, controller.signal)
            if (result.url) {
              cachePut(hash, result.url)
              uploadAborts.delete(id)
              prompt.updateImageAttachment(id, {
                uploading: false,
                publicUrl: result.url,
                mime: converted.mime,
                filename: converted.filename,
              })
              return
            }
          }
        }

        uploadAborts.delete(id)

        if (!result.url) {
          const isTooBig = result.status === 413
          const message =
            result.errorMessage ??
            (isTooBig ? "File too large for server" : `Upload failed (HTTP ${result.status})`)
          throw new Error(message)
        }

        cachePut(hash, result.url)
        prompt.updateImageAttachment(id, { uploading: false, publicUrl: result.url })
      } catch (e) {
        uploadAborts.delete(id)
        if ((e as Error).name === "AbortError") return
        prompt.updateImageAttachment(id, {
          uploading: false,
          uploadError: (e as Error).message,
        })
      }
    })
  }

  const retryAttachment = (id: string) => {
    const stored = uploadFiles.get(id)
    if (!stored) return
    prompt.updateImageAttachment(id, { uploading: true, uploadError: undefined })
    void uploadAttachment(id, stored.blob, stored.mime, stored.filename)
  }

  type Prepared =
    | { kind: "chip"; attachment: ImageAttachmentPart; afterInsert: () => void }
    | { kind: "mention"; path: string }

  const prepareFileAttachment = async (file: File, toast: boolean): Promise<Prepared | undefined> => {
    const mime = await attachmentMime(file)
    if (!mime) {
      if (toast) warn()
      return undefined
    }
    if (file.size > MAX_MEDIA_BYTES) {
      if (toast) warnTooLarge()
      return undefined
    }

    const localPath = (file as File & { path?: string }).path ?? undefined
    const isInline = mime.startsWith("image/") || mime.startsWith("audio/") || mime.startsWith("video/") || mime === "application/pdf"

    // Non-inline (text/*, unknown) → if we have a local path, attach as an
    // @-mention so the agent reads it locally with its file tools. Avoids the
    // wrong audio icon and the chip vanishing after send.
    if (!isInline && localPath) {
      return { kind: "mention", path: localPath }
    }

    const id = uuid()

    // Text files (no localPath, e.g. web file picker): embed content as a
    // data:text/plain;base64 URL. The backend (prompt.ts data: case) decodes
    // and inlines the text into the prompt while keeping the file part visible
    // in the user bubble. Avoids the CDN round-trip and the "File data is
    // missing" error when providers can't fetch URLs.
    if (mime === "text/plain") {
      const text = await file.text()
      const base64 = typeof btoa === "function" ? btoa(unescape(encodeURIComponent(text))) : ""
      const inlineUrl = `data:text/plain;base64,${base64}`
      const attachment: ImageAttachmentPart = {
        type: "image",
        id,
        filename: file.name,
        mime,
        dataUrl: inlineUrl,
        localPath,
        uploading: false,
      }
      return {
        kind: "chip",
        attachment,
        afterInsert: () => {},
      }
    }

    const previewUrl = URL.createObjectURL(file)
    const isMedia = mime.startsWith("image/") || mime.startsWith("audio/") || mime.startsWith("video/")
    previewUrls.set(id, previewUrl)

    const attachment: ImageAttachmentPart = {
      type: "image",
      id,
      filename: file.name,
      mime,
      dataUrl: previewUrl,
      localPath,
      uploading: isMedia,
    }

    return {
      kind: "chip",
      attachment,
      afterInsert: () => {
        if (isMedia) void uploadAttachment(id, file, mime, file.name)
      },
    }
  }

  const insertPrepared = (items: Prepared[]) => {
    if (items.length === 0) return false
    const editor = input.editor()
    if (!editor) return false
    const chips = items.filter((p): p is Extract<Prepared, { kind: "chip" }> => p.kind === "chip")
    const mentions = items.filter((p): p is Extract<Prepared, { kind: "mention" }> => p.kind === "mention")
    if (chips.length > 0) {
      const cursor = prompt.cursor() ?? getCursorPosition(editor)
      prompt.set([...prompt.current(), ...chips.map((p) => p.attachment)], cursor)
      for (const p of chips) p.afterInsert()
    }
    if (mentions.length > 0) {
      input.focusEditor()
      for (const m of mentions) {
        input.addPart({ type: "file", path: m.path, content: "@" + m.path, start: 0, end: 0 })
      }
    }
    return true
  }

  const add = async (file: File, toast = true) => {
    const prepared = await prepareFileAttachment(file, toast)
    if (!prepared) return false
    return insertPrepared([prepared])
  }

  const addAttachment = (file: File) => add(file)

  // Add an attachment given a filesystem path (desktop native picker returns paths, not File objects).
  // The server reads the file from disk and uploads it, so we don't need file:// access in the WebView.
  const addAttachmentFromPath = async (filePath: string) => {
    // Default unknown extensions to text/plain so the backend's file:// handler
    // can load the content via the Read tool. Keeps the chip + localPath flow
    // consistent across media, PDF, and arbitrary files.
    const mime = mimeFromUrl(filePath) ?? "text/plain"
    const filename = filePath.split(/[\\/]/).pop() || "file"

    const editor = input.editor()
    if (!editor) return false

    const isMedia = mime.startsWith("image/") || mime.startsWith("audio/") || mime.startsWith("video/")

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
      const cached = pathUploadCache.get(filePath)
      if (cached) {
        prompt.updateImageAttachment(id, { uploading: false, publicUrl: cached })
        return true
      }
      uploadFiles.set(id, { blob: new Blob(), mime, filename }) // store for retry
      const controller = new AbortController()
      uploadAborts.set(id, controller)

      void trackInFlight(async () => {
        try {
          const res = await fetch(`${serverUrl}/global/kolbo-files-upload-from-path`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ path: filePath }),
            signal: controller.signal,
          })
          uploadAborts.delete(id)
          if (!res.ok) throw new Error(`Upload failed (HTTP ${res.status})`)
          const data = (await res.json()) as Record<string, any>
          const url = extractUploadUrl(data)
          if (url) {
            pathCachePut(filePath, url)
            prompt.updateImageAttachment(id, { uploading: false, publicUrl: url })
          } else {
            console.warn("[kolbo-files-upload-from-path] 200 OK but no URL in response", data)
            throw new Error(data?.error?.message ?? "No URL in upload response")
          }
        } catch (e) {
          uploadAborts.delete(id)
          if ((e as Error).name === "AbortError") return
          prompt.updateImageAttachment(id, { uploading: false, uploadError: (e as Error).message })
        }
      })
    }

    return true
  }

  const addAttachments = async (files: File[], toast = true) => {
    if (files.length === 0) return false
    // attachmentMime runs in parallel; chips get inserted in one prompt.set
    // (instead of N) so a 100-file drop doesn't trigger 100 re-renders.
    const prepared = (await Promise.all(files.map((f) => prepareFileAttachment(f, false)))).filter(
      (p): p is Prepared => !!p,
    )
    const inserted = insertPrepared(prepared)
    if (!inserted && files.length > 0 && toast) warn()
    return inserted
  }

  const removeAttachment = (id: string) => {
    uploadAborts.get(id)?.abort()
    uploadAborts.delete(id)
    uploadFiles.delete(id)
    releasePreview(id)

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

  // http/https → already public, no upload. file:// → local-path ref. data: →
  // upload to get a CDN URL.
  const prepareUrlAttachment = (url: string): Prepared | undefined => {
    let mime: string | undefined
    let filename: string
    if (url.startsWith("data:")) {
      mime = url.match(/^data:([^;]+);/)?.[1]
      filename = `media.${mime?.split("/")[1] ?? "bin"}`
    } else {
      mime = mimeFromUrl(url)
      filename = url.split("/").pop()?.split("?")[0] || "media"
    }
    if (!mime) return undefined

    const id = uuid()

    if (url.startsWith("http://") || url.startsWith("https://")) {
      return {
        kind: "chip",
        attachment: { type: "image", id, filename, mime, dataUrl: url, publicUrl: url, uploading: false },
        afterInsert: () => {},
      }
    }

    if (url.startsWith("file://")) {
      return {
        kind: "chip",
        attachment: {
          type: "image",
          id,
          filename,
          mime,
          dataUrl: url,
          localPath: url.slice("file://".length),
          uploading: false,
        },
        afterInsert: () => {},
      }
    }

    const finalMime = mime
    return {
      kind: "chip",
      attachment: { type: "image", id, filename, mime: finalMime, dataUrl: url, uploading: true },
      afterInsert: () => {
        void (async () => {
          try {
            const res = await fetch(url)
            const blob = await res.blob()
            await uploadAttachment(id, blob, finalMime, filename)
          } catch {
            prompt.updateImageAttachment(id, { uploading: false, uploadError: "Failed to read data URL" })
          }
        })()
      },
    }
  }

  const attachFromUrl = (url: string): boolean => {
    const prepared = prepareUrlAttachment(url)
    return prepared ? insertPrepared([prepared]) : false
  }

  const attachFromUrls = (urls: string[]): boolean => {
    const prepared = urls.map(prepareUrlAttachment).filter((p): p is Prepared => !!p)
    return insertPrepared(prepared)
  }

  const handleDrop = async (event: DragEvent) => {
    if (input.isDialogActive()) return
    event.preventDefault()
    event.stopPropagation()
    input.setDraggingType(null)

    // Only attach when the drop actually landed on the prompt input.
    // The document-level listener exists so we can preventDefault() and
    // stop the browser from navigating to a dropped URL anywhere on the
    // page — it must NOT silently attach files when the user dropped on
    // the canvas, sidebar, or any other surface. The form is tagged with
    // `data-prompt-drop-target` so we can detect this with one closest().
    const target = event.target as HTMLElement | null
    if (!target?.closest("[data-prompt-drop-target]")) return

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

    // 2. Filesystem file objects (drag from OS file manager) — batched.
    const dropped = event.dataTransfer?.files
    if (dropped && dropped.length > 0) {
      const files = Array.from(dropped)
      const prepared = (await Promise.all(files.map((f) => prepareFileAttachment(f, false)))).filter(
        (p): p is Prepared => !!p,
      )
      // Files prepareFileAttachment rejected (.zip, folders, unknown types) get
      // added as @mention path refs when the platform exposes a local path.
      const handledNames = new Set(
        prepared.flatMap((p) => (p.kind === "chip" ? [p.attachment.filename] : [p.path.split(/[\\/]/).pop() ?? ""])),
      )
      const fallbacks = files.filter((f) => !handledNames.has(f.name))
      let anyHandled = insertPrepared(prepared)
      if (fallbacks.length > 0) {
        for (const file of fallbacks) {
          const localPath = (file as File & { path?: string }).path
          if (localPath) {
            input.focusEditor()
            input.addPart({ type: "file", path: localPath, content: "@" + localPath, start: 0, end: 0 })
            anyHandled = true
          }
        }
      }
      if (!anyHandled && files.length > 0) warn()
      return
    }

    // 3. In-app media drag: image/video/audio rendered in the chat. Multi-URL
    //    URI lists (e.g. multi-select from a gallery) are attached as a batch.
    const uriList = event.dataTransfer?.getData("text/uri-list") ?? ""
    const urlsFromList = uriList
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
    const mediaUrls = urlsFromList.filter((u) => u.startsWith("data:") || inAppMediaPattern.test(u))
    if (mediaUrls.length > 0) {
      attachFromUrls(mediaUrls)
      return
    }
    if (plainText.startsWith("http") && inAppMediaPattern.test(plainText)) {
      attachFromUrl(plainText)
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
