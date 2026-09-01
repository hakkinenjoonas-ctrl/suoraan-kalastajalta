alter table public.catch_entries
add column if not exists inland_gear_code text,
add column if not exists management_fishing boolean not null default false,
add column if not exists fishing_without_vessel boolean not null default false,
add column if not exists effort_only boolean not null default false,
add column if not exists gear_count text,
add column if not exists fishing_effort text,
add column if not exists fishing_secondary_value text,
add column if not exists gear_mesh_size text,
add column if not exists gear_height text,
add column if not exists gear_length text,
add column if not exists gear_width text,
add column if not exists other_gear_name text;

alter table public.catch_entries
drop constraint if exists catch_entries_inland_gear_code_check;

alter table public.catch_entries
add constraint catch_entries_inland_gear_code_check
check (
  inland_gear_code in ('1', '11', '12', '13', '18', '19', '20', '21', '22', '23')
  or inland_gear_code is null
);

create index if not exists catch_entries_inland_report_idx
on public.catch_entries (owner_user_id, date, inland_gear_code)
where water_type is distinct from 'meri';
