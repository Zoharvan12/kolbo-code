import { useMarked } from "../context/marked"
import { useI18n } from "../context/i18n"
import { usePlatformOps, type PlatformOps } from "../context/platform-ops"
import { showToast } from "./toast"
import DOMPurify from "dompurify"
import morphdom from "morphdom"
import { checksum } from "@opencode-ai/util/encode"
import { ComponentProps, createEffect, createMemo, createResource, createSignal, on, onCleanup, splitProps } from "solid-js"
import { isServer } from "solid-js/web"
import { stream } from "./markdown-stream"
import { openKolboLightbox as openLightbox, isVideoUrl as isKolboVideoUrl, firstFramePosterSrc, pauseOnFirstFrame } from "./kolbo-media"
import { dispatchArtifact, resolveHtmlPreviewSource } from "../lib/artifact"

/**
 * Download a media URL. For data: URIs the browser Save-As works natively.
 * For remote http(s) URLs we open them in the system browser which handles
 * the download, and show a toast so the user knows what happened.
 */
async function downloadMedia(url: string, ops: PlatformOps, labels: DownloadLabels): Promise<void> {
  if (url.startsWith("data:")) {
    // Data URL — create a temporary anchor and trigger save
    const ext = url.split(";")[0]?.split("/")[1] ?? "bin"
    const filename = `download-${Date.now()}.${ext}`
    const a = document.createElement("a")
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    showToast({ variant: "success", title: labels.saved, description: filename })
    return
  }

  if (url.startsWith("http://") || url.startsWith("https://")) {
    if (ops.downloadFile) {
      try {
        const savedPath = await ops.downloadFile(url)
        const savedFilename = savedPath.split(/[\\/]/).pop() ?? url.split("/").pop() ?? "file"
        const toastActions: { label: string; onClick: () => void }[] = []
        if (ops.revealFile)
          toastActions.push({ label: labels.openInFolder, onClick: () => void ops.revealFile!(savedPath) })
        if (ops.changeDownloadFolder)
          toastActions.push({ label: labels.changeFolder, onClick: () => void ops.changeDownloadFolder!() })
        showToast({
          variant: "success",
          icon: "circle-check",
          title: labels.downloaded,
          description: savedFilename,
          actions: toastActions.length > 0 ? toastActions : undefined,
        })
      } catch (e) {
        console.error("[downloadMedia] Failed:", e)
        showToast({ variant: "error", title: labels.failed })
      }
    } else {
      const openFn = ops.openLink ?? ((u: string) => window.open(u, "_blank", "noopener,noreferrer"))
      openFn(url)
      showToast({ variant: "success", title: labels.openingInBrowser })
    }
  }
}

type Entry = {
  hash: string
  html: string
}

const max = 200
const cache = new Map<string, Entry>()

if (typeof window !== "undefined" && DOMPurify.isSupported) {
  DOMPurify.addHook("afterSanitizeAttributes", (node: Element) => {
    if (!(node instanceof HTMLAnchorElement)) return
    if (node.target !== "_blank") return

    const rel = node.getAttribute("rel") ?? ""
    const set = new Set(rel.split(/\s+/).filter(Boolean))
    set.add("noopener")
    set.add("noreferrer")
    node.setAttribute("rel", Array.from(set).join(" "))
  })
}

const config = {
  USE_PROFILES: { html: true, mathMl: true },
  SANITIZE_NAMED_PROPS: true,
  FORBID_TAGS: ["style"],
  FORBID_CONTENTS: ["style", "script"],
}

const iconPaths = {
  copy: '<path d="M6.2513 6.24935V2.91602H17.0846V13.7493H13.7513M13.7513 6.24935V17.0827H2.91797V6.24935H13.7513Z" stroke="currentColor" stroke-linecap="round"/>',
  check: '<path d="M5 11.9657L8.37838 14.7529L15 5.83398" stroke="currentColor" stroke-linecap="square"/>',
  eye: '<path d="M10 4.5C5.5 4.5 2 10 2 10C2 10 5.5 15.5 10 15.5C14.5 15.5 18 10 18 10C18 10 14.5 4.5 10 4.5Z" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/><circle cx="10" cy="10" r="2.5" stroke="currentColor"/>',
}

function sanitize(html: string) {
  if (!DOMPurify.isSupported) return ""
  return DOMPurify.sanitize(html, config)
}

