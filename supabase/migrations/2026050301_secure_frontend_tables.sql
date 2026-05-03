alter table if exists public.buyers enable row level security;
alter table if exists public.buyer_offers enable row level security;
alter table if exists public.processed_batches enable row level security;
alter table if exists public.processed_products enable row level security;
alter table if exists public.processed_batch_sources enable row level security;
alter table if exists public.wholesale_offers enable row level security;

drop policy if exists buyers_select_active_or_owner on public.buyers;
create policy buyers_select_active_or_owner
on public.buyers
for select
to authenticated
using (
  public.is_owner()
  or lower(coalesce(email, '')) = public.current_user_email()
  or coalesce(is_active, true)
);

drop policy if exists buyers_insert_owner_only on public.buyers;
create policy buyers_insert_owner_only
on public.buyers
for insert
to authenticated
with check (public.is_owner());

drop policy if exists buyers_update_own_details on public.buyers;
create policy buyers_update_own_details
on public.buyers
for update
to authenticated
using (
  lower(coalesce(email, '')) = public.current_user_email()
  or public.is_owner()
)
with check (
  lower(coalesce(email, '')) = public.current_user_email()
  or public.is_owner()
);

drop policy if exists buyers_delete_owner_only on public.buyers;
create policy buyers_delete_owner_only
on public.buyers
for delete
to authenticated
using (public.is_owner());

drop policy if exists buyer_offers_select_owner_seller_buyer on public.buyer_offers;
create policy buyer_offers_select_owner_seller_buyer
on public.buyer_offers
for select
to authenticated
using (
  public.is_owner()
  or seller_user_id = auth.uid()
  or lower(coalesce(buyer_email, '')) = public.current_user_email()
);

drop policy if exists buyer_offers_insert_owner_or_seller on public.buyer_offers;
create policy buyer_offers_insert_owner_or_seller
on public.buyer_offers
for insert
to authenticated
with check (
  public.is_owner()
  or seller_user_id = auth.uid()
);

drop policy if exists buyer_offers_update_owner_seller_buyer on public.buyer_offers;
create policy buyer_offers_update_owner_seller_buyer
on public.buyer_offers
for update
to authenticated
using (
  public.is_owner()
  or seller_user_id = auth.uid()
  or lower(coalesce(buyer_email, '')) = public.current_user_email()
)
with check (
  public.is_owner()
  or seller_user_id = auth.uid()
  or lower(coalesce(buyer_email, '')) = public.current_user_email()
);

drop policy if exists buyer_offers_delete_owner_or_seller on public.buyer_offers;
create policy buyer_offers_delete_owner_or_seller
on public.buyer_offers
for delete
to authenticated
using (
  public.is_owner()
  or seller_user_id = auth.uid()
);

drop policy if exists processed_batches_select_own_or_owner on public.processed_batches;
create policy processed_batches_select_own_or_owner
on public.processed_batches
for select
to authenticated
using (
  owner_user_id = auth.uid()
  or public.is_owner()
);

drop policy if exists processed_batches_insert_own_or_owner on public.processed_batches;
create policy processed_batches_insert_own_or_owner
on public.processed_batches
for insert
to authenticated
with check (
  owner_user_id = auth.uid()
  or public.is_owner()
);

drop policy if exists processed_batches_update_own_or_owner on public.processed_batches;
create policy processed_batches_update_own_or_owner
on public.processed_batches
for update
to authenticated
using (
  owner_user_id = auth.uid()
  or public.is_owner()
)
with check (
  owner_user_id = auth.uid()
  or public.is_owner()
);

drop policy if exists processed_batches_delete_own_or_owner on public.processed_batches;
create policy processed_batches_delete_own_or_owner
on public.processed_batches
for delete
to authenticated
using (
  owner_user_id = auth.uid()
  or public.is_owner()
);

drop policy if exists processed_products_select_own_or_owner on public.processed_products;
create policy processed_products_select_own_or_owner
on public.processed_products
for select
to authenticated
using (
  owner_user_id = auth.uid()
  or public.is_owner()
);

