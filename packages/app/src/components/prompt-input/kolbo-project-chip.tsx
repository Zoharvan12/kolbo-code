import { For, Show, createSignal } from "solid-js"
import { Button } from "@opencode-ai/ui/button"
import { DropdownMenu } from "@opencode-ai/ui/dropdown-menu"
import { Icon } from "@opencode-ai/ui/icon"
import { useKolboProjectOptional } from "@/context/kolbo-project"
import { useLanguage } from "@/context/language"

/**
 * Composer-footer chip: which Kolbo PLATFORM project (cloud bucket) this
 * workspace's generations land in. Everything defaulted silently into the
 * "API Generations" junk drawer before — this makes the destination visible
 * and switchable right where generations are launched. Selection persists
 * per workspace and rides every submit as a synthetic part.
 */
export function KolboProjectChip() {
  const kolbo = useKolboProjectOptional()
  const language = useLanguage()
  const [creating, setCreating] = createSignal(false)
  if (!kolbo) return null

  const label = () => kolbo.link.name ?? language.t("prompt.kolboProject.default")

  async function createNew() {
    const name = window.prompt(language.t("prompt.kolboProject.createPrompt"))
    if (!name?.trim() || !kolbo) return
    setCreating(true)
    await kolbo.createAndSelect(name.trim()).catch(() => {})
    setCreating(false)
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
          class="min-w-0 max-w-[220px] text-13-regular text-text-base"
          aria-label={language.t("prompt.kolboProject.label")}
        >
          <Icon name="folder" size="small" class="shrink-0 text-text-weak" />
          <span class="truncate">{label()}</span>
          <Icon name="chevron-down" size="small" class="shrink-0" />
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content class="min-w-[240px] max-h-[320px] overflow-y-auto">
            <DropdownMenu.Item onSelect={() => kolbo.select(undefined)} style={{ padding: "9px 10px" }}>
              <DropdownMenu.ItemLabel>{language.t("prompt.kolboProject.default")}</DropdownMenu.ItemLabel>
              <Show when={!kolbo.link.id}>
                <Icon name="check" size="small" class="shrink-0 text-text-weak" />
              </Show>
            </DropdownMenu.Item>
            <For each={(kolbo.projects() ?? []).filter((p) => !p.is_default)}>
              {(p) => (
                <DropdownMenu.Item onSelect={() => kolbo.select(p)} style={{ padding: "9px 10px" }}>
                  <DropdownMenu.ItemLabel class="truncate">{p.name}</DropdownMenu.ItemLabel>
                  <Show when={p.id === kolbo.link.id}>
                    <Icon name="check" size="small" class="shrink-0 text-text-weak" />
                  </Show>
                </DropdownMenu.Item>
              )}
            </For>
            <DropdownMenu.Item onSelect={() => void createNew()} disabled={creating()} style={{ padding: "9px 10px" }}>
              <Icon name="plus" size="small" class="shrink-0 text-text-weak" />
              <DropdownMenu.ItemLabel>{language.t("prompt.kolboProject.createNew")}</DropdownMenu.ItemLabel>
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu>
    </Show>
  )
}
