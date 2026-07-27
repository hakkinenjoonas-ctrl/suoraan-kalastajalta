alter table public.catch_entries
add column if not exists ices_subdivision text,
add column if not exists statistical_rectangle text,
add column if not exists marine_gear_code text,
add column if not exists marine_gear_name text,
add column if not exists vessel_length_class text,
add column if not exists fishing_day_id text,
add column if not exists released_catch_details text,
add column if not exists incidental_bycatch_details text,
add column if not exists lost_gear_details text;

alter table public.catch_entries
drop constraint if exists catch_entries_ices_subdivision_check;

alter table public.catch_entries
add constraint catch_entries_ices_subdivision_check
check (ices_subdivision in ('29', '30', '31', '32') or ices_subdivision is null);

alter table public.catch_entries
drop constraint if exists catch_entries_vessel_length_class_check;

alter table public.catch_entries
add constraint catch_entries_vessel_length_class_check
check (vessel_length_class in ('under_10m', 'at_least_10m', 'without_vessel') or vessel_length_class is null);

create index if not exists catch_entries_coastal_report_idx
on public.catch_entries (owner_user_id, date, ices_subdivision)
where water_type = 'meri';

create index if not exists catch_entries_fishing_day_id_idx
on public.catch_entries (fishing_day_id)
where fishing_day_id is not null;
