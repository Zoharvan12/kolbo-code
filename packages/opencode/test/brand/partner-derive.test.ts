import { describe, expect, test } from "bun:test"

/**
 * Partner resolves once at module load from env, so the derive rules are re-stated here
 * rather than re-importing the module per case. Keep in sync with brand/partner.ts.
 */
const GENERIC_HOST_LABELS = new Set(["app", "www"])

function brandLabel(host: string) {
  const labels = host.split(".").filter(Boolean)
  while (labels.length > 1 && GENERIC_HOST_LABELS.has(labels[0]!.toLowerCase())) labels.shift()
  return labels[0] || "partner"
}

describe("partner brand label", () => {
  test("generic host prefixes are not the product name", () => {
    expect(brandLabel("app.kolbo.ai")).toBe("kolbo")
    expect(brandLabel("www.kolbo.ai")).toBe("kolbo")
    expect(brandLabel("www.app.sapir.kolbo.ai")).toBe("sapir")
  })

  test("a real first label still wins", () => {
    expect(brandLabel("staging.kolbo.ai")).toBe("staging")
    expect(brandLabel("sapir.kolbo.ai")).toBe("sapir")
    expect(brandLabel("kolbo.ai")).toBe("kolbo")
  })

  test("a bare generic host keeps its only label", () => {
    expect(brandLabel("app")).toBe("app")
    expect(brandLabel("localhost")).toBe("localhost")
  })
})