function escape(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function fallback(markdown: string) {
  return escape(markdown).replace(/\r\n?/g, "\n").replace(/\n/g, "<br>")
}

type CopyLabels = {
  copy: string
  copied: string
  preview: string
}

type DownloadLabels = {
  download: string
  downloading: string
  downloaded: string
  saved: string
  failed: string
  openInFolder: string
  changeFolder: string
  openingInBrowser: string
}

const urlPattern = /^https?:\/\/[^\s<>()`"']+$/

function codeUrl(text: string) {
  const href = text.trim().replace(/[),.;!?]+$/, "")
  if (!urlPattern.test(href)) return
  try {
    const url = new URL(href)
    return url.toString()
  } catch {
    return
  }
}

function createIcon(path: string, slot: string) {
  const icon = document.createElement("div")
  icon.setAttribute("data-component", "icon")
  icon.setAttribute("data-size", "small")
  icon.setAttribute("data-slot", slot)
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg")
  svg.setAttribute("data-slot", "icon-svg")
  svg.setAttribute("fill", "none")
  svg.setAttribute("viewBox", "0 0 20 20")
  svg.setAttribute("aria-hidden", "true")
  svg.innerHTML = path
  icon.appendChild(svg)
  return icon
}

function createCopyButton(labels: CopyLabels) {
  const button = document.createElement("button")
  button.type = "button"
  button.setAttribute("data-component", "icon-button")
  button.setAttribute("data-variant", "secondary")
  button.setAttribute("data-size", "small")
  button.setAttribute("data-slot", "markdown-copy-button")
  button.setAttribute("aria-label", labels.copy)
  button.setAttribute("data-tooltip", labels.copy)
  button.appendChild(createIcon(iconPaths.copy, "copy-icon"))
  button.appendChild(createIcon(iconPaths.check, "check-icon"))
  return button
}

function setCopyState(button: HTMLButtonElement, labels: CopyLabels, copied: boolean) {
  if (copied) {
    button.setAttribute("data-copied", "true")
    button.setAttribute("aria-label", labels.copied)
    button.setAttribute("data-tooltip", labels.copied)
    return
  }
  button.removeAttribute("data-copied")
  button.setAttribute("aria-label", labels.copy)
  button.setAttribute("data-tooltip", labels.copy)
}

/** Detect if a <pre> block contains previewable content (HTML, SVG, Mermaid). */
function getPreviewLang(block: HTMLPreElement): "html" | "svg" | "mermaid" | null {
  const code = block.querySelector("code")
  if (!code) return null
  const text = code.textContent ?? ""
  if (!text.trim()) return null

  const langClass = Array.from(code.classList).find((c) => c.startsWith("language-"))
  const lang = langClass?.replace("language-", "") ?? ""

  const isFullHtmlDoc = /^\s*<!doctype html>/i.test(text)
  const hasHtmlTag = /<html[\s>]/i.test(text)
  const hasSvgTag = /<svg[\s\S]*?>/i.test(text)
  const isSvgDoc = /^\s*<\?xml[^>]*\?>\s*<svg/i.test(text)

  if (lang === "html" || isFullHtmlDoc || hasHtmlTag) return "html"
  if (lang === "svg" || hasSvgTag || isSvgDoc) return "svg"
  if (
    (lang === "mermaid" || lang === "mmd") &&
    /^(graph|flowchart|sequenceDiagram|gantt|pie|classDiagram|stateDiagram|gitGraph|journey|quadrantChart|requirement|mindmap|timeline|sankey|xychart|architecture)/i.test(
      text.trim(),
    )
  )
    return "mermaid"
  return null
}

function createPreviewButton(label: string) {
  const button = document.createElement("button")
  button.type = "button"
  button.setAttribute("data-component", "icon-button")
  button.setAttribute("data-variant", "secondary")
  button.setAttribute("data-size", "small")
  button.setAttribute("data-slot", "markdown-preview-button")
  button.setAttribute("aria-label", label)
  button.setAttribute("data-tooltip", label)
  button.appendChild(createIcon(iconPaths.eye, "preview-icon"))
  return button
}

function injectHtmlInlinePreviews(container: HTMLElement, ops: PlatformOps, previewLabel: string) {
  for (const pre of container.querySelectorAll("pre")) {
    if (getPreviewLang(pre as HTMLPreElement) !== "html") continue
    const content = pre.querySelector("code")?.textContent ?? ""
    if (!content) continue
    const wrapper = pre.closest('[data-component="markdown-code"]')
    if (!(wrapper instanceof HTMLElement)) continue
    if (wrapper.querySelector('[data-slot="markdown-html-inline-preview"]')) continue

    const card = document.createElement("div")
    card.setAttribute("data-slot", "markdown-html-inline-preview")
    card.setAttribute("role", "button")
    card.setAttribute("tabindex", "0")
    card.setAttribute("title", previewLabel)
    card.setAttribute("data-content", content)

    const iframe = document.createElement("iframe")
    iframe.setAttribute("loading", "lazy")
    iframe.setAttribute("title", "HTML preview")
    card.appendChild(iframe)

    const overlay = document.createElement("div")
    overlay.setAttribute("data-slot", "markdown-html-preview-overlay")
    const label = document.createElement("div")
    label.setAttribute("data-slot", "markdown-html-preview-label")
    label.textContent = previewLabel
    overlay.appendChild(label)
    card.appendChild(overlay)

    wrapper.appendChild(card)
    wrapper.setAttribute("data-html-preview-active", "true")

    void resolveHtmlPreviewSource(ops, content).then((src) => {
      if (src.kind === "url") iframe.setAttribute("src", src.url)
      else {
        iframe.setAttribute("sandbox", "allow-scripts allow-same-origin allow-popups")
        iframe.srcdoc = src.content
      }
    })
  }
}

function setupPreviewClick(root: HTMLDivElement) {
  const handleClick = (event: MouseEvent) => {
    const target = event.target
    if (!(target instanceof Element)) return

    const card = target.closest('[data-slot="markdown-html-inline-preview"]')
    if (card instanceof HTMLElement) {
      const content = card.getAttribute("data-content") ?? ""
      if (content) dispatchArtifact(content, "html")
      return
    }

    const button = target.closest('[data-slot="markdown-preview-button"]')
    if (!(button instanceof HTMLButtonElement)) return
    const wrapper = button.closest('[data-component="markdown-code"]')
    if (!wrapper) return
    const code = wrapper.querySelector("code")
    const content = code?.textContent ?? ""
    if (!content) return
    const pre = wrapper.querySelector("pre")
    const lang = pre ? (getPreviewLang(pre as HTMLPreElement) ?? "html") : "html"
    dispatchArtifact(content, lang)
  }
  const handleKey = (event: KeyboardEvent) => {
    if (event.key !== "Enter" && event.key !== " ") return
    const target = event.target
    if (!(target instanceof Element)) return
    const card = target.closest('[data-slot="markdown-html-inline-preview"]')
    if (!(card instanceof HTMLElement)) return
    event.preventDefault()
    const content = card.getAttribute("data-content") ?? ""
    if (content) dispatchArtifact(content, "html")
  }
  root.addEventListener("click", handleClick)
  root.addEventListener("keydown", handleKey)
  return () => {
    root.removeEventListener("click", handleClick)
    root.removeEventListener("keydown", handleKey)
  }
}

function ensureCodeWrapper(block: HTMLPreElement, labels: CopyLabels) {
  const parent = block.parentElement
  if (!parent) return
  const previewLang = getPreviewLang(block)
  const wrapped = parent.getAttribute("data-component") === "markdown-code"
  if (!wrapped) {
    const wrapper = document.createElement("div")
    wrapper.setAttribute("data-component", "markdown-code")
    parent.replaceChild(wrapper, block)
    wrapper.appendChild(block)
    wrapper.appendChild(createCopyButton(labels))
    if (previewLang) wrapper.appendChild(createPreviewButton(labels.preview))
    return
  }

  // Ensure exactly one copy button
  const copyButtons = Array.from(parent.querySelectorAll('[data-slot="markdown-copy-button"]')).filter(
    (el): el is HTMLButtonElement => el instanceof HTMLButtonElement,
  )
  if (copyButtons.length === 0) {
    parent.appendChild(createCopyButton(labels))
  }
  for (const button of copyButtons.slice(1)) {
    button.remove()
  }

  // Ensure exactly one preview button when previewable, none otherwise
  const previewButtons = Array.from(parent.querySelectorAll('[data-slot="markdown-preview-button"]')).filter(
    (el): el is HTMLButtonElement => el instanceof HTMLButtonElement,
  )
  if (previewLang) {
    if (previewButtons.length === 0) parent.appendChild(createPreviewButton(labels.preview))
    for (const button of previewButtons.slice(1)) button.remove()
  } else {
    for (const button of previewButtons) button.remove()
  }
}

function markCodeLinks(root: HTMLDivElement) {
  const codeNodes = Array.from(root.querySelectorAll(":not(pre) > code"))
  for (const code of codeNodes) {
    const href = codeUrl(code.textContent ?? "")
    const parentLink =
      code.parentElement instanceof HTMLAnchorElement && code.parentElement.classList.contains("external-link")
        ? code.parentElement
        : null

    if (!href) {
      if (parentLink) parentLink.replaceWith(code)
      continue
    }

    if (parentLink) {
      parentLink.href = href
      continue
    }

    const link = document.createElement("a")
    link.href = href
    link.className = "external-link"
    link.target = "_blank"
    link.rel = "noopener noreferrer"
    code.parentNode?.replaceChild(link, code)
    link.appendChild(code)
  }
}

// Matches Windows absolute paths, Unix absolute paths, and file:// URLs
// Only matches paths that have a file extension to reduce false positives
const localPathPattern =
  /(?:file:\/\/(?:\/)?[^\s<>'")\]]+|(?:[A-Za-z]:[/\\][^\s<>'")\]]*\.[^\s<>'")\]]+|(?:\/(?:home|Users|tmp|var|opt|usr|etc|mnt|media|srv|data|projects|workspaces)[/][^\s<>'")\]]*\.[^\s<>'")\]]+)))/g

function isHtmlPath(path: string): boolean {
  const lower = path.toLowerCase().replace(/\?.*$/, "")
  return lower.endsWith(".html") || lower.endsWith(".htm")
}

/**
 * Walks text nodes and wraps local file paths in clickable spans.
 * Uses data-path-link attribute so clicks can be handled via event delegation.
 */
function markLocalPaths(root: HTMLDivElement): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement
      if (!parent) return NodeFilter.FILTER_REJECT
      // Skip inside pre and code blocks
      if (parent.closest("pre, code, [data-path-link], [data-html-file-card]"))
        return NodeFilter.FILTER_REJECT
      // Skip inside anchors that already have a working href (real link)
      const anchor = parent.closest("a")
      if (anchor instanceof HTMLAnchorElement && anchor.href && !anchor.href.startsWith("javascript"))
        return NodeFilter.FILTER_REJECT
      return NodeFilter.FILTER_ACCEPT
    },
  })

  const textNodes: Text[] = []
  let node: Node | null
  while ((node = walker.nextNode())) textNodes.push(node as Text)

  for (const textNode of textNodes) {
    const text = textNode.nodeValue ?? ""
    localPathPattern.lastIndex = 0
    if (!localPathPattern.test(text)) continue
    localPathPattern.lastIndex = 0

    const fragment = document.createDocumentFragment()
    let last = 0
    let match: RegExpExecArray | null

    while ((match = localPathPattern.exec(text)) !== null) {
      if (match.index > last) {
        fragment.appendChild(document.createTextNode(text.slice(last, match.index)))
      }

      const rawPath = match[0]
      const html = isHtmlPath(rawPath)

      if (html) {
        // HTML files get a special card inserted after the paragraph — mark the span
        const span = document.createElement("span")
        span.setAttribute("data-html-file-card", rawPath)
        span.textContent = rawPath
        span.style.cssText =
          "color:var(--text-link-base);cursor:pointer;text-decoration:underline"
        fragment.appendChild(span)
      } else {
        const span = document.createElement("span")
        span.setAttribute("data-path-link", rawPath)
        span.textContent = rawPath
        span.style.cssText =
          "color:var(--text-link-base);cursor:pointer;text-decoration:underline"
        fragment.appendChild(span)
      }

      last = match.index + rawPath.length
    }

    localPathPattern.lastIndex = 0

    if (last < text.length) {
      fragment.appendChild(document.createTextNode(text.slice(last)))
    }

    textNode.parentNode?.replaceChild(fragment, textNode)
  }
}

/**
 * Normalize a local file path or file:// URL to a proper file:// URL
 * that can be used as an iframe src.
 */
function toFileUrl(path: string): string {
  if (path.startsWith("file://")) return path
  // Windows: C:\... → file:///C:/...
  // Unix: /home/... → file:///home/...
  const slashed = path.replace(/\\/g, "/")
  return slashed.startsWith("/") ? `file://${slashed}` : `file:///${slashed}`
}

/**
 * After markLocalPaths has run, insert an HTML-file preview card (with scaled
 * iframe preview) after each [data-html-file-card] span that doesn't have one yet.
 * Layout mirrors the kolbo-map artifact card: scaled iframe + gradient overlay + badge.
 */
function insertHtmlFileCards(root: HTMLDivElement): void {
  const spans = Array.from(root.querySelectorAll("[data-html-file-card]"))
  for (const span of spans) {
    if (span.nextElementSibling?.hasAttribute("data-html-preview-card")) continue

    const path = span.getAttribute("data-html-file-card") ?? ""
    if (!path) continue

    const filename = path.replace(/^file:\/\/\/?/, "").replace(/\\/g, "/").split("/").pop() ?? path

    // Outer card — position:relative so children can be absolute
    const card = document.createElement("div")
    card.setAttribute("data-html-preview-card", path)
    card.setAttribute("data-path-open", path)
    card.style.cssText =
      "position:relative;width:100%;height:200px;margin-top:8px;overflow:hidden;" +
      "border-radius:8px;border:1px solid var(--border-weak-base);cursor:pointer;" +
      "transition:border-color 0.15s"

    card.addEventListener("mouseenter", () => { card.style.borderColor = "var(--border-base)" })
    card.addEventListener("mouseleave", () => { card.style.borderColor = "var(--border-weak-base)" })

    const cleanPath = path.replace(/^file:\/\/\/?/, "")
    card.draggable = true
    card.addEventListener("dragstart", (e) => {
      if (!e.dataTransfer) return
      e.dataTransfer.setData("text/plain", "file:" + cleanPath)
      e.dataTransfer.effectAllowed = "copy"
    })

    // ── Scaled iframe container (kolbo-map pattern) ───────────────────────────
    const scaleWrap = document.createElement("div")
    scaleWrap.style.cssText =
      "position:absolute;top:0;left:0;width:200%;height:200%;" +
      "transform:scale(0.5);transform-origin:top left;pointer-events:none"

    const iframe = document.createElement("iframe")
    // src is intentionally left unset here — hydrateHtmlPreviews() sets srcdoc
    // after reading the file content via the platform readTextFile command.
    iframe.setAttribute("data-html-iframe-path", path)
    iframe.setAttribute("sandbox", "allow-scripts allow-same-origin")
    iframe.setAttribute("loading", "lazy")
    iframe.style.cssText = "width:100%;height:100%;border:0;background:#fff;pointer-events:none;overflow:hidden"

    scaleWrap.appendChild(iframe)

    // ── Bottom gradient title overlay ─────────────────────────────────────────
    const overlay = document.createElement("div")
    overlay.style.cssText =
      "position:absolute;bottom:0;left:0;right:0;pointer-events:none;" +
      "background:linear-gradient(to top,rgba(0,0,0,0.75) 0%,rgba(0,0,0,0.3) 50%,transparent 100%);" +
      "padding:10px 12px 10px"

    const nameLabel = document.createElement("span")
    nameLabel.textContent = filename
    nameLabel.style.cssText =
      "display:block;color:#fff;font-size:12px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"

    overlay.appendChild(nameLabel)

    // ── HTML badge top-right ──────────────────────────────────────────────────
    const badge = document.createElement("div")
    badge.textContent = "HTML"
    badge.style.cssText =
      "position:absolute;top:8px;right:8px;padding:2px 7px;border-radius:4px;" +
      "background:rgba(234,88,12,0.85);border:1px solid rgba(234,88,12,1);" +
      "color:#fff;font-size:10px;font-weight:600;letter-spacing:0.04em;pointer-events:none"

    // ── Open icon bottom-right inside overlay ─────────────────────────────────
    const openIcon = document.createElement("div")
    openIcon.style.cssText = "position:absolute;bottom:10px;right:10px;color:rgba(255,255,255,0.7);pointer-events:none"
    openIcon.innerHTML =
      '<svg width="14" height="14" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M10.833 3.333H16.666V9.166M16.666 3.333L9.166 10.833M8.333 4.166H3.333V16.666H15.833V11.666" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>' +
      "</svg>"

    card.appendChild(scaleWrap)
    card.appendChild(overlay)
    card.appendChild(badge)
    card.appendChild(openIcon)

    span.parentNode?.insertBefore(card, span.nextSibling)
  }
}

/**
 * For each iframe created by insertHtmlFileCards that hasn't been loaded yet,
 * read the file via the platform readTextFile command and inject the content
 * as srcdoc. A <base> tag is injected so relative assets (CSS/JS) resolve.
 */
async function hydrateHtmlPreviews(root: HTMLDivElement, ops: PlatformOps): Promise<void> {
  if (!ops.readTextFile) return
  const iframes = Array.from(
    root.querySelectorAll<HTMLIFrameElement>("iframe[data-html-iframe-path]:not([data-html-iframe-loaded])"),
  )
  for (const iframe of iframes) {
    const path = iframe.getAttribute("data-html-iframe-path") ?? ""
    if (!path) continue
    iframe.setAttribute("data-html-iframe-loaded", "true")
    try {
      const cleanPath = path.replace(/^file:\/\/\/?/, "")
      const content = await ops.readTextFile(cleanPath)

      // Inject a <base> tag so relative resources resolve from the file's directory
      const dir = cleanPath.replace(/\\/g, "/").split("/").slice(0, -1).join("/")
      const baseHref = dir ? (dir.match(/^[A-Za-z]:/) ? `file:///${dir}/` : `file://${dir}/`) : ""
      const withBase = baseHref
        ? /(<head[^>]*>)/i.test(content)
          ? content.replace(/(<head[^>]*>)/i, `$1<base href="${baseHref}">`)
          : `<base href="${baseHref}">${content}`
        : content

      iframe.srcdoc = withBase
    } catch {
      iframe.setAttribute("data-html-iframe-loaded", "error")
    }
  }
}

const downloadIconSvg =
  '<svg width="14" height="14" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M13.9583 10.6257L10 14.584L6.04167 10.6257M10 2.08398V13.959M16.25 17.9173H3.75" stroke="currentColor" stroke-width="1.5" stroke-linecap="square"/></svg>'

// Allow `#fragment` and signed-URL tails after the extension.
const audioExtPattern = /\.(mp3|wav|ogg|m4a|aac|flac|opus|wma)(?=$|[?#])/i
const imageExtPattern = /\.(png|jpe?g|gif|webp|svg|avif|bmp|ico)(?=$|[?#])/i

function makeDraggable(el: HTMLElement, url: string) {
  el.draggable = true
  el.addEventListener("dragstart", (e) => {
    if (!e.dataTransfer) return
    e.dataTransfer.setData("text/uri-list", url)
    e.dataTransfer.setData("text/plain", url)
    e.dataTransfer.effectAllowed = "copy"
  })
}

/**
 * Finds <a> tags linking to audio URLs and inserts an <audio> player below them.
 * Reuses the same download/hover conventions as the image wrappers.
 */
function wrapMarkdownAudio(root: HTMLDivElement, dlLabels: DownloadLabels): void {
  const anchors = Array.from(root.querySelectorAll("a[href]"))
  for (const anchor of anchors) {
    if (!(anchor instanceof HTMLAnchorElement)) continue
    const href = anchor.getAttribute("href") ?? ""
    if (!audioExtPattern.test(href)) continue
    if (anchor.closest("[data-audio-wrapper]")) continue

    // Flex-row: [audio player | download button] — button never overlaps controls
    const wrapper = document.createElement("div")
    wrapper.setAttribute("data-audio-wrapper", href)
    wrapper.setAttribute("data-media-wrapper", href)
    wrapper.style.cssText =
      "display:flex;align-items:center;gap:8px;max-width:100%;margin-top:8px"

    const audio = document.createElement("audio")
    audio.src = href
    audio.controls = true
    audio.preload = "metadata"
    audio.style.cssText = "flex:1;min-width:0;display:block;border-radius:8px"

    const btn = document.createElement("button")
    btn.type = "button"
    btn.title = dlLabels.download
    btn.setAttribute("data-md-download", href)
    btn.style.cssText =
      "flex-shrink:0;display:flex;align-items:center;justify-content:center;" +
      "width:32px;height:32px;border-radius:6px;" +
      "border:1px solid var(--border-weak-base);" +
      "background:var(--background-stronger);color:var(--text-strong);" +
      "cursor:pointer"
    btn.innerHTML = downloadIconSvg

    makeDraggable(wrapper, href)

    wrapper.appendChild(audio)
    wrapper.appendChild(btn)

    anchor.parentNode?.insertBefore(wrapper, anchor.nextSibling)
  }
}

// Compact "media chip" used in place of full-width inline previews when
// the agent quotes generated URLs in its response. The canvas side panel
// is the real gallery — chat used to render every quoted URL as a 400px-
// tall image in its own row, which dominated the conversation. A chip
// (28px thumb + filename + download icon) keeps the chat scannable while
// still giving the user a click-to-open affordance.
//
// Click on the chip → lightbox (image) or open in canvas / new tab
// (video). Both use the existing data-lightbox-src convention so the
// event delegation in setupPathLinks keeps working.
const playIconSvg =
  '<svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor"><path d="M4 3l9 5-9 5V3Z"/></svg>'
// Two linked rings for "copy link" + a check used as the just-copied
// confirmation flash on the same button.
const copyLinkIconSvg =
  '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M7 9.5a2.5 2.5 0 0 0 3.5 0l2-2a2.5 2.5 0 0 0-3.5-3.5l-1 1"/><path d="M9 6.5a2.5 2.5 0 0 0-3.5 0l-2 2a2.5 2.5 0 0 0 3.5 3.5l1-1"/></svg>'
const checkIconSvg =
  '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 8.5 6.5 11.5 12.5 5.5"/></svg>'

function buildMediaChip(opts: {
  url: string
  isVideo: boolean
  dlLabels: DownloadLabels
}): HTMLSpanElement {
  const { url, isVideo, dlLabels } = opts

  // Two siblings wrapped in a tiny inline-flex group:
  //   1) the chip itself — a pure thumbnail. Click it → lightbox/preview.
  //      Nothing overlays the thumb on hover (users click to preview;
  //      a hover overlay just hides the image they're trying to see).
  //   2) a separate download button to the right of the chip.
  //      Always visible (subtle), independent click target.
  //
  // The group is what carries `data-media-wrapper` so groupConsecutive-
  // Media can still collect runs of these inline.
  const group = document.createElement("span")
  group.className = "kolbo-media-chip-group"
  group.setAttribute("data-media-wrapper", url)

  // Chip = pure thumbnail.
  const chip = document.createElement("span")
  chip.className = `kolbo-media-chip${isVideo ? " kolbo-media-chip--video" : ""}`
  chip.setAttribute("data-tooltip", isVideo ? "Open video" : "Open preview")
  // Both image and video chips open the in-app lightbox (the lightbox
  // is now video-aware — see openLightbox). Tagging with
  // data-lightbox-src lets the existing document-level delegation in
  // setupPathLinks handle the click uniformly.
  chip.setAttribute("data-lightbox-src", url)

  if (isVideo) {
    // Render an actual <video> so the chip shows the first frame —
    // same #t=0.05 + autoplay+muted+playsinline + loadeddata-pause
    // trick the canvas uses to freeze video tiles on first-decoded-frame.
    //
    // LAZY: don't set the real src until the chip enters the viewport.
    // A message with 6+ video chips otherwise fires 6 simultaneous
    // video downloads (~MB each) the moment the message renders, which
    // is why posters took ages to appear. With the IntersectionObserver
    // gate, off-screen chips stay empty until the user scrolls them
    // into view.
    const video = document.createElement("video")
    video.className = "kolbo-media-chip-thumb kolbo-media-chip-thumb--video"
    video.preload = "auto"
    video.muted = true
    video.playsInline = true
    ;(video as HTMLVideoElement & { disablePictureInPicture: boolean }).disablePictureInPicture = true
    video.setAttribute("controlslist", "nodownload nofullscreen noremoteplayback noplaybackrate")
    video.setAttribute("aria-hidden", "true")
    pauseOnFirstFrame(video)
    chip.appendChild(video)

    const badge = document.createElement("span")
    badge.className = "kolbo-media-chip-play"
    badge.innerHTML = playIconSvg
    badge.setAttribute("aria-hidden", "true")
    chip.appendChild(badge)

    // Defer src+autoplay until near the viewport so a message with N
    // video chips doesn't trigger N simultaneous MB downloads on render.
    const armVideo = () => {
      if (video.src) return
      video.src = firstFramePosterSrc(url)
      video.autoplay = true
    }
    if (typeof IntersectionObserver !== "undefined") {
      const io = new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            if (e.isIntersecting) {
              armVideo()
              io.disconnect()
              break
            }
          }
        },
        { rootMargin: "400px 0px", threshold: 0 },
      )
      io.observe(chip)
    } else {
      // No IO support → eager load.
      armVideo()
    }
  } else {
    const thumb = document.createElement("img")
    thumb.className = "kolbo-media-chip-thumb"
    thumb.src = url
    thumb.alt = ""
    thumb.loading = "lazy"
    chip.appendChild(thumb)
  }

  group.appendChild(chip)

  // Sibling copy-link button — copies the public URL to the clipboard
  // with a checkmark flash as feedback. Useful when users want to paste
  // a generated asset into another tool / message without downloading.
  const copyBtn = document.createElement("button")
  copyBtn.type = "button"
  copyBtn.className = "kolbo-media-chip-iconbtn"
  copyBtn.setAttribute("aria-label", "Copy link")
  copyBtn.setAttribute("data-tooltip", "Copy link")
  copyBtn.innerHTML = copyLinkIconSvg
  const flashCopied = () => {
    const prevIcon = copyBtn.innerHTML
    const prevTip = copyBtn.getAttribute("data-tooltip")
    copyBtn.innerHTML = checkIconSvg
    copyBtn.setAttribute("data-tooltip", "Link copied")
    copyBtn.classList.add("kolbo-media-chip-iconbtn--ok")
    setTimeout(() => {
      copyBtn.innerHTML = prevIcon
      if (prevTip) copyBtn.setAttribute("data-tooltip", prevTip)
      copyBtn.classList.remove("kolbo-media-chip-iconbtn--ok")
    }, 1400)
  }
  copyBtn.addEventListener("click", async (e) => {
    e.preventDefault()
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(url)
      flashCopied()
    } catch {
      // Clipboard write can fail in unsecure contexts — fall back to a
      // hidden textarea + execCommand("copy") so the user still gets
      // their link out one way or another.
      try {
        const ta = document.createElement("textarea")
        ta.value = url
        ta.style.position = "fixed"
        ta.style.opacity = "0"
        document.body.appendChild(ta)
        ta.select()
        document.execCommand("copy")
        document.body.removeChild(ta)
        flashCopied()
      } catch {
        /* swallow — nothing more we can do */
      }
    }
  })
  group.appendChild(copyBtn)

  // Sibling download button — always visible, subtle. Document-level
  // delegation (setupPathLinks) handles the actual download via
  // data-md-download — do NOT install a click listener here that
  // stops propagation.
  const dlBtn = document.createElement("button")
  dlBtn.type = "button"
  dlBtn.className = "kolbo-media-chip-iconbtn kolbo-media-chip-download"
  dlBtn.setAttribute("data-md-download", url)
  dlBtn.setAttribute("aria-label", dlLabels.download)
  dlBtn.setAttribute("data-tooltip", dlLabels.download)
  dlBtn.innerHTML = downloadIconSvg
  group.appendChild(dlBtn)

  makeDraggable(group, url)
  return group
}

/**
 * Convert each standalone markdown <img> into a compact chip. The original
 * <img> element is removed; the chip carries the same data-media-wrapper
 * attribute so groupConsecutiveMedia + the lightbox delegation still apply.
 */
// The first <p> inside an <li> is forced to display:inline (so the bullet
// sits on the same line as the first text). That makes every chip-group
// flow inline with the surrounding Hebrew/English text — and in RTL that
// visually flips the chip onto the wrong side. Force the chip out of
// inline flow with display:flex + auto margin toward the message-level
// inline-start (right in RTL, left in LTR). Physical margins so no parent
// dir="auto" can flip them back.
function applyChipDirectionStyles(chip: HTMLElement, isRtl: boolean): void {
  chip.style.display = "flex"
  chip.style.width = "fit-content"
  chip.style.alignItems = "center"
  chip.style.clear = "both"
  chip.style.marginTop = "8px"
  chip.style.marginBottom = "8px"
  if (isRtl) {
    chip.style.marginLeft = "auto"
    chip.style.marginRight = "0"
  } else {
    chip.style.marginRight = "auto"
    chip.style.marginLeft = "0"
  }
}

function wrapMarkdownImages(root: HTMLDivElement, dlLabels: DownloadLabels): void {
  const isRtl = root.getAttribute("dir") === "rtl"
  const images = Array.from(root.querySelectorAll("img"))
  for (const img of images) {
    if (!(img instanceof HTMLImageElement)) continue
    if (img.closest("[data-media-wrapper]")) continue
    if (!img.src) continue
    const chip = buildMediaChip({ url: img.src, isVideo: false, dlLabels })
    applyChipDirectionStyles(chip, isRtl)
    img.parentNode?.replaceChild(chip, img)
  }
}

/**
 * Convert markdown <a href=".jpg"> anchors into the same chip style.
 * Replaces the anchor (instead of appending a preview underneath) so the
 * chat stays compact.
 */
function wrapMarkdownImageLinks(root: HTMLDivElement, dlLabels: DownloadLabels): void {
  const isRtl = root.getAttribute("dir") === "rtl"
  const anchors = Array.from(root.querySelectorAll("a[href]"))
  for (const anchor of anchors) {
    if (!(anchor instanceof HTMLAnchorElement)) continue
    const href = anchor.getAttribute("href") ?? ""
    if (!imageExtPattern.test(href)) continue
    if (anchor.closest("[data-media-wrapper]")) continue
    const chip = buildMediaChip({ url: href, isVideo: false, dlLabels })
    applyChipDirectionStyles(chip, isRtl)
    anchor.parentNode?.replaceChild(chip, anchor)
  }
}


/**
 * Handles inline <code> elements whose full text content is a local file path.
 * The TreeWalker in markLocalPaths skips text inside code elements, so LLM
 * responses that wrap paths in backticks (e.g. `file:///C:/...`) need this pass.
 */
function markCodePaths(root: HTMLDivElement): void {
  const codeNodes = Array.from(root.querySelectorAll(":not(pre) > code"))
  for (const code of codeNodes) {
    const text = (code.textContent ?? "").trim()
    if (!text) continue
    localPathPattern.lastIndex = 0
    const match = localPathPattern.exec(text)
    localPathPattern.lastIndex = 0
    // Only replace when the full code content is a local path
    if (!match || match[0] !== text) continue

    const path = match[0]
    const span = document.createElement("span")
    span.textContent = text
    span.style.cssText = "color:var(--text-link-base);cursor:pointer;text-decoration:underline"
    if (isHtmlPath(path)) {
      span.setAttribute("data-html-file-card", path)
    } else {
      span.setAttribute("data-path-link", path)
    }
    code.parentNode?.replaceChild(span, code)
  }
}

/**
 * If marked auto-linked a file:// URL and DOMPurify stripped the href,
 * the path sits in a dead <a> with no href. Find those and mark them so
 * the click delegation can open them.
 */
function markDeadAnchors(root: HTMLDivElement): void {
  const anchors = Array.from(root.querySelectorAll("a:not([href]), a[href='']"))
  for (const anchor of anchors) {
    if (!(anchor instanceof HTMLElement)) continue
    if (anchor.hasAttribute("data-path-link") || anchor.hasAttribute("data-html-file-card")) continue
    const text = (anchor.textContent ?? "").trim()
    localPathPattern.lastIndex = 0
    const match = localPathPattern.exec(text)
    localPathPattern.lastIndex = 0
    if (!match) continue
    const path = match[0]
    anchor.style.cssText = "color:var(--text-link-base);cursor:pointer;text-decoration:underline"
    if (isHtmlPath(path)) {
      anchor.setAttribute("data-html-file-card", path)
    } else {
      anchor.setAttribute("data-path-link", path)
    }
  }
}

function decorate(root: HTMLDivElement, labels: CopyLabels, dlLabels: DownloadLabels) {
  const blocks = Array.from(root.querySelectorAll("pre"))
  for (const block of blocks) {
    ensureCodeWrapper(block, labels)
  }
  markCodeLinks(root)
  markLocalPaths(root)
  markCodePaths(root)
  markDeadAnchors(root)
  insertHtmlFileCards(root)
  wrapMarkdownImages(root, dlLabels)
  wrapMarkdownImageLinks(root, dlLabels)
  // Video inline embed (was previously disabled because preload="metadata"
  // produced black tiles). Re-enabled using the same #t=0.05 + autoplay+
  // muted+playsinline + onLoadedData pause trick that the canvas uses, so
  // tiles freeze on the first decoded frame.
  wrapMarkdownVideoLinks(root, dlLabels)
  wrapMarkdownAudio(root, dlLabels)
  // After all media wrapping, fold runs of consecutive media-only blocks
  // into a single grid so 6 images don't take 6 full-width rows.
  groupConsecutiveMedia(root)
  // Per-block bidi auto: in mixed-language messages the root-level dir
  // forces every paragraph to one direction, which mangles Hebrew lines
  // that follow English ones (and vice-versa). dir="auto" on each block
  // lets the browser's UAX#9 algorithm pick the right direction per
  // paragraph from its first strong character.
  applyBlockAutoDirection(root)
}

/**
 * Tag block-level prose with `dir="auto"` so each paragraph, list item,
 * heading, blockquote, and table cell flows in its own detected
 * direction. Pure DOM tweak — costs ~ms per message, applied once.
 */
function applyBlockAutoDirection(root: HTMLDivElement): void {
  // Note: don't include ol/ul here. dir="auto" on a list container skips
  // descendants whose own dir is set, and every <li> below gets dir="auto"
  // too — so the list would find no eligible text and fall back to LTR.
  // Lists inherit direction from the markdown root instead.
  const blocks = root.querySelectorAll("p, li, h1, h2, h3, h4, h5, h6, blockquote, td, th, dd, dt")
  for (const el of Array.from(blocks)) {
    if (!(el instanceof HTMLElement)) continue
    if (el.hasAttribute("dir")) continue
    // Skip blocks whose only meaningful content is a media chip — the URL
    // is LTR text and would force the whole block to LTR, mis-aligning the
    // chip in an otherwise RTL message. Let it inherit from the root.
    const hasMedia = el.querySelector("[data-media-wrapper], .kolbo-media-grid")
    if (hasMedia && (el.textContent ?? "").trim() === "") continue
    el.setAttribute("dir", "auto")
  }
}

/**
 * Convert `<a href="…mp4">` anchors into compact video chips. Click opens
 * the file in a new tab (no inline player; the canvas is the gallery).
 */
function wrapMarkdownVideoLinks(root: HTMLDivElement, dlLabels: DownloadLabels): void {
  const isRtl = root.getAttribute("dir") === "rtl"
  const anchors = Array.from(root.querySelectorAll("a[href]"))
  for (const anchor of anchors) {
    if (!(anchor instanceof HTMLAnchorElement)) continue
    const href = anchor.getAttribute("href") ?? ""
    if (!isKolboVideoUrl(href)) continue
    if (anchor.closest("[data-media-wrapper]")) continue
    const chip = buildMediaChip({ url: href, isVideo: true, dlLabels })
    applyChipDirectionStyles(chip, isRtl)
    anchor.parentNode?.replaceChild(chip, anchor)
  }
}

/**
 * Folds runs of sibling block-level elements that contain a single
 * `[data-media-wrapper]` (now always a `.kolbo-media-chip`) into a
 * single flex-wrap row. Without this, a response with 6 quoted URLs
 * becomes 6 full-width paragraphs with a chip alone in each; folded,
 * the chips flow inline as a tidy strip.
 *
 * A block "qualifies" if its only meaningful content is a media wrapper
 * (ignoring whitespace text nodes and the original `<a>` anchor that
 * wrapMarkdownImageLinks / wrapMarkdownVideoLinks left behind).
 */
function groupConsecutiveMedia(root: HTMLDivElement): void {
  // Block-level parents we'll inspect. Direct children of `root` and also
  // children of <p> wrappers (markdown-it puts standalone images in <p>).
  const blockSelectors = ["p", "div"]
  const isMediaOnly = (el: Element): { ok: boolean; wrapper: HTMLElement | null } => {
    // Already a grid? Skip.
    if (el.classList.contains("kolbo-media-grid")) return { ok: false, wrapper: null }
    // Has any text content (excluding the anchor's own text since we'll hide that)?
    const wrappers = el.querySelectorAll("[data-media-wrapper]")
    if (wrappers.length !== 1) return { ok: false, wrapper: null }
    const wrapper = wrappers[0] as HTMLElement
    // Verify nothing else lives in this block besides the wrapper, the
    // anchor that spawned it (if any), and whitespace.
    let extra = false
    el.childNodes.forEach((node) => {
      if (node === wrapper) return
      if (node.nodeType === Node.TEXT_NODE && (node.textContent ?? "").trim() === "") return
      if (node instanceof HTMLAnchorElement) {
        const href = node.getAttribute("href") ?? ""
        // Hide the original anchor so the embed stands alone in the grid.
        if (wrapper.getAttribute("data-media-wrapper") === href) {
          node.style.display = "none"
          return
        }
      }
      extra = true
    })
    if (extra) return { ok: false, wrapper: null }
    return { ok: true, wrapper }
  }

  for (const sel of blockSelectors) {
    const parents = new Set<Element>()
    root.querySelectorAll(`${sel} [data-media-wrapper]`).forEach((w) => {
      const p = w.closest(sel)
      if (p && p.parentElement) parents.add(p.parentElement)
    })
    // Also check media wrappers that are direct children of root.
    root.querySelectorAll("[data-media-wrapper]").forEach((w) => {
      if (w.parentElement === root) parents.add(root)
    })

    parents.forEach((container) => {
      const kids = Array.from(container.children)
      let i = 0
      while (i < kids.length) {
        const start = kids[i]
        const m = isMediaOnly(start)
        if (!m.ok) { i++; continue }
        // Gather the run.
        const run: Element[] = [start]
        let j = i + 1
        while (j < kids.length) {
          const m2 = isMediaOnly(kids[j])
          if (!m2.ok) break
          run.push(kids[j])
          j++
        }
        if (run.length >= 2) {
          // Now that media renders as compact chips, a flex-wrap row is
          // the right container — chips flow inline and wrap naturally
          // at the message column width instead of locking into a fixed
          // grid of large tiles.
          const strip = document.createElement("div")
          strip.className = "kolbo-media-grid"
          strip.style.cssText =
            "display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;align-items:center"
          container.insertBefore(strip, start)
          for (const block of run) {
            const wrappers = block.querySelectorAll("[data-media-wrapper]")
            wrappers.forEach((w) => {
              strip.appendChild(w)
            })
            block.remove()
          }
        }
        i = j
      }
    })
  }
}

/**
 * Wire up event delegation for local path clicks (openPath) and HTML card opens.
 * Returns a cleanup function.
 */
export function setupPathLinks(
  root: HTMLDivElement,
  getOps: () => { openPath?: (p: string) => void; openLink?: (u: string) => void; fetch?: typeof window.fetch },
  getDlLabels: () => DownloadLabels,
) {
  // ── Hover: show/hide image download overlay ──────────────────────────────
  const handleMouseOver = (event: MouseEvent) => {
    const target = event.target
    if (!(target instanceof Element)) return
    const wrapper = target.closest("[data-media-wrapper]")
    if (wrapper instanceof HTMLElement) {
      const overlay = wrapper.querySelector<HTMLElement>("[data-media-overlay]")
      if (overlay) {
        overlay.style.opacity = "1"
        overlay.style.transform = "translateY(0)"
      }
    }
    // Button hover highlight
    const btn = target.closest<HTMLElement>("[data-md-download]")
    if (btn) {
      btn.style.background = "rgba(0,0,0,0.72)"
      btn.style.borderColor = "rgba(255,255,255,0.28)"
      btn.style.color = "rgba(255,255,255,1)"
    }
  }

  const handleMouseOut = (event: MouseEvent) => {
    const related = event.relatedTarget
    const target = event.target
    if (!(target instanceof Element)) return
    // Reset button hover
    const btn = target.closest<HTMLElement>("[data-md-download]")
    if (btn && !(related instanceof Node && btn.contains(related))) {
      btn.style.background = "rgba(0,0,0,0.58)"
      btn.style.borderColor = "rgba(255,255,255,0.15)"
      btn.style.color = "rgba(255,255,255,0.88)"
    }
    const wrapper = target.closest("[data-media-wrapper]")
    if (!(wrapper instanceof HTMLElement)) return
    // Only hide if we actually left the wrapper
    if (related instanceof Node && wrapper.contains(related)) return
    const overlay = wrapper.querySelector<HTMLElement>("[data-media-overlay]")
    if (overlay) {
      overlay.style.opacity = "0"
      overlay.style.transform = "translateY(2px)"
    }
  }

  // ── Click: download or open ───────────────────────────────────────────────
  const handleClick = async (event: MouseEvent) => {
    const target = event.target
    if (!(target instanceof Element)) return

    // Image lightbox (click on the image itself, not the download button)
    const lightboxWrapper = target.closest("[data-lightbox-src]")
    if (lightboxWrapper instanceof HTMLElement && !(target as Element).closest("[data-md-download]")) {
      const src = lightboxWrapper.getAttribute("data-lightbox-src")
      if (src) {
        event.preventDefault()
        event.stopPropagation()
        openLightbox(src)
      }
      return
    }

    // Image download button
    const dlBtn = target.closest("[data-md-download]")
    if (dlBtn instanceof HTMLElement) {
      const url = dlBtn.getAttribute("data-md-download")
      if (url) {
        event.preventDefault()
        event.stopPropagation()
        await downloadMedia(url, getOps(), getDlLabels())
        // Flash checkmark on the button
        const prev = dlBtn.innerHTML
        dlBtn.innerHTML =
          '<svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M5 11.9657L8.37838 14.7529L15 5.83398" stroke="currentColor" stroke-width="1.5" stroke-linecap="square"/></svg>'
        setTimeout(() => {
          dlBtn.innerHTML = prev
        }, 2000)
      }
      return
    }

    // Regular local path link
    const pathSpan = target.closest("[data-path-link]")
    if (pathSpan instanceof HTMLElement) {
      const path = pathSpan.getAttribute("data-path-link")
      if (path) {
        event.preventDefault()
        event.stopPropagation()
        const ops = getOps()
        if (ops.openPath) void ops.openPath(path)
        else if (ops.openLink) ops.openLink(path)
      }
      return
    }

    // HTML file path link (the span text itself)
    const htmlSpan = target.closest("[data-html-file-card]")
    if (htmlSpan instanceof HTMLElement) {
      const path = htmlSpan.getAttribute("data-html-file-card")
      if (path) {
        event.preventDefault()
        event.stopPropagation()
        const ops = getOps()
        const cleanPath = path.replace(/^file:\/\/\/?/, "")
        if (ops.openPath) void ops.openPath(cleanPath)
        else if (ops.openLink) ops.openLink(path)
      }
      return
    }

    // HTML preview card
    const htmlCard = target.closest("[data-path-open]")
    if (htmlCard instanceof HTMLElement) {
      const path = htmlCard.getAttribute("data-path-open")
      if (path) {
        event.preventDefault()
        event.stopPropagation()
        const ops = getOps()
        const cleanPath = path.replace(/^file:\/\/\/?/, "")
        if (ops.openPath) void ops.openPath(cleanPath)
        else if (ops.openLink) ops.openLink(path)
      }
    }
  }

  root.addEventListener("mouseover", handleMouseOver)
  root.addEventListener("mouseout", handleMouseOut)
  root.addEventListener("click", handleClick)

  return () => {
    root.removeEventListener("mouseover", handleMouseOver)
    root.removeEventListener("mouseout", handleMouseOut)
    root.removeEventListener("click", handleClick)
  }
}

function setupCodeCopy(root: HTMLDivElement, getLabels: () => CopyLabels) {
  const timeouts = new Map<HTMLButtonElement, ReturnType<typeof setTimeout>>()

  const updateLabel = (button: HTMLButtonElement) => {
    const labels = getLabels()
    const copied = button.getAttribute("data-copied") === "true"
    setCopyState(button, labels, copied)
  }

  const handleClick = async (event: MouseEvent) => {
    const target = event.target
    if (!(target instanceof Element)) return

    const button = target.closest('[data-slot="markdown-copy-button"]')
    if (!(button instanceof HTMLButtonElement)) return
    const code = button.closest('[data-component="markdown-code"]')?.querySelector("code")
    const content = code?.textContent ?? ""
    if (!content) return
    const clipboard = navigator?.clipboard
    if (!clipboard) return
    await clipboard.writeText(content)
    const labels = getLabels()
    setCopyState(button, labels, true)
    const existing = timeouts.get(button)
    if (existing) clearTimeout(existing)
    const timeout = setTimeout(() => setCopyState(button, labels, false), 2000)
    timeouts.set(button, timeout)
  }

  const buttons = Array.from(root.querySelectorAll('[data-slot="markdown-copy-button"]'))
  for (const button of buttons) {
    if (button instanceof HTMLButtonElement) updateLabel(button)
  }

  root.addEventListener("click", handleClick)

  return () => {
    root.removeEventListener("click", handleClick)
    for (const timeout of timeouts.values()) {
      clearTimeout(timeout)
    }
  }
}

function touch(key: string, value: Entry) {
  cache.delete(key)
  cache.set(key, value)

  if (cache.size <= max) return

  const first = cache.keys().next().value
  if (!first) return
  cache.delete(first)
}

export function Markdown(
  props: ComponentProps<"div"> & {
    text: string
    cacheKey?: string
    streaming?: boolean
    class?: string
    classList?: Record<string, boolean>
  },
) {
  const [local, others] = splitProps(props, ["text", "cacheKey", "streaming", "class", "classList", "dir", "style"])
  const marked = useMarked()
  const i18n = useI18n()
  const ops = usePlatformOps()
  const [root, setRoot] = createSignal<HTMLDivElement>()
  const [html] = createResource(
    () => ({
      text: local.text,
      key: local.cacheKey,
      streaming: local.streaming ?? false,
    }),
    async (src) => {
      if (isServer) return fallback(src.text)
      if (!src.text) return ""

      const base = src.key ?? checksum(src.text)
      return Promise.all(
        stream(src.text, src.streaming).map(async (block, index) => {
          const hash = checksum(block.raw)
          const key = base ? `${base}:${index}:${block.mode}` : hash

          if (key && hash) {
            const cached = cache.get(key)
            if (cached && cached.hash === hash) {
              touch(key, cached)
              return cached.html
            }
          }

          const next = await Promise.resolve(marked.parse(block.src))
          const safe = sanitize(next)
          if (key && hash) touch(key, { hash, html: safe })
          return safe
        }),
      )
        .then((list) => list.join(""))
        .catch(() => fallback(src.text))
    },
    { initialValue: fallback(local.text) },
  )

  let copyCleanup: (() => void) | undefined
  let pathLinksCleanup: (() => void) | undefined
  let previewCleanup: (() => void) | undefined

  createEffect(() => {
    const container = root()
    const content = local.text ? (html.latest ?? html() ?? "") : ""
    if (!container) return
    if (isServer) return

    if (!content) {
      container.innerHTML = ""
      return
    }

    const labels = {
      copy: i18n.t("ui.message.copy"),
      copied: i18n.t("ui.message.copied"),
      preview: i18n.t("ui.artifact.preview"),
    }
    const dlLabels: DownloadLabels = {
      download: i18n.t("ui.download.download"),
      downloading: i18n.t("ui.download.downloading"),
      downloaded: i18n.t("ui.download.downloaded"),
      saved: i18n.t("ui.download.saved"),
      failed: i18n.t("ui.download.failed"),
      openInFolder: i18n.t("ui.download.openInFolder"),
      changeFolder: i18n.t("ui.download.changeFolder"),
      openingInBrowser: i18n.t("ui.download.openingInBrowser"),
    }
    const temp = document.createElement("div")
    // Mirror the markdown root's direction onto the staging div so decorate()
    // can detect it. wrapMarkdownImages / wrapMarkdownImageLinks read this
    // attribute to decide which side the chip aligns to — without it, every
    // chip falls back to LTR regardless of the actual message direction.
    temp.setAttribute("dir", textDir())
    temp.innerHTML = content
    decorate(temp, labels, dlLabels)

    morphdom(container, temp, {
      childrenOnly: true,
      onBeforeElUpdated: (fromEl, toEl) => {
        if (
          fromEl instanceof HTMLButtonElement &&
          toEl instanceof HTMLButtonElement &&
          fromEl.getAttribute("data-slot") === "markdown-copy-button" &&
          toEl.getAttribute("data-slot") === "markdown-copy-button" &&
          fromEl.getAttribute("data-copied") === "true"
        ) {
          setCopyState(toEl, labels, true)
        }
        if (fromEl.isEqualNode(toEl)) return false
        return true
      },
    })

    if (!copyCleanup)
      copyCleanup = setupCodeCopy(container, () => ({
        copy: i18n.t("ui.message.copy"),
        copied: i18n.t("ui.message.copied"),
        preview: i18n.t("ui.artifact.preview"),
      }))

    if (!previewCleanup) previewCleanup = setupPreviewClick(container)

    if (!(local.streaming ?? false)) injectHtmlInlinePreviews(container, ops, labels.preview)

    if (!pathLinksCleanup)
      pathLinksCleanup = setupPathLinks(container, () => ops, () => ({
        download: i18n.t("ui.download.download"),
        downloading: i18n.t("ui.download.downloading"),
        downloaded: i18n.t("ui.download.downloaded"),
        saved: i18n.t("ui.download.saved"),
        failed: i18n.t("ui.download.failed"),
        openInFolder: i18n.t("ui.download.openInFolder"),
        changeFolder: i18n.t("ui.download.changeFolder"),
        openingInBrowser: i18n.t("ui.download.openingInBrowser"),
      }))

    void hydrateHtmlPreviews(container, ops)
  })

  // Pop the Canvas/preview panel for the first previewable block once
  // streaming finishes. The inline-card injection itself is handled by the
  // main effect (it re-runs when streaming flips to false).
  createEffect(
    on(
      () => local.streaming ?? false,
      (now, prev) => {
        if (prev !== true || now !== false) return
        const container = root()
        if (!container || isServer) return
        for (const pre of container.querySelectorAll("pre")) {
          const lang = getPreviewLang(pre as HTMLPreElement)
          if (!lang) continue
          const content = pre.querySelector("code")?.textContent ?? ""
          if (!content) continue
          dispatchArtifact(content, lang)
          return
        }
      },
      { defer: true },
    ),
  )

  onCleanup(() => {
    if (copyCleanup) copyCleanup()
    if (previewCleanup) previewCleanup()
    if (pathLinksCleanup) pathLinksCleanup()
  })

  // Strict majority would flip Hebrew-leaning messages back to LTR whenever
  // they reference a few tool/model names, so we strip code and threshold on
  // a ratio instead.
  const RTL_RATIO_THRESHOLD = 0.3
  // Bound the cost on long streaming messages \u2014 direction is decided by the
  // opening prose, not by paragraph 40.
  const DIR_SAMPLE_CHARS = 2000
  const textDir = createMemo(() => {
    const raw = local.text ?? ""
    if (!raw) return "ltr"
    const prose = raw
      .slice(0, DIR_SAMPLE_CHARS)
      .replace(/```[\s\S]*?```/g, "")
      .replace(/`[^`]*`/g, "")
      // Strip URLs and markdown link/image targets — a single long image
      // URL is hundreds of LTR chars and would flip a Hebrew message back
      // to LTR (which then mis-aligns inline media chips to the left).
      .replace(/\bhttps?:\/\/\S+/gi, "")
      .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
      .replace(/\[[^\]]*\]\([^)]*\)/g, "")
    const rtlChars = (prose.match(/[\u0591-\u07FF\uFB1D-\uFDFD\uFE70-\uFEFC]/g) || []).length
    const ltrChars = (prose.match(/[A-Za-z\u00C0-\u024F]/g) || []).length
    const total = rtlChars + ltrChars
    if (total === 0) return "ltr"
    return rtlChars / total >= RTL_RATIO_THRESHOLD ? "rtl" : "ltr"
  })

  return (
    <div
      data-component="markdown"
      dir={textDir()}
      classList={{
        ...(local.classList ?? {}),
        [local.class ?? ""]: !!local.class,
      }}
      style={{ "text-align": "start", "unicode-bidi": "isolate" }}
      ref={setRoot}
      {...others}
    />
  )
}
