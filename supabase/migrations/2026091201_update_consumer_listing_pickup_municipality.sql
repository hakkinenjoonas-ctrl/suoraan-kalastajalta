create or replace function public.update_consumer_listing(
  p_listing_id uuid,
  p_product_name text,
  p_description text,
  p_municipality text,
  p_pickup_location text,
  p_pickup_start timestamptz,
  p_pickup_end timestamptz,
  p_order_deadline timestamptz,
  p_variants jsonb,
  p_payment_methods text[]
) returns public.consumer_listings
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_listing public.consumer_listings;
  v_municipality text := btrim(coalesce(p_municipality, ''));
begin
  if v_municipality = '' then
    raise exception 'Valitse noutopaikan paikkakunta';
  end if;

  v_listing := public.update_consumer_listing(
    p_listing_id,
    p_product_name,
    p_description,
    p_pickup_location,
    p_pickup_start,
    p_pickup_end,
    p_order_deadline,
    p_variants,
    p_payment_methods
  );

  update public.consumer_listings
  set municipality = v_municipality,
      updated_at = now()
  where id = p_listing_id
    and seller_user_id = auth.uid()
  returning * into v_listing;

  if v_listing.id is null then
    raise exception 'Kuluttajaerää ei löytynyt';
  end if;

  return v_listing;
end;
$$;

revoke all on function public.update_consumer_listing(uuid, text, text, text, text, timestamptz, timestamptz, timestamptz, jsonb, text[]) from public;
grant execute on function public.update_consumer_listing(uuid, text, text, text, text, timestamptz, timestamptz, timestamptz, jsonb, text[]) to authenticated;
