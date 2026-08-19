# Session Home Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make "project = folder" explicit (New Project dialog + composer gating), add a per-workspace Kolbo cloud-project selector wired into every generation, and rebuild the new-session page around Kobi with category-filtered thumbnail starter cards.

**Architecture:** All changes in kolbo-code. Two new proxy routes on the opencode server (copying the existing `/kolbo-balance` auth idiom + `kolboAssets` TTL cache), one new fs route (`POST /project/create`), regenerated SDK. Client: new `kolbo-project` per-workspace store (Persist.workspace), a composer-footer chip, a synthetic prompt part injecting `project_id` on every submit (same precedent as Visual DNA mentions), a New Project dialog, and a rewritten `session-new-view` with a starter-card grid.

**Tech Stack:** SolidJS (packages/app), Hono + zod (packages/opencode server), hey-api SDK codegen, Tailwind-ish utility classes + `index.css` data-slot styles, bun test.

**Spec:** `docs/superpowers/specs/2026-08-19-session-home-redesign-design.md`

**⚠ Shared checkout warning:** other sessions may have uncommitted WIP in this tree (skills files). `git add` ONLY the files each task names — never `git add -A`.

**Line numbers are anchors, not gospel** — this tree moves fast. Every "Modify" step names a search anchor (a unique string) next to the line number; trust the anchor.

---

### Task 1: Server route — create a project folder

**Files:**
- Modify: `packages/opencode/src/server/routes/project.ts` (after the `POST /git/init` route, ~line 89; anchor: `"/git/init"`)
- Test: `packages/opencode/test/project-create-route.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/opencode/test/project-create-route.test.ts
import { describe, expect, test } from "bun:test"
import { validateNewProjectName } from "../src/server/routes/project"

describe("validateNewProjectName", () => {
  test("accepts plain names", () => {
    expect(validateNewProjectName("Summer Campaign")).toBeUndefined()
  })
  test("rejects empty / whitespace", () => {
    expect(validateNewProjectName("  ")).toBeDefined()
  })
  test("rejects path separators and traversal", () => {
    for (const bad of ["a/b", "a\\b", "..", "con?", 'x"y', "a:b"]) {
      expect(validateNewProjectName(bad)).toBeDefined()
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/opencode && bun test test/project-create-route.test.ts`
Expected: FAIL — `validateNewProjectName` is not exported.

- [ ] **Step 3: Implement the validator + route**

In `packages/opencode/src/server/routes/project.ts`, add (merge imports with the file's existing ones — it already imports Hono/describeRoute/resolver/validator/z; add `node:fs/promises` + `node:path`):

```ts
import fs from "node:fs/promises"
import path from "node:path"

// Windows-reserved chars + separators + traversal. One folder segment only.
export function validateNewProjectName(name: string): string | undefined {
  const trimmed = name.trim()
  if (!trimmed) return "Project name is required"
  if (trimmed === "." || trimmed === "..") return "Invalid project name"
  if (/[<>:"/\\|?*\x00-\x1f]/.test(trimmed)) return 'Name cannot contain \\ / : * ? " < > |'
  return undefined
}
```

Then the route, modeled on the file's `POST /git/init` shape:

```ts
.post(
  "/create",
  describeRoute({
    summary: "Create a new project folder",
    description:
      "Creates <parent>/<name> on the server's filesystem (mkdir -p) and returns the absolute path. Used by the New Project dialog; the client then opens the returned directory as a workspace.",
    operationId: "project.create",
    responses: {
      200: {
        description: "Folder created (or already existed and is empty)",
        content: { "application/json": { schema: resolver(z.object({ directory: z.string() })) } },
      },
      ...errors(400),
    },
  }),
  validator("json", z.object({ parent: z.string(), name: z.string() })),
  async (c) => {
    const { parent, name } = c.req.valid("json")
    const invalid = validateNewProjectName(name)
    if (invalid) return c.json({ error: invalid }, 400)
    const parentResolved = path.resolve(parent)
    const directory = path.join(parentResolved, name.trim())
    // join() with a validated single segment cannot escape parent, but keep the
    // invariant explicit — this route writes to disk.
    if (path.dirname(directory) !== parentResolved) return c.json({ error: "Invalid path" }, 400)
    const existing = await fs.readdir(directory).catch(() => undefined)
    if (existing && existing.length > 0)
      return c.json({ error: "A non-empty folder with this name already exists", directory }, 400)
    await fs.mkdir(directory, { recursive: true })
    return c.json({ directory })
  },
)
```

If `project.ts` has no `errors` helper import, copy the import line from `global.ts` (anchor: `import { errors }`).

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/opencode && bun test test/project-create-route.test.ts`
Expected: 3 pass.

- [ ] **Step 5: Commit**

```bash
git add packages/opencode/src/server/routes/project.ts packages/opencode/test/project-create-route.test.ts
git commit -m "feat(server): POST /project/create — mkdir for the New Project dialog"
```

---

### Task 2: Server routes — Kolbo cloud-project list + create proxies

**Files:**
- Modify: `packages/opencode/src/server/routes/global.ts` (next to `/kolbo-visual-dnas`, anchor: `kolbo-visual-dnas`)

- [ ] **Step 1: Add the projection schema and routes**

The generic `kolboAssets()` cache projects to `{id,name,thumbnail}` — projects also need `is_default`, so this gets its own small cache, same mechanics (TTL, keyed by API key, stale-on-error). Add near `KolboAssetSchema` (anchor: `KolboAssetSchema`):

```ts
const KolboProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  is_default: z.boolean(),
  thumbnail: z.string().nullable(),
})
type KolboProject = z.infer<typeof KolboProjectSchema>

let _kolboProjectsCache: { at: number; key: string; value: KolboProject[] } | undefined
const KOLBO_PROJECTS_TTL = 5 * 60 * 1000

