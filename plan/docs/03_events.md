# Plan: Event Creation, Browsing, Detail & Join for huddle-app

## Context
Auth (signup/login/logout) is merged to `main`. This slice covers the rest of MVP-0's "working loop" per `plan/MVP_Development_Plan.md`: create → browse → detail → **join** → see the count. My first draft deferred Join entirely; a design review caught that the RLS gap I was worried about (below) only affects *displaying* a count, not the Join action itself — so Join belongs in this slice per MVP-0's own definition of done ("post an event, **and join someone else's event**").

**Two places where this plan deliberately diverges from the literal MVP-0 table, both resolved by updating `MVP_Development_Plan.md` itself rather than silently drifting from it (Step 0 below):**
- **My Enrollments** is listed as its own MVP-0 row in the current doc. Moving it to MVP-1 instead — it's a trivial follow-up (a filtered `events`⋈`enrollments` query, no new correctness/security decisions) and doesn't gate proving the core loop this slice already delivers.
- **Basic instrumentation** in the current doc lists seven events: `signup, event created, event viewed, join clicked, join succeeded, enrollment completed, repeat join`. This slice implements `event_created`, `event_viewed`, `join_clicked`, `join_succeeded` — but collapses `enrollment_completed` into `join_succeeded` (MVP-0 is auto-approve-only, so there's no distinct completion moment separate from the join succeeding — that distinction only starts to matter once MVP-2's manual-approval option exists) and treats `repeat join` as a query over the log (`does this user have an earlier join_succeeded row?`) rather than a fifth write-time event, since it's free to compute later from data that already exists. `signup` instrumentation is a gap in the *already-merged* auth slice, not something this plan's files touch — noted as a small separate addendum, not silently absorbed here.

**Scope grew from my first draft across three rounds of review — flagging the changes up front so they're easy to trim if you'd rather split further:**
- Join is now included (was deferred).
- A denormalized `events.enrolled_count` column + trigger is added in this slice's migration — needed for Join to have anything to display, and for the count to be correct under RLS (see below).
- Basic instrumentation (`event_created`, `event_viewed`, `join_clicked`, `join_succeeded`) is now included, per the scoping note above.
- A shared `requireUser()` server helper replaces four hand-duplicated auth guards.
- The `events/[id]` route uses a SvelteKit param matcher (`[id=uuid]`) for clean 404s on garbage IDs.
- Organizer self-enrollment is explicitly decided against, and enforced in RLS, not just hidden in the UI.
- Capacity-exceeded errors are matched on a stable custom SQLSTATE, not message text.
- The migration backfills `enrolled_count` and documents its invariant explicitly rather than assuming a clean slate.
- Server-side validation of `event_at`'s format is independent of (doesn't trust) the client-side timezone conversion.

## Key design decisions

**1. Why Join needs no count check, but count *display* needs a schema change.**
`enrollments` SELECT RLS only allows the enrollee or the organizer to see a given row (Week 1, intentional — enrollee identity shouldn't be publicly listable). A plain `count(*) from enrollments where event_id = x` run by anyone else — including an enrolled *non-organizer* viewing someone else's count — silently returns a wrong number (0, or 1 if they see only their own row). This doesn't block Join itself: the existing `enforce_event_capacity` trigger is `security definer` and already bypasses this correctly (proven in Week 1 testing), so the insert either succeeds or fails with a clear exception — no pre-check needed. But for a public, correct "14/20 enrolled" **display**, we need a value that doesn't depend on the viewer's RLS visibility: a denormalized `events.enrolled_count`, readable via the already-public `events` SELECT policy.

Its trigger has the same correctness requirement as `enforce_event_capacity`: an `after insert/delete on enrollments` trigger that does `update events set enrolled_count = enrolled_count ± 1` runs under the *joining user's* privileges unless it's also `security definer` — and the joiner is essentially never the organizer, so the existing "organizers can update their own events" RLS policy would silently reject that update, breaking every join. This trigger must follow the exact same `security definer` + fixed `search_path` pattern.

**Invariant, backfill, and concurrency — made explicit.** The invariant is `events.enrolled_count == count(*) from enrollments where event_id = events.id`, at all times, for every event. The migration doesn't just add the column with `default 0` and trust that to stay true — it backfills it in the same migration (`update events e set enrolled_count = (select count(*) from enrollments where event_id = e.id)`), so the invariant holds from the moment the column exists, regardless of whether any enrollment rows already exist (none do today, but the migration shouldn't silently assume that). The update itself, `enrolled_count = enrolled_count + 1`, is a single SQL statement — Postgres evaluates and writes it atomically under the row's lock; there's no separate read-then-write step to race. The actual concurrency guarantee for the *whole* join flow comes from the existing `enforce_event_capacity` trigger, which runs `for update` on the event row **before** this new trigger runs, inside the same transaction — that lock is held until commit, so two simultaneous joins for the same event are already serialized by the existing Week 1 code; this slice's counter trigger just rides on that same lock for free.

