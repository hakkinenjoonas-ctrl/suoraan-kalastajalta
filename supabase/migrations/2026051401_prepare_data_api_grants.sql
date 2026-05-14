-- Prepare explicit Data API grants before Supabase's October 30, 2026 rollout.
-- This keeps existing frontend access working for current and future tables in public.
-- Note: RLS policies still need to be added per table as part of normal migrations.

grant usage on schema public to anon, authenticated, service_role;

grant select
  on all tables in schema public
  to anon;

grant select, insert, update, delete
  on all tables in schema public
  to authenticated;

grant select, insert, update, delete
  on all tables in schema public
  to service_role;

grant usage, select
  on all sequences in schema public
  to anon, authenticated, service_role;

alter default privileges in schema public
grant select
  on tables
  to anon;

alter default privileges in schema public
grant select, insert, update, delete
  on tables
  to authenticated;

alter default privileges in schema public
grant select, insert, update, delete
  on tables
  to service_role;

alter default privileges in schema public
grant usage, select
  on sequences
  to anon, authenticated, service_role;
