alter table public.profiles
add column if not exists company_name text,
add column if not exists business_id text,
add column if not exists address text,
add column if not exists postcode text,
add column if not exists city text,
add column if not exists billing_address text,
add column if not exists billing_postcode text,
add column if not exists billing_city text,
add column if not exists billing_email text,
add column if not exists einvoice_address text,
add column if not exists contact_email text,
add column if not exists phone text;
