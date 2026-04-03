alter table public.profiles
add column if not exists bank_account_iban text,
add column if not exists bank_bic text;
