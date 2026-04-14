---
name: fullstack-app
description: "Use when a user wants to build a complete web application from scratch. Triggers: 'build me an app', 'create a SaaS', 'I need a web app', 'make me a dashboard', 'create a todo app', or any request to scaffold a fullstack project. Orchestrates the opinionated stack (Next.js 15 + Tailwind CSS + shadcn/ui + Supabase), page templates, data patterns, and generates AGENTS.md."
---

# Fullstack App Builder

You are building a production-quality fullstack web application. Follow this skill exactly — do NOT offer alternatives, do NOT ask the user to choose between ORMs/state managers/CSS frameworks. There is ONE stack and ONE way to do things.

## The Stack (non-negotiable)

| Layer | Choice |
|-------|--------|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript (strict) |
| Styling | Tailwind CSS |
| Components | shadcn/ui (Radix + Tailwind) |
| Backend | Supabase (Postgres + Auth + Storage + Realtime) |
| Data fetching | TanStack Query (React Query) |
| Forms | react-hook-form + zod |
| Auth | @supabase/ssr |

If the user explicitly requests React+Vite instead of Next.js, see the Vite Variant section at the bottom. Otherwise, default to Next.js without asking.

---

## Phase 0: Understand the App

Ask the user (skip any already answered):
1. **What does the app do?** (e.g., "todo app", "SaaS dashboard", "booking system")
2. **What are the main entities?** (e.g., "tasks, projects, users" — if unclear, suggest based on #1)
3. **Do they already have a Supabase project?** (yes → get URL + anon key; no → will guide setup)

Do NOT ask about framework, styling, or component library — the stack is decided.

---

## Phase 1: Scaffold the Project

```bash
npx create-next-app@latest <app-name> --ts --tailwind --app --eslint --src-dir --import-alias "@/*"
cd <app-name>
```

### Initialize shadcn/ui
```bash
npx shadcn@latest init
```
When prompted: New York style, Zinc base color, CSS variables YES.

### Install base components (always needed)
```bash
npx shadcn@latest add button card input label form separator
```

### Install core packages
```bash
npm install @supabase/supabase-js @supabase/ssr @tanstack/react-query react-hook-form @hookform/resolvers zod lucide-react
```

### Create directory structure
```
src/
├── app/
│   ├── (auth)/           # Auth pages (login, signup, etc.)
│   │   ├── layout.tsx
│   │   ├── login/page.tsx
│   │   ├── signup/page.tsx
│   │   ├── forgot-password/page.tsx
│   │   └── callback/route.ts
│   ├── (dashboard)/      # Protected app pages
│   │   ├── layout.tsx
│   │   ├── page.tsx       # Dashboard home
│   │   ├── settings/page.tsx
│   │   └── <entity>/     # One per entity
│   │       ├── page.tsx   # List view
│   │       └── [id]/page.tsx
│   ├── (marketing)/      # Public pages
│   │   ├── layout.tsx
│   │   └── page.tsx       # Landing page
│   ├── layout.tsx         # Root layout
│   └── providers.tsx      # TanStack Query provider
├── components/
│   ├── ui/               # shadcn/ui components (auto-generated)
│   └── <shared components>
├── hooks/
│   └── use-<entity>.ts   # TanStack Query hooks per entity
├── lib/
│   └── supabase/
│       ├── client.ts      # Browser client
│       └── server.ts      # Server client
├── middleware.ts           # Auth middleware
└── types/
    └── database.ts        # Supabase types
```

### Run and verify
```bash
npm run dev
```
Fix ANY errors before proceeding.

---

## Phase 2: Backend Setup

**Load the `supabase-quickstart` skill** and execute its Phases 1-2:
- Phase 1: Supabase project setup (or connect existing)
- Phase 2: CLI install, MCP server config, project linking

**Skip** supabase-quickstart's Phase 3 (frontend scaffolding) — we already have the frontend.

After Supabase is connected, create the client files:

### `src/lib/supabase/client.ts`
```typescript
import { createBrowserClient } from "@supabase/ssr"

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}
```

### `src/lib/supabase/server.ts`
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

### `src/middleware.ts`
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
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options))
        },
      },
    },
  )
  const { data: { user } } = await supabase.auth.getUser()

  if (!user && request.nextUrl.pathname.startsWith("/(dashboard)")) {
    return NextResponse.redirect(new URL("/login", request.url))
  }

  if (user && request.nextUrl.pathname.startsWith("/(auth)")) {
    return NextResponse.redirect(new URL("/", request.url))
  }

  return response
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
}
```

### `.env.local`
```
NEXT_PUBLIC_SUPABASE_URL=<from Supabase dashboard>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<from Supabase dashboard>
```

Run `npm run dev` — fix any errors before proceeding.

---

## Phase 3: Page Templates

### Auth Pages

Install components:
```bash
npx shadcn@latest add card form input label button separator
```

#### `src/app/(auth)/layout.tsx`
```tsx
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/50 p-4">
      <div className="w-full max-w-md">{children}</div>
    </div>
  )
}
```

#### `src/app/(auth)/login/page.tsx`
```tsx
"use client"

