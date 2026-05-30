alter table public.processed_batches
add column if not exists storage_temperature text;

alter table public.processed_products
add column if not exists storage_temperature text;
