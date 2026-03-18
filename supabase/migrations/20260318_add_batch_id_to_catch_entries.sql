alter table public.catch_entries
add column if not exists batch_id text;

create index if not exists catch_entries_batch_id_idx
on public.catch_entries (batch_id);
