-- Keep the original five-argument reservation function available for older app versions.
-- New clients call this overload so the name entered for this reservation is stored explicitly.
create function public.reserve_consumer_listing(
  p_listing_id uuid,
  p_variant_id uuid,
  p_unit_count integer,
  p_phone text,
  p_note text,
  p_name text
) returns public.consumer_orders
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_order public.consumer_orders;
  v_name text := trim(coalesce(p_name, ''));
begin
  if length(v_name) < 2 then
    raise exception 'Varaajan nimi vaaditaan';
  end if;

  v_order := public.reserve_consumer_listing(
    p_listing_id,
    p_variant_id,
    p_unit_count,
    p_phone,
    p_note
  );

  update public.consumer_orders
  set consumer_name = v_name,
      updated_at = now()
  where id = v_order.id
  returning * into v_order;

  return v_order;
end;
$$;

revoke all on function public.reserve_consumer_listing(uuid, uuid, integer, text, text, text) from public;
grant execute on function public.reserve_consumer_listing(uuid, uuid, integer, text, text, text) to authenticated;
