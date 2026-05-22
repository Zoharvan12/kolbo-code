import type { PlatformOps } from "../context/platform-ops"

export type ArtifactLang = "html" | "svg" | "mermaid"

export function dispatchArtifact(content: string, lang: ArtifactLang, autoOpen = true): void {
  document.dispatchEvent(new CustomEvent("kolbo:artifact", { detail: { content, lang, autoOpen } }))
}

export function isHtmlPath(path: string | null | undefined): boolean {
  if (!path) return false
  return path.endsWith(".html") || path.endsWith(".htm")
}

export type HtmlPreviewSource = { kind: "url"; url: string } | { kind: "srcdoc"; content: string }

const previewUrlCache = new Map<string, Promise<string | null>>()

export async function resolveHtmlPreviewSource(
  ops: Pick<PlatformOps, "htmlPreviewUrl">,
  content: string,
): Promise<HtmlPreviewSource> {
  if (!content) return { kind: "srcdoc", content: "" }
  const fetcher = ops.htmlPreviewUrl
  if (!fetcher) return { kind: "srcdoc", content }
  let pending = previewUrlCache.get(content)
  if (!pending) {
    pending = fetcher(content).catch(() => null)
    previewUrlCache.set(content, pending)
  }
  const url = await pending
  return url ? { kind: "url", url } : { kind: "srcdoc", content }
}
