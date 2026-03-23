alter table public.catch_entries
add column if not exists origin_city text,
add column if not exists delivery_possible boolean not null default false,
add column if not exists transport_mode text,
add column if not exists origin_point_id text,
add column if not exists transport_company_id text,
add column if not exists delivery_destinations text[] not null default '{}';

alter table public.buyer_offers
add column if not exists seller_origin_city text,
add column if not exists delivery_possible boolean not null default false,
add column if not exists transport_mode text,
add column if not exists origin_point_id text,
add column if not exists transport_company_id text,
add column if not exists delivery_destination_city text,
add column if not exists delivery_destinations text[] not null default '{}',
add column if not exists route_price_eur numeric,
add column if not exists total_price_eur numeric,
add column if not exists delivered_price_per_kg numeric;

create table if not exists public.pickup_points (
  id text primary key,
  name text not null,
  type text not null check (type in ('terminal', 'collection_point')),
  city text not null,
  address text not null,
  active boolean not null default true,
  latest_dropoff_time text
);

create table if not exists public.transport_companies (
  id text primary key,
  name text not null,
  active boolean not null default true
);

create table if not exists public.route_prices (
  id uuid primary key default gen_random_uuid(),
  origin_point_id text not null references public.pickup_points(id) on delete cascade,
  destination_city text not null,
  carrier_id text references public.transport_companies(id) on delete set null,
  price_eur numeric not null,
  min_kg numeric,
  max_kg numeric,
  active boolean not null default true,
  cutoff_time text
);

create unique index if not exists route_prices_unique_active_idx
on public.route_prices (origin_point_id, destination_city, coalesce(carrier_id, ''));

create index if not exists buyer_offers_delivery_destination_city_idx
on public.buyer_offers (delivery_destination_city);

create index if not exists buyer_offers_origin_point_id_idx
on public.buyer_offers (origin_point_id);

create index if not exists catch_entries_origin_point_id_idx
on public.catch_entries (origin_point_id);
