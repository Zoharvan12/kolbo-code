import { describe, expect, test } from "bun:test"
import { mediaLabels } from "./media-labels"

describe("mediaLabels", () => {
  test("numbers each kind independently, in attachment order", () => {
    expect(
      mediaLabels([
        { mime: "image/png" },
        { mime: "video/mp4" },
        { mime: "image/jpeg" },
        { mime: "audio/mpeg" },
        { mime: "application/pdf" },
        { mime: "text/plain" },
        { mime: "text/plain", filename: "page.html" },
        { mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", filename: "cast.xlsx" },
      ]),
    ).toEqual(["image1", "video1", "image2", "audio1", "pdf1", "file1", "html1", "sheet1"])
  })
})
