/* ⛔ BACKWARD COMPATIBILITY: Tool names and arg names below are a PUBLIC
 * CONTRACT. Never rename, remove, or break an existing tool/arg — old cached
 * `npx @kolbo/mcp` installs in the wild will break silently. Add new tools or
 * new OPTIONAL args only. Full rules: ../index.js top-of-file and CLAUDE.md. */

const { z } = require('zod');

function registerArtifactTools(server, client) {
  // ─── publish_html_artifact ─────────────────────────────────────
  server.tool(
    'publish_html_artifact',
    'Publish an HTML page (or SVG / Mermaid diagram) to kolbo.ai and return a public shareable URL. Use this when the user explicitly asks to share, publish, or deploy a built artifact so they can send the URL to someone. The content is hosted at https://sites.kolbo.ai/<slug>; the page is served with restrictive CSP (no fetch/XHR/form-action) so it cannot exfiltrate data. Identical content uploaded twice returns the same URL (server dedup).',
    {
      title: z.string().describe('Human-friendly title for the page (also used to generate the SEO slug). Keep under ~60 chars.'),
      content: z.string().describe('The raw artifact body. For type="html" this is a full HTML document (DOCTYPE + html/head/body). For "svg" it is an <svg> document. For "mermaid" it is the Mermaid source text.'),
      type: z.enum(['html', 'svg', 'mermaid']).optional().describe('Artifact type. Default: "html".'),
      allow_js: z.boolean().optional().describe('Allow inline <script> execution on the published page. Default: false. Required for Tailwind JIT, Chart.js, Three.js, React-from-CDN etc.'),
    },
    async ({ title, content, type, allow_js }) => {
      if (!title || !title.trim()) throw new Error('title is required');
      if (typeof content !== 'string' || !content.length) throw new Error('content is required');

      const result = await client.post('/artifact/quick-share', {
        title: title.trim(),
        content,
        type: type || 'html',
        allowJs: allow_js === true,
      });

      const artifact = result?.data || {};
      const slug = artifact.shareableSlug || artifact.shareToken;
      // Compose env-correct URL. sites.kolbo.ai only resolves in prod; for
      // dev/staging we serve straight from the kolbo-api host.
      const apiBase = client.baseUrl || 'https://api.kolbo.ai/api';
      const isProd = /(^|\/\/)api\.kolbo\.ai/i.test(apiBase);
      let url;
      if (isProd) {
        url = artifact.siteUrl || (slug ? `https://sites.kolbo.ai/${slug}` : null);
      }
      if (!url && artifact.shareToken) {
        url = `${apiBase}/shared-artifact-raw/${artifact.shareToken}`;
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            url,
            shareToken: artifact.shareToken,
            shareableSlug: slug,
            duplicate: result?.duplicate === true,
            title: artifact.title,
          }),
        }],
      };
    },
  );
}

module.exports = { registerArtifactTools };
