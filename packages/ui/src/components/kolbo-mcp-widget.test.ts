import { describe, expect, test } from "bun:test"
import { createStore } from "solid-js/store"
import { serializeForWidget } from "./kolbo-mcp-widget"

describe("serializeForWidget", () => {
  test("resolves a live store Proxy to a plain, deep-equal object", () => {
    // `structured()` can hand `payload()` a store value straight off the
    // session store, still wrapped in a Solid Proxy — e.g. `build()` returning
    // `metadata.structuredContent` directly. Chromium's structured-clone
    // algorithm (what WebView2's postMessage uses) refuses a Proxy outright
    // with "DataCloneError: ... could not be cloned" — that is the bug this
    // guards. Bun's own structuredClone does not reproduce that throw on this
    // shape (engines differ on Proxy handling), so this test asserts the
    // portable, actually-meaningful contract instead: the Proxy is gone and
    // the data survives intact — not the browser-specific throw.
    const [store] = createStore({ widget: "generation", settings: { visual_dna_ids: ["vdna_1"] } })
    const safe = serializeForWidget(store)
    expect(safe).toEqual({ widget: "generation", settings: { visual_dna_ids: ["vdna_1"] } })
    expect(safe).not.toBe(store)
    expect(Object.getPrototypeOf(safe)).toBe(Object.prototype)
  })

  test("passes plain data through unchanged", () => {
    expect(serializeForWidget({ a: 1, b: [1, 2, 3] })).toEqual({ a: 1, b: [1, 2, 3] })
  })

  test("degrades to undefined instead of throwing on a non-serializable value", () => {
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    expect(serializeForWidget(cyclic)).toBeUndefined()
  })
})
