-- Sell crayfish to consumers by size class and piece price. Each size class
-- keeps an independent available_units balance and multi-line reservations
-- decrement all selected balances atomically.

alter table public.consumer_listing_variants
  drop constraint if exists consumer_listing_variants_sale_unit_type_check,
  drop constraint if exists consumer_listing_variants_check;

alter table public.consumer_listing_variants
  add constraint consumer_listing_variants_sale_unit_type_check
    check (sale_unit_type in ('package', 'whole_fish', 'piece')),
  add constraint consumer_listing_variants_values_check check (
    (sale_unit_type = 'package' and package_size_kg > 0 and unit_price_including_vat > 0
      and min_weight_kg is null and max_weight_kg is null and price_per_kg_including_vat is null)
    or
    (sale_unit_type = 'whole_fish' and min_weight_kg > 0 and max_weight_kg >= min_weight_kg
      and price_per_kg_including_vat > 0 and package_size_kg is null and unit_price_including_vat is null)
    or
    (sale_unit_type = 'piece' and unit_price_including_vat > 0 and package_size_kg is null
      and min_weight_kg is null and max_weight_kg is null and price_per_kg_including_vat is null)
  );

alter table public.consumer_orders
  drop constraint if exists consumer_orders_sale_unit_type_check,
  drop constraint if exists consumer_orders_estimated_weight_kg_check,
  alter column estimated_weight_kg drop not null;

alter table public.consumer_orders
  add constraint consumer_orders_sale_unit_type_check
    check (sale_unit_type in ('package', 'whole_fish', 'piece')),
  add constraint consumer_orders_estimated_weight_kg_check check (
    (sale_unit_type = 'piece' and estimated_weight_kg is null)
    or (sale_unit_type in ('package', 'whole_fish') and estimated_weight_kg > 0)
  );

alter table public.consumer_listings
  add column if not exists allocated_pieces integer not null default 0 check (allocated_pieces >= 0);

update public.consumer_listings listings
set allocated_pieces = coalesce((
  select sum(variants.initial_units)
  from public.consumer_listing_variants variants
  where variants.listing_id = listings.id and variants.sale_unit_type = 'piece'
), 0);

create or replace function public.publish_consumer_listing(
  p_catch_entry_id uuid, p_batch_id text, p_species text, p_product_name text,
  p_description text, p_seller_name text, p_municipality text, p_pickup_location text,
  p_catch_date date, p_cold_storage boolean, p_pickup_start timestamptz,
  p_pickup_end timestamptz, p_order_deadline timestamptz, p_variants jsonb
) returns uuid language plpgsql security definer set search_path = public, auth as $$
declare
  v_user_id uuid := auth.uid(); v_listing_id uuid; v_variant jsonb;
  v_index integer := 0; v_type text; v_listing_type text; v_units integer;
  v_catch_kilos numeric := 0; v_catch_pieces integer := 0;
  v_allocated_minimum_kilos numeric := 0; v_allocated_pieces integer := 0;
