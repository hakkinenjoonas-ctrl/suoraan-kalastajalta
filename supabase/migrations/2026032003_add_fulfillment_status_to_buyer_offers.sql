alter table public.buyer_offers
add column if not exists fulfillment_status text;
