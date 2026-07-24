-- Isolated catch-auction module. Existing catch, offer and billing tables are not altered.
create table if not exists public.auctions (
  id uuid primary key default gen_random_uuid(),
  catch_entry_id uuid references public.catch_entries(id) on delete set null,
  seller_user_id uuid not null references auth.users(id) on delete restrict,
  status text not null default 'open' check (status in ('scheduled', 'open', 'sold', 'unsold', 'cancelled')),
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  effective_end_at timestamptz not null,
  starting_price_per_kg numeric(12,2) not null check (starting_price_per_kg > 0),
  current_price_per_kg numeric(12,2) not null check (current_price_per_kg > 0),
  minimum_increment numeric(12,2) not null check (minimum_increment > 0),
  reserve_price_per_kg numeric(12,2),
  extension_minutes integer not null default 3 check (extension_minutes = 3),
  highest_bid_id uuid,
  winning_buyer_id uuid references public.buyers(id) on delete restrict,
  resulting_buyer_offer_id uuid references public.buyer_offers(id) on delete set null,
  finalized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  species text not null,
  total_kilos numeric(12,3) not null check (total_kilos > 0),
  batch_id text,
  catch_date date,
  area text,
  municipality text,
  spot text,
  gear text,
  delivery_possible boolean not null default false,
  delivery_method text,
  transport_mode text,
  origin_point_id text,
  transport_company_id text,
  delivery_destinations jsonb not null default '[]'::jsonb,
  delivery_area text,
  delivery_cost numeric,
  earliest_delivery_date date,
  cold_transport boolean not null default false,
  notes text,
  constraint auctions_reserve_not_below_start check (reserve_price_per_kg is null or reserve_price_per_kg >= starting_price_per_kg),
  constraint auctions_end_after_start check (ends_at > starts_at and effective_end_at >= ends_at)
);

create table if not exists public.auction_bids (
  id uuid primary key default gen_random_uuid(),
  auction_id uuid not null references public.auctions(id) on delete restrict,
  buyer_id uuid not null references public.buyers(id) on delete restrict,
  bidder_user_id uuid not null references auth.users(id) on delete restrict,
  amount_per_kg numeric(12,2) not null check (amount_per_kg > 0),
  request_id uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  unique (bidder_user_id, request_id)
);

alter table public.auctions
  drop constraint if exists auctions_highest_bid_id_fkey;
alter table public.auctions
  add constraint auctions_highest_bid_id_fkey
  foreign key (highest_bid_id) references public.auction_bids(id) on delete restrict;

create unique index if not exists auctions_one_live_per_catch_entry
on public.auctions (catch_entry_id)
where status in ('scheduled', 'open');

create index if not exists auctions_status_end_idx on public.auctions (status, effective_end_at);
create index if not exists auction_bids_auction_amount_idx on public.auction_bids (auction_id, amount_per_kg desc, created_at asc);

create or replace function public.cancel_live_auction_on_catch_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.auctions
  set status = 'cancelled', finalized_at = clock_timestamp(), updated_at = clock_timestamp()
  where catch_entry_id = old.id and status in ('scheduled', 'open');
  return old;
end;
$$;

drop trigger if exists cancel_live_auction_on_catch_delete on public.catch_entries;
create trigger cancel_live_auction_on_catch_delete
before delete on public.catch_entries
for each row execute function public.cancel_live_auction_on_catch_delete();

alter table public.auctions enable row level security;
alter table public.auction_bids enable row level security;

drop policy if exists auctions_select_authenticated on public.auctions;
create policy auctions_select_authenticated
on public.auctions for select to authenticated
using (
  public.is_owner()
  or seller_user_id = auth.uid()
  or status in ('scheduled', 'open', 'sold', 'unsold')
);

-- Bidder identities are intentionally unavailable through direct table access.
drop policy if exists auction_bids_select_own on public.auction_bids;
create policy auction_bids_select_own
on public.auction_bids for select to authenticated
using (bidder_user_id = auth.uid() or public.is_owner());

revoke insert, update, delete on public.auctions from authenticated;
revoke insert, update, delete on public.auction_bids from authenticated;

create or replace function public.current_auction_buyer_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select case when p.role = 'buyer' and coalesce(p.is_active, false) then
    coalesce(
      p.buyer_id,
      (select b.id from public.buyers b where coalesce(b.is_active, true) and lower(coalesce(b.email, '')) = lower(coalesce(auth.jwt() ->> 'email', '')) limit 1)
    )
  end
  from public.profiles p
  where p.id = auth.uid();