begin
  if v_user_id is null then raise exception 'Kirjautuminen vaaditaan'; end if;
  if not exists (select 1 from public.profiles where id = v_user_id and role = 'member' and is_active = true) then
    raise exception 'Vain aktiivinen kalastajatunnus voi julkaista kuluttajaerän';
  end if;
  select coalesce(kilos, 0), coalesce(count, 0) into v_catch_kilos, v_catch_pieces
  from public.catch_entries where id = p_catch_entry_id and owner_user_id = v_user_id;
  if not found then raise exception 'Saaliserää ei löytynyt tai siihen ei ole oikeutta'; end if;
  if jsonb_typeof(p_variants) <> 'array' or jsonb_array_length(p_variants) < 1 then
    raise exception 'Lisää vähintään yksi myyntiyksikkö';
  end if;
  if length(trim(coalesce(p_pickup_location, ''))) < 2 then raise exception 'Noutopaikka vaaditaan'; end if;
  if p_pickup_start is null or p_pickup_end is null or p_pickup_end <= p_pickup_start then
    raise exception 'Noutoaikaväli on virheellinen';
  end if;
  if p_order_deadline is null or p_order_deadline > p_pickup_start or p_order_deadline <= now() then
    raise exception 'Tilausten määräaika on virheellinen tai jo päättynyt';
  end if;

  insert into public.consumer_listings (
    seller_user_id, catch_entry_id, batch_id, species, product_name, description, seller_name,
    municipality, pickup_location, catch_date, cold_storage, pickup_start, pickup_end, order_deadline, status
  ) values (
    v_user_id, p_catch_entry_id, trim(p_batch_id), trim(p_species), trim(p_product_name),
    trim(coalesce(p_description, '')), trim(p_seller_name), trim(coalesce(p_municipality, '')),
    trim(p_pickup_location), p_catch_date, coalesce(p_cold_storage, true), p_pickup_start, p_pickup_end, p_order_deadline, 'published'
  ) returning id into v_listing_id;

  for v_variant in select value from jsonb_array_elements(p_variants) loop
    v_type := v_variant->>'sale_unit_type';
    v_units := (v_variant->>'available_units')::integer;
    if v_type is null or v_type not in ('package', 'whole_fish', 'piece') or v_units < 1
      or length(trim(coalesce(v_variant->>'label', ''))) < 1 then
      raise exception 'Virheellinen myyntiyksikkö';
    end if;
    if v_listing_type is null then v_listing_type := v_type; end if;
    if v_listing_type <> v_type then raise exception 'Samassa erässä ei voi sekoittaa eri myyntiyksiköitä'; end if;

    insert into public.consumer_listing_variants (
      listing_id, sale_unit_type, label, package_size_kg, unit_price_including_vat,
      min_weight_kg, max_weight_kg, price_per_kg_including_vat, available_units, initial_units, sort_order
    ) values (
      v_listing_id, v_type, trim(v_variant->>'label'), nullif(v_variant->>'package_size_kg', '')::numeric,
      nullif(v_variant->>'unit_price_including_vat', '')::numeric, nullif(v_variant->>'min_weight_kg', '')::numeric,
      nullif(v_variant->>'max_weight_kg', '')::numeric, nullif(v_variant->>'price_per_kg_including_vat', '')::numeric,
      v_units, v_units, v_index
    );

    if v_type = 'piece' then
      v_allocated_pieces := v_allocated_pieces + v_units;
    elsif v_type = 'package' then
      v_allocated_minimum_kilos := v_allocated_minimum_kilos + v_units * (v_variant->>'package_size_kg')::numeric;
    else
      v_allocated_minimum_kilos := v_allocated_minimum_kilos + v_units * (v_variant->>'min_weight_kg')::numeric;
    end if;
    v_index := v_index + 1;
  end loop;

  if v_allocated_minimum_kilos > v_catch_kilos + 0.001 then
    raise exception 'Kuluttajamyyntiin varattu vähimmäispaino ylittää saaliin painon';
  end if;
  if v_allocated_pieces > v_catch_pieces then
    raise exception 'Kuluttajamyyntiin varattu kappalemäärä ylittää saaliin rapumäärän';
  end if;
  return v_listing_id;
end;
$$;

create or replace function public.update_consumer_listing(
  p_listing_id uuid,
  p_product_name text,
  p_description text,
  p_pickup_location text,
  p_pickup_start timestamptz,
  p_pickup_end timestamptz,
  p_order_deadline timestamptz,
  p_variants jsonb
) returns public.consumer_listings
language plpgsql security definer set search_path = public as $$
declare
  v_user_id uuid := auth.uid();
  v_listing public.consumer_listings;
  v_variant public.consumer_listing_variants;
  v_variant_input jsonb;
  v_variant_id uuid;
  v_seen_ids uuid[] := array[]::uuid[];
  v_available_units integer;
  v_new_initial_units integer;
  v_variant_count integer;
  v_catch_kilos numeric := 0;
  v_catch_pieces integer := 0;
  v_allocated_minimum_kilos numeric := 0;
  v_allocated_pieces integer := 0;
