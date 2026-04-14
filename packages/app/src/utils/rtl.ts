// RTL locale codes
const RTL_LOCALES = ['ar', 'he', 'fa', 'ur']

// Detect if text content is predominantly RTL
export function detectTextDirection(text: string): 'rtl' | 'ltr' {
  const rtlChars = (text.match(/[\u0591-\u07FF\uFB1D-\uFDFD\uFE70-\uFEFC]/g) || []).length
  const ltrChars = (text.match(/[A-Za-z\u00C0-\u024F]/g) || []).length
  return rtlChars > ltrChars ? 'rtl' : 'ltr'
}

// Apply direction to an element
export function applyTextDirection(element: HTMLElement, text: string): void {
  const dir = detectTextDirection(text)
  element.dir = dir
}

// Check if a locale code is RTL
export function isRTLLocale(locale: string): boolean {
  return RTL_LOCALES.some(rtl => locale.startsWith(rtl))
}
