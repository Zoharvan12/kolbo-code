import { describe, expect, test } from "bun:test"
import { KolboShare } from "@/share/kolbo-share"

const session = { id: "ses_1", title: "Quick greeting", time: { created: 1_700_000_000_000, updated: 0 } }

const message = (info: any, parts: any[]) => ({ info, parts }) as KolboShare.MessageWithParts

const user = (text: string) => message({ role: "user", id: "m1", sessionID: "ses_1" }, [{ type: "text", text }])

const assistant = (parts: any[]) =>
  message({ role: "assistant", id: "m2", sessionID: "ses_1", agent: "build", modelID: "claude-opus-5", time: {} }, parts)

describe("kolbo share page", () => {
  test("user and assistant turns render as separate blocks", () => {
    const html = KolboShare.render(session, [user("hi"), assistant([{ type: "text", text: "**hello**" }])])
    expect(html).toContain(`data-component="user-message"`)
    expect(html).toContain(`data-component="assistant-message"`)
    expect(html).toContain("<strong>hello</strong>")
    expect(html).toContain("claude-opus-5")
  })

  test("reasoning and tool calls are collapsed, not dumped inline", () => {
    const html = KolboShare.render(session, [
      assistant([
        { type: "reasoning", text: "deliberating" },
        { type: "tool", tool: "bash", state: { status: "completed", input: { cmd: "ls" }, output: "a\nb" } },
      ]),
    ])
    expect(html).toContain(`data-component="thinking"`)
    expect(html).toContain("Thinking")
    expect(html).toContain(`data-slot="basic-tool-tool-title">bash<`)
    expect(html).toContain("&quot;cmd&quot;")
  })

  test("a failed tool call is marked", () => {
    const html = KolboShare.render(session, [
      assistant([{ type: "tool", tool: "bash", state: { status: "error", error: "boom" } }]),
    ])
    expect(html).toContain(`data-status="error"`)
    expect(html).toContain("boom")
  })

  test("tool output is escaped rather than executed", () => {
    const html = KolboShare.render(session, [
      assistant([{ type: "tool", tool: "read", state: { status: "completed", output: "<script>alert(1)</script>" } }]),
    ])
    expect(html).not.toContain("<script>alert(1)</script>")
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;")
  })

  test("a title with markup cannot break out of the title tag", () => {
    const html = KolboShare.render({ ...session, title: "</title><script>x</script>" }, [])
    expect(html).toContain("<title>&lt;/title&gt;")
    expect(html.match(/<title>/g)).toHaveLength(1)
  })

  test("prose carries dir=auto so Hebrew renders right-to-left", () => {
    const html = KolboShare.render(session, [assistant([{ type: "text", text: "היי, איך אפשר לעזור?" }])])
    expect(html).toContain(`data-component="markdown" dir="auto"`)
    expect(html).toContain("היי, איך אפשר לעזור?")
  })
})

describe("kolbo share media", () => {
  const generated = (output: any) =>
    KolboShare.render(session, [
      assistant([{ type: "tool", tool: "kolbo_generate_image", state: { status: "completed", output: JSON.stringify(output) } }]),
    ])

  test("a generated image is shown, not just linked in JSON", () => {
    const html = generated({ urls: ["https://cdn.kolbo.ai/gen/cat.png"] })
    expect(html).toContain(`<img src="https://cdn.kolbo.ai/gen/cat.png"`)
    expect(html).toContain(`<div data-slot="media"`)
  })

  test("generated video renders as a player, not an image", () => {
    const html = generated({ urls: ["https://cdn.kolbo.ai/gen/clip.mp4"] })
    expect(html).toContain(`<video src="https://cdn.kolbo.ai/gen/clip.mp4"`)
    expect(html).not.toContain("<img")
  })

  test("media sits outside the collapsed tool details", () => {
    const html = generated({ urls: ["https://cdn.kolbo.ai/gen/cat.png"] })
    expect(html.indexOf("</details>")).toBeLessThan(html.indexOf(`<div data-slot="media"`))
  })

  test("a tool with no media renders no gallery", () => {
    const html = KolboShare.render(session, [
      assistant([{ type: "tool", tool: "bash", state: { status: "completed", output: "ok" } }]),
    ])
    expect(html).not.toContain(`<div data-slot="media"`)
  })

  test("an image attachment on a message is rendered", () => {
    const html = KolboShare.render(session, [
      assistant([{ type: "file", url: "https://cdn.kolbo.ai/up/a.png", mime: "image/png" }]),
    ])
    expect(html).toContain(`<img src="https://cdn.kolbo.ai/up/a.png"`)
  })

  test("a non-media attachment falls back to a link", () => {
    const html = KolboShare.render(session, [
      assistant([{ type: "file", url: "https://cdn.kolbo.ai/up/spec.pdf", mime: "application/pdf", filename: "spec.pdf" }]),
    ])
    expect(html).toContain(`data-slot="attachment"`)
    expect(html).toContain("spec.pdf")
  })
})
