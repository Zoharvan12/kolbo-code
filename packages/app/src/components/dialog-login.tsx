import { createSignal, onCleanup, Show } from "solid-js"
import { useGlobalSDK } from "@/context/global-sdk"
import { useGlobalSync } from "@/context/global-sync"
import { usePlatform } from "@/context/platform"

const API_BASE = "https://api.kolbo.ai/api"

function randomHex(bytes = 8) {
  const arr = new Uint8Array(bytes)
  crypto.getRandomValues(arr)
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

interface Props {
  onDone: () => void
}

export function DialogLogin(props: Props) {
  const globalSDK = useGlobalSDK()
  const globalSync = useGlobalSync()
  const platform = usePlatform()

  const [email, setEmail] = createSignal("")
  const [password, setPassword] = createSignal("")
  const [showPassword, setShowPassword] = createSignal(false)
  const [error, setError] = createSignal("")
  const [loading, setLoading] = createSignal(false)
  const [googleStatus, setGoogleStatus] = createSignal("")

  let pollStop = false
  onCleanup(() => {
    pollStop = true
  })

  async function storeToken(token: string) {
    await globalSDK.client.auth.set({
      providerID: "kodu",
      auth: { type: "api", key: token },
    })
    await globalSDK.client.global.dispose()
    props.onDone()
  }

  async function handleEmailLogin(e: SubmitEvent) {
    e.preventDefault()
    if (!email().trim() || !password().trim()) return
    setLoading(true)
    setError("")
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email(), password: password() }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError((data as any).message || `Login failed (${res.status})`)
        return
      }
      const data = await res.json()
      const token = data.token || data.data?.token
      if (!token) { setError("No token in response"); return }
      await storeToken(token)
    } catch (err: any) {
      setError(err.message || "Network error")
    } finally {
      setLoading(false)
    }
  }

  async function handleGoogleLogin() {
    const code = randomHex(8)
    const authUrl = `${API_BASE}/auth/google?desktop_auth_code=${code}`
    setGoogleStatus("Opening browser...")
    setError("")
    platform.openLink(authUrl)

    pollStop = false
    setGoogleStatus("Waiting for sign-in...")
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 1000))
      if (pollStop) return
      try {
        const res = await fetch(`${API_BASE}/auth/google/check-auth-code?auth_code=${code}`)
        if (res.ok) {
          const data = await res.json()
          const token = data.token || data.data?.token
          if (token) {
            setGoogleStatus("")
            await storeToken(token)
            return
          }
        }
      } catch {}
    }
    setGoogleStatus("")
    setError("Sign-in timed out. Please try again.")
  }

  return (
    <div class="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div class="w-full max-w-sm mx-4 bg-surface-base rounded-xl border border-border-weak-base shadow-2xl p-8 flex flex-col gap-6">
        {/* Logo */}
        <div class="flex justify-center">
          <svg class="w-12 h-12" viewBox="0 0 389.03 469.15" xmlns="http://www.w3.org/2000/svg" fill="currentColor">
            <path d="M66.58.17c.92-.08,1.85-.13,2.77-.15,31.93-.72,58.76,17.64,69.26,47.85,4.38,12.59,3.67,24.74,3.71,37.81l.17,35.22c20.47-12.42,41.02-24.71,61.64-36.87l52.28-31.06c26.66-15.74,49.05-33.69,81.84-25.36,16.47,4.08,30.6,14.65,39.18,29.29,8.95,15.13,11.55,33.18,7.26,50.22-3.09,12.25-9.76,23.3-19.16,31.73-7.98,7.23-19.59,13.47-29.03,18.93l-29.54,17.11-116.52,67.76c-27.02,14.92-43.25,35.29-47.26,66.69-1.09,8.52-.71,19.49-.72,28.26v43.96c.04,23.37.04,40.52-15.36,59.79-40.68,50.89-119.72,26.02-126.46-37.91-.88-8.36-.57-16.61-.56-24.98l.03-36.6v-121.05s0-104.63,0-104.63l-.02-31.62c0-7.35-.24-15.44.7-22.64,1.61-12.74,6.71-24.78,14.75-34.79C29.14,10.22,45.35,2.35,66.58.17Z"/>
            <path d="M230.46,247.18l.71-.07c18.22-1.57,40.46,5.25,54.11,17.39,7.12,6.33,13.67,12.77,20.47,19.47l33.35,33.18,20.89,20.64c5.43,5.34,12.95,12.32,17.02,18.53,6.45,9.85,10.79,22.69,11.77,34.4,1.59,19.48-4.58,38.81-17.16,53.77-12.15,14.11-29.34,22.9-47.89,24.47-20.18,1.26-40.14-3.82-55.82-16.78-5.28-4.38-10.61-9.88-15.53-14.76l-24.18-23.99-29.91-29.52c-18.52-18.33-32.12-30.07-34.93-57.93-1.96-18.77,3.66-37.55,15.62-52.15,13.28-16.18,30.92-24.52,51.49-26.64Z"/>
          </svg>
        </div>

        {/* Heading */}
        <div class="text-center flex flex-col gap-1">
          <div class="text-16-medium text-text-strong">Welcome to Kolbo Code</div>
          <div class="text-13-regular text-text-weak">Sign in with your Kolbo.AI account</div>
        </div>

        {/* Google button */}
        <button
          onClick={handleGoogleLogin}
          disabled={loading() || !!googleStatus()}
          class="w-full flex items-center justify-center gap-2.5 h-9 rounded-lg border border-border-weak-base bg-surface-raised-base hover:bg-surface-raised-base-hover text-13-medium text-text-strong transition-colors disabled:opacity-50"
        >
          <svg class="w-4 h-4 shrink-0" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          <Show when={googleStatus()} fallback={<span>Continue with Google</span>}>
            <span>{googleStatus()}</span>
          </Show>
        </button>

        {/* Divider */}
        <div class="flex items-center gap-3">
          <div class="flex-1 h-px bg-border-weak-base" />
          <span class="text-12-regular text-text-weaker">or continue with email</span>
          <div class="flex-1 h-px bg-border-weak-base" />
        </div>

        {/* Email/password form */}
        <form onSubmit={handleEmailLogin} class="flex flex-col gap-3">
          <input
            type="email"
            placeholder="Email"
            value={email()}
            onInput={(e) => setEmail(e.currentTarget.value)}
            autocomplete="email"
            required
            class="w-full h-9 px-3 rounded-lg border border-border-weak-base bg-surface-raised-base text-13-regular text-text-strong placeholder:text-text-weaker focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
          />
          <div class="relative">
            <input
              type={showPassword() ? "text" : "password"}
              placeholder="Password"
              value={password()}
              onInput={(e) => setPassword(e.currentTarget.value)}
              autocomplete="current-password"
              required
              class="w-full h-9 px-3 pr-9 rounded-lg border border-border-weak-base bg-surface-raised-base text-13-regular text-text-strong placeholder:text-text-weaker focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              class="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-weaker hover:text-text-base transition-colors"
              tabIndex={-1}
            >
              <Show
                when={showPassword()}
                fallback={
                  <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                  </svg>
                }
              >
                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                  <line x1="1" y1="1" x2="23" y2="23"/>
                </svg>
              </Show>
            </button>
          </div>

          <Show when={error()}>
            <div class="text-12-regular text-[var(--color-error,#dc2626)]">{error()}</div>
          </Show>

          <button
            type="submit"
            disabled={loading() || !!googleStatus()}
            class="w-full h-9 rounded-lg bg-primary text-white text-13-medium hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {loading() ? "Signing in..." : "Sign In"}
          </button>
        </form>

        {/* Footer */}
        <div class="text-center text-11-regular text-text-weaker">
          By signing in, you agree to our{" "}
          <a href="https://kolbo.ai/terms-of-service" class="underline hover:text-text-base" onClick={(e) => { e.preventDefault(); platform.openLink("https://kolbo.ai/terms-of-service") }}>Terms of Service</a>
          {" "}and{" "}
          <a href="https://kolbo.ai/privacy-policy" class="underline hover:text-text-base" onClick={(e) => { e.preventDefault(); platform.openLink("https://kolbo.ai/privacy-policy") }}>Privacy Policy</a>
        </div>
      </div>
    </div>
  )
}
