alter table public.buyer_offers
add column if not exists owner_commission_status text default 'unbilled',
add column if not exists owner_commission_billed_at timestamptz,
add column if not exists owner_commission_paid_at timestamptz,
add column if not exists owner_commission_month text,
add column if not exists owner_commission_rate numeric,
add column if not exists owner_trade_value numeric,
add column if not exists owner_commission_amount numeric;

alter table public.buyer_offers
drop constraint if exists buyer_offers_owner_commission_status_check;

alter table public.buyer_offers
add constraint buyer_offers_owner_commission_status_check
check (owner_commission_status in ('unbilled', 'invoiced', 'paid'));

update public.buyer_offers
set
  owner_commission_status = case
    when billing_status in ('invoiced', 'paid') then billing_status
    else coalesce(owner_commission_status, 'unbilled')
  end,
  owner_commission_billed_at = coalesce(owner_commission_billed_at, billed_at),
  owner_commission_paid_at = coalesce(owner_commission_paid_at, paid_at),
  owner_commission_month = coalesce(owner_commission_month, billing_month),
  owner_commission_rate = coalesce(owner_commission_rate, commission_rate),
  owner_trade_value = coalesce(owner_trade_value, trade_value),
  owner_commission_amount = coalesce(owner_commission_amount, commission_amount);
