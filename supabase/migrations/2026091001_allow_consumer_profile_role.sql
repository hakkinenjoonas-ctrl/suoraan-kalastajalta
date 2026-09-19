-- Consumer accounts use the same profiles table as the business-side roles.
-- The production database still has the original (misspelled) role constraint,
-- which predates the consumer marketplace.
alter table public.profiles
  drop constraint if exists profile_roel_check;

alter table public.profiles
  drop constraint if exists profile_role_check;

alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('owner', 'member', 'buyer', 'processor', 'consumer'));
