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
