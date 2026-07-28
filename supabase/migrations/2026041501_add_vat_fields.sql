alter table if exists public.profiles
add column if not exists vat_liable boolean not null default false,
add column if not exists vat_number text;

alter table if exists public.buyers
add column if not exists vat_liable boolean not null default false,
add column if not exists vat_number text;
