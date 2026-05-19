/* ⛔ BACKWARD COMPATIBILITY: Tool names and arg names below are a PUBLIC
 * CONTRACT. Never rename, remove, or break an existing tool/arg — old cached
 * `npx @kolbo/mcp` installs in the wild will break silently. Add new tools or
 * new OPTIONAL args only. Full rules: ../index.js top-of-file and CLAUDE.md. */

const { z } = require('zod');
const FormData = require('form-data');
const { resolveToBuffer: sharedResolveToBuffer, VISUAL_DNA_MAX_BYTES } = require('./_shared');

// Visual DNA caps reference media at 25MB per file (stricter than the
// default _shared.resolveToBuffer cap — DNA profiles only need enough
// source signal to extract features, not full-quality media).
function resolveToBuffer(source, kind) {
  return sharedResolveToBuffer(source, kind, { maxBytes: VISUAL_DNA_MAX_BYTES });
}

function registerVisualDnaTools(server, client) {
  // ─── create_visual_dna ─────────────────────────────────────
  server.tool(
    'create_visual_dna',
    'Create a Visual DNA profile from reference media. Each item in images/video/audio can be a public URL or an absolute local file path. Max 4 images, 1 video, 1 audio. Files capped at 25MB each.',
    {
      name: z.string().describe('Name of the Visual DNA profile. **Pick a short, lowercase, no-space single token** (e.g. `maya`, `tokyo_neon`, `brand_red`, `esther_model`) — never names with spaces (`Sarah Johnson` ❌). The user/LLM types this as `@<name>` inside generation prompts, and the @ parser stops at the first space, so `@Sarah Johnson` matches only `Sarah` and the binding silently drops. Multi-word concepts should use underscores or be a single token. Names are case-insensitive on lookup, but **reserved** values rejected on creation: `Image1`, `Image2`, …, `Video1`, …, `Audio1`, … (any-language characters allowed; max 100 chars).'),
      dna_type: z.string().optional().describe('Type: "character", "style", "product", "scene". Default: "character"'),
      prompt_helper: z.string().optional().describe('Optional description/notes to guide DNA extraction'),
      images: z.array(z.string()).optional().describe('Array of image sources (URLs or absolute local paths). Max 4.'),
      video: z.string().optional().describe('Optional video source (URL or absolute local path)'),
      audio: z.string().optional().describe('Optional audio source (URL or absolute local path)')
    },
    async ({ name, dna_type, prompt_helper, images, video, audio }) => {
      if (!name || !name.trim()) {
        throw new Error('name is required');
      }

      const imageList = Array.isArray(images) ? images.filter(Boolean) : [];
      if (imageList.length > 4) {
        throw new Error('Maximum 4 images allowed');
      }
      if (imageList.length === 0 && !video && !audio) {
        throw new Error('At least one media reference (image, video, or audio) is required');
      }

      // Resolve all sources to buffers in parallel.
      const [imageFiles, videoFile, audioFile] = await Promise.all([
        Promise.all(imageList.map(src => resolveToBuffer(src, 'image'))),
        video ? resolveToBuffer(video, 'video') : Promise.resolve(null),
        audio ? resolveToBuffer(audio, 'audio') : Promise.resolve(null)
      ]);

      const form = new FormData();
      form.append('name', name);
      if (dna_type) form.append('dnaType', dna_type);
      if (prompt_helper) form.append('promptHelper', prompt_helper);

      for (const f of imageFiles) {
        form.append('images', f.buffer, { filename: f.filename, contentType: f.contentType });
      }
      if (videoFile) {
        form.append('videos', videoFile.buffer, { filename: videoFile.filename, contentType: videoFile.contentType });
      }
      if (audioFile) {
        form.append('audio', audioFile.buffer, { filename: audioFile.filename, contentType: audioFile.contentType });
      }

      const result = await client.postMultipart('/v1/visual-dna', form);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(result.visual_dna || result, null, 2)
        }]
      };
    }
  );

  // ─── list_visual_dnas ──────────────────────────────────────
  server.tool(
    'list_visual_dnas',
    'List Visual DNA profiles. By default returns ALL (personal + global cast presets + organization). Use "scope" to filter: "personal" (user\'s own), "global" (system cast/presets), or "organization" (org-shared). Use "search" to filter by name/tags/description. Use "collection" to filter global presets by collection (cast, influencers, props, locations, styles, glamour, street).',
    {
      scope: z.enum(['all', 'personal', 'global', 'organization']).optional().describe('Filter by scope. Default: "all" (everything accessible). "personal" = only your own. "global" = system presets/cast. "organization" = org-shared.'),
      search: z.string().optional().describe('Search by name, tags, or description (case-insensitive)'),
      collection: z.string().optional().describe('Filter global presets by collection: cast, influencers, props, locations, styles, glamour, street'),
      tags: z.string().optional().describe('Comma-separated tags to filter by (OR logic)')
    },
    async ({ scope, search, collection, tags } = {}) => {
      const params = new URLSearchParams();
      if (scope && scope !== 'all') params.set('scope', scope);
      if (search) params.set('search', search);
      if (collection) params.set('collection', collection);
      if (tags) params.set('tags', tags);
      const qs = params.toString();
      const result = await client.get(`/v1/visual-dna${qs ? '?' + qs : ''}`);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            visual_dnas: result.visual_dnas || [],
            count: result.count || 0
          }, null, 2)
        }]
      };
    }
  );

  // ─── get_visual_dna ────────────────────────────────────────
  server.tool(
    'get_visual_dna',
    'Fetch a single Visual DNA profile by ID. Returns the full profile including system_prompt and all reference images.',
    {
      visual_dna_id: z.string().describe('The Visual DNA profile ID')
    },
    async ({ visual_dna_id }) => {
      const result = await client.get(`/v1/visual-dna/${encodeURIComponent(visual_dna_id)}`);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(result.visual_dna || result, null, 2)
        }]
      };
    }
  );

  // ─── delete_visual_dna ─────────────────────────────────────
  server.tool(
    'delete_visual_dna',
    'Delete a Visual DNA profile by ID. Only the owner can delete.',
    {
      visual_dna_id: z.string().describe('The Visual DNA profile ID to delete')
    },
    async ({ visual_dna_id }) => {
      const result = await client.delete(`/v1/visual-dna/${encodeURIComponent(visual_dna_id)}`);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            message: result.message || 'Visual DNA deleted'
          }, null, 2)
        }]
      };
    }
  );
}

module.exports = { registerVisualDnaTools };
