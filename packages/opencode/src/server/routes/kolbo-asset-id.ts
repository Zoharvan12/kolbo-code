/** Mongo ObjectIds sometimes leak as `{ buffer: {0:n,…} }` in JSON — String(id) then
 *  becomes "[object Object]" for EVERY row, so one picker select checks the whole grid. */
export function assetId(raw: unknown): string | null {
  if (raw == null) return null
  if (typeof raw === "string") {
    const s = raw.trim()
    return s && s !== "[object Object]" ? s : null
  }
  if (typeof raw === "number" || typeof raw === "bigint") return String(raw)
  if (typeof raw !== "object") return null
  const obj = raw as Record<string, any>
  if (typeof obj.toHexString === "function") {
    const hex = obj.toHexString()
    if (typeof hex === "string" && hex) return hex
  }
  if (typeof obj.toString === "function" && obj.toString !== Object.prototype.toString) {
    const s = obj.toString()
    if (s && s !== "[object Object]") return s
  }
  if (obj.type === "Buffer" && Array.isArray(obj.data)) {
    return (obj.data as number[]).map((b) => (b & 0xff).toString(16).padStart(2, "0")).join("")
  }
  if (obj.buffer != null) {
    const buf = obj.buffer
    const bytes = Array.isArray(buf)
      ? buf
      : typeof buf === "object"
        ? Object.keys(buf as object)
            .filter((k) => /^\d+$/.test(k))
            .sort((a, b) => Number(a) - Number(b))
            .map((k) => Number((buf as Record<string, number>)[k]))
        : []
    if (bytes.length) return bytes.map((b) => (b & 0xff).toString(16).padStart(2, "0")).join("")
  }
  return null
}
