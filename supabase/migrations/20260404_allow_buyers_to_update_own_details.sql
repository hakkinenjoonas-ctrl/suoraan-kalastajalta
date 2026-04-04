drop policy if exists buyers_update_own_details on public.buyers;

create policy buyers_update_own_details
on public.buyers
for update
to authenticated
using (
  lower(coalesce(email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
  or exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'owner'
      and coalesce(is_active, true) = true
  )
)
with check (
  lower(coalesce(email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
  or exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'owner'
      and coalesce(is_active, true) = true
  )
);
