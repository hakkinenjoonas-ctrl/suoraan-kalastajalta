create table if not exists public.processed_batch_sources (
  id uuid primary key default gen_random_uuid(),
  processed_batch_id uuid not null references public.processed_batches(id) on delete cascade,
  source_entry_id uuid references public.catch_entries(id) on delete set null,
  source_batch_id text not null,
  source_species text,
  source_kilos numeric,
  created_at timestamptz not null default now()
);

create unique index if not exists processed_batch_sources_unique_idx
on public.processed_batch_sources (processed_batch_id, source_batch_id);

create index if not exists processed_batch_sources_processed_batch_id_idx
on public.processed_batch_sources (processed_batch_id);

create index if not exists processed_batch_sources_source_batch_id_idx
on public.processed_batch_sources (source_batch_id);
