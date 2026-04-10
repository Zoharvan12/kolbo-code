import { DialogSelect } from "../ui/dialog-select"
import { useDialog } from "../ui/dialog"
import { useI18n, RTL_LANGUAGES, toVisual, type SupportedLang } from "@/i18n"

const LANGUAGES: Array<{ code: SupportedLang; label: string; native: string }> = [
  { code: "en", label: "English", native: "English" },
  { code: "he", label: "Hebrew", native: "עברית" },
  { code: "ar", label: "Arabic", native: "العربية" },
  { code: "ru", label: "Russian", native: "Русский" },
  { code: "zh", label: "Chinese", native: "中文" },
  { code: "es", label: "Spanish", native: "Español" },
  { code: "hi", label: "Hindi", native: "हिंदी" },
  { code: "ja", label: "Japanese", native: "日本語" },
  { code: "de", label: "German", native: "Deutsch" },
  { code: "ko", label: "Korean", native: "한국어" },
  { code: "fr", label: "French", native: "Français" },
  { code: "pt", label: "Portuguese", native: "Português" },
]

function nativeLabel(l: (typeof LANGUAGES)[0]): string {
  const isRtl = RTL_LANGUAGES.includes(l.code)
  // For RTL languages: apply BiDi visual reordering so cell-based terminal renderers
  // display Hebrew/Arabic characters in correct right-to-left visual order
  const native = isRtl ? toVisual(l.native) : l.native
  return `${native}  (${l.label})`
}

export function DialogLanguage(props: { onSelect?: () => void } = {}) {
  const dialog = useDialog()
  const { t, lang, setLang } = useI18n()

  const options = LANGUAGES.map((l) => ({
    title: nativeLabel(l),
    value: l.code,
  }))

  return (
    <DialogSelect
      title={t("dialog.selectLanguage")}
      options={options}
      current={lang()}
      noMouseSelect
      onSelect={(opt) => {
        setLang(opt.value)
        if (props.onSelect) {
          props.onSelect()
        } else {
          dialog.clear()
        }
      }}
    />
  )
}