drop policy if exists processed_products_insert_own_or_owner on public.processed_products;
create policy processed_products_insert_own_or_owner
on public.processed_products
for insert
to authenticated
with check (
  owner_user_id = auth.uid()
  or public.is_owner()
);

drop policy if exists processed_products_update_own_or_owner on public.processed_products;
create policy processed_products_update_own_or_owner
on public.processed_products
for update
to authenticated
using (
  owner_user_id = auth.uid()
  or public.is_owner()
)
with check (
  owner_user_id = auth.uid()
  or public.is_owner()
);

drop policy if exists processed_products_delete_own_or_owner on public.processed_products;
create policy processed_products_delete_own_or_owner
on public.processed_products
for delete
to authenticated
using (
  owner_user_id = auth.uid()
  or public.is_owner()
);

drop policy if exists processed_batch_sources_select_own_or_owner on public.processed_batch_sources;
create policy processed_batch_sources_select_own_or_owner
on public.processed_batch_sources
for select
to authenticated
using (
  exists (
    select 1
    from public.processed_batches pb
    where pb.id = processed_batch_sources.processed_batch_id
      and (
        pb.owner_user_id = auth.uid()
        or public.is_owner()
      )
  )
);

drop policy if exists processed_batch_sources_insert_own_or_owner on public.processed_batch_sources;
create policy processed_batch_sources_insert_own_or_owner
on public.processed_batch_sources
for insert
to authenticated
with check (
  exists (
    select 1
    from public.processed_batches pb
    where pb.id = processed_batch_sources.processed_batch_id
      and (
        pb.owner_user_id = auth.uid()
        or public.is_owner()
      )
  )
);

drop policy if exists processed_batch_sources_update_own_or_owner on public.processed_batch_sources;
create policy processed_batch_sources_update_own_or_owner
on public.processed_batch_sources
for update
to authenticated
using (
  exists (
    select 1
    from public.processed_batches pb
    where pb.id = processed_batch_sources.processed_batch_id
      and (
        pb.owner_user_id = auth.uid()
        or public.is_owner()
      )
  )
)
with check (
  exists (
    select 1
    from public.processed_batches pb
    where pb.id = processed_batch_sources.processed_batch_id
      and (
        pb.owner_user_id = auth.uid()
        or public.is_owner()
      )
  )
);

drop policy if exists processed_batch_sources_delete_own_or_owner on public.processed_batch_sources;
create policy processed_batch_sources_delete_own_or_owner
on public.processed_batch_sources
for delete
to authenticated
using (
  exists (
    select 1
    from public.processed_batches pb
    where pb.id = processed_batch_sources.processed_batch_id
      and (
        pb.owner_user_id = auth.uid()
        or public.is_owner()
      )
  )
);

drop policy if exists wholesale_offers_select_own_or_owner on public.wholesale_offers;
create policy wholesale_offers_select_own_or_owner
on public.wholesale_offers
for select
to authenticated
using (
  created_by_user_id = auth.uid()
  or public.is_owner()
);

drop policy if exists wholesale_offers_insert_own_or_owner on public.wholesale_offers;
create policy wholesale_offers_insert_own_or_owner
on public.wholesale_offers
for insert
to authenticated
with check (
  created_by_user_id = auth.uid()
  or public.is_owner()
);

drop policy if exists wholesale_offers_update_own_or_owner on public.wholesale_offers;
create policy wholesale_offers_update_own_or_owner
on public.wholesale_offers
for update
to authenticated
using (
  created_by_user_id = auth.uid()
  or public.is_owner()
)
with check (
  created_by_user_id = auth.uid()
  or public.is_owner()
);

drop policy if exists wholesale_offers_delete_own_or_owner on public.wholesale_offers;
create policy wholesale_offers_delete_own_or_owner
on public.wholesale_offers
for delete
to authenticated
using (
  created_by_user_id = auth.uid()
  or public.is_owner()
);