$$;

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
begin
  if auth.uid() is null then raise exception 'Kirjautuminen vaaditaan'; end if;
  if p_duration_minutes not in (30, 60, 180, 360, 720, 1440) then raise exception 'Virheellinen huutokaupan kesto'; end if;
  if p_starting_price is null or p_starting_price <= 0 then raise exception 'Virheellinen lähtöhinta'; end if;
  if p_minimum_increment is null or p_minimum_increment <= 0 then raise exception 'Virheellinen minimikorotus'; end if;
  if p_reserve_price is not null and p_reserve_price < p_starting_price then raise exception 'Pohjahinta ei voi alittaa lähtöhintaa'; end if;

  select * into v_entry from public.catch_entries where id = p_entry_id for update;
  if not found then raise exception 'Kalaerää ei löytynyt'; end if;
  if v_entry.owner_user_id <> auth.uid() and not public.is_owner() then raise exception 'Et voi huutokaupata tätä erää'; end if;
  if coalesce(v_entry.kilos, 0) <= 0 then raise exception 'Erän määrä puuttuu'; end if;
  if coalesce(trim(v_entry.batch_id), '') = '' then raise exception 'Erältä puuttuu jäljitettävyystunnus'; end if;
  if exists (
    select 1 from public.buyer_offers bo
    where bo.seller_user_id = v_entry.owner_user_id and bo.batch_id = v_entry.batch_id and bo.status = 'accepted'
  ) then raise exception 'Erä on jo myyty'; end if;

  insert into public.auctions (
    catch_entry_id, seller_user_id, starts_at, ends_at, effective_end_at,
    starting_price_per_kg, current_price_per_kg, minimum_increment, reserve_price_per_kg,
    species, total_kilos, batch_id, catch_date, area, municipality, spot, gear,
    delivery_possible, delivery_method, transport_mode, origin_point_id, transport_company_id,
    delivery_destinations, delivery_area, delivery_cost, earliest_delivery_date, cold_transport, notes
  ) values (
    v_entry.id, v_entry.owner_user_id, v_now, v_now + make_interval(mins => p_duration_minutes), v_now + make_interval(mins => p_duration_minutes),
    round(p_starting_price, 2), round(p_starting_price, 2), round(p_minimum_increment, 2), case when p_reserve_price is null then null else round(p_reserve_price, 2) end,
    v_entry.species, v_entry.kilos, v_entry.batch_id, v_entry.date, v_entry.area, v_entry.municipality, v_entry.spot, v_entry.gear,
    coalesce(v_entry.delivery_possible, false), v_entry.delivery_method, v_entry.transport_mode, v_entry.origin_point_id, v_entry.transport_company_id,
    coalesce(to_jsonb(v_entry.delivery_destinations), '[]'::jsonb), v_entry.delivery_area, v_entry.delivery_cost, v_entry.earliest_delivery_date, coalesce(v_entry.cold_transport, false), v_entry.notes
  ) returning id into v_auction_id;

  return v_auction_id;
end;
$$;

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
  ) then
    update public.auctions set status = 'cancelled', finalized_at = v_now, updated_at = v_now where id = v_auction.id;
    raise exception 'Erä on jo myyty toisessa kaupassa';
  end if;

  v_buyer_id := public.current_auction_buyer_id();
  if v_buyer_id is null then raise exception 'Käyttäjää ei ole liitetty hyväksyttyyn ostajayritykseen'; end if;
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
       or a.status in ('scheduled', 'open')
       or exists (select 1 from public.auction_bids mine where mine.auction_id = a.id and mine.bidder_user_id = auth.uid())
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id, 'status', status, 'starts_at', starts_at, 'ends_at', ends_at, 'effective_end_at', effective_end_at,
    'starting_price_per_kg', starting_price_per_kg, 'current_price_per_kg', current_price_per_kg,
    'minimum_increment', minimum_increment, 'reserve_met', reserve_price_per_kg is null or current_price_per_kg >= reserve_price_per_kg,
    'species', species, 'total_kilos', total_kilos, 'batch_id', batch_id, 'catch_date', catch_date,
    'area', area, 'municipality', municipality, 'spot', spot, 'gear', gear, 'bid_count', bid_count,
    'my_is_leading', my_is_leading, 'my_is_winner', my_is_winner,
    'resulting_buyer_offer_id', case when seller_user_id = auth.uid() or public.is_owner() or my_is_winner then resulting_buyer_offer_id else null end
  ) order by case when status = 'open' then 0 else 1 end, effective_end_at desc), '[]'::jsonb) from visible;
$$;

revoke all on function public.create_catch_auction(uuid, integer, numeric, numeric, numeric) from public;
revoke all on function public.place_auction_bid(uuid, numeric, uuid) from public;
revoke all on function public.finalize_due_auctions() from public;
revoke all on function public.list_visible_auctions() from public;
grant execute on function public.create_catch_auction(uuid, integer, numeric, numeric, numeric) to authenticated;
grant execute on function public.place_auction_bid(uuid, numeric, uuid) to authenticated;
grant execute on function public.finalize_due_auctions() to authenticated;
grant execute on function public.list_visible_auctions() to authenticated;
