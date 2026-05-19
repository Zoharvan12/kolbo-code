/* ⛔ BACKWARD COMPATIBILITY: Tool names and arg names below are a PUBLIC
 * CONTRACT. Never rename, remove, or break an existing tool/arg — old cached
 * `npx @kolbo/mcp` installs in the wild will break silently. Add new tools or
 * new OPTIONAL args only. Full rules: ../index.js top-of-file and CLAUDE.md. */

const { z } = require('zod');

function registerPresetTools(server, client) {
  // ─── list_presets ──────────────────────────────────────────
  server.tool(
    'list_presets',
    'List generation presets across image, video, music, and text-to-video catalogs. Presets bundle a specific prompt template + style direction that can be passed to a generation tool via its `preset_id` arg for a one-shot creative direction. Filter by `type` to narrow to a specific catalog. Returns id, name, description, thumbnail, category, and (for music) audio preview URL.',
    {
      type: z.string().optional().describe('Filter by catalog: "image" | "video" | "music" | "text_to_video". Omit for all.')
    },
    async ({ type }) => {
      const params = new URLSearchParams();
      if (type) params.set('type', type);
      const qs = params.toString();
      const result = await client.get(`/v1/presets${qs ? '?' + qs : ''}`);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            presets: result.presets || [],
            count: result.count || 0,
            ...(result.warning ? { warning: result.warning } : {})
          }, null, 2)
        }]
      };
    }
  );
}

module.exports = { registerPresetTools };
