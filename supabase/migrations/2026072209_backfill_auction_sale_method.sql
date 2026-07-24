-- Reclassify every trade linked to an auction. This also fixes auction trades
-- finalized after the original sale_method backfill but before the finalizer fix.
update public.buyer_offers bo
set sale_method = 'auction'
from public.auctions a
where a.resulting_buyer_offer_id = bo.id
  and bo.sale_method is distinct from 'auction';
