import { useFilteredList } from "@opencode-ai/ui/hooks"
import { useSpring } from "@opencode-ai/ui/motion-spring"
import { createEffect, For, on, Component, Show, onCleanup, createMemo, createSignal, onMount } from "solid-js"
import { createStore } from "solid-js/store"
import { useLocal } from "@/context/local"
import { selectionFromLines, type SelectedLineRange, useFile } from "@/context/file"
import {
  ContentPart,
  DEFAULT_PROMPT,
  isPromptEqual,
  Prompt,
  usePrompt,
  ImageAttachmentPart,
  AgentPart,
  FileAttachmentPart,
  MediaMentionPart,
  KolboAssetPart,
} from "@/context/prompt"
import { useLayout } from "@/context/layout"
import { useSDK } from "@/context/sdk"
import { useSync } from "@/context/sync"
import { useComments } from "@/context/comments"
import { Button } from "@opencode-ai/ui/button"
import { DockShellForm, DockTray } from "@opencode-ai/ui/dock-surface"
import { DropdownMenu } from "@opencode-ai/ui/dropdown-menu"
import { Icon } from "@opencode-ai/ui/icon"
import { ProviderIcon } from "@opencode-ai/ui/provider-icon"
import { Tooltip, TooltipKeybind } from "@opencode-ai/ui/tooltip"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { Select } from "@opencode-ai/ui/select"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { usePlatformOps } from "@opencode-ai/ui/context/platform-ops"
import { useTheme } from "@opencode-ai/ui/theme/context"
import { ModelSelectorPopover } from "@/components/dialog-select-model"
import { DialogSelectKolboAsset } from "@/components/dialog-select-kolbo-asset"
import { useProviders } from "@/hooks/use-providers"
import { useCommand } from "@/context/command"
import { Persist, persisted } from "@/utils/persist"
import { usePermission } from "@/context/permission"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { useSessionLayout } from "@/pages/session/session-layout"
import { useGlobalSDK } from "@/context/global-sdk"
import { useServer } from "@/context/server"
import { useSessionUsage } from "@/hooks/use-session-usage"
import { createSessionTabs } from "@/pages/session/helpers"
import { promptEnabled, promptProbe } from "@/testing/prompt"
import { detectTextDirection } from "@/utils/rtl"
import { createTextFragment, getCursorPosition, getTextLength, setCursorPosition, setRangeEdge } from "./prompt-input/editor-dom"
import { createPromptAttachments } from "./prompt-input/attachments"
import { ACCEPTED_FILE_TYPES } from "./prompt-input/files"
import {
  canNavigateHistoryAtCursor,
  navigatePromptHistory,
  prependHistoryEntry,
  type PromptHistoryComment,
  type PromptHistoryEntry,
  type PromptHistoryStoredEntry,
  promptLength,
} from "./prompt-input/history"
import { createPromptSubmit, type FollowupDraft } from "./prompt-input/submit"
import { PromptPopover, type AtOption, type SlashCommand } from "./prompt-input/slash-popover"
import { PromptContextItems } from "./prompt-input/context-items"
import { PromptImageAttachments } from "./prompt-input/image-attachments"
import { PromptDragOverlay } from "./prompt-input/drag-overlay"
import { promptPlaceholder } from "./prompt-input/placeholder"
import { matchMentionTrigger, mentionTokenPattern } from "./prompt-input/mention-trigger"
import { mediaLabels } from "./prompt-input/media-labels"
import { createVoiceDictation, type DictationErrorCode } from "./prompt-input/voice-dictation"
import { ImagePreview } from "@opencode-ai/ui/image-preview"

interface PromptInputProps {
  class?: string
  ref?: (el: HTMLDivElement) => void
  newSessionWorktree?: string
  onNewSessionWorktreeReset?: () => void
  edit?: { id: string; prompt: Prompt; context: FollowupDraft["context"] }
  onEditLoaded?: () => void
  busy?: () => boolean
  onAbort?: () => void
  onSubmit?: () => void
}

const EXAMPLES = [
  "prompt.example.1",
  "prompt.example.2",
  "prompt.example.3",
  "prompt.example.4",
  "prompt.example.5",
  "prompt.example.6",
  "prompt.example.7",
  "prompt.example.8",
  "prompt.example.9",
  "prompt.example.10",
  "prompt.example.11",
  "prompt.example.12",
  "prompt.example.13",
  "prompt.example.14",
  "prompt.example.15",
  "prompt.example.16",
  "prompt.example.17",
  "prompt.example.18",
  "prompt.example.19",
  "prompt.example.20",
  "prompt.example.21",
  "prompt.example.22",
  "prompt.example.23",
  "prompt.example.24",
  "prompt.example.25",
] as const

const NON_EMPTY_TEXT = /[^\s\u200B]/

// Map agent name \u2192 icon (build/auto-approve/plan are first-party native
// agents from packages/opencode/src/agent/agent.ts:181-220; user agents
// fall through to a sensible default).
type KolboAsset = { id: string; name: string; thumbnail?: string; dnaType?: string }

type AgentIconName = "pencil-line" | "circle-check" | "checklist" | "magnifying-glass" | "brain"
function agentIcon(name?: string): AgentIconName {
  switch (name) {
    case "build":
      // The default doer agent — actively edits/writes code.
      return "pencil-line"
    case "auto-approve":
      // "Auto-yes to every permission prompt" — a check-mark in a circle
      // reads naturally as "approved by default".
      return "circle-check"
    case "plan":
      return "checklist"
    case "explore":
      return "magnifying-glass"
    default:
      return "brain"
  }
}

/**
 * Avatar slot for the composer's selected-model button. The avatar URL may
 * 404, and the provider's API can sometimes block hotlinked fetches, so we
 * render the image first and fall back to the provider's SVG glyph when the
 * fetch fails. Lives at module scope so the `createSignal`/`createEffect`
 * pair attach to this component's owner — not to a per-render IIFE inside a
 * `<Show>` (which would recreate them on every parent re-render).
 */
function SelectedModelAvatar(props: { url: string | undefined; providerID: string }) {
  const ops = usePlatformOps()
  const [failed, setFailed] = createSignal(false)
  createEffect(on(() => props.url, () => setFailed(false)))
  const src = () => {
    const u = props.url
    if (!u) return undefined
    return ops.imageProxyUrl?.(u) ?? u
  }
  const providerIcon = () => (
    <ProviderIcon
      id={props.providerID}
      class="size-4 shrink-0 transition-opacity duration-150"
      classList={{ "opacity-40 group-hover:opacity-100": props.providerID !== "kolbo" }}
      style={{
        color: props.providerID === "kolbo" ? "#60a5fa" : undefined,
        "will-change": "opacity",
        transform: "translateZ(0)",
      }}
    />
  )
  return (
    <Show when={!failed() && src()} fallback={providerIcon()}>
      {(s) => (
        <img
          src={s()}
          alt=""
          class="size-4 shrink-0 rounded-sm object-cover"
          referrerpolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      )}
    </Show>
  )
}

