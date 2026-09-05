-- Let a fisherman safely edit or pause a consumer listing without touching
-- existing reservations. Variant ids stay stable and old orders keep their
-- original price and quantity snapshots.
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
language plpgsql
security definer
set search_path = public
as $$
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
  v_allocated_minimum_kilos numeric := 0;
begin
  if v_user_id is null then raise exception 'Kirjautuminen vaaditaan'; end if;

  select * into v_listing
  from public.consumer_listings
  where id = p_listing_id;
  if not found or v_listing.seller_user_id <> v_user_id then
    raise exception 'Kuluttajaerää ei löytynyt tai siihen ei ole oikeutta';
  end if;

  if length(trim(coalesce(p_product_name, ''))) < 2 then raise exception 'Tuotteen nimi vaaditaan'; end if;
  if length(trim(coalesce(p_pickup_location, ''))) < 2 then raise exception 'Noutopaikka vaaditaan'; end if;
  if p_pickup_start is null or p_pickup_end is null or p_pickup_end <= p_pickup_start then
    raise exception 'Noutoaikaväli on virheellinen';
  end if;
  if p_order_deadline is null or p_order_deadline > p_pickup_start or p_order_deadline <= now() then
    raise exception 'Tilausten määräaika on virheellinen tai jo päättynyt';
  end if;
  if jsonb_typeof(p_variants) <> 'array' then raise exception 'Myyntivaihtoehdot puuttuvat'; end if;

  select count(*) into v_variant_count
  from public.consumer_listing_variants
  where listing_id = p_listing_id;
  if jsonb_array_length(p_variants) <> v_variant_count then
    raise exception 'Myyntivaihtoehtoja ei voi lisätä tai poistaa muokkauksessa';
  end if;

  select coalesce(kilos, 0) into v_catch_kilos
  from public.catch_entries
  where id = v_listing.catch_entry_id and owner_user_id = v_user_id;

  for v_variant_input in select value from jsonb_array_elements(p_variants) loop
    begin
      v_variant_id := (v_variant_input->>'id')::uuid;
      v_available_units := (v_variant_input->>'available_units')::integer;
    exception when others then
      raise exception 'Myyntivaihtoehdon tiedot ovat virheelliset';
    end;
    if v_variant_id = any(v_seen_ids) then raise exception 'Sama myyntivaihtoehto on mukana kahdesti'; end if;
    v_seen_ids := array_append(v_seen_ids, v_variant_id);

    select * into v_variant
    from public.consumer_listing_variants
    where id = v_variant_id and listing_id = p_listing_id
    for update;
    if not found then raise exception 'Myyntivaihtoehtoa ei löytynyt'; end if;
    if v_available_units < 0 then raise exception 'Jäljellä oleva määrä ei voi olla negatiivinen'; end if;
    if length(trim(coalesce(v_variant_input->>'label', ''))) < 1 then raise exception 'Myyntivaihtoehdon nimi vaaditaan'; end if;
    if coalesce(v_variant_input->>'sale_unit_type', '') <> v_variant.sale_unit_type then
      raise exception 'Myyntiyksikön tyyppiä ei voi vaihtaa';
    end if;

    v_new_initial_units := greatest(
      v_variant.initial_units,
      v_variant.initial_units - v_variant.available_units + v_available_units
    );
    if v_variant.sale_unit_type = 'package' then
      v_allocated_minimum_kilos := v_allocated_minimum_kilos
        + v_new_initial_units * (v_variant_input->>'package_size_kg')::numeric;
      update public.consumer_listing_variants
      set label = trim(v_variant_input->>'label'),
          package_size_kg = (v_variant_input->>'package_size_kg')::numeric,
          unit_price_including_vat = (v_variant_input->>'unit_price_including_vat')::numeric,
          available_units = v_available_units,
          initial_units = v_new_initial_units,
          updated_at = now()
      where id = v_variant.id;
    else
      v_allocated_minimum_kilos := v_allocated_minimum_kilos
        + v_new_initial_units * (v_variant_input->>'min_weight_kg')::numeric;
      update public.consumer_listing_variants
      set label = trim(v_variant_input->>'label'),
          min_weight_kg = (v_variant_input->>'min_weight_kg')::numeric,
          max_weight_kg = (v_variant_input->>'max_weight_kg')::numeric,
          price_per_kg_including_vat = (v_variant_input->>'price_per_kg_including_vat')::numeric,
          available_units = v_available_units,
          initial_units = v_new_initial_units,
          updated_at = now()
      where id = v_variant.id;
    end if;
  end loop;

  if v_listing.catch_entry_id is not null and v_allocated_minimum_kilos > v_catch_kilos + 0.001 then
    raise exception 'Kuluttajamyyntiin varattu vähimmäispaino ylittää saaliin painon';
  end if;

  update public.consumer_listings
  set product_name = trim(p_product_name),
      description = trim(coalesce(p_description, '')),
      pickup_location = trim(p_pickup_location),
      pickup_start = p_pickup_start,
      pickup_end = p_pickup_end,
      order_deadline = p_order_deadline,
      status = case
        when status = 'published' and not exists (
          select 1 from public.consumer_listing_variants
          where listing_id = p_listing_id and available_units > 0
        ) then 'sold_out'
        when status = 'sold_out' and exists (
          select 1 from public.consumer_listing_variants
          where listing_id = p_listing_id and available_units > 0
        ) then 'paused'
        else status
      end,
      updated_at = now()
  where id = p_listing_id
  returning * into v_listing;

  return v_listing;
end;
$$;

create or replace function public.set_consumer_listing_status(
  p_listing_id uuid,
  p_status text
) returns public.consumer_listings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_listing public.consumer_listings;
begin
  if v_user_id is null then raise exception 'Kirjautuminen vaaditaan'; end if;
  if p_status not in ('published', 'paused') then raise exception 'Virheellinen myyntitila'; end if;

  select * into v_listing
  from public.consumer_listings
  where id = p_listing_id
  for update;
  if not found or v_listing.seller_user_id <> v_user_id then
    raise exception 'Kuluttajaerää ei löytynyt tai siihen ei ole oikeutta';
  end if;
  if v_listing.status not in ('published', 'paused') then
    raise exception 'Tässä tilassa olevaa kuluttajaerää ei voi keskeyttää tai jatkaa';
  end if;
  if p_status = 'published' then
    if v_listing.order_deadline <= now() then raise exception 'Muokkaa tilausaikaa ennen myynnin jatkamista'; end if;
    if not exists (
      select 1 from public.consumer_listing_variants
      where listing_id = p_listing_id and available_units > 0
    ) then raise exception 'Lisää erälle saldoa ennen myynnin jatkamista'; end if;
  end if;

  update public.consumer_listings
  set status = p_status, updated_at = now()
  where id = p_listing_id
  returning * into v_listing;
  return v_listing;
end;
$$;

revoke all on function public.update_consumer_listing(uuid, text, text, text, timestamptz, timestamptz, timestamptz, jsonb) from public;
grant execute on function public.update_consumer_listing(uuid, text, text, text, timestamptz, timestamptz, timestamptz, jsonb) to authenticated;
revoke all on function public.set_consumer_listing_status(uuid, text) from public;
grant execute on function public.set_consumer_listing_status(uuid, text) to authenticated;
