-- A consumer can reserve several package sizes from the same listing in one
-- atomic transaction. Individual lines remain separate orders for inventory,
-- invoicing and final weighing, but share one reservation group identifier.
alter table public.consumer_orders
  add column if not exists reservation_group_id uuid;

update public.consumer_orders
set reservation_group_id = id
where reservation_group_id is null;

alter table public.consumer_orders
  alter column reservation_group_id set default gen_random_uuid(),
  alter column reservation_group_id set not null;

create index if not exists consumer_orders_reservation_group_idx
  on public.consumer_orders (reservation_group_id, created_at);

create or replace function public.reserve_consumer_listing_multiple(
  p_listing_id uuid,
  p_items jsonb,
  p_consumer_user_id uuid,
  p_name text,
  p_email text,
  p_phone text,
  p_note text default ''
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_listing public.consumer_listings;
  v_variant public.consumer_listing_variants;
  v_order public.consumer_orders;
  v_item jsonb;
  v_variant_id uuid;
  v_unit_count integer;
  v_seen_variant_ids uuid[] := array[]::uuid[];
  v_group_id uuid := gen_random_uuid();
  v_orders jsonb := '[]'::jsonb;
  v_name text := trim(coalesce(p_name, ''));
  v_email text := lower(trim(coalesce(p_email, '')));
  v_phone text := trim(coalesce(p_phone, ''));
  v_weight numeric(10,3);
  v_gross numeric(10,2);
  v_net numeric(10,2);
  v_vat numeric(10,2);
begin
  if length(v_name) < 2 then raise exception 'Varaajan nimi vaaditaan'; end if;
  if v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Voimassa oleva sähköpostiosoite vaaditaan';
  end if;
  if length(v_phone) < 5 then raise exception 'Puhelinnumero vaaditaan'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 30 then
    raise exception 'Valitse vähintään yksi pakkauskoko';
  end if;

  if p_consumer_user_id is not null and not exists (
    select 1 from public.profiles
    where id = p_consumer_user_id and role = 'consumer' and is_active = true
  ) then
    raise exception 'Kuluttajatili ei ole aktiivinen';
  end if;

  select * into v_listing
  from public.consumer_listings
  where id = p_listing_id
  for update;
  if not found or v_listing.status <> 'published' then raise exception 'Kalaerä ei ole enää myynnissä'; end if;
  if now() >= v_listing.order_deadline then raise exception 'Tämän kalaerän tilausaika on päättynyt'; end if;

  for v_item in
    select value from jsonb_array_elements(p_items)
    order by value->>'variantId'
  loop
    begin
      v_variant_id := (v_item->>'variantId')::uuid;
      v_unit_count := (v_item->>'unitCount')::integer;
    exception when others then
      raise exception 'Virheellinen pakkauskoko tai kappalemäärä';
    end;
    if v_unit_count is null or v_unit_count < 1 then raise exception 'Virheellinen kappalemäärä'; end if;
    if v_variant_id = any(v_seen_variant_ids) then raise exception 'Sama pakkauskoko on valittu kahdesti'; end if;
    v_seen_variant_ids := array_append(v_seen_variant_ids, v_variant_id);

    select * into v_variant
    from public.consumer_listing_variants
    where id = v_variant_id and listing_id = v_listing.id
    for update;
    if not found then raise exception 'Myyntiyksikköä ei löytynyt'; end if;
    if v_variant.available_units < v_unit_count then raise exception 'Valittua määrää ei ole riittävästi jäljellä'; end if;

    v_weight := case when v_variant.sale_unit_type = 'whole_fish'
      then round(((v_variant.min_weight_kg + v_variant.max_weight_kg) / 2) * v_unit_count, 3)
      else v_variant.package_size_kg * v_unit_count end;
    v_gross := round(case when v_variant.sale_unit_type = 'whole_fish'
      then v_weight * v_variant.price_per_kg_including_vat
      else v_variant.unit_price_including_vat * v_unit_count end, 2);
    v_net := round(v_gross / (1 + v_listing.vat_rate), 2);
    v_vat := v_gross - v_net;

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

    update public.consumer_listing_variants
    set available_units = available_units - v_unit_count, updated_at = now()
    where id = v_variant.id;

    v_orders := v_orders || jsonb_build_array(to_jsonb(v_order));
  end loop;

  if not exists (
    select 1 from public.consumer_listing_variants
    where listing_id = v_listing.id and available_units > 0
  ) then
    update public.consumer_listings
    set status = 'sold_out', updated_at = now()
    where id = v_listing.id;
  end if;

  return jsonb_build_object('reservationGroupId', v_group_id, 'orders', v_orders);
end;
$$;

revoke all on function public.reserve_consumer_listing_multiple(uuid, jsonb, uuid, text, text, text, text) from public;
grant execute on function public.reserve_consumer_listing_multiple(uuid, jsonb, uuid, text, text, text, text) to service_role;
