import {
  BoxRenderable,
  TextareaRenderable,
  MouseEvent,
  MouseButton,
  PasteEvent,
  decodePasteBytes,
  t,
  dim,
  fg,
  type KeyEvent,
} from "@opentui/core"
import { PushToTalk } from "../../util/push-to-talk"
import { createEffect, createMemo, onMount, createSignal, onCleanup, on, Show, Switch, Match } from "solid-js"
import "opentui-spinner/solid"
import path from "path"
import { fileURLToPath } from "url"
import { Filesystem } from "@/util/filesystem"
import { useLocal } from "@tui/context/local"
import { useTheme } from "@tui/context/theme"
import { EmptyBorder, SplitBorder } from "@tui/component/border"
import { useSDK } from "@tui/context/sdk"
import { useRoute } from "@tui/context/route"
import { useSync } from "@tui/context/sync"
import { MessageID, PartID } from "@/session/schema"
import { createStore, produce } from "solid-js/store"
import { useKeybind } from "@tui/context/keybind"
import { usePromptHistory, type PromptInfo } from "./history"
import { assign } from "./part"
import { usePromptStash } from "./stash"
import { DialogStash } from "../dialog-stash"
import { type AutocompleteRef, Autocomplete } from "./autocomplete"
import { useCommandDialog } from "../dialog-command"
import { useRenderer, type JSX } from "@opentui/solid"
import { Editor } from "@tui/util/editor"
import { useExit } from "../../context/exit"
import { Clipboard } from "../../util/clipboard"
import type { AssistantMessage, FilePart, UserMessage } from "@opencode-ai/sdk/v2"
import { TuiEvent } from "../../event"
import { iife } from "@/util/iife"
import { Locale } from "@/util/locale"
import { formatDuration } from "@/util/format"
import { sessionKolboCredits, type ModelPricing } from "@/util/kolbo-credits"
import { createColors, createFrames } from "../../ui/spinner.ts"
import { useDialog } from "@tui/ui/dialog"
import { DialogProvider as DialogProviderConnect } from "../dialog-provider"
import { DialogAlert } from "../../ui/dialog-alert"
import { useToast } from "../../ui/toast"
import { useKV } from "../../context/kv"
import { useTextareaKeybindings } from "../textarea-keybindings"
import { DialogSkill } from "../dialog-skill"
import { useI18n, toVisual, toVisualLines, isRTL } from "@/i18n"

export type PromptProps = {
  sessionID?: string
  workspaceID?: string
  visible?: boolean
  disabled?: boolean
  onSubmit?: () => void
  ref?: (ref: PromptRef | undefined) => void
  hint?: JSX.Element
  right?: JSX.Element
  showPlaceholder?: boolean
  placeholders?: {
    normal?: string[]
    shell?: string[]
  }
}

export type PromptRef = {
  focused: boolean
  current: PromptInfo
  set(prompt: PromptInfo): void
  reset(): void
  blur(): void
  focus(): void
  submit(): void
}

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
})

function randomIndex(count: number) {
  if (count <= 0) return 0
  return Math.floor(Math.random() * count)
}

// Max image attachments allowed in a single prompt. Gemini's effective per-
// request vision limit is well above this, but 10 is a reasonable cap for
// readability and to keep request sizes predictable when each image adds a
// CDN URL to the content array.
const MAX_IMAGES_PER_PROMPT = 10

type AttachmentBucket = "Image" | "PDF" | "Audio" | "Video" | "File"

function bucketForMime(mime: string): AttachmentBucket {
  if (mime === "application/pdf") return "PDF"
  if (mime.startsWith("image/")) return "Image"
  if (mime.startsWith("audio/")) return "Audio"
  if (mime.startsWith("video/")) return "Video"
  return "File"
}

function isAttachmentMime(mime: string): boolean {
  // Only images and PDFs take the upload-then-attach path. Audio and video
  // files dropped into the prompt fall through to the default text-paste
  // handling, same as any other filepath a user drops — their path gets
  // inserted verbatim so the user can reference it without any upload.
  return mime === "application/pdf" || mime.startsWith("image/")
}

/**
 * Attempt client-side text extraction for text-based PDFs so they route via
 * the cheap MiniMax text path instead of the expensive Gemini vision path.
 * Returns the concatenated text content on success, or null for
 * scanned/image-only PDFs (callers should fall back to base64 attachment).
 * `unpdf` is dynamically imported so its ~500KB weight only loads when a PDF
 * is actually dropped — keeps the cold-start path lean.
 */
async function tryExtractPdfText(buffer: ArrayBuffer): Promise<string | null> {
  try {
    const mod: any = await import("unpdf")
    const pdf = await mod.getDocumentProxy(new Uint8Array(buffer))
    const result = await mod.extractText(pdf, { mergePages: true })
    const text =
      typeof result.text === "string"
        ? result.text
        : Array.isArray(result.text)
          ? result.text.join("\n\n")
          : ""
    if (text.trim().length === 0) return null
    return text
  } catch {
    return null
  }
}

