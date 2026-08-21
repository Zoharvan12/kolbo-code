import { sampledChecksum } from "@opencode-ai/util/encode"
import type { PlatformOps } from "../context/platform-ops"

export type ArtifactLang = "html" | "svg" | "mermaid" | "markdown" | "site"

export type ArtifactMeta = {
  path?: string
  title?: string
}

/** Filename (or title) for the Artifacts chrome — never leave the panel anonymous. */
export function artifactLabel(lang: ArtifactLang, meta?: ArtifactMeta): string {
  if (meta?.title?.trim()) return meta.title.trim()
  const path = meta?.path?.replace(/\\/g, "/")
  if (path) {
    const base = path.split("/").pop()
    if (base) return base
  }
  if (lang === "markdown") return "Markdown"
  if (lang === "html") return "HTML"
  if (lang === "svg") return "SVG"
  if (lang === "mermaid") return "Mermaid"
  if (lang === "site") return "Site"
  return "Artifact"
}

/** One agent-driven auto-open per session. Edits remount per tool call; without
 *  this gate each HTML tweak re-opens Artifacts and steals focus from Canvas. */
let agentOpen = false

export function takeAgentOpen() {
  if (agentOpen) return false
  agentOpen = true
  return true
}

export function resetAgentOpen() {
  agentOpen = false
}

export function dispatchArtifact(
  content: string,
  lang: ArtifactLang,
  autoOpen = true,
  meta?: ArtifactMeta,
): void {
  document.dispatchEvent(
    new CustomEvent("kolbo:artifact", {
      detail: { content, lang, autoOpen, path: meta?.path, title: meta?.title },
    }),
  )
}

/** Coalesce rapid HTML edit bursts into one panel update. */
let debounceTimer: ReturnType<typeof setTimeout> | undefined
let debouncePending:
  | { content: string; lang: ArtifactLang; autoOpen: boolean; meta?: ArtifactMeta }
  | undefined

export function dispatchArtifactDebounced(
  content: string,
  lang: ArtifactLang,
  autoOpen = true,
  ms = 200,
  meta?: ArtifactMeta,
): void {
  debouncePending = { content, lang, autoOpen, meta }
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    const next = debouncePending
    debouncePending = undefined
    if (next) dispatchArtifact(next.content, next.lang, next.autoOpen, next.meta)
  }, ms)
}

/** A published Kolbo site — sites.kolbo.ai in prod, shared-artifact-raw on dev/partner backends. */
export function isKolboSiteUrl(href: string | null | undefined): boolean {
  if (!href) return false
  return (
    /^https:\/\/sites\.kolbo\.ai\/[\w-]+\/?$/i.test(href) ||
    /^https?:\/\/[^\s?#]+\/shared-artifact-raw\/[\w-]+\/?$/i.test(href)
  )
}

export function isHtmlPath(path: string | null | undefined): boolean {
  if (!path) return false
  return path.endsWith(".html") || path.endsWith(".htm")
}

export function isMarkdownPath(path: string | null | undefined): boolean {
  if (!path) return false
  return path.endsWith(".md") || path.endsWith(".markdown")
}

/** Session plan markdown under `.kolbo/plans/` or global `plans/<timestamp>-*.md`.
 *  These must auto-open Artifacts — unlike production.md bookkeeping churn. */
export function isPlanPath(path: string | null | undefined): boolean {
  if (!path) return false
  const n = path.replace(/\\/g, "/")
  if (/\.kolbo\/plans\/[^/]+\.md$/i.test(n)) return true
  if (/\/plans\/\d{10,}-[^/]+\.md$/i.test(n)) return true
  return false
}

export type HtmlPreviewSource = { kind: "url"; url: string } | { kind: "srcdoc"; content: string }

const CACHE_MAX = 24
const previewUrlCache = new Map<string, Promise<string | null>>()

export async function resolveHtmlPreviewSource(
  ops: Pick<PlatformOps, "htmlPreviewUrl">,
  content: string,
): Promise<HtmlPreviewSource> {
  if (!content) return { kind: "srcdoc", content: "" }
  const fetcher = ops.htmlPreviewUrl
  if (!fetcher) return { kind: "srcdoc", content }
  const key = sampledChecksum(content) ?? content.slice(0, 64)
  let pending = previewUrlCache.get(key)
  if (!pending) {
    pending = fetcher(content).catch(() => null)
    previewUrlCache.set(key, pending)
    if (previewUrlCache.size > CACHE_MAX) {
      const first = previewUrlCache.keys().next().value
      if (first) previewUrlCache.delete(first)
    }
  }
  const url = await pending
  return url ? { kind: "url", url } : { kind: "srcdoc", content }
}
