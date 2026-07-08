import { For, Match, Show, Switch, createEffect, createMemo, createSignal, onMount } from "solid-js"
import type { PermissionRequest } from "@opencode-ai/sdk/v2"
import { Button } from "@opencode-ai/ui/button"
import { DockPrompt } from "@opencode-ai/ui/dock-prompt"
import { DropdownMenu } from "@opencode-ai/ui/dropdown-menu"
import { Icon } from "@opencode-ai/ui/icon"
import { useKolboModels } from "@opencode-ai/ui/context"
import { usePlatformOps } from "@opencode-ai/ui/context/platform-ops"
import { useLanguage } from "@/context/language"

type GenField = { key: string; value: string; type: "string" | "number" | "boolean" }

// Non-restrictive suggestions for common knobs (still free-editable).
const SUGGEST: Record<string, string[]> = {
  aspect_ratio: ["1:1", "9:16", "16:9", "4:5", "3:2", "2:3", "3:4", "21:9"],
  resolution: ["1K", "2K", "3K", "4K", "480p", "720p", "1080p"],
  num_images: ["1", "2", "3", "4"],
  scene_count: ["1", "2", "3", "4", "5", "6", "7", "8"],
  duration: ["5", "8", "10", "15"],
}

// Knobs to always OFFER for a generation type, even if the model didn't set
// them, so the user can dial in resolution / count / duration up front.
function offerableKnobs(tool: string | undefined): string[] {
  const t = (tool ?? "").toLowerCase()
  if (t.includes("music") || t.includes("speech") || t.includes("sound")) return []
  if (t.includes("3d")) return ["resolution"]
  if (t.includes("video") || t.includes("elements") || t.includes("lipsync")) return ["aspect_ratio", "resolution", "duration"]
  return ["aspect_ratio", "num_images", "resolution"] // image family
}

const humanizeLabel = (k: string) => k.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase())

// Map the gated generation tool → the kolbo-api generation type, so the model
// picker only lists models valid for THIS generation (not the chat models).
function generationTypeForTool(tool: string | undefined): string | undefined {
  const t = (tool ?? "").toLowerCase()
  if (t.includes("generate_image_edit") || t.includes("edit_image")) return "image_editing"
  if (t.includes("creative_director") || t.includes("generate_image")) return "text_to_img"
  if (t.includes("video_from_image")) return "img_to_video"
  if (t.includes("video_from_video") || t.includes("edit_video")) return "video_to_video"
  if (t.includes("generate_video")) return "text_to_video"
  if (t.includes("elements")) return "elements"
  if (t.includes("lipsync")) return "lipsync-video"
  if (t.includes("music")) return "music_gen"
  if (t.includes("speech")) return "text_to_speech"
  if (t.includes("sound")) return "text_to_sound"
  if (t.includes("3d")) return "3d_text_to_model"
  return undefined
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
  const str = (v: unknown) => (typeof v === "string" || typeof v === "number" ? String(v) : undefined)

  const gen = createMemo(() => {
    const m = meta()
    const raw = Array.isArray(m.fields) ? (m.fields as unknown[]) : []
    const fields: GenField[] = raw
      .filter((f): f is Record<string, unknown> => !!f && typeof f === "object" && typeof (f as any).key === "string")
      .map((f) => ({
        key: String(f.key),
        value: String(f.value ?? ""),
        type: f.type === "number" || f.type === "boolean" ? f.type : "string",
      }))
    return {
      tool: str(m.tool),
      prompt: typeof m.prompt === "string" ? m.prompt : undefined,
      fields,
    }
  })
  const isGeneration = () => gen().fields.length > 0 || !!gen().prompt

  const passedByKey = createMemo(() => Object.fromEntries(gen().fields.map((f) => [f.key, f] as const)))
  const knobKeys = createMemo(() => offerableKnobs(gen().tool))
  // Editable knob fields: offered set (with passed value or empty) — resolution
  // etc. always show up.
  const knobFields = createMemo<GenField[]>(() =>
    knobKeys().map(
      (k) =>
        passedByKey()[k] ?? {
          key: k,
          value: "",
          type: k === "num_images" || k === "scene_count" || k === "duration" ? "number" : "string",
        },
    ),
  )
  const modelField = createMemo(() => passedByKey()["model"])
  // Any other scalar params the model set that aren't the model or a knob.
  const extraFields = createMemo(() =>
    gen().fields.filter((f) => f.key !== "model" && !knobKeys().includes(f.key)),
  )

  // Editable overrides, keyed by field name.
  const [edits, setEdits] = createSignal<Record<string, string>>({})
  const [correction, setCorrection] = createSignal("")
  createEffect(() => {
    void props.request.id
    setEdits({})
    setCorrection("")
  })
  const originalOf = (key: string) => passedByKey()[key]?.value ?? ""
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
  // Type-filtered generation models for this tool. Falls back to the full
  // catalog only if the type is unknown / not yet loaded.
  const genType = createMemo(() => generationTypeForTool(gen().tool))
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

  const cost = () => {
    const value = meta().cost_credits
    return typeof value === "number" ? value : undefined
  }
  const thumbnail = () => {
    const value = meta().source_image ?? meta().thumbnail ?? meta().image_url
    return typeof value === "string" ? value : undefined
  }

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

        <Show when={gen().prompt}>
          <div data-slot="permission-row">
            <span data-slot="permission-spacer" aria-hidden="true" />
            <div data-slot="permission-gen-prompt">{gen().prompt}</div>
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

              {/* Offered knobs (aspect / resolution / count / duration). */}
              <For each={knobFields()}>
                {(f) => (
                  <label data-slot="permission-param" data-changed={changedKeys().includes(f.key) ? "true" : undefined}>
                    <span data-slot="permission-param-label">{humanizeLabel(f.key)}</span>
                    <input
                      type={f.type === "number" ? "number" : "text"}
                      disabled={props.responding}
                      value={valueOf(f.key)}
                      placeholder="—"
                      list={SUGGEST[f.key] ? `perm-sugg-${f.key}` : undefined}
                      size={Math.max(3, valueOf(f.key).length + 1)}
                      onInput={(e) => setField(f.key, e.currentTarget.value)}
                      onKeyDown={(e) => e.stopPropagation()}
                    />
                    <Show when={SUGGEST[f.key]}>
                      <datalist id={`perm-sugg-${f.key}`}>
                        <For each={SUGGEST[f.key]}>{(o) => <option value={o} />}</For>
                      </datalist>
                    </Show>
                  </label>
                )}
              </For>

              {/* Any other scalar params the model set. */}
              <For each={extraFields()}>
                {(f) => (
                  <label data-slot="permission-param" data-changed={changedKeys().includes(f.key) ? "true" : undefined}>
                    <span data-slot="permission-param-label">{humanizeLabel(f.key)}</span>
                    <Switch>
                      <Match when={f.type === "boolean"}>
                        <select
                          disabled={props.responding}
                          value={valueOf(f.key)}
                          onChange={(e) => setField(f.key, e.currentTarget.value)}
                        >
                          <option value="true">{language.t("ui.permission.param.on")}</option>
                          <option value="false">{language.t("ui.permission.param.off")}</option>
                        </select>
                      </Match>
                      <Match when={true}>
                        <input
                          type={f.type === "number" ? "number" : "text"}
                          disabled={props.responding}
                          value={valueOf(f.key)}
                          size={Math.max(3, valueOf(f.key).length + 1)}
                          onInput={(e) => setField(f.key, e.currentTarget.value)}
                          onKeyDown={(e) => e.stopPropagation()}
                        />
                      </Match>
                    </Switch>
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