**2. Login-gating `/`, `/events/new`, `/events/[id=uuid]` — decided, recorded in the product plan, not just this slice's notes.**
MVP-1's feature list adds "Public Event Page (no login) ... most of your marketing traffic will hit this page logged out" as *new*, which reads as: MVP-0's equivalent pages are gated. RLS already permits public reads on `events`/`categories`/`profiles` regardless (so MVP-1 needs no RLS change later). Decision: **gate everything behind login for MVP-0** — a logged-out visitor gets zero public content, an immediate bounce to `/login`. Step 0 below updates `plan/MVP_Development_Plan.md` itself with this decision *before* any code is written, rather than leaving it as an assumption inside this implementation plan.

**3. Timezone handling — combined client-side, independently validated server-side.**
The create form needs one `event_at` timestamp from a date + time the organizer enters. If that combination happens **server-side** (`new Date(`${date}T${time}`)` in the Node/Vercel action), the date-time string has no offset, so it's parsed in the *server's* timezone (UTC on Vercel) — silently storing the wrong instant for any organizer not in UTC. Fix: combine client-side, where "no offset" correctly means the *browser's* (organizer's) local timezone — an `<input type="datetime-local" bind:value={localDateTime}>` plus a Svelte 5 `$derived` computing `new Date(localDateTime).toISOString()` into a hidden `event_at` field.

That alone isn't sufficient, though: there's no `use:enhance` anywhere in this app (matches existing convention), so every form action is reachable as a raw POST, and a client with JS disabled — or a direct request — could submit `event_at` without that `$derived` conversion ever running, sending an ambiguous or empty value. The server doesn't assume the client did its job: it validates the submitted `event_at` string matches `/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/` — an ISO-8601 UTC timestamp ending in `Z`, with fractional seconds optional and of any length — *before* parsing it at all, and rejects anything else with a friendly validation error. The property this enforces is "unambiguous UTC offset," not "matches `toISOString()`'s exact output byte-for-byte" — the client's normal path always produces the `.sssZ` (milliseconds) form, but the validator isn't coupled to that specific precision, since a `Z`-suffixed timestamp with no or different fractional digits is equally unambiguous and there's no correctness reason to reject it. Whatever precision is submitted, `new Date(...)` parses it correctly regardless of digit count — the runtime normalizes it before persistence, so there's no downstream ambiguity from accepting a range of valid input precisions.

**4. Organizer self-enrollment — decided, and enforced at the RLS level, not just hidden in the UI.**
Decision: an organizer cannot join their own event (avoids the degenerate case of an organizer occupying their own capacity). Hiding the Join button for the organizer is UI-only and bypassable by a direct API call — inconsistent with how every other rule in this project (ownership, double-enrollment, capacity) is enforced. So the migration also tightens the existing `"users can enroll themselves"` INSERT policy on `enrollments` so its `with check` also asserts the event's `organizer_id` isn't the inserting user: `with check (auth.uid() = user_id and not exists (select 1 from events e where e.id = event_id and e.organizer_id = auth.uid()))`. The UI hint (hiding the button) stays too, purely for UX — the RLS change is what actually makes the rule real.

**5. `event_viewed` semantics — decided.**
Every successful load of an event detail page logs an `event_viewed` row, including refreshes and repeat visits by the same user — no deduplication. Matches MVP-0's own framing ("no analytics platform needed, a simple events table is enough"); dedup is a cheap follow-up if the raw log turns out too noisy to act on.

