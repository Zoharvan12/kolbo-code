import type { AssistantMessage, Part, UserMessage } from "@opencode-ai/sdk/v2"
import { extractKolboUrls, isVideoUrl } from "@opencode-ai/util/kolbo-media"
import { marked } from "marked"
import { Auth } from "@/auth"
import { Partner } from "@/brand/partner"
import type { SessionID } from "@/session/schema"
import { SessionTable } from "@/session/session.sql"
import { Database, eq, isNotNull } from "@/storage/db"
import { SessionShareTable } from "./share.sql"

/**
 * Session sharing on Kolbo's own infrastructure.
 *
 * The upstream share protocol (ShareNext -> opncd.ai) needs a sync server and a live
 * session renderer that this fork never got. Kolbo already hosts arbitrary HTML at
 * `/artifact/quick-share`, so a share is the session rendered to a standalone page and
 * published as an artifact. Re-sharing reuses the shareToken, so the public URL is stable.
 *
 * The page is deliberately self-contained — no framework, no fetch, no build step — so it
 * survives the artifact sanitizer and renders identically anywhere.
 *
 * ponytail: snapshot, not live sync — SessionShare re-publishes after each assistant turn.
 */
export namespace KolboShare {
  export type Published = {
    url: string
    projectID: string
    artifactID: string
    shareToken: string
  }

  export type MessageWithParts = {
    info: UserMessage | AssistantMessage
    parts: Part[]
  }

  export type SessionInfo = {
    id: string
    title: string
    time: { created: number; updated: number }
  }

  type Row = { projectID: string; artifactID: string; shareToken: string; url: string }

  /**
   * kolbo-api reads an API key from `X-API-Key` and otherwise verifies `Authorization:
   * Bearer` as a JWT. Kolbo credentials are always API keys — the device-code login stores
   * the returned `api_key` in both `access` and `refresh` and still labels the entry
   * "oauth" (see plugin/kolbo.ts), so the type says nothing about the header to use.
   * Sending it as Bearer fails JWT verification with `401 Invalid token`.
   */
  async function authHeaders(): Promise<Record<string, string>> {
    const auth = await Auth.get("kolbo")
    const key = auth?.type === "oauth" ? auth.refresh || auth.access : auth?.type === "api" ? auth.key : undefined
    if (!key) throw new Error("Not authenticated with Kolbo. Run `kolbo auth login`.")
    return { "X-API-Key": key }
  }

  /**
   * `sites.kolbo.ai` only resolves in production; dev and self-hosted setups read the
   * artifact straight off the API host, which serves it public and iframe-safe.
   */
  function publicUrl(data: any, shareToken: string): string {
    const raw = `${Partner.apiBase}/shared-artifact-raw/${shareToken}`
    if (!/(^|\/\/)api\.kolbo\.ai/i.test(Partner.apiBase)) return raw
    if (data?.siteUrl) return String(data.siteUrl)
    if (data?.shareableSlug) return `https://sites.kolbo.ai/${data.shareableSlug}`
    return raw
  }

  function escape(input: string) {
    return input.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
  }

  /** Assistant prose is markdown. Raw HTML inside it is dropped by the artifact sanitizer. */
  function md(input: string) {
    return marked.parse(input, { async: false, gfm: true, breaks: true }) as string
  }

  function block(label: string, body: string) {
    if (!body.trim()) return ""
    return `<div data-slot="io"><div data-slot="io-label">${escape(label)}</div><pre><code>${escape(body)}</code></pre></div>`
  }

  /**
   * Images and video a tool actually produced (Kolbo MCP generations, mostly). These are
   * public CDN URLs and the artifact CSP allows `img-src`/`media-src https:`, so they can
   * be embedded by reference — no download, no re-upload, nothing to expire on our side.
   */
  function gallery(urls: string[]): string {
    if (!urls.length) return ""
    const items = urls.map((url) => {
      const src = escape(url)
      return isVideoUrl(url)
        ? `<video src="${src}" controls preload="metadata" playsinline></video>`
        : `<a href="${src}" target="_blank" rel="noreferrer noopener"><img src="${src}" alt="" loading="lazy" decoding="async"></a>`
    })
    return `<div data-slot="media"${urls.length === 1 ? ' data-single="true"' : ""}>${items.join("")}</div>`
  }

