alter table public.catch_entries
add column if not exists offer_restricted boolean not null default false;

comment on column public.catch_entries.offer_restricted is
'True when the lot is offered only to explicitly selected buyers.';
