-- Template for new public tables that must keep working through Supabase Data API
-- after the October 30, 2026 grant rollout.
--
-- How to use:
-- 1. Copy the relevant parts into a new migration in supabase/migrations/.
-- 2. Replace public.your_table and policy names.
-- 3. Keep the grants and RLS together in the same migration.

create table if not exists public.your_table (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

grant select
  on public.your_table
  to anon;

grant select, insert, update, delete
  on public.your_table
  to authenticated;

grant select, insert, update, delete
  on public.your_table
  to service_role;

alter table public.your_table enable row level security;

drop policy if exists your_table_select_own_or_owner on public.your_table;
create policy your_table_select_own_or_owner
on public.your_table
for select
to authenticated
using (
  user_id = auth.uid()
  or public.is_owner()
);

drop policy if exists your_table_insert_own_or_owner on public.your_table;
create policy your_table_insert_own_or_owner
on public.your_table
for insert
to authenticated
with check (
  user_id = auth.uid()
  or public.is_owner()
);

drop policy if exists your_table_update_own_or_owner on public.your_table;
create policy your_table_update_own_or_owner
on public.your_table
for update
to authenticated
using (
  user_id = auth.uid()
  or public.is_owner()
)
with check (
  user_id = auth.uid()
  or public.is_owner()
);

drop policy if exists your_table_delete_own_or_owner on public.your_table;
create policy your_table_delete_own_or_owner
on public.your_table
for delete
to authenticated
using (
  user_id = auth.uid()
  or public.is_owner()
);
