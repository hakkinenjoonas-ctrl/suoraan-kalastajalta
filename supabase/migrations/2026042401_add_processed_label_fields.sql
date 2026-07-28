alter table public.processed_batches
add column if not exists use_by_date date,
add column if not exists ingredients text,
add column if not exists allergens text,
add column if not exists storage_instructions text,
add column if not exists species_name_fi text,
add column if not exists species_name_scientific text,
add column if not exists gear_type text,
add column if not exists product_state text;
