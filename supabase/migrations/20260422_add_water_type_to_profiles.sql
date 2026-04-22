alter table public.profiles
add column if not exists water_type text;

alter table public.profiles
drop constraint if exists profiles_water_type_check;

alter table public.profiles
add constraint profiles_water_type_check
check (water_type in ('makea', 'meri') or water_type is null);