export function Prompt(props: PromptProps) {
  let input: TextareaRenderable
  let anchor: BoxRenderable
  let autocomplete: AutocompleteRef

  const { t: tI18n } = useI18n()
  const keybind = useKeybind()
  const local = useLocal()
  const sdk = useSDK()
  const route = useRoute()
  const sync = useSync()
  const dialog = useDialog()
  const toast = useToast()
  const status = createMemo(() => sync.data.session_status?.[props.sessionID ?? ""] ?? { type: "idle" })
  const history = usePromptHistory()
  const stash = usePromptStash()
  const command = useCommandDialog()
  const renderer = useRenderer()
  const { theme, syntax } = useTheme()
  const kv = useKV()
  const list = createMemo(() => props.placeholders?.normal ?? [])
  const shell = createMemo(() => props.placeholders?.shell ?? [])
  const [auto, setAuto] = createSignal<AutocompleteRef>()
  const currentProviderLabel = createMemo(() => local.model.parsed().provider)
  const hasRightContent = createMemo(() => Boolean(props.right))

  function promptModelWarning() {
    toast.show({
      variant: "warning",
      message: tI18n("toast.noProviderForPrompts"),
      duration: 3000,
    })
    if (sync.data.provider.length === 0) {
      dialog.replace(() => <DialogProviderConnect />)
    }
  }

  const textareaKeybindings = useTextareaKeybindings()

  const fileStyleId = syntax().getStyleId("extmark.file")!
  const agentStyleId = syntax().getStyleId("extmark.agent")!
  const pasteStyleId = syntax().getStyleId("extmark.paste")!
  let promptPartTypeId = 0

  sdk.event.on(TuiEvent.PromptAppend.type, (evt) => {
    if (!input || input.isDestroyed) return
    input.insertText(evt.properties.text)
    setTimeout(() => {
      // setTimeout is a workaround and needs to be addressed properly
      if (!input || input.isDestroyed) return
      input.getLayoutNode().markDirty()
      input.gotoBufferEnd()
      renderer.requestRender()
    }, 0)
  })

  createEffect(() => {
    if (props.disabled) input.cursorColor = theme.backgroundElement
    if (!props.disabled) input.cursorColor = theme.text
  })

  const lastUserMessage = createMemo(() => {
    if (!props.sessionID) return undefined
    const messages = sync.data.message[props.sessionID]
    if (!messages) return undefined
    return messages.findLast((m): m is UserMessage => m.role === "user")
  })

  const [kolboPricing, setKolboPricing] = createSignal<Record<string, ModelPricing>>({})

  // Pricing is stable across a session — fetch once on mount.
  onMount(() => {
    sdk.client.global
      .kolboPricing()
      .then((res) => {
        if (res.data) setKolboPricing(res.data as Record<string, ModelPricing>)
      })
      .catch(() => {})
  })

  const usage = createMemo(() => {
    if (!props.sessionID) return
    const msg = sync.data.message[props.sessionID] ?? []
    const last = msg.findLast((item): item is AssistantMessage => item.role === "assistant" && item.tokens.output > 0)
    if (!last) return

    const tokens =
      last.tokens.input + last.tokens.output + last.tokens.reasoning + last.tokens.cache.read + last.tokens.cache.write
    if (tokens <= 0) return

    const model = sync.data.provider.find((item) => item.id === last.providerID)?.models[last.modelID]
    const pct = model?.limit.context ? `${Math.round((tokens / model.limit.context) * 100)}%` : undefined
    const isKolbo = last.providerID === "kolbo"
    const cost = isKolbo ? 0 : msg.reduce((sum, item) => sum + (item.role === "assistant" ? item.cost : 0), 0)

    // Per-session Kolbo credit consumption — mirrors the backend per-request
    // ceil() formula, and swaps to kolbo-vision pricing once any user message
    // in the conversation has a media attachment (because the backend will
    // then route every subsequent request to Gemini). Hidden silently if
    // pricing hasn't loaded or the model isn't in the pricing map.
    const credits = isKolbo
      ? sessionKolboCredits({
          messages: msg,
          partsByMessageID: (id) => sync.data.part[id],
          pricing: kolboPricing(),
        })
      : 0

    return {
      context: pct ? `${Locale.number(tokens)} (${pct})` : Locale.number(tokens),
      cost: isKolbo
        ? credits > 0
          ? tI18n("sidebar.context.creditsCompact", { n: credits.toLocaleString() })
          : undefined
        : cost > 0
          ? money.format(cost)
          : undefined,
    }
  })

  const [store, setStore] = createStore<{
    prompt: PromptInfo
    mode: "normal" | "shell"
    extmarkToPartIndex: Map<number, number>
    interrupt: number
    placeholder: number
    escPressedAt: number | null
    ctrlCPressedAt: number | null
  }>({
    placeholder: randomIndex(list().length),
    prompt: {
      input: "",
      parts: [],
    },
    mode: "normal",
    extmarkToPartIndex: new Map(),
    interrupt: 0,
    escPressedAt: null,
    ctrlCPressedAt: null,
  })

  createEffect(
    on(
      () => props.sessionID,
      () => {
        setStore("placeholder", randomIndex(list().length))
      },
      { defer: true },
    ),
  )

  // ==========================================================================
  // Push-to-talk (hold Ctrl+Space → realtime transcription)
  //
  // Why a dedicated keybind (not just "hold space"):
  //
  //   The earlier "hold plain space" implementations tried to detect a hold
  //   via (a) a 500ms timer scheduled on space press or (b) the Kitty
  //   keyboard protocol's `repeat` event. Both were unreliable in practice:
  //
  //     • Timer approach: typing a space and pausing to think (normal
  //       behavior) would trigger recording mid-sentence.
  //     • Repeat-event approach: Windows Terminal + other common terminals
  //       don't emit reliable kitty repeat events for space, so holding
  //       never promoted into recording.
  //
  //   A dedicated modifier-based keybind (default: Ctrl+Space) sidesteps
  //   both problems. Press = start recording immediately, release = stop,
  //   no hold detection needed. The keybind is configurable via the
  //   `input_voice` key in the TUI config.
  // ==========================================================================
  const [pttRecording, setPttRecording] = createSignal(false)
  const [pttPartial, setPttPartial] = createSignal("")
  let pttSession: PushToTalk.Session | null = null
  let pttStarting = false // true between triggerPtt() call and session assignment

  const stopPtt = (mode: "stop" | "cancel") => {
    if (pttSession) {
      if (mode === "stop") pttSession.stop()
      else pttSession.cancel()
      pttSession = null
    }
    pttStarting = false
    setPttRecording(false)
    setPttPartial("")
  }

  /** Translate a PushToTalk.ErrorInfo into a localized, user-facing string. */
  const formatPttError = (err: PushToTalk.ErrorInfo): string => {
    return tI18n(`voice.errors.${err.code}`, err.params ?? {})
  }

  const triggerPtt = async () => {
    if (!input || input.isDestroyed) return
    if (pttStarting || pttSession || pttRecording()) return

    pttStarting = true
    setPttRecording(true)
    setPttPartial("")

    const result = await PushToTalk.start({
      onPartial: (text) => setPttPartial(text),
      onCommitted: (text) => {
        if (!input || input.isDestroyed) return
        // Append with a trailing space so successive committed chunks
        // don't jam together.
        input.insertText(text + " ")
        setStore("prompt", "input", input.plainText)
        setPttPartial("")
        renderer.requestRender()
      },
      onError: (err) => {
        toast.show({ variant: "error", message: formatPttError(err), duration: 4000 })
        stopPtt("cancel")
      },
      onStopped: () => {
        setPttRecording(false)
        setPttPartial("")
      },
    })

    pttStarting = false
    if (!result.ok) {
      toast.show({ variant: "error", message: formatPttError(result.error), duration: 4000 })
      setPttRecording(false)
      return
    }
    pttSession = result.session
  }

  // Release events are NOT delivered to the textarea's onKeyDown — opentui
  // routes `keypress` (press + repeat) to renderables but `keyrelease` only
  // fires on the renderer-level KeyHandler.
  //
  // PTT stops on release of the base key of the voice keybind (default:
  // "space", from "ctrl+space"). When the user lets go of space — whether
  // or not they're still holding ctrl — recording stops. This matches the
  // natural "let go to stop talking" PTT gesture.
  //
  // Note: we match on the base key name rather than re-checking the full
  // keybind, because kitty releases come per-key — `space release` arrives
  // separately from `ctrl release`, and we want either to end the session.
  onMount(() => {
    const handleRelease = (e: KeyEvent) => {
      if (!pttRecording() && !pttStarting) return
      if (e.name === "space") {
        stopPtt("stop")
      }
    }
    renderer.keyInput.on("keyrelease", handleRelease)
    onCleanup(() => {
      renderer.keyInput.off("keyrelease", handleRelease)
    })
  })

  onCleanup(() => {
    stopPtt("cancel")
  })

  // Initialize agent/model/variant from last user message when session changes
  let syncedSessionID: string | undefined
  createEffect(() => {
    const sessionID = props.sessionID
    const msg = lastUserMessage()

    if (sessionID !== syncedSessionID) {
      if (!sessionID || !msg) return

      syncedSessionID = sessionID

      // Only set agent if it's a primary agent (not a subagent)
      const isPrimaryAgent = local.agent.list().some((x) => x.name === msg.agent)
      if (msg.agent && isPrimaryAgent) {
        local.agent.set(msg.agent)
        if (msg.model) {
          local.model.set(msg.model)
          local.model.variant.set(msg.model.variant)
        }
      }
    }
  })

  command.register(() => {
    return [
      {
        title: tI18n("commands.clearPrompt"),
        value: "prompt.clear",
        category: tI18n("commands.categories.prompt"),
        hidden: true,
        onSelect: (dialog) => {
          input.extmarks.clear()
          input.clear()
          dialog.clear()
        },
      },
      {
        title: tI18n("commands.submitPrompt"),
        value: "prompt.submit",
        keybind: "input_submit",
        category: tI18n("commands.categories.prompt"),
        hidden: true,
        onSelect: (dialog) => {
          if (!input.focused) return
          submit()
          dialog.clear()
        },
      },
      {
        title: tI18n("commands.paste"),
        value: "prompt.paste",
        keybind: "input_paste",
        category: tI18n("commands.categories.prompt"),
        hidden: true,
        onSelect: async () => {
          await pasteClipboard()
        },
      },
      {
        title: tI18n("commands.interruptSession"),
        value: "session.interrupt",
        keybind: "session_interrupt",
        category: tI18n("commands.categories.session"),
        hidden: true,
        enabled: status().type !== "idle",
        onSelect: (dialog) => {
          if (autocomplete.visible) return
          if (!input.focused) return
          // TODO: this should be its own command
          if (store.mode === "shell") {
            setStore("mode", "normal")
            return
          }
          if (!props.sessionID) return

          setStore("interrupt", store.interrupt + 1)

          setTimeout(() => {
            setStore("interrupt", 0)
          }, 5000)

          if (store.interrupt >= 2) {
            sdk.client.session.abort({
              sessionID: props.sessionID,
            })
            setStore("interrupt", 0)
          }
          dialog.clear()
        },
      },
      {
        title: tI18n("commands.openEditor"),
        category: tI18n("commands.categories.session"),
        keybind: "editor_open",
        value: "prompt.editor",
        slash: {
          name: "editor",
        },
        onSelect: async (dialog) => {
          dialog.clear()

          // replace summarized text parts with the actual text
          const text = store.prompt.parts
            .filter((p) => p.type === "text")
            .reduce((acc, p) => {
              if (!p.source) return acc
              return acc.replace(p.source.text.value, p.text)
            }, store.prompt.input)

          const nonTextParts = store.prompt.parts.filter((p) => p.type !== "text")

          const value = text
          const content = await Editor.open({ value, renderer })
          if (!content) return

          input.setText(content)

          // Update positions for nonTextParts based on their location in new content
          // Filter out parts whose virtual text was deleted
          // this handles a case where the user edits the text in the editor
          // such that the virtual text moves around or is deleted
          const updatedNonTextParts = nonTextParts
            .map((part) => {
              let virtualText = ""
              if (part.type === "file" && part.source?.text) {
                virtualText = part.source.text.value
              } else if (part.type === "agent" && part.source) {
                virtualText = part.source.value
              }

              if (!virtualText) return part

              const newStart = content.indexOf(virtualText)
              // if the virtual text is deleted, remove the part
              if (newStart === -1) return null

              const newEnd = newStart + virtualText.length

              if (part.type === "file" && part.source?.text) {
                return {
                  ...part,
                  source: {
                    ...part.source,
                    text: {
                      ...part.source.text,
                      start: newStart,
                      end: newEnd,
                    },
                  },
                }
              }

              if (part.type === "agent" && part.source) {
                return {
                  ...part,
                  source: {
                    ...part.source,
                    start: newStart,
                    end: newEnd,
                  },
                }
              }

              return part
            })
            .filter((part) => part !== null)

          setStore("prompt", {
            input: content,
            // keep only the non-text parts because the text parts were
            // already expanded inline
            parts: updatedNonTextParts,
          })
          restoreExtmarksFromParts(updatedNonTextParts)
          input.cursorOffset = Bun.stringWidth(content)
        },
      },
      {
        title: tI18n("commands.skills"),
        value: "prompt.skills",
        category: tI18n("commands.categories.prompt"),
        slash: {
          name: "skills",
        },
        onSelect: () => {
          dialog.replace(() => (
            <DialogSkill
              onSelect={(skill) => {
                input.setText(`/${skill} `)
                setStore("prompt", {
                  input: `/${skill} `,
                  parts: [],
                })
                input.gotoBufferEnd()
              }}
            />
          ))
        },
      },
    ]
  })

  const ref: PromptRef = {
    get focused() {
      return input.focused
    },
    get current() {
      return store.prompt
    },
    focus() {
      input.focus()
    },
    blur() {
      input.blur()
    },
    set(prompt) {
      input.setText(prompt.input)
      setStore("prompt", prompt)
      restoreExtmarksFromParts(prompt.parts)
      input.gotoBufferEnd()
    },
    reset() {
      input.extmarks.clear()
      input.setText("")
      setStore("prompt", {
        input: "",
        parts: [],
      })
      setStore("extmarkToPartIndex", new Map())
    },
    submit() {
      submit()
    },
  }

  onCleanup(() => {
    props.ref?.(undefined)
  })

  createEffect(() => {
    if (!input || input.isDestroyed) return
    if (props.visible === false || dialog.stack.length > 0) {
      input.blur()
      return
    }

    // Slot/plugin updates can remount the background prompt while a dialog is open.
    // Keep focus with the dialog and let the prompt reclaim it after the dialog closes.
    input.focus()
  })

  createEffect(() => {
    if (!input || input.isDestroyed) return
    input.traits = {
      capture: auto()?.visible ? ["escape", "navigate", "submit", "tab"] : undefined,
      suspend: !!props.disabled || store.mode === "shell",
      status: store.mode === "shell" ? "SHELL" : undefined,
    }
  })

  function restoreExtmarksFromParts(parts: PromptInfo["parts"]) {
    input.extmarks.clear()
    setStore("extmarkToPartIndex", new Map())

    parts.forEach((part, partIndex) => {
      let start = 0
      let end = 0
      let virtualText = ""
      let styleId: number | undefined

      if (part.type === "file" && part.source?.text) {
        start = part.source.text.start
        end = part.source.text.end
        virtualText = part.source.text.value
        styleId = fileStyleId
      } else if (part.type === "agent" && part.source) {
        start = part.source.start
        end = part.source.end
        virtualText = part.source.value
        styleId = agentStyleId
      } else if (part.type === "text" && part.source?.text) {
        start = part.source.text.start
        end = part.source.text.end
        virtualText = part.source.text.value
        styleId = pasteStyleId
      }

      if (virtualText) {
        const extmarkId = input.extmarks.create({
          start,
          end,
          virtual: true,
          styleId,
          typeId: promptPartTypeId,
        })
        setStore("extmarkToPartIndex", (map: Map<number, number>) => {
          const newMap = new Map(map)
          newMap.set(extmarkId, partIndex)
          return newMap
        })
      }
    })
  }

  function syncExtmarksWithPromptParts() {
    const allExtmarks = input.extmarks.getAllForTypeId(promptPartTypeId)
    setStore(
      produce((draft) => {
        const newMap = new Map<number, number>()
        const newParts: typeof draft.prompt.parts = []

        for (const extmark of allExtmarks) {
          const partIndex = draft.extmarkToPartIndex.get(extmark.id)
          if (partIndex !== undefined) {
            const part = draft.prompt.parts[partIndex]
            if (part) {
              if (part.type === "agent" && part.source) {
                part.source.start = extmark.start
                part.source.end = extmark.end
              } else if (part.type === "file" && part.source?.text) {
                part.source.text.start = extmark.start
                part.source.text.end = extmark.end
              } else if (part.type === "text" && part.source?.text) {
                part.source.text.start = extmark.start
                part.source.text.end = extmark.end
              }
              newMap.set(extmark.id, newParts.length)
              newParts.push(part)
            }
          }
        }

        draft.extmarkToPartIndex = newMap
        draft.prompt.parts = newParts
      }),
    )
  }

  command.register(() => [
    {
      title: tI18n("commands.stashPrompt"),
      value: "prompt.stash",
      category: tI18n("commands.categories.prompt"),
      enabled: !!store.prompt.input,
      onSelect: (dialog) => {
        if (!store.prompt.input) return
        stash.push({
          input: store.prompt.input,
          parts: store.prompt.parts,
        })
        input.extmarks.clear()
        input.clear()
        setStore("prompt", { input: "", parts: [] })
        setStore("extmarkToPartIndex", new Map())
        dialog.clear()
      },
    },
    {
      title: tI18n("commands.stashPop"),
      value: "prompt.stash.pop",
      category: tI18n("commands.categories.prompt"),
      enabled: stash.list().length > 0,
      onSelect: (dialog) => {
        const entry = stash.pop()
        if (entry) {
          input.setText(entry.input)
          setStore("prompt", { input: entry.input, parts: entry.parts })
          restoreExtmarksFromParts(entry.parts)
          input.gotoBufferEnd()
        }
        dialog.clear()
      },
    },
    {
      title: tI18n("commands.stashList"),
      value: "prompt.stash.list",
      category: tI18n("commands.categories.prompt"),
      enabled: stash.list().length > 0,
      onSelect: (dialog) => {
        dialog.replace(() => (
          <DialogStash
            onSelect={(entry) => {
              input.setText(entry.input)
              setStore("prompt", { input: entry.input, parts: entry.parts })
              restoreExtmarksFromParts(entry.parts)
              input.gotoBufferEnd()
            }}
          />
        ))
      },
    },
  ])

  async function submit() {
    if (props.disabled) return
    // Never submit while a dialog is on top. The textarea's blur in the
    // focus-management effect normally prevents this, but edge cases
    // (mount order races, stale focus after a slot/plugin update) can
    // still route an Enter through to onSubmit. Explicit guard.
    if (dialog.stack.length > 0) return
    if (autocomplete?.visible) return
    if (!store.prompt.input) return
    const trimmed = store.prompt.input.trim()
    if (trimmed === "exit" || trimmed === "quit" || trimmed === ":q") {
      exit()
      return
    }
    const selectedModel = local.model.current()
    if (!selectedModel) {
      promptModelWarning()
      return
    }

    let sessionID = props.sessionID
    if (sessionID == null) {
      const res = await sdk.client.session.create({
        workspaceID: props.workspaceID,
      })

      if (res.error) {
        console.log("Creating a session failed:", res.error)

        toast.show({
          message: tI18n("toast.sessionCreateFailed"),
          variant: "error",
        })

        return
      }

      sessionID = res.data.id
    }

    const messageID = MessageID.ascending()
    let inputText = store.prompt.input

    // Expand pasted text inline before submitting
    const allExtmarks = input.extmarks.getAllForTypeId(promptPartTypeId)
    const sortedExtmarks = allExtmarks.sort((a: { start: number }, b: { start: number }) => b.start - a.start)

    for (const extmark of sortedExtmarks) {
      const partIndex = store.extmarkToPartIndex.get(extmark.id)
      if (partIndex !== undefined) {
        const part = store.prompt.parts[partIndex]
        if (part?.type === "text" && part.text) {
          const before = inputText.slice(0, extmark.start)
          const after = inputText.slice(extmark.end)
          inputText = before + part.text + after
        }
      }
    }

    // Filter out text parts (pasted content) since they're now expanded inline
    const nonTextParts = store.prompt.parts.filter((part) => part.type !== "text")

    // Capture mode before it gets reset
    const currentMode = store.mode
    const variant = local.model.variant.current()

    if (store.mode === "shell") {
      sdk.client.session.shell({
        sessionID,
        agent: local.agent.current().name,
        model: {
          providerID: selectedModel.providerID,
          modelID: selectedModel.modelID,
        },
        command: inputText,
      })
      setStore("mode", "normal")
    } else if (
      inputText.startsWith("/") &&
      iife(() => {
        const firstLine = inputText.split("\n")[0]
        const command = firstLine.split(" ")[0].slice(1)
        return sync.data.command.some((x) => x.name === command)
      })
    ) {
      // Parse command from first line, preserve multi-line content in arguments
      const firstLineEnd = inputText.indexOf("\n")
      const firstLine = firstLineEnd === -1 ? inputText : inputText.slice(0, firstLineEnd)
      const [command, ...firstLineArgs] = firstLine.split(" ")
      const restOfInput = firstLineEnd === -1 ? "" : inputText.slice(firstLineEnd + 1)
      const args = firstLineArgs.join(" ") + (restOfInput ? "\n" + restOfInput : "")

      sdk.client.session.command({
        sessionID,
        command: command.slice(1),
        arguments: args,
        agent: local.agent.current().name,
        model: `${selectedModel.providerID}/${selectedModel.modelID}`,
        messageID,
        variant,
        parts: nonTextParts
          .filter((x) => x.type === "file")
          .map((x) => ({
            id: PartID.ascending(),
            ...x,
          })),
      })
    } else {
      sdk.client.session
        .prompt({
          sessionID,
          ...selectedModel,
          messageID,
          agent: local.agent.current().name,
          model: selectedModel,
          variant,
          parts: [
            {
              id: PartID.ascending(),
              type: "text",
              text: inputText,
            },
            ...nonTextParts.map(assign),
          ],
        })
        .catch(() => {})
    }
    history.append({
      ...store.prompt,
      mode: currentMode,
    })
    input.extmarks.clear()
    input.setText("")
    setStore("prompt", {
      input: "",
      parts: [],
    })
    setStore("extmarkToPartIndex", new Map())
    props.onSubmit?.()

    // temporary hack to make sure the message is sent
    if (!props.sessionID)
      setTimeout(() => {
        route.navigate({
          type: "session",
          sessionID,
        })
      }, 50)
  }
  const exit = useExit()

  function pasteText(text: string, virtualText: string) {
    const currentOffset = input.visualCursor.offset
    const extmarkStart = currentOffset
    const extmarkEnd = extmarkStart + virtualText.length

    input.insertText(virtualText + " ")

    const extmarkId = input.extmarks.create({
      start: extmarkStart,
      end: extmarkEnd,
      virtual: true,
      styleId: pasteStyleId,
      typeId: promptPartTypeId,
    })

    setStore(
      produce((draft) => {
        const partIndex = draft.prompt.parts.length
        draft.prompt.parts.push({
          type: "text" as const,
          text,
          source: {
            text: {
              start: extmarkStart,
              end: extmarkEnd,
              value: virtualText,
            },
          },
        })
        draft.extmarkToPartIndex.set(extmarkId, partIndex)
      }),
    )
  }

  /**
   * Monotonic counters per attachment bucket for the current prompt. We count
   * by reading from `store.prompt.parts` at pasteAttachment time, but keep a
   * "next index" hint cached here so that if the store filter races with an
   * in-flight upload (second drop reading state before the first has landed),
   * the chip label still increments. The signal is reset whenever the prompt
   * is cleared (on submit / stash / ctrl+c). Each call returns the next index
   * for its bucket AND stores it back so the following call increments.
   *
   * Read order in `pasteAttachment` is:
   *   1. Read the real store count (source of truth).
   *   2. Read the cached hint.
   *   3. Use `max(storeCount, hint) + 1` — guarantees strict monotonic
   *      numbering even if two uploads complete in the same microtask and
   *      both read a stale storeCount.
   *   4. Update the hint.
   */
  const [imageIdxHint, setImageIdxHint] = createSignal(0)
  const [pdfIdxHint, setPdfIdxHint] = createSignal(0)
  const [audioIdxHint, setAudioIdxHint] = createSignal(0)
  const [videoIdxHint, setVideoIdxHint] = createSignal(0)
  const [fileIdxHint, setFileIdxHint] = createSignal(0)

  function nextAttachmentIndex(bucket: AttachmentBucket): number {
    // Source of truth: live store count for the same bucket.
    const storeCount = store.prompt.parts.filter((x) => {
      if (x.type !== "file") return false
      return bucketForMime((x as { mime: string }).mime) === bucket
    }).length
    const hint = (() => {
      switch (bucket) {
        case "Image":
          return imageIdxHint()
        case "PDF":
          return pdfIdxHint()
        case "Audio":
          return audioIdxHint()
        case "Video":
          return videoIdxHint()
        default:
          return fileIdxHint()
      }
    })()
    // Take whichever is larger so we're strictly monotonic under races.
    const next = Math.max(storeCount, hint) + 1
    switch (bucket) {
      case "Image":
        setImageIdxHint(next)
        break
      case "PDF":
        setPdfIdxHint(next)
        break
      case "Audio":
        setAudioIdxHint(next)
        break
      case "Video":
        setVideoIdxHint(next)
        break
      default:
        setFileIdxHint(next)
        break
    }
    return next
  }

  // When the prompt is cleared (submit, stash, ctrl+c, reset), the parts array
  // goes back to empty. Reset all bucket hints so the next prompt starts at 1.
  createEffect(() => {
    if (store.prompt.parts.length === 0) {
      setImageIdxHint(0)
      setPdfIdxHint(0)
      setAudioIdxHint(0)
      setVideoIdxHint(0)
      setFileIdxHint(0)
    }
  })

  /**
   * Attach a file part to the current prompt. The caller must have already
   * produced a `url` — either an HTTPS CDN URL from `/kolbo-files-upload`
   * (preferred, required for anything routed via kolbo-vision) or a
   * `data:...;base64,...` URL for small inline content when the provider
   * can handle it. Binary media attachments to the Kolbo provider MUST be
   * CDN URLs because the chat endpoint caps the request body at 1 MB.
   */
  async function pasteAttachment(file: { filename?: string; filepath?: string; mime: string; url: string }) {
    const currentOffset = input.visualCursor.offset
    const extmarkStart = currentOffset
    const bucket = bucketForMime(file.mime)
    const idx = nextAttachmentIndex(bucket)
    const virtualText = `[${bucket} ${idx}]`
    const extmarkEnd = extmarkStart + virtualText.length
    const textToInsert = virtualText + " "

    input.insertText(textToInsert)

    const extmarkId = input.extmarks.create({
      start: extmarkStart,
      end: extmarkEnd,
      virtual: true,
      styleId: pasteStyleId,
      typeId: promptPartTypeId,
    })

    const part: Omit<FilePart, "id" | "messageID" | "sessionID"> = {
      type: "file" as const,
      mime: file.mime,
      filename: file.filename,
      url: file.url,
      source: {
        type: "file",
        path: file.filepath ?? file.filename ?? "",
        text: {
          start: extmarkStart,
          end: extmarkEnd,
          value: virtualText,
        },
      },
    }
    setStore(
      produce((draft) => {
        const partIndex = draft.prompt.parts.length
        draft.prompt.parts.push(part)
        draft.extmarkToPartIndex.set(extmarkId, partIndex)
      }),
    )
    return
  }

  /**
   * Hard-cap image attachments at `MAX_IMAGES_PER_PROMPT` per prompt. Returns
   * true if the caller should proceed (limit not reached), false if the limit
   * has been hit — in which case this helper has already surfaced an error
   * toast, so the caller should just return.
   */
  function checkImageLimit(): boolean {
    const existing = store.prompt.parts.filter(
      (x) => x.type === "file" && typeof x.mime === "string" && x.mime.startsWith("image/"),
    ).length
    if (existing >= MAX_IMAGES_PER_PROMPT) {
      toast.show({
        variant: "error",
        message: `Maximum ${MAX_IMAGES_PER_PROMPT} images per message — remove one before adding more.`,
        duration: 4000,
      })
      return false
    }
    return true
  }

  // Cached Kolbo auth context (API key + base URL). Fetched lazily on the
  // first upload attempt. Kept here, not module-level, so it's scoped to the
  // component lifetime — if the user re-auths, a fresh Prompt re-fetches.
  let kolboAuthContext: { apiKey: string; apiBase: string } | undefined
  async function getKolboAuthContext(): Promise<{ apiKey: string; apiBase: string }> {
    if (kolboAuthContext) return kolboAuthContext
    // This call goes through sdk.fetch, which in internal mode is the
    // worker-RPC bridge. That's fine here — the response is small JSON, no
    // binary body involved. Only the multipart upload itself needs to dodge
    // the bridge.
    const res = await sdk.fetch(`${sdk.url}/global/kolbo-auth-context`, { method: "GET" })
    if (!res.ok) {
      if (res.status === 401) {
        throw new Error("Not authenticated with Kolbo — run /auth to sign in")
      }
      throw new Error(`Failed to load Kolbo auth (${res.status})`)
    }
    const data = (await res.json()) as { apiKey: string; apiBase: string }
    kolboAuthContext = data
    return data
  }

  /**
   * Upload a Blob (from filesystem or clipboard) directly to kolbo-api's
   * POST /kolbo/v1/files endpoint. Returns the permanent CDN URL.
   *
   * We deliberately use `globalThis.fetch` (Bun's native network fetch), NOT
   * `sdk.fetch`, because in the default internal TUI mode `sdk.fetch` is a
   * worker-RPC bridge that stringifies request bodies via `Request.text()`
   * — which lossily mangles multipart boundaries and binary file bytes. See
   * `createWorkerFetch` in thread.ts. The fix is to skip the bridge entirely
   * for this one call and talk to kolbo-api over the real network. The API
   * key is fetched once from the worker-side auth store via a small JSON
   * route (which the bridge handles fine).
   */
  async function uploadKolboBlob(blob: Blob, filename: string): Promise<{ url: string; mime_type: string }> {
    const ctx = await getKolboAuthContext()
    const form = new FormData()
    form.append("file", blob, filename)
    const res = await globalThis.fetch(`${ctx.apiBase}/kolbo/v1/files`, {
      method: "POST",
      headers: { Authorization: `Bearer ${ctx.apiKey}` },
      body: form,
    })
    if (!res.ok) {
      const body = await res.text().catch(() => "")
      // Extract upstream error message if the body is JSON-shaped like
      // { error: { message } } — that's the envelope kolbo-api uses. Fall
      // back to status-specific defaults so users never see a bare code.
      let serverMessage: string | undefined
      try {
        const parsed = JSON.parse(body) as { error?: { message?: string } }
        if (parsed?.error?.message) serverMessage = parsed.error.message
      } catch {}
      // 401 from upstream means the cached key is stale — drop it so the
      // next upload attempt re-fetches fresh credentials.
      if (res.status === 401) kolboAuthContext = undefined
      const message =
        serverMessage ??
        (res.status === 401
          ? "Not authenticated with Kolbo — run /auth to sign in"
          : res.status === 413
            ? "File is too large (max 500 MB)"
            : res.status === 429
              ? "Too many uploads — rate limited, try again in a moment"
              : `Upload failed (${res.status})`)
      throw new Error(message)
    }
    return (await res.json()) as { url: string; mime_type: string }
  }

  /**
   * Shared helper for both clipboard-paste code paths (the `prompt.paste`
   * command and the keybind-intercepted Ctrl+V). Decodes the base64 clipboard
   * payload into a Blob, uploads it, and attaches the resulting CDN URL.
   * Surfaces errors via the toast system and never inlines base64 into the
   * prompt — uniform with the file-drop path. Only reached for images and
   * PDFs; audio/video are filtered out upstream by `isAttachmentMime`.
   */
  async function uploadAndAttachClipboard(mime: string, base64Data: string) {
    // Enforce image-count cap before the upload round-trip.
    if (mime.startsWith("image/") && !checkImageLimit()) return

    // ASCII braille spinner — updates every 80ms via setInterval so the
    // user sees a live "cool ascii" animation next to the upload label
    // instead of a static banner. Frames are the standard "dots" spinner
    // used widely in TUIs (0x2800-0x28ff block).
    const spinnerFrames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]
    const bucket = bucketForMime(mime).toLowerCase()
    let frame = 0
    const renderToast = () => {
      toast.show({
        variant: "info",
        // Long duration so the toast stays until we explicitly dismiss.
        // Each setInterval tick calls show() again to swap the frame;
        // show() replaces the current toast, which effectively animates.
        duration: 60000,
        message: `${spinnerFrames[frame]} Uploading clipboard ${bucket}…`,
      })
      frame = (frame + 1) % spinnerFrames.length
    }
    renderToast()
    const spinnerTimer = setInterval(renderToast, 80)

    try {
      const bytes = Buffer.from(base64Data, "base64")
      const blob = new Blob([bytes], { type: mime })
      const extension = mime.split("/")[1]?.split("+")[0] ?? "bin"
      const filename = `clipboard.${extension}`
      const ref = await uploadKolboBlob(blob, filename)
      await pasteAttachment({
        filename,
        mime,
        url: ref.url,
      })
      // Upload done — stop the spinner and dismiss the toast.
      clearInterval(spinnerTimer)
      toast.dismiss()
    } catch (e) {
      clearInterval(spinnerTimer)
      toast.show({
        variant: "error",
        message: `Upload failed: ${(e as Error).message}`,
        duration: 5000,
      })
    }
  }

  /**
   * Unified "paste whatever's in the clipboard" path. Used by three entry
   * points: ctrl+v keypress, right-mouse-button click on the textarea, and
   * the /prompt.paste slash command. Handles both text and binary content:
   *
   *   • Images / PDFs / etc (isAttachmentMime) → upload + attach as a chip
   *     via uploadAndAttachClipboard.
   *   • Plain text → either inline insert, or (for long pastes ≥3 lines /
   *     >150 chars) wrapped in a `[Pasted ~N lines]` chip via pasteText,
   *     matching the bracketed-paste behavior in the onPaste handler.
   *
   * Returns true if anything was pasted, so callers can know whether to
   * preventDefault the originating event.
   */
  async function pasteClipboard(): Promise<boolean> {
    if (props.disabled || !input || input.isDestroyed) return false
    const content = await Clipboard.read().catch(() => undefined)
    if (!content) return false
    if (isAttachmentMime(content.mime)) {
      await uploadAndAttachClipboard(content.mime, content.data)
      return true
    }
    // Text clipboard. Normalize line endings; the bracketed-paste handler
    // does the same thing and we want the two paths to stay consistent.
    const normalized = content.data.replace(/\r\n/g, "\n").replace(/\r/g, "\n")
    if (!normalized) return false
    const lineCount = (normalized.match(/\n/g)?.length ?? 0) + 1
    if (
      (lineCount >= 3 || normalized.length > 150) &&
      !sync.data.config.experimental?.disable_paste_summary
    ) {
      pasteText(normalized, `[Pasted ~${lineCount} lines]`)
      return true
    }
    input.insertText(normalized)
    setStore("prompt", "input", input.plainText)
    renderer.requestRender()
    return true
  }

  const highlight = createMemo(() => {
    if (keybind.leader) return theme.border
    if (store.mode === "shell") return theme.primary
    return local.agent.color(local.agent.current().name)
  })

  const showVariant = createMemo(() => {
    const variants = local.model.variant.list()
    if (variants.length === 0) return false
    const current = local.model.variant.current()
    return !!current
  })

  const placeholderText = createMemo(() => {
    if (props.showPlaceholder === false) return undefined
    if (store.mode === "shell") {
      if (!shell().length) return undefined
      const example = shell()[store.placeholder % shell().length]
      return `Run a command... "${example}"`
    }
    if (!list().length) return undefined
    return `Ask anything... "${list()[store.placeholder % list().length]}"`
  })

  const spinnerDef = createMemo(() => {
    const color = local.agent.color(local.agent.current().name)
    return {
      frames: createFrames({
        color,
        style: "blocks",
        inactiveFactor: 0.6,
        // enableFading: false,
        minAlpha: 0.3,
      }),
      color: createColors({
        color,
        style: "blocks",
        inactiveFactor: 0.6,
        // enableFading: false,
        minAlpha: 0.3,
      }),
    }
  })

  return (
    <>
      <Autocomplete
        sessionID={props.sessionID}
        ref={(r) => {
          autocomplete = r
          setAuto(() => r)
        }}
        anchor={() => anchor}
        input={() => input}
        setPrompt={(cb) => {
          setStore("prompt", produce(cb))
        }}
        setExtmark={(partIndex, extmarkId) => {
          setStore("extmarkToPartIndex", (map: Map<number, number>) => {
            const newMap = new Map(map)
            newMap.set(extmarkId, partIndex)
            return newMap
          })
        }}
        value={store.prompt.input}
        fileStyleId={fileStyleId}
        agentStyleId={agentStyleId}
        promptPartTypeId={() => promptPartTypeId}
      />
      <box ref={(r) => (anchor = r)} visible={props.visible !== false}>
        <box
          border={["left"]}
          borderColor={highlight()}
          customBorderChars={{
            ...SplitBorder.customBorderChars,
            bottomLeft: "╹",
          }}
        >
          <box
            paddingLeft={2}
            paddingRight={2}
            paddingTop={1}
            flexShrink={0}
            backgroundColor={theme.backgroundElement}
            flexGrow={1}
          >
            <Show when={pttRecording()}>
              <text fg={theme.primary}>
                {`\u25cf ${tI18n("voice.recording")}`}
                {pttPartial()
                  ? ` ${isRTL() ? "\u2190" : "\u2192"} ${toVisual(pttPartial())}`
                  : ""}
              </text>
            </Show>
            <textarea
              placeholder={placeholderText()}
              placeholderColor={theme.textMuted}
              textColor={keybind.leader ? theme.textMuted : theme.text}
              focusedTextColor={keybind.leader ? theme.textMuted : theme.text}
              minHeight={1}
              maxHeight={6}
              onContentChange={() => {
                const value = input.plainText
                setStore("prompt", "input", value)
                autocomplete.onInput(value)
                syncExtmarksWithPromptParts()
              }}
              keyBindings={textareaKeybindings()}
              onKeyDown={async (e) => {
                // While any dialog is on top, block ALL textarea key
                // handling — both my custom handlers below AND opentui's
                // built-in `handleKeyPress` (typing, submit, newline,
                // move, etc.).
                //
                // In opentui, a focused renderable's keypress handler runs:
                //   1. this._keyListeners["down"](key)    ← user onKeyDown
                //   2. if (!key.defaultPrevented) this.handleKeyPress(key)
                //                                          ← built-in actions
                //
                // Returning here without preventDefault still lets step 2
                // run, so letters leak into the prompt buffer even with
                // the dialog visible. preventDefault() blocks step 2
                // without affecting the dialog's own `useKeyboard`
                // subscribers, which ran in an earlier phase (phase 1 /
                // global listeners in emitWithPriority).
                if (dialog.stack.length > 0) {
                  e.preventDefault()
                  return
                }
                // ---- Push-to-talk: voice keybind press ------------------
                // Default keybind is "alt+v,f2" — either triggers PTT. On
                // press, start recording immediately (no hold timer, no
                // rollback). Release is handled in the renderer.keyInput
                // keyrelease subscription above.
                if (
                  (e.eventType === "press" || e.eventType === undefined) &&
                  !props.disabled &&
                  input &&
                  input.focused &&
                  keybind.match("input_voice", e)
                ) {
                  if (!pttSession && !pttRecording() && !pttStarting) {
                    void triggerPtt()
                  }
                  e.preventDefault()
                  return
                }
                // With useKittyKeyboard.events enabled, release/repeat events
                // also arrive here. All existing handlers below assume press
                // semantics, so drop everything else at the top.
                if (e.eventType && e.eventType !== "press") return
                // ESC while recording cancels the PTT session without flushing.
                if (pttRecording() && e.name === "escape") {
                  stopPtt("cancel")
                  e.preventDefault()
                  return
                }
                if (props.disabled) {
                  e.preventDefault()
                  return
                }
                // Ctrl+V: paste whatever is on the clipboard via the
                // unified helper — media goes through the upload+attach
                // chip flow, text gets inserted inline (or wrapped as a
                // `[Pasted ~N lines]` chip for long content). This covers
                // terminals that forward Ctrl+V as a key event and the
                // clipboard has real content ready. For terminals that
                // deliver Ctrl+V via bracketed paste instead, the onPaste
                // handler below owns that path.
                if (keybind.match("input_paste", e)) {
                  const handled = await pasteClipboard()
                  if (handled) {
                    e.preventDefault()
                    return
                  }
                  // Fall through for terminals that fire both a Ctrl+V
                  // keypress AND a subsequent bracketed paste event —
                  // if the clipboard was empty here, the bracketed paste
                  // still has a chance to deliver content via onPaste.
                }
                // ---- Explicit newline handling --------------------------
                // Use the textarea's dedicated `newLine()` method (NOT
                // `insertText("\n")`). newLine() routes to the native
                // edit buffer's proper multi-line insertion; insertText
                // with a literal "\n" may or may not survive the native
                // text path depending on the backend.
                //
                // The RTL wrapper (isRTL() branch in the textarea ref
                // callback below) overrides both insertText AND newLine
                // so the logicalText buffer stays in sync either way.
                if (keybind.match("input_newline", e) && input && !input.isDestroyed && !props.disabled) {
                  input.newLine()
                  setStore("prompt", "input", input.plainText)
                  renderer.requestRender()
                  e.preventDefault()
                  return
                }
                if (keybind.match("input_clear", e) && store.prompt.input !== "") {
                  // If PTT is in any state (hold pending or actively recording),
                  // tear it down before clearing the input. This prevents a
                  // pending hold timer from firing moments later and starting
                  // recording on an already-cleared prompt, and ensures the
                  // mic/socket are released when the user wants to bail.
                  if ((pttStarting || pttRecording() || pttSession)) stopPtt("cancel")
                  // Use setText("") rather than clear(). Reason: in RTL mode
                  // the textarea ref callback overrides insertText / setText
                  // to maintain a `logicalText` buffer, but clear() goes
                  // directly to the native buffer without touching it. The
                  // onContentChange callback then reads `input.plainText`
                  // (which returns `logicalText` in RTL) and writes the
                  // STALE old text back into the store — the prompt
                  // visually empties but the store still thinks there's
                  // text, so the NEXT ctrl+c keeps hitting input_clear
                  // instead of ever reaching app_exit. setText("") routes
                  // through the wrapped override and resets logicalText too,
                  // so store and view stay in sync.
                  input.setText("")
                  input.extmarks.clear()
                  setStore("prompt", {
                    input: "",
                    parts: [],
                  })
                  setStore("extmarkToPartIndex", new Map())
                  // Also arm the ctrl+c-again-to-exit hint in the SAME press.
                  // Without this, exiting from a non-empty prompt would take
                  // three presses (clear → hint → exit). Arming here folds
                  // the first two into one, so the UX is always:
                  //   • text present  → press 1 clears + arms hint, press 2 exits
                  //   • empty prompt  → press 1 arms hint, press 2 exits
                  // Two presses to exit, either way.
                  const clearNow = Date.now()
                  setStore("ctrlCPressedAt", clearNow)
                  setTimeout(() => {
                    if (store.ctrlCPressedAt === clearNow) setStore("ctrlCPressedAt", null)
                  }, 3000)
                  return
                }
                if (keybind.match("app_exit", e)) {
                  if (store.prompt.input === "") {
                    const now = Date.now()
                    // Require two ctrl+c presses within 3s to exit. Protects
                    // new users (who may hit ctrl+c expecting "cancel current
                    // action") from accidentally quitting the whole app. The
                    // 3s window is generous enough to re-press deliberately
                    // after reading the hint but short enough to not linger.
                    if (store.ctrlCPressedAt !== null && now - store.ctrlCPressedAt < 3000) {
                      // Second press within the window → actually exit.
                      setStore("ctrlCPressedAt", null)
                      if (pttStarting || pttRecording() || pttSession) stopPtt("cancel")
                      await exit()
                      e.preventDefault()
                      return
                    }
                    // First press → arm the double-press and show the hint.
                    // The hint is rendered in the prompt footer (Show block
                    // below) and auto-dismisses after 3s if the user doesn't
                    // confirm.
                    setStore("ctrlCPressedAt", now)
                    setTimeout(() => {
                      // Only clear if this specific press is still the latest
                      // armed one — otherwise we'd stomp on a newer press that
                      // got armed in the meantime.
                      if (store.ctrlCPressedAt === now) setStore("ctrlCPressedAt", null)
                    }, 3000)
                    e.preventDefault()
                    return
                  }
                }
                if (e.name === "!" && input.visualCursor.offset === 0) {
                  setStore("placeholder", randomIndex(shell().length))
                  setStore("mode", "shell")
                  e.preventDefault()
                  return
                }
                if (store.mode === "shell") {
                  if ((e.name === "backspace" && input.visualCursor.offset === 0) || e.name === "escape") {
                    setStore("mode", "normal")
                    e.preventDefault()
                    return
                  }
                }
                // Double-tap ESC to clear input
                if (e.name === "escape" && store.prompt.input !== "") {
                  const now = Date.now()
                  if (store.escPressedAt !== null && now - store.escPressedAt < 1500) {
                    // Second press within 1.5s → clear (setText resets undo history, clear() doesn't)
                    input.setText("")
                    input.extmarks.clear()
                    setStore("prompt", { input: "", parts: [] })
                    setStore("extmarkToPartIndex", new Map())
                    setStore("escPressedAt", null)
                    e.preventDefault()
                    return
                  }
                  // First press → show hint
                  setStore("escPressedAt", now)
                  // Auto-dismiss after 1.5s if no second press
                  setTimeout(() => setStore("escPressedAt", null), 1500)
                  e.preventDefault()
                  return
                }
                if (store.mode === "normal") autocomplete.onKeyDown(e)
                if (!autocomplete.visible) {
                  if (
                    (keybind.match("history_previous", e) && input.cursorOffset === 0) ||
                    (keybind.match("history_next", e) && input.cursorOffset === input.plainText.length)
                  ) {
                    const direction = keybind.match("history_previous", e) ? -1 : 1
                    const item = history.move(direction, input.plainText)

                    if (item) {
                      input.setText(item.input)
                      setStore("prompt", item)
                      setStore("mode", item.mode ?? "normal")
                      restoreExtmarksFromParts(item.parts)
                      e.preventDefault()
                      if (direction === -1) input.cursorOffset = 0
                      if (direction === 1) input.cursorOffset = input.plainText.length
                    }
                    return
                  }

                  if (keybind.match("history_previous", e) && input.visualCursor.visualRow === 0) input.cursorOffset = 0
                  if (keybind.match("history_next", e) && input.visualCursor.visualRow === input.height - 1)
                    input.cursorOffset = input.plainText.length
                }
              }}
              onSubmit={submit}
              onPaste={async (event: PasteEvent) => {
                if (props.disabled) {
                  event.preventDefault()
                  return
                }

                // Normalize line endings at the boundary
                // Windows ConPTY/Terminal often sends CR-only newlines in bracketed paste
                // Replace CRLF first, then any remaining CR
                const normalizedText = decodePasteBytes(event.bytes).replace(/\r\n/g, "\n").replace(/\r/g, "\n")
                const pastedContent = normalizedText.trim()

                // Windows Terminal <1.25 can surface image-only clipboard as an
                // empty bracketed paste. Windows Terminal 1.25+ does not.
                if (!pastedContent) {
                  command.trigger("prompt.paste")
                  return
                }

                const filepath = iife(() => {
                  const raw = pastedContent.replace(/^['"]+|['"]+$/g, "")
                  if (raw.startsWith("file://")) {
                    try {
                      return fileURLToPath(raw)
                    } catch {}
                  }
                  if (process.platform === "win32") return raw
                  return raw.replace(/\\(.)/g, "$1")
                })
                const isUrl = /^(https?):\/\//.test(filepath)
                if (!isUrl) {
                  try {
                    const mime = Filesystem.mimeType(filepath)
                    const filename = path.basename(filepath)
                    // Handle SVG as raw text content, not as base64 image
                    if (mime === "image/svg+xml") {
                      event.preventDefault()
                      const content = await Filesystem.readText(filepath).catch(() => {})
                      if (content) {
                        pasteText(content, `[SVG: ${filename ?? "image"}]`)
                        return
                      }
                    }
                    if (isAttachmentMime(mime)) {
                      event.preventDefault()

                      // Enforce image-count cap before we bother reading or
                      // uploading anything. PDFs are not capped.
                      if (mime.startsWith("image/") && !checkImageLimit()) return

                      const buffer = await Filesystem.readArrayBuffer(filepath).catch(() => undefined)
                      if (!buffer) return

                      // Text-based PDFs: extract client-side and send as plain
                      // text so the backend routes to MiniMax (cheap) instead
                      // of Gemini (expensive). Scanned / image-only PDFs fall
                      // through to the upload-as-binary path.
                      if (mime === "application/pdf") {
                        const extracted = await tryExtractPdfText(buffer)
                        if (extracted) {
                          const lineCount = (extracted.match(/\n/g)?.length ?? 0) + 1
                          pasteText(extracted, `[PDF: ${filename ?? "document"} ~${lineCount} lines]`)
                          return
                        }
                      }

                      // Binary media → upload to /kolbo/v1/files and keep the
                      // returned CDN URL in the FilePart. We must NOT inline
                      // base64 for Kolbo because the chat-completions body is
                      // capped at 1 MB. Anything over ~750 KB would fail.
                      toast.show({
                        variant: "info",
                        message: `Uploading ${filename ?? "file"}…`,
                        duration: 3000,
                      })
                      try {
                        const blob = new Blob([buffer], { type: mime })
                        const ref = await uploadKolboBlob(blob, filename ?? "upload")
                        await pasteAttachment({
                          filename,
                          filepath,
                          mime,
                          url: ref.url,
                        })
                      } catch (e) {
                        toast.show({
                          variant: "error",
                          message: `Upload failed: ${(e as Error).message}`,
                          duration: 5000,
                        })
                      }
                      return
                    }
                  } catch {}
                }

                const lineCount = (pastedContent.match(/\n/g)?.length ?? 0) + 1
                if (
                  (lineCount >= 3 || pastedContent.length > 150) &&
                  !sync.data.config.experimental?.disable_paste_summary
                ) {
                  event.preventDefault()
                  pasteText(pastedContent, `[Pasted ~${lineCount} lines]`)
                  return
                }

                // Force layout update and render for the pasted content
                setTimeout(() => {
                  // setTimeout is a workaround and needs to be addressed properly
                  if (!input || input.isDestroyed) return
                  input.getLayoutNode().markDirty()
                  renderer.requestRender()
                }, 0)
              }}
              ref={(r: TextareaRenderable) => {
                input = r
                if (promptPartTypeId === 0) {
                  promptPartTypeId = input.extmarks.registerType("prompt-part")
                }

                // RTL textarea support: maintain logical text, display visually-reordered text.
                // opentui renders cell-by-cell so the terminal's BiDi algorithm never runs.
                // We intercept insertText/deleteCharBackward to keep a logicalText buffer,
                // store the bidi-visual string in the opentui buffer, and expose logicalText
                // via plainText so the rest of the app works with correct logical order.
                if (isRTL()) {
                  let logicalText = ""

                  // Save originals before patching
                  const _origInsertText = r.insertText.bind(r)
                  const _origDeleteChar = r.deleteCharBackward.bind(r)
                  const _origSetText = r.setText.bind(r)
                  const _origClear = r.clear.bind(r)

                  // Update the visual buffer from current logicalText.
                  //
                  // Multi-line notes:
                  //   • toVisualLines reorders EACH line independently so
                  //     bidi reordering doesn't flow across line boundaries.
                  //   • For cursor positioning we move to the end of the
                  //     last line's *visible* content: in RTL, the "newest"
                  //     visual character sits at column 0 of its row; in LTR
                  //     it sits at the row's natural end. Rows that are
                  //     still pure LTR get the natural-end position.
                  const syncVisual = () => {
                    const visualText = toVisualLines(logicalText)
                    _origSetText(visualText)
                    // Position the cursor at the end of the last line so
                    // typing continues where the user left off. For RTL
                    // reordered lines that's visual column 0 (newest char
                    // landed there). For LTR-ish lines, it's the line width.
                    const lastNewlineAt = logicalText.lastIndexOf("\n")
                    const lastLogicalLine =
                      lastNewlineAt === -1 ? logicalText : logicalText.slice(lastNewlineAt + 1)
                    const lastVisualLine = toVisual(lastLogicalLine)
                    // Row index = number of \n in the logical buffer.
                    // cursorOffset in opentui is a 1D offset into the visual
                    // buffer, so we compute: sum(visual line widths) up to
                    // and including the last row separator, then add the
                    // end-of-line offset for the current line.
                    const linesBefore = visualText.split("\n").slice(0, lastNewlineAt === -1 ? 0 : -1)
                    const offsetBeforeLastRow =
                      linesBefore.reduce((acc, line) => acc + Bun.stringWidth(line) + 1, 0)
                    const endOfLastLine =
                      lastVisualLine !== lastLogicalLine ? 0 : Bun.stringWidth(lastVisualLine)
                    r.cursorOffset = offsetBeforeLastRow + endOfLastLine
                  }

                  r.insertText = (text: string) => {
                    // Preserve newlines (shift+enter / meta+enter). The old
                    // implementation stripped them, which made line breaks
                    // silently collapse into the surrounding text — hence
                    // "shift+enter acts like a space".
                    logicalText = logicalText + text
                    syncVisual()
                    ;(r as any).emit?.("input", logicalText)
                  }

                  // Override newLine so the dedicated newLine() path also
                  // updates our logicalText. Without this, calling
                  // `input.newLine()` would hit the unwrapped native method,
                  // insert \n into the real buffer, and then the NEXT
                  // syncVisual() (triggered by any subsequent insertText)
                  // would overwrite that buffer with our stale logicalText
                  // — silently wiping the line break. That's exactly the
                  // "line break disappears when the user types more" bug.
                  ;(r as any).newLine = () => {
                    logicalText = logicalText + "\n"
                    syncVisual()
                    ;(r as any).emit?.("input", logicalText)
                    return true
                  }

                  r.deleteCharBackward = () => {
                    if (logicalText.length === 0) return false
                    logicalText = logicalText.slice(0, -1)
                    syncVisual()
                    ;(r as any).emit?.("input", logicalText)
                    return true
                  }

                  // plainText getter returns logical (not visual) text for the rest of the app
                  Object.defineProperty(r, "plainText", {
                    get: () => logicalText,
                    configurable: true,
                  })

                  // setText: external callers (history navigation, pre-fill) update logicalText too
                  r.setText = (value: string) => {
                    logicalText = value
                    _origSetText(toVisualLines(logicalText))
                    r.cursorOffset = 0
                  }

                  // Override clear() so any code path that calls it (the
                  // /prompt.clear command, double-ESC to clear, etc.) also
                  // resets our logicalText buffer. Without this, the native
                  // buffer empties but plainText (which returns logicalText
                  // in RTL) still reports the old text, and onContentChange
                  // writes the stale value back into the store.
                  r.clear = () => {
                    logicalText = ""
                    _origClear()
                    r.cursorOffset = 0
                  }
                }

                props.ref?.(ref)
                setTimeout(() => {
                  // setTimeout is a workaround and needs to be addressed properly
                  if (!input || input.isDestroyed) return
                  input.cursorColor = theme.text
                }, 0)
              }}
              onMouseDown={(evt: MouseEvent) => {
                // Right-click = paste from clipboard (text OR media).
                // Runs alongside Ctrl+V.
                //
                // Fire-and-forget via `void`: opentui mouse handlers
                // are synchronous, and awaiting the async upload flow
                // inside the handler was preventing the image path
                // from completing cleanly. Firing the promise lets
                // the mouse event return immediately and the upload
                // runs on its own microtask queue.
                //
                // Focus the textarea ref directly rather than
                // `evt.target` — target can resolve to a nested
                // renderable (cursor layer, placeholder) that isn't
                // focusable, and we need the input itself focused
                // before pasteAttachment reads input.visualCursor.
                if (evt.button === MouseButton.RIGHT) {
                  evt.preventDefault()
                  if (input && !input.isDestroyed) input.focus()
                  void pasteClipboard()
                  return
                }
                // Left / middle click: just focus the textarea.
                if (input && !input.isDestroyed) input.focus()
              }}
              focusedBackgroundColor={theme.backgroundElement}
              cursorColor={theme.text}
              syntaxStyle={syntax()}
            />
            <box flexDirection="row" flexShrink={0} paddingTop={1} gap={1} justifyContent="space-between">
              <box flexDirection="row" gap={1}>
                <text fg={highlight()}>
                  {store.mode === "shell"
                    ? tI18n("agent.shell")
                    : (() => {
                        const key = ({ build: "build", plan: "plan", "auto-approve": "autoApprove" } as Record<string, string>)[local.agent.current().name]
                        return key ? tI18n(`agent.${key}.name`) : Locale.titlecase(local.agent.current().name)
                      })()}{" "}
                </text>
                <Show when={store.mode === "normal"}>
                  <box flexDirection="row" gap={1}>
                    <text flexShrink={0} fg={keybind.leader ? theme.textMuted : theme.text}>
                      {local.model.parsed().model}
                    </text>
                    <Show when={local.model.parsed().provider !== local.model.parsed().model}>
                      <text fg={theme.textMuted}>{currentProviderLabel()}</text>
                    </Show>
                    <Show when={showVariant()}>
                      <text fg={theme.textMuted}>·</text>
                      <text>
                        <span style={{ fg: theme.warning, bold: true }}>{local.model.variant.current()}</span>
                      </text>
                    </Show>
                  </box>
                </Show>
              </box>
              <Show when={hasRightContent()}>
                <box flexDirection="row" gap={1} alignItems="center">
                  {props.right}
                </box>
              </Show>
            </box>
          </box>
        </box>
        <box
          height={1}
          border={["left"]}
          borderColor={highlight()}
          customBorderChars={{
            ...EmptyBorder,
            vertical: theme.backgroundElement.a !== 0 ? "╹" : " ",
          }}
        >
          <box
            height={1}
            border={["bottom"]}
            borderColor={theme.backgroundElement}
            customBorderChars={
              theme.backgroundElement.a !== 0
                ? {
                    ...EmptyBorder,
                    horizontal: "▀",
                  }
                : {
                    ...EmptyBorder,
                    horizontal: " ",
                  }
            }
          />
        </box>
        <box width="100%" flexDirection="row" justifyContent="space-between">
          <Show when={status().type !== "idle"} fallback={
            <Show
              when={store.ctrlCPressedAt !== null}
              fallback={
                <Show
                  when={store.escPressedAt !== null}
                  fallback={
                    props.hint ?? (
                      // Single translated string so tI18n can bidi-reorder
                      // the entire hint line as one unit in RTL locales.
                      // JSX fragment concatenation of `{latin} {hebrew}`
                      // would only bidi each piece in isolation and leave
                      // them stitched together wrong visually.
                      <text fg={theme.textMuted}>
                        {tI18n("session.promptFooterHint", {
                          newlineKey: keybind.print("input_newline") || "ctrl+j",
                          voiceKey: keybind.print("input_voice") || "alt+v",
                        })}
                      </text>
                    )
                  }
                >
                  <text fg={theme.warning}>
                    esc <span style={{ fg: theme.textMuted }}>{tI18n("session.escAgainToClear")}</span>
                  </text>
                </Show>
              }
            >
              <text fg={theme.warning}>
                ctrl+c <span style={{ fg: theme.textMuted }}>{tI18n("session.ctrlCAgainToExit")}</span>
              </text>
            </Show>
          }>
            <box
              flexDirection="row"
              gap={1}
              flexGrow={1}
              justifyContent={status().type === "retry" ? "space-between" : "flex-start"}
            >
              <box flexShrink={0} flexDirection="row" gap={1}>
                <box marginLeft={1}>
                  <Show when={kv.get("animations_enabled", true)} fallback={<text fg={theme.textMuted}>[⋯]</text>}>
                    <spinner color={spinnerDef().color} frames={spinnerDef().frames} interval={40} />
                  </Show>
                </box>
                <box flexDirection="row" gap={1} flexShrink={0}>
                  {(() => {
                    const retry = createMemo(() => {
                      const s = status()
                      if (s.type !== "retry") return
                      return s
                    })
                    const message = createMemo(() => {
                      const r = retry()
                      if (!r) return
                      if (r.message.includes("exceeded your current quota") && r.message.includes("gemini"))
                        return "gemini is way too hot right now"
                      if (r.message.length > 80) return r.message.slice(0, 80) + "..."
                      return r.message
                    })
                    const isTruncated = createMemo(() => {
                      const r = retry()
                      if (!r) return false
                      return r.message.length > 120
                    })
                    const [seconds, setSeconds] = createSignal(0)
                    onMount(() => {
                      const timer = setInterval(() => {
                        const next = retry()?.next
                        if (next) setSeconds(Math.round((next - Date.now()) / 1000))
                      }, 1000)

                      onCleanup(() => {
                        clearInterval(timer)
                      })
                    })
                    const handleMessageClick = () => {
                      const r = retry()
                      if (!r) return
                      if (isTruncated()) {
                        DialogAlert.show(dialog, "Retry Error", r.message)
                      }
                    }

                    const retryText = () => {
                      const r = retry()
                      if (!r) return ""
                      const baseMessage = message()
                      const truncatedHint = isTruncated() ? " (click to expand)" : ""
                      const duration = formatDuration(seconds())
                      const retryInfo = ` [retrying ${duration ? `in ${duration} ` : ""}attempt #${r.attempt}]`
                      return baseMessage + truncatedHint + retryInfo
                    }

                    return (
                      <Show when={retry()}>
                        <box onMouseUp={handleMessageClick}>
                          <text fg={theme.error}>{retryText()}</text>
                        </box>
                      </Show>
                    )
                  })()}
                </box>
              </box>
              <text fg={store.interrupt > 0 ? theme.primary : theme.text}>
                esc{" "}
                <span style={{ fg: store.interrupt > 0 ? theme.primary : theme.textMuted }}>
                  {store.interrupt > 0 ? tI18n("session.againToInterrupt") : tI18n("session.interrupt")}
                </span>
              </text>
            </box>
          </Show>
          <Show when={status().type !== "retry"}>
            <box gap={2} flexDirection="row">
              <Switch>
                <Match when={store.mode === "normal"}>
                  <Switch>
                    <Match when={usage()}>
                      {(item) => (
                        <text fg={theme.textMuted} wrapMode="none">
                          {[item().context, item().cost].filter(Boolean).join(" · ")}
                        </text>
                      )}
                    </Match>
                    <Match when={true}>
                      <text fg={theme.text}>
                        {keybind.print("agent_cycle")} <span style={{ fg: theme.textMuted }}>{tI18n("session.agents")}</span>
                      </text>
                    </Match>
                  </Switch>
                  <text fg={theme.text}>
                    {keybind.print("command_list")} <span style={{ fg: theme.textMuted }}>{tI18n("session.commands")}</span>
                  </text>
                </Match>
                <Match when={store.mode === "shell"}>
                  <text fg={theme.text}>
                    esc <span style={{ fg: theme.textMuted }}>{tI18n("session.exitShellMode")}</span>
                  </text>
                </Match>
              </Switch>
            </box>
          </Show>
        </box>
      </box>
    </>
  )
}
