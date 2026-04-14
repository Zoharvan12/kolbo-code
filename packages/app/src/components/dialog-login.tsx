import { createSignal, onCleanup, Show } from "solid-js"
import { useGlobalSDK } from "@/context/global-sdk"
import { usePlatform } from "@/context/platform"
import { useLanguage } from "@/context/language"

interface Props {
  onDone: () => void
}

const KolboLogo = (props: { class?: string }) => (
  <svg class={props.class} viewBox="0 0 389.03 469.15" xmlns="http://www.w3.org/2000/svg" fill="currentColor">
    <path d="M66.58.17c.92-.08,1.85-.13,2.77-.15,31.93-.72,58.76,17.64,69.26,47.85,4.38,12.59,3.67,24.74,3.71,37.81l.17,35.22c20.47-12.42,41.02-24.71,61.64-36.87l52.28-31.06c26.66-15.74,49.05-33.69,81.84-25.36,16.47,4.08,30.6,14.65,39.18,29.29,8.95,15.13,11.55,33.18,7.26,50.22-3.09,12.25-9.76,23.3-19.16,31.73-7.98,7.23-19.59,13.47-29.03,18.93l-29.54,17.11-116.52,67.76c-27.02,14.92-43.25,35.29-47.26,66.69-1.09,8.52-.71,19.49-.72,28.26v43.96c.04,23.37.04,40.52-15.36,59.79-40.68,50.89-119.72,26.02-126.46-37.91-.88-8.36-.57-16.61-.56-24.98l.03-36.6v-121.05s0-104.63,0-104.63l-.02-31.62c0-7.35-.24-15.44.7-22.64,1.61-12.74,6.71-24.78,14.75-34.79C29.14,10.22,45.35,2.35,66.58.17Z"/>
    <path d="M230.46,247.18l.71-.07c18.22-1.57,40.46,5.25,54.11,17.39,7.12,6.33,13.67,12.77,20.47,19.47l33.35,33.18,20.89,20.64c5.43,5.34,12.95,12.32,17.02,18.53,6.45,9.85,10.79,22.69,11.77,34.4,1.59,19.48-4.58,38.81-17.16,53.77-12.15,14.11-29.34,22.9-47.89,24.47-20.18,1.26-40.14-3.82-55.82-16.78-5.28-4.38-10.61-9.88-15.53-14.76l-24.18-23.99-29.91-29.52c-18.52-18.33-32.12-30.07-34.93-57.93-1.96-18.77,3.66-37.55,15.62-52.15,13.28-16.18,30.92-24.52,51.49-26.64Z"/>
  </svg>
)

