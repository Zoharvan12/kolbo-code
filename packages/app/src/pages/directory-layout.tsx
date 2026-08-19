import { DataProvider, PlatformOpsProvider } from "@opencode-ai/ui/context"
import { showToast } from "@opencode-ai/ui/toast"
import { base64Encode } from "@opencode-ai/util/encode"
import { useLocation, useNavigate, useParams } from "@solidjs/router"
import { createEffect, createMemo, type ParentProps, Show } from "solid-js"
import { useLanguage } from "@/context/language"
import { LocalProvider } from "@/context/local"
import { SDKProvider } from "@/context/sdk"
import { SyncProvider, useSync } from "@/context/sync"
import { usePlatform } from "@/context/platform"
import { useServer } from "@/context/server"
import { decode64 } from "@/utils/base64"

async function storeHtmlPreview(serverUrl: string, content: string): Promise<string | null> {
  try {
    const res = await fetch(`${serverUrl}/global/html-preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    })
    if (!res.ok) return null
    const data = (await res.json()) as { id?: string }
    if (!data.id) return null
    return `${serverUrl}/global/html-preview/${data.id}`
  } catch {
    return null
  }
}

function DirectoryDataProvider(props: ParentProps<{ directory: string }>) {
  const location = useLocation()
  const navigate = useNavigate()
  const params = useParams()
  const sync = useSync()
  const platform = usePlatform()
  const server = useServer()
  const slug = createMemo(() => base64Encode(props.directory))

  createEffect(() => {
    const next = sync.data.path.directory
    if (!next || next === props.directory) return
    const path = location.pathname.slice(slug().length + 1)
    navigate(`/${base64Encode(next)}${path}${location.search}${location.hash}`, { replace: true })
  })

  createEffect(() => {
    const id = params.id
    if (!id) return
    void sync.session.sync(id)
  })

  return (
    <PlatformOpsProvider
      openPath={platform.openPath ? (p) => platform.openPath!(p) : undefined}
      openLink={(u) => platform.openLink(u)}
      fetch={platform.fetch}
      downloadFile={
        platform.downloadFile && platform.getDownloadFolder
          ? async (url: string) => {
              const folder = await platform.getDownloadFolder!()
              return platform.downloadFile!(url, folder)
            }
          : undefined
      }
      readTextFile={platform.readTextFile ? (p) => platform.readTextFile!(p) : undefined}
      revealFile={platform.revealFile ? (p) => platform.revealFile!(p) : undefined}
      changeDownloadFolder={
        platform.openDirectoryPickerDialog && platform.setDownloadFolder
          ? async () => {
              const picked = await platform.openDirectoryPickerDialog!({ title: "Choose download folder" })
              const path = Array.isArray(picked) ? picked[0] : picked
              if (path) await platform.setDownloadFolder!(path)
            }
          : undefined
      }
      htmlPreviewUrl={(content) => {
        const url = server.current?.http.url
        if (!url) return Promise.resolve(null)
        return storeHtmlPreview(url, content)
      }}
      sitePreviewUrl={(remote) => {
        const url = server.current?.http.url
        if (!url || !remote) return null
        return `${url}/global/site-preview?url=${encodeURIComponent(remote)}`
      }}
      imageProxyUrl={(remote) => {
        const url = server.current?.http.url
        // No sidecar available (web build) — caller will fetch directly.
        if (!url || !remote) return remote
        // Only proxy real http(s) URLs; pass blob:, data:, file: through.
        if (!/^https?:\/\//i.test(remote)) return remote
        return `${url}/global/proxy-image?url=${encodeURIComponent(remote)}`
      }}
      mcpWidget={async (uri) => {
        const url = server.current?.http.url
        if (!url) return null
        const res = await fetch(`${url}/mcp/kolbo/resource?uri=${encodeURIComponent(uri)}`)
        if (!res.ok) return null
        const data = (await res.json().catch(() => ({}))) as { html?: string }
        return typeof data.html === "string" && data.html ? data.html : null
      }}
      generationStatus={async (generationId) => {
        const url = server.current?.http.url
        if (!url) return undefined
        const res = await fetch(`${url}/global/kolbo-generation-status?generationId=${encodeURIComponent(generationId)}`)
        if (!res.ok) return undefined
        const data = (await res.json().catch(() => ({}))) as {
          state?: string
          error?: string
          credits_used?: unknown
          result?: { urls?: unknown }
        }
        if (typeof data.state !== "string") return undefined
        const raw = data.result?.urls
        return {
          state: data.state,
          urls: Array.isArray(raw) ? raw.filter((u): u is string => typeof u === "string") : [],
          ...(typeof data.credits_used === "number" ? { credits: data.credits_used } : {}),
          ...(typeof data.error === "string" ? { error: data.error } : {}),
        }
      }}
      cancelGeneration={async (generationId) => {
        const url = server.current?.http.url
        if (!url) throw new Error("Kolbo server is unavailable")
        const res = await fetch(`${url}/global/kolbo-generation-cancel`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ generationId }),
        })
        if (res.ok) return
        const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string }
        throw new Error(data.error || data.message || "Could not cancel generation")
      }}
    >
      <DataProvider
        data={sync.data}
        directory={props.directory}
        onNavigateToSession={(sessionID: string) => navigate(`/${slug()}/session/${sessionID}`)}
        onSessionHref={(sessionID: string) => `/${slug()}/session/${sessionID}`}
      >
        <LocalProvider>{props.children}</LocalProvider>
      </DataProvider>
    </PlatformOpsProvider>
  )
}

export default function Layout(props: ParentProps) {
  const params = useParams()
  const language = useLanguage()
  const navigate = useNavigate()
  let invalid = ""

  const resolved = createMemo(() => {
    if (!params.dir) return ""
    return decode64(params.dir) ?? ""
  })

  createEffect(() => {
    const dir = params.dir
    if (!dir) return
    if (resolved()) {
      invalid = ""
      return
    }
    if (invalid === dir) return
    invalid = dir
    showToast({
      variant: "error",
      title: language.t("common.requestFailed"),
      description: language.t("directory.error.invalidUrl"),
    })
    navigate("/", { replace: true })
  })

  return (
    <Show when={resolved()} keyed>
      {(resolved) => (
        <SDKProvider directory={() => resolved}>
          <SyncProvider>
            <DirectoryDataProvider directory={resolved}>{props.children}</DirectoryDataProvider>
          </SyncProvider>
        </SDKProvider>
      )}
    </Show>
  )
}
