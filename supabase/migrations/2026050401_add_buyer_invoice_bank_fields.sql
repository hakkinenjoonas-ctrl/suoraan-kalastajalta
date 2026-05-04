alter table public.buyer_offers
add column if not exists seller_bank_account_iban text,
add column if not exists seller_bank_bic text;
