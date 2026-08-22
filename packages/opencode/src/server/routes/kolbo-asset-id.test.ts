import { describe, expect, test } from "bun:test"
import { assetId } from "./kolbo-asset-id"

describe("assetId", () => {
  test("keeps hex strings", () => {
    expect(assetId("6a887a0298a9ef005e30cb65")).toBe("6a887a0298a9ef005e30cb65")
  })

  test("rejects the collapsed String(object) sentinel", () => {
    expect(assetId("[object Object]")).toBeNull()
  })

  test("recovers BSON ObjectId leaked as { buffer: {0:n,…} }", () => {
    expect(
      assetId({
        buffer: { 0: 106, 1: 136, 2: 122, 3: 2, 4: 152, 5: 169, 6: 239, 7: 0, 8: 94, 9: 48, 10: 203, 11: 101 },
      }),
    ).toBe("6a887a0298a9ef005e30cb65")
  })

  test("recovers Node Buffer JSON", () => {
    expect(assetId({ type: "Buffer", data: [106, 136, 122, 2, 152, 169, 239, 0, 94, 48, 203, 101] })).toBe(
      "6a887a0298a9ef005e30cb65",
    )
  })

  test("uses toHexString when present", () => {
    expect(assetId({ toHexString: () => "aabbccddeeff001122334455" })).toBe("aabbccddeeff001122334455")
  })
})
