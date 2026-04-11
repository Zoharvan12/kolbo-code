import { Bus } from "@/bus"
import { Config } from "@/config/config"
import { Flag } from "@/flag/flag"
import { Installation } from "@/installation"

export async function upgrade() {
  const config = await Config.getGlobal()
  const method = await Installation.method()
  const latest = await Installation.latest(method).catch(() => {})
  if (!latest) return

  if (Flag.KOLBO_ALWAYS_NOTIFY_UPDATE) {
    await Bus.publish(Installation.Event.UpdateAvailable, { version: latest })
    return
  }

  if (Installation.VERSION === latest) return
  if (config.autoupdate === false || Flag.KOLBO_DISABLE_AUTOUPDATE) return

  // Always notify — never silently auto-upgrade. A silent upgrade via npm
  // install can leave the user with a broken install if the platform-specific
  // binary package hasn't been published yet when the wrapper is fetched.
  await Bus.publish(Installation.Event.UpdateAvailable, { version: latest })
}
