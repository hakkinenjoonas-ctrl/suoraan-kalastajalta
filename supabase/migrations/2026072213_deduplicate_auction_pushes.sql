-- Prevent an older client and the new database trigger from sending the same
-- auction-opening notification twice to the same buyer.
create table if not exists public.push_notification_dedup (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  event_key text not null,
  target_key text not null,
  created_at timestamptz not null default now(),
  unique (event_type, event_key, target_key)
);

create index if not exists push_notification_dedup_created_at_idx
on public.push_notification_dedup (created_at);

alter table public.push_notification_dedup enable row level security;
revoke all on public.push_notification_dedup from anon, authenticated;

