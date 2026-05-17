import { createSignal } from "solid-js"
import { createSimpleContext } from "./helper"

// Resolver for Kolbo model id → { name, avatar } metadata.
//
// `packages/ui` can't reach the app's SDK directly (it's a sibling package),
// so the app provides a `fetch()` thunk through this context. The context
// then transparently caches the result module-globally so every consumer
// (chip, picker, etc.) shares the same single fetch.
//
// Designed to be safe to render in any tree:
//  - lookup() is synchronous and always returns {} until data lands;
//  - the first call triggers the fetch and the signal updates everyone.
//
// The data shape mirrors the server response at /global/kolbo-model-metadata.

export type KolboModelEntry = {
  name?: string
  avatar?: string | null
}

export type KolboModelMetadata = {
  names: Record<string, string>
  avatars: Record<string, string | null>
}

export type KolboModelsFetcher = () => Promise<KolboModelMetadata>

const [data, setData] = createSignal<KolboModelMetadata | null>(null)
let inflight: Promise<unknown> | null = null
let attempted = false

function ensureLoaded(fetcher: KolboModelsFetcher | undefined): void {
  if (!fetcher || inflight || attempted) return
  attempted = true
  inflight = fetcher()
    .then((res) => {
      setData(res)
    })
    .catch(() => {
      // Leave data() null on failure; consumers fall back to the raw id.
      // Allow a future tab refocus / re-mount to retry.
      attempted = false
    })
    .finally(() => {
      inflight = null
    })
}

export const { use: useKolboModels, provider: KolboModelsProvider } = createSimpleContext({
  name: "KolboModels",
  init: (props: { fetcher?: KolboModelsFetcher }) => {
    // Kick off the fetch immediately so by the time the first chip renders
    // the data is usually already in the cache.
    ensureLoaded(props.fetcher)
    return {
      lookup: (id: string): KolboModelEntry => {
        ensureLoaded(props.fetcher)
        const d = data()
        if (!d) return {}
        return {
          name: d.names[id],
          avatar: d.avatars[id] ?? undefined,
        }
      },
    }
  },
})
