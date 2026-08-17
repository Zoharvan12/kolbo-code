/**
 * Which mention menu the text before the cursor should open.
 *
 * `@` is permissive (file paths are full of punctuation). `#` is not: it collides
 * with hex colours, CSS ids, markdown headings and `C#`, so it only fires at a word
 * boundary — and callers additionally gate it on the user actually having moodboards.
 */
export type MentionTrigger = { trigger: "@" | "#"; query: string }

const AT = /@(\S*)$/
// (?:^|\s) — word boundary, so "#fff" in "color:#fff" and "C#" stay quiet.
// [^\s#]*  — a second "#" ends the match, so markdown "## Heading" never matches.
const HASH = /(?:^|\s)#([^\s#]*)$/

export function matchMentionTrigger(textBeforeCursor: string, allowHash: boolean): MentionTrigger | undefined {
  const at = textBeforeCursor.match(AT)
  if (at) return { trigger: "@", query: at[1] ?? "" }
  if (!allowHash) return undefined
  const hash = textBeforeCursor.match(HASH)
  if (hash) return { trigger: "#", query: hash[1] ?? "" }
  return undefined
}

/** The token to replace when a mention is picked — `#query` for moodboards, `@query` otherwise. */
export function mentionTokenPattern(type: string) {
  return type === "moodboard" ? /#([^\s#]*)$/ : AT
}
