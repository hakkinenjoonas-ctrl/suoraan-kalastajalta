alter table if exists public.allowed_users
  add column if not exists buyer_id uuid references public.buyers(id) on delete set null;

alter table if exists public.profiles
  add column if not exists buyer_id uuid references public.buyers(id) on delete set null;

create index if not exists allowed_users_buyer_id_idx on public.allowed_users (buyer_id);
create index if not exists profiles_buyer_id_idx on public.profiles (buyer_id);
