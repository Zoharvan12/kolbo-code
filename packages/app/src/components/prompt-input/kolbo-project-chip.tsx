import { For, Show, createSignal } from "solid-js"
import { Dialog } from "@opencode-ai/ui/dialog"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Button } from "@opencode-ai/ui/button"
import { DropdownMenu } from "@opencode-ai/ui/dropdown-menu"
import { Icon } from "@opencode-ai/ui/icon"
import { useKolboProjectOptional, type KolboProjectInfo } from "@/context/kolbo-project"
import { useLanguage } from "@/context/language"

/**
 * Composer-footer chip: which Kolbo PLATFORM project (cloud bucket) this
 * workspace's generations land in. Everything defaulted silently into the
 * "API Generations" junk drawer before — this makes the destination visible
 * and switchable right where generations are launched. Selection persists
 * per workspace and rides every submit as a synthetic part.
 *
 * Row design mirrors kolbo-map's ProjectSelectorPopover so the two products
 * read as one: square rounded cover thumb with a hairline ring, single-line
 * name, a blue dot-pill "Shared" badge when the project was shared WITH the
 * user (role !== owner), check on the active row. Fallback art is a
 * deterministic gradient tint seeded by the project id — deliberately not a
 * monogram, matching kolbo-map's CoverFallback.
 */

// kolbo-map CoverFallback's five hue pairs, seeded by id.
const FALLBACK_TINTS = [
  "linear-gradient(135deg, rgba(59,130,246,0.25), rgba(59,130,246,0.05))",
  "linear-gradient(135deg, rgba(168,85,247,0.25), rgba(168,85,247,0.05))",
  "linear-gradient(135deg, rgba(16,185,129,0.25), rgba(16,185,129,0.05))",
  "linear-gradient(135deg, rgba(245,158,11,0.25), rgba(245,158,11,0.05))",
  "linear-gradient(135deg, rgba(244,63,94,0.25), rgba(244,63,94,0.05))",
]
const tint = (id: string) => {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0
  return FALLBACK_TINTS[Math.abs(hash) % FALLBACK_TINTS.length]
}

function CoverThumb(props: { project?: { id: string; thumbnail: string | null }; size: "row" | "chip" }) {
  const dims = () => (props.size === "row" ? "size-9 rounded-xl" : "size-6 rounded-md")
  return (
    <span
      class={`${dims()} shrink-0 overflow-hidden flex items-center justify-center bg-surface-recess-base ring-1 ring-border-weaker-base`}
      style={!props.project?.thumbnail ? { background: props.project ? tint(props.project.id) : undefined } : undefined}
    >
      <Show
        when={props.project?.thumbnail}
        fallback={<Icon name="folder" size="small" class="opacity-40 text-text-weak" />}
      >
        {(url) => (
          <img
            src={url()}
            alt=""
            loading="lazy"
            referrerpolicy="no-referrer"
            class="size-full object-cover"
            onError={(e) => (e.currentTarget.style.display = "none")}
          />
        )}
      </Show>
    </span>
  )
}

function SharedBadge() {
  const language = useLanguage()
  return (
    <span
      class="inline-flex h-5 shrink-0 items-center gap-1 rounded-full px-1.5 text-[11px] font-medium"
      style={{ background: "hsl(217 91% 60% / 0.15)", color: "hsl(217 91% 60%)" }}
    >
      <span class="size-1.5 rounded-full" style={{ background: "hsl(217 91% 60%)" }} />
      {language.t("prompt.kolboProject.shared")}
    </span>
  )
}

