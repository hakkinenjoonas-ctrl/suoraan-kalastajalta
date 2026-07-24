-- Auction quantities can be kilograms or pieces. Existing fish auctions stay in kilograms.
alter table public.auctions add column if not exists quantity_unit text not null default 'kg';
alter table public.auctions add column if not exists total_quantity numeric(12,3);

update public.auctions
set quantity_unit = 'kg', total_quantity = total_kilos
where total_quantity is null;

alter table public.auctions alter column total_quantity set not null;
alter table public.auctions drop constraint if exists auctions_quantity_unit_check;
alter table public.auctions add constraint auctions_quantity_unit_check check (quantity_unit in ('kg', 'kpl'));
alter table public.auctions drop constraint if exists auctions_total_quantity_check;
alter table public.auctions add constraint auctions_total_quantity_check check (total_quantity > 0);
alter table public.auctions drop constraint if exists auctions_total_kilos_check;
alter table public.auctions add constraint auctions_total_kilos_check check (total_kilos >= 0);

create or replace function public.create_catch_auction(
  p_entry_id uuid,
  p_duration_minutes integer,
  p_starting_price numeric,
  p_minimum_increment numeric,
  p_reserve_price numeric default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry public.catch_entries%rowtype;
  v_auction_id uuid;
  v_now timestamptz := clock_timestamp();
  v_is_crayfish boolean;
  v_quantity numeric;
  v_unit text;
  v_increment numeric;
begin
  if auth.uid() is null then raise exception 'Kirjautuminen vaaditaan'; end if;
  if p_duration_minutes not in (30, 60, 180, 360, 720, 1440) then raise exception 'Virheellinen huutokaupan kesto'; end if;
  if p_starting_price is null or p_starting_price <= 0 then raise exception 'Virheellinen lähtöhinta'; end if;

  select * into v_entry from public.catch_entries where id = p_entry_id for update;
  if not found then raise exception 'Kalaerää ei löytynyt'; end if;
  if v_entry.owner_user_id <> auth.uid() and not public.is_owner() then raise exception 'Et voi huutokaupata tätä erää'; end if;

  v_is_crayfish := lower(coalesce(v_entry.species, '')) like '%täplärapu%'
    or lower(coalesce(v_entry.species, '')) like '%jokirapu%'
    or lower(coalesce(v_entry.species, '')) like '%pacifastacus leniusculus%'
    or lower(coalesce(v_entry.species, '')) like '%astacus astacus%';
  v_unit := case when v_is_crayfish then 'kpl' else 'kg' end;
  v_quantity := case when v_is_crayfish then coalesce(v_entry.count, 0) else coalesce(v_entry.kilos, 0) end;
  v_increment := case when v_is_crayfish then 0.05 else p_minimum_increment end;

  if v_quantity <= 0 then raise exception 'Erän määrä puuttuu'; end if;
  if v_increment is null or v_increment <= 0 then raise exception 'Virheellinen minimikorotus'; end if;
  if p_reserve_price is not null and p_reserve_price < p_starting_price then raise exception 'Pohjahinta ei voi alittaa lähtöhintaa'; end if;
  if coalesce(trim(v_entry.batch_id), '') = '' then raise exception 'Erältä puuttuu jäljitettävyystunnus'; end if;
  if exists (
    select 1 from public.buyer_offers bo
    where bo.seller_user_id = v_entry.owner_user_id and bo.batch_id = v_entry.batch_id and bo.status = 'accepted'
  ) then raise exception 'Erä on jo myyty'; end if;

  insert into public.auctions (
    catch_entry_id, seller_user_id, starts_at, ends_at, effective_end_at,
    starting_price_per_kg, current_price_per_kg, minimum_increment, reserve_price_per_kg,
    species, total_kilos, total_quantity, quantity_unit, batch_id, catch_date, area, municipality, spot, gear,
    delivery_possible, delivery_method, transport_mode, origin_point_id, transport_company_id,
    delivery_destinations, delivery_area, delivery_cost, earliest_delivery_date, cold_transport, notes
  ) values (
    v_entry.id, v_entry.owner_user_id, v_now, v_now + make_interval(mins => p_duration_minutes), v_now + make_interval(mins => p_duration_minutes),
    round(p_starting_price, 2), round(p_starting_price, 2), round(v_increment, 2), case when p_reserve_price is null then null else round(p_reserve_price, 2) end,
    v_entry.species, coalesce(v_entry.kilos, 0), v_quantity, v_unit, v_entry.batch_id, v_entry.date, v_entry.area, v_entry.municipality, v_entry.spot, v_entry.gear,
    coalesce(v_entry.delivery_possible, false), v_entry.delivery_method, v_entry.transport_mode, v_entry.origin_point_id, v_entry.transport_company_id,
    coalesce(to_jsonb(v_entry.delivery_destinations), '[]'::jsonb), v_entry.delivery_area, v_entry.delivery_cost, v_entry.earliest_delivery_date, coalesce(v_entry.cold_transport, false), v_entry.notes
  ) returning id into v_auction_id;

  return v_auction_id;
end;
$$;

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
  v_summary text;
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
      v_summary := case when v_auction.quantity_unit = 'kpl'
        then v_auction.species || ': ' || v_auction.total_kilos || ' kg (' || v_auction.total_quantity || ' kpl)'
        else v_auction.species || ': ' || v_auction.total_quantity || ' kg'
      end || ' · Hinta ALV 0 % ' || v_auction.current_price_per_kg || ' € / ' || v_auction.quantity_unit
        || ' · Erätunnus ' || coalesce(v_auction.batch_id, '-');

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
        v_summary, v_auction.area, v_auction.spot, v_auction.gear, v_auction.delivery_possible, coalesce(v_auction.delivery_method, 'Nouto'), v_auction.transport_mode,
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
    'my_is_leading', my_is_leading, 'my_is_winner', my_is_winner, 'winner_details', winner_details, 'seller_details', seller_details,
    'resulting_buyer_offer_id', case when seller_user_id = auth.uid() or public.is_owner() or my_is_winner then resulting_buyer_offer_id else null end
  ) order by case when status = 'open' then 0 else 1 end, effective_end_at desc), '[]'::jsonb) from visible;
$$;
