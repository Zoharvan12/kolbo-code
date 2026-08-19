import { Show, createMemo, createResource, createSignal } from "solid-js"
import { createStore } from "solid-js/store"
import { Dialog } from "@opencode-ai/ui/dialog"
import { Button } from "@opencode-ai/ui/button"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { useGlobalSDK } from "@/context/global-sdk"
import { useGlobalSync } from "@/context/global-sync"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { useServer } from "@/context/server"
import { Persist, persisted } from "@/utils/persist"
import { writeKolboProjectLink } from "@/context/kolbo-project"

/**
 * "New project" — the project=folder fix. A project IS a folder on disk, so
 * this asks only for a NAME and a place to put it (remembered, prefilled with
 * ~/Documents/Kolbo Projects) instead of dropping non-technical users into a
 * raw OS folder picker with zero context. Creates <location>/<name> via
 * POST /project/create, best-effort auto-links a same-named Kolbo cloud
 * project, then opens the folder as the workspace.
 */
export function DialogNewProject(props: { onCreated: (directory: string) => void }) {
  const dialog = useDialog()
  const language = useLanguage()
  const platform = usePlatform()
  const server = useServer()
  const sdk = useGlobalSDK()
  const sync = useGlobalSync()

  const [name, setName] = createSignal("")
  const [busy, setBusy] = createSignal(false)
  const [error, setError] = createSignal<string>()
  const [loc, setLoc] = persisted(Persist.global("new-project-location"), createStore<{ parent?: string }>({}))

  // Same home-dir fallback chain DialogSelectDirectory uses — global sync may
  // not have hydrated path info yet on a fresh server.
  const [fallbackPath] = createResource(
    () => (!sync.data.path.home ? true : undefined),
    async () =>
      sdk.client.path
        .get()
        .then((x) => x.data)
        .catch(() => undefined),
    { initialValue: undefined },
  )
  const home = createMemo(() => sync.data.path.home || fallbackPath()?.home || "")
  const sep = createMemo(() => (home().includes("\\") ? "\\" : "/"))
  const parent = createMemo(() => loc.parent ?? (home() ? `${home()}${sep()}Documents${sep()}Kolbo Projects` : ""))
  const preview = createMemo(() => (name().trim() && parent() ? `${parent()}${sep()}${name().trim()}` : undefined))

  async function browse() {
    if (platform.openDirectoryPickerDialog && server.isLocal()) {
      const result = await platform.openDirectoryPickerDialog({
        title: language.t("home.newProject.saveIn"),
        multiple: false,
      })
      const picked = Array.isArray(result) ? result[0] : result
      if (picked) setLoc({ parent: picked })
    }
  }

  async function create() {
    setBusy(true)
    setError(undefined)
    try {
      const res = await sdk.client.project.create({ parent: parent(), name: name().trim() })
      const directory = res.data?.directory
      if (!directory) {
        const upstream = (res as { error?: { error?: string } }).error?.error
        setError(upstream ?? language.t("home.newProject.error"))
        return
      }
      // Cloud auto-link — best effort, never blocks project creation. Signed-out
      // users still get their folder; the chip falls back to API Generations.
      try {
        const cloud = await sdk.client.global.kolboProjectsCreate({ name: name().trim() })
        if (cloud.data?.id) await writeKolboProjectLink(platform, directory, { id: cloud.data.id, name: cloud.data.name })
      } catch {}
      dialog.close()
      props.onCreated(directory)
    } catch {
      setError(language.t("home.newProject.error"))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog title={language.t("home.newProject.title")}>
      <div class="flex flex-col gap-3 p-4 w-105 max-w-full">
        <p class="text-12-regular text-text-weak">{language.t("home.newProject.explainer")}</p>
        <label class="text-11-medium uppercase tracking-wide text-text-weak">
          {language.t("home.newProject.name")}
        </label>
        <input
          class="w-full rounded-lg border border-border-weak-base bg-surface-recess-base px-3 py-2 text-14-regular text-text-strong outline-none focus:border-border-base"
          value={name()}
          onInput={(e) => setName(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && name().trim() && !busy()) void create()
          }}
          autofocus
        />
        <label class="text-11-medium uppercase tracking-wide text-text-weak">
          {language.t("home.newProject.saveIn")}
        </label>
        <div class="flex items-center gap-2 min-w-0">
          <span class="flex-1 truncate text-12-mono text-text-base" dir="ltr">
            {parent()}
          </span>
          <Show when={platform.openDirectoryPickerDialog && server.isLocal()}>
            <Button size="normal" variant="ghost" onClick={() => void browse()}>
              {language.t("home.newProject.change")}
            </Button>
          </Show>
        </div>
        <Show when={preview()}>
          <p class="text-11-regular text-text-subtle truncate" dir="ltr">
            {language.t("home.newProject.willCreate")} {preview()}
          </p>
        </Show>
        <Show when={error()}>
          <p class="text-12-regular text-[var(--color-error,#dc2626)]">{error()}</p>
        </Show>
        <Button size="large" disabled={!name().trim() || !parent() || busy()} onClick={() => void create()}>
          {language.t("home.newProject.create")}
        </Button>
      </div>
    </Dialog>
  )
}
