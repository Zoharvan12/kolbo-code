import { createContext, useContext, type ParentProps } from "solid-js"

/** One poll of Kolbo's generation status endpoint. */
export type GenerationStatus = {
  state: "processing" | "completed" | "failed" | "cancelled" | string
  urls: string[]
  credits?: number
  error?: string
}

export type PlatformOps = {
  openPath?: (path: string) => Promise<void> | void
  openLink?: (url: string) => void
  fetch?: typeof window.fetch
  /** Show a native Save As dialog and return the chosen path, or null if cancelled */
  saveFilePickerDialog?: (opts?: { defaultPath?: string; title?: string }) => Promise<string | null>
  /** Write binary data to a local path */
  writeFile?: (path: string, data: Uint8Array) => Promise<void>
  /** Download a remote URL directly to the configured download folder; returns the saved path */
  downloadFile?: (url: string) => Promise<string>
  /** Read a local text file by path */
  readTextFile?: (path: string) => Promise<string>
  /** Reveal a file in the system file manager with the file pre-selected */
  revealFile?: (path: string) => Promise<void> | void
  /** Open a folder picker to change the configured download folder */
  changeDownloadFolder?: () => Promise<void>
  /**
   * Store HTML content in the local sidecar and return a stable HTTP URL.
   * Used by the write-tool thumbnail so WebView2 can composite the iframe correctly
   * (blob: and srcdoc both fail for GPU/external-resource content in Tauri WebView2).
   */
  htmlPreviewUrl?: (content: string) => Promise<string | null>
  /**
   * Rewrite a remote image URL so it routes through the local sidecar proxy
   * instead of being fetched directly by WebView2. Used for model/provider
   * avatars hosted on api.kolbo.ai — WebView2 can't complete the TLS
   * handshake on those, but the sidecar's native Bun fetch can.
   *
   * Returns immediately (just a URL string — the sidecar fetches on demand).
   * Returns the original URL on web/no-sidecar builds.
   */
  imageProxyUrl?: (remoteUrl: string) => string
  /**
   * Rewrite a published Kolbo site URL (sites.kolbo.ai / dev shared-artifact-raw)
   * to the sidecar's /global/site-preview proxy. Published sites send
   * `frame-ancestors https://*.kolbo.ai`, so the app origin can only iframe
   * them through the proxy. Returns null when no sidecar is available.
   */
  sitePreviewUrl?: (remoteUrl: string) => string | null
  /** Cancel one in-flight Kolbo media generation and refund its credits. */
  cancelGeneration?: (generationId: string) => Promise<void>
  /**
   * Check one Kolbo media generation that outlived its tool call. The MCP's
   * generate_* tools stop waiting after their poll window and return
   * `state: "processing"`; the card that renders keeps spinning forever unless
   * something finishes the job of watching it.
   */
  generationStatus?: (generationId: string) => Promise<GenerationStatus | undefined>
  /** Fetch a Kolbo MCP Apps widget HTML document by resource URI. */
  mcpWidget?: (uri: string) => Promise<string | null>
}

const PlatformOpsCtx = createContext<PlatformOps>({})

export function PlatformOpsProvider(props: ParentProps<PlatformOps>) {
  // Merge with parent context so nested providers only override what they explicitly supply
  const parent = useContext(PlatformOpsCtx)
  const value: PlatformOps = {
    get openPath() {
      return props.openPath ?? parent.openPath
    },
    get openLink() {
      return props.openLink ?? parent.openLink
    },
    get fetch() {
      return props.fetch ?? parent.fetch
    },
    get saveFilePickerDialog() {
      return props.saveFilePickerDialog ?? parent.saveFilePickerDialog
    },
    get writeFile() {
      return props.writeFile ?? parent.writeFile
    },
    get downloadFile() {
      return props.downloadFile ?? parent.downloadFile
    },
    get readTextFile() {
      return props.readTextFile ?? parent.readTextFile
    },
    get revealFile() {
      return props.revealFile ?? parent.revealFile
    },
    get changeDownloadFolder() {
      return props.changeDownloadFolder ?? parent.changeDownloadFolder
    },
    get htmlPreviewUrl() {
      return props.htmlPreviewUrl ?? parent.htmlPreviewUrl
    },
    get imageProxyUrl() {
      return props.imageProxyUrl ?? parent.imageProxyUrl
    },
    get sitePreviewUrl() {
      return props.sitePreviewUrl ?? parent.sitePreviewUrl
    },
    get cancelGeneration() {
      return props.cancelGeneration ?? parent.cancelGeneration
    },
    get generationStatus() {
      return props.generationStatus ?? parent.generationStatus
    },
    get mcpWidget() {
      return props.mcpWidget ?? parent.mcpWidget
    },
  }
  return <PlatformOpsCtx.Provider value={value}>{props.children}</PlatformOpsCtx.Provider>
}

export function usePlatformOps(): PlatformOps {
  return useContext(PlatformOpsCtx)
}
