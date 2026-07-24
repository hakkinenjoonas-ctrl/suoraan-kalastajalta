-- Queue auction completion pushes in the database transaction that finalizes
-- the auction. Delivery no longer depends on a buyer or seller keeping the app open.
create extension if not exists pg_net with schema extensions;

create or replace function public.notify_auction_completion_server_side()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_quantity numeric;
  v_unit text;
  v_route_data jsonb;
begin
  if old.status is not distinct from new.status
     or new.status not in ('sold', 'unsold', 'cancelled') then
    return new;
  end if;

  v_quantity := coalesce(new.total_quantity, new.total_kilos, 0);
  v_unit := coalesce(nullif(new.quantity_unit, ''), 'kg');
  v_route_data := jsonb_build_object(
    'route', 'auctions',
    'offerId', coalesce(new.resulting_buyer_offer_id::text, ''),
    'batchId', coalesce(new.batch_id, '')
  );

  perform net.http_post(
    url := 'https://exuqgemipmaqdkficlfn.supabase.co/functions/v1/send-push-notification',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object(
      'targetUserId', new.seller_user_id,
      'title', case when new.status = 'sold' then 'Huutokauppa päättyi kauppaan' else 'Huutokauppa päättyi' end,
      'body', coalesce(nullif(new.species, ''), 'Kalaerä') || ' · '
        || trim(to_char(v_quantity, 'FM999999990.999')) || ' ' || v_unit
        || case when new.status = 'sold'
          then ' myytiin hintaan ' || trim(to_char(new.current_price_per_kg, 'FM999999990.00')) || ' €/' || v_unit || '.'
          else ' jäi myymättä tai huutokauppa peruttiin.'
        end,
      'eventType', case when new.status = 'sold' then 'auction_sold' else 'auction_unsold' end,
      'data', v_route_data
    )
  );

  if new.status = 'sold' and new.winning_buyer_id is not null then
    perform net.http_post(
      url := 'https://exuqgemipmaqdkficlfn.supabase.co/functions/v1/send-push-notification',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object(
        'targetBuyerId', new.winning_buyer_id,
        'title', 'Voitit kalahuutokaupan',
        'body', coalesce(nullif(new.species, ''), 'Kalaerä') || ' · '
          || trim(to_char(v_quantity, 'FM999999990.999')) || ' ' || v_unit
          || ' voitettiin hinnalla ' || trim(to_char(new.current_price_per_kg, 'FM999999990.00')) || ' €/' || v_unit
          || '. Kauppa näkyy Huutokaupat-välilehdellä.',
        'eventType', 'auction_won',
        'data', v_route_data
      )
    );
  end if;

  -- Prevent the older edge-function claim path from sending the same event again.
  update public.auctions
  set completion_notified_at = clock_timestamp()
  where id = new.id and completion_notified_at is null;

  return new;
exception when others then
  -- Finalizing a trade must not fail solely because push queueing is unavailable.
  raise warning 'Auction completion notification enqueue failed for auction %: %', new.id, sqlerrm;
  return new;
end;
$$;

drop trigger if exists notify_auction_completion_server_side on public.auctions;
create trigger notify_auction_completion_server_side
after update of status on public.auctions
for each row execute function public.notify_auction_completion_server_side();

revoke all on function public.notify_auction_completion_server_side() from public;
