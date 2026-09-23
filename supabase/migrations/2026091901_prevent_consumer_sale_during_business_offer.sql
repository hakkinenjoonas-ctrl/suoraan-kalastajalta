-- One catch lot may be offered through only one sales channel at a time.
-- The application also hides the consumer action, but this trigger keeps the
-- rule authoritative when an older app version or a direct RPC call is used.
create or replace function public.prevent_consumer_sale_during_business_offer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry public.catch_entries;
begin
  if new.catch_entry_id is null then
    return new;
  end if;

  select * into v_entry
  from public.catch_entries
  where id = new.catch_entry_id
  for update;

  if not found then
    raise exception 'Saaliserää ei löytynyt';
  end if;

  if coalesce(v_entry.offer_to_shops, false)
    or coalesce(v_entry.offer_to_restaurants, false)
    or coalesce(v_entry.offer_to_wholesalers, false)
    or coalesce(v_entry.offer_restricted, false) then
    raise exception 'Kalaerä on jo yritysmyynnissä. Poista yritysmyynti ennen kuluttajamyyntiä';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_consumer_sale_during_business_offer on public.consumer_listings;
create trigger prevent_consumer_sale_during_business_offer
before insert or update of catch_entry_id
on public.consumer_listings
for each row execute function public.prevent_consumer_sale_during_business_offer();
