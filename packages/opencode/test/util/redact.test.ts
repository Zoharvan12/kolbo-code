import { describe, test, expect } from "bun:test"
import { redactSecrets } from "../../src/util/redact"

describe("redactSecrets", () => {
  test("returns empty input unchanged", () => {
    expect(redactSecrets("")).toBe("")
  })

  test("leaves unrelated text alone", () => {
    expect(redactSecrets("hello world this is fine")).toBe("hello world this is fine")
  })

  test("redacts GitHub personal access tokens", () => {
    const out = redactSecrets("token=ghp_abcdefghijklmnopqrstuvwxyzABCDEFGHIJ")
    expect(out).not.toContain("ghp_abcdefghij")
    expect(out).toContain("[REDACTED]")
  })

  test("redacts GitHub fine-grained PATs", () => {
    const out = redactSecrets("github_pat_11AAAAAAA0abcdefghijklmnopqrstuvwxyz")
    expect(out).not.toContain("github_pat_11AAAAAAA0abcde")
  })

  test("redacts OpenAI sk- keys", () => {
    const out = redactSecrets("OPENAI_API_KEY=sk-proj-aaaaaaaaaaaaaaaaaaaaaaaa")
    expect(out).not.toContain("sk-proj-aaaaaaaaaaa")
    expect(out).toContain("[REDACTED]")
  })

  test("redacts Anthropic sk-ant- keys", () => {
    const out = redactSecrets("key: sk-ant-api01-abcdefghijklmnopqrstuvwxyz")
    expect(out).not.toContain("sk-ant-api01-abcdefghij")
  })

  test("redacts AWS access key ids", () => {
    const out = redactSecrets("AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE")
    expect(out).not.toContain("AKIAIOSFODNN7EXAMPLE")
    expect(out).toContain("AKIA[REDACTED]")
  })

  test("redacts AWS temporary credentials (ASIA)", () => {
    const out = redactSecrets("ASIAIOSFODNN7EXAMPLE")
    expect(out).not.toContain("ASIAIOSFODNN7EXAMPLE")
  })

  test("redacts Google API keys", () => {
    // Google API keys are exactly `AIza` + 35 chars
    const out = redactSecrets("key=AIzaSyDdI0hCZtEAKa3xjMTSt8jxtfM2jxQjU8w")
    expect(out).not.toContain("AIzaSyDdI0hCZtEAKa3xjMTSt8jxtfM2jxQjU8w")
    expect(out).toContain("AIza[REDACTED]")
  })

  test("redacts Slack bot tokens", () => {
    const out = redactSecrets("xoxb-1234567890-abcdefghij")
    expect(out).not.toContain("xoxb-1234567890")
  })

  test("redacts JWT tokens", () => {
    const jwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c"
    const out = redactSecrets(`Authorization: Bearer ${jwt}`)
    expect(out).not.toContain("eyJzdWIiOiIxMjM0NTY3ODkwIn0")
    expect(out).toContain("[REDACTED]")
  })

  test("redacts Authorization Bearer header values", () => {
    const out = redactSecrets("Authorization: Bearer mysupersecretbeartokenthatshouldnotleak")
    expect(out).not.toContain("mysupersecretbeartoken")
  })

  test("redacts Authorization Basic header values", () => {
    const out = redactSecrets("Authorization: Basic dXNlcjpwYXNzd29yZA==")
    expect(out).not.toContain("dXNlcjpwYXNzd29yZA==")
  })

  test("redacts password assignments", () => {
    const out = redactSecrets('password="hunter2hunter2hunter2"')
    expect(out).not.toContain("hunter2hunter2hunter2")
  })

  test("redacts api_key assignments with various separators", () => {
    expect(redactSecrets("api_key=longenoughsecret123")).not.toContain("longenoughsecret123")
    expect(redactSecrets("api-key: longenoughsecret123")).not.toContain("longenoughsecret123")
    expect(redactSecrets('apikey="longenoughsecret123"')).not.toContain("longenoughsecret123")
  })

  test("redacts PEM private key blocks", () => {
    const pem = "-----BEGIN RSA PRIVATE KEY-----\nMIIBOgIBAAJBAKj34GkxFhD90vcNLYLInFEX6Ppy1tPf9Cnzj4p4WGeKLs1Pt8Qu\n-----END RSA PRIVATE KEY-----"
    const out = redactSecrets(`Here is my key: ${pem}`)
    expect(out).not.toContain("MIIBOgIBAAJBAKj34Gk")
    expect(out).toContain("[REDACTED PRIVATE KEY]")
  })

  test("does NOT redact short tokens that look key-shaped", () => {
    // 8-char value below the 12-char minimum for env-style assignment redaction
    expect(redactSecrets("token=abc")).toBe("token=abc")
  })

  test("redacts multiple secrets in a single string", () => {
    const input = "AWS_KEY=AKIAIOSFODNN7EXAMPLE and GH=ghp_abcdefghijklmnopqrstuvwxyz1234567890"
    const out = redactSecrets(input)
    expect(out).not.toContain("AKIAIOSFODNN7EXAMPLE")
    expect(out).not.toContain("ghp_abcdefghij")
  })
})
