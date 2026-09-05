# Plan: Week 1 foundation — local Supabase schema/RLS + Vercel deploy adapter for huddle-app

## Context
Per `plan/MVP_Development_Plan.md`, MVP-0's Week 1 focus is: repo + Supabase project + schema (users, events, categories, enrollments) **with RLS policies defined alongside the schema**, plus a Vercel deploy pipeline live from day one. This pass covers exactly that slice — no auth pages, event forms, or browsing UI yet (that's Week 2).

Decisions locked in with you:
- No hosted Supabase project yet — develop against a **local Supabase stack** (Docker + Supabase CLI), per your note at [misc/01.supabase_local.md](misc/01.supabase_local.md). That doc's approach is correct; two corrections folded into this plan: `:54323` is Studio, not "the full stack" (API is `:54321`), and the client should use `@supabase/ssr` (not plain `@supabase/supabase-js`) so SvelteKit SSR auth in Week 2 doesn't need rewiring.
- Categories: 5 generic placeholders (Sports, Music, Books, Tech, Outdoors), swappable later via data edit.
- Docker is installed and running, Node v24 / npx available — verified, so `supabase start` will work.
- Vercel: the adapter gets swapped now (cheap, matches "deploy from day one"), but note **a real Vercel deployment can't reach your local Supabase** (`localhost:54321` isn't reachable from Vercel's servers) — connecting the GitHub repo to Vercel and creating a hosted Supabase project remain manual steps for whenever you're ready to go live, not part of this pass.

## Steps

**1. Supabase CLI + local stack**
- `npm install supabase --save-dev` (from `huddle-app/`)
- `npx supabase init`
- `npx supabase start` (spins up Postgres, API, Studio, Inbucket via Docker; prints local URL + anon key)

**2. Schema + RLS as migration files** (`huddle-app/supabase/migrations/`)
One migration covering:
- `profiles` (id references `auth.users`, name, bio, created_at) — 1:1 with Supabase auth users. Deliberately kept to only intentionally-public fields (no email/preferences here) since the table is publicly readable — anything private goes in a separate, non-public table later if needed.
- `categories` (id, name unique, sort_order) — seeded with the 5 placeholders.
- `events` (id, organizer_id → profiles, category_id → categories, title, description, event_at, location text, capacity int > 0, created_at).
- `enrollments` (id, event_id → events, user_id → profiles, created_at, **unique(event_id, user_id)** — DB-level double-enrollment prevention).
- **Profile auto-creation**: an `after insert` trigger on `auth.users` (`handle_new_user`, `security definer`, fixed `search_path`) inserts the matching `profiles` row automatically, guaranteeing the 1:1 invariant regardless of which client creates the auth user. `name` defaults from `raw_user_meta_data->>'name'` (falls back to `''`) — Week 2's signup flow can pass it via `signUp(...).options.data.name` or patch the profile after.
- **Capacity enforcement, made RLS-safe**: a `before insert` trigger/function on `enrollments` that:
  1. Is `security definer` with a fixed `set search_path = public` (so it can't be hijacked via search_path tricks, and its count query isn't filtered by the inserting user's `enrollments` SELECT RLS policy — without this, the count would silently undercount).
  2. Locks the parent `events` row (`for update`) before counting, to serialize concurrent inserts for the same event.
  3. Raises an exception if `count(enrollments) >= capacity`.
- RLS enabled on all four tables:
  - `profiles`: public read (only the public fields listed above); insert/update restricted to `auth.uid() = id`.
  - `categories`: public read only (no write policy — edits go through Studio/SQL for now).
  - `events`: public read; insert/update/delete restricted to `auth.uid() = organizer_id`.
  - `enrollments`: select restricted to the enrolled user or the event's organizer; insert restricted to `auth.uid() = user_id`; delete (cancel) restricted to `auth.uid() = user_id`.
- `supabase/seed.sql` inserts the 5 categories, written idempotently (`on conflict (name) do nothing`) so `supabase db reset` can be run repeatedly without errors. The Supabase CLI runs this file automatically after migrations.

**3. Supabase client wiring** (no UI yet, just the plumbing Week 2 will build on)
- `npm install @supabase/ssr @supabase/supabase-js`
- `src/lib/supabase/client.ts` — browser client via `createBrowserClient`.
- `src/hooks.server.ts` — server client via `createServerClient`, plus a `safeGetSession` helper on `event.locals`. **Security boundary is explicit**: `safeGetSession` reads the cookie-based session for convenience (fast, no network call) but any authorization decision must call `supabase.auth.getUser()`, which verifies the JWT against the auth server — `getSession()`'s session/user is never trusted on its own for gating access, only for optimistic UI.
- `src/app.d.ts` — extend `App.Locals` with `supabase` and `safeGetSession` types.
- `.env` (gitignored, already covered by existing `.gitignore` rules) and `.env.example` with `PUBLIC_SUPABASE_URL` / `PUBLIC_SUPABASE_ANON_KEY` populated from the local stack's printed values.

**4. Deploy adapter swap**
- Replace `@sveltejs/adapter-auto` with `@sveltejs/adapter-vercel` in `package.json` and the `vite.config.ts` kit config (this repo configures the adapter inline in `vite.config.ts`, not a separate `svelte.config.js`).
- Confirm `npm run build` still succeeds locally with the new adapter.

**5. Do not**
- Create a hosted Supabase project or connect Vercel (your manual steps, later).
- Commit anything unless you explicitly ask.
- Build any auth/event/browse UI — that's Week 2.

## Verification
- `npx supabase status` shows all services running; Studio at `http://localhost:54323` shows `profiles`, `categories`, `events`, `enrollments` tables with RLS enabled and the 5 seeded categories.
- In the SQL editor: inserting a second `enrollments` row for the same `(event_id, user_id)` fails on the unique constraint; inserting past `capacity` fails via the trigger.
- `npm run build` succeeds with `adapter-vercel`.
- `npm run check` / `npm run lint` still pass after the dependency and config changes.
