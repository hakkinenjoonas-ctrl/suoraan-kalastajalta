-- Tell the leading bidder why an auction ended without a sale when the hidden
-- reserve price was not met. The reserve amount itself is not disclosed.
create extension if not exists pg_net with schema extensions;

create or replace function public.notify_auction_reserve_not_met_bidder()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_buyer_id uuid;
  v_quantity numeric;
  v_unit text;
begin
  if old.status is not distinct from new.status
     or new.status <> 'unsold'
     or new.highest_bid_id is null
     or new.reserve_price_per_kg is null
     or new.current_price_per_kg >= new.reserve_price_per_kg then
    return new;
  end if;

  select b.buyer_id into v_buyer_id
  from public.auction_bids b
  where b.id = new.highest_bid_id;

  if v_buyer_id is null then return new; end if;

  v_quantity := coalesce(new.total_quantity, new.total_kilos, 0);
  v_unit := coalesce(nullif(new.quantity_unit, ''), 'kg');

  perform net.http_post(
    url := 'https://exuqgemipmaqdkficlfn.supabase.co/functions/v1/send-push-notification',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object(
      'targetBuyerId', v_buyer_id,
      'title', 'Huutokauppa päättyi ilman kauppaa',
      'body', coalesce(nullif(new.species, ''), 'Kalaerä') || ' · '
        || trim(to_char(v_quantity, 'FM999999990.999')) || ' ' || v_unit
        || '. Korkein huutosi ' || trim(to_char(new.current_price_per_kg, 'FM999999990.00')) || ' €/' || v_unit
        || ' ei saavuttanut myyjän asettamaa pohjahintaa, joten kauppaa ei syntynyt.',
      'eventType', 'auction_reserve_not_met',
      'data', jsonb_build_object(
        'route', 'auctions',
        'offerId', '',
        'batchId', coalesce(new.batch_id, '')
      )
    )
  );

  return new;
exception when others then
  -- Auction finalization must not fail solely because push queueing is unavailable.
  raise warning 'Reserve-not-met notification enqueue failed for auction %: %', new.id, sqlerrm;
  return new;
end;
$$;

drop trigger if exists notify_auction_reserve_not_met_bidder on public.auctions;
create trigger notify_auction_reserve_not_met_bidder
after update of status on public.auctions
for each row execute function public.notify_auction_reserve_not_met_bidder();

revoke all on function public.notify_auction_reserve_not_met_bidder() from public;
