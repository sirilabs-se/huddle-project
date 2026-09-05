# Plan: Auth (signup / login / logout) for huddle-app

## Context
Week 1 (schema, RLS, local Supabase, Vercel adapter) is merged to `main`. Per `plan/MVP_Development_Plan.md`, Week 2 bundles auth, event creation, browsing, join flow, mobile check, and instrumentation — too much for one slice, so as agreed, this pass covers **auth only**: signup, login, logout. Event creation/browsing/join flow becomes its own next slice once auth is solid. Password reset (mockup page 3, "Forgot Password") is also deferred — MVP-0 explicitly deprioritizes "email verification flow polish," and this keeps the slice tight.

Confirmed via exploration of the current repo state:
- **Genuinely greenfield**: `src/routes/` has only the default SvelteKit scaffold page and a bare `+layout.svelte` — no auth routes, components, or logic exist anywhere.
- Week 1's plumbing is intact: `src/hooks.server.ts` defines `event.locals.safeGetSession()` returning **`{ session, user }`** (not just `session` — `user` comes from the verified `getUser()` call, per Week 1's explicit security boundary: never trust `getSession()`'s user for authorization). `src/lib/supabase/client.ts` (browser client factory) and `src/app.d.ts` (typed `Locals`/`PageData.session`) are also intact. **Missing piece**: no `+layout.server.ts` actually calls `safeGetSession()` yet — this pass adds that wiring, and every auth decision in this slice (redirect guards, nav state) goes through this same helper, never an ad hoc `getSession()` call — establishing this as the project's convention for future protected routes too.
- `profiles.name` is auto-populated by the Week 1 `handle_new_user` trigger from `raw_user_meta_data->>'name'` — the signup form must pass `name` via `signUp(...).options.data.name`, not write to `profiles` directly. `profiles.bio` is untouched by the trigger and stays empty until a future profile-editing feature.
- `supabase/config.toml` already has `auth.email.enable_confirmations = false` — signup returns a usable session immediately, no email-confirmation step to build around.
- No design tokens exist yet (`src/routes/layout.css` is just `@import 'tailwindcss'` + typography plugin) — auth pages will use plain Tailwind v4 utility classes, loosely following the mockup's visual layout (centered card, labeled fields, primary button, inline error text) rather than porting its full CSS-variable design system, which is a separate future task.

## Steps

**1. Session wiring (root layout)**
- `src/routes/+layout.server.ts`: call `const { session } = await event.locals.safeGetSession()`, return `{ session }` — populates the already-typed `PageData.session`. (The helper also returns a verified `user`; not needed in `PageData` for this slice, but the same helper — never a raw `getSession()` — is what every subsequent auth check in this plan calls.)
- `src/routes/+layout.svelte`: accept `data`, render a minimal nav — "Log in" / "Sign up" links when `data.session` is null, or the user's email + a "Log out" button (posts to `/logout`) when present.

