/** Fences the model uses for generation prompts — not programming code. */
const PROSE_LANGS = new Set([
  "",
  "text",
  "plaintext",
  "plain",
  "txt",
  "prompt",
  "none",
  "markdown",
  "md",
  "code",
])

const PROMPT_LANGS = new Set([
  "text_to_image",
  "image_editing",
  "image_to_video",
  "text_to_video",
  "lipsync",
  "video_to_video",
  "elements",
  "first_last_frame",
  "text_to_speech",
  "music_generator",
  "music_style",
  "music_lyrics",
  "text_to_sound",
  "creative_director",
  "seedance",
  "seedance25",
  "seedance_prompt",
  "seedance25_prompt",
])

const CODE_SIGNALS =
  /(?:^|\n)\s*(?:import\s|export\s|from\s+['"]|const\s|let\s|var\s|function\s|class\s+\w+|def\s|public\s|private\s|#include|package\s|SELECT\s|<\?|<!--|<\/?[a-z][\w-]*[\s/>])|=>|[{};]\s*(?:\n|$)/i

const PROMPT_HEADINGS =
  /SCENE CONTEXT|ACTIVE REFERENCES|GLOBAL LOOK|LOCKED INTRO|LOCATION MAP|FIRST FRAME|OPTICS|\[\s*CAST\b|\[\s*LOCATION\b|\[\s*GLOBAL LOOK/i

export function isPromptFence(language: string | undefined, code: string): boolean {
  const lang = (language || "").trim().toLowerCase()
  const text = (code || "").trim()
  if (PROMPT_LANGS.has(lang)) return true
  if (text.length >= 40) {
    if (PROMPT_HEADINGS.test(text)) return true
    if (/\[\d+\s*s(?:\s*[-–]\s*\d+\s*s)?\]/i.test(text)) return true
    if (/^SHOT\s+\d+/im.test(text)) return true
    if (/@(?:[\w.-]+)/.test(text) && /\b(camera|dolly|crane|shot|audio|dialogue|timecode)\b/i.test(text)) return true
    if (/^\s*(?:subject|camera|audio|style|constraints|dialogue)\s*:/im.test(text)) return true
  }
  if (!PROSE_LANGS.has(lang)) return false
  return text.length >= 40 && !CODE_SIGNALS.test(text)
}

export function fenceLang(block: HTMLPreElement): string {
  const code = block.querySelector("code")
  const cls = Array.from(code?.classList ?? []).find((item) => item.startsWith("language-"))
  return cls?.replace("language-", "") ?? ""
}

export function isPromptBlock(block: HTMLPreElement): boolean {
  const text = block.querySelector("code")?.textContent ?? block.textContent ?? ""
  return isPromptFence(fenceLang(block), text)
}
