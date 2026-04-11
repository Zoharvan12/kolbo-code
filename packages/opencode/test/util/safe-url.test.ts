import { describe, test, expect } from "bun:test"
import { assertSafeConfigUrl, assertPublicUrl } from "../../src/util/safe-url"

describe("assertSafeConfigUrl", () => {
  test("accepts https public URLs", () => {
    expect(() => assertSafeConfigUrl("test", "https://example.com")).not.toThrow()
  })

  test("accepts https private/internal hostnames", () => {
    // Config URLs may legitimately point at internal services.
    expect(() => assertSafeConfigUrl("test", "https://mcp.internal.corp")).not.toThrow()
    expect(() => assertSafeConfigUrl("test", "https://10.0.0.5")).not.toThrow()
  })

  test("accepts http://localhost", () => {
    expect(() => assertSafeConfigUrl("test", "http://localhost:8080")).not.toThrow()
    expect(() => assertSafeConfigUrl("test", "http://127.0.0.1:5050")).not.toThrow()
  })

  test("rejects http:// to non-local hosts", () => {
    expect(() => assertSafeConfigUrl("test", "http://example.com")).toThrow(/https/)
    expect(() => assertSafeConfigUrl("test", "http://10.0.0.5")).toThrow(/https/)
  })

  test("rejects non-http schemes", () => {
    expect(() => assertSafeConfigUrl("test", "file:///etc/passwd")).toThrow(/https/)
    expect(() => assertSafeConfigUrl("test", "ftp://example.com")).toThrow(/https/)
    expect(() => assertSafeConfigUrl("test", "javascript:alert(1)")).toThrow(/https/)
  })

  test("rejects malformed URLs", () => {
    expect(() => assertSafeConfigUrl("test", "not a url at all")).toThrow(/valid URL/)
  })

  test("includes the source label in error messages", () => {
    expect(() => assertSafeConfigUrl("KOLBO_API_BASE", "http://evil.com")).toThrow(/KOLBO_API_BASE/)
  })
})

describe("assertPublicUrl", () => {
  test("accepts public IPs (literal)", async () => {
    await expect(assertPublicUrl("https://8.8.8.8")).resolves.toBeUndefined()
  })

  test("rejects loopback literal", async () => {
    await expect(assertPublicUrl("http://127.0.0.1")).rejects.toThrow(/private|internal/)
    await expect(assertPublicUrl("http://127.0.0.5")).rejects.toThrow(/private|internal/)
  })

  test("rejects RFC1918 ranges", async () => {
    await expect(assertPublicUrl("http://10.0.0.1")).rejects.toThrow(/private|internal/)
    await expect(assertPublicUrl("http://172.16.0.1")).rejects.toThrow(/private|internal/)
    await expect(assertPublicUrl("http://192.168.1.1")).rejects.toThrow(/private|internal/)
  })

  test("rejects link-local + AWS metadata address", async () => {
    await expect(assertPublicUrl("http://169.254.169.254")).rejects.toThrow(/private|internal/)
  })

  test("rejects CGNAT range", async () => {
    await expect(assertPublicUrl("http://100.64.0.1")).rejects.toThrow(/private|internal/)
  })

  test("rejects 0.0.0.0", async () => {
    await expect(assertPublicUrl("http://0.0.0.0")).rejects.toThrow(/private|internal/)
  })

  test("rejects multicast / reserved high ranges", async () => {
    await expect(assertPublicUrl("http://224.0.0.1")).rejects.toThrow(/private|internal/)
  })

  test("rejects IPv6 loopback and link-local", async () => {
    await expect(assertPublicUrl("http://[::1]")).rejects.toThrow(/private|internal/)
    await expect(assertPublicUrl("http://[fe80::1]")).rejects.toThrow(/private|internal/)
  })

  test("rejects IPv6 unique local (fc00::/7)", async () => {
    await expect(assertPublicUrl("http://[fc00::1]")).rejects.toThrow(/private|internal/)
    await expect(assertPublicUrl("http://[fd12:3456::1]")).rejects.toThrow(/private|internal/)
  })

  test("rejects IPv4-mapped private addresses (::ffff:10.0.0.1)", async () => {
    await expect(assertPublicUrl("http://[::ffff:10.0.0.1]")).rejects.toThrow(/private|internal/)
  })

  test("rejects 'localhost' hostname literal", async () => {
    await expect(assertPublicUrl("http://localhost")).rejects.toThrow(/internal host|private|internal/)
  })

  test("rejects '.local' mDNS hostnames", async () => {
    await expect(assertPublicUrl("http://my-printer.local")).rejects.toThrow(/internal host/)
  })

  test("rejects trailing-dot localhost canonicalization bypass", async () => {
    await expect(assertPublicUrl("http://localhost.")).rejects.toThrow(/internal host/)
  })

  test("rejects metadata.google.internal", async () => {
    await expect(assertPublicUrl("http://metadata.google.internal")).rejects.toThrow(/internal host/)
  })

  test("rejects non-http schemes", async () => {
    await expect(assertPublicUrl("file:///etc/passwd")).rejects.toThrow(/http/)
    await expect(assertPublicUrl("javascript:alert(1)")).rejects.toThrow(/http/)
  })

  test("rejects malformed URLs", async () => {
    await expect(assertPublicUrl("not a url")).rejects.toThrow(/Invalid URL/)
  })
})
