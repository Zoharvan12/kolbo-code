# App Builder

Load this file when the user wants to build / edit / iterate on a React app via Kolbo's App Builder ("build me a todo app", "add dark mode to my app", "give me the GitHub repo").

Use the App Builder tools to generate and iterate on full React apps from a text prompt. The backend auto-provisions a GitHub repo, Supabase database (when the app needs storage), and a live hosted deployment — all in one flow.

## Standard Workflow

1. **Find project ID**: `app_builder_list_projects` → pick the right project
2. **Create session**: `app_builder_create_session` with `project_id`
3. **Generate app**: `app_builder_generate_app` with `session_id` + `prompt`
   - Fires the build in the background, polls until `build_status === "deployed"` (up to 5 min)
   - Always surface the `deployment_url` to the user: **"Your app is live at: [url]"**
4. **Iterate**: `app_builder_list_generations` → get `generation_id` → `app_builder_edit_app` with natural language instruction

No manual polling needed — `generate_app` and `edit_app` block until the build completes.

## Local Dev Workflow

If the user wants to run the app locally or connect to the database directly:
```
app_builder_get_session(session_id) → returns:
  github_repo_url  →  git clone <url> && npm install && npm run dev
  supabase_url     →  paste into .env as NEXT_PUBLIC_SUPABASE_URL
  supabase_anon_key → paste into .env as NEXT_PUBLIC_SUPABASE_ANON_KEY
```

## ⚠️ Rules

- **Always confirm before `app_builder_delete_session`** — permanently deletes the GitHub repo, Supabase DB (unless user-connected), deployed files, and history. IRREVERSIBLE.
- **On build timeout** (rare): use `app_builder_get_build_status` to check manually, then continue or report.

Whitelabel works automatically — the MCP client routes App Builder calls through whitelabel API endpoints.

## Routing examples

| User says | Sequence |
|---|---|
| "Build me a todo app" / "Make a landing page with waitlist" | `app_builder_list_projects` → `app_builder_create_session` → `app_builder_generate_app` → show `deployment_url` |
| "Add dark mode to my app" / "Add a contact form" | `app_builder_list_generations` → `app_builder_edit_app` |
| "Give me the GitHub repo" / "Supabase credentials" | `app_builder_get_session` → return `github_repo_url` + `supabase_url` + `supabase_anon_key` |
