create table if not exists public.app_push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  buyer_id uuid references public.buyers(id) on delete cascade,
  role text,
  platform text not null default 'android',
  token text not null unique,
  device_label text,
  is_active boolean not null default true,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists app_push_tokens_user_id_idx
  on public.app_push_tokens(user_id);

create index if not exists app_push_tokens_buyer_id_idx
  on public.app_push_tokens(buyer_id);

create index if not exists app_push_tokens_active_idx
  on public.app_push_tokens(is_active);

create or replace function public.set_app_push_tokens_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_app_push_tokens_updated_at on public.app_push_tokens;

create trigger set_app_push_tokens_updated_at
before update on public.app_push_tokens
for each row
execute function public.set_app_push_tokens_updated_at();

alter table public.app_push_tokens enable row level security;

drop policy if exists "Users can view own push tokens" on public.app_push_tokens;
create policy "Users can view own push tokens"
on public.app_push_tokens
for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own push tokens" on public.app_push_tokens;
create policy "Users can insert own push tokens"
on public.app_push_tokens
for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update own push tokens" on public.app_push_tokens;
create policy "Users can update own push tokens"
on public.app_push_tokens
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

