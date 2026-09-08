-- Consumer commission is earned from ordered fish and is fixed when the
-- reservation is created. Final weighing updates the consumer's payable total,
-- net trade value and VAT, but it must not change the commission afterwards.
create or replace function public.seller_update_consumer_order(
  p_order_id uuid, p_status text, p_final_weight_kg numeric default null
) returns public.consumer_orders language plpgsql security definer set search_path = public, auth as $$
declare
  v_user_id uuid := auth.uid(); v_order public.consumer_orders; v_variant public.consumer_listing_variants;
  v_gross numeric(10,2); v_net numeric(10,2);
begin
  if v_user_id is null then raise exception 'Kirjautuminen vaaditaan'; end if;
  if p_status not in ('confirmed', 'ready', 'collected', 'cancelled') then raise exception 'Virheellinen tila'; end if;
  select * into v_order from public.consumer_orders where id = p_order_id for update;
  if not found or v_order.seller_user_id <> v_user_id then raise exception 'Tilausta ei löytynyt tai siihen ei ole oikeutta'; end if;
  if v_order.status in ('collected', 'cancelled', 'expired') then raise exception 'Päättynyttä tilausta ei voi muuttaa'; end if;
  if p_status = 'cancelled' then
    update public.consumer_listing_variants set available_units = available_units + v_order.unit_count, updated_at = now()
      where id = v_order.variant_id;
    update public.consumer_listings set status = 'published', updated_at = now()
      where id = v_order.listing_id and status = 'sold_out';
  elsif p_status = 'collected' and v_order.sale_unit_type = 'whole_fish' then
    if p_final_weight_kg is null or p_final_weight_kg <= 0 then raise exception 'Punnittu lopullinen paino vaaditaan'; end if;
    select * into v_variant from public.consumer_listing_variants where id = v_order.variant_id;
    v_gross := round(p_final_weight_kg * v_variant.price_per_kg_including_vat, 2);
    v_net := round(v_gross / (1 + v_order.vat_rate), 2);
    update public.consumer_orders set final_weight_kg = p_final_weight_kg, total_including_vat = v_gross,
      net_trade_value = v_net, vat_amount = v_gross - v_net
      where id = v_order.id;
  end if;
  update public.consumer_orders set status = p_status, updated_at = now()
    where id = v_order.id returning * into v_order;
  return v_order;
end;
$$;

revoke all on function public.seller_update_consumer_order(uuid, text, numeric) from public;
grant execute on function public.seller_update_consumer_order(uuid, text, numeric) to authenticated;
