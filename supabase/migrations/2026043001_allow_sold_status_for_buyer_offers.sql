alter table public.buyer_offers
drop constraint if exists buyer_offers_status_check;

alter table public.buyer_offers
add constraint buyer_offers_status_check
check (
  status in (
    'sent',
    'viewed',
    'countered',
    'reserved',
    'accepted',
    'sold',
    'rejected',
    'expired',
    'cancelled'
  )
);
