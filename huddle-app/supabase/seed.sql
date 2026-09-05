-- Placeholder categories — swap later via a data edit, not a code deploy.
-- Idempotent: safe to run repeatedly (e.g. on every `supabase db reset`).
insert into public.categories (name, sort_order) values
  ('Sports', 1),
  ('Music', 2),
  ('Books', 3),
  ('Tech', 4),
  ('Outdoors', 5)
on conflict (name) do nothing;
