# App Builder

Load this file when the user wants to **build, edit, or iterate on a full React app** with Kolbo's App Builder — "build me a todo app", "add dark mode to my app", "give me the GitHub repo", "I want my app to use Kolbo image generation from the user's browser". Do NOT load this for single-asset generation requests (use the regular `generate_*` tools).

## 🚦 Preview / not live to the public yet

App Builder is in **preview** as of this writing. The MCP tools (`app_builder_*`) are wired and the backend runs end-to-end — owners can create projects, generate apps, edit them, get GitHub repos + Supabase DBs + a live deployment URL. The user-facing launch (in-app promo, self-serve public onboarding) is still pending. So:

- **You CAN call these tools** for owners / opted-in users — the flow works.
- **Don't proactively advertise App Builder** to users who haven't asked for it (no marketing pitch about "build apps with AI").
- If the user pushes back ("is this ready?"), say it's a working preview and ask if they want to try it.

## 🧠 Mental model — 4 layers, easy to conflate

This is the single biggest source of confusion. App Builder is NOT a generation tool. It's a **complete app factory** with its own lifecycle, its own runtime, and its own end-user identity model. Lock this in once:

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Layer 1 — KOLBO PROJECT (Kolbo account)                                 │
│   The same project you use for generations/media/chat.                  │
│   `list_projects` returns these. `app_builder_list_projects` ALSO       │
│   returns these (same data, different endpoint shape). A project can    │
│   hold BOTH regular sessions AND app-builder sessions at the same time. │
└─────────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ Layer 2 — APP BUILDER SESSION (one session = one app being built)       │
│   Created with `app_builder_create_session` against a Kolbo project.    │
│   Has a `session_id` that is COMPLETELY DIFFERENT from the              │
│   `session_id` returned by `chat_send_message` or any `generate_*`      │
│   tool. Don't mix them.                                                 │
│   A session accumulates "generations" — each one is a build / edit.     │
└─────────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ Layer 3 — THE APP ITSELF (a deployed React app)                         │
│   After the first successful generation the session has a real app:     │
│     • `deployment_url` — the live, hosted URL (e.g. apps.kolbo.ai/…)   │
│     • `github_repo_url` — auto-provisioned GitHub repo (clone, hack)    │
│     • `supabase_url` + `supabase_anon_key` — auto-provisioned DB        │
│   The app embeds `@kolbo/app-sdk` so it can call Kolbo AI directly      │
│   from the user's browser — see Layer 4.                                │
└─────────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ Layer 4 — APP END-USERS (real humans visiting the deployed app)         │
│   Each visitor authenticates with a PER-APP JWT — NOT a Kolbo user      │
│   account, NOT an API key. They hit `/api/apps/:appId/ai/*` endpoints   │
│   that proxy Kolbo AI. The OWNER of the app (the person who built it)  │
│   is the one whose credits get billed for every generation. This is a   │
│   completely different surface from the MCP — there are no MCP tools    │
│   for app end-users; the SDK lives in the generated app's bundle.       │
└─────────────────────────────────────────────────────────────────────────┘
```

**The five easy confusions** — re-read this before every App Builder turn:

1. `list_projects` and `app_builder_list_projects` return the **same Kolbo projects** — different endpoints, different shapes, but the same data. Use whichever the current flow needs.
2. `session_id` from `app_builder_create_session` is NOT the same as `session_id` from `chat_send_message`. Don't pass an App Builder session id to a `generate_*` tool or vice versa.
3. `app_builder_generate_app` is NOT a media-generation tool. It kicks off a full multi-minute app build that produces code + infra + a deployment URL. Never confuse it with `generate_image` / `generate_video`.
4. The deployed app is its OWN product. Visiting it is not "using Kolbo"; the visitor's identity is per-app, not Kolbo.
5. The OWNER pays. App end-users consume credits from the owner's account. Confirm the owner understands this before they share their app publicly.

## When to route here

The user wants to **build or modify a full app**, not generate a single asset:

- "Build me a [todo / landing page / dashboard / form / marketplace / internal tool / mobile-friendly site] app"
- "Make me a [SaaS / site / app] that does X"
- "I want an app where my users can [Y]" (the visitor-runtime question — usually means App Builder + Layer 4)
- "Add [dark mode / a contact form / a chart / auth / a settings page] to my app"
- "Show me the GitHub repo" / "I want to clone it" / "Connect my own Supabase"
- "Is my app deployed?" / "My build failed" / "Why is the deployment URL blank?"
- "What apps have I built?" / "Show me my App Builder sessions"
- "Delete this app" (always confirm — see Rules)

## When NOT to route here

The user wants a single asset or a Kolbo-internal workflow. Stay on the regular `generate_*` / media / doc / chat tools:

- "Generate an image / video / song / voice / 3D model" → regular tools (the output lives in Kolbo)
- "Edit this image" → `generate_image_edit`
- "Write me a [plan / brief / script]" → `create_doc` (AI Docs)
- "Build a presentation / landing page artifact" → `publish_html_artifact`
- "I want a campaign with 4 product shots" → `generate_creative_director`
- "Make me a Kolbo character consistent across images" → Visual DNA tools

**Heuristic:** if the deliverable is a single file (image / video / doc / page artifact), it's NOT App Builder. If the deliverable is "an app that does X" or "my users can do Y in it", it IS App Builder.

## Standard workflow (build + iterate)

```
1. app_builder_list_projects                → pick a Kolbo project (or note "default bucket")
2. app_builder_create_session(project_id)   → returns session_id
3. app_builder_generate_app(session_id,
                            prompt="...")   → blocks until build_status="deployed"
                                             (up to ~5 min — surface the deployment_url!)
