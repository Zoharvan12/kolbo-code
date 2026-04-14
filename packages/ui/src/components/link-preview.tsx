import { createResource, For, Show } from "solid-js"
import { usePlatformOps } from "../context/platform-ops"

type OgData = {
  title?: string
  description?: string
  image?: string
  url: string
  hostname?: string
}

// Module-level cache to avoid re-fetching on re-render
const ogCache = new Map<string, OgData | null>()

async function fetchOgData(url: string, fetchFn: typeof window.fetch): Promise<OgData | null> {
  if (ogCache.has(url)) return ogCache.get(url) ?? null

  try {
    const response = await fetchFn(url)
    if (!response.ok) {
      ogCache.set(url, null)
      return null
    }

    const contentType = response.headers.get("content-type") ?? ""
    if (!contentType.includes("text/html")) {
      ogCache.set(url, null)
      return null
    }

    const html = await response.text()
    const doc = new DOMParser().parseFromString(html, "text/html")

    const getMeta = (...selectors: string[]) => {
      for (const s of selectors) {
        const v = doc.querySelector(s)?.getAttribute("content")
        if (v) return v
      }
      return undefined
    }

    let hostname: string | undefined
    try {
      hostname = new URL(url).hostname
    } catch {}

    const data: OgData = {
      url,
      hostname,
      title:
        getMeta('meta[property="og:title"]', 'meta[name="twitter:title"]') ||
        doc.title ||
        undefined,
      description:
        getMeta(
          'meta[property="og:description"]',
          'meta[name="description"]',
          'meta[name="twitter:description"]',
        ) || undefined,
      image:
        getMeta('meta[property="og:image"]', 'meta[name="twitter:image"]') || undefined,
    }

    // Only cache if we got something useful
    if (!data.title && !data.description && !data.image) {
      ogCache.set(url, null)
      return null
    }

    ogCache.set(url, data)
    return data
  } catch {
    ogCache.set(url, null)
    return null
  }
}

export function LinkPreview(props: { url: string }) {
  const ops = usePlatformOps()

  const [data] = createResource(
    () => ({ url: props.url, fetchFn: ops.fetch ?? window.fetch }),
    ({ url, fetchFn }) => fetchOgData(url, fetchFn),
  )

  const handleClick = () => {
    const url = props.url
    if (ops.openLink) ops.openLink(url)
    else window.open(url, "_blank", "noopener,noreferrer")
  }

  return (
    <Show when={data() && !data.loading}>
      {(_) => {
        const d = data()
        if (!d) return null
        return (
          <div
            data-component="link-preview"
            class="group mt-2 flex cursor-pointer overflow-hidden rounded border border-border-weak-base bg-background-stronger transition-colors hover:border-border-base hover:bg-background-strongest"
            onClick={handleClick}
            role="link"
            tabIndex={0}
            onKeyDown={(e) => e.key === "Enter" && handleClick()}
          >
            {/* Image thumbnail */}
            <Show when={d.image}>
              {(img) => (
                <div class="hidden w-24 flex-shrink-0 sm:block">
                  <img
                    src={img()}
                    alt=""
                    class="h-full w-full object-cover"
                    loading="lazy"
                    onError={(e) => ((e.target as HTMLImageElement).style.display = "none")}
                  />
                </div>
              )}
            </Show>

            {/* Text content */}
            <div class="min-w-0 flex-1 px-3 py-2.5">
              <Show when={d.hostname}>
                <p class="mb-0.5 text-11-regular text-text-weakest truncate">{d.hostname}</p>
              </Show>
              <Show when={d.title}>
                <p class="text-13-semibold text-text-strong truncate leading-tight">{d.title}</p>
              </Show>
              <Show when={d.description}>
                <p class="mt-0.5 text-12-regular text-text-weak line-clamp-2 leading-snug">
                  {d.description}
                </p>
              </Show>
            </div>
          </div>
        )
      }}
    </Show>
  )
}

export function LinkPreviews(props: { urls: string[] }) {
  return (
    <Show when={props.urls.length > 0}>
      <div data-component="link-previews" class="mt-1 flex flex-col gap-1">
        <For each={props.urls}>{(url) => <LinkPreview url={url} />}</For>
      </div>
    </Show>
  )
}
