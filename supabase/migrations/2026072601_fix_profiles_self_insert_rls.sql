alter table if exists public.profiles enable row level security;

drop policy if exists profiles_insert_own_or_owner on public.profiles;

create policy profiles_insert_own_or_owner
on public.profiles
for insert
to authenticated
with check (
  id = auth.uid()
  or public.is_owner()
);

grant select, insert, update on table public.profiles to authenticated;
