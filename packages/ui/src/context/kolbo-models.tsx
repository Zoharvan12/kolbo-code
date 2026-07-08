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

// Generation models for a specific generation type (text_to_img, image_editing,
// text_to_video, …) — for the approval-card model picker.
export type KolboGenModel = { id: string; name: string; avatar?: string | null }
export type KolboTypeFetcher = (type: string) => Promise<KolboGenModel[]>

const [data, setData] = createSignal<KolboModelMetadata | null>(null)
let inflight: Promise<unknown> | null = null
let attempted = false

const [typeData, setTypeData] = createSignal<Record<string, KolboGenModel[]>>({})
const typeAttempted = new Set<string>()
let typeFetcherRef: KolboTypeFetcher | undefined

function ensureType(type: string): void {
  if (!type || !typeFetcherRef || typeAttempted.has(type)) return
  typeAttempted.add(type)
  typeFetcherRef(type)
    .then((models) => setTypeData((prev) => ({ ...prev, [type]: models })))
    .catch(() => {
      // Allow a retry later.
      typeAttempted.delete(type)
    })
}

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
  init: (props: { fetcher?: KolboModelsFetcher; typeFetcher?: KolboTypeFetcher }) => {
    // Kick off the fetch immediately so by the time the first chip renders
    // the data is usually already in the cache.
    ensureLoaded(props.fetcher)
    if (props.typeFetcher) typeFetcherRef = props.typeFetcher
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
      // Full catalog for pickers (approval card model dropdown, etc.) — every
      // known model id with its friendly name + avatar. Empty until data lands.
      list: (): Array<{ id: string; name: string; avatar?: string }> => {
        ensureLoaded(props.fetcher)
        const d = data()
        if (!d) return []
        return Object.keys(d.names)
          .map((id) => ({ id, name: d.names[id] ?? id, avatar: d.avatars[id] ?? undefined }))
          .sort((a, b) => a.name.localeCompare(b.name))
      },
      // Generation models for a specific generation type (reactive — empty
      // until the per-type fetch lands, then populated).
      byType: (type: string): KolboGenModel[] => {
        ensureType(type)
        return typeData()[type] ?? []
      },
    }
  },
})
