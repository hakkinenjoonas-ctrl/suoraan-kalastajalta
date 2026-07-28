alter table public.profiles
add column if not exists fisher_premium_pilot_expires_at timestamptz;

-- Every fisher participating in the closed pilot can use Premium through
-- 31 December 2026, independently of accelerated Google Play test renewals.
update public.profiles
set fisher_premium_pilot_expires_at = timestamp with time zone '2027-01-01 00:00:00+02'
where role = 'member'
  and (
    fisher_premium_pilot_expires_at is null
    or fisher_premium_pilot_expires_at < timestamp with time zone '2027-01-01 00:00:00+02'
  );

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
        or new.fisher_premium_pilot_expires_at is not null
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
      or new.fisher_premium_pilot_expires_at is distinct from old.fisher_premium_pilot_expires_at
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

create or replace function public.grant_pilot_premium_to_member()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.role = 'member'
    and new.fisher_premium_pilot_expires_at is null
    and now() < timestamp with time zone '2027-01-01 00:00:00+02' then
    new.fisher_premium_pilot_expires_at := timestamp with time zone '2027-01-01 00:00:00+02';
  end if;
  return new;
end;
$$;

drop trigger if exists zz_grant_pilot_premium_to_member on public.profiles;
create trigger zz_grant_pilot_premium_to_member
before insert or update of role on public.profiles
for each row execute function public.grant_pilot_premium_to_member();

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
      )
  );
$$;
