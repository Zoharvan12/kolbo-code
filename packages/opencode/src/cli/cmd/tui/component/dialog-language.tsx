import { DialogSelect } from "../ui/dialog-select"
import { useDialog } from "../ui/dialog"
import { useI18n, RTL_LANGUAGES, type SupportedLang } from "@/i18n"

// U+200F = Right-to-Left Mark — hints terminals' BiDi algorithm to render RTL text correctly
const RLM = "\u200F"

const LANGUAGES: Array<{ code: SupportedLang; label: string; native: string; flag: string }> = [
  { code: "en", label: "English", native: "English", flag: "en" },
  { code: "he", label: "Hebrew", native: "עברית", flag: "he" },
  { code: "ar", label: "Arabic", native: "العربية", flag: "ar" },
  { code: "ru", label: "Russian", native: "Русский", flag: "ru" },
  { code: "zh", label: "Chinese", native: "中文", flag: "zh" },
  { code: "es", label: "Spanish", native: "Español", flag: "es" },
  { code: "hi", label: "Hindi", native: "हिंदी", flag: "hi" },
  { code: "ja", label: "Japanese", native: "日本語", flag: "ja" },
  { code: "de", label: "German", native: "Deutsch", flag: "de" },
  { code: "ko", label: "Korean", native: "한국어", flag: "ko" },
  { code: "fr", label: "French", native: "Français", flag: "fr" },
  { code: "pt", label: "Portuguese", native: "Português", flag: "pt" },
]

function nativeLabel(l: (typeof LANGUAGES)[0]): string {
  const isRtl = RTL_LANGUAGES.includes(l.code)
  // For RTL languages: wrap native text in RLM marks so BiDi-aware terminals render right-to-left
  const native = isRtl ? `${RLM}${l.native}${RLM}` : l.native
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
