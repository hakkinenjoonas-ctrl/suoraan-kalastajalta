alter table public.processed_batches
add column if not exists origin_city text,
add column if not exists delivery_possible boolean not null default false,
add column if not exists transport_mode text,
add column if not exists origin_point_id text,
add column if not exists transport_company_id text,
add column if not exists pickup_address text,
add column if not exists delivery_destinations text[] not null default '{}';

create index if not exists processed_batches_origin_point_id_idx
on public.processed_batches (origin_point_id);
