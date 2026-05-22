/* ⛔ BACKWARD COMPATIBILITY: Tool names and arg names below are a PUBLIC
 * CONTRACT. Never rename, remove, or break an existing tool/arg — old cached
 * `npx @kolbo/mcp` installs in the wild will break silently. Add new tools or
 * new OPTIONAL args only. Full rules: ../index.js top-of-file and CLAUDE.md. */

const { z } = require('zod');
const { pollUntilDone } = require('../polling');
const { creditFields } = require('./_shared');

function registerChatTools(server, client) {
  // ─── chat_send_message ─────────────────────────────────────
  server.tool(
    'chat_send_message',
    'Send a chat message to Kolbo AI. Starts a new conversation (omit session_id) or continues an existing one. Returns the assistant response when complete. Supports image/video/audio analysis via media_urls — pass public URLs and the model auto-routes to a vision-capable model (e.g. Gemini) when media is detected. Supports web search and deep think modes.',
    {
      message: z.string().describe('The user message to send'),
      model: z.string().optional().describe('Model identifier (e.g. "gpt-4o", "claude-sonnet-4-6"). Omit for Smart Select (auto) — recommended default. When media_urls contains video or audio, Smart Select automatically routes to a Gemini vision model regardless of this field.'),
      session_id: z.string().optional().describe('Existing chat session ID to continue. Omit to start a new conversation.'),
      system_prompt: z.string().optional().describe('System prompt for the conversation. Only applied when creating a new session.'),
      web_search: z.boolean().optional().describe('Enable web search for this message. Default: false'),
      deep_think: z.boolean().optional().describe('Enable deep think (extended reasoning). Default: false'),
      enhance_prompt: z.boolean().optional().describe('Set true to ask the API to rewrite your prompt for richer detail. Default: false — by default we send your prompt as-is.'),
      media_urls: z.array(z.string()).optional().describe('Public URLs of images, videos, or audio files to analyze. The model auto-routes to a vision-capable model when media is present. Use upload_media first to get a public URL for local files.')
    },
    async ({ message, model, session_id, system_prompt, web_search, deep_think, enhance_prompt = false, media_urls }) => {
      const gen = await client.post('/v1/chat', {
        message,
        model,
        session_id,
        system_prompt,
        web_search,
        deep_think,
        enhance_prompt,
        media_urls
      });

      // Deep think reasoning can run far longer than normal chat. Also grant
      // extra time when web_search is on (may fetch + analyze multiple pages).
      const timeout = deep_think ? 600000 : (web_search ? 240000 : 120000);

      const result = await pollUntilDone(client, gen.message_id, {
        interval: (gen.poll_interval_hint || 2) * 1000,
        timeout
      });

      // Chat status shape (from extractResult in kolbo-api sdk/controller.js):
      // { content, reasoning_content, image_urls?, video_urls?, audio_urls?, model, created_at }
      const r = result.result || {};
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            ...creditFields(result),
            session_id: gen.session_id,
            message_id: gen.message_id,
            model: r.model || gen.model,
            content: r.content || '',
            reasoning_content: r.reasoning_content || null,
            image_urls: r.image_urls || null,
            video_urls: r.video_urls || null,
            audio_urls: r.audio_urls || null
          }, null, 2)
        }]
      };
    }
  );

  // ─── chat_list_conversations ───────────────────────────────
  server.tool(
    'chat_list_conversations',
    'List your SDK chat conversations, most-recent first. Returns session_id, name, and activity timestamps.',
    {
      page: z.number().optional().describe('Page number, 1-indexed. Default: 1'),
      limit: z.number().optional().describe('Results per page, max 50. Default: 20')
    },
    async ({ page, limit }) => {
      const params = new URLSearchParams();
      if (page) params.set('page', String(page));
      if (limit) params.set('limit', String(limit));

      const qs = params.toString();
      const result = await client.get(`/v1/chat/conversations${qs ? '?' + qs : ''}`);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            conversations: result.conversations || [],
            pagination: result.pagination || null
          }, null, 2)
        }]
      };
    }
  );

  // ─── chat_get_messages ─────────────────────────────────────
  server.tool(
    'chat_get_messages',
    'Fetch messages in a chat conversation. Returns role, content, model, and any media URLs attached to each message.',
    {
      session_id: z.string().describe('The chat session ID'),
      page: z.number().optional().describe('Page number, 1-indexed. Default: 1'),
      limit: z.number().optional().describe('Messages per page, max 100. Default: 50')
    },
    async ({ session_id, page, limit }) => {
      const params = new URLSearchParams();
      if (page) params.set('page', String(page));
      if (limit) params.set('limit', String(limit));

      const qs = params.toString();
      const result = await client.get(
        `/v1/chat/conversations/${encodeURIComponent(session_id)}/messages${qs ? '?' + qs : ''}`
      );

      // Trim each message to avoid flooding context.
      const messages = (result.messages || []).map(m => ({
        role: m.role,
        content: m.content,
        model: m.model?.name || m.model?.identifier || null,
        status: m.status,
        created_at: m.createdAt || m.created_at,
        image_url: m.image_url || null,
        video_url: m.video_url || null,
        audio_url: m.audio_url || null
      }));

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            messages,
            pagination: result.pagination || null
          }, null, 2)
        }]
      };
    }
  );
}

module.exports = { registerChatTools };