**2. Signup** — `src/routes/signup/+page.svelte` + `+page.server.ts`
- **Guard**: `load` calls `locals.safeGetSession()`; if `session` exists, `redirect(303, '/')` — logged-in users shouldn't see the signup form.
- Form fields: name, email, password (matches mockup's Sign Up page), each with the right `autocomplete` (`name`, `email`, `new-password`).
- Server action: read and trim fields —
  ```ts
  const name = formData.get('name')?.toString().trim() ?? '';
  const email = formData.get('email')?.toString().trim() ?? '';
  const password = formData.get('password')?.toString() ?? '';
  ```
  Validate: `name.length > 0` (and a reasonable max length), `email.length > 0`, `password.length >= 8`. Don't lowercase/normalize email beyond trimming — let Supabase own that.
- Call `locals.supabase.auth.signUp({ email, password, options: { data: { name } } })`.
- Success → `redirect(303, '/')`.
- Failure → **don't** branch on a specific assumed error code (e.g. `user_already_exists`) — Supabase's exact error shape for duplicate emails isn't being confirmed against this project's local version, and over-specific error messaging risks account enumeration anyway. Return one generic message: `fail(400, { error: 'Unable to create an account with those details.', name, email })`. Never repopulate `password`.

**3. Login** — `src/routes/login/+page.svelte` + `+page.server.ts`
- **Guard**: same pattern — `load` redirects to `/` if already logged in.
- Form fields: email, password, with `autocomplete="email"` / `autocomplete="current-password"`.
- Server action: trim email, call `locals.supabase.auth.signInWithPassword({ email, password })`.
- Success → `redirect(303, '/')`. Failure → `fail(400, { error: 'Incorrect email or password.', email })` (generic — don't reveal which field was wrong, never repopulate `password`).

**4. Logout** — `src/routes/logout/+page.server.ts`
- Default **action** (POST-only by SvelteKit convention — form actions don't run on GET): `locals.supabase.auth.signOut()` then `redirect(303, '/')`. No page UI — only reachable via the nav's `<form method="POST" action="/logout">` button. Verified in testing (below) that a plain `GET /logout` does not sign anyone out.

**5. Root page placeholder**
- Swap `src/routes/+page.svelte`'s scaffold content for a minimal, direct check using the session data already in `PageData` — no profile fetch here:
  - Logged in: `Welcome, {data.session.user.email}`
  - Logged out: `You're not logged in.`
- Keeps this slice's proof-of-work focused on the auth chain itself (signup creates a user → trigger creates the profile → SSR session available → logout clears it → login restores it); profile data correctness is verified separately via Studio, not by wiring up profile fetching here.

## Explicitly not in this pass
Forgot/reset password, event creation/browsing/detail/join flow, the mockup's full app-shell/topnav component system, basic instrumentation, mobile responsive pass, a testing framework (none exists yet — not being introduced just for this slice).

## Verification

**Happy path**
- `npx supabase start` (local DB was reset when its volume was removed earlier — migrations + seed re-run automatically). `npm run dev`.
- Visit `/` logged out → nav shows Login/Signup, page shows "You're not logged in."
- Sign up a new user → redirected to `/` → page shows `Welcome, <email>` and nav shows the authenticated state.
- Hard-refresh `/` after login → session still recognized (proves SSR cookie wiring, not just client state).
- Check Supabase Studio (Table Editor → `profiles`) → row exists with the correct **trimmed** name.
- Log out → redirected to `/`, nav/page revert to logged-out state.
- Log back in with the same credentials → authenticated state returns.

**Auth route guards**
- While logged in, visit `/login` → redirected to `/`.
- While logged in, visit `/signup` → redirected to `/`.
- `GET /logout` does not log the user out (only the POST form action does).

**Error paths**
- Signup with blank/whitespace-only name → rejected before hitting Supabase.
- Signup with password under 8 characters → rejected.
- Signup with an email missing a TLD (e.g. `user@gmail`) → rejected with "Please enter a valid email address." **Added after initial implementation**: Supabase Auth's own email validation is permissive and accepts addresses without a TLD, confirmed directly against the GoTrue API (`POST /auth/v1/signup` returned a valid session for `test@gmail`). The signup action now enforces `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` itself rather than relying on Supabase to catch this.
- Signup with a duplicate email → generic error shown, `name`/`email` preserved in the form, password field empty.
- Login with wrong password → generic "Incorrect email or password," email preserved, password field empty.

**Quality**
- `npm run check` and `npm run lint` pass clean.

## Manual Verification (Try It Yourself)

Everything below was already run and confirmed once during implementation (backend checks via direct DB queries + form submissions, frontend checks via computed styles, since this session's browser pane couldn't display real clicks) — this section is so you can re-run the same checks yourself in a real browser.

Note: the auth pages are now styled per the design mockup (`design/ux-mockup/event-platform-mockup_tool4.html`) — centered card, dark primary button, sticky top nav with a gradient mark — not plain unstyled forms.

### 0. Start everything

**Run `supabase` commands from `huddle-app/`, not the repo root.** Running `npx supabase start` from `huddle-project/` (the parent folder) silently auto-initializes a *second, separate, empty* Supabase project there instead of erroring — it binds to the same ports as the real one, so the app still connects to *something*, just an unmigrated stack with no tables and no `handle_new_user` trigger. This actually happened during testing: it looked like "no tables in Table Editor" plus an invalid email (`user@gmail`, no TLD) getting accepted, because the real schema/trigger were never applied. Fixed by deleting the stray `huddle-project/supabase/` folder and starting from the correct directory. If Table Editor ever looks empty, `docker ps` and check the container names end in `_huddle-app`, not `_huddle-project`.

```bash
cd huddle-app
npx supabase start   # prints URLs/keys; Studio at http://127.0.0.1:54323
npm run dev          # app at http://localhost:5173
```
(`.env` already has the matching local anon key from Week 1 — nothing to configure.)

### 1. Happy path
1. Open `http://localhost:5173` — nav shows **Log in** / **Sign up**, page shows "You're not logged in."
2. Click **Sign up**. Fill in a name, a new email, and a password (8+ characters). Submit.
3. You should land back on `/`, nav now shows your email + **Log out**, and the page shows "Welcome, `<email>`".
4. Hard-refresh the page (Cmd/Ctrl+Shift+R) — you should still be logged in (this proves the session is a real SSR cookie, not just in-memory client state).
5. Open Studio (`http://127.0.0.1:54323`) → **Table Editor** → `profiles` → confirm a row exists with your name, correctly trimmed of extra whitespace.
6. Click **Log out** — nav/page revert to logged-out state.
7. Log back in with the same email/password at `/login` — you should be authenticated again.

### 2. Auth route guards
1. While logged in, manually navigate to `http://localhost:5173/login` — you should be bounced straight back to `/`.
2. Same for `http://localhost:5173/signup` — bounced back to `/`.
3. While logged in, navigate directly to `http://localhost:5173/logout` (a GET, not clicking the button) — you should **not** be logged out; the page just shows nothing. Refresh `/` afterward to confirm you're still authenticated.

### 3. Error paths
1. Log out, then try to sign up again with the **same email** as step 1 — you should see "Unable to create an account with those details." and the name/email fields stay filled in, password field empty.
2. On `/login`, enter the right email with a **wrong password** — you should see "Incorrect email or password.", email preserved, password field empty.
3. On `/signup`, try a name that's only spaces, or a password under 8 characters — the form should reject it (either the browser's native validation catches it first, or the server does if you bypass that).
4. On `/signup`, try an email with no TLD, like `someone@gmail` — should be rejected with "Please enter a valid email address." (this used to slip through, since Supabase Auth's own validation doesn't require a TLD — fixed by adding our own check).

### 4. Cleanup (optional)
If you want a clean slate before testing more: Studio → **Authentication** → **Users** → delete the test user(s) you created. Their `profiles` row is deleted automatically (cascading delete from Week 1's schema).
