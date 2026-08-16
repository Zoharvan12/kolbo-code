import { For, Match, Show, Switch, createEffect, createMemo, createSignal, onMount } from "solid-js"
import type { PermissionRequest } from "@opencode-ai/sdk/v2"
import { Button } from "@opencode-ai/ui/button"
import { DockPrompt } from "@opencode-ai/ui/dock-prompt"
import { DropdownMenu } from "@opencode-ai/ui/dropdown-menu"
import { Icon } from "@opencode-ai/ui/icon"
import { useKolboModels } from "@opencode-ai/ui/context"
import { usePlatformOps } from "@opencode-ai/ui/context/platform-ops"
import { costOf, parse, type Param } from "@opencode-ai/ui/kolbo-operation"
import { useLanguage } from "@/context/language"

const humanizeLabel = (k: string) => k.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase())

function fieldType(param: Param): "string" | "number" | "boolean" {
  if (param.type === "number" || param.type === "boolean") return param.type
  return "string"
}

export function SessionPermissionDock(props: {
  request: PermissionRequest
  responding: boolean
  onDecide: (response: "once" | "always" | "reject", message?: string) => void
}) {
  const language = useLanguage()
  const kolboModels = useKolboModels()
  const platformOps = usePlatformOps()
  // WebView2 can't load api.kolbo.ai/assets/* directly — route model avatars
  // through the sidecar image proxy (same as the generation chips).
  const proxyAvatar = (url: string | undefined | null) =>
    url ? (platformOps.imageProxyUrl?.(url) ?? url) : undefined

  const meta = () => (props.request.metadata ?? {}) as Record<string, unknown>
  const op = createMemo(() => parse(meta()))
  const isGeneration = () => !!op()
  const knobs = createMemo(() => (op()?.params ?? []).filter((item) => item.id !== "model"))
  const modelField = createMemo(() => op()?.model.id || knobs().find((item) => item.id === "model")?.value)

  // Editable overrides, keyed by field name.
  const [edits, setEdits] = createSignal<Record<string, string>>({})
  const [correction, setCorrection] = createSignal("")
  createEffect(() => {
    void props.request.id
    setEdits({})
    setCorrection("")
  })
  const originalOf = (key: string) => {
    if (key === "model") return String(op()?.model.id ?? "")
    const param = knobs().find((item) => item.id === key)
    return param?.value === undefined || param?.value === null ? "" : String(param.value)
  }
  const valueOf = (key: string) => edits()[key] ?? originalOf(key)
  const setField = (key: string, value: string) => setEdits({ ...edits(), [key]: value })

  const changedKeys = createMemo(() => Object.keys(edits()).filter((k) => edits()[k] !== originalOf(k)))
  const hasFreeText = () => correction().trim().length > 0
  const hasChanges = () => changedKeys().length > 0 || hasFreeText()

  const changeMessage = () => {
    const parts: string[] = []
    const diffs = changedKeys().map((k) => `${k.replace(/_/g, " ")} ${edits()[k]}`)
    if (diffs.length) parts.push(`regenerate with ${diffs.join(", ")}`)
    if (hasFreeText()) parts.push(correction().trim())
    return parts.join(". ")
  }
  const sendChanges = () => {
    if (!hasChanges() || props.responding) return
    props.onDecide("reject", changeMessage())
  }

  // Model dropdown data.
  const modelId = () => valueOf("model")
  const genType = createMemo(() => op()?.route)
  const typedModels = createMemo(() => (genType() ? kolboModels.byType(genType()!) : []))
  const modelOptions = createMemo<Array<{ id: string; name: string; avatar?: string }>>(() => {
    const typed = typedModels()
    if (typed.length > 0) return typed.map((m) => ({ id: m.id, name: m.name, avatar: m.avatar ?? undefined }))
    return []
  })
  const modelName = () => {
    const fromTyped = typedModels().find((m) => m.id === modelId())?.name
    return fromTyped ?? kolboModels.lookup(modelId()).name ?? modelId()
  }
  const modelAvatar = () => {
    const fromTyped = typedModels().find((m) => m.id === modelId())?.avatar
    return fromTyped ?? kolboModels.lookup(modelId()).avatar
  }

  const cost = () => costOf(op(), meta())
  const thumbnail = () => op()?.preview

  const toolDescription = () => {
    const key = `settings.permissions.tool.${props.request.permission}.description`
    const value = language.t(key as Parameters<typeof language.t>[0])
    if (value === key) return ""
    return value
  }

  const actionTag = () => props.request.permission?.toUpperCase()

  let dockRoot: HTMLDivElement | undefined
  let primaryButton: HTMLButtonElement | undefined

  onMount(() => {
    dockRoot?.scrollIntoView({ behavior: "smooth", block: "center" })
    requestAnimationFrame(() => primaryButton?.focus({ preventScroll: true }))
  })

  createEffect(() => {
    void props.request.id
    dockRoot?.scrollIntoView({ behavior: "smooth", block: "center" })
  })

  return (
    <div ref={dockRoot}>
      <DockPrompt
        kind="permission"
        header={
          <div data-slot="permission-row" data-variant="header">
            <span data-slot="permission-icon">
              <Icon name={isGeneration() ? "brain" : "warning"} size="normal" />
            </span>
            <div data-slot="permission-header-title">
              {isGeneration()
                ? language.t("ui.permission.generate.title")
                : language.t("notification.permission.title")}
              <Show when={actionTag()}>
                <span data-slot="permission-action-tag">{actionTag()}</span>
              </Show>
            </div>
          </div>
        }
        footer={
          <>
            <div />
            <div data-slot="permission-footer-actions">
              <Button variant="ghost" size="normal" onClick={() => props.onDecide("reject")} disabled={props.responding}>
                {language.t("ui.permission.deny")}
              </Button>
              <Show
                when={hasChanges()}
                fallback={
                  <>
                    <Button
                      variant="secondary"
                      size="normal"
                      onClick={() => props.onDecide("always")}
                      disabled={props.responding}
                    >
                      {language.t("ui.permission.allowAlways")}
                    </Button>
                    <Button
                      ref={primaryButton}
                      variant="primary"
                      size="normal"
                      onClick={() => props.onDecide("once")}
                      disabled={props.responding}
                    >
                      {isGeneration()
                        ? language.t("ui.permission.generate.approve")
                        : language.t("ui.permission.allowOnce")}
                      <Show when={cost() !== undefined}>
                        <span data-slot="permission-cost"> ✦ {cost()}</span>
                      </Show>
                    </Button>
                  </>
                }
              >
                <Button variant="primary" size="normal" onClick={sendChanges} disabled={props.responding}>
                  {language.t("ui.permission.approveWithChanges")}
                </Button>
              </Show>
            </div>
          </>
        }
      >
        <Show when={thumbnail()}>
          <div data-slot="permission-row">
            <span data-slot="permission-spacer" aria-hidden="true" />
            <img src={thumbnail()} alt="" data-slot="permission-thumbnail" />
          </div>
        </Show>

        <Show when={op()?.prompt}>
          <div data-slot="permission-row">
            <span data-slot="permission-spacer" aria-hidden="true" />
            <div data-slot="permission-gen-prompt">{op()?.prompt}</div>
          </div>
        </Show>

        <Show when={isGeneration()}>
          <div data-slot="permission-row">
            <span data-slot="permission-spacer" aria-hidden="true" />
            <div data-slot="permission-params">
              {/* Model — real dropdown with avatars + friendly names. */}
              <Show when={modelField() || modelOptions().length > 0}>
                <div data-slot="permission-param" data-changed={changedKeys().includes("model") ? "true" : undefined}>
                  <span data-slot="permission-param-label">{language.t("ui.permission.param.model")}</span>
                  <DropdownMenu>
                    <DropdownMenu.Trigger data-slot="permission-model-trigger" disabled={props.responding}>
                      <Show when={modelAvatar()}>
                        <img
                          src={proxyAvatar(modelAvatar())}
                          alt=""
                          width={18}
                          height={18}
                          referrerpolicy="no-referrer"
                          data-slot="permission-model-avatar"
                          style={{ width: "18px", height: "18px", "object-fit": "cover", "border-radius": "5px" }}
                          onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")}
                        />
                      </Show>
                      <span data-slot="permission-model-name">{modelName() || language.t("ui.permission.param.model")}</span>
                      <Icon name="chevron-down" size="small" />
                    </DropdownMenu.Trigger>
                    <DropdownMenu.Portal>
                      <DropdownMenu.Content data-slot="permission-model-menu">
                        <For each={modelOptions()}>
                          {(m) => (
                            <DropdownMenu.Item
                              data-slot="permission-model-item"
                              data-selected={m.id === modelId() ? "true" : undefined}
                              onSelect={() => setField("model", m.id)}
                            >
                              <Show
                                when={m.avatar}
                                fallback={<span data-slot="permission-model-avatar" data-empty="true" />}
                              >
                                <img
                                  src={proxyAvatar(m.avatar)}
                                  alt=""
                                  width={24}
                                  height={24}
                                  referrerpolicy="no-referrer"
                                  data-slot="permission-model-avatar"
                                  style={{ width: "24px", height: "24px", "object-fit": "cover", "border-radius": "6px" }}
                                  onError={(e) => ((e.currentTarget as HTMLImageElement).style.visibility = "hidden")}
                                />
                              </Show>
                              <span data-slot="permission-model-item-name">{m.name}</span>
                            </DropdownMenu.Item>
                          )}
                        </For>
                      </DropdownMenu.Content>
                    </DropdownMenu.Portal>
                  </DropdownMenu>
                </div>
              </Show>

              <For each={knobs()}>
                {(item) => (
                  <label data-slot="permission-param" data-changed={changedKeys().includes(item.id) ? "true" : undefined}>
                    <span data-slot="permission-param-label">{humanizeLabel(item.id)}</span>
                    <Switch>
                      <Match when={item.type === "boolean"}>
                        <select
                          disabled={props.responding}
                          value={valueOf(item.id)}
                          onChange={(e) => setField(item.id, e.currentTarget.value)}
                        >
                          <option value="true">{language.t("ui.permission.param.on")}</option>
                          <option value="false">{language.t("ui.permission.param.off")}</option>
                        </select>
                      </Match>
                      <Match when={true}>
                        <input
                          type={fieldType(item) === "number" ? "number" : "text"}
                          disabled={props.responding}
                          value={valueOf(item.id)}
                          placeholder="—"
                          list={item.options?.length ? `perm-sugg-${item.id}` : undefined}
                          size={Math.max(3, valueOf(item.id).length + 1)}
                          onInput={(e) => setField(item.id, e.currentTarget.value)}
                          onKeyDown={(e) => e.stopPropagation()}
                        />
                      </Match>
                    </Switch>
                    <Show when={item.options?.length}>
                      <datalist id={`perm-sugg-${item.id}`}>
                        <For each={item.options}>{(opt) => <option value={opt} />}</For>
                      </datalist>
                    </Show>
                  </label>
                )}
              </For>
            </div>
          </div>
        </Show>

        <Show when={toolDescription()}>
          <div data-slot="permission-row">
            <span data-slot="permission-spacer" aria-hidden="true" />
            <div data-slot="permission-hint">{toolDescription()}</div>
          </div>
        </Show>

        <Show when={!isGeneration() && props.request.patterns.length > 0}>
          <div data-slot="permission-row">
            <span data-slot="permission-spacer" aria-hidden="true" />
            <div data-slot="permission-patterns">
              <For each={props.request.patterns}>
                {(pattern) => <code class="text-12-regular text-text-base break-all">{pattern}</code>}
              </For>
            </div>
          </div>
        </Show>

        <div data-slot="permission-row">
          <span data-slot="permission-spacer" aria-hidden="true" />
          <textarea
            data-slot="permission-correction"
            class="text-12-regular"
            rows={1}
            placeholder={language.t("ui.permission.suggestChange.placeholder")}
            value={correction()}
            disabled={props.responding}
            onInput={(event) => setCorrection(event.currentTarget.value)}
            onKeyDown={(event) => {
              event.stopPropagation()
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                event.preventDefault()
                sendChanges()
              }
            }}
          />
        </div>
      </DockPrompt>
    </div>
  )
}
