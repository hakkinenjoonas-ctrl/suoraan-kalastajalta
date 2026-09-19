create or replace function public.validate_consumer_listing_seller_details()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles;
begin
  select * into v_profile from public.profiles where id = new.seller_user_id;
  if not found
    or nullif(trim(coalesce(v_profile.company_name, '')), '') is null
    or nullif(trim(coalesce(v_profile.business_id, '')), '') is null
    or nullif(trim(coalesce(v_profile.address, '')), '') is null
    or nullif(trim(coalesce(v_profile.postcode, '')), '') is null
    or nullif(trim(coalesce(v_profile.city, '')), '') is null
    or nullif(trim(coalesce(v_profile.contact_email, v_profile.email, '')), '') is null
    or nullif(trim(coalesce(v_profile.phone, '')), '') is null then
    raise exception 'Täydennä yrityksen nimi, Y-tunnus, osoite, postinumero, kaupunki, sähköposti ja puhelinnumero ennen kuluttajaerän julkaisua';
  end if;
  return new;
end;
$$;

drop trigger if exists validate_consumer_listing_seller_details on public.consumer_listings;
create trigger validate_consumer_listing_seller_details
before insert or update of seller_user_id, status
on public.consumer_listings
for each row
when (new.status = 'published')
execute function public.validate_consumer_listing_seller_details();

