-- Keep separate roles for the same email, but allow only one row for an exact
-- email + role + buyer combination. NULLS NOT DISTINCT also protects the
-- non-buyer roles, whose buyer_id is null.

update public.allowed_users
set email = lower(btrim(email))
where email is distinct from lower(btrim(email));

with ranked_allowed_users as (
  select
    id,
    row_number() over (
      partition by email, role, buyer_id
      order by is_active desc, created_at asc nulls last, id asc
    ) as duplicate_rank
  from public.allowed_users
)
delete from public.allowed_users as allowed_user
using ranked_allowed_users as ranked
where allowed_user.id = ranked.id
  and ranked.duplicate_rank > 1;

alter table public.allowed_users
  drop constraint if exists allowed_users_email_role_buyer_key;

alter table public.allowed_users
  add constraint allowed_users_email_role_buyer_key
  unique nulls not distinct (email, role, buyer_id);
