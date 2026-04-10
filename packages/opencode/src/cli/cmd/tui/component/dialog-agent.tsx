import { createMemo } from "solid-js"
import { useLocal } from "@tui/context/local"
import { DialogSelect } from "@tui/ui/dialog-select"
import { useDialog } from "@tui/ui/dialog"
import { useI18n } from "@/i18n"

const NATIVE_AGENT_KEY: Record<string, string> = {
  build: "build",
  plan: "plan",
  "auto-approve": "autoApprove",
}

export function DialogAgent() {
  const local = useLocal()
  const dialog = useDialog()
  const { t } = useI18n()

  const options = createMemo(() =>
    local.agent.list().map((item) => {
      const key = NATIVE_AGENT_KEY[item.name]
      return {
        value: item.name,
        title: key ? t(`agent.${key}.name`) : item.name,
        description: item.native
          ? key
            ? t(`agent.${key}.description`)
            : t("agent.native")
          : item.description,
      }
    }),
  )

  return (
    <DialogSelect
      title={t("agent.selectTitle")}
      current={local.agent.current().name}
      options={options()}
      onSelect={(option) => {
        local.agent.set(option.value)
        dialog.clear()
      }}
    />
  )
}
