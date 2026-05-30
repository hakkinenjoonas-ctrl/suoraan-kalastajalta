create or replace function public.cleanup_buyer_offers_on_catch_entry_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(old.batch_id, '') <> '' then
    delete from public.buyer_offers
    where seller_user_id = old.owner_user_id
      and batch_id = old.batch_id;
  else
    delete from public.buyer_offers
    where seller_user_id = old.owner_user_id
      and coalesce(area, '') = coalesce(old.area, '')
      and coalesce(spot, '') = coalesce(old.spot, '')
      and coalesce(total_kilos, 0) = coalesce(old.kilos, 0);
  end if;

  return old;
end;
$$;

drop trigger if exists cleanup_buyer_offers_on_catch_entry_delete on public.catch_entries;

create trigger cleanup_buyer_offers_on_catch_entry_delete
before delete on public.catch_entries
for each row
execute function public.cleanup_buyer_offers_on_catch_entry_delete();
