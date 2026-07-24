alter table public.auctions
add column if not exists completion_notified_at timestamptz;

-- Do not send new notifications for auctions that ended before this feature was installed.
update public.auctions
set completion_notified_at = coalesce(finalized_at, clock_timestamp())
where finalized_at is not null and completion_notified_at is null;

create or replace function public.claim_auction_completion_notifications()
returns table (
  auction_id uuid,
  auction_status text,
  seller_user_id uuid,
  winning_buyer_id uuid,
  resulting_buyer_offer_id uuid,
  batch_id text,
  species text,
  total_kilos numeric,
  final_price_per_kg numeric
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required';
  end if;

  return query
  with claimed as (
    select a.id
    from public.auctions a
    where a.status in ('sold', 'unsold', 'cancelled')
      and a.finalized_at is not null
      and a.completion_notified_at is null
    order by a.finalized_at
    for update skip locked
    limit 100
  ), updated as (
    update public.auctions a
    set completion_notified_at = clock_timestamp(), updated_at = clock_timestamp()
    from claimed c
    where a.id = c.id and a.completion_notified_at is null
    returning a.*
  )
  select
    u.id,
    u.status,
    u.seller_user_id,
    u.winning_buyer_id,
    u.resulting_buyer_offer_id,
    u.batch_id,
    u.species,
    u.total_kilos,
    u.current_price_per_kg
  from updated u;
end;
$$;

revoke all on function public.claim_auction_completion_notifications() from public;
grant execute on function public.claim_auction_completion_notifications() to service_role;
