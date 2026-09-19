-- Track how much of one catch is committed to each sales channel. The catch
-- log itself remains unchanged and can be split into several consumer listings
-- and one current business offer without selling the same fish twice.
alter table public.catch_entries
  add column if not exists business_sale_kilos numeric(10,3) not null default 0;

alter table public.consumer_listings
  add column if not exists allocated_kilos numeric(10,3) not null default 0;

alter table public.consumer_listings
  drop constraint if exists consumer_listings_seller_user_id_catch_entry_id_key;

create index if not exists consumer_listings_catch_entry_idx
  on public.consumer_listings (catch_entry_id, created_at desc);

update public.consumer_listings listings
set allocated_kilos = coalesce((
  select sum(variants.initial_units * case
    when variants.sale_unit_type = 'package' then variants.package_size_kg
    else variants.max_weight_kg
  end)
  from public.consumer_listing_variants variants
  where variants.listing_id = listings.id
), 0);

create or replace function public.consumer_listing_committed_kilos(
  p_catch_entry_id uuid,
  p_exclude_listing_id uuid default null
) returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(case
    when listings.pickup_end > now()
      and listings.status in ('published', 'paused', 'sold_out')
      then listings.allocated_kilos
    else coalesce((
      select sum(coalesce(orders.final_weight_kg, orders.estimated_weight_kg))
      from public.consumer_orders orders
      where orders.listing_id = listings.id
        and orders.status not in ('cancelled', 'expired')
    ), 0)
  end), 0)
  from public.consumer_listings listings
  where listings.catch_entry_id = p_catch_entry_id
    and (p_exclude_listing_id is null or listings.id <> p_exclude_listing_id);
$$;

create or replace function public.get_catch_remaining_kilos(p_catch_entry_id uuid)
returns numeric
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_entry public.catch_entries;
  v_business_kilos numeric := 0;
begin
  select * into v_entry from public.catch_entries where id = p_catch_entry_id;
  if not found or v_entry.owner_user_id <> auth.uid() then
    raise exception 'Saaliserää ei löytynyt tai siihen ei ole oikeutta';
  end if;
  if coalesce(v_entry.offer_to_shops, false)
    or coalesce(v_entry.offer_to_restaurants, false)
    or coalesce(v_entry.offer_to_wholesalers, false)
    or coalesce(v_entry.offer_restricted, false) then
    v_business_kilos := case
      when coalesce(v_entry.business_sale_kilos, 0) > 0 then v_entry.business_sale_kilos
      else greatest(coalesce(v_entry.kilos, 0), 0)
    end;
  end if;
  return greatest(0, coalesce(v_entry.kilos, 0) - v_business_kilos - public.consumer_listing_committed_kilos(v_entry.id));
end;
$$;

create or replace function public.validate_catch_business_inventory()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_consumer_kilos numeric := 0;
  v_is_for_sale boolean;
begin
  v_is_for_sale := coalesce(new.offer_to_shops, false)
    or coalesce(new.offer_to_restaurants, false)
    or coalesce(new.offer_to_wholesalers, false)
    or coalesce(new.offer_restricted, false);
  if not v_is_for_sale then
    new.business_sale_kilos := 0;
    return new;
  end if;
  if coalesce(new.business_sale_kilos, 0) <= 0 then
    new.business_sale_kilos := greatest(coalesce(new.kilos, 0), 0);
  end if;
  v_consumer_kilos := public.consumer_listing_committed_kilos(new.id);
  if new.business_sale_kilos < 0 or new.business_sale_kilos + v_consumer_kilos > coalesce(new.kilos, 0) + 0.001 then
    raise exception 'Yritysmyyntiin varattu määrä ylittää saaliserän jäljellä olevan saldon';
  end if;
  return new;
end;
$$;

drop trigger if exists validate_catch_business_inventory on public.catch_entries;
create trigger validate_catch_business_inventory
before insert or update of kilos, business_sale_kilos, offer_to_shops, offer_to_restaurants, offer_to_wholesalers, offer_restricted
on public.catch_entries
for each row execute function public.validate_catch_business_inventory();

create or replace function public.validate_consumer_listing_inventory()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry public.catch_entries;
  v_other_consumer_kilos numeric := 0;
  v_business_kilos numeric := 0;
  v_this_listing_kilos numeric := 0;
begin
  if new.catch_entry_id is null then return new; end if;
  select * into v_entry from public.catch_entries where id = new.catch_entry_id for update;
  if not found then raise exception 'Saaliserää ei löytynyt'; end if;
  v_other_consumer_kilos := public.consumer_listing_committed_kilos(new.catch_entry_id, new.id);
  if coalesce(v_entry.offer_to_shops, false)
    or coalesce(v_entry.offer_to_restaurants, false)
    or coalesce(v_entry.offer_to_wholesalers, false)
    or coalesce(v_entry.offer_restricted, false) then
    v_business_kilos := case
      when coalesce(v_entry.business_sale_kilos, 0) > 0 then v_entry.business_sale_kilos
      else greatest(coalesce(v_entry.kilos, 0), 0)
    end;
  end if;
  if new.pickup_end > now() and new.status in ('published', 'paused', 'sold_out') then
    v_this_listing_kilos := coalesce(new.allocated_kilos, 0);
  else
    select coalesce(sum(coalesce(orders.final_weight_kg, orders.estimated_weight_kg)), 0)
    into v_this_listing_kilos
    from public.consumer_orders orders
    where orders.listing_id = new.id and orders.status not in ('cancelled', 'expired');
  end if;
  if v_business_kilos + v_other_consumer_kilos + v_this_listing_kilos > coalesce(v_entry.kilos, 0) + 0.001 then
    raise exception 'Myyntiin varattu määrä ylittää saaliserän jäljellä olevan saldon';
  end if;
  return new;
end;
$$;

drop trigger if exists validate_consumer_listing_inventory on public.consumer_listings;
create trigger validate_consumer_listing_inventory
before insert or update of catch_entry_id, allocated_kilos, pickup_end, status
on public.consumer_listings
for each row execute function public.validate_consumer_listing_inventory();

create or replace function public.recalculate_consumer_listing_allocation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_listing_id uuid := coalesce(new.listing_id, old.listing_id);
begin
  update public.consumer_listings listings
  set allocated_kilos = coalesce((
    select sum(variants.initial_units * case
      when variants.sale_unit_type = 'package' then variants.package_size_kg
      else variants.max_weight_kg
    end)
    from public.consumer_listing_variants variants
    where variants.listing_id = v_listing_id
  ), 0), updated_at = now()
  where listings.id = v_listing_id;
  return null;
end;
$$;

drop trigger if exists recalculate_consumer_listing_allocation on public.consumer_listing_variants;
create constraint trigger recalculate_consumer_listing_allocation
after insert or update or delete on public.consumer_listing_variants
deferrable initially deferred
for each row execute function public.recalculate_consumer_listing_allocation();

revoke all on function public.get_catch_remaining_kilos(uuid) from public;
grant execute on function public.get_catch_remaining_kilos(uuid) to authenticated;
revoke all on function public.consumer_listing_committed_kilos(uuid, uuid) from public;
