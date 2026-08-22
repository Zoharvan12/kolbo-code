# Kolbo Review — client review & approval collections

Load this file when the user wants **feedback on finished media**: send a cut to a client,
collect timestamped comments, run an approve / request-changes loop, ship a v2 against the
same feedback thread, or share work with someone who has no Kolbo account. This is a
Frame.io-style layer over the media library — assets, versions, comments, statuses, and
guest share links — all project-scoped like everything else in Kolbo.

Not for: publishing a page (`publish_html_artifact`), sharing a whole media folder
(`share_media_folder`), or internal doc collaboration (`share_doc`).

## Tool inventory

| Tool | What it does |
|---|---|
| `create_review_asset` | New review asset with v1 media attached (`name`, `media_id`, optional `collection_id`, `version_note`). |
| `list_review_assets` / `get_review_asset` | Browse a project's review assets (filter by `collection_id` / `status`); fetch one with all versions + URLs. |
| `update_review_asset` | Rename, move to a collection (`collection_id: null` = uncollected), or switch `current_version_index`. |
| `add_review_version` | Append a new version to an existing asset from a `media_id`. |
| `set_review_status` | Workflow status: `in_progress` / `needs_review` / `approved` / `changes_requested`. |
| `delete_review_asset` | Soft-delete an asset AND its underlying review media. |
| `create_review_collection` / `list_review_collections` / `update_review_collection` / `delete_review_collection` | Folder layer. Deleting a collection is soft — its assets become uncollected, not deleted. |
| `create_review_comment` / `list_review_comments` / `reply_review_comment` / `edit_review_comment` / `delete_review_comment` | Text comments, optional video timecodes (`time_start` / `time_end`, seconds). One level of reply threading. |
| `resolve_review_comment` / `unresolve_review_comment` | Close / reopen a comment thread. |
| `create_review_share_link` / `list_review_share_links` / `revoke_review_share_link` | Guest links (no Kolbo account) for one asset or a whole collection. |
| `get_review_storage_usage` | `usedBytes` vs the 5GB review cap for the API-key owner. |

## The core flow

```
upload_media (or reuse a generation's media_id from list_media)
  → create_review_collection (only if grouping multiple assets)
  → create_review_asset            ← media becomes v1
  → set_review_status "needs_review"
  → create_review_share_link       ← hand the client the share_url
  → list_review_comments           ← read what came back
  → fix → add_review_version       ← v2 on the SAME asset
  → resolve_review_comment on each addressed note
  → set_review_status "approved" (usually the client does this via the link)
```

Media must already exist in the library — every attach point takes a `media_id` from
`upload_media` / `create_upload_ticket` / `media_upload_widget` / `list_media`, never a raw
URL or local path.

## Version semantics

- Versions **append**; labels are auto-set `v1`, `v2`, … — you can't choose or reorder them.
- `add_review_version` automatically makes the new version current. Use
  `update_review_asset({ current_version_index })` only to point BACK at an older cut.
- **Comments attach to a version's media**, not the asset. `list_review_comments` defaults
  to the current version — after adding v2, pass `version_media_id` to re-read v1 feedback.
  Comments do not carry forward; the v2 thread starts clean.
- Never delete+recreate an asset to "update" it — that orphans the comment history and
  every share link already sent to the client. New cut = `add_review_version`. Rename /
  re-file = `update_review_asset`. Delete is for abandoning the review entirely.

## Share links — permissions and defaults

`create_review_share_link` targets an `asset` or a `collection` (collection links cover
every asset inside, including ones added later). Guest defaults if you pass nothing:

| Permission | Default |
|---|---|
| `canComment`, `canViewOtherComments`, `canSwitchVersions` | **true** |
| `canDownload`, `canResolveOwn`, `canSetStatus` | **false** |
| `require_email` | **true** — guests identify by email before viewing |
| `role_label` | `"Client"` (max 40 chars) |

- Want the client to approve directly? Pass `permissions: { canSetStatus: true }` —
  otherwise they can only comment and you relay the verdict via `set_review_status`.
- Lockdown options: `password` (a NEW guest password — never an account credential),
  `allowed_emails`, `expires_at` (ISO8601).
- Links are revoked by id (`revoke_review_share_link`), not edited — to change permissions,
  create a new link and revoke the old one. This is the one place recreate IS the mechanism.
- When someone other than the owner sets a status, the owner gets a notification — don't
  also announce it manually.

## Storage — the 5GB cap

Review media is **copied into dedicated review storage** and counts against a flat 5GB cap
per account — separate from library storage. The cap is enforced on `create_review_asset`
AND `add_review_version`; hitting it returns `REVIEW_STORAGE_LIMIT` (413). That error is a
real limit, not a transient failure — don't retry. Check `get_review_storage_usage`
(`usedBytes` / `capBytes`) before bulk-adding large videos, and free space by deleting
finished review assets (the library originals are untouched).

## Practical notes

- All of this is instant CRUD — no credits, no polling, no `get_generation_status`.
- Project contract applies: pass the same `project_id` you resolved via `list_projects` on
  `create_review_asset` / `create_review_collection` / the list calls.
- `status` filter on `list_review_assets` takes exactly the four enum values — "pending" /
  "done" are not statuses.
- Comment ids are `note_id` in the reply/edit/delete/resolve tools; version notes cap at
  1000 chars.
- Guests can only resolve their own comments, and only if you granted `canResolveOwn` — the
  resolve loop on client feedback is normally yours to run after fixing.
