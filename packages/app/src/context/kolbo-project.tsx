import { createContext, createResource, useContext, type ParentProps } from "solid-js"
import { createStore } from "solid-js/store"
import { Persist, PersistTesting, persisted } from "@/utils/persist"
import { useSDK } from "@/context/sdk"
import { useGlobalSDK } from "@/context/global-sdk"
import { usePlatform } from "@/context/platform"

/**
 * Which Kolbo PLATFORM project (the cloud bucket generations land in) this
 * workspace belongs to. Selected via the composer chip, auto-linked by the
 * New Project dialog, injected into every prompt as a synthetic part
 * (build-request-parts.ts). No id → the default "API Generations" bucket:
 * the agent simply omits project_id.
 */
export type KolboProjectLink = { id?: string; name?: string }

export type KolboProjectInfo = { id: string; name: string; is_default: boolean; thumbnail: string | null }

/**
 * Write the link from OUTSIDE the workspace provider tree — the New Project
 * dialog runs on the home page, before the workspace (and this provider)
 * exists. Mirrors persisted()'s storage resolution exactly (desktop: named
 * Tauri store, web: prefixed localStorage) so the provider below reads it
 * seamlessly on first mount.
 */
export async function writeKolboProjectLink(
  platform: ReturnType<typeof usePlatform>,
  directory: string,
  link: KolboProjectLink,
) {
  const target = Persist.workspace(directory, "kolbo-project")
  const value = JSON.stringify(link)
  const isDesktop = platform.platform === "desktop" && !!platform.storage
  if (isDesktop) await platform.storage?.(target.storage)?.setItem(target.key, value)
  else PersistTesting.localStorageWithPrefix(target.storage!).setItem(target.key, value)
}

function create(sdk: ReturnType<typeof useSDK>, globalSDK: ReturnType<typeof useGlobalSDK>) {
  const [link, setLink] = persisted(
    Persist.workspace(sdk.directory, "kolbo-project"),
    createStore<KolboProjectLink>({}),
  )
  const [projects, { refetch }] = createResource(
    async () => {
      const res = await globalSDK.client.global.kolboProjects().catch(() => undefined)
      // Array.isArray, not truthiness: a server without this route falls through
      // to the SPA catch-all and returns HTML (same guard as the DNA fetch).
      return Array.isArray(res?.data) ? (res!.data as KolboProjectInfo[]) : []
    },
    { initialValue: [] },
  )
  return {
    link,
    projects,
    refetchProjects: refetch,
    select(p: { id: string; name: string } | undefined) {
      setLink({ id: p?.id, name: p?.name })
    },
    async createAndSelect(name: string) {
      const res = await globalSDK.client.global.kolboProjectsCreate({ name })
      const project = res.data as KolboProjectInfo | undefined
      if (project?.id) {
        setLink({ id: project.id, name: project.name })
        refetch()
      }
      return project
    },
  }
}

const Context = createContext<ReturnType<typeof create>>()

export function KolboProjectProvider(props: ParentProps) {
  const sdk = useSDK()
  const globalSDK = useGlobalSDK()
  return <Context.Provider value={create(sdk, globalSDK)}>{props.children}</Context.Provider>
}

export function useKolboProject() {
  const ctx = useContext(Context)
  if (!ctx) throw new Error("useKolboProject must be used within KolboProjectProvider")
  return ctx
}

/** For call sites that can render outside the provider (tests, other surfaces
 *  reusing PromptInput) — absent provider means "default bucket", not a crash. */
export function useKolboProjectOptional() {
  return useContext(Context)
}
