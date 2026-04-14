---
name: supabase-quickstart
description: "Use when a user wants to build a fullstack app with Supabase, set up a new Supabase project, connect Supabase to a frontend framework, or says anything like 'build me an app', 'I need a database', 'set up auth', 'create a backend'. Guides non-technical users step-by-step through project creation, MCP server setup, auth, database schema, and generates project-level AGENTS.md rules."
---

# Supabase Fullstack Quickstart

You are guiding a user — who may have zero backend experience — through building a fullstack app powered by Supabase. Your job is to automate everything possible, explain only what the user needs to decide, and leave behind project rules so future sessions stay consistent.

## Phase 0: Understand What They Want

Before touching any tool, ask the user THREE things (skip any they already answered):

1. **What does the app do?** (e.g., "a todo app", "a SaaS dashboard", "a booking system")
2. **Do they already have a Supabase project?** (yes → get project URL + anon key; no → guide creation)
3. **What frontend?** (Next.js / React + Vite / SvelteKit / Astro / other — default to Next.js if unsure)

## Phase 1: Supabase Project Setup

### If user has NO Supabase project

Walk them through this — they'll do the clicking, you tell them exactly what to click:

```
1. Go to https://supabase.com/dashboard → Sign up or log in
2. Click "New Project"
3. Pick an organization (or create one — any name is fine)
4. Set:
   - Project name: [suggest based on their app idea]
   - Database password: [tell them to save it somewhere safe]
   - Region: [suggest closest to their location]
5. Click "Create new project" — wait ~2 minutes for provisioning
6. Once ready, go to Project Settings → API
7. Copy these two values:
   - Project URL (looks like https://xxxxx.supabase.co)
   - anon/public key (starts with eyJ...)
```

### If user HAS a Supabase project

Ask for:
- Project URL
- Anon key (public, safe for frontend)
- Service role key (only if they'll need admin operations — warn them this is sensitive)

## Phase 2: Supabase CLI & MCP Server

### Install Supabase CLI

```bash
# Check if already installed
supabase --version

# If not installed:
# macOS/Linux
brew install supabase/tap/supabase
# or npx (works everywhere)
npx supabase --version
```

### Configure MCP Server (so YOU can interact with their database directly)

Add to the project's `opencode.json` (create if it doesn't exist):

```json
{
  "mcp": {
    "supabase": {
      "type": "remote",
      "url": "https://mcp.supabase.com/mcp",
      "oauth": true
    }
  }
}
```

Then tell the user:
```
I've configured the Supabase MCP server. You need to authenticate it:
1. Restart this session (or reload the editor)
2. When prompted, complete the OAuth flow in your browser
3. Once authenticated, I'll be able to create tables, run queries,
   and manage your database directly — no copy-pasting SQL needed.
```

If MCP auth fails, fall back to the CLI: `supabase db query "SELECT 1"` to verify connectivity.

### Link to their project (for local dev)

```bash
supabase login
supabase link --project-ref <project-ref>
# project-ref is the xxxxx part of https://xxxxx.supabase.co
```

## Phase 3: Frontend Scaffolding

### Create the project (if starting fresh)

Based on their framework choice:

**Next.js (recommended for beginners):**
```bash
npx create-next-app@latest my-app --typescript --tailwind --app --eslint
cd my-app
npm install @supabase/supabase-js @supabase/ssr
```

**React + Vite:**
```bash
npm create vite@latest my-app -- --template react-ts
cd my-app
npm install @supabase/supabase-js
```

**SvelteKit:**
```bash
npx sv create my-app
cd my-app
npm install @supabase/supabase-js @supabase/ssr
```

### Environment variables

Create `.env.local` (Next.js) or `.env` (Vite/Svelte):
```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

IMPORTANT: Never put the service_role key in a `NEXT_PUBLIC_` or `VITE_` variable — it gets shipped to the browser.

### Create the Supabase client

**Next.js (App Router) — create `src/lib/supabase/`:**

`client.ts` (browser):
```typescript
import { createBrowserClient } from "@supabase/ssr"

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}
```

`server.ts` (server components/actions):
```typescript
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options))
          } catch {}
        },
      },
    },
  )
}
```

`middleware.ts` (in project root):
```typescript
import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options))
        },
      },
    },
  )
  await supabase.auth.getUser()
  return response
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
}
```

**React + Vite:**
```typescript
import { createClient } from "@supabase/supabase-js"

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
)
```

## Phase 4: Auth Setup

Ask the user: "Do you need user login? (email/password, Google, GitHub, magic link?)"

### Email/Password (simplest)

Enable in Supabase Dashboard → Auth → Providers → Email.

Create signup/login pages with forms. Example (Next.js):

```typescript
// app/auth/login/page.tsx
"use client"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"
import { useState } from "react"

