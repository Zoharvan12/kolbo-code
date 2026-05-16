import { defineConfig } from "vite"
import appPlugin from "@opencode-ai/app/vite"

const host = process.env.TAURI_DEV_HOST

// Short-circuit requests with a path that decodeURI can't parse, BEFORE
// Vite's static middleware tries it and throws. enforce:"pre" puts this
// in front of Vite's core plugins.
const guardMalformedUri = {
  name: "guard-malformed-uri",
  enforce: "pre" as const,
  configureServer(server: any) {
    server.middlewares.use((req: any, res: any, next: any) => {
      if (!req.url) return next()
      try {
        decodeURI(new URL(req.url, "http://example.com").pathname)
        return next()
      } catch {
        res.statusCode = 400
        res.end("malformed URI")
      }
    })
  },
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [guardMalformedUri, appPlugin],
  publicDir: "../app/public",
  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  esbuild: {
    // Improves production stack traces
    keepNames: true,
  },
  // build: {
  // sourcemap: true,
  // },
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    // overlay disabled — internal Vite throws (URI malformed in static
    // middleware) shouldn't black out the live UI; errors still appear
    // in devtools.
    hmr: host
      ? { protocol: "ws", host, port: 1421, overlay: false }
      : { overlay: false },
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
})
