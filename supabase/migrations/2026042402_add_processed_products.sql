create table if not exists public.processed_products (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.profiles(id) on delete cascade,
  template_name text not null,
  area text,
  municipality text,
  origin_city text,
  spot text,
  product_name text,
  product_type text,
  processing_method text,
  product_state text,
  species_name_fi text,
  species_name_scientific text,
  gear_type text,
  species_summary text,
  ingredients text,
  allergens text,
  storage_instructions text,
  package_size_g numeric,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists processed_products_owner_user_id_idx
on public.processed_products (owner_user_id);