export function DialogLogin(props: Props) {
  const globalSDK = useGlobalSDK()
  const platform = usePlatform()
  const language = useLanguage()

  const [phase, setPhase] = createSignal<"idle" | "waiting" | "error">("idle")
  const [code, setCode] = createSignal("")
  const [loginUrl, setLoginUrl] = createSignal("")
  const [error, setError] = createSignal("")
  const [copied, setCopied] = createSignal(false)

  let cancelled = false
  onCleanup(() => { cancelled = true })

  async function handleLogin() {
    setPhase("waiting")
    setError("")
    setCode("")
    setLoginUrl("")

    try {
      // Step 1: start device-code OAuth on the CLI server (no CORS — runs server-side)
      const authRes = await globalSDK.client.provider.oauth.authorize(
        { providerID: "kolbo", method: 0 },
        { throwOnError: true },
      )

      if (cancelled) return

      const authorization = authRes.data
      if (authorization?.url) setLoginUrl(authorization.url)

      // Extract confirmation code from "Enter code: XXXX"
      const instructions = authorization?.instructions ?? ""
      const codeMatch = instructions.includes(":") ? instructions.split(":")[1]?.trim() : instructions
      if (codeMatch) setCode(codeMatch)

      // CLI already opened the browser — now poll until user authenticates
      const callbackResult = await globalSDK.client.provider.oauth
        .callback({ providerID: "kolbo", method: 0 })
        .then((value) => (value.error ? { ok: false as const, error: value.error } : { ok: true as const }))
        .catch((err: unknown) => ({ ok: false as const, error: err }))

      if (cancelled) return

      if (!callbackResult.ok) {
        setError("Sign-in failed. Please try again.")
        setPhase("error")
        return
      }

      await globalSDK.client.global.dispose()
      props.onDone()
    } catch (err: any) {
      if (!cancelled) {
        setError(err?.message || "Sign-in failed. Please try again.")
        setPhase("error")
      }
    }
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code())
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {}
  }

  return (
    <div class="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div class="w-full max-w-sm mx-4 bg-surface-base rounded-2xl border border-border-weak-base shadow-2xl overflow-hidden">

        {/* Header */}
        <div class="flex flex-col items-center gap-4 pt-8 pb-6 px-8">
          <KolboLogo class="w-11 h-11 text-text-strong" />
          <div class="flex flex-col items-center gap-1.5 text-center">
            <h1 class="text-16-medium text-text-strong">{language.t("dialog.login.title")}</h1>
            <p class="text-13-regular text-text-weak">{language.t("dialog.login.subtitle")}</p>
          </div>
        </div>

        {/* Divider */}
        <div class="h-px bg-border-weaker-base mx-0" />

        {/* Body */}
        <div class="px-8 py-6 flex flex-col gap-4">

          {/* Idle / error state — show login button */}
          <Show when={phase() === "idle" || phase() === "error"}>
            <button
              type="button"
              onClick={handleLogin}
              class="w-full flex items-center justify-center gap-2.5 h-10 rounded-lg bg-primary text-white text-13-medium transition-all hover:brightness-110 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface-base"
            >
              <KolboLogo class="w-4 h-4 shrink-0" />
              {language.t("dialog.login.button.continue")}
            </button>

            <Show when={error()}>
              <div class="flex items-center gap-2 rounded-lg bg-surface-critical-base border border-[var(--color-error,#dc2626)]/20 px-3 py-2.5">
                <svg class="w-3.5 h-3.5 shrink-0 text-[var(--color-error,#dc2626)]" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8Zm7.25-3.25a.75.75 0 0 1 1.5 0v3.5a.75.75 0 0 1-1.5 0v-3.5Zm.75 7a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z"/>
                </svg>
                <span class="text-12-regular text-[var(--color-error,#dc2626)]">{error()}</span>
              </div>
            </Show>
          </Show>

          {/* Waiting state — browser opened, show confirmation code */}
          <Show when={phase() === "waiting"}>
            <div class="flex flex-col gap-5">

              {/* Status row */}
              <div class="flex items-center gap-3 rounded-lg bg-surface-raised-base border border-border-weak-base px-3.5 py-3">
                <div class="relative flex h-2 w-2 shrink-0">
                  <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                  <span class="relative inline-flex rounded-full h-2 w-2 bg-primary" />
                </div>
                <span class="text-13-regular text-text-base">{language.t("dialog.login.status.browserOpened")}</span>
              </div>

              {/* Confirmation code */}
              <Show when={code()}>
                <div class="flex flex-col gap-2">
                  <div class="flex items-center justify-between">
                    <span class="text-11-regular text-text-weaker uppercase tracking-wider">{language.t("dialog.login.confirmationCode")}</span>
                    <button
                      type="button"
                      onClick={copyCode}
                      class="flex items-center gap-1 text-11-regular text-primary hover:text-text-strong transition-colors"
                    >
                      <Show when={copied()} fallback={
                        <>
                          <svg class="w-3 h-3" viewBox="0 0 16 16" fill="currentColor">
                            <path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25Z"/>
                            <path d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z"/>
                          </svg>
                          {language.t("dialog.login.copy")}
                        </>
                      }>
                        <svg class="w-3 h-3" viewBox="0 0 16 16" fill="currentColor">
                          <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z"/>
                        </svg>
                        {language.t("dialog.login.copied")}
                      </Show>
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={copyCode}
                    class="w-full font-mono text-20 font-semibold text-text-strong tracking-[0.25em] bg-surface-raised-base hover:bg-surface-raised-base-hover rounded-lg px-4 py-3 text-center border border-border-weak-base transition-colors cursor-pointer select-all"
                  >
                    {code()}
                  </button>
                  <p class="text-11-regular text-text-weaker text-center">
                    Enter this code in the browser window
                  </p>
                </div>
              </Show>

              {/* Divider */}
              <div class="h-px bg-border-weaker-base" />

              {/* Spinner + reopen */}
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2 text-12-regular text-text-weaker">
                  <svg class="w-3.5 h-3.5 animate-spin shrink-0 text-primary" viewBox="0 0 24 24" fill="none">
                    <circle class="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3"/>
                    <path class="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  Waiting for sign-in…
                </div>
                <Show when={loginUrl()}>
                  <button
                    type="button"
                    onClick={() => platform.openLink(loginUrl())}
                    class="text-12-regular text-primary hover:text-text-strong transition-colors underline underline-offset-2"
                  >
                    Reopen browser
                  </button>
                </Show>
              </div>
            </div>
          </Show>

        </div>

        {/* Footer */}
        <div class="h-px bg-border-weaker-base" />
        <div class="px-8 py-4 text-center text-11-regular text-text-weaker">
          By signing in you agree to our{" "}
          <a
            href="https://kolbo.ai/terms-of-service"
            class="underline underline-offset-2 hover:text-text-base transition-colors"
            onClick={(e) => { e.preventDefault(); platform.openLink("https://kolbo.ai/terms-of-service") }}
          >
            Terms of Service
          </a>
          {" "}and{" "}
          <a
            href="https://kolbo.ai/privacy-policy"
            class="underline underline-offset-2 hover:text-text-base transition-colors"
            onClick={(e) => { e.preventDefault(); platform.openLink("https://kolbo.ai/privacy-policy") }}
          >
            Privacy Policy
          </a>
        </div>

      </div>
    </div>
  )
}
