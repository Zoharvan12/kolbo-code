import { createSignal, type JSX } from "solid-js"
import { Icon } from "@opencode-ai/ui/icon"

export type ArtifactData = {
  content: string
  lang: "html" | "svg" | "mermaid"
}

export function ArtifactPreviewTab(props: { artifact: ArtifactData }): JSX.Element {
  const [mobile, setMobile] = createSignal(false)

  return (
    <div class="flex flex-col flex-1 min-h-0 overflow-hidden">
      {/* Toolbar */}
      <div class="flex items-center justify-center gap-1 px-3 py-1.5 border-b border-border-weak-base shrink-0 bg-background-stronger">
        <button
          type="button"
          onClick={() => setMobile(false)}
          class="flex items-center gap-1.5 px-2.5 py-1 rounded text-12-medium transition-colors"
          classList={{
            "bg-surface-raised-base text-text-strong": !mobile(),
            "text-text-weak hover:text-text-base": mobile(),
          }}
        >
          <Icon name="monitor" size="small" />
          Desktop
        </button>
        <button
          type="button"
          onClick={() => setMobile(true)}
          class="flex items-center gap-1.5 px-2.5 py-1 rounded text-12-medium transition-colors"
          classList={{
            "bg-surface-raised-base text-text-strong": mobile(),
            "text-text-weak hover:text-text-base": !mobile(),
          }}
        >
          <Icon name="smartphone" size="small" />
          Mobile
        </button>
      </div>

      {/* Preview */}
      <div
        class="flex-1 min-h-0 overflow-auto p-2 flex"
        classList={{ "justify-center": mobile() }}
      >
        <iframe
          srcdoc={props.artifact.lang === "mermaid" ? mermaidDoc(props.artifact.content) : props.artifact.content}
          sandbox="allow-scripts"
          class="h-full border-0 rounded bg-white transition-[width] duration-200"
          classList={{ "w-full": !mobile() }}
          style={{
            width: mobile() ? "390px" : undefined,
            "min-height": "400px",
            "flex-shrink": "0",
          }}
        />
      </div>
    </div>
  )
}

function mermaidDoc(code: string): string {
  return `<!DOCTYPE html>
<html><head>
<script src="https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js"><\/script>
</head><body>
<pre class="mermaid">${code.replace(/</g, "&lt;")}</pre>
<script>mermaid.initialize({startOnLoad:true})<\/script>
</body></html>`
}
