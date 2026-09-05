-- ============================================================
-- enrolled_count (denormalized, RLS-safe public read)
-- ============================================================
-- enrollments SELECT RLS only exposes a row to its enrollee or the event's
-- organizer, so a plain `count(*) from enrollments` run by anyone else
-- silently undercounts. This column is the public, always-correct view of
-- that count, maintained by a security-definer trigger below.
--
-- Invariant: events.enrolled_count == count(*) from enrollments where
-- event_id = events.id, at all times, for every event. The backfill below
-- makes this true from the moment the column exists rather than assuming
-- a clean slate.
alter table public.events add column enrolled_count int not null default 0;

update public.events e
set enrolled_count = (
  select count(*) from public.enrollments where event_id = e.id
);

-- security definer + fixed search_path: this trigger runs on the joining
-- user's insert/delete, and the joiner is essentially never the organizer,
-- so without this the existing "organizers can update their own events"
-- policy would silently reject the update, breaking every join. Decrements
-- unconditionally (no floor at 0) — this is a display-only column, actual
-- capacity enforcement is enforce_event_capacity's own independent count,
-- and a silent clamp would hide an invariant violation instead of
-- surfacing it.
create function public.adjust_event_enrolled_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (tg_op = 'INSERT') then
    update public.events set enrolled_count = enrolled_count + 1 where id = new.event_id;
    return new;
  elsif (tg_op = 'DELETE') then
    update public.events set enrolled_count = enrolled_count - 1 where id = old.event_id;
    return old;
  end if;
  return null;
end;
$$;

create trigger trg_adjust_event_enrolled_count
after insert or delete on public.enrollments
for each row execute function public.adjust_event_enrolled_count();

-- ============================================================
-- Stable error code for capacity-exceeded
-- ============================================================
-- Was a plain `raise exception`, which surfaces as generic SQLSTATE P0001 —
-- the same code any plpgsql raise uses. A custom errcode lets the app match
-- reliably instead of inspecting the message text. Only the raise line
-- changes; the security-definer/search_path/locking logic is untouched.
create or replace function public.enforce_event_capacity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  event_capacity int;
  current_count int;
begin
  select capacity into event_capacity
  from public.events
  where id = new.event_id
  for update;

  select count(*) into current_count
  from public.enrollments
  where event_id = new.event_id;

  if current_count >= event_capacity then
    raise exception 'Event is at capacity' using errcode = 'EVCAP';
  end if;

  return new;
end;
$$;

-- ============================================================
-- Organizer self-enrollment prevention
-- ============================================================
-- Hiding the Join button for the organizer in the UI is bypassable via a
-- direct API call, so the rule is enforced here too, consistent with how
-- every other business rule in this app is enforced at the RLS level.
drop policy "users can enroll themselves" on public.enrollments;

create policy "users can enroll themselves"
  on public.enrollments for insert
  with check (
    auth.uid() = user_id
    and not exists (
      select 1 from public.events e
      where e.id = event_id
        and e.organizer_id = auth.uid()
    )
  );

-- ============================================================
-- activity_log (best-effort instrumentation sink)
-- ============================================================
-- Write-only from the app's side: no SELECT policy, read via Studio/service
-- role for now. user_id is set null on user deletion rather than cascaded,
-- so historical activity isn't lost when an account is removed.
create table public.activity_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete set null,
  event_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.activity_log enable row level security;

create policy "users can log their own activity"
  on public.activity_log for insert
  with check (auth.uid() = user_id);