export const PromptInput: Component<PromptInputProps> = (props) => {
  const sdk = useSDK()
  const sync = useSync()
  const local = useLocal()
  const files = useFile()
  const prompt = usePrompt()
  const layout = useLayout()
  const comments = useComments()
  const dialog = useDialog()
  const providers = useProviders()
  const command = useCommand()
  const permission = usePermission()
  const language = useLanguage()
  const theme = useTheme()
  const isDark = () => {
    const scheme = theme.colorScheme()
    if (scheme === "dark") return true
    if (scheme === "light") return false
    if (typeof window === "undefined") return false
    return window.matchMedia("(prefers-color-scheme: dark)").matches
  }
  const platform = usePlatform()
  const { params, tabs, view } = useSessionLayout()
  const globalSDK = useGlobalSDK()
  const server = useServer()
  const usage = useSessionUsage()

  // Visual DNAs (@) and moodboards (#) for the mention menu. Fetched once — the
  // server caches them and the menu filters locally, because /v1/moodboards sits
  // on the same 10 req/min bucket as generation, so a search-per-keystroke would
  // rate-limit the user's own image generations.
  const [visualDnas, setVisualDnas] = createSignal<KolboAsset[]>([])
  const [moodboards, setMoodboards] = createSignal<KolboAsset[]>([])
  // Which character opened the mention menu — scopes it to moodboards for `#`.
  const [atTrigger, setAtTrigger] = createSignal<"@" | "#">("@")
  onMount(() => {
    // Array.isArray, not truthiness: a server without these routes falls through
    // to the SPA catch-all and returns HTML, which would blow up on .map() below.
    globalSDK.client.global
      .kolboVisualDnas()
      .then((res) => {
        if (Array.isArray(res.data)) setVisualDnas(res.data as KolboAsset[])
      })
      .catch(() => {})
    globalSDK.client.global
      .kolboMoodboards()
      .then((res) => {
        if (Array.isArray(res.data)) setMoodboards(res.data as KolboAsset[])
      })
      .catch(() => {})
  })

  // The platform catalog is thousands of presets, so it is NOT fetched on mount
  // and never enters the `@` menu — it loads once, the first time someone opens
  // the Global tab in the browser dialog.
  const [globalDnas, setGlobalDnas] = createSignal<KolboAsset[]>([])
  const [globalDnasLoading, setGlobalDnasLoading] = createSignal(false)
  let globalDnasRequested = false
  const loadGlobalDnas = () => {
    if (globalDnasRequested) return
    globalDnasRequested = true
    setGlobalDnasLoading(true)
    globalSDK.client.global
      .kolboGlobalVisualDnas()
      .then((res) => {
        if (Array.isArray(res.data)) {
          setGlobalDnas(res.data as KolboAsset[])
          return
        }
        // A sidecar without this route answers the SPA catch-all with HTML — a
        // 200, so it never reaches .catch(). Treat it as a failure, or the tab
        // stays empty forever and never asks again.
        globalDnasRequested = false
      })
      .catch(() => {
        // Let a failed fetch be retried the next time the tab is opened.
        globalDnasRequested = false
      })
      .finally(() => setGlobalDnasLoading(false))
  }

  // ── Voice dictation (realtime Scribe) ──────────────────────────────────
  // Streams the mic to kolbo-api's realtime transcription and types the text
  // into the editor LIVE — partials render as you speak and get replaced by
  // the refined text on each update/commit, mirroring kolbo-map's voice input.
  const [voiceError, setVoiceError] = createSignal<DictationErrorCode | null>(null)
  let voiceErrorTimer: ReturnType<typeof setTimeout> | undefined
  // Dictation session state: the accumulated committed text, how many chars
  // of dictation are currently written at the end of the editor (the region
  // each update replaces), and whether a separating space is needed before it.
  let dictationCommitted = ""
  let dictationWritten = 0
  let dictationNeedsSpace = false
  // stop() keeps the socket alive ~1.5s so the final transcript can land.
  // Once the message is sent that text has nowhere to go — the editor it was
  // writing into is empty again — so silence the writer until the next start.
  let dictationSilenced = false
  const joinChunks = (a: string, b: string) => (a ? `${a} ${b}` : b)
  const writeDictation = (live: string) => {
    const el = editorRef
    if (!el || dictationSilenced) return
    el.focus()
    const total = getTextLength(el)
    // Select the previously written dictation tail (collapsed at the end on
    // the first write) and replace it via execCommand so the input event
    // fires and the prompt store stays in sync — same mechanism as paste.
    const range = document.createRange()
    range.selectNodeContents(el)
    setRangeEdge(el, range, "start", Math.max(0, total - dictationWritten))
    const sel = window.getSelection()
    if (!sel) return
    sel.removeAllRanges()
    sel.addRange(range)
    const chunk = (dictationNeedsSpace ? " " : "") + live
    document.execCommand("insertText", false, chunk)
    dictationWritten = chunk.length
  }
  const dictation = createVoiceDictation({
    baseUrl: () => globalSDK.url,
    onPartial: (text) => writeDictation(joinChunks(dictationCommitted, text)),
    onCommitted: (text) => {
      dictationCommitted = joinChunks(dictationCommitted, text)
      writeDictation(dictationCommitted)
    },
    onError: (code) => {
      setVoiceError(code)
      clearTimeout(voiceErrorTimer)
      voiceErrorTimer = setTimeout(() => setVoiceError(null), 5000)
    },
  })
  const dictating = createMemo(() => dictation.state() === "recording" || dictation.state() === "starting")
  // New dictation session → fresh region at the current end of the editor.
  createEffect(() => {
    if (dictation.state() !== "starting") return
    dictationCommitted = ""
    dictationWritten = 0
    dictationSilenced = false
    const existing = editorRef?.textContent ?? ""
    dictationNeedsSpace = existing.length > 0 && !/\s$/.test(existing)
  })
  const voiceErrorText = createMemo(() => {
    switch (voiceError()) {
      case "notLoggedIn":
        return language.t("prompt.voice.error.notLoggedIn")
      case "micDenied":
        return language.t("prompt.voice.error.mic")
      case "serverError":
      case "connectFailed":
        return language.t("prompt.voice.error.connection")
      default:
        return null
    }
  })

  // Eagerly refresh balance + media spend whenever a Kolbo MCP tool call
  // completes (image / video / audio generation, edits, DNA creation,
  // uploads — anything that touches credits). The 12s media-spend poll +
  // mount-only balance fetch leaves the bottom-bar stale by up to 12s
  // after each generation, which feels broken when the user is iterating.
  // We track the count of completed Kolbo tool parts across all messages
  // in the current session; createEffect re-runs when the count changes,
  // which is exactly the "a generation just finished" signal.
  // Only the most recent assistant message can gain new completions
  // during normal streaming (older messages' tool parts are already
  // terminal). Scan its parts only — O(P) per tick instead of O(M*P)
  // across the whole session. Skip the scan entirely when there's no
  // assistant message yet.
  const completedKolboToolCount = createMemo(() => {
    const id = params.id
    if (!id) return 0
    const messages = (sync.data.message[id] ?? []) as Array<{ id: string; role?: string }>
    const lastAssistant = (() => {
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i]?.role === "assistant") return messages[i]
      }
      return undefined
    })()
    if (!lastAssistant) return 0
    const parts = sync.data.part[lastAssistant.id]
    if (!parts) return 0
    let n = 0
    for (const p of parts) {
      if (p.type !== "tool") continue
      const tool = (p as { tool?: string }).tool ?? ""
      if (!tool.startsWith("kolbo_") && !tool.startsWith("mcp__kolbo__")) continue
      const state = (p as { state?: { status?: string } }).state
      if (state?.status === "completed") n++
    }
    return n
  })
  createEffect((prev: number | undefined) => {
    const current = completedKolboToolCount()
    if (prev !== undefined && current > prev) {
      // A new Kolbo tool just completed — refresh both the global balance
      // and the per-session media spend (kolbo-api source of truth).
      usage.refresh()
    }
    return current
  })

  let editorRef!: HTMLDivElement
  let fileInputRef: HTMLInputElement | undefined
  let scrollRef!: HTMLDivElement
  let slashPopoverRef!: HTMLDivElement

  const mirror = { input: false }
  const inset = 56
  const space = `${inset}px`

  const scrollCursorIntoView = () => {
    const container = scrollRef
    const selection = window.getSelection()
    if (!container || !selection || selection.rangeCount === 0) return

    const range = selection.getRangeAt(0)
    if (!editorRef.contains(range.startContainer)) return

    const cursor = getCursorPosition(editorRef)
    const length = promptLength(prompt.current().filter((part) => part.type !== "image"))
    if (cursor >= length) {
      container.scrollTop = container.scrollHeight
      return
    }

    const rect = range.getClientRects().item(0) ?? range.getBoundingClientRect()
    if (!rect.height) return

    const containerRect = container.getBoundingClientRect()
    const top = rect.top - containerRect.top + container.scrollTop
    const bottom = rect.bottom - containerRect.top + container.scrollTop
    const padding = 12

    if (top < container.scrollTop + padding) {
      container.scrollTop = Math.max(0, top - padding)
      return
    }

    if (bottom > container.scrollTop + container.clientHeight - inset) {
      container.scrollTop = bottom - container.clientHeight + inset
    }
  }

  const queueScroll = (count = 2) => {
    requestAnimationFrame(() => {
      scrollCursorIntoView()
      if (count > 1) queueScroll(count - 1)
    })
  }

  const activeFileTab = createSessionTabs({
    tabs,
    pathFromTab: files.pathFromTab,
    normalizeTab: (tab) => (tab.startsWith("file://") ? files.tab(tab) : tab),
  }).activeFileTab

  const commentInReview = (path: string) => {
    const sessionID = params.id
    if (!sessionID) return false

    const diffs = sync.data.session_diff[sessionID]
    if (!diffs) return false
    return diffs.some((diff) => diff.file === path)
  }

  const openComment = (item: { path: string; commentID?: string; commentOrigin?: "review" | "file" }) => {
    if (!item.commentID) return

    const focus = { file: item.path, id: item.commentID }
    comments.setActive(focus)

    const queueCommentFocus = (attempts = 6) => {
      const schedule = (left: number) => {
        requestAnimationFrame(() => {
          comments.setFocus({ ...focus })
          if (left <= 0) return
          requestAnimationFrame(() => {
            const current = comments.focus()
            if (!current) return
            if (current.file !== focus.file || current.id !== focus.id) return
            schedule(left - 1)
          })
        })
      }

      schedule(attempts)
    }

    const wantsReview = item.commentOrigin === "review" || (item.commentOrigin !== "file" && commentInReview(item.path))
    if (wantsReview) {
      if (!view().reviewPanel.opened()) view().reviewPanel.open()
      layout.fileTree.setTab("changes")
      tabs().setActive("review")
      queueCommentFocus()
      return
    }

    if (!view().reviewPanel.opened()) view().reviewPanel.open()
    layout.fileTree.setTab("all")
    const tab = files.tab(item.path)
    tabs().open(tab)
    tabs().setActive(tab)
    Promise.resolve(files.load(item.path)).finally(() => queueCommentFocus())
  }

  const recent = createMemo(() => {
    const all = tabs().all()
    const active = activeFileTab()
    const order = active ? [active, ...all.filter((x) => x !== active)] : all
    const seen = new Set<string>()
    const paths: string[] = []

    for (const tab of order) {
      const path = files.pathFromTab(tab)
      if (!path) continue
      if (seen.has(path)) continue
      seen.add(path)
      paths.push(path)
    }

    return paths
  })
  const info = createMemo(() => (params.id ? sync.session.get(params.id) : undefined))
  const status = createMemo(
    () =>
      sync.data.session_status[params.id ?? ""] ?? {
        type: "idle",
      },
  )
  const working = createMemo(() => status()?.type !== "idle")
  const imageAttachments = createMemo(() =>
    prompt.current().filter((part): part is ImageAttachmentPart => part.type === "image"),
  )

  const isUploadingAttachment = createMemo(() => imageAttachments().some((a) => a.uploading))

  const [store, setStore] = createStore<{
    popover: "at" | "slash" | null
    historyIndex: number
    savedPrompt: PromptHistoryEntry | null
    placeholder: number
    draggingType: "image" | "@mention" | null
    mode: "normal" | "shell"
    applyingHistory: boolean
  }>({
    popover: null,
    historyIndex: -1,
    savedPrompt: null as PromptHistoryEntry | null,
    placeholder: Math.floor(Math.random() * EXAMPLES.length),
    draggingType: null,
    mode: "normal",
    applyingHistory: false,
  })

  const buttonsSpring = useSpring(() => (store.mode === "normal" ? 1 : 0), { visualDuration: 0.2, bounce: 0 })
  const motion = (value: number) => ({
    opacity: value,
    transform: `scale(${0.95 + value * 0.05})`,
    filter: `blur(${(1 - value) * 2}px)`,
    "pointer-events": value > 0.5 ? ("auto" as const) : ("none" as const),
  })
  const buttons = createMemo(() => motion(buttonsSpring()))
  const shell = createMemo(() => motion(1 - buttonsSpring()))
  const control = createMemo(() => ({ height: "28px", ...buttons() }))

  const commentCount = createMemo(() => {
    if (store.mode === "shell") return 0
    return prompt.context.items().filter((item) => !!item.comment?.trim()).length
  })
  const blank = createMemo(() => {
    const text = prompt
      .current()
      .map((part) => ("content" in part ? part.content : ""))
      .join("")
    return text.trim().length === 0 && imageAttachments().length === 0 && commentCount() === 0
  })
  const stopping = createMemo(() => working() && blank())
  const tip = () => {
    if (stopping()) {
      return (
        <div class="flex items-center gap-2">
          <span>{language.t("prompt.action.stop")}</span>
          <span class="text-icon-base text-12-medium text-[10px]!">{language.t("common.key.esc")}</span>
        </div>
      )
    }

    return (
      <div class="flex items-center gap-2">
        <span>{language.t("prompt.action.send")}</span>
        <Icon name="enter" size="small" class="text-icon-base" />
      </div>
    )
  }

  const contextItems = createMemo(() => {
    const items = prompt.context.items()
    if (store.mode !== "shell") return items
    return items.filter((item) => !item.comment?.trim())
  })

  const hasUserPrompt = createMemo(() => {
    const sessionID = params.id
    if (!sessionID) return false
    const messages = sync.data.message[sessionID]
    if (!messages) return false
    return messages.some((m) => m.role === "user")
  })

  const [history, setHistory] = persisted(
    Persist.global("prompt-history", ["prompt-history.v1"]),
    createStore<{
      entries: PromptHistoryStoredEntry[]
    }>({
      entries: [],
    }),
  )
  const [shellHistory, setShellHistory] = persisted(
    Persist.global("prompt-history-shell", ["prompt-history-shell.v1"]),
    createStore<{
      entries: PromptHistoryStoredEntry[]
    }>({
      entries: [],
    }),
  )

  const suggest = createMemo(() => !hasUserPrompt())

  const placeholder = createMemo(() =>
    promptPlaceholder({
      mode: store.mode,
      commentCount: commentCount(),
      example: suggest() ? language.t(EXAMPLES[store.placeholder]) : "",
      suggest: suggest(),
      t: (key, params) => language.t(key as Parameters<typeof language.t>[0], params as never),
    }),
  )

  const historyComments = () => {
    const byID = new Map(comments.all().map((item) => [`${item.file}\n${item.id}`, item] as const))
    return prompt.context.items().flatMap((item) => {
      if (item.type !== "file") return []
      const comment = item.comment?.trim()
      if (!comment) return []

      const selection = item.commentID ? byID.get(`${item.path}\n${item.commentID}`)?.selection : undefined
      const nextSelection =
        selection ??
        (item.selection
          ? ({
              start: item.selection.startLine,
              end: item.selection.endLine,
            } satisfies SelectedLineRange)
          : undefined)
      if (!nextSelection) return []

      return [
        {
          id: item.commentID ?? item.key,
          path: item.path,
          selection: { ...nextSelection },
          comment,
          time: item.commentID ? (byID.get(`${item.path}\n${item.commentID}`)?.time ?? Date.now()) : Date.now(),
          origin: item.commentOrigin,
          preview: item.preview,
        } satisfies PromptHistoryComment,
      ]
    })
  }

  const applyHistoryComments = (items: PromptHistoryComment[]) => {
    comments.replace(
      items.map((item) => ({
        id: item.id,
        file: item.path,
        selection: { ...item.selection },
        comment: item.comment,
        time: item.time,
      })),
    )
    prompt.context.replaceComments(
      items.map((item) => ({
        type: "file" as const,
        path: item.path,
        selection: selectionFromLines(item.selection),
        comment: item.comment,
        commentID: item.id,
        commentOrigin: item.origin,
        preview: item.preview,
      })),
    )
  }

  const applyHistoryPrompt = (entry: PromptHistoryEntry, position: "start" | "end") => {
    const p = entry.prompt
    const length = position === "start" ? 0 : promptLength(p)
    setStore("applyingHistory", true)
    applyHistoryComments(entry.comments)
    prompt.set(p, length)
    requestAnimationFrame(() => {
      editorRef.focus()
      setCursorPosition(editorRef, length)
      setStore("applyingHistory", false)
      queueScroll()
    })
  }

  const getCaretState = () => {
    const selection = window.getSelection()
    const textLength = promptLength(prompt.current())
    if (!selection || selection.rangeCount === 0) {
      return { collapsed: false, cursorPosition: 0, textLength }
    }
    const anchorNode = selection.anchorNode
    if (!anchorNode || !editorRef.contains(anchorNode)) {
      return { collapsed: false, cursorPosition: 0, textLength }
    }
    return {
      collapsed: selection.isCollapsed,
      cursorPosition: getCursorPosition(editorRef),
      textLength,
    }
  }

  const escBlur = () => platform.platform === "desktop" && platform.os === "macos"

  const pick = async () => {
    if (platform.openFilePickerDialog) {
      // Desktop: native file picker returns actual filesystem paths
      const result = await platform.openFilePickerDialog({ multiple: true }).catch(() => null)
      if (!result) return
      const paths = Array.isArray(result) ? result : [result]
      for (const p of paths) {
        void addAttachmentFromPath(p)
      }
    } else {
      fileInputRef?.click()
    }
  }

  const setMode = (mode: "normal" | "shell") => {
    setStore("mode", mode)
    setStore("popover", null)
    requestAnimationFrame(() => editorRef?.focus())
  }

  const shellModeKey = "mod+shift+x"
  const normalModeKey = "mod+shift+e"

  command.register("prompt-input", () => [
    {
      id: "file.attach",
      title: language.t("prompt.action.attachFile"),
      category: language.t("command.category.file"),
      keybind: "mod+u",
      disabled: store.mode !== "normal",
      onSelect: pick,
    },
    {
      id: "prompt.mode.shell",
      title: language.t("command.prompt.mode.shell"),
      category: language.t("command.category.session"),
      keybind: shellModeKey,
      disabled: store.mode === "shell",
      onSelect: () => setMode("shell"),
    },
    {
      id: "prompt.mode.normal",
      title: language.t("command.prompt.mode.normal"),
      category: language.t("command.category.session"),
      keybind: normalModeKey,
      disabled: store.mode === "normal",
      onSelect: () => setMode("normal"),
    },
  ])

  const closePopover = () => setStore("popover", null)

  const resetHistoryNavigation = (force = false) => {
    if (!force && (store.historyIndex < 0 || store.applyingHistory)) return
    setStore("historyIndex", -1)
    setStore("savedPrompt", null)
  }

  const clearEditor = () => {
    editorRef.innerHTML = ""
  }

  const setEditorText = (text: string) => {
    clearEditor()
    editorRef.textContent = text
  }

  const focusEditorEnd = () => {
    requestAnimationFrame(() => {
      editorRef.focus()
      const range = document.createRange()
      const selection = window.getSelection()
      range.selectNodeContents(editorRef)
      range.collapse(false)
      selection?.removeAllRanges()
      selection?.addRange(range)
    })
  }

  const currentCursor = () => {
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0 || !editorRef.contains(selection.anchorNode)) return null
    return getCursorPosition(editorRef)
  }

  const restoreFocus = () => {
    requestAnimationFrame(() => {
      const cursor = prompt.cursor() ?? promptLength(prompt.current())
      editorRef.focus()
      setCursorPosition(editorRef, cursor)
      queueScroll()
    })
  }

  const renderEditorWithCursor = (parts: Prompt) => {
    const cursor = currentCursor()
    renderEditor(parts)
    if (cursor !== null) setCursorPosition(editorRef, cursor)
  }

  createEffect(() => {
    params.id
    if (params.id) return
    if (!suggest()) return
    const interval = setInterval(() => {
      setStore("placeholder", (prev) => (prev + 1) % EXAMPLES.length)
    }, 6500)
    onCleanup(() => clearInterval(interval))
  })

  const [composing, setComposing] = createSignal(false)
  const isImeComposing = (event: KeyboardEvent) => event.isComposing || composing() || event.keyCode === 229

  const handleBlur = () => {
    closePopover()
    setComposing(false)
  }

  const handleCompositionStart = () => {
    setComposing(true)
  }

  const handleCompositionEnd = () => {
    setComposing(false)
    requestAnimationFrame(() => {
      if (composing()) return
      reconcile(prompt.current().filter((part) => part.type !== "image"))
    })
  }

  const agentList = createMemo(() =>
    sync.data.agent
      .filter((agent) => !agent.hidden && agent.mode !== "primary")
      .map((agent): AtOption => ({ type: "agent", name: agent.name, display: agent.name })),
  )
  const agentNames = createMemo(() => local.agent.list().map((agent) => agent.name))

  // Media already sitting in the composer, offered at the top of the @ menu so the
  // user can point at one of several attachments ("crop @shot.png").
  // Labelled `@image1` / `@video1` rather than by filename — a generated
  // filename is 80 unreadable characters and the position is what actually
  // identifies the attachment to the model. See media-labels.ts.
  const attachmentOptions = createMemo(() => {
    const attachments = imageAttachments()
    const labels = mediaLabels(attachments)
    return attachments.map(
      (attachment, index): AtOption => ({
        type: "image",
        id: attachment.id,
        display: labels[index]!,
        mime: attachment.mime,
        url: attachment.publicUrl ?? attachment.dataUrl,
      }),
    )
  })

  const handleAtSelect = (option: AtOption | undefined) => {
    if (!option) return
    if (option.type === "agent") {
      addPart({ type: "agent", name: option.name, content: "@" + option.name, start: 0, end: 0 })
    } else if (option.type === "image") {
      // Reference only — the attachment itself is already being sent, so this must not
      // become a file part (the backend would try to read it as text from disk).
      addPart({ type: "media", id: option.id, content: "@" + option.display, start: 0, end: 0 })
    } else if (option.type === "visual-dna" || option.type === "moodboard") {
      // "@name" / "#name" is the literal token kolbo-api's mention parsers resolve,
      // so the pill has to serialize back to exactly that.
      addPart({
        type: "kolbo-asset",
        kind: option.type,
        id: option.id,
        name: option.name,
        thumbnail: option.thumbnail,
        content: (option.type === "moodboard" ? "#" : "@") + option.name,
        start: 0,
        end: 0,
      })
    } else {
      addPart({ type: "file", path: option.path, content: "@" + option.path, start: 0, end: 0 })
    }
  }

  const atKey = (x: AtOption | undefined) => {
    if (!x) return ""
    if (x.type === "agent") return `agent:${x.name}`
    if (x.type === "image") return `image:${x.id}`
    if (x.type === "visual-dna") return `visual-dna:${x.id}`
    if (x.type === "moodboard") return `moodboard:${x.id}`
    return `file:${x.path}`
  }

  const {
    flat: atFlat,
    active: atActive,
    setActive: setAtActive,
    onInput: atOnInput,
    onKeyDown: atOnKeyDown,
  } = useFilteredList<AtOption>({
    items: async (query) => {
      // `#` is the moodboard namespace in kolbo-api's parser, so scope the menu to
      // moodboards alone rather than mixing them with files and agents.
      if (atTrigger() === "#") {
        return moodboards().map(
          (mb): AtOption => ({ type: "moodboard", id: mb.id, name: mb.name, display: mb.name, thumbnail: mb.thumbnail }),
        )
      }
      const attachments = attachmentOptions()
      const agents = agentList()
      const dnas: AtOption[] = visualDnas().map((dna) => ({
        type: "visual-dna",
        id: dna.id,
        name: dna.name,
        display: dna.name,
        thumbnail: dna.thumbnail,
        dnaType: dna.dnaType,
      }))
      const open = recent()
      const seen = new Set(open)
      const pinned: AtOption[] = open.map((path) => ({ type: "file", path, display: path, recent: true }))
      if (!query.trim()) return [...attachments, ...agents, ...dnas, ...pinned]
      const paths = await files.searchFilesAndDirectories(query)
      const fileOptions: AtOption[] = paths
        .filter((path) => !seen.has(path))
        .map((path) => ({ type: "file", path, display: path }))
      return [...attachments, ...agents, ...dnas, ...pinned, ...fileOptions]
    },
    key: atKey,
    filterKeys: ["display"],
    groupBy: (item) => {
      if (item.type === "image") return "image"
      if (item.type === "agent") return "agent"
      if (item.type === "visual-dna") return "visual-dna"
      if (item.type === "moodboard") return "moodboard"
      if (item.recent) return "recent"
      return "file"
    },
    sortGroupsBy: (a, b) => {
      const rank = (category: string) => {
        if (category === "image") return 0
        if (category === "agent") return 1
        if (category === "visual-dna" || category === "moodboard") return 2
        if (category === "recent") return 3
        return 4
      }
      return rank(a.category) - rank(b.category)
    },
    onSelect: handleAtSelect,
  })

  const slashCommands = createMemo<SlashCommand[]>(() => {
    const builtin = command.options
      .filter((opt) => !opt.disabled && !opt.id.startsWith("suggested.") && opt.slash)
      .map((opt) => ({
        id: opt.id,
        trigger: opt.slash!,
        title: opt.title,
        description: opt.description,
        keybind: opt.keybind,
        type: "builtin" as const,
      }))

    const custom = sync.data.command.map((cmd) => ({
      id: `custom.${cmd.name}`,
      trigger: cmd.name,
      title: cmd.name,
      description: cmd.description,
      type: "custom" as const,
      source: cmd.source,
    }))

    return [...custom, ...builtin]
  })

  const handleSlashSelect = (cmd: SlashCommand | undefined) => {
    if (!cmd) return
    promptProbe.select(cmd.id)
    closePopover()
    const images = imageAttachments()

    if (cmd.type === "custom") {
      const text = `/${cmd.trigger} `
      setEditorText(text)
      prompt.set([{ type: "text", content: text, start: 0, end: text.length }, ...images], text.length)
      focusEditorEnd()
      return
    }

    clearEditor()
    prompt.set([...DEFAULT_PROMPT, ...images], 0)
    command.trigger(cmd.id, "slash")
  }

  const {
    flat: slashFlat,
    active: slashActive,
    setActive: setSlashActive,
    onInput: slashOnInput,
    onKeyDown: slashOnKeyDown,
  } = useFilteredList<SlashCommand>({
    items: slashCommands,
    key: (x) => x?.id,
    filterKeys: ["trigger", "title"],
    onSelect: handleSlashSelect,
  })

  // The media library already exists as a canvas tab — reuse it rather than
  // building a second picker. `kolbo:open-canvas` is the same event the Canvas
  // button fires, so it also clears the "dismissed" flag and opens the panel.
  const openMediaLibrary = () => {
    view().canvas.setMode("library")
    document.dispatchEvent(new CustomEvent("kolbo:open-canvas"))
  }

  const openKolboAssets = (initialTab: "visual-dna" | "global-dna" | "moodboard") =>
    dialog.show(() => (
      <DialogSelectKolboAsset
        visualDnas={visualDnas()}
        moodboards={moodboards()}
        globalDnas={globalDnas()}
        globalLoading={globalDnasLoading()}
        onNeedGlobal={loadGlobalDnas}
        initialTab={initialTab}
        onSelect={(kind, item) =>
          handleAtSelect({
            type: kind,
            id: item.id,
            name: item.name,
            display: item.name,
            thumbnail: item.thumbnail,
            ...(kind === "visual-dna" ? { dnaType: item.dnaType } : {}),
          })
        }
      />
    ))

  // The picture a mention points at, when there is one. Visual DNAs and
  // moodboards carry their own thumbnail; an attachment mention has to look its
  // image back up, since MediaMentionPart only stores the id.
  const pillThumbnail = (part: FileAttachmentPart | AgentPart | MediaMentionPart | KolboAssetPart) => {
    if (part.type === "kolbo-asset") return part.thumbnail
    if (part.type !== "media") return undefined
    const attachment = imageAttachments().find((item) => item.id === part.id)
    // Only stills — a <video> inside the contenteditable is more trouble than a
    // first frame is worth, and "@video1" already says what it is.
    if (!attachment?.mime.startsWith("image/")) return undefined
    return attachment.publicUrl ?? attachment.dataUrl
  }

  const createPill = (part: FileAttachmentPart | AgentPart | MediaMentionPart | KolboAssetPart) => {
    const pill = document.createElement("span")
    pill.setAttribute("data-type", part.type)
    if (part.type === "file") pill.setAttribute("data-path", part.path)
    if (part.type === "agent") pill.setAttribute("data-name", part.name)
    if (part.type === "media") pill.setAttribute("data-id", part.id)
    if (part.type === "kolbo-asset") {
      pill.setAttribute("data-id", part.id)
      pill.setAttribute("data-name", part.name)
      pill.setAttribute("data-kind", part.kind)
      if (part.thumbnail) pill.setAttribute("data-thumbnail", part.thumbnail)
    }

    // A mention that points at a picture shows the picture — same chip language
    // as kolbo-map's prompt editor. parseFromDOM reads pills back through
    // `textContent` and never descends into them, so the nested <img> (which
    // contributes no text) round-trips cleanly; the label stays the only text.
    const thumbnail = pillThumbnail(part)
    if (thumbnail) {
      pill.dir = "ltr"
      pill.style.cssText =
        "display:inline-flex;align-items:center;gap:4px;vertical-align:middle;" +
        "padding:1px 7px 1px 2px;border-radius:999px;" +
        "border:1px solid var(--border-weaker-base);background:var(--surface-recess-base)"
      // The thumbnail doubles as the remove target: hover it and an X covers the
      // face, same gesture as kolbo-map's chips. Backspacing a pill out of a
      // contenteditable is fiddly and invisible; this is the obvious way.
      const face = document.createElement("span")
      face.style.cssText = "position:relative;display:inline-flex;width:16px;height:16px;flex-shrink:0"

      const image = document.createElement("img")
      image.src = thumbnail
      image.alt = ""
      image.draggable = false
      image.referrerPolicy = "no-referrer"
      image.style.cssText =
        "width:16px;height:16px;border-radius:50%;object-fit:cover;flex-shrink:0;background:var(--surface-base)"
      // A dead blob:/expired CDN URL must not leave the browser's broken-image
      // glyph sitting in the composer — drop back to the plain text pill.
      image.onerror = () => {
        face.remove()
        pill.style.padding = ""
        pill.style.border = ""
        pill.style.background = ""
        pill.style.borderRadius = ""
      }
      face.appendChild(image)

      const remove = document.createElement("button")
      remove.type = "button"
      remove.setAttribute("aria-label", language.t("prompt.attachment.remove"))
      remove.setAttribute("contenteditable", "false")
      // An SVG, NOT a text "×": parseFromDOM reads a pill back through
      // `textContent`, so a text glyph here rode along into the prompt and the
      // model received "×@tel_aviv_invasion". SVG contributes no text.
      remove.innerHTML =
        '<svg width="9" height="9" viewBox="0 0 10 10" fill="none" aria-hidden="true">' +
        '<path d="M1.5 1.5 8.5 8.5M8.5 1.5 1.5 8.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>' +
        "</svg>"
      remove.style.cssText =
        "position:absolute;inset:0;display:none;align-items:center;justify-content:center;" +
        "border:0;padding:0;cursor:pointer;border-radius:50%;color:#fff;font-size:12px;line-height:1;" +
        "background:rgba(0,0,0,0.65)"
      // mousedown, not click: the editor's own mousedown would move the caret
      // and re-render the pill out from under the click.
      remove.onmousedown = (event) => {
        event.preventDefault()
        event.stopPropagation()
        pill.remove()
        handleInput()
        focusEditorEnd()
      }
      face.appendChild(remove)
      face.onmouseenter = () => (remove.style.display = "flex")
      face.onmouseleave = () => (remove.style.display = "none")

      pill.appendChild(face)
      const label = document.createElement("span")
      label.textContent = part.content
      pill.appendChild(label)
    } else {
      pill.textContent = part.content
    }

    pill.setAttribute("contenteditable", "false")
    pill.style.userSelect = "text"
    pill.style.cursor = "default"
    return pill
  }

  const isNormalizedEditor = () =>
    Array.from(editorRef.childNodes).every((node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent ?? ""
        if (!text.includes("\u200B")) return true
        if (text !== "\u200B") return false

        const prev = node.previousSibling
        const next = node.nextSibling
        const prevIsBr = prev?.nodeType === Node.ELEMENT_NODE && (prev as HTMLElement).tagName === "BR"
        return !!prevIsBr && !next
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return false
      const el = node as HTMLElement
      if (el.dataset.type === "file") return true
      if (el.dataset.type === "agent") return true
      if (el.dataset.type === "media") return true
      if (el.dataset.type === "kolbo-asset") return true
      return el.tagName === "BR"
    })

  const renderEditor = (parts: Prompt) => {
    clearEditor()
    for (const part of parts) {
      if (part.type === "text") {
        editorRef.appendChild(createTextFragment(part.content))
        continue
      }
      if (part.type === "file" || part.type === "agent" || part.type === "media" || part.type === "kolbo-asset") {
        editorRef.appendChild(createPill(part))
      }
    }

    const last = editorRef.lastChild
    if (last?.nodeType === Node.ELEMENT_NODE && (last as HTMLElement).tagName === "BR") {
      editorRef.appendChild(document.createTextNode("\u200B"))
    }
  }

  // Auto-scroll active command into view when navigating with keyboard
  createEffect(() => {
    const activeId = slashActive()
    if (!activeId || !slashPopoverRef) return

    requestAnimationFrame(() => {
      const element = slashPopoverRef.querySelector(`[data-slash-id="${activeId}"]`)
      element?.scrollIntoView({ block: "nearest", behavior: "smooth" })
    })
  })

  if (promptEnabled()) {
    createEffect(() => {
      promptProbe.set({
        popover: store.popover,
        slash: {
          active: slashActive() ?? null,
          ids: slashFlat().map((cmd) => cmd.id),
        },
      })
    })

    onCleanup(() => promptProbe.clear())
  }

  const selectPopoverActive = () => {
    if (store.popover === "at") {
      const items = atFlat()
      if (items.length === 0) return
      const active = atActive()
      const item = items.find((entry) => atKey(entry) === active) ?? items[0]
      handleAtSelect(item)
      return
    }

    if (store.popover === "slash") {
      const items = slashFlat()
      if (items.length === 0) return
      const active = slashActive()
      const item = items.find((entry) => entry.id === active) ?? items[0]
      handleSlashSelect(item)
    }
  }

  const reconcile = (input: Prompt) => {
    if (mirror.input) {
      mirror.input = false
      if (isNormalizedEditor()) return

      renderEditorWithCursor(input)
      return
    }

    const dom = parseFromDOM()
    if (isNormalizedEditor() && isPromptEqual(input, dom)) return

    renderEditorWithCursor(input)
  }

  createEffect(
    on(
      () => prompt.current(),
      (parts) => {
        if (composing()) return
        reconcile(parts.filter((part) => part.type !== "image"))
      },
    ),
  )

  const parseFromDOM = (): Prompt => {
    const parts: Prompt = []
    let position = 0
    let buffer = ""

    const flushText = () => {
      let content = buffer
      if (content.includes("\r")) content = content.replace(/\r\n?/g, "\n")
      if (content.includes("\u200B")) content = content.replace(/\u200B/g, "")
      buffer = ""
      if (!content) return
      parts.push({ type: "text", content, start: position, end: position + content.length })
      position += content.length
    }

    const pushFile = (file: HTMLElement) => {
      const content = file.textContent ?? ""
      parts.push({
        type: "file",
        path: file.dataset.path!,
        content,
        start: position,
        end: position + content.length,
      })
      position += content.length
    }

    const pushAgent = (agent: HTMLElement) => {
      const content = agent.textContent ?? ""
      parts.push({
        type: "agent",
        name: agent.dataset.name!,
        content,
        start: position,
        end: position + content.length,
      })
      position += content.length
    }

    const pushMedia = (media: HTMLElement) => {
      const content = media.textContent ?? ""
      parts.push({
        type: "media",
        id: media.dataset.id!,
        content,
        start: position,
        end: position + content.length,
      })
      position += content.length
    }

    const visit = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        buffer += node.textContent ?? ""
        return
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return

      const el = node as HTMLElement
      if (el.dataset.type === "file") {
        flushText()
        pushFile(el)
        return
      }
      if (el.dataset.type === "agent") {
        flushText()
        pushAgent(el)
        return
      }
      if (el.dataset.type === "kolbo-asset") {
        flushText()
        const content = el.textContent ?? ""
        parts.push({
          type: "kolbo-asset",
          kind: el.dataset.kind === "moodboard" ? "moodboard" : "visual-dna",
          id: el.dataset.id!,
          name: el.dataset.name!,
          thumbnail: el.dataset.thumbnail,
          content,
          start: position,
          end: position + content.length,
        })
        position += content.length
        return
      }
      if (el.dataset.type === "media") {
        flushText()
        pushMedia(el)
        return
      }
      if (el.tagName === "BR") {
        buffer += "\n"
        return
      }

      for (const child of Array.from(el.childNodes)) {
        visit(child)
      }
    }

    const children = Array.from(editorRef.childNodes)
    children.forEach((child, index) => {
      const isBlock = child.nodeType === Node.ELEMENT_NODE && ["DIV", "P"].includes((child as HTMLElement).tagName)
      visit(child)
      if (isBlock && index < children.length - 1) {
        buffer += "\n"
      }
    })

    flushText()

    if (parts.length === 0) parts.push(...DEFAULT_PROMPT)
    return parts
  }

  const handleInput = () => {
    const rawParts = parseFromDOM()
    const images = imageAttachments()
    const cursorPosition = getCursorPosition(editorRef)
    const rawText =
      rawParts.length === 1 && rawParts[0]?.type === "text"
        ? rawParts[0].content
        : rawParts.map((p) => ("content" in p ? p.content : "")).join("")
    const hasNonText = rawParts.some((part) => part.type !== "text")
    const shouldReset = !NON_EMPTY_TEXT.test(rawText) && !hasNonText && images.length === 0

    // Dynamic RTL/LTR detection
    if (editorRef) {
      const dir = rawText ? detectTextDirection(rawText) : "ltr"
      editorRef.style.setProperty("direction", dir, "important")
      editorRef.style.setProperty("text-align", dir === "rtl" ? "right" : "left", "important")
    }

    if (shouldReset) {
      closePopover()
      resetHistoryNavigation()
      if (prompt.dirty()) {
        mirror.input = true
        prompt.set(DEFAULT_PROMPT, 0)
      }
      queueScroll()
      return
    }

    const shellMode = store.mode === "shell"

    if (!shellMode) {
      const mention = matchMentionTrigger(rawText.substring(0, cursorPosition), moodboards().length > 0)
      const slashMatch = rawText.match(/^\/(\S*)$/)

      if (mention) {
        setAtTrigger(mention.trigger)
        atOnInput(mention.query)
        setStore("popover", "at")
      } else if (slashMatch) {
        slashOnInput(slashMatch[1])
        setStore("popover", "slash")
      } else {
        closePopover()
      }
    } else {
      closePopover()
    }

    resetHistoryNavigation()

    mirror.input = true
    prompt.set([...rawParts, ...images], cursorPosition)
    queueScroll()
  }

  const addPart = (part: ContentPart) => {
    if (part.type === "image") return false

    const selection = window.getSelection()
    if (!selection) return false

    if (selection.rangeCount === 0 || !editorRef.contains(selection.anchorNode)) {
      editorRef.focus()
      const cursor = prompt.cursor() ?? promptLength(prompt.current())
      setCursorPosition(editorRef, cursor)
    }

    if (selection.rangeCount === 0) return false
    const range = selection.getRangeAt(0)
    if (!editorRef.contains(range.startContainer)) return false

    const selectMention = () => {
      const cursorPosition = getCursorPosition(editorRef)
      const rawText = prompt
        .current()
        .map((p) => ("content" in p ? p.content : ""))
        .join("")
      // Consume the token actually typed — `#query` for moodboards, `@query`
      // otherwise — so the trigger character is replaced, not left behind.
      const atMatch = rawText.substring(0, cursorPosition).match(mentionTokenPattern(part.type === "kolbo-asset" ? part.kind : part.type))
      if (!atMatch) return
      const start = atMatch.index ?? cursorPosition - atMatch[0].length
      setRangeEdge(editorRef, range, "start", start)
      setRangeEdge(editorRef, range, "end", cursorPosition)
    }

    if (part.type === "file" || part.type === "agent" || part.type === "media" || part.type === "kolbo-asset") {
      const pill = createPill(part)
      const gap = document.createTextNode(" ")

      selectMention()

      range.deleteContents()
      range.insertNode(gap)
      range.insertNode(pill)
      range.setStartAfter(gap)
      range.collapse(true)
      selection.removeAllRanges()
      selection.addRange(range)
    }

    if (part.type === "text") {
      const fragment = createTextFragment(part.content)
      const last = fragment.lastChild
      range.deleteContents()
      range.insertNode(fragment)
      if (last) {
        if (last.nodeType === Node.TEXT_NODE) {
          const text = last.textContent ?? ""
          if (text === "\u200B") {
            range.setStart(last, 0)
          }
          if (text !== "\u200B") {
            range.setStart(last, text.length)
          }
        }
        if (last.nodeType !== Node.TEXT_NODE) {
          const isBreak = last.nodeType === Node.ELEMENT_NODE && (last as HTMLElement).tagName === "BR"
          const next = last.nextSibling
          const emptyText = next?.nodeType === Node.TEXT_NODE && (next.textContent ?? "") === ""
          if (isBreak && (!next || emptyText)) {
            const placeholder = next && emptyText ? next : document.createTextNode("\u200B")
            if (!next) last.parentNode?.insertBefore(placeholder, null)
            placeholder.textContent = "\u200B"
            range.setStart(placeholder, 0)
          } else {
            range.setStartAfter(last)
          }
        }
      }
      range.collapse(true)
      selection.removeAllRanges()
      selection.addRange(range)
    }

    handleInput()
    closePopover()
    return true
  }

  const addToHistory = (prompt: Prompt, mode: "normal" | "shell") => {
    const currentHistory = mode === "shell" ? shellHistory : history
    const setCurrentHistory = mode === "shell" ? setShellHistory : setHistory
    const next = prependHistoryEntry(currentHistory.entries, prompt, mode === "shell" ? [] : historyComments())
    if (next === currentHistory.entries) return
    setCurrentHistory("entries", next)
  }

  createEffect(
    on(
      () => props.edit?.id,
      (id) => {
        const edit = props.edit
        if (!id || !edit) return

        for (const item of prompt.context.items()) {
          prompt.context.remove(item.key)
        }

        for (const item of edit.context) {
          prompt.context.add({
            type: item.type,
            path: item.path,
            selection: item.selection,
            comment: item.comment,
            commentID: item.commentID,
            commentOrigin: item.commentOrigin,
            preview: item.preview,
          })
        }

        setStore("mode", "normal")
        setStore("popover", null)
        setStore("historyIndex", -1)
        setStore("savedPrompt", null)
        prompt.set(edit.prompt, promptLength(edit.prompt))
        requestAnimationFrame(() => {
          editorRef.focus()
          setCursorPosition(editorRef, promptLength(edit.prompt))
          queueScroll()
        })
        props.onEditLoaded?.()
      },
      { defer: true },
    ),
  )

  const navigateHistory = (direction: "up" | "down") => {
    const result = navigatePromptHistory({
      direction,
      entries: store.mode === "shell" ? shellHistory.entries : history.entries,
      historyIndex: store.historyIndex,
      currentPrompt: prompt.current(),
      currentComments: historyComments(),
      savedPrompt: store.savedPrompt,
    })
    if (!result.handled) return false
    setStore("historyIndex", result.historyIndex)
    setStore("savedPrompt", result.savedPrompt)
    applyHistoryPrompt(result.entry, result.cursor)
    return true
  }

  const { addAttachments, addAttachmentFromPath, removeAttachment, retryAttachment, handlePaste, handleDragOver, handleDragLeave, handleDrop } = createPromptAttachments({
    editor: () => editorRef,
    isDialogActive: () => !!dialog.active,
    setDraggingType: (type) => setStore("draggingType", type),
    focusEditor: () => {
      editorRef.focus()
      setCursorPosition(editorRef, promptLength(prompt.current()))
    },
    addPart,
    readClipboardImage: platform.readClipboardImage,
    serverUrl: () => server.current?.http.url,
  })

  const variants = createMemo(() => ["default", ...local.model.variant.list()])
  const accepting = createMemo(() => {
    const id = params.id
    if (!id) return permission.isAutoAcceptingDirectory(sdk.directory)
    return permission.isAutoAccepting(id, sdk.directory)
  })

  const { abort, handleSubmit: submitPrompt } = createPromptSubmit({
    info,
    imageAttachments,
    commentCount,
    autoAccept: () => accepting(),
    mode: () => store.mode,
    working,
    editor: () => editorRef,
    queueScroll,
    promptLength,
    addToHistory,
    resetHistoryNavigation: () => {
      resetHistoryNavigation(true)
    },
    setMode: (mode) => setStore("mode", mode),
    setPopover: (popover) => setStore("popover", popover),
    newSessionWorktree: () => props.newSessionWorktree,
    onNewSessionWorktreeReset: props.onNewSessionWorktreeReset,
    busy: props.busy,
    onAbort: props.onAbort,
    onSubmit: props.onSubmit,
  })

  // Sending closes the mic. Typing while recording is fine — you can dictate
  // and correct at the same time — but hitting send means "this is the
  // message", so a mic left hot would dribble the next sentence into an empty
  // composer with no visible reason.
  const handleSubmit = (event: Event) => {
    if (dictating()) {
      dictationSilenced = true
      dictation.stop()
    }
    return submitPrompt(event)
  }

  const handleKeyDown = (event: KeyboardEvent) => {
    if ((event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "u") {
      event.preventDefault()
      if (store.mode !== "normal") return
      pick()
      return
    }

    if (event.key === "Backspace") {
      const selection = window.getSelection()
      if (selection && selection.isCollapsed) {
        const node = selection.anchorNode
        const offset = selection.anchorOffset
        if (node && node.nodeType === Node.TEXT_NODE) {
          const text = node.textContent ?? ""
          if (/^\u200B+$/.test(text) && offset > 0) {
            const range = document.createRange()
            range.setStart(node, 0)
            range.collapse(true)
            selection.removeAllRanges()
            selection.addRange(range)
          }
        }
      }
    }

    if (event.key === "!" && store.mode === "normal") {
      const cursorPosition = getCursorPosition(editorRef)
      if (cursorPosition === 0) {
        setStore("mode", "shell")
        setStore("popover", null)
        event.preventDefault()
        return
      }
    }

    if (event.key === "Escape") {
      if (store.popover) {
        closePopover()
        event.preventDefault()
        event.stopPropagation()
        return
      }

      if (store.mode === "shell") {
        setStore("mode", "normal")
        event.preventDefault()
        event.stopPropagation()
        return
      }

      if (working()) {
        abort()
        event.preventDefault()
        event.stopPropagation()
        return
      }

      if (escBlur()) {
        editorRef.blur()
        event.preventDefault()
        event.stopPropagation()
        return
      }
    }

    if (store.mode === "shell") {
      const { collapsed, cursorPosition, textLength } = getCaretState()
      if (event.key === "Backspace" && collapsed && cursorPosition === 0 && textLength === 0) {
        setStore("mode", "normal")
        event.preventDefault()
        return
      }
    }

    // Handle Shift+Enter BEFORE IME check - Shift+Enter is never used for IME input
    // and should always insert a newline regardless of composition state
    if (event.key === "Enter" && event.shiftKey) {
      addPart({ type: "text", content: "\n", start: 0, end: 0 })
      event.preventDefault()
      return
    }

    if (event.key === "Enter" && isImeComposing(event)) {
      return
    }

    const ctrl = event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey

    if (store.popover) {
      if (event.key === "Tab") {
        selectPopoverActive()
        event.preventDefault()
        return
      }
      const nav = event.key === "ArrowUp" || event.key === "ArrowDown" || event.key === "Enter"
      const ctrlNav = ctrl && (event.key === "n" || event.key === "p")
      if (nav || ctrlNav) {
        if (store.popover === "at") {
          atOnKeyDown(event)
          event.preventDefault()
          return
        }
        if (store.popover === "slash") {
          slashOnKeyDown(event)
        }
        event.preventDefault()
        return
      }
    }

    if (ctrl && event.code === "KeyG") {
      if (store.popover) {
        closePopover()
        event.preventDefault()
        return
      }
      if (working()) {
        abort()
        event.preventDefault()
      }
      return
    }

    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      if (event.altKey || event.ctrlKey || event.metaKey) return
      const { collapsed } = getCaretState()
      if (!collapsed) return

      const cursorPosition = getCursorPosition(editorRef)
      const textContent = prompt
        .current()
        .map((part) => ("content" in part ? part.content : ""))
        .join("")
      const direction = event.key === "ArrowUp" ? "up" : "down"
      if (!canNavigateHistoryAtCursor(direction, textContent, cursorPosition, store.historyIndex >= 0)) return
      if (navigateHistory(direction)) {
        event.preventDefault()
      }
      return
    }

    // Note: Shift+Enter is handled earlier, before IME check
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault()
      if (event.repeat) return
      if (isUploadingAttachment()) return
      if (
        working() &&
        prompt
          .current()
          .map((part) => ("content" in part ? part.content : ""))
          .join("")
          .trim().length === 0 &&
        imageAttachments().length === 0 &&
        commentCount() === 0
      ) {
        return
      }
      handleSubmit(event)
    }
  }

  return (
    <div class="relative size-full _max-h-[320px] flex flex-col gap-0">
      <PromptPopover
        popover={store.popover}
        setSlashPopoverRef={(el) => (slashPopoverRef = el)}
        atFlat={atFlat()}
        atActive={atActive() ?? undefined}
        atKey={atKey}
        setAtActive={setAtActive}
        onAtSelect={handleAtSelect}
        slashFlat={slashFlat()}
        slashActive={slashActive() ?? undefined}
        setSlashActive={setSlashActive}
        onSlashSelect={handleSlashSelect}
        commandKeybind={command.keybind}
        t={(key) => language.t(key as Parameters<typeof language.t>[0])}
      />
      <DockShellForm
        onSubmit={handleSubmit}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        // Marker for the document-level drop handler: only drops whose
        // target lives inside this form should actually attach files to
        // the prompt. Drops anywhere else on the page get swallowed (to
        // prevent the browser navigating) but do not produce attachments.
        data-prompt-drop-target=""
        classList={{
          "group/prompt-input": true,
          "focus-within:shadow-xs-border": true,
          "border-icon-info-active border-dashed": store.draggingType !== null,
          [props.class ?? ""]: !!props.class,
        }}
      >
        <PromptDragOverlay
          type={store.draggingType}
          label={language.t(store.draggingType === "@mention" ? "prompt.dropzone.file.label" : "prompt.dropzone.label")}
        />
        <PromptContextItems
          items={contextItems()}
          active={(item) => {
            const active = comments.active()
            return !!item.commentID && item.commentID === active?.id && item.path === active?.file
          }}
          openComment={openComment}
          remove={(item) => {
            if (item.commentID) comments.remove(item.path, item.commentID)
            prompt.context.remove(item.key)
          }}
          t={(key) => language.t(key as Parameters<typeof language.t>[0])}
        />
        <PromptImageAttachments
          attachments={imageAttachments()}
          onOpen={(attachment) =>
            dialog.show(() => <ImagePreview src={attachment.dataUrl} alt={attachment.filename} />)
          }
          onRemove={removeAttachment}
          onRetry={retryAttachment}
          removeLabel={language.t("prompt.attachment.remove")}
        />
        <div
          class="relative"
          onMouseDown={(e) => {
            const target = e.target
            if (!(target instanceof HTMLElement)) return
            if (target.closest('[data-action="prompt-attach"], [data-action="prompt-submit"]')) {
              return
            }
            editorRef?.focus()
          }}
        >
          <div
            class="relative max-h-[240px] overflow-y-auto no-scrollbar"
            ref={(el) => (scrollRef = el)}
            style={{ "scroll-padding-bottom": space }}
          >
            <div
              data-component="prompt-input"
              ref={(el) => {
                editorRef = el
                props.ref?.(el)
              }}
              role="textbox"
              aria-multiline="true"
              aria-label={placeholder()}
              contenteditable="true"
              autocapitalize={store.mode === "normal" ? "sentences" : "off"}
              autocorrect={store.mode === "normal" ? "on" : "off"}
              spellcheck={store.mode === "normal"}
              inputMode="text"
              // @ts-expect-error
              autocomplete="off"
              onInput={handleInput}
              onPaste={handlePaste}
              onCompositionStart={handleCompositionStart}
              onCompositionEnd={handleCompositionEnd}
              onBlur={handleBlur}
              onKeyDown={handleKeyDown}
              classList={{
                "select-text": true,
                "w-full pl-3 pr-2 pt-2 text-14-regular text-text-strong focus:outline-none whitespace-pre-wrap": true,
                "[&_[data-type=file]]:text-syntax-property": true,
                "[&_[data-type=agent]]:text-syntax-type": true,
                "[&_[data-type=media]]:text-syntax-string": true,
                "font-mono!": store.mode === "shell",
              }}
              style={{ "padding-bottom": space }}
            />
            <Show when={!prompt.dirty()}>
              {/* Nudged 3px past the editor's own pl-3: an empty contenteditable
                  parks the caret at exactly pl-3, so at rest the caret was drawn
                  straight through the "A" of the placeholder. The offset only
                  applies while the placeholder is visible — typed text still
                  starts at pl-3 — so nothing shifts as you type. Weaker text
                  colour too, so the placeholder reads as a hint rather than
                  competing with real content. */}
              <div
                class="absolute top-0 inset-x-0 pl-[15px] pr-2 pt-2 text-14-regular text-text-weaker pointer-events-none whitespace-nowrap truncate"
                classList={{ "font-mono!": store.mode === "shell" }}
                style={{ "padding-bottom": space }}
              >
                {placeholder()}
              </div>
            </Show>
          </div>

          <div
            aria-hidden="true"
            class="pointer-events-none absolute inset-x-0 bottom-0"
            style={{
              height: space,
              background:
                "linear-gradient(to top, var(--surface-raised-stronger-non-alpha) calc(100% - 20px), transparent)",
            }}
          />

          <div dir="ltr" class="pointer-events-none absolute bottom-2 right-2 flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={ACCEPTED_FILE_TYPES.join(",")}
              class="hidden"
              onChange={(e) => {
                const list = e.currentTarget.files
                if (list) void addAttachments(Array.from(list))
                e.currentTarget.value = ""
              }}
            />

            {/* Approval mode sits with the send button, not with the model.
                Picking a model is a setup choice; choosing Ask / Auto-Approve
                is part of the act of sending, so it belongs where your eye and
                cursor already are at that moment. Model stays bottom-left. */}
            <div class="pointer-events-auto">
            <div data-component="prompt-agent-control">
              <TooltipKeybind
                placement="top"
                gutter={4}
                title={language.t("command.agent.cycle")}
                keybind={command.keybind("agent.cycle")}
              >
                {/* top-end, not top-start: the control now sits at the right
                    edge, so a start-aligned menu would hang off the panel. */}
                <DropdownMenu gutter={4} placement="top-end">
                  <DropdownMenu.Trigger
                    as={Button}
                    variant="ghost"
                    size="normal"
                    class="capitalize max-w-[160px] text-text-base text-13-regular"
                    style={control()}
                    data-action="prompt-agent"
                  >
                    <Icon
                      name={agentIcon(local.agent.current()?.name)}
                      size="small"
                      class="shrink-0"
                    />
                    <span class="truncate">{local.agent.current()?.name ?? ""}</span>
                    <Icon name="chevron-down" size="small" class="shrink-0" />
                  </DropdownMenu.Trigger>
                  <DropdownMenu.Portal>
                    <DropdownMenu.Content class="min-w-[200px]">
                      <DropdownMenu.RadioGroup
                        value={local.agent.current()?.name ?? ""}
                        onChange={(value) => {
                          if (typeof value === "string") local.agent.set(value)
                          restoreFocus()
                        }}
                      >
                        {/* closeOnSelect: Kobalte defaults RadioItem to false so
                            multi-toggle menus can stay open. Picking an agent is a
                            single choice, so the menu has to dismiss itself —
                            without it the menu stayed open over the composer after
                            switching Build/Plan. */}
                        <For each={agentNames()}>
                          {(name) => (
                            <DropdownMenu.RadioItem value={name} closeOnSelect onSelect={restoreFocus}>
                              <Icon name={agentIcon(name)} size="small" class="shrink-0 text-text-weak" />
                              <DropdownMenu.ItemLabel class="capitalize">{name}</DropdownMenu.ItemLabel>
                              <DropdownMenu.ItemIndicator>
                                <Icon name="check-small" size="small" class="text-icon-weak" />
                              </DropdownMenu.ItemIndicator>
                            </DropdownMenu.RadioItem>
                          )}
                        </For>
                      </DropdownMenu.RadioGroup>
                    </DropdownMenu.Content>
                  </DropdownMenu.Portal>
                </DropdownMenu>
              </TooltipKeybind>
            </div>
            </div>
            <div class="flex items-center gap-1 pointer-events-auto">
              <Tooltip
                placement="top"
                inactive={!working() && blank() && !isUploadingAttachment()}
                value={isUploadingAttachment() ? language.t("prompt.action.uploading") : tip()}
              >
                {(() => {
                  const sendDisabled = createMemo(
                    () => store.mode !== "normal" || (!working() && blank()) || isUploadingAttachment(),
                  )
                  // Theme-aware fill: blue accent in dark mode, near-black
                  // in light mode. Each tuple is [base, hover].
                  const palette = createMemo(() =>
                    isDark()
                      ? {
                          base: "rgb(56,139,253)", // bright blue
                          hover: "rgb(28,116,232)",
                          shadow:
                            "0 1px 2px rgba(0,0,0,0.10), 0 6px 16px rgba(56,139,253,0.40)",
                          shadowHover:
                            "0 1px 2px rgba(0,0,0,0.12), 0 8px 20px rgba(56,139,253,0.55)",
                        }
                      : {
                          base: "rgb(20,20,22)",
                          hover: "rgb(0,0,0)",
                          shadow: "0 1px 2px rgba(0,0,0,0.06), 0 6px 14px rgba(0,0,0,0.22)",
                          shadowHover:
                            "0 1px 2px rgba(0,0,0,0.08), 0 8px 18px rgba(0,0,0,0.30)",
                        },
                  )
                  return (
                    <button
                      data-action="prompt-submit"
                      type="submit"
                      disabled={sendDisabled()}
                      tabIndex={store.mode === "normal" ? undefined : -1}
                      aria-label={
                        stopping() ? language.t("prompt.action.stop") : language.t("prompt.action.send")
                      }
                      class="group/sendbtn flex items-center justify-center size-9 rounded-full disabled:cursor-not-allowed enabled:hover:scale-[1.06] enabled:active:scale-95"
                      style={{
                        ...buttons(),
                        opacity: buttonsSpring() * (sendDisabled() ? 0.35 : 1),
                        background: palette().base,
                        color: "#fff",
                        "box-shadow": palette().shadow,
                        transition: "transform 0.15s ease, opacity 0.18s ease, box-shadow 0.18s ease, background-color 0.18s ease",
                      }}
                      onMouseOver={(e) => {
                        if (sendDisabled()) return
                        e.currentTarget.style.background = palette().hover
                        e.currentTarget.style.boxShadow = palette().shadowHover
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.background = palette().base
                        e.currentTarget.style.boxShadow = palette().shadow
                      }}
                    >
                      <Show
                        when={stopping()}
                        fallback={
                          <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                            <path
                              d="M10 16V4M4.5 9.5L10 4l5.5 5.5"
                              stroke="currentColor"
                              stroke-width="2.4"
                              stroke-linecap="round"
                              stroke-linejoin="round"
                            />
                          </svg>
                        }
                      >
                        <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true">
                          <rect x="3" y="3" width="10" height="10" rx="1.5" fill="currentColor" />
                        </svg>
                      </Show>
                    </button>
                  )
                })()}
              </Tooltip>
            </div>
          </div>

          <div dir="ltr" class="pointer-events-none absolute bottom-2 left-2">
            <div
              aria-hidden={store.mode !== "normal"}
              class="pointer-events-auto flex items-center gap-1"
              style={{
                "pointer-events": buttonsSpring() > 0.5 ? "auto" : "none",
              }}
            >
              {/* `+` is the one "add something" affordance, so everything you can
                  add hangs off it: a local file, something already in the media
                  library, a Visual DNA, a moodboard. Typing `@` still works and
                  is faster once you know the name — this is the browsable way in,
                  which is what a DNA (a *look*, not a word) actually needs. */}
              <TooltipKeybind
                placement="top"
                title={language.t("prompt.action.add")}
                keybind={command.keybind("file.attach")}
              >
                <DropdownMenu gutter={4} placement="top-start">
                  <DropdownMenu.Trigger
                    as={Button}
                    data-action="prompt-attach"
                    type="button"
                    variant="ghost"
                    class="size-8 p-0"
                    style={buttons()}
                    disabled={store.mode !== "normal"}
                    tabIndex={store.mode === "normal" ? undefined : -1}
                    aria-label={language.t("prompt.action.add")}
                  >
                    <Icon name="plus" class="size-4.5" />
                  </DropdownMenu.Trigger>
                  <DropdownMenu.Portal>
                    {/* Inline padding, not a class: the shared dropdown CSS sets
                        `padding: 4px 8px` on [data-slot], which a utility class
                        loses to. These rows are the composer's main entry point,
                        so they get room to breathe. */}
                    <DropdownMenu.Content class="min-w-[240px]">
                      <DropdownMenu.Item onSelect={() => pick()} style={{ padding: "9px 10px" }}>
                        <Icon name="cloud-upload" size="small" class="shrink-0 text-text-weak" />
                        <DropdownMenu.ItemLabel>{language.t("prompt.action.attachFile")}</DropdownMenu.ItemLabel>
                      </DropdownMenu.Item>
                      <DropdownMenu.Item onSelect={openMediaLibrary} style={{ padding: "9px 10px" }}>
                        <Icon name="photo" size="small" class="shrink-0 text-text-weak" />
                        <DropdownMenu.ItemLabel>{language.t("prompt.action.mediaLibrary")}</DropdownMenu.ItemLabel>
                      </DropdownMenu.Item>
                      {/* Not gated on having DNAs of your own — the global
                          catalog lives inside this dialog as a tab, so hiding the
                          row would also hide the only way to reach it. */}
                      <DropdownMenu.Item
                        onSelect={() => openKolboAssets("visual-dna")}
                        style={{ padding: "9px 10px" }}
                      >
                        <Icon name="dna" size="small" class="shrink-0 text-text-weak" />
                        <DropdownMenu.ItemLabel>
                          {language.t("dialog.kolboAsset.visualDnas")}
                        </DropdownMenu.ItemLabel>
                      </DropdownMenu.Item>
                      <Show when={moodboards().length > 0}>
                        <DropdownMenu.Item
                          onSelect={() => openKolboAssets("moodboard")}
                          style={{ padding: "9px 10px" }}
                        >
                          <Icon name="moodboard" size="small" class="shrink-0 text-text-weak" />
                          <DropdownMenu.ItemLabel>
                            {language.t("dialog.kolboAsset.moodboards")}
                          </DropdownMenu.ItemLabel>
                        </DropdownMenu.Item>
                      </Show>
                    </DropdownMenu.Content>
                  </DropdownMenu.Portal>
                </DropdownMenu>
              </TooltipKeybind>
              <Tooltip
                placement="top"
                value={dictating() ? language.t("prompt.action.dictateStop") : language.t("prompt.action.dictate")}
              >
                <Button
                  data-action="prompt-dictate"
                  type="button"
                  variant="ghost"
                  class={"size-8 p-0 relative" + (dictation.state() === "starting" ? " animate-pulse" : "")}
                  style={{
                    ...buttons(),
                    // Live mic reads as ON without shouting: red icon on a faint
                    // red wash with a red outline. The pulsing dot in the
                    // "Listening…" label beside it carries the motion.
                    ...(dictating()
                      ? {
                          color: "rgb(239,68,68)",
                          background: "rgba(239,68,68,0.10)",
                          "box-shadow": "inset 0 0 0 1px rgba(239,68,68,0.55)",
                        }
                      : {}),
                  }}
                  onClick={() => dictation.toggle()}
                  disabled={store.mode !== "normal"}
                  tabIndex={store.mode === "normal" ? undefined : -1}
                  aria-label={
                    dictating() ? language.t("prompt.action.dictateStop") : language.t("prompt.action.dictate")
                  }
                >
                  <Icon name="mic" class="size-4.5" />
                </Button>
              </Tooltip>
              <Show when={dictating() || voiceErrorText()}>
                {/* Inline status in the reserved button strip — the editor keeps
                    padding-bottom for this row, so it never covers typed text. */}
                <span
                  class="inline-flex items-center gap-1.5 truncate text-12-medium max-w-[220px] pl-1"
                  style={{ color: "rgb(239,68,68)" }}
                >
                  <Show when={!voiceErrorText()}>
                    <span
                      aria-hidden="true"
                      class="size-1.5 rounded-full animate-pulse shrink-0"
                      style={{ background: "rgb(239,68,68)" }}
                    />
                  </Show>
                  {voiceErrorText() ?? language.t("prompt.voice.listening")}
                </span>
              </Show>
            </div>
          </div>
        </div>
      </DockShellForm>
      <Show when={store.mode === "normal" || store.mode === "shell"}>
        <DockTray attach="top">
          <div dir="ltr" class="px-1.75 pt-5.5 pb-2 flex items-center gap-2 min-w-0">
            <div class="flex items-center gap-1.5 min-w-0 flex-1 relative">
              <div
                class="h-7 flex items-center gap-1.5 max-w-[160px] min-w-0 absolute inset-y-0 left-0"
                style={{
                  padding: "0 4px 0 8px",
                  ...shell(),
                }}
              >
                <span class="truncate text-13-medium text-text-strong">{language.t("prompt.mode.shell")}</span>
                <div class="size-4 shrink-0" />
              </div>
              <div class="flex items-center gap-1.5 min-w-0 flex-1">
                <Show when={store.mode !== "shell"}>
                  <div data-component="prompt-model-control">
                    <Show
                      when={providers.paid().length > 0}
                      fallback={
                        <TooltipKeybind
                          placement="top"
                          gutter={4}
                          title={language.t("command.model.choose")}
                          keybind={command.keybind("model.choose")}
                        >
                          <Button
                            data-action="prompt-model"
                            as="div"
                            variant="ghost"
                            size="normal"
                            class="min-w-0 max-w-[320px] text-13-regular text-text-base group"
                            style={control()}
                            onClick={() => {
                              void import("@/components/dialog-select-model-unpaid").then((x) => {
                                dialog.show(() => <x.DialogSelectModelUnpaid model={local.model} />)
                              })
                            }}
                          >
                            <Show when={local.model.current()?.provider?.id}>
                              <ProviderIcon
                                id={local.model.current()?.provider?.id ?? ""}
                                class="size-4 shrink-0 transition-opacity duration-150"
                                classList={{
                                  "opacity-40 group-hover:opacity-100": local.model.current()?.provider?.id !== "kolbo",
                                }}
                                style={{
                                  color: local.model.current()?.provider?.id === "kolbo" ? "#60a5fa" : undefined,
                                  "will-change": "opacity",
                                  transform: "translateZ(0)",
                                }}
                              />
                            </Show>
                            <span class="truncate">
                              {local.model.current()?.name ?? language.t("dialog.model.select.title")}
                            </span>
                            <Icon name="chevron-down" size="small" class="shrink-0" />
                          </Button>
                        </TooltipKeybind>
                      }
                    >
                      <TooltipKeybind
                        placement="top"
                        gutter={4}
                        title={language.t("command.model.choose")}
                        keybind={command.keybind("model.choose")}
                      >
                        <ModelSelectorPopover
                          model={local.model}
                          triggerAs={Button}
                          triggerProps={{
                            variant: "ghost",
                            size: "normal",
                            style: control(),
                            class: "min-w-0 max-w-[320px] text-13-regular text-text-base group",
                            "data-action": "prompt-model",
                          }}
                          onClose={restoreFocus}
                        >
                          <Show when={local.model.current()?.provider?.id}>
                            {(providerID) => (
                              <SelectedModelAvatar
                                url={local.model.current()?.avatar}
                                providerID={providerID()}
                              />
                            )}
                          </Show>
                          <span class="truncate">
                            {local.model.current()?.name ?? language.t("dialog.model.select.title")}
                          </span>
                          <Icon name="chevron-down" size="small" class="shrink-0" />
                        </ModelSelectorPopover>
                      </TooltipKeybind>
                    </Show>
                  </div>
                  {/* Thinking effort cycle hidden — not needed for non-technical users */}
                </Show>
              </div>
            </div>
            <Show when={local.model.current()?.provider?.id === "kolbo"}>
              <div class="shrink-0 flex items-center gap-2 text-11-regular pr-1">
                {/* Balance only. What this chat SPENT lives in the top-bar
                    Usage menu, where agent and media credits sit side by side
                    against the authoritative kolbo-api figures. */}
                <Show when={usage.balance() !== null}>
                  <span class="text-text-weak">{usage.balance()!.toLocaleString(language.intl())} credits</span>
                </Show>
              </div>
            </Show>
          </div>
        </DockTray>
      </Show>
    </div>
  )
}
