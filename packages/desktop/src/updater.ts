import { check } from "@tauri-apps/plugin-updater"
import { relaunch } from "@tauri-apps/plugin-process"
import { ask, message } from "@tauri-apps/plugin-dialog"
import { type as ostype } from "@tauri-apps/plugin-os"
import { openUrl } from "@tauri-apps/plugin-opener"

import { initI18n, t } from "./i18n"
import { commands } from "./bindings"

export const UPDATER_ENABLED = window.__KOLBO_CODE__?.updaterEnabled ?? false

const RELEASES_URL = "https://github.com/Zoharvan12/kolbo-releases/releases/latest"
const INSTALL_WATCHDOG_MS = 60_000

// Background auto-update with a visible installer fallback. Modeled on the
// Chrome / Discord / VSCode pattern: check → download → install → relaunch,
// no user prompt on the happy path. If the silent install ever fails (AV
// block, locked binary, NSIS UAC denial, signature mismatch), we surface a
// dialog offering to open the releases page so the user can install manually.
// Works identically on Windows (NSIS handles relaunch) and macOS (we
// explicitly relaunch since the .app swap doesn't restart the running
// process).
export async function runUpdater({ alertOnFail }: { alertOnFail: boolean }) {
  await initI18n()

  let update
  try {
    update = await check()
  } catch {
    if (alertOnFail)
      await message(t("desktop.updater.checkFailed.message"), { title: t("desktop.updater.checkFailed.title") })
    return
  }

  if (!update) {
    if (alertOnFail) await message(t("desktop.updater.none.message"), { title: t("desktop.updater.none.title") })
    return
  }

  try {
    await update.download()
  } catch {
    if (alertOnFail)
      await message(t("desktop.updater.downloadFailed.message"), { title: t("desktop.updater.downloadFailed.title") })
    return
  }

  // Race the install against a 60s watchdog. If install() resolves the OS is
  // already swapping the binary (Windows NSIS relaunches the app itself; we
  // don't reach the `relaunch()` line below). If it throws or hangs past the
  // watchdog deadline, fall through to the visible-fallback path.
  let installError: unknown
  try {
    await commands.killSidecar()
    await Promise.race([
      update.install(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("install-watchdog-timeout")), INSTALL_WATCHDOG_MS),
      ),
    ])
  } catch (e) {
    installError = e
  }

  if (installError) {
    // Silent install failed (AV block / locked binary / NSIS UAC denial /
    // signature mismatch / hung). ALWAYS tell the user even when
    // alertOnFail=false — we've already committed to downloading the bytes;
    // silently giving up would strand them on the old version.
    console.warn("[updater] silent install failed:", installError)
    const proceed = await ask(
      t("desktop.updater.silentFailed.message", { version: update.version }),
      { title: t("desktop.updater.silentFailed.title") },
    )
    if (proceed) {
      try {
        await openUrl(RELEASES_URL)
      } catch {
        // Last-resort: even the system browser handoff failed
        await message(`${t("desktop.updater.silentFailed.fallback")}\n\n${RELEASES_URL}`, {
          title: t("desktop.updater.silentFailed.title"),
        })
      }
    }
    return
  }

  // Windows NSIS handles relaunch itself; macOS / Linux need an explicit one
  if (ostype() !== "windows") {
    await relaunch()
  }
}
