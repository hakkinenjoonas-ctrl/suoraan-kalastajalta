-- Limit delivered auctions to buyers whose registered delivery city is selected by the seller.
create or replace function public.auction_buyer_is_eligible(p_auction_id uuid, p_buyer_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with auction_data as (
    select a.delivery_method, a.delivery_destinations, a.delivery_area
    from public.auctions a
    where a.id = p_auction_id
  ), buyer_data as (
    select lower(trim(coalesce(b.delivery_city, ''))) as city
    from public.buyers b
    where b.id = p_buyer_id and coalesce(b.is_active, true)
  ), selected_cities as (
    select lower(trim(value)) as city
    from auction_data a,
      lateral jsonb_array_elements_text(
        case when jsonb_typeof(coalesce(a.delivery_destinations, '[]'::jsonb)) = 'array'
          then coalesce(a.delivery_destinations, '[]'::jsonb)
          else '[]'::jsonb
        end
      ) values_from_json(value)
    union
    select lower(trim(value)) as city
    from auction_data a,
      lateral unnest(string_to_array(coalesce(a.delivery_area, ''), ',')) values_from_area(value)
    where trim(value) <> ''
  )
  select coalesce((
    select
      exists (select 1 from buyer_data)
      and (
        lower(trim(coalesce(a.delivery_method, ''))) = 'nouto'
        or not exists (select 1 from selected_cities)
        or exists (
          select 1 from buyer_data b
          where b.city <> '' and b.city in (select city from selected_cities)
        )
      )
    from auction_data a
  ), false);
$$;

drop policy if exists auctions_select_authenticated on public.auctions;
create policy auctions_select_authenticated
on public.auctions for select to authenticated
using (
  public.is_owner()
  or seller_user_id = auth.uid()
  or (
    status in ('scheduled', 'open')
    and public.auction_buyer_is_eligible(id, public.current_auction_buyer_id())
  )
);

create or replace function public.place_auction_bid(p_auction_id uuid, p_amount_per_kg numeric, p_request_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auction public.auctions%rowtype;
  v_buyer_id uuid;
  v_bid_id uuid;
  v_now timestamptz := clock_timestamp();
begin
  if auth.uid() is null then raise exception 'Kirjautuminen vaaditaan'; end if;
  if p_request_id is null then raise exception 'Pyynnön tunniste puuttuu'; end if;

  select id into v_bid_id from public.auction_bids where bidder_user_id = auth.uid() and request_id = p_request_id;
  if found then return v_bid_id; end if;

  select * into v_auction from public.auctions where id = p_auction_id for update;
  if not found then raise exception 'Huutokauppaa ei löytynyt'; end if;
  if v_auction.status <> 'open' or v_now < v_auction.starts_at or v_now >= v_auction.effective_end_at then raise exception 'Huutokauppa ei ole käynnissä'; end if;
  if v_auction.seller_user_id = auth.uid() then raise exception 'Myyjä ei voi huutaa omaa eräänsä'; end if;
  if exists (
    select 1 from public.buyer_offers bo
    where bo.seller_user_id = v_auction.seller_user_id and bo.batch_id = v_auction.batch_id and bo.status = 'accepted'
  ) then raise exception 'Erä on jo myyty toisessa kaupassa'; end if;

  v_buyer_id := public.current_auction_buyer_id();
  if v_buyer_id is null then raise exception 'Käyttäjää ei ole liitetty hyväksyttyyn ostajayritykseen'; end if;
  if not public.auction_buyer_is_eligible(p_auction_id, v_buyer_id) then
    raise exception 'Huutokauppa ei ole saatavilla ostajan toimituskaupunkiin';
  end if;
  if exists (select 1 from public.auction_bids where id = v_auction.highest_bid_id and buyer_id = v_buyer_id) then raise exception 'Olet jo korkeimman huudon tekijä'; end if;
  if p_amount_per_kg is null or round(p_amount_per_kg, 2) < v_auction.current_price_per_kg + v_auction.minimum_increment then raise exception 'Huuto alittaa sallitun minimihinnan'; end if;

  insert into public.auction_bids (auction_id, buyer_id, bidder_user_id, amount_per_kg, request_id)
  values (p_auction_id, v_buyer_id, auth.uid(), round(p_amount_per_kg, 2), p_request_id)
  returning id into v_bid_id;

  update public.auctions set
    current_price_per_kg = round(p_amount_per_kg, 2),
    highest_bid_id = v_bid_id,
    effective_end_at = case when effective_end_at - v_now <= interval '3 minutes' then v_now + interval '3 minutes' else effective_end_at end,
    updated_at = v_now
  where id = p_auction_id;

  return v_bid_id;
end;
$$;

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
      (a.status = 'sold' and a.winning_buyer_id = (select buyer_id from me)) as my_is_winner
    from public.auctions a
    where public.is_owner() or a.seller_user_id = auth.uid()
       or (
         a.status in ('scheduled', 'open')
         and public.auction_buyer_is_eligible(a.id, (select buyer_id from me))
       )
       or exists (select 1 from public.auction_bids mine where mine.auction_id = a.id and mine.bidder_user_id = auth.uid())
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id, 'status', status, 'starts_at', starts_at, 'ends_at', ends_at, 'effective_end_at', effective_end_at,
    'starting_price_per_kg', starting_price_per_kg, 'current_price_per_kg', current_price_per_kg,
    'minimum_increment', minimum_increment, 'reserve_met', reserve_price_per_kg is null or current_price_per_kg >= reserve_price_per_kg,
    'species', species, 'total_kilos', total_kilos, 'batch_id', batch_id, 'catch_date', catch_date,
    'area', area, 'municipality', municipality, 'spot', spot, 'gear', gear, 'bid_count', bid_count,
    'delivery_method', delivery_method, 'delivery_area', delivery_area, 'delivery_destinations', delivery_destinations,
    'my_is_leading', my_is_leading, 'my_is_winner', my_is_winner,
    'resulting_buyer_offer_id', case when seller_user_id = auth.uid() or public.is_owner() or my_is_winner then resulting_buyer_offer_id else null end
  ) order by case when status = 'open' then 0 else 1 end, effective_end_at desc), '[]'::jsonb) from visible;
$$;

revoke all on function public.auction_buyer_is_eligible(uuid, uuid) from public;
grant execute on function public.auction_buyer_is_eligible(uuid, uuid) to authenticated;
