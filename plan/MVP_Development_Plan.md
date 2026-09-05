# MVP Development Plan — Interest-Based Event Platform

Working name: TBD (name selection deferred — see PRD Section 10 for candidates)

Stack: SvelteKit + Supabase + Tailwind CSS + Vercel (updated from Next.js — see decision note below)

This plan takes the P0 feature list from the original PRD and breaks it into three shippable MVP tiers instead of one big build. The goal is to get a live, testable product loop in front of real users as fast as possible, then layer on features based on what actually breaks or gets requested — not build the full P0 list before anyone touches it.

> **Stack decision note:** Originally scoped as Next.js. Switched to SvelteKit because you're not hiring (now or planned), you're relying on AI coding agents for most frontend implementation, and you have no prior familiarity with either framework. Svelte's simpler, less boilerplate-heavy syntax lowers the review burden when checking AI-generated code. One caution: explicitly prompt your AI agent to use Svelte 5 runes syntax (`$state`, `$derived`, `$effect`) rather than the older Svelte 4 store/reactive-statement patterns, since AI agents have less Svelte training data overall and can blend the two incorrectly.

> **Revision note (v2):** Updated after two rounds of review. Key changes from v1: authorization/RLS, basic mobile usability, and lightweight instrumentation moved into MVP-0; categories now DB-driven from the UI rather than hardcoded; confirmation email pushed later given friends-only MVP-0 testing. See "Changelog from v1" at the bottom for the full diff.

---

## Guiding Principles

1. **Ship the smallest working loop first.** Auth → create event → browse → join → see enrollment. Everything else can wait.
2. **Deploy from day one.** Get CI/CD to Vercel working in the first session so every subsequent feature ships to a live URL, not just localhost.
3. **No feature is added to MVP-0 "just in case."** If it's not required for the core loop *or for that loop to be safe and measurable*, it goes to MVP-1 or later.
4. **Pick one niche before building the seed content.** The plan assumes you've chosen a wedge community (from earlier discussion) before MVP-0 testing begins — this determines your first 5-10 real organizers. **This needs a hard date, not just "before testing begins" — set it in Week 1, day 1-2, before schema work starts**, since your categories seed depends on it.

---

## MVP-0: The Working Loop (Target: ~2 weeks)

**Goal:** One person can create an event, another can find and join it, safely, on a live URL. Nothing else.

| Feature | Scope (trimmed) |
|---|---|
| Auth | Supabase email/password only. No social login, no email verification flow polish. |
| Profile | Name + optional bio. No avatar upload yet. |
| Event Creation | Single form (not a wizard): title, description, category (dropdown, **read from a `categories` table**, 5 seeded rows), date/time, location (plain text), capacity. |
| Categories | Seeded in DB, but the UI reads from the `categories` table rather than a hardcoded list — no admin UI to manage them yet, but changing the taxonomy is a data edit, not a code deploy. |
| Event Browsing | Flat list/grid, newest first. No search, no filters. **Login-gated** — logged-out visitors bounce to `/login`; MVP-1's "Public Event Page (no login)" is what removes this gate, not a schema/RLS change (public reads are already permitted at the RLS level). |
| Event Detail Page | Title, description, date/time, location, capacity/enrolled count, Join button. **Login-gated**, same reasoning as Event Browsing above. |
| Enrollment | Join = auto-approved only. No manual approval, no waitlist. |
| **Authorization (RLS)** | **Define alongside the schema, not as cleanup:** users can only edit/delete their own events; users can't enroll themselves twice in the same event; organizers can't enroll in their own event; capacity can't be exceeded (enforce at the DB level, not just in the UI); users can't read/write another user's profile or event data outside what's meant to be public. |
| **Mobile usability** | Not a responsive polish pass — just confirm the 3 core screens (browse, detail, join) are usable on a phone. If it's unusable on mobile, treat it as a bug, not a later task. |
| **Basic instrumentation** | Log `event_created`, `event_viewed`, `join_clicked`, `join_succeeded`. `enrollment_completed` is not a separate log point in MVP-0 — auto-approve-only means there's no completion moment distinct from the join succeeding (this becomes a real distinction once MVP-2's manual-approval option exists). `repeat join` is a derived query over the log (does this user have an earlier `join_succeeded` row?), not a fifth write-time event. `signup` instrumentation is a known small gap in the already-shipped auth slice, to be patched separately. No analytics platform needed — a simple events table is enough. This is what turns MVP-1 planning into evidence instead of opinion. |

**Explicitly cut from MVP-0** (all deferred to MVP-1+): organizer dashboard, edit/cancel events, search/filters, waitlist, manual approval, notifications/confirmation email, image uploads, public no-login pages, categories admin UI, true responsive polish.

**Definition of done:** You and 2-3 friends, plus at least one non-developer who isn't a friend, can each create an account, post an event, and join someone else's event, on the deployed URL, without you touching the database manually and without hitting a data-integrity or permissions bug.

---

## MVP-1: Launch-Ready (Target: ~2 more weeks)

**Goal:** What you actually put in front of your first niche community and start marketing.

