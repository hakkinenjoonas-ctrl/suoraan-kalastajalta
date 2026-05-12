alter table public.profiles
add column if not exists fisher_premium_enabled boolean not null default false;
