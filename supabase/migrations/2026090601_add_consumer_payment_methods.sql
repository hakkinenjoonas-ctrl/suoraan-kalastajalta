-- Payment methods belong to a consumer listing and are shown before reservation
-- and in the reservation confirmation. Existing listings remain readable and
-- use the application fallback until the seller selects their payment methods.
alter table public.consumer_listings
add column if not exists payment_methods text[] not null default array[]::text[];

create or replace function public.publish_consumer_listing(
  p_catch_entry_id uuid,
  p_batch_id text,
  p_species text,
  p_product_name text,
  p_description text,
  p_seller_name text,
  p_municipality text,
  p_pickup_location text,
  p_catch_date date,
  p_cold_storage boolean,
  p_pickup_start timestamptz,
  p_pickup_end timestamptz,
  p_order_deadline timestamptz,
  p_variants jsonb,
  p_payment_methods text[]
) returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_listing_id uuid;
  v_payment_methods text[];
begin
  select coalesce(array_agg(method order by first_position), array[]::text[])
  into v_payment_methods
  from (
    select btrim(value) as method, min(position) as first_position
    from unnest(coalesce(p_payment_methods, array[]::text[])) with ordinality as selected(value, position)
    group by btrim(value)
  ) normalized;

  if cardinality(v_payment_methods) < 1 then
    raise exception 'Valitse vähintään yksi maksutapa';
  end if;
  if exists (
    select 1
    from unnest(v_payment_methods) as selected_method(method)
    where method <> all(array['MobilePay', 'Korttimaksu', 'Käteinen', 'Tilisiirto', 'Lasku'])
  ) then
    raise exception 'Maksutapa ei ole sallittu';
  end if;

  v_listing_id := public.publish_consumer_listing(
    p_catch_entry_id,
    p_batch_id,
    p_species,
    p_product_name,
    p_description,
    p_seller_name,
    p_municipality,
    p_pickup_location,
    p_catch_date,
    p_cold_storage,
    p_pickup_start,
    p_pickup_end,
    p_order_deadline,
    p_variants
  );

  update public.consumer_listings
  set payment_methods = v_payment_methods,
      updated_at = now()
  where id = v_listing_id and seller_user_id = auth.uid();

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
  p_variants jsonb,
  p_payment_methods text[]
) returns public.consumer_listings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_listing public.consumer_listings;
  v_payment_methods text[];
begin
  select coalesce(array_agg(method order by first_position), array[]::text[])
  into v_payment_methods
  from (
    select btrim(value) as method, min(position) as first_position
    from unnest(coalesce(p_payment_methods, array[]::text[])) with ordinality as selected(value, position)
    group by btrim(value)
  ) normalized;

  if cardinality(v_payment_methods) < 1 then
    raise exception 'Valitse vähintään yksi maksutapa';
  end if;
  if exists (
    select 1
    from unnest(v_payment_methods) as selected_method(method)
    where method <> all(array['MobilePay', 'Korttimaksu', 'Käteinen', 'Tilisiirto', 'Lasku'])
  ) then
    raise exception 'Maksutapa ei ole sallittu';
  end if;

  v_listing := public.update_consumer_listing(
    p_listing_id,
    p_product_name,
    p_description,
    p_pickup_location,
    p_pickup_start,
    p_pickup_end,
    p_order_deadline,
    p_variants
  );

  update public.consumer_listings
  set payment_methods = v_payment_methods,
      updated_at = now()
  where id = p_listing_id and seller_user_id = auth.uid()
  returning * into v_listing;

  return v_listing;
end;
$$;

revoke all on function public.publish_consumer_listing(uuid, text, text, text, text, text, text, text, date, boolean, timestamptz, timestamptz, timestamptz, jsonb, text[]) from public;
grant execute on function public.publish_consumer_listing(uuid, text, text, text, text, text, text, text, date, boolean, timestamptz, timestamptz, timestamptz, jsonb, text[]) to authenticated;

revoke all on function public.update_consumer_listing(uuid, text, text, text, timestamptz, timestamptz, timestamptz, jsonb, text[]) from public;
grant execute on function public.update_consumer_listing(uuid, text, text, text, timestamptz, timestamptz, timestamptz, jsonb, text[]) to authenticated;
