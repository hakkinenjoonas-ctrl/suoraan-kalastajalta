alter table public.profiles
add column if not exists apple_subscription_status text,
add column if not exists apple_subscription_product_id text,
add column if not exists apple_subscription_transaction_id text,
add column if not exists apple_subscription_original_transaction_id text,
add column if not exists apple_subscription_expires_at timestamptz,
add column if not exists apple_subscription_environment text,
add column if not exists apple_subscription_verified_at timestamptz;

create unique index if not exists profiles_apple_original_transaction_unique
on public.profiles (apple_subscription_original_transaction_id)
where apple_subscription_original_transaction_id is not null;

create or replace function public.protect_profile_premium_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() = 'authenticated' and not public.is_owner() then
    if tg_op = 'INSERT' then
      if coalesce(new.fisher_premium_enabled, false)
        or coalesce(new.fisher_premium_admin_enabled, false)
        or new.fisher_premium_pilot_expires_at is not null
        or new.google_play_subscription_status is not null
        or new.google_play_subscription_product_id is not null
        or new.google_play_subscription_purchase_token is not null
        or new.google_play_subscription_order_id is not null
        or new.google_play_subscription_expires_at is not null
        or new.google_play_subscription_verified_at is not null
        or new.apple_subscription_status is not null
        or new.apple_subscription_product_id is not null
        or new.apple_subscription_transaction_id is not null
        or new.apple_subscription_original_transaction_id is not null
        or new.apple_subscription_expires_at is not null
        or new.apple_subscription_environment is not null
        or new.apple_subscription_verified_at is not null then
        raise exception 'Premium entitlement fields can only be set by an owner or the billing service';
      end if;
      return new;
    end if;
    if new.fisher_premium_enabled is distinct from old.fisher_premium_enabled
      or new.fisher_premium_admin_enabled is distinct from old.fisher_premium_admin_enabled
      or new.fisher_premium_pilot_expires_at is distinct from old.fisher_premium_pilot_expires_at
      or new.google_play_subscription_status is distinct from old.google_play_subscription_status
      or new.google_play_subscription_product_id is distinct from old.google_play_subscription_product_id
      or new.google_play_subscription_purchase_token is distinct from old.google_play_subscription_purchase_token
      or new.google_play_subscription_order_id is distinct from old.google_play_subscription_order_id
      or new.google_play_subscription_expires_at is distinct from old.google_play_subscription_expires_at
      or new.google_play_subscription_verified_at is distinct from old.google_play_subscription_verified_at
      or new.apple_subscription_status is distinct from old.apple_subscription_status
      or new.apple_subscription_product_id is distinct from old.apple_subscription_product_id
      or new.apple_subscription_transaction_id is distinct from old.apple_subscription_transaction_id
      or new.apple_subscription_original_transaction_id is distinct from old.apple_subscription_original_transaction_id
      or new.apple_subscription_expires_at is distinct from old.apple_subscription_expires_at
      or new.apple_subscription_environment is distinct from old.apple_subscription_environment
      or new.apple_subscription_verified_at is distinct from old.apple_subscription_verified_at then
      raise exception 'Premium entitlement fields can only be changed by an owner or the billing service';
    end if;
  end if;
  return new;
end;
$$;

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
        or fisher_premium_pilot_expires_at > now()
        or (
          google_play_subscription_status in (
            'SUBSCRIPTION_STATE_ACTIVE',
            'SUBSCRIPTION_STATE_IN_GRACE_PERIOD',
            'SUBSCRIPTION_STATE_CANCELED'
          )
          and google_play_subscription_expires_at > now()
        )
        or (
          apple_subscription_status in ('ACTIVE', 'IN_GRACE_PERIOD')
          and apple_subscription_expires_at > now()
        )
      )
  );
$$;
