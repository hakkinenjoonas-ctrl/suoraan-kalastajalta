alter table public.profiles
add column if not exists fisher_premium_admin_enabled boolean not null default false,
add column if not exists google_play_subscription_status text,
add column if not exists google_play_subscription_product_id text,
add column if not exists google_play_subscription_purchase_token text,
add column if not exists google_play_subscription_order_id text,
add column if not exists google_play_subscription_expires_at timestamptz,
add column if not exists google_play_subscription_verified_at timestamptz;

-- Preserve licenses that were granted manually before Google Play billing existed.
update public.profiles
set fisher_premium_admin_enabled = true
where fisher_premium_enabled = true
  and fisher_premium_admin_enabled = false;

create or replace function public.protect_profile_premium_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Service-role writes are used by the purchase-verification Edge Function.
  -- Owners may grant a manual license; ordinary users may never edit entitlement data.
  if auth.role() = 'authenticated' and not public.is_owner() then
    if tg_op = 'INSERT' then
      if coalesce(new.fisher_premium_enabled, false)
        or coalesce(new.fisher_premium_admin_enabled, false)
        or new.google_play_subscription_status is not null
        or new.google_play_subscription_product_id is not null
        or new.google_play_subscription_purchase_token is not null
        or new.google_play_subscription_order_id is not null
        or new.google_play_subscription_expires_at is not null
        or new.google_play_subscription_verified_at is not null then
        raise exception 'Premium entitlement fields can only be set by an owner or the billing service';
      end if;
      return new;
    end if;
    if new.fisher_premium_enabled is distinct from old.fisher_premium_enabled
      or new.fisher_premium_admin_enabled is distinct from old.fisher_premium_admin_enabled
      or new.google_play_subscription_status is distinct from old.google_play_subscription_status
      or new.google_play_subscription_product_id is distinct from old.google_play_subscription_product_id
      or new.google_play_subscription_purchase_token is distinct from old.google_play_subscription_purchase_token
      or new.google_play_subscription_order_id is distinct from old.google_play_subscription_order_id
      or new.google_play_subscription_expires_at is distinct from old.google_play_subscription_expires_at
      or new.google_play_subscription_verified_at is distinct from old.google_play_subscription_verified_at then
      raise exception 'Premium entitlement fields can only be changed by an owner or the billing service';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_profile_premium_fields on public.profiles;
create trigger protect_profile_premium_fields
before insert or update on public.profiles
for each row execute function public.protect_profile_premium_fields();

create or replace function public.has_fisher_premium(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = target_user_id
      and (
        coalesce(fisher_premium_admin_enabled, false)
        or (
          google_play_subscription_status in (
            'SUBSCRIPTION_STATE_ACTIVE',
            'SUBSCRIPTION_STATE_IN_GRACE_PERIOD',
            'SUBSCRIPTION_STATE_CANCELED'
          )
          and google_play_subscription_expires_at > now()
        )
      )
  );
$$;

drop policy if exists buyer_offers_insert_owner_or_seller on public.buyer_offers;
create policy buyer_offers_insert_owner_or_premium_seller
on public.buyer_offers
for insert
to authenticated
with check (
  public.is_owner()
  or (
    seller_user_id = auth.uid()
    and public.has_fisher_premium(auth.uid())
  )
);

create or replace function public.guard_catch_entry_premium_sale_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_owner() or public.has_fisher_premium(new.owner_user_id) then
    return new;
  end if;
  if coalesce(new.offer_to_shops, false)
    or coalesce(new.offer_to_restaurants, false)
    or coalesce(new.offer_to_wholesalers, false)
    or coalesce(new.delivery_possible, false) then
    raise exception 'An active Fisher Premium subscription is required for selling catch lots';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_catch_entry_premium_sale_fields on public.catch_entries;
create trigger guard_catch_entry_premium_sale_fields
before insert or update on public.catch_entries
for each row execute function public.guard_catch_entry_premium_sale_fields();

create unique index if not exists profiles_google_play_purchase_token_unique
on public.profiles (google_play_subscription_purchase_token)
where google_play_subscription_purchase_token is not null;
