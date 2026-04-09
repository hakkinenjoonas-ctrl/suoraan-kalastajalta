alter table public.allowed_users
drop constraint if exists allowed_users_email_key;

create index if not exists allowed_users_email_idx
on public.allowed_users (email);