begin
  if v_user_id is null then raise exception 'Kirjautuminen vaaditaan'; end if;
  select * into v_listing from public.consumer_listings where id = p_listing_id;
  if not found or v_listing.seller_user_id <> v_user_id then raise exception 'Kuluttajaerää ei löytynyt tai siihen ei ole oikeutta'; end if;
  if length(trim(coalesce(p_product_name, ''))) < 2 then raise exception 'Tuotteen nimi vaaditaan'; end if;
  if length(trim(coalesce(p_pickup_location, ''))) < 2 then raise exception 'Noutopaikka vaaditaan'; end if;
  if p_pickup_start is null or p_pickup_end is null or p_pickup_end <= p_pickup_start then raise exception 'Noutoaikaväli on virheellinen'; end if;
  if p_order_deadline is null or p_order_deadline > p_pickup_start or p_order_deadline <= now() then raise exception 'Tilausten määräaika on virheellinen tai jo päättynyt'; end if;
  if jsonb_typeof(p_variants) <> 'array' then raise exception 'Myyntivaihtoehdot puuttuvat'; end if;

  select count(*) into v_variant_count from public.consumer_listing_variants where listing_id = p_listing_id;
  if jsonb_array_length(p_variants) <> v_variant_count then raise exception 'Myyntivaihtoehtoja ei voi lisätä tai poistaa muokkauksessa'; end if;
  select coalesce(kilos, 0), coalesce(count, 0) into v_catch_kilos, v_catch_pieces
  from public.catch_entries where id = v_listing.catch_entry_id and owner_user_id = v_user_id;

  for v_variant_input in select value from jsonb_array_elements(p_variants) loop
    begin
      v_variant_id := (v_variant_input->>'id')::uuid;
      v_available_units := (v_variant_input->>'available_units')::integer;
    exception when others then raise exception 'Myyntivaihtoehdon tiedot ovat virheelliset'; end;
    if v_variant_id = any(v_seen_ids) then raise exception 'Sama myyntivaihtoehto on mukana kahdesti'; end if;
    v_seen_ids := array_append(v_seen_ids, v_variant_id);
    select * into v_variant from public.consumer_listing_variants
    where id = v_variant_id and listing_id = p_listing_id for update;
    if not found then raise exception 'Myyntivaihtoehtoa ei löytynyt'; end if;
    if v_available_units < 0 then raise exception 'Jäljellä oleva määrä ei voi olla negatiivinen'; end if;
    if length(trim(coalesce(v_variant_input->>'label', ''))) < 1 then raise exception 'Myyntivaihtoehdon nimi vaaditaan'; end if;
    if coalesce(v_variant_input->>'sale_unit_type', '') <> v_variant.sale_unit_type then raise exception 'Myyntiyksikön tyyppiä ei voi vaihtaa'; end if;

    v_new_initial_units := greatest(v_variant.initial_units, v_variant.initial_units - v_variant.available_units + v_available_units);
    if v_variant.sale_unit_type = 'package' then
      v_allocated_minimum_kilos := v_allocated_minimum_kilos + v_new_initial_units * (v_variant_input->>'package_size_kg')::numeric;
      update public.consumer_listing_variants set
        label = trim(v_variant_input->>'label'), package_size_kg = (v_variant_input->>'package_size_kg')::numeric,
        unit_price_including_vat = (v_variant_input->>'unit_price_including_vat')::numeric,
        available_units = v_available_units, initial_units = v_new_initial_units, updated_at = now()
      where id = v_variant.id;
    elsif v_variant.sale_unit_type = 'piece' then
      v_allocated_pieces := v_allocated_pieces + v_new_initial_units;
      update public.consumer_listing_variants set
        label = trim(v_variant_input->>'label'), unit_price_including_vat = (v_variant_input->>'unit_price_including_vat')::numeric,
        available_units = v_available_units, initial_units = v_new_initial_units, updated_at = now()
      where id = v_variant.id;
    else
      v_allocated_minimum_kilos := v_allocated_minimum_kilos + v_new_initial_units * (v_variant_input->>'min_weight_kg')::numeric;
      update public.consumer_listing_variants set
        label = trim(v_variant_input->>'label'), min_weight_kg = (v_variant_input->>'min_weight_kg')::numeric,
        max_weight_kg = (v_variant_input->>'max_weight_kg')::numeric,
        price_per_kg_including_vat = (v_variant_input->>'price_per_kg_including_vat')::numeric,
        available_units = v_available_units, initial_units = v_new_initial_units, updated_at = now()
      where id = v_variant.id;
    end if;
  end loop;

  if v_listing.catch_entry_id is not null and v_allocated_minimum_kilos > v_catch_kilos + 0.001 then raise exception 'Kuluttajamyyntiin varattu vähimmäispaino ylittää saaliin painon'; end if;
  if v_listing.catch_entry_id is not null and v_allocated_pieces > v_catch_pieces then raise exception 'Kuluttajamyyntiin varattu kappalemäärä ylittää saaliin rapumäärän'; end if;

  update public.consumer_listings set
    product_name = trim(p_product_name), description = trim(coalesce(p_description, '')),
    pickup_location = trim(p_pickup_location), pickup_start = p_pickup_start, pickup_end = p_pickup_end,
    order_deadline = p_order_deadline,
    status = case
      when status = 'published' and not exists (select 1 from public.consumer_listing_variants where listing_id = p_listing_id and available_units > 0) then 'sold_out'
      when status = 'sold_out' and exists (select 1 from public.consumer_listing_variants where listing_id = p_listing_id and available_units > 0) then 'paused'
      else status end,
    updated_at = now()
  where id = p_listing_id returning * into v_listing;
  return v_listing;