  function part(item: Part): string {
    if (item.type === "text" && !item.synthetic) {
      return `<div data-component="markdown" dir="auto">${md(item.text)}</div>`
    }

    if (item.type === "reasoning") {
      if (!item.text.trim()) return ""
      return [
        `<details data-component="thinking">`,
        `<summary><span data-slot="caret"></span>Thinking</summary>`,
        `<div data-component="markdown" dir="auto">${md(item.text)}</div>`,
        `</details>`,
      ].join("")
    }

    if (item.type === "tool") {
      const state: any = item.state
      const failed = state?.status === "error"
      const input = state?.input ? JSON.stringify(state.input, null, 2) : ""
      const output = state?.status === "completed" ? String(state.output ?? "") : ""
      const error = failed ? String(state.error ?? "") : ""
      const media = gallery(extractKolboUrls(output))
      return [
        `<details data-component="tool-trigger"${failed ? ' data-status="error"' : ""}>`,
        `<summary><span data-slot="caret"></span>`,
        `<span data-slot="basic-tool-tool-title">${escape(item.tool)}</span>`,
        failed ? `<span data-slot="tool-error-tag">error</span>` : "",
        `</summary>`,
        block("Input", input),
        block("Output", output),
        block("Error", error),
        `</details>`,
        // Outside the <details>: a generated image is the point of the turn, not a
        // detail to unfold. The raw JSON stays collapsed above it.
        media,
      ].join("")
    }

    if (item.type === "file") {
      const file: any = item
      const url = typeof file.url === "string" ? file.url : ""
      if (!/^https?:\/\//.test(url)) return ""
      const mime = String(file.mime ?? "")
      if (mime.startsWith("image/") || mime.startsWith("video/") || isVideoUrl(url)) return gallery([url])
      const name = escape(String(file.filename || url))
      return `<div data-slot="attachment"><a href="${escape(url)}" target="_blank" rel="noreferrer noopener">${name}</a></div>`
    }

    return ""
  }

  function turn(message: MessageWithParts): string {
    const info = message.info
    const body = message.parts.map(part).join("")
    if (!body.trim()) return ""

    // Matches the desktop app: user turns are right-aligned bubbles, assistant turns run
    // full width with no chrome, so the prose itself is the surface.
    if (info.role === "user") {
      return `<article data-component="user-message"><div data-slot="user-message-text" dir="auto">${body}</div></article>`
    }
    return `<article data-component="assistant-message">${body}</article>`
  }

  /**
   * Design tokens lifted verbatim from packages/ui/src/styles/theme.css and the component
   * rules in markdown.css / message-part.css / basic-tool.css, so a shared session reads
   * like the desktop app rather than a generic document. Keep them in sync by value —
   * the app's stylesheets can't be imported into a standalone artifact.
   */
  const CSS = `
:root{
color-scheme:light dark;
--font-family-sans:"Poppins","Heebo",ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
--font-family-mono:"JetBrains Mono",ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace;
--font-size-small:13px;--font-size-base:14px;
--font-weight-regular:400;--font-weight-medium:500;--font-weight-semibold:600;
--line-height-large:150%;--line-height-x-large:180%;
--letter-spacing-tight:-0.011em;--letter-spacing-tightest:-0.024em;
--radius-sm:0.375rem;--radius-md:0.625rem;
--background-base:#f8f8f8;
--surface-raised-base:rgba(0,0,0,0.031);
--surface-recess-base:#f0f0f0;
--text-base:#6f6f6f;--text-weak:#8f8f8f;--text-weaker:#c7c7c7;--text-strong:#171717;
--text-interactive-base:#034cff;
--border-weak-base:#e5e5e5;--border-weaker-base:#f0f0f0;
--syntax-string:#006656;--syntax-critical:#ed4831;
--kolbo-accent:#034cff;
}
@media(prefers-color-scheme:dark){:root{
--background-base:#101010;
--surface-raised-base:rgba(255,255,255,0.059);
--surface-recess-base:#0b0b0b;
--text-base:rgba(255,255,255,0.618);--text-weak:rgba(255,255,255,0.422);
--text-weaker:rgba(255,255,255,0.284);--text-strong:rgba(255,255,255,0.936);
--border-weak-base:#282828;--border-weaker-base:#202020;
--syntax-string:#00ceb9;
}}
*{box-sizing:border-box}
body{margin:0;background:var(--background-base);color:var(--text-strong);
font-family:var(--font-family-sans);font-size:var(--font-size-base);
line-height:var(--line-height-large);-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
.session{max-width:768px;margin:0 auto;padding:40px 20px 96px;display:flex;flex-direction:column;gap:28px}
header{display:flex;flex-direction:column;gap:6px;padding-bottom:20px;border-bottom:1px solid var(--border-weaker-base)}
.brand{font-size:11px;font-weight:var(--font-weight-semibold);letter-spacing:.12em;text-transform:uppercase;color:var(--kolbo-accent)}
h1.title{margin:0;font-size:20px;font-weight:var(--font-weight-medium);line-height:var(--line-height-large);letter-spacing:var(--letter-spacing-tight);color:var(--text-strong)}
.meta{color:var(--text-weak);font-size:var(--font-size-small)}
.meta .sep{color:var(--text-weaker);margin:0 6px}
main{display:flex;flex-direction:column;gap:28px}

[data-component="user-message"]{display:flex;flex-direction:column;align-items:flex-end;width:100%}
[data-slot="user-message-text"]{display:inline-block;white-space:pre-wrap;word-break:break-word;
background:var(--surface-raised-base);border:1px solid var(--border-weak-base);
padding:9px 14px;border-radius:16px;max-width:min(82%,64ch);color:var(--text-strong)}
[data-slot="user-message-text"] [data-component="markdown"] p:last-child{margin-bottom:0}

[data-component="assistant-message"]{display:flex;flex-direction:column;align-items:flex-start;width:100%;gap:12px}
/* Children must stretch, or a flex item shrinks to its content and RTL prose can no
   longer sit against the right edge — Hebrew ends up left-aligned. */
[data-component="assistant-message"]>*{align-self:stretch;min-width:0}

[data-component="markdown"]{min-width:0;max-width:100%;overflow-wrap:break-word;color:var(--text-strong);
font-family:var(--font-family-sans);font-size:var(--font-size-base);line-height:var(--line-height-x-large)}
[data-component="markdown"]>*:first-child{margin-top:0}
[data-component="markdown"]>*:last-child{margin-bottom:0}
[data-component="markdown"] h1,[data-component="markdown"] h2,[data-component="markdown"] h3,
[data-component="markdown"] h4,[data-component="markdown"] h5,[data-component="markdown"] h6{
font-size:var(--font-size-base);color:var(--text-strong);font-weight:var(--font-weight-medium);
margin:2rem 0 .75rem;line-height:var(--line-height-large)}
[data-component="markdown"] strong,[data-component="markdown"] b{color:var(--text-strong);font-weight:var(--font-weight-medium)}
[data-component="markdown"] p{margin:0 0 1rem}
[data-component="markdown"] a{color:var(--text-interactive-base);text-decoration:none}
[data-component="markdown"] a:hover{text-decoration:underline;text-underline-offset:2px}
[data-component="markdown"] ul,[data-component="markdown"] ol{margin:.5rem 0 1rem;padding-inline-start:1.5rem;padding-inline-end:0;list-style-position:outside}
[data-component="markdown"] ol{padding-inline-start:2.25rem;list-style-type:decimal}
[data-component="markdown"] ul{list-style-type:disc}
[data-component="markdown"] li{margin-bottom:.5rem}
[data-component="markdown"] li::marker{color:var(--text-weak)}
[data-component="markdown"] blockquote{border-inline-start:2px solid var(--border-weak-base);margin:1.5rem 0;padding-inline-start:.5rem;color:var(--text-weak)}
[data-component="markdown"] hr{border:none;height:0;margin:2.5rem 0}
[data-component="markdown"] table{width:100%;border-collapse:collapse;margin:1.5rem 0;font-size:var(--font-size-base);display:block;overflow-x:auto}
[data-component="markdown"] th,[data-component="markdown"] td{border-bottom:1px solid var(--border-weaker-base);padding:.75rem .5rem;text-align:start;vertical-align:top}
[data-component="markdown"] th{color:var(--text-strong);font-weight:var(--font-weight-medium)}
[data-component="markdown"] :not(pre)>code{font-family:var(--font-family-mono);font-feature-settings:"calt","liga","zero";
color:var(--syntax-string);font-weight:var(--font-weight-medium)}
[data-component="markdown"] pre{margin:2rem 0}

pre{overflow:auto;border-radius:var(--radius-md);background:var(--surface-recess-base);
border:.5px solid var(--border-weak-base);padding:8px 12px;font-size:var(--font-size-small);
direction:ltr;text-align:left;scrollbar-width:thin}
pre code{font-family:var(--font-family-mono);font-feature-settings:"calt","liga","zero";
white-space:pre;color:var(--text-strong);font-weight:var(--font-weight-regular)}

details{width:100%}
details>summary{cursor:pointer;list-style:none;display:flex;align-items:center;gap:8px;
padding:2px 0;font-family:var(--font-family-sans);font-size:var(--font-size-base);
color:var(--text-base);transition:color 180ms ease}
details>summary::-webkit-details-marker{display:none}
details>summary:hover{color:var(--text-strong)}
[data-slot="caret"]{width:0;height:0;flex-shrink:0;border:4px solid transparent;
border-inline-start-color:var(--text-weaker);transition:transform 150ms ease}
details[open]>summary [data-slot="caret"]{transform:rotate(90deg) translateX(-1px)}
[data-slot="basic-tool-tool-title"]{font-family:var(--font-family-mono);font-size:var(--font-size-small);
font-weight:var(--font-weight-medium);color:var(--text-strong)}
[data-slot="tool-error-tag"]{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--syntax-critical)}
[data-component="tool-trigger"]>div,[data-component="thinking"]>div{margin-top:8px;padding-inline-start:16px}
[data-component="thinking"] [data-component="markdown"]{color:var(--text-weak)}
[data-slot="io-label"]{font-size:11px;letter-spacing:.07em;text-transform:uppercase;color:var(--text-weaker);margin-bottom:4px}
[data-slot="io"]+[data-slot="io"]{margin-top:10px}

[data-slot="media"]{display:grid;gap:8px;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));width:100%}
[data-slot="media"][data-single="true"]{grid-template-columns:minmax(0,520px)}
[data-slot="media"] img,[data-slot="media"] video{display:block;width:100%;height:auto;
border-radius:var(--radius-md);border:1px solid var(--border-weak-base);background:var(--surface-recess-base)}
[data-slot="media"] a{display:block;line-height:0}
[data-slot="attachment"]{font-size:var(--font-size-small)}
[data-slot="attachment"] a{color:var(--text-interactive-base);text-decoration:none}
[data-slot="attachment"] a:hover{text-decoration:underline;text-underline-offset:2px}

footer{padding-top:20px;border-top:1px solid var(--border-weaker-base);color:var(--text-weaker);font-size:var(--font-size-small)}
footer a{color:var(--text-weak);text-decoration:none}
footer a:hover{text-decoration:underline;text-underline-offset:2px}
`.trim()

  export function render(info: SessionInfo, messages: MessageWithParts[]): string {
    const title = info.title || "Session"
    const models = Array.from(
      new Set(messages.map((m) => (m.info.role === "assistant" ? m.info.modelID : "")).filter(Boolean)),
    )
    const meta = [
      new Date(info.time.created).toLocaleString(),
      `${messages.length} messages`,
      ...models,
    ]
      .map(String)
      .map(escape)
      .join(' <span class="sep">·</span> ')

    return [
      "<!doctype html>",
      '<html><head><meta charset="utf-8">',
      '<meta name="viewport" content="width=device-width,initial-scale=1">',
      `<title>${escape(title)}</title>`,
      // The app's faces, pulled from the one CDN the artifact CSP allows for fonts.
      '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
      '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600&family=Heebo:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap">',
      `<style>${CSS}</style>`,
      '</head><body><div class="session">',
      "<header>",
      `<div class="brand">${escape(Partner.name)}</div>`,
      `<h1 class="title" dir="auto">${escape(title)}</h1>`,
      `<div class="meta">${meta}</div>`,
      "</header><main>",
      messages.map(turn).join(""),
      "</main>",
      `<footer>Shared from ${escape(Partner.name)} <span class="sep">·</span> <a href="https://${escape(Partner.domain)}">${escape(Partner.domain)}</a></footer>`,
      "</div></body></html>",
    ].join("")
  }

  /** Stored in SessionShareTable: `id` carries the delete coordinates, `secret` the update token. */
  function load(sessionID: SessionID): Row | undefined {
    const row = Database.use((db) =>
      db.select().from(SessionShareTable).where(eq(SessionShareTable.session_id, sessionID)).get(),
    )
    if (!row) return
    const [projectID, artifactID] = row.id.split("/")
    if (!projectID || !artifactID) return
    return { projectID, artifactID, shareToken: row.secret, url: row.url }
  }

  function save(sessionID: SessionID, result: Published) {
    const values = {
      id: `${result.projectID}/${result.artifactID}`,
      secret: result.shareToken,
      url: result.url,
    }
    Database.use((db) =>
      db
        .insert(SessionShareTable)
        .values({ session_id: sessionID, ...values })
        .onConflictDoUpdate({ target: SessionShareTable.session_id, set: values })
        .run(),
    )
  }

  /** True once a session has been published, i.e. there is a URL worth keeping fresh. */
  export function exists(sessionID: SessionID): boolean {
    return load(sessionID) !== undefined
  }

  /**
   * Sessions shared before the backend moved to Kolbo still carry an opncd.ai `share_url`,
   * and the UI reads that field alone to decide a session is shared — so it offers "copy
   * share link" for a link that now points at a server we no longer publish to, and never
   * re-shares. Drop those URLs so the session reads as unshared and can be shared again.
   *
   * Detected by the share row, not the URL: a legacy row's `id` is a bare share id, while
   * `save()` writes `projectID/artifactID`.
   */
  export function reconcile(): number {
    return Database.use((db) => {
      const stale = db
        .select({ id: SessionTable.id, url: SessionTable.share_url })
        .from(SessionTable)
        .where(isNotNull(SessionTable.share_url))
        .all()
        .filter((row) => !load(row.id as SessionID))
      for (const row of stale) {
        db.update(SessionTable).set({ share_url: null }).where(eq(SessionTable.id, row.id)).run()
      }
      return stale.length
    })
  }

  export async function publish(
    sessionID: SessionID,
    info: SessionInfo,
    messages: MessageWithParts[],
  ): Promise<Published> {
    const existing = load(sessionID)
    const res = await fetch(`${Partner.apiBase}/artifact/quick-share`, {
      method: "POST",
      headers: { ...(await authHeaders()), "Content-Type": "application/json" },
      body: JSON.stringify({
        title: info.title || "Session",
        type: "html",
        content: render(info, messages),
        // No `sessionId`: kolbo-api types it as a Mongo ObjectId and a kodu session id
        // ("ses_-e5ff…") fails the cast, which surfaces as a 500. The session-to-artifact
        // link lives in SessionShareTable anyway.
        allowJs: false,
        ...(existing ? { shareToken: existing.shareToken } : {}),
      }),
    })
    if (!res.ok) throw new Error(`Kolbo share failed (${res.status}): ${await res.text()}`)

    const data = ((await res.json().catch(() => undefined)) as any)?.data
    if (!data?.shareToken) throw new Error("Kolbo share returned no shareToken")

    const result: Published = {
      url: publicUrl(data, String(data.shareToken)),
      projectID: String(data.project),
      artifactID: String(data._id),
      shareToken: String(data.shareToken),
    }
    save(sessionID, result)
    return result
  }

  export async function remove(sessionID: SessionID): Promise<void> {
    const existing = load(sessionID)
    if (!existing) return
    const res = await fetch(`${Partner.apiBase}/artifact/${existing.projectID}/${existing.artifactID}`, {
      method: "DELETE",
      headers: await authHeaders(),
    })
    // 404 means it is already gone upstream — still drop the local row.
    if (!res.ok && res.status !== 404) throw new Error(`Kolbo unshare failed (${res.status}): ${await res.text()}`)
    Database.use((db) => db.delete(SessionShareTable).where(eq(SessionShareTable.session_id, sessionID)).run())
  }
}
