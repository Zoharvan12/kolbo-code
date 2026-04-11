import path from "path"
import { Process } from "./process"

export namespace Archive {
  /**
   * Zip-slip pre-check: enumerate the archive's entries BEFORE extracting
   * and refuse anything that could escape the destination directory.
   *
   * Modern Info-ZIP `unzip` (≥6.0, 2009) and Windows `Expand-Archive`
   * (patched for CVE-2022-26372) already reject these at extraction
   * time, but we do our own pass as defense-in-depth so the CLI stays
   * safe even on older / custom extractor binaries.
   *
   * Rejects:
   *   - absolute paths (`/etc/passwd`, `C:\Windows\...`)
   *   - any path segment equal to `..`
   *   - entries that resolve outside `destDir` after normalization
   */
  async function assertSafeEntries(zipPath: string, destDir: string) {
    const destAbs = path.resolve(destDir)
    let entries: string[]
    if (process.platform === "win32") {
      // PowerShell: open the zip as a read-only System.IO.Compression.ZipArchive
      // and emit one FullName per line. Quoting uses single-quoted strings
      // with PowerShell-style doubled-single-quote escaping so paths with
      // apostrophes can't break out of the argument.
      const safeZip = path.resolve(zipPath).replace(/'/g, "''")
      const ps =
        "Add-Type -AssemblyName System.IO.Compression.FileSystem; " +
        `$z = [System.IO.Compression.ZipFile]::OpenRead('${safeZip}'); ` +
        "try { foreach ($e in $z.Entries) { [Console]::Out.WriteLine($e.FullName) } } finally { $z.Dispose() }"
      const out = await Process.run(["powershell", "-NoProfile", "-NonInteractive", "-Command", ps])
      entries = String(out?.stdout ?? "")
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean)
    } else {
      // Info-ZIP unzip: -Z1 lists one filename per line without the
      // verbose header. Works on all distros that ship Info-ZIP.
      const out = await Process.run(["unzip", "-Z1", zipPath])
      entries = String(out?.stdout ?? "")
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean)
    }
    for (const entry of entries) {
      if (path.isAbsolute(entry) || /^[A-Za-z]:[\\/]/.test(entry)) {
        throw new Error(`Refusing to extract zip with absolute path entry: ${entry}`)
      }
      const segments = entry.split(/[\\/]/)
      if (segments.some((s) => s === "..")) {
        throw new Error(`Refusing to extract zip with .. path traversal: ${entry}`)
      }
      const resolved = path.resolve(destAbs, entry)
      const rel = path.relative(destAbs, resolved)
      if (rel.startsWith("..") || path.isAbsolute(rel)) {
        throw new Error(`Refusing to extract zip entry that escapes destDir: ${entry}`)
      }
    }
  }

  export async function extractZip(zipPath: string, destDir: string) {
    await assertSafeEntries(zipPath, destDir)

    if (process.platform === "win32") {
      const winZipPath = path.resolve(zipPath)
      const winDestDir = path.resolve(destDir)
      // $global:ProgressPreference suppresses PowerShell's blue progress bar popup
      const cmd = `$global:ProgressPreference = 'SilentlyContinue'; Expand-Archive -Path '${winZipPath}' -DestinationPath '${winDestDir}' -Force`
      await Process.run(["powershell", "-NoProfile", "-NonInteractive", "-Command", cmd])
      return
    }

    await Process.run(["unzip", "-o", "-q", zipPath, "-d", destDir])
  }
}
