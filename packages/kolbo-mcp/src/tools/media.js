/* ⛔ BACKWARD COMPATIBILITY: Tool names and arg names below are a PUBLIC
 * CONTRACT. Never rename, remove, or break an existing tool/arg — old cached
 * `npx @kolbo/mcp` installs in the wild will break silently. Add new tools or
 * new OPTIONAL args only. Full rules: ../index.js top-of-file and CLAUDE.md. */

const { z } = require('zod');
const FormData = require('form-data');
const { resolveToBuffer } = require('./_shared');

function registerMediaTools(server, client) {
  // ─── upload_media ──────────────────────────────────────────
  server.tool(
    'upload_media',
    'Upload a local file (or remote URL) to the user\'s Kolbo media library and get back a stable Kolbo CDN URL. Use this when the user wants to reference a local file in multiple subsequent generation calls — upload once, then pass the returned URL to generate_image / generate_video / visual_dna / etc. Auto-detects media type (image / video / audio) from the file extension. For a single-use reference where you already have a public URL, you can skip this and pass the URL directly to the generation tool.',
    {
      source: z.string().describe('URL or absolute local path to the file to upload. For local files this is the primary mode; for URLs, this re-hosts the file on Kolbo CDN for stability.'),
      description: z.string().optional().describe('Optional description / caption for the uploaded media')
    },
    async ({ source, description }) => {
      if (!source) throw new Error('source is required (URL or absolute local path)');

      // Even for URL input we download-and-reupload — that's the whole point
      // of upload_media (getting a stable Kolbo-owned URL). For ephemeral
      // pass-through, the generation tools accept URLs directly.
      const kind = /\.(mp4|mov|webm|mkv|avi|m4v)(\?|$)/i.test(source) ? 'video'
                 : /\.(mp3|wav|ogg|m4a|flac|aac)(\?|$)/i.test(source) ? 'audio'
                 : 'image';
      const resolved = await resolveToBuffer(source, kind);

      const form = new FormData();
      form.append('file', resolved.buffer, { filename: resolved.filename, contentType: resolved.contentType });
      if (description) form.append('description', description);

      const result = await client.postMultipart('/v1/media/upload', form);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(result.media || result, null, 2)
        }]
      };
    }
  );

  // ─── list_media ────────────────────────────────────────────
  server.tool(
    'list_media',
    'Browse the user\'s Kolbo media library — both uploaded files AND AI-generated outputs they have saved. Powerful filtering: scope to a single project (`project_id`), a user folder (`folder_id`), a "section" / category (`category`: ai / uploaded / edited / favorites / training-lab), a media type (`type`: image / video / audio), or generation provenance (`source_type`). Combine filters freely. Use this to discover what the user already has before generating something new, to retrieve a specific past creation, or to list everything in a project for downstream batch work.',
    {
      project_id: z.string().optional().describe('Restrict to a single project (Mongo ObjectId). Use `app_builder_list_projects` to discover IDs. Omit to list across all the user\'s media.'),
      folder_id: z.string().optional().describe('Restrict to a user folder (Mongo ObjectId). Discover folder IDs via `list_media_folders`. Takes precedence over project_id when both are set.'),
      type: z.enum(['image', 'video', 'audio', 'all']).optional().describe('Filter by media type. Default: all types.'),
      category: z.enum(['ai', 'uploaded', 'edited', 'favorites', 'training-lab', 'all']).optional().describe('Filter by "section" (matches the Kolbo desktop app sidebar): `ai` = AI-generated, `uploaded` = files the user uploaded, `edited` = AI-edited variants, `favorites` = items the user starred, `training-lab` = training-lab assets. Default: all sections.'),
      source_type: z.enum(['uploaded', 'generated', 'chat-generated']).optional().describe('Lower-level provenance filter. Use `category` for the common case; use `source_type` for fine-grained distinction (e.g. only chat-generated images).'),
      sort: z.enum(['created_desc', 'created_asc', 'name_asc', 'name_desc']).optional().describe('Sort order. Default: created_desc (newest first).'),
      page: z.number().optional().describe('1-indexed page number. Default: 1'),
      page_size: z.number().optional().describe('Items per page. Default: 50, max 200.'),
      search: z.string().optional().describe('Free-text match against filename + original prompt.')
    },
    async ({ project_id, folder_id, type, category, source_type, sort, page, page_size, search }) => {
      const params = new URLSearchParams();
      if (project_id) params.set('project_id', project_id);
      if (folder_id)  params.set('folder_id', folder_id);
      if (type)       params.set('type', type);
      if (category)   params.set('category', category);
      if (source_type) params.set('source_type', source_type);
      if (sort)       params.set('sort', sort);
      if (page)       params.set('page', String(page));
      if (page_size)  params.set('page_size', String(page_size));
      if (search)     params.set('search', search);

      const qs = params.toString();
      const result = await client.get(`/v1/media${qs ? '?' + qs : ''}`);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            media: result.media || [],
            pagination: result.pagination || null
          }, null, 2)
        }]
      };
    }
  );

  // ─── favorite_media ────────────────────────────────────────
  server.tool(
    'favorite_media',
    'Mark a media item as a favorite for the user. Idempotent — calling on an already-favorited item is a no-op. Requires the media `id` from `list_media`. After favoriting, the item shows up in `list_media` with `category=favorites` and in the desktop app sidebar\'s Favorites section. Use this when the user explicitly says "favorite this", "save this to favorites", "star this", or similar.',
    {
      media_id: z.string().describe('The MediaLibraryItem id (returned as `id` from `list_media`).')
    },
    async ({ media_id }) => {
      const result = await client.post(`/v1/media/${encodeURIComponent(media_id)}/favorite`, {});
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(result, null, 2)
        }]
      };
    }
  );

  // ─── unfavorite_media ──────────────────────────────────────
  server.tool(
    'unfavorite_media',
    'Remove a media item from the user\'s favorites. Idempotent — calling on an item that isn\'t favorited is a no-op. Requires the media `id` from `list_media`. Use this when the user says "unfavorite", "remove from favorites", "unstar", or similar.',
    {
      media_id: z.string().describe('The MediaLibraryItem id (returned as `id` from `list_media`).')
    },
    async ({ media_id }) => {
      const result = await client.delete(`/v1/media/${encodeURIComponent(media_id)}/favorite`);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(result, null, 2)
        }]
      };
    }
  );

  // ─── list_media_folders ────────────────────────────────────
  server.tool(
    'list_media_folders',
    'List the user\'s media folders (their own + folders shared with them). Folders are user-scoped and can span multiple projects — they\'re a way for the user to group media across the library independent of project structure. Use this to discover folder IDs to pass into `list_media` via `folder_id`, or to show the user what folders exist before suggesting where to look.',
    {},
    async () => {
      const result = await client.get('/v1/media/folders');
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            folders: result.folders || [],
            count: result.count || 0
          }, null, 2)
        }]
      };
    }
  );

  // ─── create_media_folder ───────────────────────────────────
  server.tool(
    'create_media_folder',
    'Create a new media folder for the user. Folders are user-scoped (span all projects) and useful for grouping related assets. Returns the new folder id — pass it as `folder_id` to `list_media`, `add_media_to_folder`, etc.',
    {
      name: z.string().describe('Folder name (1–100 characters).'),
      description: z.string().optional().describe('Optional description (up to 500 characters).'),
      color: z.string().optional().describe('Optional hex color like "#3B82F6" for UI tinting. Default: Kolbo blue.'),
      icon: z.string().optional().describe('Optional Lucide icon name (e.g. "folder", "star", "image"). Default: "folder".')
    },
    async ({ name, description, color, icon }) => {
      const result = await client.post('/v1/media/folders', { name, description, color, icon });
      return { content: [{ type: 'text', text: JSON.stringify(result.folder || result, null, 2) }] };
    }
  );

  // ─── update_media_folder ───────────────────────────────────
  server.tool(
    'update_media_folder',
    'Rename a folder or update its color / icon / description. Owner only. Any subset of fields may be provided — fields omitted are left unchanged.',
    {
      folder_id: z.string().describe('Folder id from `list_media_folders` or `create_media_folder`.'),
      name: z.string().optional().describe('New folder name (1–100 characters).'),
      description: z.string().optional().describe('New description (up to 500 characters). Pass "" to clear.'),
      color: z.string().optional().describe('New hex color like "#3B82F6".'),
      icon: z.string().optional().describe('New Lucide icon name.')
    },
    async ({ folder_id, name, description, color, icon }) => {
      const body = {};
      if (name !== undefined) body.name = name;
      if (description !== undefined) body.description = description;
      if (color !== undefined) body.color = color;
      if (icon !== undefined) body.icon = icon;
      const result = await client.put(`/v1/media/folders/${encodeURIComponent(folder_id)}`, body);
      return { content: [{ type: 'text', text: JSON.stringify(result.folder || result, null, 2) }] };
    }
  );

  // ─── delete_media_folder ───────────────────────────────────
  server.tool(
    'delete_media_folder',
    'Delete a folder (soft delete — items inside are detached but NOT deleted from the user\'s media library). Owner only. ALWAYS ask the user to confirm before calling this — folder deletion is not surfaced in any "undo" flow.',
    {
      folder_id: z.string().describe('Folder id to delete.')
    },
    async ({ folder_id }) => {
      const result = await client.delete(`/v1/media/folders/${encodeURIComponent(folder_id)}`);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );

  // ─── add_media_to_folder ───────────────────────────────────
  server.tool(
    'add_media_to_folder',
    'Add one or more media items to a folder. Caller must own the folder or be a shared member. Idempotent — items already in the folder are skipped silently. Up to 500 items per call.',
    {
      folder_id: z.string().describe('Target folder id.'),
      media_ids: z.array(z.string()).describe('Array of MediaLibraryItem ids (from `list_media`). Up to 500.')
    },
    async ({ folder_id, media_ids }) => {
      const result = await client.post(
        `/v1/media/folders/${encodeURIComponent(folder_id)}/items`,
        { media_ids }
      );
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );

  // ─── remove_media_from_folder ──────────────────────────────
  server.tool(
    'remove_media_from_folder',
    'Remove one or more media items from a folder. Caller must own the folder or be a shared member. Items themselves remain in the library. Up to 500 items per call.',
    {
      folder_id: z.string().describe('Folder id.'),
      media_ids: z.array(z.string()).describe('Array of MediaLibraryItem ids to remove from the folder.')
    },
    async ({ folder_id, media_ids }) => {
      const result = await client.delete(
        `/v1/media/folders/${encodeURIComponent(folder_id)}/items`,
        { media_ids }
      );
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );

  // ─── share_media_folder ────────────────────────────────────
  server.tool(
    'share_media_folder',
    'Share a folder with one or more users by email. Owner only. Users must already have a Kolbo account; emails not found are returned in `not_found`. Shared members can list folder contents, add and remove items, but cannot delete the folder or reshare it.',
    {
      folder_id: z.string().describe('Folder id to share.'),
      user_emails: z.array(z.string()).describe('Array of email addresses to grant access to. Up to 50 per call.')
    },
    async ({ folder_id, user_emails }) => {
      const result = await client.post(
        `/v1/media/folders/${encodeURIComponent(folder_id)}/share`,
        { user_emails }
      );
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );

  // ─── get_media ─────────────────────────────────────────────
  server.tool(
    'get_media',
    'Fetch one media item\'s full details by id. Returns the same shape as items in `list_media` plus extra metadata. Use this when the user references a specific item ("tell me about this generation", "what prompt did I use for [item]").',
    {
      media_id: z.string().describe('MediaLibraryItem id (from `list_media`). Generation ids are also accepted as a fallback.')
    },
    async ({ media_id }) => {
      const result = await client.get(`/v1/media/${encodeURIComponent(media_id)}`);
      return { content: [{ type: 'text', text: JSON.stringify(result.media || result, null, 2) }] };
    }
  );

  // ─── delete_media ──────────────────────────────────────────
  server.tool(
    'delete_media',
    'Soft-delete a media item — moves it to the user\'s trash where it can be restored for 30 days. Owner only. Idempotent. Use this for "delete this image / video / song" — NOT for `permanently_delete_media`, which is irreversible.',
    {
      media_id: z.string().describe('MediaLibraryItem id to soft-delete.')
    },
    async ({ media_id }) => {
      const result = await client.delete(`/v1/media/${encodeURIComponent(media_id)}`);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );

  // ─── restore_media ─────────────────────────────────────────
  server.tool(
    'restore_media',
    'Restore a soft-deleted (trashed) media item back to the user\'s active library. Owner only. Use after `delete_media` if the user changes their mind, or when the user explicitly asks "restore [item] from trash".',
    {
      media_id: z.string().describe('MediaLibraryItem id to restore from trash.')
    },
    async ({ media_id }) => {
      const result = await client.post(`/v1/media/${encodeURIComponent(media_id)}/restore`, {});
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );

  // ─── permanently_delete_media ──────────────────────────────
  server.tool(
    'permanently_delete_media',
    'PERMANENTLY delete a media item — removes it from MongoDB, deletes the file from S3, removes from all folders, and deletes the source generation record. NOT REVERSIBLE — there is no recovery flow. Owner only. ALWAYS ask the user to explicitly confirm before calling this; use `delete_media` for normal "delete" intent.',
    {
      media_id: z.string().describe('MediaLibraryItem id to permanently delete. Cannot be undone.')
    },
    async ({ media_id }) => {
      const result = await client.delete(`/v1/media/${encodeURIComponent(media_id)}/permanent`);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );

  // ─── move_media ────────────────────────────────────────────
  server.tool(
    'move_media',
    'Move a media item to a different project. Caller must own the item AND have access to the target project. Items in shared projects from other members cannot be moved by you. Use this when the user says "move this to project X" or wants to reorganize.',
    {
      media_id: z.string().describe('MediaLibraryItem id to move.'),
      project_id: z.string().describe('Target project id (use `app_builder_list_projects` to discover ids).')
    },
    async ({ media_id, project_id }) => {
      const result = await client.patch(
        `/v1/media/${encodeURIComponent(media_id)}/project`,
        { project_id }
      );
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );

  // ─── bulk_delete_media ─────────────────────────────────────
  server.tool(
    'bulk_delete_media',
    'Soft-delete up to 1000 media items in one call. Items go to trash (30-day recovery). Owner only — items not owned by the user are silently skipped (count returned in response). Use this for "clean up all my old [type]" or "delete the failed generations from yesterday".',
    {
      media_ids: z.array(z.string()).describe('Array of MediaLibraryItem ids. Up to 1000 per call.')
    },
    async ({ media_ids }) => {
      const result = await client.post('/v1/media/bulk/delete', { media_ids });
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );

  // ─── bulk_restore_media ────────────────────────────────────
  server.tool(
    'bulk_restore_media',
    'Restore up to 1000 trashed media items at once. Owner only. Returns the count restored and how many ids weren\'t in trash (already active or not owned).',
    {
      media_ids: z.array(z.string()).describe('Array of trashed MediaLibraryItem ids to restore. Up to 1000.')
    },
    async ({ media_ids }) => {
      const result = await client.post('/v1/media/bulk/restore', { media_ids });
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );

  // ─── bulk_permanently_delete_media ─────────────────────────
  server.tool(
    'bulk_permanently_delete_media',
    'PERMANENTLY delete up to 1000 media items. NOT REVERSIBLE — removes from MongoDB, S3, folders, and source generation records. Owner only. ALWAYS confirm with the user before calling; this is the bulk equivalent of `permanently_delete_media`.',
    {
      media_ids: z.array(z.string()).describe('Array of MediaLibraryItem ids to permanently delete. Up to 1000. Cannot be undone.')
    },
    async ({ media_ids }) => {
      const result = await client.post('/v1/media/bulk/permanent', { media_ids });
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );

  // ─── bulk_move_media ───────────────────────────────────────
  server.tool(
    'bulk_move_media',
    'Move up to 1000 media items to a different project in a single call. Caller must own ALL items AND have access to the target project — if any item isn\'t owned by the caller, the entire operation is rejected (atomic).',
    {
      media_ids: z.array(z.string()).describe('Array of MediaLibraryItem ids to move. Up to 1000.'),
      project_id: z.string().describe('Target project id.')
    },
    async ({ media_ids, project_id }) => {
      const result = await client.post('/v1/media/bulk/move', { media_ids, project_id });
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );

  // ─── move_folder_contents ──────────────────────────────────
  server.tool(
    'move_folder_contents',
    'Move every media item inside a folder to a different project. Caller must own ALL items in the folder AND have access to the target project. Shared folder members cannot use this — only the item owner can move items between projects.',
    {
      folder_id: z.string().describe('Folder id whose contents will be moved.'),
      project_id: z.string().describe('Target project id.')
    },
    async ({ folder_id, project_id }) => {
      const result = await client.post(
        `/v1/media/folders/${encodeURIComponent(folder_id)}/move-contents`,
        { project_id }
      );
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );

  // ─── get_media_stats ───────────────────────────────────────
  server.tool(
    'get_media_stats',
    'Get counts and total storage size of the user\'s media (or a specific project\'s media). Returns `{ total, images, videos, audio, total_size_bytes }`. Use this for "how many videos do I have", "what\'s my storage usage", or before bulk operations to estimate scope.',
    {
      project_id: z.string().optional().describe('Optional project id to scope stats to one project. Omit for the user\'s personal library across all projects.')
    },
    async ({ project_id }) => {
      const params = new URLSearchParams();
      if (project_id) params.set('project_id', project_id);
      const qs = params.toString();
      const result = await client.get(qs ? `/v1/media/stats?${qs}` : '/v1/media/stats');
      return { content: [{ type: 'text', text: JSON.stringify(result.stats || result, null, 2) }] };
    }
  );

  // ─── unshare_media_folder ──────────────────────────────────
  server.tool(
    'unshare_media_folder',
    'Revoke a single user\'s access to a folder. Owner only. The user keeps any media they uploaded — only the folder access is removed.',
    {
      folder_id: z.string().describe('Folder id.'),
      user_id: z.string().describe('User id to revoke (from the folder\'s `shared_with` array).')
    },
    async ({ folder_id, user_id }) => {
      const result = await client.delete(
        `/v1/media/folders/${encodeURIComponent(folder_id)}/share/${encodeURIComponent(user_id)}`
      );
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );
}

module.exports = { registerMediaTools };
