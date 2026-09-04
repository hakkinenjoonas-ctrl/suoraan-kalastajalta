-- Public listing links can be reserved without creating an account. The Edge Function
-- is the only caller: the function is not granted to anon or authenticated clients.
alter table public.consumer_orders
  alter column consumer_user_id drop not null;

create function public.reserve_consumer_listing_guest(
  p_listing_id uuid,
  p_variant_id uuid,
  p_unit_count integer,
  p_name text,
  p_email text,
  p_phone text,
  p_note text default ''
) returns public.consumer_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_listing public.consumer_listings;
  v_variant public.consumer_listing_variants;
  v_order public.consumer_orders;
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
  if p_unit_count is null or p_unit_count < 1 then raise exception 'Virheellinen kappalemäärä'; end if;

  select * into v_variant
  from public.consumer_listing_variants
  where id = p_variant_id and listing_id = p_listing_id
  for update;
  if not found then raise exception 'Myyntiyksikköä ei löytynyt'; end if;

  select * into v_listing
  from public.consumer_listings
  where id = p_listing_id
  for update;
  if not found or v_listing.status <> 'published' then raise exception 'Kalaerä ei ole enää myynnissä'; end if;
  if now() >= v_listing.order_deadline then raise exception 'Tämän kalaerän tilausaika on päättynyt'; end if;
  if v_variant.available_units < p_unit_count then raise exception 'Valittua määrää ei ole riittävästi jäljellä'; end if;

  v_weight := case when v_variant.sale_unit_type = 'whole_fish'
    then round(((v_variant.min_weight_kg + v_variant.max_weight_kg) / 2) * p_unit_count, 3)
    else v_variant.package_size_kg * p_unit_count end;
  v_gross := round(case when v_variant.sale_unit_type = 'whole_fish'
    then v_weight * v_variant.price_per_kg_including_vat
    else v_variant.unit_price_including_vat * p_unit_count end, 2);
  v_net := round(v_gross / (1 + v_listing.vat_rate), 2);
  v_vat := v_gross - v_net;

  insert into public.consumer_orders (
    listing_id, variant_id, seller_user_id, consumer_user_id, consumer_email, consumer_name,
    consumer_phone, consumer_note, sale_unit_type, variant_label, unit_count, package_count,
    package_price_including_vat, estimated_weight_kg, total_including_vat, vat_rate,
    net_trade_value, vat_amount, commission_rate, commission_amount
  ) values (
    v_listing.id, v_variant.id, v_listing.seller_user_id, null, v_email, v_name,
    v_phone, trim(coalesce(p_note, '')), v_variant.sale_unit_type, v_variant.label, p_unit_count,
    case when v_variant.sale_unit_type = 'package' then p_unit_count else null end,
    v_variant.unit_price_including_vat, v_weight, v_gross, v_listing.vat_rate,
    v_net, v_vat, 0.03, round(v_net * 0.03, 2)
  ) returning * into v_order;

  update public.consumer_listing_variants
  set available_units = available_units - p_unit_count,
      updated_at = now()
  where id = v_variant.id;

  if not exists (
    select 1 from public.consumer_listing_variants
    where listing_id = v_listing.id and available_units > 0
  ) then
    update public.consumer_listings
    set status = 'sold_out', updated_at = now()
    where id = v_listing.id;
  end if;

  return v_order;
end;
$$;

revoke all on function public.reserve_consumer_listing_guest(uuid, uuid, integer, text, text, text, text) from public;
grant execute on function public.reserve_consumer_listing_guest(uuid, uuid, integer, text, text, text, text) to service_role;