| Feature | Notes |
|---|---|
| My Enrollments | Simple flat list of joined events. No tabs, no status badges. Moved here from MVP-0 — it's a filtered `events`⋈`enrollments` query with no new correctness/security decisions, and doesn't gate proving the core loop. |
| Organizer Dashboard (basic) | List of my events + who's enrolled. No analytics yet. |
| Edit / Cancel Event | Organizers can fix mistakes and cancel without emailing you. |
| Category Filter + Keyword Search | Minimum needed for browsing to not feel broken with >20 events. |
| Public Event Page (no login) | Required for sharing links in Discord/Reddit/Instagram during outreach — most of your marketing traffic will hit this page logged out. |
| Confirmation Email on Join | Via Resend. Only clearly necessary once strangers (not friends) are joining and you can't just check in with them directly — if instrumentation from MVP-0 shows people succeeding without it, this can slide to MVP-2. |
| Responsive Pass | Full mobile-first check on the 3 core screens (browse, detail, join) — MVP-0's version was "doesn't break," this is "feels good." |

**Definition of done:** You could hand this URL to a stranger organizer with zero explanation and they could post and fill an event without asking you for help.

---

## MVP-2: Retention Loop (Target: ~2-3 more weeks, post-launch)

**Goal:** Give people a reason to come back for a second event — this is the number to watch (per earlier discussion: % of joiners who join a second event within 60 days).

| Feature | Notes |
|---|---|
| Event Reminders | Email X hours before event start. |
| Ratings & Reviews | Post-event prompt; builds trust signal for future browsers. |
| Waitlist | Once events start filling up — a good problem to have. |
| Manual Approval Option | For organizers who want gatekeeping (e.g., skill-based events like "need a drummer"). |
| Profile Picture Upload | Cosmetic but affects trust/legitimacy of organizer profiles. |
| Categories Admin UI | Only if the DB-edit approach from MVP-0 is genuinely slowing you down by this point. |

Only build this tier once MVP-1 has real usage data telling you which of these actually matters — don't build all five (or six) just because they're listed. Let the MVP-0/MVP-1 instrumentation drive this list, not intuition.

---

## Deferred (Phase 2/3/4 — unchanged from PRD)

No change to the original PRD's later phases — messaging, recurring events, check-in, payments/ticketing, mobile app, admin panel. Revisit once MVP-2 is live and retention numbers justify further investment. See PRD Sections 6 and 11 for the full list.

---

## Suggested Build Sequence (Week by Week)

| Week | Focus |
|---|---|
| 1 | Confirm niche (day 1-2) + repo + Supabase project + schema (users, events, categories, enrollments) **with RLS policies defined alongside the schema** + Vercel deploy pipeline live from day 1 |
| 2 | Auth, event creation form (categories from DB), event list/detail, join flow, mobile usability check, basic instrumentation — MVP-0 complete and deployed |
| 3 | Organizer dashboard, edit/cancel, search/filter |
| 4 | Public event pages, full responsive pass, confirmation email (if instrumentation says it's needed) — MVP-1 complete, start manual organizer outreach |
| 5-7 | MVP-2 features, prioritized by what MVP-0/MVP-1 instrumentation and users actually show or ask for |

This compresses the original 6-week single-phase MVP into two 2-week shippable increments, so you have something real to show (and market) two weeks earlier than the original plan. Note Week 3-4 is still dense — if MVP-0 slips even a few days, build in the expectation that Week 4 (not the MVP-1 target date) absorbs the slip, since there's no separate buffer week.

---

## Immediate Next Steps

1. Confirm the niche/wedge community you're targeting first, in the first 1-2 days — this determines which categories you seed and who your first outreach targets are. Don't start schema work before this is locked.
2. Set up the Supabase project and SvelteKit repo, wire up Vercel deploy, and draft RLS policies alongside the schema — do this before writing any feature code.
3. Build MVP-0 in order: schema (with RLS) → auth → event creation (categories from DB) → browsing → join flow → mobile usability check → instrumentation.
4. Get 2-3 real people plus at least one non-developer to run through the full loop on the live URL before starting MVP-1.

---

## Changelog from v1

- Added RLS/authorization to MVP-0 as a first-class item, not cleanup (ownership checks, no double-enrollment, capacity enforcement, data isolation).
- Categories: still seeded and hardcoded in the DB, but UI now reads from the `categories` table instead of a hardcoded list in code.
- Added basic instrumentation (signup, event created/viewed, join clicked/succeeded, enrollment, repeat join) to MVP-0.
- Added a scoped-down "mobile usability" check to MVP-0 (distinct from MVP-1's full responsive pass).
- Confirmation email: kept in MVP-1 but reframed as conditional on instrumentation data, not a fixed requirement — may slide to MVP-2.
- MVP-0 definition of done: added one non-developer tester alongside friends, short of requiring 5-10 strangers (that bar stays at MVP-1, where it already existed).
- Niche/wedge decision given an explicit Week 1 deadline instead of an open-ended "before testing begins."
- **(v3, during Events slice planning)** Event Browsing and Event Detail marked login-gated for MVP-0 (removing the gate is MVP-1's "Public Event Page" work, not a new RLS change). My Enrollments moved from MVP-0 to MVP-1. Basic instrumentation scope narrowed to 4 concrete log points (`event_created`, `event_viewed`, `join_clicked`, `join_succeeded`), with `enrollment_completed`/`repeat join` reframed as derived concepts rather than separate writes, and `signup` instrumentation flagged as an outstanding gap in the shipped auth slice. Authorization row also now explicitly calls out organizer self-enrollment prevention.