async function kolboProjects(): Promise<KolboProject[]> {
  const auth = (await Auth.get(Partner.authProviderID)) ?? (await Auth.get(Partner.authProviderIDLegacy))
  const apiKey = auth?.type === "api" ? auth.key : auth?.type === "oauth" ? auth.access : undefined
  if (!apiKey) return []
  const hit = _kolboProjectsCache
  if (hit && hit.key === apiKey && Date.now() - hit.at < KOLBO_PROJECTS_TTL) return hit.value
  try {
    const res = await fetch(`${Partner.apiBase}/v1/projects?limit=200`, { headers: { "X-API-Key": apiKey } })
    if (!res.ok) return hit?.value ?? []
    const body = (await res.json()) as {
      projects?: { id: string; name: string; is_default?: boolean; thumbnail_url?: string | null }[]
    }
    const value = (body.projects ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      is_default: !!p.is_default,
      thumbnail: p.thumbnail_url ?? null,
    }))
    _kolboProjectsCache = { at: Date.now(), key: apiKey, value }
    return value
  } catch {
    return hit?.value ?? []
  }
}
```

Then the routes, right after the `/kolbo-moodboards` route (anchor: `kolbo-moodboards`):

```ts
.get(
  "/kolbo-projects",
  describeRoute({
    summary: "Proxy: list the user's Kolbo platform projects",
    description:
      "Cloud projects where generations land. Cached ~5min server-side. Empty array when logged out — never an error.",
    operationId: "global.kolbo-projects",
    responses: {
      200: { description: "Projects", content: { "application/json": { schema: resolver(KolboProjectSchema.array()) } } },
    },
  }),
  async (c) => c.json(await kolboProjects()),
)
.post(
  "/kolbo-projects",
  describeRoute({
    summary: "Proxy: create a Kolbo platform project by name",
    description:
      "Used by New Project auto-link and the composer chip's Create-new. If a project with this name already exists, returns it instead of duplicating.",
    operationId: "global.kolbo-projects-create",
    responses: {
      200: { description: "Created or matched project", content: { "application/json": { schema: resolver(KolboProjectSchema) } } },
      ...errors(401, 502),
    },
  }),
  validator("json", z.object({ name: z.string().min(1) })),
  async (c) => {
    const { name } = c.req.valid("json")
    const auth = (await Auth.get(Partner.authProviderID)) ?? (await Auth.get(Partner.authProviderIDLegacy))
    const apiKey = auth?.type === "api" ? auth.key : auth?.type === "oauth" ? auth.access : undefined
    if (!apiKey) return c.json({ error: "Not signed in to Kolbo" }, 401)
    // Match-first: auto-link must be idempotent across re-created folders.
    const existing = (await kolboProjects()).find((p) => p.name.toLowerCase() === name.trim().toLowerCase())
    if (existing) return c.json(existing)
    const res = await fetch(`${Partner.apiBase}/v1/projects`, {
      method: "POST",
      headers: { "X-API-Key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    })
    if (!res.ok) return c.json({ error: `Kolbo API ${res.status}` }, 502)
    const body = (await res.json()) as { project?: { id: string; name: string } }
    if (!body.project?.id) return c.json({ error: "Malformed upstream response" }, 502)
    _kolboProjectsCache = undefined // next list shows the new project
    return c.json({ id: body.project.id, name: body.project.name, is_default: false, thumbnail: null })
  },
)
```

- [ ] **Step 2: Typecheck**

Run: `cd packages/opencode && bun run typecheck` (script is `tsgo --noEmit` via turbo at root; direct: `bunx tsgo --noEmit`)
Expected: clean.

- [ ] **Step 3: Regenerate the SDK**

Run: `bun ./packages/sdk/js/script/build.ts`
Expected: `packages/sdk/js/src/v2/gen/sdk.gen.ts` gains `kolboProjects()` and `kolboProjectsCreate()` (verify with `grep -n "kolboProjects" packages/sdk/js/src/v2/gen/sdk.gen.ts`).

- [ ] **Step 4: Commit**

```bash
git add packages/opencode/src/server/routes/global.ts packages/sdk/js/src/v2/gen packages/opencode/openapi.json
git commit -m "feat(server): /kolbo-projects list+create proxies with TTL cache"
```

(Only add `openapi.json` if the generate step actually rewrote it.)

---

### Task 3: Client store — per-workspace Kolbo project link

**Files:**
- Create: `packages/app/src/context/kolbo-project.tsx`
- Test: `packages/app/src/context/kolbo-project.test.ts` (only if a bun-test setup exists under packages/app — check `ls packages/app/*.test.*` / package.json "test"; if the app package has no test runner, skip the test file and rely on typecheck, noting it in the commit body)

- [ ] **Step 1: Write the context + out-of-component writer**

```tsx
// packages/app/src/context/kolbo-project.tsx
import { createContext, createResource, useContext, type ParentProps } from "solid-js"
import { createStore } from "solid-js/store"
import { Persist, persisted } from "@/utils/persist"
import { useSDK } from "@/context/sdk"

/**
 * Which Kolbo PLATFORM project (cloud bucket) this workspace's generations
 * belong to. Selected via the composer chip; injected into every prompt as a
 * synthetic part (build-request-parts.ts). id === undefined → default bucket
 * ("API Generations") — the agent just omits project_id.
 */
export type KolboProjectLink = { id?: string; name?: string }

/**
 * Write the link from OUTSIDE the workspace (the New Project dialog runs on the
 * home page, before any workspace context exists). Uses the same storage
 * descriptor persisted() would, so the provider below reads it seamlessly —
 * including on Tauri where storage is async and NOT localStorage.
 */
export async function writeKolboProjectLink(directory: string, link: KolboProjectLink) {
  const d = Persist.workspace(directory, "kolbo-project")
  await d.storage.setItem(d.name, JSON.stringify(link))
}

const Context = createContext<ReturnType<typeof create>>()

function create(directory: string, sdk: ReturnType<typeof useSDK>) {
  const [link, setLink] = persisted(
    Persist.workspace(directory, "kolbo-project"),
    createStore<KolboProjectLink>({}),
  )
  const [projects, { refetch }] = createResource(async () => {
    const res = await sdk.client.global.kolboProjects().catch(() => undefined)
    return res?.data ?? []
  })
  return {
    link,
    projects,
    refetchProjects: refetch,
    select(p: { id: string; name: string } | undefined) {
      setLink({ id: p?.id, name: p?.name })
    },
    async createAndSelect(name: string) {
      const res = await sdk.client.global.kolboProjectsCreate({ body: { name } })
      const project = res.data
      if (project?.id) {
        setLink({ id: project.id, name: project.name })
        refetch()
      }
      return project
    },
  }
}

export function KolboProjectProvider(props: ParentProps) {
  const sdk = useSDK()
  return <Context.Provider value={create(sdk.directory, sdk)}>{props.children}</Context.Provider>
}

export function useKolboProject() {
  const ctx = useContext(Context)
  if (!ctx) throw new Error("useKolboProject must be used within KolboProjectProvider")
  return ctx
}
```

Adjust to reality while implementing: check `persisted()`'s exact signature in `packages/app/src/utils/persist.ts:500` and the SDK client call shapes against a generated neighbor (`kolboVisualDnas` usage in `prompt-input.tsx:222`) — mirror whichever call convention (`.data` vs direct) that consumer uses.

- [ ] **Step 2: Mount the provider**

Find where workspace-scoped providers stack (the component that wraps the session page with `PromptProvider`/`SyncProvider` — search `packages/app/src` for `PromptProvider` usage) and add `KolboProjectProvider` inside the SDK/Sync providers, wrapping the same subtree the composer lives in.

- [ ] **Step 3: Typecheck**

Run: `cd packages/app && bun run typecheck`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add packages/app/src/context/kolbo-project.tsx <provider-mount-file>
git commit -m "feat(app): per-workspace Kolbo cloud-project link store + provider"
```

---

### Task 4: Context injection — project_id on every submit

**Files:**
- Modify: `packages/app/src/components/prompt-input/build-request-parts.ts` (anchor: the Visual DNA synthetic part, search `Pass this id`)
- Modify: the caller that builds the input for `buildRequestParts` (search `buildRequestParts(` — likely `submit.ts`)
- Test: extend `packages/app/src/components/prompt-input/submit.test.ts` ONLY if it already covers buildRequestParts; otherwise add `build-request-parts.test.ts` beside it following its bun:test conventions.

- [ ] **Step 1: Write the failing test**

```ts
// in the chosen test file — follow the file's existing mock/setup conventions
test("injects a synthetic kolbo project part when a project is linked", () => {
  const parts = buildRequestParts({ ...baseInput, kolboProject: { id: "68e5e", name: "Summer Campaign" } })
  const synthetic = parts.find((p) => p.type === "text" && p.synthetic && p.text.includes("68e5e"))
  expect(synthetic).toBeTruthy()
  expect((synthetic as any).text).toContain("project_id")
})

test("injects nothing when no project is linked", () => {
  const parts = buildRequestParts({ ...baseInput, kolboProject: undefined })
  expect(parts.some((p) => p.type === "text" && (p as any).text?.includes("project_id"))).toBe(false)
})
```

- [ ] **Step 2: Run to verify failure** — `cd packages/app && bun test src/components/prompt-input/` → FAIL (unknown field).

- [ ] **Step 3: Implement**

In `build-request-parts.ts`: extend the input type with `kolboProject?: { id: string; name: string }`, and next to the Visual DNA synthetic-part block add:

```ts
if (input.kolboProject?.id) {
  parts.push({
    id: Identifier.ascending("part"),
    type: "text",
    synthetic: true,
    text: `[Kolbo platform project for this workspace: "${input.kolboProject.name}" → project_id ${input.kolboProject.id}. Pass project_id: "${input.kolboProject.id}" on EVERY Kolbo generation, upload, and session tool call in this conversation — it is per-call, never sticky.]`,
  })
}
```

(Match the exact part-shape of the neighboring synthetic parts in this file — copy their object literal and change only `text`.)

In the caller, thread the value from the provider: `kolboProject: kolboProjectLink.id ? { id: kolboProjectLink.id, name: kolboProjectLink.name ?? "" } : undefined` — obtained via `useKolboProject()` at the component level and passed down the same way other context reaches `buildRequestParts`.

- [ ] **Step 4: Run tests** — `cd packages/app && bun test src/components/prompt-input/` → PASS (including all pre-existing submit tests).

- [ ] **Step 5: Commit**

```bash
git add packages/app/src/components/prompt-input/build-request-parts.ts <caller-file> <test-file>
git commit -m "feat(app): inject linked Kolbo project_id into every prompt submit"
```

---

### Task 5: Composer chip — Kolbo project selector

**Files:**
- Create: `packages/app/src/components/prompt-input/kolbo-project-chip.tsx`
- Modify: `packages/app/src/components/prompt-input.tsx` (anchor: `data-component="prompt-model-control"`)
- Modify: `packages/app/src/i18n/en.ts` (anchor: `session.new.title`)

- [ ] **Step 1: Build the chip**

```tsx
// packages/app/src/components/prompt-input/kolbo-project-chip.tsx
import { For, Show, createSignal } from "solid-js"
import { Button } from "@opencode-ai/ui/button"
import { DropdownMenu } from "@opencode-ai/ui/dropdown-menu"
import { Icon } from "@opencode-ai/ui/icon"
import { useKolboProject } from "@/context/kolbo-project"
import { useLanguage } from "@/context/language"

/** Composer-footer chip: which Kolbo cloud project generations land in. */
export function KolboProjectChip() {
  const kolbo = useKolboProject()
  const language = useLanguage()
  const [creating, setCreating] = createSignal(false)
  const label = () => kolbo.link.name ?? language.t("prompt.kolboProject.default")

  async function createNew() {
    const name = window.prompt(language.t("prompt.kolboProject.createPrompt"))
    if (!name?.trim()) return
    setCreating(true)
    await kolbo.createAndSelect(name.trim()).catch(() => {})
    setCreating(false)
  }

  return (
    <Show when={(kolbo.projects() ?? []).length > 0 || kolbo.link.id}>
      <DropdownMenu>
        <DropdownMenu.Trigger as={Button} variant="ghost" size="normal" data-action="prompt-kolbo-project">
          <Icon name="cloud" size="small" />
          <span class="truncate max-w-32">{label()}</span>
          <Icon name="chevron-down" size="small" />
        </DropdownMenu.Trigger>
        <DropdownMenu.Content>
          <DropdownMenu.Item onSelect={() => kolbo.select(undefined)}>
            {language.t("prompt.kolboProject.default")}
          </DropdownMenu.Item>
          <For each={kolbo.projects() ?? []}>
            {(p) => (
              <DropdownMenu.Item onSelect={() => kolbo.select(p)}>
                <span class="truncate">{p.name}</span>
                <Show when={p.id === kolbo.link.id}>
                  <Icon name="check" size="small" />
                </Show>
              </DropdownMenu.Item>
            )}
          </For>
          <DropdownMenu.Item onSelect={createNew} disabled={creating()}>
            <Icon name="plus" size="small" />
            {language.t("prompt.kolboProject.createNew")}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu>
    </Show>
  )
}
```

While implementing, mirror the exact `DropdownMenu` sub-component names and `Icon` names from the existing dropdown at `prompt-input.tsx:2106-2159` (copy its structure verbatim; icon names like "cloud"/"check"/"plus" must exist in the icon set — pick from what `Icon` supports, `grep '"cloud"' packages/ui/src` to confirm, fall back to "globe"/"folder" if absent). Replace `window.prompt` with the app's dialog primitive only if an existing simple text-input dialog component exists (search `DialogPrompt`); do not build a new dialog for v1.

- [ ] **Step 2: Mount it** — in `prompt-input.tsx`, inside the footer flex row (anchor `data-component="prompt-model-control"`), render `<KolboProjectChip />` as a sibling immediately after the model control.

- [ ] **Step 3: i18n** — add to `en.ts`:

```ts
"prompt.kolboProject.default": "API Generations",
"prompt.kolboProject.createNew": "Create new project…",
"prompt.kolboProject.createPrompt": "Name for the new Kolbo project:",
```

- [ ] **Step 4: Typecheck + eyeball** — `cd packages/app && bun run typecheck`; then `bun run dev:web` + opencode `serve`, open a workspace, confirm the chip renders, lists projects (when signed in), selection persists across reload, and a submit after selection carries the synthetic part (inspect the request in devtools → `/session/.../message` payload).

- [ ] **Step 5: Commit**

```bash
git add packages/app/src/components/prompt-input/kolbo-project-chip.tsx packages/app/src/components/prompt-input.tsx packages/app/src/i18n/en.ts
git commit -m "feat(app): Kolbo cloud-project selector chip in the composer footer"
```

---

### Task 6: New Project dialog + home page rewire + auto-link

**Files:**
- Create: `packages/app/src/components/dialog-new-project.tsx`
- Modify: `packages/app/src/pages/home.tsx` (anchor: `chooseProject`)
- Modify: `packages/app/src/i18n/en.ts`

- [ ] **Step 1: Build the dialog**

Use `DialogSelectDirectory` (`packages/app/src/components/dialog-select-directory.tsx`) as the structural template for dialog chrome/imports. Core:

```tsx
// packages/app/src/components/dialog-new-project.tsx
import { Show, createMemo, createSignal } from "solid-js"
import { Button } from "@opencode-ai/ui/button"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { useSDK } from "@/context/sdk"          // home page: use the global client the page already uses
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { useServer } from "@/context/server"
import { Persist, persisted } from "@/utils/persist"
import { writeKolboProjectLink } from "@/context/kolbo-project"
import { createStore } from "solid-js/store"

export function DialogNewProject(props: { onCreated: (directory: string) => void }) {
  const dialog = useDialog()
  const language = useLanguage()
  const platform = usePlatform()
  const server = useServer()
  const sdk = useSDK()
  const [name, setName] = createSignal("")
  const [busy, setBusy] = createSignal(false)
  const [error, setError] = createSignal<string>()
  // Remembered parent dir; first-run default = ~/Documents/Kolbo Projects
  const [loc, setLoc] = persisted(Persist.global("new-project-location"), createStore<{ parent?: string }>({}))
  const home = createMemo(() => /* read home dir the way home.tsx does: sync.data.path.home */ "")
  const parent = createMemo(() => loc.parent ?? `${home()}/Documents/Kolbo Projects`)
  const preview = createMemo(() => (name().trim() ? `${parent()}/${name().trim()}` : undefined))

  async function browse() {
    if (platform.openDirectoryPickerDialog && server.isLocal()) {
      const result = await platform.openDirectoryPickerDialog({ title: language.t("home.newProject.saveIn"), multiple: false })
      if (typeof result === "string") setLoc({ parent: result })
    }
  }

  async function create() {
    setBusy(true)
    setError(undefined)
    const res = await sdk.client.project.create({ body: { parent: parent(), name: name().trim() } }).catch((e: any) => ({ error: e }))
    if ((res as any).error || !(res as any).data?.directory) {
      setError((res as any).error?.message ?? language.t("home.newProject.error"))
      setBusy(false)
      return
    }
    const directory = (res as any).data.directory
    // Cloud auto-link — best effort, never blocks project creation.
    try {
      const cloud = await sdk.client.global.kolboProjectsCreate({ body: { name: name().trim() } })
      if (cloud.data?.id) await writeKolboProjectLink(directory, { id: cloud.data.id, name: cloud.data.name })
    } catch {}
    dialog.close()
    props.onCreated(directory)
  }

  return (
    <div class="flex flex-col gap-3 p-4 w-105 max-w-full">
      <div class="text-16-medium text-text-strong">{language.t("home.newProject.title")}</div>
      <p class="text-12-regular text-text-weak">{language.t("home.newProject.explainer")}</p>
      <label class="text-11-medium uppercase tracking-wide text-text-weak">{language.t("home.newProject.name")}</label>
      <input
        class="w-full rounded-lg border border-border-weak-base bg-surface-recess-base px-3 py-2 text-14-regular text-text-strong"
        value={name()}
        onInput={(e) => setName(e.currentTarget.value)}
        autofocus
      />
      <label class="text-11-medium uppercase tracking-wide text-text-weak">{language.t("home.newProject.saveIn")}</label>
      <div class="flex items-center gap-2">
        <span class="flex-1 truncate text-13-mono text-text-base" dir="ltr">{parent()}</span>
        <Button size="normal" variant="ghost" onClick={browse}>{language.t("home.newProject.change")}</Button>
      </div>
      <Show when={preview()}>
        <p class="text-11-regular text-text-subtle" dir="ltr">{language.t("home.newProject.willCreate")} {preview()}</p>
      </Show>
      <Show when={error()}>
        <p class="text-12-regular text-text-critical">{error()}</p>
      </Show>
      <Button size="large" disabled={!name().trim() || busy()} onClick={create}>
        {language.t("home.newProject.create")}
      </Button>
    </div>
  )
}
```

Implementation notes (resolve while coding, all are existing patterns): home dir comes from `useGlobalSync().data.path.home` (home.tsx:26) — thread it in as a prop from home.tsx instead of the placeholder memo; on the home page the SDK client is the global/server one used by `DialogSelectDirectory` (`sdk.client.file.list` etc.) — use the same context; join paths with the same separator logic `split()` in home.tsx uses (backslash on Windows — safest: let the server do the join, i.e. pass `parent` + `name` and use returned `directory`, which the code above already does; the preview line may show a forward slash, acceptable for v1). Dialog chrome (header/close button) — copy from `DialogSelectDirectory`'s outer markup.

- [ ] **Step 2: Rewire home.tsx**

- Primary button becomes **New project**: `onClick={() => dialog.show(() => <DialogNewProject onCreated={openProject} />)}` (reuses the existing `openProject(directory)` at home.tsx:41 — it registers + navigates).
- Below it, a ghost/text button **Open an existing folder** with the old `chooseProject` handler.

- [ ] **Step 3: i18n** — add to `en.ts`:

```ts
"home.newProject.title": "New project",
"home.newProject.explainer": "A project is a folder on your computer. Everything we make — images, videos, pages — is saved inside it.",
"home.newProject.name": "Project name",
"home.newProject.saveIn": "Save in",
"home.newProject.change": "Change…",
"home.newProject.willCreate": "Will create:",
"home.newProject.create": "Create project",
"home.newProject.error": "Could not create the folder.",
"home.openExisting": "Open an existing folder",
```

- [ ] **Step 4: Manual verification** — dev servers up: create "Test Project X" → folder appears on disk under the chosen parent, app navigates into it, chip shows "Test Project X" (auto-linked; verify a cloud project of that name now exists via the chip dropdown). Create again with same name → error "non-empty folder…" only if non-empty; empty existing folder opens fine. Signed-out case: project still creates, chip falls back to API Generations.

- [ ] **Step 5: Commit**

```bash
git add packages/app/src/components/dialog-new-project.tsx packages/app/src/pages/home.tsx packages/app/src/i18n/en.ts
git commit -m "feat(app): New Project dialog (name+location, folder creation, cloud auto-link)"
```

---

### Task 7: Composer gating — no work outside a project

**Files:**
- Modify: `packages/app/src/components/session/session-new-view.tsx:46` (anchor: `?? sdk.directory`)
- Modify: `packages/app/src/components/prompt-input/submit.ts` (anchor: `handleSubmit`)
- Modify: `packages/app/src/components/prompt-input.tsx` (props threading, anchor: `shouldQueue`)
- Modify: the composer region that passes props (search `shouldQueue=` in `packages/app/src/pages/session/composer/session-composer-region.tsx`)
- Test: extend `packages/app/src/components/prompt-input/submit.test.ts`

- [ ] **Step 1: Failing test** (follow the file's existing harness — it already drives `handleSubmit` with fake inputs):

```ts
test("submit is blocked when the workspace has no project", async () => {
  const { handleSubmit, sent } = setup({ hasProject: () => false })  // mirror the file's setup helper
  await handleSubmit(fakeEvent())
  expect(sent).toHaveLength(0)
})
```

- [ ] **Step 2: Run** — `cd packages/app && bun test src/components/prompt-input/submit.test.ts` → FAIL.

- [ ] **Step 3: Implement**

- `submit.ts`: add optional `hasProject?: () => boolean` to the input type (next to `shouldQueue`); at the top of `handleSubmit`, before any send/queue logic:

```ts
if (input.hasProject && !input.hasProject()) {
  input.onBlockedNoProject?.()
  return
}
```

(and `onBlockedNoProject?: () => void` on the type — the UI callback shows a toast; wire the toast with the app's existing toast/notification util, `grep -rn "toast" packages/app/src/components/prompt-input.tsx` for the idiom.)
- `prompt-input.tsx`: thread both props exactly like `shouldQueue`/`onQueue` are threaded (interface + `usePromptSubmit` input).
- `session-composer-region.tsx`: pass `hasProject={() => !!sync.project}` and a toast for `onBlockedNoProject`.
- `session-new-view.tsx:46`: `const projectRoot = createMemo(() => sync.project?.worktree ?? sdk.directory)` → keep the display fallback (it's just a label) BUT wrap the whole starters+meta block in `<Show when={sync.project}>` with a fallback panel: icon + "This folder isn't open as a project" + a Button reusing the home-page New-project dialog. Grep for any other `?? sdk.directory` on the session-start path and evaluate each (display-only usage may stay).

- [ ] **Step 4: Run tests** — the whole prompt-input suite must pass (the interrupt/queue tests especially): `cd packages/app && bun test src/components/prompt-input/` → PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/app/src/components/prompt-input/submit.ts packages/app/src/components/prompt-input/submit.test.ts packages/app/src/components/prompt-input.tsx packages/app/src/pages/session/composer/session-composer-region.tsx packages/app/src/components/session/session-new-view.tsx
git commit -m "feat(app): block prompt submit when no project is open"
```

---

### Task 8: New-session page — Kobi, chips, thumbnail card grid

**Files:**
- Modify: `packages/app/src/components/session/session-new-view.tsx` (full rewrite of hero + starters sections)
- Modify: `packages/app/src/index.css` (anchor: `new-session-starter`)
- Modify: `packages/app/src/i18n/en.ts` (anchor: `session.new.starter`)

- [ ] **Step 1: Starter config**

Replace the `Starter` type + `STARTERS` in `session-new-view.tsx`:

```tsx
type StarterCategory = "marketing" | "film" | "images" | "web" | "audio"

type Starter = {
  key:
    | "fashionCampaign"
    | "scene"
    | "ugc"
    | "presentation"
    | "landing"
    | "video"
    | "productPhotoshoot"
    | "productAnimation"
    | "aiInfluencer"
  categories: StarterCategory[]
  /** i18n key suffix for the small corner tag; omit = no tag */
  tag?: "guided" | "seedance" | "needsRefs"
  /** Clicking should also open the attachment picker (UGC needs product+face). */
  wantsAttachments?: boolean
  /** Gradient fallback + CDN still. Art can be redrawn without an app release. */
  gradient: string
}

const THUMB_CDN = "https://media.kolbo.ai/kolboai-media/kolbo-code/starters"

const STARTERS: Starter[] = [
  { key: "fashionCampaign", categories: ["marketing", "images"], tag: "guided", gradient: "linear-gradient(140deg,#ff4dd8,#6a00b8)" },
  { key: "scene", categories: ["film"], tag: "seedance", gradient: "linear-gradient(140deg,#ff2d78,#7b2dff)" },
  { key: "ugc", categories: ["marketing", "film"], tag: "needsRefs", wantsAttachments: true, gradient: "linear-gradient(140deg,#ff8a00,#ff2d55)" },
  { key: "presentation", categories: ["web"], gradient: "linear-gradient(140deg,#ffd200,#ff6a00)" },
  { key: "landing", categories: ["web", "marketing"], gradient: "linear-gradient(140deg,#00c2ff,#0037ff)" },
  { key: "video", categories: ["film"], gradient: "linear-gradient(140deg,#00e58f,#00707a)" },
  { key: "productPhotoshoot", categories: ["marketing", "images"], gradient: "linear-gradient(140deg,#8f5bff,#2d0f66)" },
  { key: "productAnimation", categories: ["marketing", "film"], gradient: "linear-gradient(140deg,#ff5e3a,#b8003e)" },
  { key: "aiInfluencer", categories: ["marketing", "images"], gradient: "linear-gradient(140deg,#b84dff,#3a0ca3)" },
]

const CATEGORIES: ("all" | StarterCategory)[] = ["all", "marketing", "film", "images", "web", "audio"]
```

(Note: `audio` chip stays for future starters; with none matching it simply shows an empty grid — acceptable, or drop it from `CATEGORIES` if it looks broken. Implementer's call; removing is one array entry.)

- [ ] **Step 2: Rewrite the JSX**

Hero: replace the `Mark`/whitelabel block (lines 76-84) with:

```tsx
import { Kobi } from "@opencode-ai/ui/kobi"
// …
<div data-slot="new-session-mark">
  <Kobi state={prompt.hasContent?.() ? "thinking" : "idle"} size={84} />
</div>
```

(`prompt.hasContent` — check `packages/app/src/context/prompt.tsx` for an existing signal exposing non-empty state; if none exists, keep `state="idle"` and skip the typing reaction — do NOT add new prompt-context API for this.)

Starters section becomes chips + grid:

```tsx
const [category, setCategory] = createSignal<(typeof CATEGORIES)[number]>("all")
const visible = createMemo(() =>
  STARTERS.filter((s) => category() === "all" || s.categories.includes(category() as StarterCategory)),
)

const seed = (starter: Starter) => {
  const text = language.t(`session.new.starter.${starter.key}.prompt`)
  prompt.set([{ type: "text", content: text, start: 0, end: text.length }], text.length)
  const editor = document.querySelector<HTMLElement>('[data-component="prompt-input"]')
  editor?.focus()
  if (starter.wantsAttachments) {
    // UGC needs product + creator refs — pop the picker right away.
    document.querySelector<HTMLInputElement>('[data-component="prompt-input-container"] input[type="file"]')?.click()
  }
}
```

```tsx
<div data-slot="new-session-divider" aria-hidden="true">
  <span />
  <span data-slot="new-session-divider-label">{language.t("session.new.jumpIn")}</span>
  <span />
</div>

<div data-slot="new-session-chips" role="tablist">
  <For each={CATEGORIES}>
    {(cat) => (
      <button
        type="button"
        role="tab"
        data-slot="new-session-chip"
        data-active={category() === cat}
        onClick={() => setCategory(cat)}
      >
        {language.t(`session.new.category.${cat}`)}
      </button>
    )}
  </For>
</div>

<div data-slot="new-session-cards">
  <For each={visible()}>
    {(starter, i) => (
      <button
        type="button"
        data-slot="new-session-card"
        style={{ "--starter-delay": `${i() * 60}ms` }}
        onClick={() => seed(starter)}
      >
        <span data-slot="new-session-card-thumb" style={{ background: starter.gradient }}>
          <img
            src={`${THUMB_CDN}/${starter.key}.webp`}
            alt=""
            loading="lazy"
            referrerpolicy="no-referrer"
            onError={(e) => (e.currentTarget.style.display = "none")}
          />
          <Show when={starter.tag}>
            <span data-slot="new-session-card-tag">{language.t(`session.new.tag.${starter.tag}`)}</span>
          </Show>
        </span>
        <span data-slot="new-session-card-meta">
          <span data-slot="new-session-card-title">{language.t(`session.new.starter.${starter.key}.title`)}</span>
          <span data-slot="new-session-card-body">{language.t(`session.new.starter.${starter.key}.body`)}</span>
        </span>
      </button>
    )}
  </For>
</div>
```

Verify the attachment-input selector against the real DOM (`grep -n 'type="file"' packages/app/src/components/prompt-input.tsx`) and adjust; if the input isn't reachable by selector, expose a `prompt.openAttachmentPicker()` only if such an affordance already exists — otherwise drop `wantsAttachments` click-through and rely on the prompt text asking for the files (the prompt copy below already does).

- [ ] **Step 3: CSS** — in `packages/app/src/index.css`, after the existing `new-session-starter` block (keep it — other views may reuse; delete only if `grep -rn "new-session-starter" packages/app/src` shows this view is the sole user, in which case replace it):

```css
[data-component="session-new-view"] [data-slot="new-session-divider"] {
  display: flex; align-items: center; gap: 12px; width: 100%; margin-top: 4px;
}
[data-component="session-new-view"] [data-slot="new-session-divider"] > span:first-child,
[data-component="session-new-view"] [data-slot="new-session-divider"] > span:last-child {
  flex: 1; height: 1px; background: var(--border-weaker-base);
}
[data-component="session-new-view"] [data-slot="new-session-divider-label"] {
  font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--text-weak-base);
}
[data-component="session-new-view"] [data-slot="new-session-chips"] {
  display: flex; flex-wrap: wrap; justify-content: center; gap: 8px;
}
[data-component="session-new-view"] [data-slot="new-session-chip"] {
  font-size: 12px; padding: 5px 14px; border-radius: 999px; cursor: pointer;
  color: var(--text-weak-base); border: 1px solid var(--border-weak-base); background: transparent;
  transition: background 0.15s, color 0.15s;
}
[data-component="session-new-view"] [data-slot="new-session-chip"][data-active="true"] {
  background: var(--text-strong-base); color: var(--surface-base); border-color: var(--text-strong-base); font-weight: 600;
}
[data-component="session-new-view"] [data-slot="new-session-cards"] {
  display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; width: 100%;
}
@media (max-width: 720px) {
  [data-component="session-new-view"] [data-slot="new-session-cards"] { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
[data-component="session-new-view"] [data-slot="new-session-card"] {
  display: flex; flex-direction: column; text-align: start; border-radius: 12px; overflow: hidden;
  border: 1px solid var(--border-weaker-base); background: var(--surface-base); cursor: pointer;
  transition: transform 0.15s, border-color 0.15s;
  animation: new-session-starter-enter 0.5s both; animation-delay: var(--starter-delay);
}
[data-component="session-new-view"] [data-slot="new-session-card"]:hover {
  transform: translateY(-3px); border-color: var(--border-weak-base);
}
[data-component="session-new-view"] [data-slot="new-session-card-thumb"] {
  position: relative; aspect-ratio: 16 / 10; display: block; width: 100%;
}
[data-component="session-new-view"] [data-slot="new-session-card-thumb"] img {
  position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover;
}
[data-component="session-new-view"] [data-slot="new-session-card-tag"] {
  position: absolute; top: 8px; inset-inline-start: 8px; z-index: 1;
  font-size: 9px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase;
  color: #fff; background: rgba(0, 0, 0, 0.55); border-radius: 5px; padding: 3px 7px; backdrop-filter: blur(4px);
}
[data-component="session-new-view"] [data-slot="new-session-card-meta"] { padding: 10px 12px; display: flex; flex-direction: column; gap: 2px; }
[data-component="session-new-view"] [data-slot="new-session-card-title"] { font-size: 13px; font-weight: 600; color: var(--text-strong-base); }
[data-component="session-new-view"] [data-slot="new-session-card-body"] { font-size: 11px; line-height: 1.35; color: var(--text-weak-base); }
```

Check the CSS-variable names against real usage in `index.css` (`grep -n "var(--" packages/app/src/index.css | head`) — use whichever token names the existing starter styles use; the names above follow the Tailwind-theme classes seen in home.tsx (`text-text-weak` etc.) and may differ as raw CSS vars.

- [ ] **Step 4: i18n — the new starter copy** (in `en.ts`, replacing the block at `session.new.starter.*`; DELETE the `images` and `music` starter keys):

```ts
"session.new.subtitle": "From a presentation to a full scene — describe it, or pick a starter.",
"session.new.jumpIn": "or jump straight in",
"session.new.category.all": "All",
"session.new.category.marketing": "Marketing",
"session.new.category.film": "Film & Video",
"session.new.category.images": "Images",
"session.new.category.web": "Web & Docs",
"session.new.category.audio": "Audio",
"session.new.tag.guided": "Guided flow",
"session.new.tag.seedance": "Seedance 2.5",
"session.new.tag.needsRefs": "Needs: product + face",

"session.new.starter.fashionCampaign.title": "Fashion campaign",
"session.new.starter.fashionCampaign.body": "I'll plan it, you approve the character, then we shoot the whole campaign.",
"session.new.starter.fashionCampaign.prompt": "Run a fashion campaign flow with hard approval stops: 1) Ask me about the brand, garment/product, and vibe, then write a short campaign plan (concept, shot list, styling) and WAIT for my approval before generating anything. 2) Generate exactly 4 candidate base characters (distinct looks, same brief) and WAIT for me to pick one. 3) Lock the chosen character as a Visual DNA via create_visual_dna. 4) Only then produce the campaign images with that DNA, checking in after the first batch. Never skip a stop.",

"session.new.starter.scene.title": "Direct a scene",
"session.new.starter.scene.body": "One continuous multi-shot scene — bring up to 2 Visual DNA characters.",
"session.new.starter.scene.prompt": "Direct one continuous multi-shot scene with Seedance 2.5. First ask me for the setting, the action, and which characters appear — offer my existing Visual DNAs (list_visual_dnas) or create new ones (up to 2). Then write the full multi-shot prompt (establishing, coverage, close-ups) and generate the scene as ONE video, iterating with me on motion.",

"session.new.starter.ugc.title": "Create a UGC ad",
"session.new.starter.ugc.body": "Attach your product photo and a creator reference — I'll produce the ad.",
"session.new.starter.ugc.prompt": "Create a 15-second UGC talking-head ad. I'm attaching (or will attach) two references: my PRODUCT photo and a CREATOR face reference — confirm you have both before producing, and ask me for whichever is missing. Casual selfie framing, natural lighting, authentic spoken review, the creator holding my exact product.",

"session.new.starter.presentation.title": "Create a presentation",
"session.new.starter.presentation.body": "Give me the topic — I'll design the full deck, content and visuals.",
"session.new.starter.presentation.prompt": "Create a full presentation deck about my topic. Ask me for the topic, audience, and rough slide count, then design it as a polished HTML slide deck — real content, strong visual hierarchy, generated imagery where it helps — and show me the deck when it's ready.",
```

(`landing`, `video`, `productPhotoshoot`, `productAnimation`, `aiInfluencer` keys stay exactly as they are.)

- [ ] **Step 5: Typecheck + visual check** — `cd packages/app && bun run typecheck`; dev servers up → new-session page shows Kobi animating, chips filter the grid, gradient tiles render (CDN 404s hidden by onError), starter click seeds the composer, UGC click also opens the picker (if wired), RTL spot-check: switch app language to Hebrew, confirm the grid/tag alignment (tags use `inset-inline-start`, so RTL flips correctly).

- [ ] **Step 6: Commit**

```bash
git add packages/app/src/components/session/session-new-view.tsx packages/app/src/index.css packages/app/src/i18n/en.ts
git commit -m "feat(app): new-session page — Kobi hero, category chips, thumbnail starter cards"
```

---

### Task 9: Full-suite verification

- [ ] **Step 1: Monorepo typecheck** — `cd <repo root> && bun turbo typecheck` → 13/13 pass.
- [ ] **Step 2: Test suites** — `cd packages/opencode && bun test test/provider-sort.test.ts test/keybind.test.ts test/npm.test.ts test/video-part.test.ts test/project-create-route.test.ts` and `cd packages/app && bun test src/components/prompt-input/` → all pass.
- [ ] **Step 3: End-to-end manual pass** (dev desktop or web+serve):
  1. Home → New project → creates folder, opens workspace, chip shows the auto-linked cloud project.
  2. Send "generate one small test image of a red cube" → verify in the Kolbo web app the generation landed in the linked cloud project, NOT API Generations.
  3. Switch chip to API Generations → repeat → lands in API Generations.
  4. Kill `sync.project` case: open a bogus directory route → composer blocked with the no-project panel.
- [ ] **Step 4: Commit any fixups, push** — `git push origin dev` (typecheck pre-push hook runs).

---

### Task 10: Starter thumbnails — real CDN art (⚠ approval-gated)

**HARD GATE: get Zohar's explicit yes on the batch + cost BEFORE generating.** (Standing rule: never fire paid generations without sign-off.)

- [ ] **Step 1: Confirm with Zohar** — 9 stills, one per starter key (`fashionCampaign, scene, ugc, presentation, landing, video, productPhotoshoot, productAnimation, aiInfluencer`), model per the `kolbo` skill's current image-model guidance, 16:10-croppable, bold editorial style, consistent set. Quote real credit cost from `list_models` before running.
- [ ] **Step 2: Generate** via Kolbo MCP (`generate_image`, one strong prompt per key; follow the `kolbo` skill's prompt rules).
- [ ] **Step 3: Upload** to `media.kolbo.ai/kolboai-media/kolbo-code/starters/<key>.webp` using the `kolbo-cdn-media` skill (webp, ~1200px wide, quality ~80).
- [ ] **Step 4: Verify** each URL loads with `referrerpolicy: no-referrer` (curl + in-app), cards show art instead of gradients.
- [ ] **Step 5: No code change needed** — URLs are already keyed by starter key. Commit nothing unless a key was renamed.

---

## Self-review notes (done at write time)

- **Spec coverage:** dialog (T6), gating (T7), cloud selector chip (T3+T5), auto-link (T2+T6), context injection (T4), page redesign + Kobi + chips + cards (T8), starter set incl. fashion/scene/presentation/UGC-refs (T8 i18n + config), CDN pipeline (T10), mkdir route (T1), proxy routes (T2). Out-of-scope items from spec untouched. ✔
- **Known intentional deviations from spec:** context injection is per-submit synthetic part (not a system-prompt file) — cleaner precedent found during scouting; Kobi "thinking on typing" is conditional on an existing prompt-context signal (skip if absent, no new API).
- **Type consistency:** `KolboProjectLink {id?,name?}` used in T3/T4/T6; chip reads `kolbo.link.id/name` (T5) — consistent. Starter `key` union matches i18n keys and CDN filenames.
- **Placeholders:** none — every code step has code; steps that depend on in-file conventions name the exact anchor + file to copy from.