create or replace function public.guard_buyer_offer_updates()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_owner() or new.seller_user_id = auth.uid() then
    return new;
  end if;

  if lower(coalesce(old.buyer_email, '')) = public.current_user_email() then
    if new.seller_user_id is distinct from old.seller_user_id
      or lower(coalesce(new.buyer_email, '')) is distinct from lower(coalesce(old.buyer_email, ''))
      or new.buyer_id is distinct from old.buyer_id
      or new.batch_id is distinct from old.batch_id
      or new.total_kilos is distinct from old.total_kilos
      or new.price_per_kg is distinct from old.price_per_kg
      or new.seller_name is distinct from old.seller_name
      or new.species_summary is distinct from old.species_summary
      or new.area is distinct from old.area
      or new.spot is distinct from old.spot
      or new.gear is distinct from old.gear
      or new.notes is distinct from old.notes
      or new.delivery_method is distinct from old.delivery_method
      or new.delivery_possible is distinct from old.delivery_possible
      or new.transport_mode is distinct from old.transport_mode
      or new.origin_point_id is distinct from old.origin_point_id
      or new.transport_company_id is distinct from old.transport_company_id
      or new.seller_origin_city is distinct from old.seller_origin_city
      or new.delivery_destination_city is distinct from old.delivery_destination_city
      or new.route_price_eur is distinct from old.route_price_eur
      or new.total_price_eur is distinct from old.total_price_eur
      or new.delivered_price_per_kg is distinct from old.delivered_price_per_kg
      or new.delivery_destinations is distinct from old.delivery_destinations
      or new.delivery_area is distinct from old.delivery_area
      or new.delivery_cost is distinct from old.delivery_cost
      or new.earliest_delivery_date is distinct from old.earliest_delivery_date
      or new.cold_transport is distinct from old.cold_transport
      or new.seller_business_id is distinct from old.seller_business_id
      or new.seller_address is distinct from old.seller_address
      or new.seller_postcode is distinct from old.seller_postcode
      or new.seller_city is distinct from old.seller_city
      or new.seller_contact_email is distinct from old.seller_contact_email
      or new.seller_email is distinct from old.seller_email
      or new.seller_phone is distinct from old.seller_phone
      or new.seller_commercial_fishing_id is distinct from old.seller_commercial_fishing_id
      or new.buyer_delivery_address is distinct from old.buyer_delivery_address
      or new.buyer_delivery_postcode is distinct from old.buyer_delivery_postcode
      or new.buyer_delivery_city is distinct from old.buyer_delivery_city
      or new.buyer_billing_address is distinct from old.buyer_billing_address
      or new.buyer_billing_postcode is distinct from old.buyer_billing_postcode
      or new.buyer_billing_city is distinct from old.buyer_billing_city
      or new.buyer_billing_email is distinct from old.buyer_billing_email
      or new.buyer_business_id is distinct from old.buyer_business_id
      or new.billing_status is distinct from old.billing_status
      or new.billed_at is distinct from old.billed_at
      or new.paid_at is distinct from old.paid_at
      or new.billing_month is distinct from old.billing_month
      or new.commission_rate is distinct from old.commission_rate
      or new.trade_value is distinct from old.trade_value
      or new.commission_amount is distinct from old.commission_amount
      or new.owner_commission_status is distinct from old.owner_commission_status
      or new.owner_commission_billed_at is distinct from old.owner_commission_billed_at
      or new.owner_commission_paid_at is distinct from old.owner_commission_paid_at
      or new.owner_commission_month is distinct from old.owner_commission_month
      or new.owner_commission_rate is distinct from old.owner_commission_rate
      or new.owner_trade_value is distinct from old.owner_trade_value
      or new.owner_commission_amount is distinct from old.owner_commission_amount
    then
      raise exception 'Buyer cannot modify protected offer fields';
    end if;

    if new.status not in ('viewed', 'countered', 'reserved', 'rejected', 'cancelled', old.status) then
      raise exception 'Buyer cannot set this offer status directly';
    end if;

    if new.fulfillment_status is distinct from old.fulfillment_status
      and new.fulfillment_status not in ('delivery_agreed', 'delivered', old.fulfillment_status) then
      raise exception 'Buyer cannot set this fulfillment status directly';
    end if;

    return new;
  end if;

  raise exception 'You cannot update this offer';
end;
$$;

drop trigger if exists buyer_offer_update_guard on public.buyer_offers;
create trigger buyer_offer_update_guard
before update on public.buyer_offers
for each row
execute function public.guard_buyer_offer_updates();
