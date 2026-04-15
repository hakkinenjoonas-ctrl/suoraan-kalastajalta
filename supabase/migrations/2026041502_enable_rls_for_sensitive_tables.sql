create or replace function public.current_user_email()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select lower(trim(coalesce(auth.jwt() ->> 'email', '')));
$$;

create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'owner'
      and coalesce(is_active, true) = true
  );
$$;

alter table if exists public.profiles enable row level security;
alter table if exists public.allowed_users enable row level security;
alter table if exists public.catch_entries enable row level security;
alter table if exists public.billing_invoices enable row level security;

drop policy if exists profiles_select_own_or_owner on public.profiles;
create policy profiles_select_own_or_owner
on public.profiles
for select
to authenticated
using (
  id = auth.uid()
  or public.is_owner()
);

drop policy if exists profiles_insert_own_or_owner on public.profiles;
create policy profiles_insert_own_or_owner
on public.profiles
for insert
to authenticated
with check (
  (
    id = auth.uid()
    and lower(coalesce(email, '')) = public.current_user_email()
  )
  or public.is_owner()
);

drop policy if exists profiles_update_own_or_owner on public.profiles;
create policy profiles_update_own_or_owner
on public.profiles
for update
to authenticated
using (
  id = auth.uid()
  or public.is_owner()
)
with check (
  id = auth.uid()
  or public.is_owner()
);

drop policy if exists allowed_users_select_own_or_owner on public.allowed_users;
create policy allowed_users_select_own_or_owner
on public.allowed_users
for select
to authenticated
using (
  lower(coalesce(email, '')) = public.current_user_email()
  or public.is_owner()
);

drop policy if exists allowed_users_insert_owner_only on public.allowed_users;
create policy allowed_users_insert_owner_only
on public.allowed_users
for insert
to authenticated
with check (public.is_owner());

drop policy if exists allowed_users_update_owner_only on public.allowed_users;
create policy allowed_users_update_owner_only
on public.allowed_users
for update
to authenticated
using (public.is_owner())
with check (public.is_owner());

drop policy if exists allowed_users_delete_owner_only on public.allowed_users;
create policy allowed_users_delete_owner_only
on public.allowed_users
for delete
to authenticated
using (public.is_owner());

drop policy if exists catch_entries_select_own_or_owner on public.catch_entries;
create policy catch_entries_select_own_or_owner
on public.catch_entries
for select
to authenticated
using (
  owner_user_id = auth.uid()
  or public.is_owner()
);

drop policy if exists catch_entries_insert_own_or_owner on public.catch_entries;
create policy catch_entries_insert_own_or_owner
on public.catch_entries
for insert
to authenticated
with check (
  owner_user_id = auth.uid()
  or public.is_owner()
);

drop policy if exists catch_entries_update_own_or_owner on public.catch_entries;
create policy catch_entries_update_own_or_owner
on public.catch_entries
for update
to authenticated
using (
  owner_user_id = auth.uid()
  or public.is_owner()
)
with check (
  owner_user_id = auth.uid()
  or public.is_owner()
);

drop policy if exists catch_entries_delete_own_or_owner on public.catch_entries;
create policy catch_entries_delete_own_or_owner
on public.catch_entries
for delete
to authenticated
using (
  owner_user_id = auth.uid()
  or public.is_owner()
);

drop policy if exists billing_invoices_select_owner_only on public.billing_invoices;
create policy billing_invoices_select_owner_only
on public.billing_invoices
for select
to authenticated
using (public.is_owner());

drop policy if exists billing_invoices_insert_owner_only on public.billing_invoices;
create policy billing_invoices_insert_owner_only
on public.billing_invoices
for insert
to authenticated
with check (public.is_owner());

drop policy if exists billing_invoices_update_owner_only on public.billing_invoices;
create policy billing_invoices_update_owner_only
on public.billing_invoices
for update
to authenticated
using (public.is_owner())
with check (public.is_owner());

drop policy if exists billing_invoices_delete_owner_only on public.billing_invoices;
create policy billing_invoices_delete_owner_only
on public.billing_invoices
for delete
to authenticated
using (public.is_owner());
