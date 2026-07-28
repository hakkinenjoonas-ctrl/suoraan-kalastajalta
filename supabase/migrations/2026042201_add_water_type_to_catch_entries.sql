alter table public.catch_entries
add column if not exists water_type text;

alter table public.catch_entries
drop constraint if exists catch_entries_water_type_check;

alter table public.catch_entries
add constraint catch_entries_water_type_check
check (water_type in ('makea', 'meri') or water_type is null);
