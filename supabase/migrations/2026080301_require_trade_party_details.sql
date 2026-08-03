-- Require complete seller contact details before publishing a catch lot and
-- complete buyer delivery/billing details before a binding purchase.

create or replace function public.missing_seller_sale_fields(p_seller_user_id uuid)
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select array_remove(array[
    case when nullif(trim(p.company_name), '') is null then 'yrityksen nimi' end,
    case when nullif(trim(p.business_id), '') is null then 'Y-tunnus' end,
    case when nullif(trim(p.display_name), '') is null then 'yhteyshenkilön nimi' end,
    case when nullif(trim(p.phone), '') is null then 'puhelinnumero' end,
    case when nullif(trim(coalesce(p.contact_email, p.email)), '') is null then 'yhteyssähköposti' end,
    case when nullif(trim(p.address), '') is null then 'katuosoite' end,
    case when nullif(trim(p.postcode), '') is null then 'postinumero' end,
    case when nullif(trim(p.city), '') is null then 'postitoimipaikka' end,
    case when nullif(trim(p.commercial_fishing_id), '') is null then 'kaupallisen kalastajan tunnus' end
  ], null)
  from public.profiles p
  where p.id = p_seller_user_id;
$$;

create or replace function public.missing_buyer_purchase_fields(p_buyer_id uuid)
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select array_remove(array[
    case when nullif(trim(b.company_name), '') is null then 'yrityksen nimi' end,
    case when nullif(trim(b.business_id), '') is null then 'Y-tunnus' end,
    case when nullif(trim(b.contact_name), '') is null then 'yhteyshenkilön nimi' end,
    case when nullif(trim(b.email), '') is null then 'yhteyssähköposti' end,
    case when nullif(trim(b.phone), '') is null then 'puhelinnumero' end,
    case when nullif(trim(b.delivery_address), '') is null then 'toimitusosoite' end,
    case when nullif(trim(b.delivery_postcode), '') is null then 'toimituksen postinumero' end,
    case when nullif(trim(b.delivery_city), '') is null then 'toimituskaupunki' end,
    case when nullif(trim(b.billing_address), '') is null then 'laskutusosoite' end,
    case when nullif(trim(b.billing_postcode), '') is null then 'laskutuksen postinumero' end,
    case when nullif(trim(b.billing_city), '') is null then 'laskutuskaupunki' end,
    case when nullif(trim(b.billing_email), '') is null then 'laskutussähköposti' end
  ], null)
  from public.buyers b
  where b.id = p_buyer_id;
$$;

create or replace function public.require_seller_details_for_catch_sale()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_missing text[];
begin
  if coalesce(new.offer_to_shops, false)
    or coalesce(new.offer_to_restaurants, false)
    or coalesce(new.offer_to_wholesalers, false)
    or coalesce(new.offer_restricted, false) then
    v_missing := public.missing_seller_sale_fields(new.owner_user_id);
    if v_missing is null then
      raise exception 'Kalastajan profiilia ei löytynyt';
    end if;
    if cardinality(v_missing) > 0 then
      raise exception 'Täytä omat tiedot ennen kuin voit asettaa kalaerän myyntiin. Puuttuu: %', array_to_string(v_missing, ', ');
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists require_seller_details_for_catch_sale on public.catch_entries;
create trigger require_seller_details_for_catch_sale
before insert or update on public.catch_entries
for each row execute function public.require_seller_details_for_catch_sale();

create or replace function public.require_seller_details_for_auction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_missing text[];
begin
  v_missing := public.missing_seller_sale_fields(new.seller_user_id);
  if v_missing is null then
    raise exception 'Kalastajan profiilia ei löytynyt';
  end if;
  if cardinality(v_missing) > 0 then
    raise exception 'Täytä omat tiedot ennen kuin voit avata huutokaupan. Puuttuu: %', array_to_string(v_missing, ', ');
  end if;
  return new;
end;
$$;

drop trigger if exists require_seller_details_for_auction on public.auctions;
create trigger require_seller_details_for_auction
before insert on public.auctions
for each row execute function public.require_seller_details_for_auction();

create or replace function public.require_buyer_details_for_auction_bid()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_missing text[];
begin
  v_missing := public.missing_buyer_purchase_fields(new.buyer_id);
  if v_missing is null then
    raise exception 'Ostajayrityksen tietoja ei löytynyt';
  end if;
  if cardinality(v_missing) > 0 then
    raise exception 'Täytä omat tiedot ennen kuin voit tehdä sitovan huudon. Puuttuu: %', array_to_string(v_missing, ', ');
  end if;
  return new;
end;
$$;

drop trigger if exists require_buyer_details_for_auction_bid on public.auction_bids;
create trigger require_buyer_details_for_auction_bid
before insert on public.auction_bids
for each row execute function public.require_buyer_details_for_auction_bid();

create or replace function public.require_trade_party_details_for_purchase()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_buyer_id uuid;
  v_missing_seller text[];
  v_missing_buyer text[];
begin
  if new.status not in ('reserved', 'accepted') then
    return new;
  end if;
  if tg_op = 'UPDATE' then
    if old.status = new.status then
      return new;
    end if;
  end if;

  v_missing_seller := public.missing_seller_sale_fields(new.seller_user_id);
  if v_missing_seller is null then
    raise exception 'Kalastajan profiilia ei löytynyt';
  end if;
  if cardinality(v_missing_seller) > 0 then
    raise exception 'Kauppaa ei voi tehdä ennen kuin kalastajan myyntitiedot on tallennettu. Puuttuu: %', array_to_string(v_missing_seller, ', ');
  end if;

  v_buyer_id := new.buyer_id;
  if v_buyer_id is null and nullif(trim(new.buyer_email), '') is not null then
    select b.id into v_buyer_id
    from public.buyers b
    where lower(b.email) = lower(new.buyer_email)
    limit 1;
  end if;

  v_missing_buyer := public.missing_buyer_purchase_fields(v_buyer_id);
  if v_missing_buyer is null then
    raise exception 'Ostajayrityksen tietoja ei löytynyt';
  end if;
  if cardinality(v_missing_buyer) > 0 then
    raise exception 'Täytä ostajan toimitus- ja laskutustiedot ennen kauppaa. Puuttuu: %', array_to_string(v_missing_buyer, ', ');
  end if;

  return new;
end;
$$;

drop trigger if exists require_trade_party_details_for_purchase on public.buyer_offers;
create trigger require_trade_party_details_for_purchase
before insert or update of status on public.buyer_offers
for each row execute function public.require_trade_party_details_for_purchase();

revoke all on function public.missing_seller_sale_fields(uuid) from public;
revoke all on function public.missing_buyer_purchase_fields(uuid) from public;
grant execute on function public.missing_seller_sale_fields(uuid) to authenticated;
grant execute on function public.missing_buyer_purchase_fields(uuid) to authenticated;
