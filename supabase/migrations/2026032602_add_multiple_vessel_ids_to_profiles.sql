alter table public.profiles
add column if not exists commercial_fishing_vessel_ids text[] not null default '{}';
