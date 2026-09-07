-- Owner billing workflow for consumer orders. Every placed consumer reservation
-- remains commissionable regardless of its later pickup/cancellation status.
alter table public.consumer_orders
  add column if not exists commission_billed_at timestamptz,
  add column if not exists commission_paid_at timestamptz,
  add column if not exists commission_month text;

update public.consumer_orders
set commission_month = to_char(created_at at time zone 'Europe/Helsinki', 'YYYY-MM')
where commission_month is null or trim(commission_month) = '';

alter table public.consumer_orders
  alter column commission_month set default to_char(now() at time zone 'Europe/Helsinki', 'YYYY-MM');

create index if not exists consumer_orders_admin_commission_idx
  on public.consumer_orders (commission_month desc, commission_status, seller_user_id);

create or replace function public.admin_list_consumer_commissions()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_rows jsonb;
begin
  if auth.uid() is null or not exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'owner' and is_active = true
  ) then
    raise exception 'Vain ylläpitäjä voi käsitellä kuluttajamyyntien provisioita';
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', orders.id,
      'reservation_group_id', orders.reservation_group_id,
      'listing_id', orders.listing_id,
      'seller_user_id', orders.seller_user_id,
      'seller_name', coalesce(nullif(profiles.company_name, ''), nullif(profiles.display_name, ''), profiles.email, listings.seller_name),
      'seller_email', profiles.email,
      'seller_billing_email', profiles.billing_email,
      'seller_business_id', profiles.business_id,
      'seller_billing_address', profiles.billing_address,
      'seller_billing_postcode', profiles.billing_postcode,
      'seller_billing_city', profiles.billing_city,
      'product_name', listings.product_name,
      'species', listings.species,
      'batch_id', listings.batch_id,
      'variant_label', orders.variant_label,
      'unit_count', orders.unit_count,
      'sale_unit_type', orders.sale_unit_type,
      'estimated_weight_kg', orders.estimated_weight_kg,
      'final_weight_kg', orders.final_weight_kg,
      'total_including_vat', orders.total_including_vat,
      'net_trade_value', orders.net_trade_value,
      'commission_rate', orders.commission_rate,
      'commission_amount', orders.commission_amount,
      'commission_status', orders.commission_status,
      'commission_month', orders.commission_month,
      'commission_billed_at', orders.commission_billed_at,
      'commission_paid_at', orders.commission_paid_at,
      'order_status', orders.status,
      'created_at', orders.created_at
    ) order by orders.created_at desc
  ), '[]'::jsonb)
  into v_rows
  from public.consumer_orders orders
  join public.consumer_listings listings on listings.id = orders.listing_id
  join public.profiles profiles on profiles.id = orders.seller_user_id;

  return v_rows;
end;
$$;

create or replace function public.admin_update_consumer_commission_status(
  p_reservation_group_id uuid,
  p_status text
) returns integer
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_count integer;
begin
  if auth.uid() is null or not exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'owner' and is_active = true
  ) then
    raise exception 'Vain ylläpitäjä voi käsitellä kuluttajamyyntien provisioita';
  end if;
  if p_status not in ('unbilled', 'invoiced', 'paid') then
    raise exception 'Virheellinen provision tila';
  end if;

  update public.consumer_orders
  set commission_status = p_status,
      commission_billed_at = case
        when p_status = 'unbilled' then null
        else coalesce(commission_billed_at, now())
      end,
      commission_paid_at = case when p_status = 'paid' then now() else null end,
      commission_month = coalesce(nullif(commission_month, ''), to_char(created_at at time zone 'Europe/Helsinki', 'YYYY-MM')),
      updated_at = now()
  where reservation_group_id = p_reservation_group_id;
  get diagnostics v_count = row_count;
  if v_count < 1 then raise exception 'Kuluttajavarausta ei löytynyt'; end if;
  return v_count;
end;
$$;

revoke all on function public.admin_list_consumer_commissions() from public;
revoke all on function public.admin_update_consumer_commission_status(uuid, text) from public;
grant execute on function public.admin_list_consumer_commissions() to authenticated;
grant execute on function public.admin_update_consumer_commission_status(uuid, text) to authenticated;