import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(6, "Password must be at least 6 characters"),
})

export default function LoginPage() {
  const router = useRouter()
  const supabase = createClient()
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
  })

  async function onSubmit(values: z.infer<typeof schema>) {
    const { error } = await supabase.auth.signInWithPassword(values)
    if (error) {
      form.setError("root", { message: error.message })
      return
    }
    router.push("/")
    router.refresh()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Log in</CardTitle>
        <CardDescription>Enter your credentials to access your account</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField control={form.control} name="email" render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl><Input type="email" placeholder="you@example.com" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="password" render={({ field }) => (
              <FormItem>
                <FormLabel>Password</FormLabel>
                <FormControl><Input type="password" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            {form.formState.errors.root && (
              <p className="text-sm text-destructive">{form.formState.errors.root.message}</p>
            )}
            <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? "Signing in..." : "Sign in"}
            </Button>
          </form>
        </Form>
        <div className="mt-4 text-center text-sm text-muted-foreground">
          Don&apos;t have an account? <Link href="/signup" className="underline">Sign up</Link>
        </div>
        <div className="mt-2 text-center text-sm">
          <Link href="/forgot-password" className="text-muted-foreground underline">Forgot password?</Link>
        </div>
      </CardContent>
    </Card>
  )
}
```

Create similar pages for `/signup` (uses `supabase.auth.signUp`) and `/forgot-password` (uses `supabase.auth.resetPasswordForEmail`). Follow the same pattern: Card + Form + zod schema.

#### `src/app/(auth)/callback/route.ts`
```typescript
import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get("code")
  const next = searchParams.get("next") ?? "/"

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) return NextResponse.redirect(`${origin}${next}`)
  }

  return NextResponse.redirect(`${origin}/login?error=auth`)
}
```

### Dashboard Layout

Install components:
```bash
npx shadcn@latest add sidebar navigation-menu avatar dropdown-menu sheet breadcrumb
```

#### `src/app/(dashboard)/layout.tsx`
```tsx
import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { AppSidebar } from "@/components/app-sidebar"
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <AppSidebar user={user} />
        <main className="flex-1 overflow-auto">
          <div className="flex items-center gap-2 border-b px-4 py-3">
            <SidebarTrigger />
          </div>
          <div className="p-6">{children}</div>
        </main>
      </div>
    </SidebarProvider>
  )
}
```

Create `src/components/app-sidebar.tsx` using shadcn/ui Sidebar components. Include:
- App logo/name at top
- Navigation links to each entity + settings
- User avatar + dropdown at bottom (with sign-out action)

### CRUD Pages (per entity)

Install components:
```bash
npx shadcn@latest add table dialog alert-dialog badge pagination select textarea
```

For each entity (e.g., `tasks`), create:

#### `src/app/(dashboard)/tasks/page.tsx` (list view)
- Server component that fetches initial data
- Client component `TasksTable` with:
  - Data table using shadcn Table
  - Search input
  - "Create" button that opens a Dialog with form
  - Row actions: edit, delete (with AlertDialog confirmation)
  - Pagination

#### `src/hooks/use-tasks.ts` (data hook)
```typescript
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { createClient } from "@/lib/supabase/client"
import type { Task } from "@/types/database"

export function useTasks() {
  const supabase = createClient()
  return useQuery({
    queryKey: ["tasks"],
    queryFn: async () => {
      const { data, error } = await supabase.from("tasks").select("*").order("created_at", { ascending: false })
      if (error) throw error
      return data as Task[]
    },
  })
}

export function useCreateTask() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (values: Omit<Task, "id" | "created_at" | "user_id">) => {
      const { data, error } = await supabase.from("tasks").insert(values).select().single()
      if (error) throw error
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tasks"] }),
  })
}

export function useUpdateTask() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...values }: Partial<Task> & { id: string }) => {
      const { data, error } = await supabase.from("tasks").update(values).eq("id", id).select().single()
      if (error) throw error
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tasks"] }),
  })
}