**6. Stable error identification, not message text.**
Duplicate-enrollment already had a real stable signal (`23505`, the standard Postgres unique-violation SQLSTATE) — no change needed there. Capacity-exceeded didn't: it's a plain `raise exception 'Event is at capacity'`, which surfaces as generic SQLSTATE `P0001` (the same code *any* plpgsql `raise exception` uses) — matching on that alone would misfire if another business rule ever also raises a plain exception on the same table, and matching on message text is worse (fragile to copy changes). Fix: give `enforce_event_capacity` a custom SQLSTATE via `raise exception ... using errcode = 'EVCAP'`, a minimal, additive change to Week 1's function (only the `raise` line changes — the security-definer/search_path/locking logic that was already proven correct stays untouched). The join action then matches on `error.code === 'EVCAP'` and `error.code === '23505'` exclusively — no message inspection anywhere.

**7. Instrumentation is best-effort — it can never fail the action it's observing.**
`activity_log` is an observability sink, not part of any transaction's correctness. If an `event_created`/`event_viewed` insert fails for any reason (RLS misconfiguration, connection blip, whatever), that must never turn a successful event creation or a successful event lookup into a failure the user sees. Both log points are fire-and-forget: attempt the insert, and if it errors, swallow/log server-side and continue — never `fail()`/`error()`/block the response on the logging call's outcome. The counter/capacity triggers are the opposite of this by design (they're safety-critical and must block on failure) — instrumentation is deliberately held to a different standard.

**8. No floor on `enrolled_count`'s decrement.**
The counter trigger decrements unconditionally (`enrolled_count = enrolled_count - 1`), not clamped with `greatest(..., 0)`. This is a display-only column — actual capacity enforcement still comes from `enforce_event_capacity`'s own independent `count(*) from enrollments` query, untouched by this slice — so there's no safety reason to clamp it. If it ever goes negative, that means the invariant (`enrolled_count == count(enrollments)`) was already broken by something outside the code this slice writes (e.g. a manual DB edit bypassing triggers), and a silently-clamped value would hide that instead of surfacing it. The invariant-check test below (step 3 of the database milestone) is what should catch this, not a defensive clamp that masks it.

## Steps

Sequenced as two milestones, matching how Week 1 was actually done: **the database is built and independently verified correct before any UI depends on it.** Steps 2 (database milestone) is fully done and tested (see Test Instructions) before starting Step 3 onward (the SvelteKit layer).

**0. Update the product plan before writing code** — edit `plan/MVP_Development_Plan.md`: (a) add a short note next to the Event Browsing/Detail rows recording the login-gating decision (#2 below); (b) move the "My Enrollments" row from MVP-0 to MVP-1; (c) update the "Basic instrumentation" row to reflect the actual MVP-0 scope (`event_created`, `event_viewed`, `join_clicked`, `join_succeeded`, with `enrollment_completed` and `repeat join` noted as derived/collapsed concepts rather than separate log points, and `signup` flagged as a small outstanding gap in the already-merged auth slice).

**1. Shared guard helper** — `src/lib/server/require-user.ts`
- `requireUser(locals)`: calls `locals.safeGetSession()`, redirects to `/login` if `user` is null, returns the **verified** `user`. Used by every load/action below instead of hand-rolling the check four times (and instead of ever reading `session.user`, which is fine for optimistic nav display but shouldn't gate access or attribute a write — the risk is staleness, not forgery: `getSession()` won't notice a revoked/deleted account until token expiry).

**2. Database milestone — migration** (`supabase/migrations/<timestamp>_enrollment_count_and_activity_log.sql`)
- `alter table events add column enrolled_count int not null default 0;` + backfill `update` (see invariant note above).
- `security definer` trigger function (fixed `search_path`) on `after insert or delete on enrollments`, adjusting `enrolled_count` by exactly ±1 per row, unconditionally (decision #8 — no floor/clamp).
- `create or replace function enforce_event_capacity()` — same body as Week 1, just adding `using errcode = 'EVCAP'` to the raise (decision #6).
- `alter policy "users can enroll themselves" on enrollments with check (...)` — add the organizer-exclusion clause (decision #4).
- New table `activity_log` (id, `user_id references profiles on delete set null`, `event_type text`, `metadata jsonb`, `created_at`). RLS enabled, single policy: insert allowed where `auth.uid() = user_id`. No SELECT policy — write-only from the app's side, read via Studio/service role for now.
- **Verify this milestone completely** (Database Milestone tests below — direct API/RLS checks, the deterministic concurrency test, and the invariant-mismatch query) **before starting Step 3.**

**3. Root `/` — Browse**
- `+page.server.ts`: `requireUser`, then query `events` joined to `categories(name)` and `profiles(name)`, `order('created_at', { ascending: false })` — "newest first" read as most-recently-posted.
- `+page.svelte`: replaces the auth-slice placeholder. Grid of event cards (category badge, title, date/time, location, `enrolled_count`/`capacity`), or `.empty-state` with a "Create the first one" CTA if none exist.

**4. Create event** — `src/routes/events/new/+page.server.ts` + `+page.svelte`
- `load`: `requireUser`; fetch `categories` ordered by `sort_order` for the dropdown.
- Form: title, description (textarea), category (select), `datetime-local` + hidden derived ISO field (decision #3), location, capacity.
- Action validates: title non-empty & ≤120 chars; description ≥20 & ≤2000 chars (the 20-char minimum matches the mockup's own copy); category id is one of the loaded categories (clean `fail()`, not a raw FK-violation error); `event_at` matches `/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/` *and* is in the future; location non-empty & ≤200 chars; capacity is an integer between 1 and 500.
- Insert with `organizer_id: user.id` (the verified user from `requireUser`). On success: **best-effort** log `event_created` to `activity_log` (decision #7 — never blocks/fails the redirect), redirect to the new event's detail page. On failure: `fail(400, ...)` preserving all entered values.

**5. Event detail** — `src/routes/events/[id=uuid]/+page.server.ts` + `+page.svelte` (+ `src/params/uuid.ts` param matcher, new)
- `src/params/uuid.ts`: a `ParamMatcher` regex for UUIDs, so a garbage `:id` 404s cleanly before the load function runs, instead of a raw Postgres `22P02 invalid input syntax` surfacing as a 500.
- `load`: `requireUser`; fetch the event (joined to category name, organizer name, `enrolled_count`); `error(404, 'Event not found')` if missing; also check whether the viewer already has an enrollment row for this event (safe under RLS — a user reading their *own* row is always permitted). **Best-effort** log `event_viewed` to `activity_log` (decision #7 — a logging failure must not turn a successful lookup into a 500).
- Displays title, category, organizer, date/time, location, description, and `enrolled_count`/`capacity`.
- CTA area: organizer sees "You created this event" (no Join button — decision #4; no edit/cancel, cut from MVP-0); already-enrolled viewer sees a disabled "You're in ✓"; full-and-not-enrolled sees disabled "Event Full"; otherwise an active "Join Event" button.
- **Join action**: best-effort log `join_clicked` (decision #7) as the action starts, then insert into `enrollments` with `user_id: user.id`. On success: best-effort log `join_succeeded` (standing in for `enrollment_completed` too, per the scoping note above), re-render with the new state (the DB trigger already updated the count). On failure, map by stable error code only (decision #6): `23505` → "You've already joined this event."; `EVCAP` → "This event just filled up."; anything else → a generic fallback.

**6. Nav + design system**
- `+layout.svelte`: add a "+ New Event" button (`.btn.btn-primary.btn-sm`, `resolve('/events/new')`) alongside the existing email/logout.
- `layout.css`: port `.card`, `.event-card`/`.cover`/`.ecard-*`, `.grid-events`, `.chip` (static badge here, not interactive), `.empty-state`, `.pg-title`/`.pg-sub`, `.avatar`, `.capacity-bar`/`.capacity-row`/`.capacity-txt`. Broaden the existing `.field input` rule to also style `select` and `textarea`.

## Deferred to the next slice
My Enrollments list (moved to MVP-1 per Step 0), mobile usability pass, edit/cancel events, search/filters, waitlist, manual approval.

## Small separate addendum (not part of this plan's files)
`signup` instrumentation is missing from the already-merged auth slice. Once `activity_log` exists (this slice's migration), adding a single best-effort log call to the existing signup action is a one-line change — flagging it here so it doesn't get lost, but it's a tiny patch to a different, already-shipped slice, not something to fold into this plan's diff without saying so explicitly.

## Test Instructions / Manual Verification

### Database milestone (run right after Step 2, before building any UI)

**Direct API / RLS verification (bypassing the UI entirely)** — using `curl` against the PostgREST endpoint (`http://127.0.0.1:54321/rest/v1/...`) with a real user's access token, the same methodology used for Week 1's RLS testing. Treat step 5 (organizer self-enrollment) as a required regression check, not an optional one — it's the newest and most easily-regressed RLS rule in this slice:
1. Attempt to insert an `events` row with `organizer_id` set to a *different* user's id than the authenticated caller → rejected by RLS.
2. Attempt to `update`/`delete` another user's event → rejected.
3. Attempt to insert a duplicate `enrollments` row directly → rejected (`23505`).
4. Attempt to insert an `enrollments` row for an event already at capacity → rejected (`EVCAP`).
5. As the organizer, attempt to insert an `enrollments` row enrolling themselves in their own event → rejected by the tightened RLS policy (decision #4) — confirms this isn't just a hidden button.

**Concurrency** — deterministic, not timing-dependent:
6. Create an event with capacity `1`. Open two `psql` sessions against the local DB. In session 1: `begin;` then insert an enrollment for user X (this acquires the event row's lock via `enforce_event_capacity`'s `for update`, but don't commit yet). In session 2: attempt to insert an enrollment for user Y — it should **block**, waiting on session 1's lock. Commit session 1 → session 2's insert then resolves, and it should fail with `EVCAP` (capacity now consumed by X). Confirm `enrolled_count` ends at exactly `1`, not `2` and not `0`.

**Invariant check** — after the above tests have created some enrollments:
7. Run `select e.id, e.enrolled_count, count(en.id) as actual from events e left join enrollments en on en.event_id = e.id group by e.id, e.enrolled_count having e.enrolled_count != count(en.id);` → must return **zero rows**. This directly tests the invariant (`enrolled_count == count(enrollments)`) rather than only inferring it from UI numbers.

### Application layer (after Steps 3–6)

**Happy path**
8. `cd huddle-app && npx supabase start && npm run dev`. Log in as user A.
9. Visit `/` — empty state (no events yet) with a "Create the first one" CTA.
10. Create an event with valid data — redirected to its detail page; verify every field displays correctly, `enrolled_count` shows `0`.
11. Back on `/`, the event appears in the grid with the right count (`0/<capacity>`).
12. Log out, log in as user B (sign up a second test account if needed). Visit the event's detail page, click **Join Event** → button becomes "You're in ✓", count updates to `1/<capacity>`.
13. Refresh the page — state persists (confirms it's server-rendered from the DB, not just client state).
14. As user B, attempt to join again → "You've already joined this event.", count unchanged.
15. As user A (organizer), visit the detail page → "You created this event" note, no Join button.

**Capacity**
16. Create an event with capacity `1`. Have a second user join (succeeds, count becomes `1/1`). Have a third user attempt to join → "This event just filled up.", state reflects Full.

**Guards**
17. Log out, try `/`, `/events/new`, and a valid event's `/events/<id>` URL → all redirect to `/login`.
18. While logged in, visit `/events/not-a-uuid` → clean 404, not a raw error page.

**Validation errors** (each a friendly inline message, not a raw DB error)
19. Empty title; description under 20 characters; no category selected; date/time in the past; capacity 0, negative, or over 500.

**Timezone correctness**
20. Create an event with a date/time a few hours from now. In Supabase Studio → Table Editor → `events`, confirm `event_at` (stored in UTC) matches your local input converted correctly — e.g. if your machine is UTC-5 and you entered 2:00 PM, the stored value should be 19:00 UTC, not 14:00 UTC.

**Instrumentation**
21. In Studio, check `activity_log` after the happy-path steps above — one `event_created` row (step 10), one `event_viewed` row per detail-page load (steps 10, 12, 13, 15 each count), and `join_clicked`/`join_succeeded` rows from step 12's join. Also confirm (by temporarily breaking the insert, e.g. a bad column name, or just reasoning through the code path) that a logging failure can't 500 the page or block the join/create action — this is a code-review check as much as a runtime one.

**Quality**
22. `npm run check` and `npm run lint` pass clean.
