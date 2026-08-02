-- Transactional auction email notifications. Email delivery is queued separately
-- so a temporary mail failure can never block opening or finalizing an auction.
create extension if not exists pg_net with schema extensions;

alter table public.buyers
  add column if not exists auction_email_enabled boolean not null default true;

create table if not exists public.auction_email_deliveries (
  id bigint generated always as identity primary key,
  auction_id uuid not null references public.auctions(id) on delete cascade,
  event_type text not null check (event_type in ('auction_opened', 'auction_sold', 'auction_unsold')),
  recipient_key text not null,
  recipient_email text not null,
  sent_at timestamptz not null default clock_timestamp(),
  unique (auction_id, event_type, recipient_key)
);

alter table public.auction_email_deliveries enable row level security;
revoke all on table public.auction_email_deliveries from anon, authenticated;

create or replace function public.queue_auction_opened_email()
returns trigger language plpgsql security definer
set search_path = public, extensions
as $$
begin
  perform net.http_post(
    url := 'https://exuqgemipmaqdkficlfn.supabase.co/functions/v1/send-auction-email',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object('auctionId', new.id, 'eventType', 'auction_opened')
  );
  return new;
exception when others then
  raise warning 'Auction opening email enqueue failed for auction %: %', new.id, sqlerrm;
  return new;
end;
$$;

drop trigger if exists queue_auction_opened_email on public.auctions;
create trigger queue_auction_opened_email
after insert on public.auctions
for each row execute function public.queue_auction_opened_email();

create or replace function public.queue_auction_completed_email()
returns trigger language plpgsql security definer
set search_path = public, extensions
as $$
begin
  if old.status is distinct from new.status
     and new.status in ('sold', 'unsold', 'cancelled') then
    perform net.http_post(
      url := 'https://exuqgemipmaqdkficlfn.supabase.co/functions/v1/send-auction-email',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object('auctionId', new.id, 'eventType', 'auction_completed')
    );
  end if;
  return new;
exception when others then
  raise warning 'Auction completion email enqueue failed for auction %: %', new.id, sqlerrm;
  return new;
end;
$$;

drop trigger if exists queue_auction_completed_email on public.auctions;
create trigger queue_auction_completed_email
after update of status on public.auctions
for each row execute function public.queue_auction_completed_email();

revoke all on function public.queue_auction_opened_email() from public;
revoke all on function public.queue_auction_completed_email() from public;