export function useDeleteTask() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tasks").delete().eq("id", id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tasks"] }),
  })
}
```

Replicate this pattern for every entity. The hook filename is always `use-<entity>.ts`.

### Settings Page

```bash
npx shadcn@latest add tabs switch
```

`src/app/(dashboard)/settings/page.tsx` — Tabs for Profile, Account, Notifications.

### Landing Page

```bash
npx shadcn@latest add button badge
```

`src/app/(marketing)/page.tsx` — Hero section, features grid (3-4 cards), pricing (if SaaS), CTA, footer. Use semantic HTML + Tailwind. Load the `frontend-design` skill for styling.

`src/app/(marketing)/layout.tsx` — Simple layout with navbar (logo + Login/Sign up buttons) + footer.

### Providers

#### `src/app/providers.tsx`
```tsx
"use client"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { useState } from "react"

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: { queries: { staleTime: 60 * 1000 } },
  }))
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}
```

Wrap the root `layout.tsx` body with `<Providers>`.

Run `npm run dev` — fix ALL errors before proceeding.

---

## Phase 4: Database Schema

**Load the `supabase` skill.** Design tables for the entities from Phase 0.

For every table:
1. Include `user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL`
2. Include `created_at TIMESTAMPTZ DEFAULT now()`
3. Enable RLS: `ALTER TABLE public.<table> ENABLE ROW LEVEL SECURITY`
4. Create policies for SELECT, INSERT, UPDATE, DELETE using `auth.uid() = user_id`

Use MCP `execute_sql` if available, otherwise `supabase db query`.

Generate migration: `supabase db pull --local --yes`

Create TypeScript types in `src/types/database.ts` matching the schema.

---

## Phase 5: Design Polish

**Load the `frontend-design` skill.** Apply its principles to all generated pages:
- Choose a distinctive color palette (update `globals.css` / Tailwind theme)
- Typography: pick a characterful font pair from Google Fonts
- Micro-interactions: hover states, transitions, loading states
- Empty states: show helpful illustrations/text when no data exists
- Consistent spacing and visual rhythm

---

## Phase 6: Generate AGENTS.md

Create `AGENTS.md` in the project root. Adapt this template:

```markdown
# [App Name] — Agent Rules

## Stack
- Framework: Next.js 15 (App Router) + TypeScript
- Styling: Tailwind CSS + shadcn/ui
- Backend: Supabase (Database, Auth, RLS)
- Data: TanStack Query hooks + react-hook-form + zod
- Auth: @supabase/ssr with middleware token refresh

## Project Structure
- `src/app/(auth)/` — Login, signup, forgot-password, OAuth callback
- `src/app/(dashboard)/` — Protected pages (requires auth)
- `src/app/(marketing)/` — Public landing pages
- `src/components/ui/` — shadcn/ui components (do not edit manually)
- `src/hooks/use-<entity>.ts` — TanStack Query hooks per entity
- `src/lib/supabase/` — Supabase client (client.ts for browser, server.ts for server)

## Conventions
- **Add shadcn/ui components**: `npx shadcn@latest add <component-name>`
- **New entity CRUD**: Create `hooks/use-<entity>.ts` + `app/(dashboard)/<entity>/page.tsx`
- **Forms**: Always use react-hook-form + zod schema validation
- **Data fetching**: Always use TanStack Query hooks, never raw useEffect+fetch
- **Auth check**: Server components use `createClient()` from `@/lib/supabase/server`
- **Protected routes**: All pages in `(dashboard)` route group — middleware handles redirect

## Supabase
- MCP server configured in `opencode.json`
- **RLS is ON for all tables** — every new table MUST have RLS + policies
- **user_id pattern**: All user-owned tables have `user_id UUID REFERENCES auth.users(id)`
- **Migrations**: `supabase db pull --local --yes`
- **Never use `user_metadata`** for authorization

## Database Schema
[List tables and purposes — update as schema evolves]

## Environment
- `.env.local` — Supabase URL + anon key (gitignored)
- Never expose `service_role` key in client code
```

---

## Phase 7: Iterative Verification

**DO NOT stop after scaffolding.** After each phase, run `npm run dev` and fix ALL errors.

After all phases complete, verify the full flow:

1. `npm run dev` starts clean — no errors, no warnings
2. Landing page loads at `/`
3. Navigate to `/login` — styled form renders
4. Click "Sign up" → signup page works
5. Sign up a test user — success
6. Log in with test user — redirects to dashboard
7. Dashboard shows sidebar + content area
8. Create an entity via the form — appears in list
9. Edit the entity — changes persist
10. Delete the entity — removed from list
11. Sign out works — redirects to login
12. `.env.local` is in `.gitignore`
13. `AGENTS.md` exists with correct content

**If ANY check fails, fix it and re-verify. Do not declare done until all checks pass.**

---

## Vite + React Variant

Only use this section if the user explicitly requests React+Vite instead of Next.js.

### Key differences:
- Scaffold: `npm create vite@latest <name> -- --template react-ts`
- Routing: `npm install react-router-dom` with `<BrowserRouter>` + `<Routes>`
- No server components — everything is client-side
- Supabase client: single `createClient()` (no SSR variant)
- No middleware — auth checks in route guards
- No route groups — use `pages/` directory convention
- Data fetching: TanStack Query only (no Server Actions)

### File structure:
```
src/
├── pages/
│   ├── auth/
│   │   ├── Login.tsx
│   │   ├── Signup.tsx
│   │   └── ForgotPassword.tsx
│   ├── dashboard/
│   │   ├── Dashboard.tsx
│   │   ├── Settings.tsx
│   │   └── <Entity>.tsx
│   └── Landing.tsx
├── components/
│   ├── ui/          # shadcn/ui
│   ├── Layout.tsx
│   └── ProtectedRoute.tsx
├── hooks/
│   └── use-<entity>.ts
├── lib/
│   └── supabase.ts  # Single client
├── App.tsx           # Router setup
└── main.tsx
```

Everything else (shadcn/ui, TanStack Query, react-hook-form, Supabase patterns) stays the same.
