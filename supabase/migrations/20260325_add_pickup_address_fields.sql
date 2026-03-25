alter table public.profiles
add column if not exists pickup_address text;

alter table public.catch_entries
add column if not exists pickup_address text;
