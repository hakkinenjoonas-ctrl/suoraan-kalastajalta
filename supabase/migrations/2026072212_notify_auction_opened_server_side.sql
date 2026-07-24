-- Send auction-opening pushes from the database so every auction creation path
-- behaves identically, including older client versions.
create extension if not exists pg_net with schema extensions;

create or replace function public.notify_auction_opened_server_side()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_buyer record;
  v_quantity numeric;
  v_unit text;
  v_body text;
begin
  v_quantity := coalesce(new.total_quantity, new.total_kilos, 0);
  v_unit := coalesce(nullif(new.quantity_unit, ''), 'kg');
  v_body := coalesce(nullif(new.species, ''), 'Kalaerä') || ' · '
    || trim(to_char(v_quantity, 'FM999999990.999')) || ' ' || v_unit
    || '. Huutokauppa on nyt käynnissä.';

  for v_buyer in
    select b.id, b.email
    from public.buyers b
    where coalesce(b.is_active, true)
      and public.auction_buyer_is_eligible(new.id, b.id)
  loop
    perform net.http_post(
      url := 'https://exuqgemipmaqdkficlfn.supabase.co/functions/v1/send-push-notification',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object(
        'targetBuyerId', v_buyer.id,
        'targetBuyerEmail', lower(coalesce(v_buyer.email, '')),
        'title', 'Uusi kalahuutokauppa',
        'body', v_body,
        'eventType', 'auction_opened',
        'data', jsonb_build_object(
          'route', 'auctions',
          'offerId', '',
          'batchId', coalesce(new.batch_id, '')
        )
      )
    );
  end loop;

  return new;
exception when others then
  -- Auction creation must never fail only because push delivery is temporarily unavailable.
  raise warning 'Auction opening notification enqueue failed for auction %: %', new.id, sqlerrm;
  return new;
end;
$$;

drop trigger if exists notify_auction_opened_server_side on public.auctions;
create trigger notify_auction_opened_server_side
after insert on public.auctions
for each row execute function public.notify_auction_opened_server_side();

revoke all on function public.notify_auction_opened_server_side() from public;

