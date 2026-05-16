import { defineConfig } from "vite"
import desktopPlugin from "./vite"

// Note: when running inside Tauri (`bun dev:desktop`), Vite uses
// packages/desktop/vite.config.ts, not this one. The guard plugin lives
// there. This file is only used by the bare `bun dev:web` web-only path
// — we still mirror the guard so both surfaces are protected.
export default defineConfig({
  plugins: [
    {
      name: "guard-malformed-uri",
      // enforce:"pre" so the middleware runs BEFORE Vite's core static
      // middleware, which would otherwise crash on bad URIs from
      // decodeURI(url.pathname).
      enforce: "pre" as const,
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
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
    },
    desktopPlugin,
  ] as any,
  server: {
    host: "0.0.0.0",
    allowedHosts: true,
    port: 3000,
    hmr: { overlay: false },
  },
  build: {
    target: "esnext",
  },
})
