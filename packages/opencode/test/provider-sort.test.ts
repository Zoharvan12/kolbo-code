import { describe, expect, test } from "bun:test"
import { Provider } from "../src/provider/provider"

describe("Provider.sort", () => {
  test("returns empty array when models is empty — [0]?.id must not throw", () => {
    const models: Array<{ id: string }> = []
    const result = Provider.sort(models)
    expect(result).toEqual([])
    expect(result[0]).toBeUndefined()
    expect(result[0]?.id).toBeUndefined()
  })
})