function DialogCreateKolboProject(props: { onCreate: (name: string) => Promise<unknown> }) {
  const dialog = useDialog()
  const language = useLanguage()
  const [name, setName] = createSignal("")
  const [busy, setBusy] = createSignal(false)

  async function submit() {
    if (!name().trim() || busy()) return
    setBusy(true)
    try {
      await props.onCreate(name().trim())
      dialog.close()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog title={language.t("prompt.kolboProject.createTitle")}>
      <div class="flex flex-col gap-3 p-4 w-96 max-w-full">
        <p class="text-12-regular text-text-weak">{language.t("prompt.kolboProject.createHint")}</p>
        <input
          class="w-full rounded-lg border border-border-weak-base bg-surface-recess-base px-3 py-2 text-14-regular text-text-strong outline-none focus:border-border-base"
          value={name()}
          placeholder={language.t("prompt.kolboProject.createPlaceholder")}
          onInput={(e) => setName(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void submit()
          }}
          autofocus
        />
        <Button size="large" disabled={!name().trim() || busy()} onClick={() => void submit()}>
          {language.t("prompt.kolboProject.createCta")}
        </Button>
      </div>
    </Dialog>
  )
}

export function KolboProjectChip() {
  const kolbo = useKolboProjectOptional()
  const language = useLanguage()
  const dialog = useDialog()
  if (!kolbo) return null

  const label = () => kolbo.link.name ?? language.t("prompt.kolboProject.default")
  const selected = (): KolboProjectInfo | undefined => (kolbo.projects() ?? []).find((p) => p.id === kolbo.link.id)

  function createNew() {
    if (!kolbo) return
    dialog.show(() => <DialogCreateKolboProject onCreate={(name) => kolbo.createAndSelect(name)} />)
  }

  return (
    <Show when={(kolbo.projects() ?? []).length > 0 || kolbo.link.id}>
      <DropdownMenu gutter={4} placement="top-start">
        <DropdownMenu.Trigger
          as={Button}
          data-action="prompt-kolbo-project"
          type="button"
          variant="ghost"
          size="normal"
          class="min-w-0 max-w-[240px] text-13-regular text-text-base"
          aria-label={language.t("prompt.kolboProject.label")}
        >
          <Show when={kolbo.link.id} fallback={<Icon name="folder" size="small" class="shrink-0 text-text-weak" />}>
            <CoverThumb project={selected() ?? { id: kolbo.link.id!, thumbnail: null }} size="chip" />
          </Show>
          <span class="truncate">{label()}</span>
          <Icon name="chevron-down" size="small" class="shrink-0 opacity-50" />
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content class="min-w-[280px] max-h-[360px] overflow-y-auto">
            <DropdownMenu.Item onSelect={() => kolbo.select(undefined)} style={{ padding: "8px 10px", gap: "10px" }}>
              <span class="size-9 shrink-0 rounded-xl flex items-center justify-center bg-surface-recess-base ring-1 ring-border-weaker-base">
                <Icon name="folder" size="small" class="opacity-40 text-text-weak" />
              </span>
              <DropdownMenu.ItemLabel>{language.t("prompt.kolboProject.default")}</DropdownMenu.ItemLabel>
              <Show when={!kolbo.link.id}>
                <Icon name="check" size="small" class="shrink-0 text-text-strong" />
              </Show>
            </DropdownMenu.Item>
            <For each={(kolbo.projects() ?? []).filter((p) => !p.is_default)}>
              {(p) => (
                <DropdownMenu.Item onSelect={() => kolbo.select(p)} style={{ padding: "8px 10px", gap: "10px" }}>
                  <CoverThumb project={p} size="row" />
                  <DropdownMenu.ItemLabel class="truncate" title={p.name}>
                    {p.name}
                  </DropdownMenu.ItemLabel>
                  {/* Badge only on a POSITIVE non-owner signal. A server that
                      predates the role field returns roleless rows — treating
                      those as shared painted the badge on every project. */}
                  <Show when={p.role && p.role !== "owner"}>
                    <SharedBadge />
                  </Show>
                  <Show when={p.id === kolbo.link.id}>
                    <Icon name="check" size="small" class="shrink-0 text-text-strong" />
                  </Show>
                </DropdownMenu.Item>
              )}
            </For>
            <DropdownMenu.Item onSelect={() => createNew()} style={{ padding: "8px 10px", gap: "10px" }}>
              <span class="size-9 shrink-0 rounded-xl flex items-center justify-center bg-surface-recess-base ring-1 ring-border-weaker-base">
                <Icon name="plus" size="small" class="text-text-weak" />
              </span>
              <DropdownMenu.ItemLabel>{language.t("prompt.kolboProject.createNew")}</DropdownMenu.ItemLabel>
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu>
    </Show>
  )
}
