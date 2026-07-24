-- Optional auction photos. Existing auctions and fixed-price sales remain unchanged.
alter table public.auctions
  add column if not exists image_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'auction-images',
  'auction-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists auction_images_insert_own on storage.objects;
create policy auction_images_insert_own
on storage.objects for insert to authenticated
with check (
  bucket_id = 'auction-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists auction_images_update_own on storage.objects;
create policy auction_images_update_own
on storage.objects for update to authenticated
using (
  bucket_id = 'auction-images'
  and owner_id = auth.uid()::text
)
with check (
  bucket_id = 'auction-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists auction_images_delete_own on storage.objects;
create policy auction_images_delete_own
on storage.objects for delete to authenticated
using (
  bucket_id = 'auction-images'
  and owner_id = auth.uid()::text
);

create or replace function public.set_auction_image(p_auction_id uuid, p_image_path text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Kirjautuminen vaaditaan'; end if;
  if coalesce(trim(p_image_path), '') = '' then raise exception 'Kuvan polku puuttuu'; end if;
  if split_part(p_image_path, '/', 1) <> auth.uid()::text then raise exception 'Virheellinen kuvan polku'; end if;

  update public.auctions
  set image_path = p_image_path, updated_at = clock_timestamp()
  where id = p_auction_id
    and (seller_user_id = auth.uid() or public.is_owner())
    and status in ('scheduled', 'open');

  if not found then raise exception 'Huutokauppaa ei löytynyt tai kuvaa ei voi enää muuttaa'; end if;
end;
$$;

revoke all on function public.set_auction_image(uuid, text) from public;
grant execute on function public.set_auction_image(uuid, text) to authenticated;

-- Keep the latest visibility and party-detail rules, adding only image_path.
create or replace function public.list_visible_auctions()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with me as (select public.current_auction_buyer_id() as buyer_id), visible as (
    select a.*,
      (select count(*)::integer from public.auction_bids b where b.auction_id = a.id) as bid_count,
      exists (select 1 from public.auction_bids b, me where b.id = a.highest_bid_id and b.buyer_id = me.buyer_id) as my_is_leading,
      (a.status = 'sold' and a.winning_buyer_id = (select buyer_id from me)) as my_is_winner,
      case when a.status = 'sold' and (a.seller_user_id = auth.uid() or public.is_owner()) then (
        select jsonb_build_object(
          'company_name', b.company_name, 'contact_name', b.contact_name,
          'email', b.email, 'phone', b.phone, 'business_id', b.business_id,
          'delivery_address', b.delivery_address, 'delivery_postcode', b.delivery_postcode,
          'delivery_city', b.delivery_city
        ) from public.buyers b where b.id = a.winning_buyer_id
      ) else null end as winner_details,
      case when a.status = 'sold' and a.winning_buyer_id = (select buyer_id from me) then (
        select jsonb_build_object(
          'company_name', p.company_name, 'display_name', p.display_name,
          'business_id', p.business_id, 'address', p.address, 'postcode', p.postcode,
          'city', p.city, 'contact_email', p.contact_email, 'email', p.email,
          'phone', p.phone, 'commercial_fishing_id', p.commercial_fishing_id
        ) from public.profiles p where p.id = a.seller_user_id
      ) else null end as seller_details
    from public.auctions a
    where public.is_owner() or a.seller_user_id = auth.uid()
       or (
         a.status in ('scheduled', 'open')
         and public.auction_buyer_is_eligible(a.id, (select buyer_id from me))
       )
       or exists (select 1 from public.auction_bids mine where mine.auction_id = a.id and mine.bidder_user_id = auth.uid())
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id, 'status', status, 'starts_at', starts_at, 'ends_at', ends_at, 'effective_end_at', effective_end_at,
    'starting_price_per_kg', starting_price_per_kg, 'current_price_per_kg', current_price_per_kg,
    'minimum_increment', minimum_increment, 'reserve_met', reserve_price_per_kg is null or current_price_per_kg >= reserve_price_per_kg,
    'species', species, 'total_kilos', total_kilos, 'batch_id', batch_id, 'catch_date', catch_date,
    'area', area, 'municipality', municipality, 'spot', spot, 'gear', gear, 'notes', notes, 'image_path', image_path, 'bid_count', bid_count,
    'delivery_method', delivery_method, 'delivery_area', delivery_area, 'delivery_destinations', delivery_destinations,
    'my_is_leading', my_is_leading, 'my_is_winner', my_is_winner,
    'winner_details', winner_details, 'seller_details', seller_details,
    'resulting_buyer_offer_id', case when seller_user_id = auth.uid() or public.is_owner() or my_is_winner then resulting_buyer_offer_id else null end
  ) order by case when status = 'open' then 0 else 1 end, effective_end_at desc), '[]'::jsonb) from visible;
$$;
