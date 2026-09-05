-- ============================================================
-- huddle-app initial schema: profiles, categories, events, enrollments
-- ============================================================

-- ---------- profiles ----------
-- Kept deliberately minimal: only fields meant to be publicly readable.
-- Anything private (email, preferences, etc.) belongs in a separate,
-- non-public table later — do not add such fields here.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null default '',
  bio text,
  created_at timestamptz not null default now()
);

-- ---------- categories ----------
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order int not null default 0
);

-- ---------- events ----------
create table public.events (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references public.profiles (id) on delete cascade,
  category_id uuid not null references public.categories (id),
  title text not null,
  description text not null,
  event_at timestamptz not null,
  location text not null,
  capacity int not null check (capacity > 0),
  created_at timestamptz not null default now()
);

-- ---------- enrollments ----------
create table public.enrollments (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (event_id, user_id)
);

-- ============================================================
-- Profile auto-creation
-- ============================================================
-- Guarantees the profiles<->auth.users 1:1 invariant regardless of which
-- client creates the auth user. security definer + fixed search_path so
-- it can write to public.profiles regardless of the caller's RLS context,
-- and can't be redirected via a hostile search_path.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'name', ''));
  return new;
end;
$$;

create trigger trg_handle_new_user
after insert on auth.users
for each row execute function public.handle_new_user();

-- ============================================================
-- Capacity enforcement (RLS-safe)
-- ============================================================
-- security definer + fixed search_path: without this, the count query
-- below would run under the inserting user's privileges and be filtered
-- by the enrollments SELECT RLS policy (visible only to the enrollee or
-- organizer), silently undercounting. Locking the parent event row with
-- `for update` serializes concurrent inserts for the same event so two
-- simultaneous joins can't both pass the check.
create function public.enforce_event_capacity()
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
    raise exception 'Event is at capacity';
  end if;

  return new;
end;
$$;

create trigger trg_enforce_event_capacity
before insert on public.enrollments
for each row execute function public.enforce_event_capacity();

-- ============================================================
-- Row Level Security
-- ============================================================
alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.events enable row level security;
alter table public.enrollments enable row level security;

-- profiles: public read (public fields only, by table design); owner-only write
create policy "profiles are publicly readable"
  on public.profiles for select
  using (true);

create policy "users can insert their own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- categories: public read only; writes go through Studio/SQL for now
create policy "categories are publicly readable"
  on public.categories for select
  using (true);

-- events: public read; organizer-only write
create policy "events are publicly readable"
  on public.events for select
  using (true);

create policy "users can create their own events"
  on public.events for insert
  with check (auth.uid() = organizer_id);

create policy "organizers can update their own events"
  on public.events for update
  using (auth.uid() = organizer_id);

create policy "organizers can delete their own events"
  on public.events for delete
  using (auth.uid() = organizer_id);

-- enrollments: visible to the enrollee or the event's organizer;
-- users can enroll/cancel only themselves
create policy "users can view their own enrollments"
  on public.enrollments for select
  using (auth.uid() = user_id);

create policy "organizers can view enrollments for their events"
  on public.enrollments for select
  using (
    exists (
      select 1 from public.events e
      where e.id = enrollments.event_id
        and e.organizer_id = auth.uid()
    )
  );

create policy "users can enroll themselves"
  on public.enrollments for insert
  with check (auth.uid() = user_id);

create policy "users can cancel their own enrollment"
  on public.enrollments for delete
  using (auth.uid() = user_id);
