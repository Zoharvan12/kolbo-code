import type { JSX } from "solid-js"

export type ArtifactData = {
  content: string
  lang: "html" | "svg" | "mermaid"
}

export function ArtifactPreviewTab(props: { artifact: ArtifactData }): JSX.Element {
  return (
    <div class="flex-1 min-h-0 overflow-auto p-2">
      <iframe
        srcdoc={props.artifact.lang === "mermaid" ? mermaidDoc(props.artifact.content) : props.artifact.content}
        sandbox="allow-scripts"
        class="w-full h-full border-0 rounded bg-white"
        style={{ "min-height": "400px" }}
      />
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
