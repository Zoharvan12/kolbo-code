import { TextAttributes } from "@opentui/core"
import { useKeyboard } from "@opentui/solid"
import open from "open"
import { selectedForeground, useTheme } from "@tui/context/theme"
import { useDialog, type DialogContext } from "@tui/ui/dialog"
import { Link } from "@tui/ui/link"
import { Partner } from "@/brand/partner"
import { useI18n } from "@/i18n"

const GO_URL = Partner.upsellUrl

export type DialogGoUpsellProps = {
  onClose?: () => void
}

function subscribe(props: DialogGoUpsellProps, dialog: ReturnType<typeof useDialog>) {
  open(GO_URL).catch(() => {})
  props.onClose?.()
  dialog.clear()
}

export function DialogGoUpsell(props: DialogGoUpsellProps) {
  const dialog = useDialog()
  const { theme } = useTheme()
  const { t } = useI18n()
  const fg = selectedForeground(theme)

  useKeyboard((evt) => {
    if (evt.name !== "return") return
    subscribe(props, dialog)
  })

  return (
    <box paddingLeft={2} paddingRight={2} gap={1}>
      <box flexDirection="row" justifyContent="space-between">
        <text attributes={TextAttributes.BOLD} fg={theme.text}>
          {t("upsell.title")}
        </text>
        <text fg={theme.textMuted} onMouseUp={() => dialog.clear()}>
          esc
        </text>
      </box>
      <box gap={1} paddingBottom={1}>
        <text fg={theme.textMuted}>{t("upsell.body", { name: Partner.name })}</text>
        <box flexDirection="row" gap={1}>
          <Link href={GO_URL} fg={theme.primary} />
        </box>
      </box>
      <box flexDirection="row" justifyContent="flex-end" gap={1} paddingBottom={1}>
        <box
          paddingLeft={3}
          paddingRight={3}
          backgroundColor={theme.primary}
          onMouseUp={() => subscribe(props, dialog)}
        >
          <text fg={fg} attributes={TextAttributes.BOLD}>
            {t("upsell.subscribe")}
          </text>
        </box>
      </box>
    </box>
  )
}

DialogGoUpsell.show = (dialog: DialogContext) => {
  return new Promise<void>((resolve) => {
    dialog.replace(
      () => <DialogGoUpsell onClose={() => resolve()} />,
      () => resolve(),
    )
  })
}