end;
$$;

create or replace function public.reserve_consumer_listing_multiple(
  p_listing_id uuid, p_items jsonb, p_consumer_user_id uuid, p_name text,
  p_email text, p_phone text, p_note text default ''
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_listing public.consumer_listings;
  v_variant public.consumer_listing_variants;
  v_order public.consumer_orders;
  v_item jsonb; v_variant_id uuid; v_unit_count integer;
  v_seen_variant_ids uuid[] := array[]::uuid[];
  v_group_id uuid := gen_random_uuid(); v_orders jsonb := '[]'::jsonb;
  v_name text := trim(coalesce(p_name, '')); v_email text := lower(trim(coalesce(p_email, ''))); v_phone text := trim(coalesce(p_phone, ''));
  v_weight numeric(10,3); v_gross numeric(10,2); v_net numeric(10,2); v_vat numeric(10,2);
begin
  if length(v_name) < 2 then raise exception 'Varaajan nimi vaaditaan'; end if;
  if v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Voimassa oleva sähköpostiosoite vaaditaan'; end if;
  if length(v_phone) < 5 then raise exception 'Puhelinnumero vaaditaan'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 30 then raise exception 'Valitse vähintään yksi myyntivaihtoehto'; end if;
  if p_consumer_user_id is not null and not exists (select 1 from public.profiles where id = p_consumer_user_id and role = 'consumer' and is_active = true) then raise exception 'Kuluttajatili ei ole aktiivinen'; end if;

  select * into v_listing from public.consumer_listings where id = p_listing_id for update;
  if not found or v_listing.status <> 'published' then raise exception 'Kalaerä ei ole enää myynnissä'; end if;
  if now() >= v_listing.order_deadline then raise exception 'Tämän kalaerän tilausaika on päättynyt'; end if;

  for v_item in select value from jsonb_array_elements(p_items) order by value->>'variantId' loop
    begin
      v_variant_id := (v_item->>'variantId')::uuid;
      v_unit_count := (v_item->>'unitCount')::integer;
    exception when others then raise exception 'Virheellinen myyntivaihtoehto tai kappalemäärä'; end;
    if v_unit_count is null or v_unit_count < 1 then raise exception 'Virheellinen kappalemäärä'; end if;
    if v_variant_id = any(v_seen_variant_ids) then raise exception 'Sama myyntivaihtoehto on valittu kahdesti'; end if;
    v_seen_variant_ids := array_append(v_seen_variant_ids, v_variant_id);

    select * into v_variant from public.consumer_listing_variants
    where id = v_variant_id and listing_id = v_listing.id for update;
    if not found then raise exception 'Myyntiyksikköä ei löytynyt'; end if;
    if v_variant.available_units < v_unit_count then raise exception 'Valittua määrää ei ole riittävästi jäljellä'; end if;

    v_weight := case
      when v_variant.sale_unit_type = 'whole_fish' then round(((v_variant.min_weight_kg + v_variant.max_weight_kg) / 2) * v_unit_count, 3)
      when v_variant.sale_unit_type = 'package' then v_variant.package_size_kg * v_unit_count
      else null end;
    v_gross := round(case when v_variant.sale_unit_type = 'whole_fish'
      then v_weight * v_variant.price_per_kg_including_vat
      else v_variant.unit_price_including_vat * v_unit_count end, 2);
    v_net := round(v_gross / (1 + v_listing.vat_rate), 2); v_vat := v_gross - v_net;

    insert into public.consumer_orders (
      reservation_group_id, listing_id, variant_id, seller_user_id, consumer_user_id,
      consumer_email, consumer_name, consumer_phone, consumer_note, sale_unit_type,
      variant_label, unit_count, package_count, package_price_including_vat,
      estimated_weight_kg, total_including_vat, vat_rate, net_trade_value,
      vat_amount, commission_rate, commission_amount
    ) values (
      v_group_id, v_listing.id, v_variant.id, v_listing.seller_user_id, p_consumer_user_id,
      v_email, v_name, v_phone, trim(coalesce(p_note, '')), v_variant.sale_unit_type,
      v_variant.label, v_unit_count,
      case when v_variant.sale_unit_type = 'package' then v_unit_count else null end,
      v_variant.unit_price_including_vat, v_weight, v_gross, v_listing.vat_rate,
      v_net, v_vat, 0.08, round(v_net * 0.08, 2)
    ) returning * into v_order;

    update public.consumer_listing_variants set available_units = available_units - v_unit_count, updated_at = now() where id = v_variant.id;
    v_orders := v_orders || jsonb_build_array(to_jsonb(v_order));
  end loop;

  if not exists (select 1 from public.consumer_listing_variants where listing_id = v_listing.id and available_units > 0) then
    update public.consumer_listings set status = 'sold_out', updated_at = now() where id = v_listing.id;
  end if;
  return jsonb_build_object('reservationGroupId', v_group_id, 'orders', v_orders);
end;
$$;

create or replace function public.consumer_listing_committed_pieces(
  p_catch_entry_id uuid, p_exclude_listing_id uuid default null
) returns integer language sql stable security definer set search_path = public as $$
  select coalesce(sum(case
    when listings.pickup_end > now() and listings.status in ('published', 'paused', 'sold_out') then listings.allocated_pieces
    else coalesce((select sum(orders.unit_count) from public.consumer_orders orders
      where orders.listing_id = listings.id and orders.sale_unit_type = 'piece'
        and orders.status not in ('cancelled', 'expired')), 0)
  end), 0)::integer
  from public.consumer_listings listings
  where listings.catch_entry_id = p_catch_entry_id
    and (p_exclude_listing_id is null or listings.id <> p_exclude_listing_id);
$$;

create or replace function public.get_catch_remaining_pieces(p_catch_entry_id uuid)
returns integer language plpgsql stable security definer set search_path = public, auth as $$
declare v_entry public.catch_entries; v_business_pieces integer := 0;
begin
  select * into v_entry from public.catch_entries where id = p_catch_entry_id;
  if not found or v_entry.owner_user_id <> auth.uid() then raise exception 'Saaliserää ei löytynyt tai siihen ei ole oikeutta'; end if;
  if coalesce(v_entry.offer_to_shops, false) or coalesce(v_entry.offer_to_restaurants, false)
    or coalesce(v_entry.offer_to_wholesalers, false) or coalesce(v_entry.offer_restricted, false) then
    v_business_pieces := greatest(coalesce(v_entry.count, 0), 0);
  end if;
  return greatest(0, coalesce(v_entry.count, 0) - v_business_pieces - public.consumer_listing_committed_pieces(v_entry.id));
end;
$$;

create or replace function public.recalculate_consumer_listing_allocation()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_listing_id uuid := coalesce(new.listing_id, old.listing_id);
begin
  update public.consumer_listings listings set
    allocated_kilos = coalesce((select sum(variants.initial_units * case
      when variants.sale_unit_type = 'package' then variants.package_size_kg
      when variants.sale_unit_type = 'whole_fish' then variants.max_weight_kg
      else 0 end)
      from public.consumer_listing_variants variants where variants.listing_id = v_listing_id), 0),
    allocated_pieces = coalesce((select sum(variants.initial_units)
      from public.consumer_listing_variants variants
      where variants.listing_id = v_listing_id and variants.sale_unit_type = 'piece'), 0),
    updated_at = now()
  where listings.id = v_listing_id;
  return null;
end;
$$;

create or replace function public.validate_consumer_listing_inventory()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_entry public.catch_entries; v_other_consumer_kilos numeric := 0; v_other_consumer_pieces integer := 0;
  v_business_kilos numeric := 0; v_business_pieces integer := 0;
  v_this_listing_kilos numeric := 0; v_this_listing_pieces integer := 0; v_has_business_sale boolean;
begin
  if new.catch_entry_id is null then return new; end if;
  select * into v_entry from public.catch_entries where id = new.catch_entry_id for update;
  if not found then raise exception 'Saaliserää ei löytynyt'; end if;
  v_other_consumer_kilos := public.consumer_listing_committed_kilos(new.catch_entry_id, new.id);
  v_other_consumer_pieces := public.consumer_listing_committed_pieces(new.catch_entry_id, new.id);
  v_has_business_sale := coalesce(v_entry.offer_to_shops, false) or coalesce(v_entry.offer_to_restaurants, false)
    or coalesce(v_entry.offer_to_wholesalers, false) or coalesce(v_entry.offer_restricted, false);
  if v_has_business_sale then
    v_business_kilos := case when coalesce(v_entry.business_sale_kilos, 0) > 0 then v_entry.business_sale_kilos else greatest(coalesce(v_entry.kilos, 0), 0) end;
    v_business_pieces := greatest(coalesce(v_entry.count, 0), 0);
  end if;
  if new.pickup_end > now() and new.status in ('published', 'paused', 'sold_out') then
    v_this_listing_kilos := coalesce(new.allocated_kilos, 0);
    v_this_listing_pieces := coalesce(new.allocated_pieces, 0);
  else
    select coalesce(sum(coalesce(orders.final_weight_kg, orders.estimated_weight_kg)), 0),
      coalesce(sum(case when orders.sale_unit_type = 'piece' then orders.unit_count else 0 end), 0)
    into v_this_listing_kilos, v_this_listing_pieces
    from public.consumer_orders orders where orders.listing_id = new.id and orders.status not in ('cancelled', 'expired');
  end if;
  if v_business_kilos + v_other_consumer_kilos + v_this_listing_kilos > coalesce(v_entry.kilos, 0) + 0.001 then raise exception 'Myyntiin varattu määrä ylittää saaliserän jäljellä olevan saldon'; end if;
  if v_business_pieces + v_other_consumer_pieces + v_this_listing_pieces > coalesce(v_entry.count, 0) then raise exception 'Myyntiin varattu rapumäärä ylittää saaliserän kappalesaldon'; end if;
  return new;
end;
$$;

drop trigger if exists validate_consumer_listing_inventory on public.consumer_listings;
create trigger validate_consumer_listing_inventory
before insert or update of catch_entry_id, allocated_kilos, allocated_pieces, pickup_end, status
on public.consumer_listings for each row execute function public.validate_consumer_listing_inventory();

create or replace function public.validate_catch_business_inventory()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_consumer_kilos numeric := 0; v_consumer_pieces integer := 0; v_is_for_sale boolean;
begin
  v_is_for_sale := coalesce(new.offer_to_shops, false) or coalesce(new.offer_to_restaurants, false)
    or coalesce(new.offer_to_wholesalers, false) or coalesce(new.offer_restricted, false);
  if not v_is_for_sale then new.business_sale_kilos := 0; return new; end if;
  if coalesce(new.business_sale_kilos, 0) <= 0 then new.business_sale_kilos := greatest(coalesce(new.kilos, 0), 0); end if;
  v_consumer_kilos := public.consumer_listing_committed_kilos(new.id);
  v_consumer_pieces := public.consumer_listing_committed_pieces(new.id);
  if new.business_sale_kilos < 0 or new.business_sale_kilos + v_consumer_kilos > coalesce(new.kilos, 0) + 0.001 then raise exception 'Yritysmyyntiin varattu määrä ylittää saaliserän jäljellä olevan saldon'; end if;
  if v_consumer_pieces > 0 then raise exception 'Rapuerää ei voi varata yhtä aikaa yritys- ja kuluttajamyyntiin'; end if;
  return new;
end;
$$;

drop trigger if exists validate_catch_business_inventory on public.catch_entries;
create trigger validate_catch_business_inventory
before insert or update of kilos, count, business_sale_kilos, offer_to_shops, offer_to_restaurants, offer_to_wholesalers, offer_restricted
on public.catch_entries for each row execute function public.validate_catch_business_inventory();

revoke all on function public.get_catch_remaining_pieces(uuid) from public;
grant execute on function public.get_catch_remaining_pieces(uuid) to authenticated;
revoke all on function public.consumer_listing_committed_pieces(uuid, uuid) from public;
revoke all on function public.reserve_consumer_listing_multiple(uuid, jsonb, uuid, text, text, text, text) from public;
grant execute on function public.reserve_consumer_listing_multiple(uuid, jsonb, uuid, text, text, text, text) to service_role;

