drop policy if exists consumer_listings_public_read on public.consumer_listings;

create policy consumer_listings_public_read
on public.consumer_listings
for select
to anon, authenticated
using (
  status = 'published'
  or seller_user_id = auth.uid()
  or exists (
    select 1
    from public.consumer_orders orders
    where orders.listing_id = consumer_listings.id
      and orders.consumer_user_id = auth.uid()
  )
);

comment on policy consumer_listings_public_read on public.consumer_listings is
  'Published listings are public. Sellers and consumers with an order may keep reading the listing details after publication ends.';
