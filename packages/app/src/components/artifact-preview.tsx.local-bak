import { createSignal, Show, Switch, Match } from "solid-js"
import { useLanguage } from "@/context/language"

export type ArtifactData = {
  content: string
  lang: "html" | "svg" | "mermaid"
}

function buildMermaidSrcdoc(code: string): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<style>
  html,body{margin:0;padding:16px;background:#1e1e1e;color:#ccc;font-family:sans-serif;height:100%;box-sizing:border-box;}
  .mermaid{max-width:100%;overflow:auto;}
  svg{max-width:100%;}
</style>
</head>
<body>
<div class="mermaid">${code.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>
<script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"><\/script>
<script>
  mermaid.initialize({startOnLoad:true,theme:'dark',securityLevel:'loose'});
<\/script>
</body>
</html>`
}

function sanitizeSvg(svg: string): string {
  return svg
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/\son\w+\s*=\s*["'][^"']*["']/gi, "")
    .replace(/javascript:/gi, "")
}

export function ArtifactPreviewTab(props: { artifact: ArtifactData }) {
  const language = useLanguage()
  const [view, setView] = createSignal<"preview" | "code">("preview")

  return (
    <div class="flex flex-col h-full overflow-hidden">
      {/* Toolbar */}
      <div class="shrink-0 flex items-center gap-2 px-3 py-2 border-b border-border-weaker-base">
        {/* Segmented pill toggle */}
        <div class="flex items-center rounded-md border border-border-weak-base bg-surface-base-active overflow-hidden text-12-medium">
          <button
            type="button"
            onClick={() => setView("preview")}
            aria-label={language.t("artifact.preview")}
            class="px-3 py-1 transition-colors duration-100"
            classList={{
              "bg-background-base text-text-strong": view() === "preview",
              "text-text-weak hover:text-text-base": view() !== "preview",
            }}
          >
            {language.t("artifact.preview")}
          </button>
          <button
            type="button"
            onClick={() => setView("code")}
            aria-label={language.t("artifact.code")}
            class="px-3 py-1 transition-colors duration-100"
            classList={{
              "bg-background-base text-text-strong": view() === "code",
              "text-text-weak hover:text-text-base": view() !== "code",
            }}
          >
            {language.t("artifact.code")}
          </button>
        </div>

        <div class="flex-1" />

        {/* Open in new tab (HTML only) */}
        <Show when={props.artifact.lang === "html"}>
          <button
            type="button"
            class="flex items-center justify-center w-6 h-6 rounded text-text-weak hover:text-text-base hover:bg-surface-base-hover transition-colors duration-100"
            aria-label={language.t("artifact.openInTab")}
            title={language.t("artifact.openInTab")}
            onClick={() => {
              const blob = new Blob([props.artifact.content], { type: "text/html" })
              const url = URL.createObjectURL(blob)
              window.open(url, "_blank", "noopener,noreferrer")
            }}
          >
            ↗
          </button>
        </Show>
      </div>

      {/* Content */}
      <div class="flex-1 min-h-0 overflow-hidden relative">
        <Show when={view() === "preview"}>
          <Switch>
            <Match when={props.artifact.lang === "html"}>
              <iframe
                sandbox="allow-scripts allow-same-origin allow-forms allow-modals"
                srcdoc={props.artifact.content}
                style="position:absolute;inset:0;width:100%;height:100%;border:0;background:#fff;"
              />
            </Match>
            <Match when={props.artifact.lang === "svg"}>
              <div
                style="position:absolute;inset:0;overflow:auto;display:flex;align-items:center;justify-content:center;padding:16px;"
                // eslint-disable-next-line solid/no-innerhtml
                innerHTML={sanitizeSvg(props.artifact.content)}
              />
            </Match>
            <Match when={props.artifact.lang === "mermaid"}>
              <iframe
                sandbox="allow-scripts allow-same-origin"
                srcdoc={buildMermaidSrcdoc(props.artifact.content)}
                style="position:absolute;inset:0;width:100%;height:100%;border:0;background:#1e1e1e;"
              />
            </Match>
          </Switch>
        </Show>

        <Show when={view() === "code"}>
          <div class="h-full overflow-auto">
            <pre
              class="p-4 text-12-regular text-text-base whitespace-pre-wrap break-words"
              style="margin:0;"
            >
              <code>{props.artifact.content}</code>
            </pre>
          </div>
        </Show>
      </div>
    </div>
  )
}
