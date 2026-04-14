import { createMemo, For, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useSync } from "@tui/context/sync"
import { useSDK } from "@tui/context/sdk"
import { useLocal } from "@tui/context/local"
import { useTheme, selectedForeground } from "@tui/context/theme"
import type { TextPart, PatchPart } from "@opencode-ai/sdk/v2"
import { Locale } from "@/util/locale"
import type { PromptInfo } from "../../component/prompt/history"
import { strip } from "@tui/component/prompt/part"
import { toVisual, useI18n } from "@/i18n"
import { useKeyboard, useTerminalDimensions } from "@opentui/solid"
import { TextAttributes, type ScrollBoxRenderable } from "@opentui/core"
import { SplitBorder } from "@tui/component/border"

interface RewindEntry {
  id: string
  text: string
  time: number
  files: string[]
  isCurrent: boolean
}

export function RewindPanel(props: {
  sessionID: string
  onClose: () => void
  setPrompt?: (prompt: PromptInfo) => void
  onMove?: (messageID: string) => void
}) {
  const sync = useSync()
  const sdk = useSDK()
  const local = useLocal()
  const { theme } = useTheme()
  const { t } = useI18n()
  const dimensions = useTerminalDimensions()

  const [store, setStore] = createStore({
    selected: -1 as number, // -1 means use initialSelected
    step: "timeline" as "timeline" | "actions",
    selectedMessageID: "",
    selectedMessageText: "",
    selectedMessageTime: 0,
    actionSelected: 0,
  })

  const entries = createMemo((): RewindEntry[] => {
    const messages = sync.data.message[props.sessionID] ?? []
    const parts = sync.data.part
    const result: RewindEntry[] = []

    for (let i = 0; i < messages.length; i++) {
      const message = messages[i]
      if (message.role !== "user") continue

      const textPart = (parts[message.id] ?? []).find(
        (x) => x.type === "text" && !x.synthetic && !x.ignored,
      ) as TextPart | undefined
      if (!textPart) continue

      // Scan subsequent assistant message parts for patch info
      const changedFiles: string[] = []
      for (let j = i + 1; j < messages.length; j++) {
        const nextMsg = messages[j]
        if (nextMsg.role === "user") break
        const nextParts = parts[nextMsg.id] ?? []
        for (const part of nextParts) {
          if (part.type === "patch") {
            const patch = part as PatchPart
            for (const file of patch.files) {
              if (!changedFiles.includes(file)) changedFiles.push(file)
            }
          }
        }
      }

      const isLast = !messages.slice(i + 1).some((m) => m.role === "user")

      result.push({
        id: message.id,
        text: textPart.text.replace(/\n/g, " "),
        time: message.time.created,
        files: changedFiles,
        isCurrent: isLast,
      })
    }
    // Keep chronological order (oldest at top, newest/current at bottom)
    return result
  })

  // Default selection to the last non-current entry (most recent rewindable message)
  const initialSelected = createMemo(() => {
    const list = entries()
    for (let i = list.length - 1; i >= 0; i--) {
      if (!list[i].isCurrent) return i
    }
    return 0
  })

  const selected = createMemo(() => (store.selected === -1 ? initialSelected() : store.selected))

  const actions = [
    "restoreCodeAndConversation",
    "restoreConversation",
    "restoreCode",
    "summarizeFromHere",
    "neverMind",
  ] as const

  function populatePrompt(messageID: string) {
    const parts = sync.data.part[messageID] ?? []
    props.setPrompt?.(
      parts.reduce(
        (agg, part) => {
          if (part.type === "text") {
            if (!part.synthetic) agg.input += part.text
          }
          if (part.type === "file") agg.parts.push(strip(part))
          return agg
        },
        { input: "", parts: [] as PromptInfo["parts"] },
      ),
    )
  }

  async function abortIfBusy() {
    const status = sync.data.session_status?.[props.sessionID]
    if (status?.type !== "idle") await sdk.client.session.abort({ sessionID: props.sessionID }).catch(() => {})
  }

  async function executeAction(action: string, messageID: string) {
    switch (action) {
      case "restoreCodeAndConversation": {
        await abortIfBusy()
        await sdk.client.session.revert({ sessionID: props.sessionID, messageID })
        populatePrompt(messageID)
        props.onClose()
        break
      }
      case "restoreConversation": {
        await abortIfBusy()
        await sdk.client.session.revert({ sessionID: props.sessionID, messageID })
        await sdk.client.session.unrevert({ sessionID: props.sessionID })
        await sdk.client.session.revert({ sessionID: props.sessionID, messageID })
        populatePrompt(messageID)
        props.onClose()
        break
      }
      case "restoreCode": {
        await abortIfBusy()
        await sdk.client.session.revert({ sessionID: props.sessionID, messageID })
        props.onClose()
        break
      }
      case "summarizeFromHere": {
        await abortIfBusy()
        await sdk.client.session.revert({ sessionID: props.sessionID, messageID })
        const selectedModel = local.model.current()
        if (selectedModel) {
          sdk.client.session.summarize({
            sessionID: props.sessionID,
            modelID: selectedModel.modelID,
            providerID: selectedModel.providerID,
          })
        }
        props.onClose()
        break
      }
      case "neverMind": {
        props.onClose()
        break
      }
    }
  }

  const maxHeight = createMemo(() => Math.min(12, Math.floor(dimensions().height / 3)))

  let scroll: ScrollBoxRenderable | undefined

  function moveTimeline(direction: number) {
    const len = entries().length
    if (len === 0) return
    let next = selected() + direction
    if (next < 0) next = len - 1
    if (next >= len) next = 0
    setStore("selected", next)
    const entry = entries()[next]
    if (entry) props.onMove?.(entry.id)
  }

  function moveAction(direction: number) {
    let next = store.actionSelected + direction
    if (next < 0) next = actions.length - 1
    if (next >= actions.length) next = 0
    setStore("actionSelected", next)
  }

  useKeyboard((evt) => {
    if (store.step === "timeline") {
      if (evt.name === "escape") {
        evt.preventDefault()
        evt.stopPropagation()
        props.onClose()
        return
      }
      if (evt.name === "up" || (evt.ctrl && evt.name === "p")) {
        evt.preventDefault()
        moveTimeline(-1)
        return
      }
      if (evt.name === "down" || (evt.ctrl && evt.name === "n")) {
        evt.preventDefault()
        moveTimeline(1)
        return
      }
      if (evt.name === "return") {
        evt.preventDefault()
        const entry = entries()[selected()]
        if (entry && !entry.isCurrent) {
          setStore("step", "actions")
          setStore("selectedMessageID", entry.id)
          setStore("selectedMessageText", entry.text)
          setStore("selectedMessageTime", entry.time)
          setStore("actionSelected", 0)
        }
        return
      }
    }

    if (store.step === "actions") {
      if (evt.name === "escape") {
        evt.preventDefault()
        evt.stopPropagation()
        setStore("step", "timeline")
        return
      }
      if (evt.name === "up" || (evt.ctrl && evt.name === "p")) {
        evt.preventDefault()
        moveAction(-1)
        return
      }
      if (evt.name === "down" || (evt.ctrl && evt.name === "n")) {
        evt.preventDefault()
        moveAction(1)
        return
      }
      if (evt.name === "return") {
        evt.preventDefault()
        executeAction(actions[store.actionSelected], store.selectedMessageID)
        return
      }
    }
  })

  const fg = createMemo(() => selectedForeground(theme))

  return (
    <box
      flexShrink={0}
      border={["left"]}
      customBorderChars={SplitBorder.customBorderChars}
      borderColor={theme.border}
      backgroundColor={theme.backgroundPanel}
      paddingLeft={1}
      paddingRight={1}
    >
      <Show when={store.step === "timeline"}>
        <box paddingLeft={2} paddingBottom={1}>
          <text fg={theme.primary} attributes={TextAttributes.BOLD}>
            {t("rewind.title")}
          </text>
          <text fg={theme.textMuted}>{t("rewind.subtitle")}</text>
        </box>
        <scrollbox
          ref={(r: ScrollBoxRenderable) => (scroll = r)}
          maxHeight={maxHeight()}
          scrollbarOptions={{ visible: false }}
        >
          <For each={entries()}>
            {(entry, index) => {
              const active = createMemo(() => index() === selected())
              const filesSummary = createMemo(() => {
                if (entry.files.length === 0) return t("rewind.noCodeChanges")
                return entry.files.slice(0, 2).join(", ") + (entry.files.length > 2 ? ` +${entry.files.length - 2} more` : "")
              })

              return (
                <box
                  backgroundColor={active() ? theme.primary : undefined}
                  paddingLeft={2}
                  paddingRight={2}
                  onMouseOver={() => setStore("selected", index())}
                  onMouseUp={() => {
                    if (!entry.isCurrent) {
                      setStore("step", "actions")
                      setStore("selectedMessageID", entry.id)
                      setStore("selectedMessageText", entry.text)
                      setStore("selectedMessageTime", entry.time)
                      setStore("actionSelected", 0)
                    }
                  }}
                >
                  <box flexDirection="row" gap={1}>
                    <text
                      fg={active() ? fg() : theme.text}
                      attributes={active() ? TextAttributes.BOLD : undefined}
                      overflow="hidden"
                      wrapMode="none"
                      flexGrow={1}
                    >
                      {entry.isCurrent ? "› " : "  "}
                      {Locale.truncate(toVisual(entry.text), 60)}
                    </text>
                    <Show when={entry.isCurrent}>
                      <text fg={active() ? fg() : theme.textMuted} flexShrink={0}>
                        {t("rewind.current")}
                      </text>
                    </Show>
                  </box>
                  <text fg={active() ? fg() : theme.textMuted} paddingLeft={2}>
                    {filesSummary()}
                  </text>
                </box>
              )
            }}
          </For>
        </scrollbox>
        <box paddingLeft={2} paddingTop={1}>
          <text fg={theme.textMuted}>
            ↑↓ navigate   enter select   esc close
          </text>
        </box>
      </Show>

      <Show when={store.step === "actions"}>
        <box paddingLeft={2} paddingBottom={1}>
          <text fg={theme.primary} attributes={TextAttributes.BOLD}>
            {t("rewind.confirmTitle")}
          </text>
          <text fg={theme.text} overflow="hidden" wrapMode="none">
            {Locale.truncate(toVisual(store.selectedMessageText), 80)}
            <span style={{ fg: theme.textMuted }}> ({Locale.time(store.selectedMessageTime)})</span>
          </text>
        </box>
        <For each={actions}>
          {(action, index) => {
            const active = createMemo(() => index() === store.actionSelected)
            return (
              <box
                backgroundColor={active() ? theme.primary : undefined}
                paddingLeft={2}
                paddingRight={2}
                onMouseOver={() => setStore("actionSelected", index())}
                onMouseUp={() => executeAction(action, store.selectedMessageID)}
              >
                <text
                  fg={active() ? fg() : theme.text}
                  attributes={active() ? TextAttributes.BOLD : undefined}
                >
                  {index() + 1}. {t(`rewind.${action}` as any)}
                </text>
              </box>
            )
          }}
        </For>
        <box paddingLeft={2} paddingTop={1}>
          <text fg={theme.warning}>{t("rewind.warning")}</text>
        </box>
        <box paddingLeft={2}>
          <text fg={theme.textMuted}>
            ↑↓ navigate   enter select   esc back
          </text>
        </box>
      </Show>
    </box>
  )
}
