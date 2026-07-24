-- Expose the existing auction delivery date and delivery cost to the auction UI.
create or replace function public.list_visible_auctions()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with me as (select public.current_auction_buyer_id() as buyer_id), visible as (
    select a.*,
      (select count(*)::integer from public.auction_bids b where b.auction_id = a.id) as bid_count,
      exists (select 1 from public.auction_bids b, me where b.id = a.highest_bid_id and b.buyer_id = me.buyer_id) as my_is_leading,
      (a.status = 'sold' and a.winning_buyer_id = (select buyer_id from me)) as my_is_winner,
      case when a.status = 'sold' and (a.seller_user_id = auth.uid() or public.is_owner()) then (
        select jsonb_build_object('company_name', b.company_name, 'contact_name', b.contact_name, 'email', b.email, 'phone', b.phone, 'business_id', b.business_id, 'delivery_address', b.delivery_address, 'delivery_postcode', b.delivery_postcode, 'delivery_city', b.delivery_city)
        from public.buyers b where b.id = a.winning_buyer_id
      ) else null end as winner_details,
      case when a.status = 'sold' and a.winning_buyer_id = (select buyer_id from me) then (
        select jsonb_build_object('company_name', p.company_name, 'display_name', p.display_name, 'business_id', p.business_id, 'address', p.address, 'postcode', p.postcode, 'city', p.city, 'contact_email', p.contact_email, 'email', p.email, 'phone', p.phone, 'commercial_fishing_id', p.commercial_fishing_id)
        from public.profiles p where p.id = a.seller_user_id
      ) else null end as seller_details
    from public.auctions a
    where public.is_owner() or a.seller_user_id = auth.uid()
       or (a.status in ('scheduled', 'open') and public.auction_buyer_is_eligible(a.id, (select buyer_id from me)))
       or exists (select 1 from public.auction_bids mine where mine.auction_id = a.id and mine.bidder_user_id = auth.uid())
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id, 'status', status, 'starts_at', starts_at, 'ends_at', ends_at, 'effective_end_at', effective_end_at,
    'starting_price_per_kg', starting_price_per_kg, 'current_price_per_kg', current_price_per_kg,
    'minimum_increment', minimum_increment, 'reserve_met', reserve_price_per_kg is null or current_price_per_kg >= reserve_price_per_kg,
    'species', species, 'total_kilos', total_kilos, 'total_quantity', total_quantity, 'quantity_unit', quantity_unit,
    'batch_id', batch_id, 'catch_date', catch_date, 'area', area, 'municipality', municipality, 'spot', spot, 'gear', gear,
    'notes', notes, 'image_path', image_path, 'bid_count', bid_count,
    'delivery_method', delivery_method, 'delivery_area', delivery_area, 'delivery_destinations', delivery_destinations,
    'earliest_delivery_date', earliest_delivery_date, 'delivery_cost', delivery_cost,
    'my_is_leading', my_is_leading, 'my_is_winner', my_is_winner, 'winner_details', winner_details, 'seller_details', seller_details,
    'resulting_buyer_offer_id', case when seller_user_id = auth.uid() or public.is_owner() or my_is_winner then resulting_buyer_offer_id else null end
  ) order by case when status = 'open' then 0 else 1 end, effective_end_at desc), '[]'::jsonb) from visible;
$$;
