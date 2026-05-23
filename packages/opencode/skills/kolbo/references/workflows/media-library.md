# Media Library

Load this file when the user wants to browse, list, organize, delete, restore, move, favorite, share, or otherwise manage their media library — or when you produce a media file locally and need to surface it back to the user.

The library covers both **uploaded files** and **AI-generated outputs the user has saved**. Tools fall into five groups: ingest, browse, lifecycle (delete/restore/move), folders, and favorites.

## ⚠️ Present locally-produced media to the user

When you produce a media file LOCALLY — `ffmpeg` via the `video-production` skill, Remotion render, manual `Bash` mux of audio + video, `edit_image` outputs saved to disk, any save-to-file flow — make sure the user can actually find and open it. Local files are invisible in the chat / canvas UI by default; only the path string makes it through.

**Rules:**

1. **Surface the file in chat as a clickable thing**, not just a path string. Write the line as a markdown link to a `file://` URL so the user can click to open it in their default app:
   ```
   ✅ Final video ready: [zohar_hagai_campaign.mp4](file:///Users/mymac/Documents/test agent 1/zohar_hagai_campaign.mp4) (45s · 1440×1440 · with music)
   ```
   The user clicks the link → the desktop app shell hands the path to the system → opens in QuickTime / VLC / Finder reveal, etc.

2. **Always log the local path in `.kolbo/production.md`** under the artifact's entry — that's the durable record:
   ```md
   ## Final
   - **Campaign video (45s)**
     - local: /Users/mymac/Documents/test agent 1/zohar_hagai_campaign.mp4
     - resolution: 1440×1440
     - audio: Gilded Horizon (Track 1 & 2, 3:03)
     - rendered: 2026-05-16
   ```

3. **Don't auto-upload to `upload_media`**. The user wants local-only files to stay local; they have the file on disk and can move/share it themselves. Upload only when the user explicitly asks ("upload this", "share publicly", "give me a CDN URL").

4. **Reveal-in-Finder affordance for macOS** when finishing a multi-step production: in addition to the `file://` link, mention the parent directory path so the user can `cd` or open the folder. Many users want to see all the intermediate files (frames, alt cuts, original audio) in one place.

5. **Files served via `file://` won't render inline** in the chat as `<video>` / `<img>` — the desktop WebView blocks file:// for security. Don't try to embed; just link.

## Routing — user says → call

| User says | Call |
|---|---|
| "Upload this file" / "host this" / "give me a public URL for this" | `upload_media` |
| "Show my media" / "list my images/videos" / "what do I have?" | `list_media` (pass `type` / `category` / `project_id` / `folder_id` / `search`) |
| "Show my favorites" / "list starred items" | `list_media` with `category=favorites` |
| "List everything in project X" | `list_media` with `project_id=X` |
| "List all videos in folder X" | `list_media` with `folder_id=X, type=video` |
| "What was the prompt for [item]?" / "tell me about this generation" | `get_media` |
| "How many videos do I have?" / "what's my storage usage?" | `get_media_stats` |
| "Favorite this" / "star this" / "save to favorites" | `favorite_media` |
| "Unfavorite" / "remove from favorites" / "unstar" | `unfavorite_media` |
| "Delete this" / "remove this image" | `delete_media` (soft, recoverable for 30 days) |
| "Restore it" / "undelete" / "bring it back from trash" | `restore_media` |
| "Permanently delete" / "wipe it forever" / "free up space" | **confirm with user** → `permanently_delete_media` |
| "Move this to project X" | `move_media` |
| "Clean up old [type]" / "delete everything from [time period]" | `list_media` (find ids) → **confirm** → `bulk_delete_media` |
| "Restore all from trash" | `list_media include_deleted=true` → `bulk_restore_media` |
| "Empty my trash" / "purge deleted items" | `list_media include_deleted=true` → **show count, confirm** → `bulk_permanently_delete_media` |
| "Move all these to project X" | `bulk_move_media` |
| "Move everything in folder X to project Y" | `move_folder_contents` |
| "Make a folder for X" / "create a 'campaigns' folder" | `create_media_folder` |
| "Rename folder" / "change folder color or icon" | `update_media_folder` |
| "Delete the [name] folder" | **confirm with user** → `delete_media_folder` (items stay in library) |
| "Add these to [folder]" / "put these in folder X" | `add_media_to_folder` |
| "Remove these from [folder]" | `remove_media_from_folder` |
| "Share [folder] with alice@…" | `share_media_folder` with `user_emails: [...]` |
| "Revoke [user]'s access to [folder]" | `unshare_media_folder` with `user_id` |
| "Show my folders" / "what folders do I have?" | `list_media_folders` |

## Rules and gotchas

1. **"Delete" is soft by default.** Use `delete_media` / `bulk_delete_media` for normal "delete" intent — items go to trash for 30 days and are recoverable. Only use `permanently_delete_media` / `bulk_permanently_delete_media` when the user explicitly asks for unrecoverable deletion ("permanently", "forever", "wipe", "free up space"). **Always confirm before either permanent variant.**
2. **Confirm before destructive folder ops.** `delete_media_folder` detaches items (they stay in the library) but the folder itself is gone — no undo. Confirm with the user.
3. **`bulk_move_media` is atomic.** If you get a "not all items owned by you" error, do NOT retry partially. Surface the error to the user and let them pick a smaller batch.
4. **Prefer `list_media` filters over post-filtering.** Pass `project_id` / `folder_id` / `category` / `type` / `search` to the backend; don't fetch the whole library and filter client-side.
5. **`is_favorited` is per-user.** On shared projects, an item can be favorited by you and not by your teammates — the value reflects the calling user only.
6. **"Empty trash" flow:** `list_media` with `include_deleted=true` → show the count → confirm → `bulk_permanently_delete_media`. Never call the bulk-permanent endpoint without listing first so the user knows the scope.
7. **Bulk caps:** 1000 ids for `bulk_delete_media` / `bulk_restore_media` / `bulk_permanently_delete_media` / `bulk_move_media`; 500 ids for `add_media_to_folder` / `remove_media_from_folder`. Split larger jobs into successive calls.
8. **Folder share resolution:** `share_media_folder` takes emails; users not found come back in `not_found`. Report those to the user — don't assume the share succeeded silently. Members can list/add/remove items but cannot delete the folder or reshare it.
9. **`get_media` accepts a generation_id as a fallback** for the `media_id` arg, so you can chase down items the user references by their original generation rather than by library id.
