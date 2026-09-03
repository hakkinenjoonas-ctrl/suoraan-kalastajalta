-- Isolated consumer marketplace. Nothing in this migration changes buyer_offers or auctions.
create table public.consumer_listings (
  id uuid primary key default gen_random_uuid(),
  seller_user_id uuid not null references public.profiles(id) on delete cascade,
  catch_entry_id uuid references public.catch_entries(id) on delete set null,
  batch_id text not null, species text not null, product_name text not null,
  description text not null default '', seller_name text not null,
  municipality text not null default '', pickup_location text not null, catch_date date,
  vat_rate numeric(7,5) not null default 0.135 check (vat_rate >= 0),
  image_url text not null default '', cold_storage boolean not null default true,
  pickup_start timestamptz not null, pickup_end timestamptz not null,
  order_deadline timestamptz not null,
  check (pickup_end > pickup_start),
  check (order_deadline <= pickup_start),
  status text not null default 'draft' check (status in ('draft', 'published', 'paused', 'sold_out', 'archived')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (seller_user_id, catch_entry_id)
);
create index consumer_listings_public_idx on public.consumer_listings (status, municipality, species, created_at desc);

create table public.consumer_listing_variants (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.consumer_listings(id) on delete cascade,
  sale_unit_type text not null check (sale_unit_type in ('package', 'whole_fish')),
  label text not null,
  package_size_kg numeric(10,3), unit_price_including_vat numeric(10,2),
  min_weight_kg numeric(10,3), max_weight_kg numeric(10,3), price_per_kg_including_vat numeric(10,2),
  available_units integer not null check (available_units >= 0),
  initial_units integer not null check (initial_units > 0), sort_order integer not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (
    (sale_unit_type = 'package' and package_size_kg > 0 and unit_price_including_vat > 0
      and min_weight_kg is null and max_weight_kg is null and price_per_kg_including_vat is null)
    or
    (sale_unit_type = 'whole_fish' and min_weight_kg > 0 and max_weight_kg >= min_weight_kg
      and price_per_kg_including_vat > 0 and package_size_kg is null and unit_price_including_vat is null)
  )
);
create index consumer_listing_variants_listing_idx on public.consumer_listing_variants (listing_id, sort_order);

create table public.consumer_orders (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.consumer_listings(id) on delete restrict,
  variant_id uuid not null references public.consumer_listing_variants(id) on delete restrict,
  seller_user_id uuid not null references public.profiles(id) on delete restrict,
  consumer_user_id uuid not null references auth.users(id) on delete restrict,
  consumer_email text not null, consumer_name text not null default '', consumer_phone text not null,
  consumer_note text not null default '', sale_unit_type text not null check (sale_unit_type in ('package', 'whole_fish')),
  variant_label text not null, unit_count integer not null check (unit_count > 0),
  package_count integer check (package_count is null or package_count > 0),
  package_price_including_vat numeric(10,2), estimated_weight_kg numeric(10,3) not null check (estimated_weight_kg > 0),
  final_weight_kg numeric(10,3) check (final_weight_kg is null or final_weight_kg > 0),
  total_including_vat numeric(10,2) not null, vat_rate numeric(7,5) not null,
  net_trade_value numeric(10,2) not null, vat_amount numeric(10,2) not null,
  commission_rate numeric(7,5) not null default 0.03, commission_amount numeric(10,2) not null,
  commission_status text not null default 'unbilled' check (commission_status in ('unbilled', 'invoiced', 'paid')),
  status text not null default 'reserved' check (status in ('reserved', 'confirmed', 'ready', 'collected', 'cancelled', 'expired')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index consumer_orders_consumer_idx on public.consumer_orders (consumer_user_id, created_at desc);
create index consumer_orders_seller_idx on public.consumer_orders (seller_user_id, created_at desc);
create index consumer_orders_commission_idx on public.consumer_orders (commission_status, created_at desc);

create table public.consumer_alert_subscriptions (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  species text not null default '', municipality text not null default '', is_active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (user_id, species, municipality)
);

create table public.consumer_listing_notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.consumer_listings(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  push_attempted boolean not null default false,
  push_delivered boolean not null default false,
  email_attempted boolean not null default false,
  email_delivered boolean not null default false,
  created_at timestamptz not null default now(),
  unique (listing_id, user_id)
);

alter table public.consumer_listings enable row level security;
alter table public.consumer_listing_variants enable row level security;
alter table public.consumer_orders enable row level security;
alter table public.consumer_alert_subscriptions enable row level security;
alter table public.consumer_listing_notification_deliveries enable row level security;
create policy consumer_listings_public_read on public.consumer_listings for select to anon, authenticated
  using (status = 'published' or seller_user_id = auth.uid());
create policy consumer_listings_seller_update on public.consumer_listings for update to authenticated
  using (seller_user_id = auth.uid()) with check (seller_user_id = auth.uid());
create policy consumer_variants_public_read on public.consumer_listing_variants for select to anon, authenticated
  using (exists (select 1 from public.consumer_listings listing where listing.id = listing_id
    and (listing.status = 'published' or listing.seller_user_id = auth.uid())));
create policy consumer_orders_parties_read on public.consumer_orders for select to authenticated
  using (consumer_user_id = auth.uid() or seller_user_id = auth.uid());
create policy consumer_alerts_own_all on public.consumer_alert_subscriptions for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and exists (
    select 1 from public.profiles where id = auth.uid() and role = 'consumer' and is_active = true
  ));

create function public.publish_consumer_listing(
  p_catch_entry_id uuid, p_batch_id text, p_species text, p_product_name text,
  p_description text, p_seller_name text, p_municipality text, p_pickup_location text,
  p_catch_date date, p_cold_storage boolean, p_pickup_start timestamptz,
  p_pickup_end timestamptz, p_order_deadline timestamptz, p_variants jsonb
) returns uuid language plpgsql security definer set search_path = public, auth as $$
declare
  v_user_id uuid := auth.uid(); v_listing_id uuid; v_variant jsonb;
  v_index integer := 0; v_type text; v_listing_type text; v_units integer;
  v_catch_kilos numeric := 0; v_allocated_minimum_kilos numeric := 0;
begin
  if v_user_id is null then raise exception 'Kirjautuminen vaaditaan'; end if;
  if not exists (select 1 from public.profiles where id = v_user_id and role = 'member' and is_active = true) then
    raise exception 'Vain aktiivinen kalastajatunnus voi julkaista kuluttajaerän';
  end if;
  select coalesce(kilos, 0) into v_catch_kilos from public.catch_entries
    where id = p_catch_entry_id and owner_user_id = v_user_id;
  if not found then
    raise exception 'Saaliserää ei löytynyt tai siihen ei ole oikeutta';
  end if;
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
    v_type := v_variant->>'sale_unit_type'; v_units := (v_variant->>'available_units')::integer;
    if v_type is null or v_type not in ('package', 'whole_fish') or v_units < 1 or length(trim(coalesce(v_variant->>'label', ''))) < 1 then
      raise exception 'Virheellinen myyntiyksikkö';
    end if;
    if v_listing_type is null then v_listing_type := v_type; end if;
    if v_listing_type <> v_type then raise exception 'Samassa erässä ei voi sekoittaa pakkauksia ja kokonaisia kaloja'; end if;
    insert into public.consumer_listing_variants (
      listing_id, sale_unit_type, label, package_size_kg, unit_price_including_vat,
      min_weight_kg, max_weight_kg, price_per_kg_including_vat, available_units, initial_units, sort_order
    ) values (
      v_listing_id, v_type, trim(v_variant->>'label'), nullif(v_variant->>'package_size_kg', '')::numeric,
      nullif(v_variant->>'unit_price_including_vat', '')::numeric, nullif(v_variant->>'min_weight_kg', '')::numeric,
      nullif(v_variant->>'max_weight_kg', '')::numeric, nullif(v_variant->>'price_per_kg_including_vat', '')::numeric,
      v_units, v_units, v_index
    );
    v_allocated_minimum_kilos := v_allocated_minimum_kilos + v_units * case when v_type = 'package'
      then (v_variant->>'package_size_kg')::numeric else (v_variant->>'min_weight_kg')::numeric end;
    v_index := v_index + 1;
  end loop;
  if v_allocated_minimum_kilos > v_catch_kilos + 0.001 then
    raise exception 'Kuluttajamyyntiin varattu vähimmäispaino ylittää saaliin painon';
  end if;
  return v_listing_id;
end;
$$;

create function public.reserve_consumer_listing(
  p_listing_id uuid, p_variant_id uuid, p_unit_count integer, p_phone text, p_note text default ''
) returns public.consumer_orders language plpgsql security definer set search_path = public, auth as $$
declare
  v_user_id uuid := auth.uid(); v_listing public.consumer_listings; v_variant public.consumer_listing_variants;
  v_order public.consumer_orders; v_email text; v_name text; v_weight numeric(10,3);
  v_gross numeric(10,2); v_net numeric(10,2); v_vat numeric(10,2);
begin
  if v_user_id is null then raise exception 'Kirjautuminen vaaditaan'; end if;
  if not exists (select 1 from public.profiles where id = v_user_id and role = 'consumer' and is_active = true) then
    raise exception 'Kuluttajavaraus vaatii aktiivisen kuluttajatunnuksen';
  end if;
  if p_unit_count is null or p_unit_count < 1 then raise exception 'Virheellinen kappalemäärä'; end if;
  if length(trim(coalesce(p_phone, ''))) < 5 then raise exception 'Puhelinnumero vaaditaan'; end if;
  select * into v_variant from public.consumer_listing_variants
    where id = p_variant_id and listing_id = p_listing_id for update;
  if not found then raise exception 'Myyntiyksikköä ei löytynyt'; end if;
  select * into v_listing from public.consumer_listings where id = p_listing_id for update;
  if not found or v_listing.status <> 'published' then raise exception 'Kalaerä ei ole enää myynnissä'; end if;
  if now() >= v_listing.order_deadline then raise exception 'Tämän kalaerän tilausaika on päättynyt'; end if;
  if v_variant.available_units < p_unit_count then raise exception 'Valittua määrää ei ole riittävästi jäljellä'; end if;
  select coalesce(email, ''), coalesce(raw_user_meta_data->>'display_name', '')
    into v_email, v_name from auth.users where id = v_user_id;
  v_weight := case when v_variant.sale_unit_type = 'whole_fish'
    then round(((v_variant.min_weight_kg + v_variant.max_weight_kg) / 2) * p_unit_count, 3)
    else v_variant.package_size_kg * p_unit_count end;
  v_gross := round(case when v_variant.sale_unit_type = 'whole_fish'
    then v_weight * v_variant.price_per_kg_including_vat
    else v_variant.unit_price_including_vat * p_unit_count end, 2);
  v_net := round(v_gross / (1 + v_listing.vat_rate), 2); v_vat := v_gross - v_net;
  insert into public.consumer_orders (
    listing_id, variant_id, seller_user_id, consumer_user_id, consumer_email, consumer_name,
    consumer_phone, consumer_note, sale_unit_type, variant_label, unit_count, package_count,
    package_price_including_vat, estimated_weight_kg, total_including_vat, vat_rate,
    net_trade_value, vat_amount, commission_rate, commission_amount
  ) values (
    v_listing.id, v_variant.id, v_listing.seller_user_id, v_user_id, v_email, v_name,
    trim(p_phone), trim(coalesce(p_note, '')), v_variant.sale_unit_type, v_variant.label, p_unit_count,
    case when v_variant.sale_unit_type = 'package' then p_unit_count else null end,
    v_variant.unit_price_including_vat, v_weight, v_gross, v_listing.vat_rate,
    v_net, v_vat, 0.03, round(v_net * 0.03, 2)
  ) returning * into v_order;
  update public.consumer_listing_variants set available_units = available_units - p_unit_count, updated_at = now()
    where id = v_variant.id;
  if not exists (select 1 from public.consumer_listing_variants where listing_id = v_listing.id and available_units > 0) then
    update public.consumer_listings set status = 'sold_out', updated_at = now() where id = v_listing.id;
  end if;
  return v_order;
end;
$$;

create function public.seller_update_consumer_order(
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
      net_trade_value = v_net, vat_amount = v_gross - v_net,
      commission_amount = round(v_net * commission_rate, 2) where id = v_order.id;
  end if;
  update public.consumer_orders set status = p_status, updated_at = now()
    where id = v_order.id returning * into v_order;
  return v_order;
end;
$$;

revoke all on function public.publish_consumer_listing(uuid, text, text, text, text, text, text, text, date, boolean, timestamptz, timestamptz, timestamptz, jsonb) from public;
grant execute on function public.publish_consumer_listing(uuid, text, text, text, text, text, text, text, date, boolean, timestamptz, timestamptz, timestamptz, jsonb) to authenticated;
revoke all on function public.reserve_consumer_listing(uuid, uuid, integer, text, text) from public;
grant execute on function public.reserve_consumer_listing(uuid, uuid, integer, text, text) to authenticated;
revoke all on function public.seller_update_consumer_order(uuid, text, numeric) from public;
grant execute on function public.seller_update_consumer_order(uuid, text, numeric) to authenticated;
grant select on public.consumer_listings, public.consumer_listing_variants to anon, authenticated;
grant select on public.consumer_orders to authenticated;
grant select, insert, update, delete on public.consumer_alert_subscriptions to authenticated;
revoke all on public.consumer_listing_notification_deliveries from anon, authenticated;
