alter table public.processed_batches
add column if not exists recipe_items jsonb,
add column if not exists nutrition_per_100g jsonb;

alter table public.processed_products
add column if not exists recipe_items jsonb,
add column if not exists nutrition_per_100g jsonb;