export default function Login() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const router = useRouter()
  const supabase = createClient()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError(error.message)
    else router.push("/dashboard")
  }

  return (
    <form onSubmit={handleLogin}>
      <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" required />
      <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" required />
      {error && <p style={{color:"red"}}>{error}</p>}
      <button type="submit">Log in</button>
    </form>
  )
}
```

### OAuth (Google, GitHub, etc.)

Guide the user through the dashboard:
```
1. Supabase Dashboard → Auth → Providers
2. Enable Google/GitHub/etc.
3. For Google: Create OAuth credentials at console.cloud.google.com
   - Authorized redirect: https://xxxxx.supabase.co/auth/v1/callback
4. Paste Client ID + Client Secret into Supabase
```

Then add OAuth login button:
```typescript
const { data, error } = await supabase.auth.signInWithOAuth({
  provider: "google",
  options: { redirectTo: `${window.location.origin}/auth/callback` }
})
```

## Phase 5: Database Schema

Based on what the user described in Phase 0, design the schema. Use MCP `execute_sql` if available, otherwise generate migration files.

### Example flow

1. Design tables based on app requirements
2. Create them:
   ```sql
   CREATE TABLE public.todos (
     id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
     user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
     title TEXT NOT NULL,
     completed BOOLEAN DEFAULT false,
     created_at TIMESTAMPTZ DEFAULT now()
   );
   ```
3. ALWAYS enable RLS:
   ```sql
   ALTER TABLE public.todos ENABLE ROW LEVEL SECURITY;

   CREATE POLICY "Users can read own todos"
     ON public.todos FOR SELECT
     USING (auth.uid() = user_id);

   CREATE POLICY "Users can insert own todos"
     ON public.todos FOR INSERT
     WITH CHECK (auth.uid() = user_id);

   CREATE POLICY "Users can update own todos"
     ON public.todos FOR UPDATE
     USING (auth.uid() = user_id);

   CREATE POLICY "Users can delete own todos"
     ON public.todos FOR DELETE
     USING (auth.uid() = user_id);
   ```
4. Generate migration: `supabase db pull --local --yes`

## Phase 6: Generate Project Rules (AGENTS.md)

**CRITICAL: After setup is complete, ALWAYS generate an `AGENTS.md` file in the project root.** This ensures all future agent sessions know how the project is configured.

Template — adapt based on actual setup:

```markdown
# [App Name] — Agent Rules

## Stack
- Frontend: [Next.js 15 / React + Vite / SvelteKit] + TypeScript + Tailwind CSS
- Backend: Supabase (Database, Auth, RLS, Edge Functions)
- Database: PostgreSQL via Supabase

## Supabase Configuration
- Project URL: stored in `NEXT_PUBLIC_SUPABASE_URL` env var
- Anon Key: stored in `NEXT_PUBLIC_SUPABASE_ANON_KEY` env var
- MCP server configured in `opencode.json` — use MCP tools to query/modify the database directly

## Auth
- Provider: [Email/Password | Google OAuth | GitHub OAuth | Magic Link]
- Client setup: `src/lib/supabase/client.ts` (browser) and `src/lib/supabase/server.ts` (server)
- Middleware at `middleware.ts` refreshes auth tokens on every request
- Protected routes: [list or pattern, e.g., "/dashboard/*"]

## Database Rules
- **RLS is ON for all tables** — every new table MUST have RLS enabled with appropriate policies
- **user_id pattern**: All user-owned tables have a `user_id UUID REFERENCES auth.users(id)` column
- **Never use `user_metadata`** for authorization — it's user-editable
- **Migrations**: Use `supabase db pull --local --yes` to generate, never create migration files manually

## Schema
[List tables and their purpose, e.g.:]
- `todos` — User tasks (CRUD by owner only)
- `profiles` — Extended user info (read by anyone, write by owner)

## Development
- Local dev: `npm run dev` (frontend) + Supabase cloud (no local Supabase instance)
- Environment: `.env.local` for secrets (gitignored)
- Never expose `service_role` key in frontend code

## Security Checklist (run before any PR)
- [ ] All new tables have RLS enabled
- [ ] No `service_role` key in client-side code
- [ ] No `user_metadata` used for authorization
- [ ] Views use `security_invoker = true`
- [ ] Functions in private schema if `security definer`
```

## Phase 7: Verify Everything Works

Run through this checklist before telling the user "you're ready":

1. `npm run dev` starts without errors
2. Can sign up a test user
3. Can log in with that user
4. Can create/read data (confirms RLS works)
5. `AGENTS.md` exists in project root
6. `.env.local` is in `.gitignore`
7. MCP server is connected (if applicable)

Tell the user:
```
Your app is set up and running. Here's what I've configured:
- [Framework] project with Supabase connected
- User authentication with [provider]
- Database with [N] tables, all with Row Level Security
- Project rules in AGENTS.md so I'll remember this setup next time
- MCP server so I can query your database directly

You can now ask me to add features, and I'll build on this foundation.
```

## Adapting to Existing Projects

If the user already has a frontend project and wants to ADD Supabase:

1. Install packages: `npm install @supabase/supabase-js @supabase/ssr`
2. Create env vars
3. Create Supabase client files (Phase 3)
4. Add middleware (if Next.js/SvelteKit)
5. Set up MCP (Phase 2)
6. Generate/update AGENTS.md (Phase 6)

Do NOT restructure their existing project — add Supabase to their existing patterns.
