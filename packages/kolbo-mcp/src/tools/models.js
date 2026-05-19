/* ⛔ BACKWARD COMPATIBILITY: Tool names and arg names below are a PUBLIC
 * CONTRACT. Never rename, remove, or break an existing tool/arg — old cached
 * `npx @kolbo/mcp` installs in the wild will break silently. Add new tools or
 * new OPTIONAL args only. Full rules: ../index.js top-of-file and CLAUDE.md. */

const { z } = require('zod');

function registerModelTools(server, client) {
  // ─── list_models ───────────────────────────────────────────
  server.tool(
    'list_models',
    'List available AI models on Kolbo. Filter by `type` to narrow to a generation type, and pass `format: "json"` to get the raw model documents (every constraint field, useful for programmatic comparison / cap validation before submitting a generation). Default `format: "text"` returns the human-readable summary.',
    {
      type: z.string().optional().describe('Filter by DB type name: "text_to_img", "image_editing", "text_to_video", "img_to_video", "draw_to_video", "video_to_video", "elements", "firstlastgenerations", "lipsync-image", "lipsync-video", "music_gen", "text_to_speech", "text_to_sound", "stt", "text". Legacy aliases also accepted: "image", "image_edit", "video", "video_from_image", "video_from_video", "music", "speech", "sound", "chat", "lipsync" (both lipsync types), "three_d" (all 3D types), "first_last_frame", "transcription". Omit for all models.'),
      format: z.enum(['text', 'json']).optional().describe('Output format. "text" (default) returns a human-readable summary with the most-used caps. "json" returns the raw model documents from the API — use this when you need to programmatically verify caps (max_reference_images, max_visual_dna, max_video_duration, supported_aspect_ratios, etc.) before passing an array/value that might exceed a model-specific limit. The JSON form is the source of truth; the text form is a convenience preview.')
    },
    async ({ type, format }) => {
      const path = type ? `/v1/models?type=${encodeURIComponent(type)}` : '/v1/models';
      const result = await client.get(path);

      // JSON mode — return the raw API documents unchanged. This is the
      // authoritative shape; every constraint the agent might need to validate
      // a request lives here (durations, reference caps, audio/video min/max,
      // resolution multipliers, supports_* flags, prompt-length limits, etc.).
      if (format === 'json') {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ count: result.count, models: result.models }, null, 2)
          }]
        };
      }

      // Split into auto-selectable (has summary) and named-only (no summary)
      const withSummary = result.models.filter(m => m.summary && m.summary.trim() !== '');
      const withoutSummary = result.models.filter(m => !m.summary || m.summary.trim() === '');

      // Format the per-model spec line. The agent NEEDS this — without it,
      // it has to guess `supported_resolutions`/`supported_durations` and
      // either invents values (then the API silently substitutes) or asks
      // the user to clarify what's only knowable from this list.
      //
      // Rendering rule: emit a line for EVERY known constraint that is
      // applicable for this model's type — even when the value is 0 / null.
      // Hiding "0 cap" lines used to mean the agent couldn't distinguish
      // "this model rejects DNA" (cap = 0) from "I don't know" (field
      // missing). Now an explicit `max_dna: 0 (DNA not supported)` says the
      // model says no, and absence means the API doesn't expose the field.
      const formatSpecs = m => {
        const parts = [];
        const types = Array.isArray(m.types) ? m.types : [];
        const isVideoType = types.some(t =>
          ['text_to_video', 'img_to_video', 'video_to_video', 'elements',
           'firstlastgenerations', 'lipsync-image', 'lipsync-video', 'draw_to_video'].includes(t)
        );
        const isElements = types.includes('elements');
        const isV2V = types.includes('video_to_video');
        const isLipsyncVideo = types.includes('lipsync-video');
        const isLipsyncImage = types.includes('lipsync-image');
        const isImageEdit = types.includes('image_editing');
        const isImage = types.includes('text_to_img') || isImageEdit;

        if (Array.isArray(m.supported_resolutions) && m.supported_resolutions.length) {
          const mult = m.resolution_multipliers || {};
          parts.push(
            'resolutions: ' +
              m.supported_resolutions
                .map(r => (mult[r] != null && mult[r] !== 1 ? `${r} (${mult[r]}×)` : r))
                .join(' · ')
          );
        }

        // Output durations (video gen output, not source video)
        if (Array.isArray(m.supported_durations) && m.supported_durations.length) {
          const ds = m.supported_durations;
          const sorted = [...ds].sort((a, b) => a - b);
          const isRange = sorted.length > 2 && sorted.every((v, i) => i === 0 || v - sorted[i - 1] === 1);
          parts.push(`durations: ${isRange ? `${sorted[0]}-${sorted[sorted.length - 1]}s` : sorted.join('/') + 's'}`);
        } else if (isVideoType && (m.min_output_duration != null || m.max_output_duration != null)) {
          parts.push(`duration_range: ${m.min_output_duration ?? '?'}-${m.max_output_duration ?? '?'}s${m.default_duration != null ? ` (default ${m.default_duration}s)` : ''}`);
        }

        // Aspect ratios — prefer per-type override if set
        const ratios = m.supported_aspect_ratios_by_type
          ? Object.entries(m.supported_aspect_ratios_by_type).map(([t, arr]) => `${t}: ${arr.join('/')}`)
          : null;
        if (ratios) {
          parts.push(`aspect (per-type): ${ratios.join(' | ')}`);
        } else if (Array.isArray(m.supported_aspect_ratios) && m.supported_aspect_ratios.length) {
          parts.push(`aspect: ${m.supported_aspect_ratios.join(', ')}${m.default_aspect_ratio ? ` (default ${m.default_aspect_ratio})` : ''}`);
        }

        // Reference-input caps — show the slot relevant for this model family.
        // The same conceptual "max reference images" lives under THREE field
        // names depending on the model type. Be explicit about which is which
        // so the agent reads the right one.
        if (isImage || isImageEdit) {
          parts.push(`max_reference_images: ${m.max_reference_images ?? 0}${(m.max_reference_images ?? 0) === 0 ? ' (no refs)' : ''}`);
        }
        if (isElements) {
          parts.push(`elements caps: imgs=${m.elements_max_images ?? 0} · vids=${m.elements_max_videos ?? 0} · audio=${m.elements_max_audio ?? 0}`);
        }
        if (isV2V) {
          parts.push(`v2v ref caps: imgs=${m.max_images ?? 0} · vids=${m.max_videos ?? 0} · elements=${m.max_elements ?? 0} · audio=${m.max_audio ?? 0}`);
        }

        // Visual DNA cap — always show for image / elements / video, even if 0.
        // Use the authoritative supports_visual_dna flag when available; fall
        // back to inferring from cap > 0 for older API responses.
        const dnaSupported = typeof m.supports_visual_dna === 'boolean'
          ? m.supports_visual_dna
          : (m.max_visual_dna ?? 0) > 0;
        if (isImage || isVideoType) {
          const cap = m.max_visual_dna;
          if (dnaSupported && cap != null && cap > 0) parts.push(`max_visual_dna: ${cap}`);
          else if (dnaSupported && cap == null) parts.push('visual_dna: supported (no cap published — confirm before passing >3)');
          else parts.push('visual_dna: not supported');
        }

        // Source-video duration constraints — only matter for tools that take
        // an INPUT video (lipsync-video, video_to_video).
        if (isLipsyncVideo || isV2V) {
          if (m.min_video_duration != null || m.max_video_duration != null) {
            parts.push(`source_video: ${m.min_video_duration ?? '?'}-${m.max_video_duration ?? '?'}s`);
          }
        }

        // Audio input — lipsync, elements, music-driven flows.
        if (m.max_audio_duration != null || m.min_audio_duration != null) {
          parts.push(`audio_input: ${m.min_audio_duration ?? '?'}-${m.max_audio_duration ?? '?'}s${m.audio_max_follows_video_duration ? ' (max follows video)' : ''}`);
        }
        if (Array.isArray(m.supported_audio_formats) && m.supported_audio_formats.length) {
          parts.push(`audio_formats: ${m.supported_audio_formats.join('/')}`);
        }

        // Native sound generation (video models that emit synced audio)
        if (m.sound_generation_type === 'native') {
          const mult = m.sound_credit_multiplier && m.sound_credit_multiplier !== 1
            ? ` (${m.sound_credit_multiplier}×)`
            : '';
          parts.push(`sound: native${mult}${m.sound_enabled_by_default ? ' on-by-default' : ''}`);
        }

        // Prompt constraints
        if (m.requires_prompt === false) parts.push('prompt: optional');
        if (m.min_prompt_length != null || m.max_prompt_length != null) {
          parts.push(`prompt_length: ${m.min_prompt_length ?? 0}-${m.max_prompt_length ?? '∞'} chars`);
        }

        // Upload cap (when present)
        if (m.max_file_size != null) {
          const mb = Math.round(m.max_file_size / (1024 * 1024));
          parts.push(`max_file_size: ${mb}MB`);
        }

        // Images-per-request (Midjourney-style fixed-N output)
        if (m.images_per_request != null && m.images_per_request !== 1) {
          parts.push(`images_per_request: ${m.images_per_request}`);
        }

        return parts.length ? `\n   ${parts.join(' | ')}` : '';
      };

      const formatModel = m =>
        `${m.identifier} (${m.name}) - ${m.credit} credits${m.recommended ? ' [RECOMMENDED]' : ''}${m.new_model ? ' [NEW]' : ''}${m.summary ? ` — ${m.summary}` : ''}${formatSpecs(m)}`;

      const sections = [];
      if (withSummary.length > 0) {
        sections.push(`Auto-selectable models (${withSummary.length}) — safe to pick based on quality + cost:\n${withSummary.map(formatModel).join('\n')}`);
      }
      if (withoutSummary.length > 0) {
        sections.push(`Named-only models (${withoutSummary.length}) — only use if the user explicitly requests by name:\n${withoutSummary.map(formatModel).join('\n')}`);
      }

      return {
        content: [{
          type: 'text',
          text: `Available models (${result.count}):\n\n${sections.join('\n\n')}\n\nUse the "identifier" value as the "model" parameter in generate tools. For programmatic cap validation, re-call with format: "json".`
        }]
      };
    }
  );

  // ─── check_credits ─────────────────────────────────────────
  server.tool(
    'check_credits',
    'Check your remaining Kolbo credit balance.',
    {},
    async () => {
      const result = await client.get('/v1/account/credits');

      return {
        content: [{
          type: 'text',
          text: `Credit Balance:\n- Total: ${result.credits.total}\n- Plan credits: ${result.credits.plan_credits}\n- Credit pack: ${result.credits.credit_pack}\n- Redemption: ${result.credits.redemption}`
        }]
      };
    }
  );

  // ─── get_session_usage ─────────────────────────────────────
  // Real, multiplier-adjusted credit spend tagged with the caller's
  // X-Kolbo-Caller-Session-Id (set automatically by the parent process —
  // no need to pass it). Use this to give the user an honest "you've spent
  // X credits in this app session" instead of estimating from base credits.
  server.tool(
    'get_session_usage',
    'Fetch real, multiplier-adjusted credit spend for the current Kolbo Code app session. Use when the user asks "how much did I spend?" or before/after a large bulk job so you can quote actual cost (not an estimate from base credits). Returns total + per-tool breakdown + per-model breakdown + a recent list. The caller-session-id is forwarded automatically by the MCP HTTP client.',
    {},
    async () => {
      try {
        const r = await client.get('/credit-usage/by-caller-session');
        // The endpoint returns { message, data: { total, count, by_tool, by_model, recent[] } }
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(r.data || r, null, 2)
          }]
        };
      } catch (err) {
        // 400 from the endpoint means no caller-session-id was forwarded —
        // surface a clear hint instead of a generic API error.
        const hint = err?.status === 400
          ? 'No caller-session-id was forwarded. Ensure the parent process (Kolbo Code / desktop sidecar) sets KOLBO_CALLER_SESSION_ID in this MCP\'s env, or call again after at least one media generation has fired.'
          : err?.message || 'Failed to fetch session usage';
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: hint }, null, 2) }]
        };
      }
    }
  );
}

module.exports = { registerModelTools };
