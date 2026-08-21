import { describe, expect, test } from "bun:test"
import type { Prompt } from "@/context/prompt"
import { buildRequestParts } from "./build-request-parts"

describe("buildRequestParts", () => {
  test("builds typed request and optimistic parts without cast path", () => {
    const prompt: Prompt = [
      { type: "text", content: "hello", start: 0, end: 5 },
      {
        type: "file",
        path: "src/foo.ts",
        content: "@src/foo.ts",
        start: 5,
        end: 16,
        selection: { startLine: 4, startChar: 1, endLine: 6, endChar: 1 },
      },
      { type: "agent", name: "planner", content: "@planner", start: 16, end: 24 },
    ]

    const result = buildRequestParts({
      prompt,
      context: [{ key: "ctx:1", type: "file", path: "src/bar.ts", comment: "check this" }],
      images: [
        {
          type: "image",
          id: "img_1",
          filename: "a.png",
          mime: "image/png",
          dataUrl: "data:image/png;base64,AAA",
          publicUrl: "https://media.kolbo.ai/a.png",
        },
      ],
      text: "hello @src/foo.ts @planner",
      messageID: "msg_1",
      sessionID: "ses_1",
      sessionDirectory: "/repo",
    })

    expect(result.requestParts[0]?.type).toBe("text")
    expect(result.requestParts.some((part) => part.type === "agent")).toBe(true)
    expect(
      result.requestParts.some((part) => part.type === "file" && part.url.startsWith("file:///repo/src/foo.ts")),
    ).toBe(true)
    expect(result.requestParts.some((part) => part.type === "text" && part.synthetic)).toBe(true)
    expect(
      result.requestParts.some(
        (part) =>
          part.type === "text" &&
          part.synthetic &&
          part.metadata?.koduComment &&
          (part.metadata.koduComment as { comment?: string }).comment === "check this",
      ),
    ).toBe(true)

    expect(result.optimisticParts).toHaveLength(result.requestParts.length)
    expect(result.optimisticParts.every((part) => part.sessionID === "ses_1" && part.messageID === "msg_1")).toBe(true)
  })

  test("keeps multiple uploaded attachments in order", () => {
    const result = buildRequestParts({
      prompt: [{ type: "text", content: "check these", start: 0, end: 11 }],
      context: [],
      images: [
        {
          type: "image",
          id: "img_1",
          filename: "a.png",
          mime: "image/png",
          dataUrl: "data:image/png;base64,AAA",
          publicUrl: "https://media.kolbo.ai/a.png",
        },
        {
          type: "image",
          id: "img_2",
          filename: "b.pdf",
          mime: "application/pdf",
          dataUrl: "data:application/pdf;base64,BBB",
          publicUrl: "https://media.kolbo.ai/b.pdf",
        },
      ],
      text: "check these",
      messageID: "msg_multi",
      sessionID: "ses_multi",
      sessionDirectory: "/repo",
    })

    const files = result.requestParts.filter((part) => part.type === "file" && part.url.startsWith("https://"))

    expect(files).toHaveLength(2)
    expect(files.every((part) => part.type === "file" && !part.url.startsWith("data:"))).toBe(true)
    expect(files.map((part) => (part.type === "file" ? part.filename : ""))).toEqual(["a.png", "b.pdf"])
  })

  test("omits attachments that only have a base64 dataUrl", () => {
    const result = buildRequestParts({
      prompt: [{ type: "text", content: "look", start: 0, end: 4 }],
      context: [],
      images: [
        { type: "image", id: "img_1", filename: "a.png", mime: "image/png", dataUrl: "data:image/png;base64,AAA" },
      ],
      text: "look",
      messageID: "msg_b64",
      sessionID: "ses_b64",
      sessionDirectory: "/repo",
    })
    expect(result.requestParts.some((part) => part.type === "file" && part.url.startsWith("data:"))).toBe(false)
  })

  test("sends a remembered local path when there is no CDN URL", () => {
    const result = buildRequestParts({
      prompt: [{ type: "text", content: "read this", start: 0, end: 9 }],
      context: [],
      images: [
        {
          type: "image",
          id: "doc_1",
          filename: "cast.xlsx",
          mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          dataUrl: "file:///C:/cast.xlsx",
          localPath: "C:\\cast.xlsx",
        },
      ],
      text: "read this",
      messageID: "msg_path",
      sessionID: "ses_path",
      sessionDirectory: "/repo",
    })
    const file = result.requestParts.find((part) => part.type === "file")
    expect(file).toMatchObject({
      type: "file",
      filename: "C:\\cast.xlsx",
      mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    })
    expect(file && file.type === "file" && file.url.startsWith("file://")).toBe(true)
    expect(result.requestParts.some((part) => part.type === "text" && part.text?.includes("local path: C:\\cast.xlsx"))).toBe(true)
  })

  test("inlines text attachments that have a data:text URL", () => {
    const result = buildRequestParts({
      prompt: [{ type: "text", content: "read this", start: 0, end: 9 }],
      context: [],
      images: [
        {
          type: "image",
          id: "html_1",
          filename: "page.html",
          mime: "text/plain",
          dataUrl: "data:text/plain;base64,PGh0bWw+",
        },
      ],
      text: "read this",
      messageID: "msg_html",
      sessionID: "ses_html",
      sessionDirectory: "/repo",
    })
    const file = result.requestParts.find((part) => part.type === "file")
    expect(file).toMatchObject({ type: "file", mime: "text/plain", url: "data:text/plain;base64,PGh0bWw+" })
  })

  test("deduplicates context files when prompt already includes same path", () => {
    const prompt: Prompt = [{ type: "file", path: "src/foo.ts", content: "@src/foo.ts", start: 0, end: 11 }]

    const result = buildRequestParts({
      prompt,
      context: [
        { key: "ctx:dup", type: "file", path: "src/foo.ts" },
        { key: "ctx:comment", type: "file", path: "src/foo.ts", comment: "focus here" },
      ],
      images: [],
      text: "@src/foo.ts",
      messageID: "msg_2",
      sessionID: "ses_2",
      sessionDirectory: "/repo",
    })

    const fooFiles = result.requestParts.filter(
      (part) => part.type === "file" && part.url.startsWith("file:///repo/src/foo.ts"),
    )
    const synthetic = result.requestParts.filter((part) => part.type === "text" && part.synthetic)

    expect(fooFiles).toHaveLength(2)
    expect(synthetic).toHaveLength(1)
  })

  test("adds file parts for @mentions inside comment text", () => {
    const result = buildRequestParts({
      prompt: [{ type: "text", content: "look", start: 0, end: 4 }],
      context: [
        {
          key: "ctx:comment-mention",
          type: "file",
          path: "src/review.ts",
          comment: "Compare with @src/shared.ts and @src/review.ts.",
        },
      ],
      images: [],
      text: "look",
      messageID: "msg_comment_mentions",
      sessionID: "ses_comment_mentions",
      sessionDirectory: "/repo",
    })

    const files = result.requestParts.filter((part) => part.type === "file")
    expect(files).toHaveLength(2)
    expect(files.some((part) => part.type === "file" && part.url === "file:///repo/src/review.ts")).toBe(true)
    expect(files.some((part) => part.type === "file" && part.url === "file:///repo/src/shared.ts")).toBe(true)
  })

  test("handles Windows paths correctly (simulated on macOS)", () => {
    const prompt: Prompt = [{ type: "file", path: "src\\foo.ts", content: "@src\\foo.ts", start: 0, end: 11 }]

    const result = buildRequestParts({
      prompt,
      context: [],
      images: [],
      text: "@src\\foo.ts",
      messageID: "msg_win_1",
      sessionID: "ses_win_1",
      sessionDirectory: "D:\\projects\\myapp", // Windows path
    })

    // Should create valid file URLs
    const filePart = result.requestParts.find((part) => part.type === "file")
    expect(filePart).toBeDefined()
    if (filePart?.type === "file") {
      // URL should be parseable
      expect(() => new URL(filePart.url)).not.toThrow()
      // Should not have encoded backslashes in wrong place
      expect(filePart.url).not.toContain("%5C")
      // Should have normalized to forward slashes
      expect(filePart.url).toContain("/src/foo.ts")
    }
  })

  test("handles Windows absolute path with special characters", () => {
    const prompt: Prompt = [{ type: "file", path: "file#name.txt", content: "@file#name.txt", start: 0, end: 14 }]

    const result = buildRequestParts({
      prompt,
      context: [],
      images: [],
      text: "@file#name.txt",
      messageID: "msg_win_2",
      sessionID: "ses_win_2",
      sessionDirectory: "C:\\Users\\test\\Documents", // Windows path
    })

    const filePart = result.requestParts.find((part) => part.type === "file")
    expect(filePart).toBeDefined()
    if (filePart?.type === "file") {
      // URL should be parseable
      expect(() => new URL(filePart.url)).not.toThrow()
      // Special chars should be encoded
      expect(filePart.url).toContain("file%23name.txt")
      // Should have Windows drive letter properly encoded
      expect(filePart.url).toMatch(/file:\/\/\/[A-Z]:/)
    }
  })

  test("handles Linux absolute paths correctly", () => {
    const prompt: Prompt = [{ type: "file", path: "src/app.ts", content: "@src/app.ts", start: 0, end: 10 }]

    const result = buildRequestParts({
      prompt,
      context: [],
      images: [],
      text: "@src/app.ts",
      messageID: "msg_linux_1",
      sessionID: "ses_linux_1",
      sessionDirectory: "/home/user/project",
    })

    const filePart = result.requestParts.find((part) => part.type === "file")
    expect(filePart).toBeDefined()
    if (filePart?.type === "file") {
      // URL should be parseable
      expect(() => new URL(filePart.url)).not.toThrow()
      // Should be a normal Unix path
      expect(filePart.url).toBe("file:///home/user/project/src/app.ts")
    }
  })

  test("handles macOS paths correctly", () => {
    const prompt: Prompt = [{ type: "file", path: "README.md", content: "@README.md", start: 0, end: 9 }]

    const result = buildRequestParts({
      prompt,
      context: [],
      images: [],
      text: "@README.md",
      messageID: "msg_mac_1",
      sessionID: "ses_mac_1",
      sessionDirectory: "/Users/kelvin/Projects/kodu",
    })

    const filePart = result.requestParts.find((part) => part.type === "file")
    expect(filePart).toBeDefined()
    if (filePart?.type === "file") {
      // URL should be parseable
      expect(() => new URL(filePart.url)).not.toThrow()
      // Should be a normal Unix path
      expect(filePart.url).toBe("file:///Users/kelvin/Projects/kodu/README.md")
    }
  })

  test("handles context files with Windows paths", () => {
    const prompt: Prompt = []

    const result = buildRequestParts({
      prompt,
      context: [
        { key: "ctx:1", type: "file", path: "src\\utils\\helper.ts" },
        { key: "ctx:2", type: "file", path: "test\\unit.test.ts", comment: "check tests" },
      ],
      images: [],
      text: "test",
      messageID: "msg_win_ctx",
      sessionID: "ses_win_ctx",
      sessionDirectory: "D:\\workspace\\app",
    })

    const fileParts = result.requestParts.filter((part) => part.type === "file")
    expect(fileParts).toHaveLength(2)

    // All file URLs should be valid
    fileParts.forEach((part) => {
      if (part.type === "file") {
        expect(() => new URL(part.url)).not.toThrow()
        expect(part.url).not.toContain("%5C") // No encoded backslashes
      }
    })
  })

  test("handles absolute Windows paths (user manually specifies full path)", () => {
    const prompt: Prompt = [
      { type: "file", path: "D:\\other\\project\\file.ts", content: "@D:\\other\\project\\file.ts", start: 0, end: 25 },
    ]

    const result = buildRequestParts({
      prompt,
      context: [],
      images: [],
      text: "@D:\\other\\project\\file.ts",
      messageID: "msg_abs",
      sessionID: "ses_abs",
      sessionDirectory: "C:\\current\\project",
    })

    const filePart = result.requestParts.find((part) => part.type === "file")
    expect(filePart).toBeDefined()
    if (filePart?.type === "file") {
      // Should handle absolute path that differs from sessionDirectory
      expect(() => new URL(filePart.url)).not.toThrow()
      expect(filePart.url).toContain("/D:/other/project/file.ts")
    }
  })

  test("handles selection with query parameters on Windows", () => {
    const prompt: Prompt = [
      {
        type: "file",
        path: "src\\App.tsx",
        content: "@src\\App.tsx",
        start: 0,
        end: 11,
        selection: { startLine: 10, startChar: 0, endLine: 20, endChar: 5 },
      },
    ]

    const result = buildRequestParts({
      prompt,
      context: [],
      images: [],
      text: "@src\\App.tsx",
      messageID: "msg_sel",
      sessionID: "ses_sel",
      sessionDirectory: "C:\\project",
    })

    const filePart = result.requestParts.find((part) => part.type === "file")
    expect(filePart).toBeDefined()
    if (filePart?.type === "file") {
      // Should have query parameters
      expect(filePart.url).toContain("?start=10&end=20")
      // Should be valid URL
      expect(() => new URL(filePart.url)).not.toThrow()
      // Query params should parse correctly
      const url = new URL(filePart.url)
      expect(url.searchParams.get("start")).toBe("10")
      expect(url.searchParams.get("end")).toBe("20")
    }
  })

  test("handles file paths with dots and special segments on Windows", () => {
    const prompt: Prompt = [
      { type: "file", path: "..\\..\\shared\\util.ts", content: "@..\\..\\shared\\util.ts", start: 0, end: 21 },
    ]

    const result = buildRequestParts({
      prompt,
      context: [],
      images: [],
      text: "@..\\..\\shared\\util.ts",
      messageID: "msg_dots",
      sessionID: "ses_dots",
      sessionDirectory: "C:\\projects\\myapp\\src",
    })

    const filePart = result.requestParts.find((part) => part.type === "file")
    expect(filePart).toBeDefined()
    if (filePart?.type === "file") {
      // Should be valid URL
      expect(() => new URL(filePart.url)).not.toThrow()
      // Should preserve .. segments (backend normalizes)
      expect(filePart.url).toContain("/..")
    }
  })

  test("binds a Visual DNA mention to its id and attaches the reference image", () => {
    const prompt: Prompt = [
      {
        type: "kolbo-asset",
        kind: "visual-dna",
        id: "vdna_abc",
        name: "maya",
        thumbnail: "https://cdn.kolbo.ai/dna/maya.png",
        content: "@maya",
        start: 0,
        end: 5,
      },
    ]

    const result = buildRequestParts({
      prompt,
      context: [],
      images: [],
      text: "@maya walking in Tokyo",
      messageID: "msg_dna",
      sessionID: "ses_dna",
      sessionDirectory: "/repo",
    })

    // The id binding — without it a duplicate DNA name resolves first-match server-side.
    const note = result.requestParts.find((part) => part.type === "text" && part.synthetic)
    expect(note?.type === "text" && note.text).toContain("vdna_abc")
    expect(note?.type === "text" && note.text).toContain("@maya")
    expect(note?.type === "text" && note.text).toContain("visual_dna_ids")

    // The reference image, as an http(s) file part the server inlines as base64.
    const image = result.requestParts.find((part) => part.type === "file")
    expect(image?.type === "file" && image.url).toBe("https://cdn.kolbo.ai/dna/maya.png")
    expect(image?.type === "file" && image.mime).toBe("image/png")
  })

  test("a moodboard mention binds moodboard_id; a thumbnail-less asset still binds", () => {
    const prompt: Prompt = [
      { type: "kolbo-asset", kind: "moodboard", id: "mb_1", name: "noir", content: "#noir", start: 0, end: 5 },
    ]

    const result = buildRequestParts({
      prompt,
      context: [],
      images: [],
      text: "#noir",
      messageID: "msg_mb",
      sessionID: "ses_mb",
      sessionDirectory: "/repo",
    })

    const note = result.requestParts.find((part) => part.type === "text" && part.synthetic)
    expect(note?.type === "text" && note.text).toContain("mb_1")
    expect(note?.type === "text" && note.text).toContain("moodboard_id")
    // No thumbnail → no file part, rather than a broken one.
    expect(result.requestParts.some((part) => part.type === "file")).toBe(false)
  })

  test("injects a synthetic kolbo project part when a project is linked", () => {
    const result = buildRequestParts({
      prompt: [{ type: "text", content: "make an image", start: 0, end: 13 }],
      context: [],
      images: [],
      text: "make an image",
      messageID: "msg_kp",
      sessionID: "ses_kp",
      sessionDirectory: "/repo",
      kolboProject: { id: "68e5e", name: "Summer Campaign" },
    })

    const note = result.requestParts.find(
      (part) => part.type === "text" && part.synthetic && part.text.includes("68e5e"),
    )
    expect(note).toBeTruthy()
    expect(note?.type === "text" && note.text).toContain("project_id")
    expect(note?.type === "text" && note.text).toContain("Summer Campaign")
  })

  test("injects nothing when no kolbo project is linked", () => {
    const result = buildRequestParts({
      prompt: [{ type: "text", content: "make an image", start: 0, end: 13 }],
      context: [],
      images: [],
      text: "make an image",
      messageID: "msg_kp2",
      sessionID: "ses_kp2",
      sessionDirectory: "/repo",
    })

    expect(result.requestParts.some((part) => part.type === "text" && part.text.includes("project_id"))).toBe(false)
  })
})
