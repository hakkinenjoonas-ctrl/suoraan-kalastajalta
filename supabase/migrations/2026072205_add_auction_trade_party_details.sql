-- Make auction-created trades contain the same buyer, delivery and seller details
-- as an accepted fixed-price trade.
create or replace function public.finalize_due_auctions()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auction public.auctions%rowtype;
  v_bid public.auction_bids%rowtype;
  v_buyer public.buyers%rowtype;
  v_seller public.profiles%rowtype;
  v_offer_id uuid;
  v_count integer := 0;
begin
  if auth.uid() is null then return 0; end if;
  for v_auction in
    select * from public.auctions where status = 'open' and effective_end_at <= clock_timestamp() order by effective_end_at for update skip locked
  loop
    if exists (
      select 1 from public.buyer_offers bo
      where bo.seller_user_id = v_auction.seller_user_id and bo.batch_id = v_auction.batch_id and bo.status = 'accepted'
    ) then
      update public.auctions set status = 'cancelled', finalized_at = clock_timestamp(), updated_at = clock_timestamp() where id = v_auction.id;
    elsif v_auction.highest_bid_id is null or (v_auction.reserve_price_per_kg is not null and v_auction.current_price_per_kg < v_auction.reserve_price_per_kg) then
      update public.auctions set status = 'unsold', finalized_at = clock_timestamp(), updated_at = clock_timestamp() where id = v_auction.id;
    else
      select * into v_bid from public.auction_bids where id = v_auction.highest_bid_id;
      select * into v_buyer from public.buyers where id = v_bid.buyer_id;
      select * into v_seller from public.profiles where id = v_auction.seller_user_id;

      insert into public.buyer_offers (
        batch_id, buyer_id, buyer_email, seller_user_id, seller_name, total_kilos, price_per_kg, sale_method,
        species_summary, area, spot, gear, delivery_possible, delivery_method, transport_mode,
        origin_point_id, transport_company_id, delivery_destinations, delivery_area, delivery_cost,
        delivery_destination_city, earliest_delivery_date, cold_transport, notes, status, reserved_kilos,
        fulfillment_status, billing_status, owner_commission_status,
        buyer_delivery_address, buyer_delivery_postcode, buyer_delivery_city,
        buyer_billing_address, buyer_billing_postcode, buyer_billing_city, buyer_billing_email, buyer_business_id,
        seller_business_id, seller_address, seller_postcode, seller_city, seller_contact_email, seller_email,
        seller_phone, seller_commercial_fishing_id, seller_bank_account_iban, seller_bank_bic
      ) values (
        v_auction.batch_id, v_buyer.id, lower(v_buyer.email), v_auction.seller_user_id,
        coalesce(v_seller.company_name, v_seller.display_name, v_seller.email), v_auction.total_kilos, v_auction.current_price_per_kg, 'auction',
        v_auction.species || ': ' || v_auction.total_kilos || ' kg · Erätunnus ' || coalesce(v_auction.batch_id, '-'),
        v_auction.area, v_auction.spot, v_auction.gear, v_auction.delivery_possible, coalesce(v_auction.delivery_method, 'Nouto'), v_auction.transport_mode,
        v_auction.origin_point_id, v_auction.transport_company_id,
        (select coalesce(array_agg(destination), '{}'::text[]) from jsonb_array_elements_text(v_auction.delivery_destinations) as destinations(destination)),
        v_auction.delivery_area, v_auction.delivery_cost,
        v_buyer.delivery_city, v_auction.earliest_delivery_date, v_auction.cold_transport, v_auction.notes, 'accepted', v_auction.total_kilos,
        'awaiting_contact', 'unbilled', 'unbilled',
        v_buyer.delivery_address, v_buyer.delivery_postcode, v_buyer.delivery_city,
        v_buyer.billing_address, v_buyer.billing_postcode, v_buyer.billing_city, v_buyer.billing_email, v_buyer.business_id,
        v_seller.business_id, v_seller.address, v_seller.postcode, v_seller.city,
        coalesce(v_seller.contact_email, v_seller.email), v_seller.email, v_seller.phone,
        v_seller.commercial_fishing_id, v_seller.bank_account_iban, v_seller.bank_bic
      ) returning id into v_offer_id;

      update public.auctions set status = 'sold', winning_buyer_id = v_buyer.id, resulting_buyer_offer_id = v_offer_id,
        finalized_at = clock_timestamp(), updated_at = clock_timestamp() where id = v_auction.id;
    end if;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- Backfill party snapshots for auction trades that were finalized before this migration.
update public.buyer_offers bo
set
  reserved_kilos = coalesce(bo.reserved_kilos, a.total_kilos),
  delivery_destination_city = coalesce(nullif(bo.delivery_destination_city, ''), b.delivery_city),
  buyer_delivery_address = coalesce(nullif(bo.buyer_delivery_address, ''), b.delivery_address),
  buyer_delivery_postcode = coalesce(nullif(bo.buyer_delivery_postcode, ''), b.delivery_postcode),
  buyer_delivery_city = coalesce(nullif(bo.buyer_delivery_city, ''), b.delivery_city),
  buyer_billing_address = coalesce(nullif(bo.buyer_billing_address, ''), b.billing_address),
  buyer_billing_postcode = coalesce(nullif(bo.buyer_billing_postcode, ''), b.billing_postcode),
  buyer_billing_city = coalesce(nullif(bo.buyer_billing_city, ''), b.billing_city),
  buyer_billing_email = coalesce(nullif(bo.buyer_billing_email, ''), b.billing_email),
  buyer_business_id = coalesce(nullif(bo.buyer_business_id, ''), b.business_id),
  seller_name = coalesce(nullif(bo.seller_name, ''), p.company_name, p.display_name, p.email),
  seller_business_id = coalesce(nullif(bo.seller_business_id, ''), p.business_id),
  seller_address = coalesce(nullif(bo.seller_address, ''), p.address),
  seller_postcode = coalesce(nullif(bo.seller_postcode, ''), p.postcode),
  seller_city = coalesce(nullif(bo.seller_city, ''), p.city),
  seller_contact_email = coalesce(nullif(bo.seller_contact_email, ''), p.contact_email, p.email),
  seller_email = coalesce(nullif(bo.seller_email, ''), p.email),
  seller_phone = coalesce(nullif(bo.seller_phone, ''), p.phone),
  seller_commercial_fishing_id = coalesce(nullif(bo.seller_commercial_fishing_id, ''), p.commercial_fishing_id),
  seller_bank_account_iban = coalesce(nullif(bo.seller_bank_account_iban, ''), p.bank_account_iban),
  seller_bank_bic = coalesce(nullif(bo.seller_bank_bic, ''), p.bank_bic)
from public.auctions a
join public.buyers b on b.id = a.winning_buyer_id
join public.profiles p on p.id = a.seller_user_id
where a.resulting_buyer_offer_id = bo.id
  and a.status = 'sold';