4. (later) app_builder_list_generations(session_id)
         → app_builder_edit_app(session_id,
                                generation_id=<latest>,
                                edit_prompt="add dark mode")
                                             → blocks until redeployed
```

**Surface the deployment URL on success** — always show the user: "Your app is live at: `<deployment_url>`". That's the whole payoff. If `deployment_url` is null after a successful build, treat it as a build failure and call `app_builder_get_build_status` to investigate.

**No manual polling needed.** `generate_app` and `edit_app` block until the build completes (or throws). If a build times out, the user can resume by calling `app_builder_get_build_status(session_id)` — DO NOT auto-retry; wait for the user's call.

## Local dev + handoff

If the user wants to run the app locally or connect to the database directly:

```
app_builder_get_session(session_id) → returns:
  github_repo_url     → git clone <url> && npm install && npm run dev
  supabase_url        → paste into .env as NEXT_PUBLIC_SUPABASE_URL
  supabase_anon_key   → paste into .env as NEXT_PUBLIC_SUPABASE_ANON_KEY
  deployment_url      → the currently deployed URL
```

The repo is a standard Next.js + Tailwind + shadcn/ui + Supabase app. The bundled `@kolbo/app-sdk` (`kolbo.auth`, `kolbo.data`, `kolbo.storage`, `kolbo.ai`) is what lets the app call Kolbo AI without exposing a full-access API key.

## End-user runtime — when the user asks "can my visitors do X in the app?"

This is Layer 4 — the deployed app's AI proxy. The MCP doesn't have direct tools for it, but you should KNOW it exists so you can answer:

- **What end-users see:** the deployed React app at `deployment_url`. They authenticate with a per-app JWT (auto-issued; the SDK handles it).
- **What they can do:** anything the app is coded to do, including calling Kolbo AI (image / video / chat / etc.) via `@kolbo/app-sdk`. The SDK hits `/api/apps/:appId/ai/*` proxy endpoints server-side; the OWNER's account is billed for those calls.
- **Spend controls:** the owner can set a per-app spend policy and per-user rate limits on the AI proxy (see `appAI/spendPolicy.js`). If the user says "my app is burning credits" or "someone is abusing my app", route them to that dashboard.
- **What you CAN'T do from the MCP:** inspect an end-user's session inside the app, view their chat history, or read their app-scoped data. Those live in the Kolbo dashboard under the App's settings.

## Routing examples

| User says | Sequence |
|---|---|
| "Build me a todo app" / "Make me a SaaS landing page with waitlist" | `app_builder_list_projects` → `app_builder_create_session` → `app_builder_generate_app` → show `deployment_url` |
| "Add dark mode to my app" / "Add a contact form / chart / auth" | `app_builder_list_generations` → grab latest `generation_id` → `app_builder_edit_app` → show `deployment_url` |
| "Give me the GitHub repo" / "I want to clone it and run it locally" | `app_builder_get_session` → return `github_repo_url` (+ `supabase_url` + `supabase_anon_key` if they ask) |
| "Show me my apps" / "What apps have I built?" | `app_builder_list_projects` → for each, `app_builder_list_sessions` → surface session list |
| "Is my build still running?" / "My build timed out" | `app_builder_get_build_status(session_id)` → resume |
| "Delete this app" | **ALWAYS CONFIRM FIRST** — see Rules. Then `app_builder_delete_session` |
| "My app visitors are burning my credits" | Not an MCP action — point them at the App → Settings → Spend Policy dashboard |
| "I want my app users to be able to generate images inside the app" | Tell them the `@kolbo/app-sdk` `kolbo.ai.generateImage` namespace handles it server-side via `/api/apps/:appId/ai/generate/image` — the OWNER pays |

## Hard rules

- **ALWAYS confirm before `app_builder_delete_session`** — permanently deletes the GitHub repo, Supabase DB (unless user-connected their own), deployed files, generation history, messages, and form submissions. IRREVERSIBLE.
- **On build timeout / failure:** use `app_builder_get_build_status(session_id)` and report the actual status to the user. DO NOT auto-retry the build.
- **Never invent a `deployment_url` or `github_repo_url`** — they come back from the tool. If null, the build didn't finish.
- **The owner pays for every AI call made by an app visitor.** Make sure the user understands this before they share the app publicly. Direct them to spend-policy settings if they need a cap.
- **Whitelabel works automatically** — the MCP client routes App Builder calls through the whitelabel API endpoints when configured.
- **Don't conflate `project_id` types.** A Kolbo project holds App Builder sessions; the App Builder session is a CHILD of that project. The deployed app has its OWN `:appId` (visible in `app_builder_get_session`) which is what the app-runtime uses to route AI calls — that's a different id namespace from the Kolbo `project_id`.

## Versioning note (MCP)

- The App Builder MCP surface is **stable as of `@kolbo/mcp@1.37.0`**. No renames or removals planned. New optional args ship as `npm version minor` per the standard rules.
- The kolbo-code skill mirrors this doc (canonical source: `kolbo-code/packages/opencode/skills/kolbo/references/workflows/app-builder.md`); a `chore(skill)` bot keeps them in sync.