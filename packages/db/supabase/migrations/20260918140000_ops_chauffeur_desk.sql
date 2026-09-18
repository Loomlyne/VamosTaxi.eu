-- 20260918140000_ops_chauffeur_desk.sql
--
-- Phase 17 chauffeur desk: Zurich shift window, leave ranges, Morning/Night
-- seats. Git only until owner apply (do not db push from CI). Keep
-- chauffeurs.status as a derived column the Worker writes after dutyStatus.
-- Do not edit 20260823000005_fleet.sql.

alter table public.chauffeurs
  add column if not exists shift_weekdays smallint[] not null default '{}'::smallint[],
  add column if not exists shift_start time,
  add column if not exists shift_end time,
  add column if not exists shift_tz text not null default 'Europe/Zurich';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'chauffeurs_shift_weekdays_iso'
  ) then
    alter table public.chauffeurs
      add constraint chauffeurs_shift_weekdays_iso
      check (shift_weekdays <@ array[1,2,3,4,5,6,7]::smallint[]);
  end if;
end $$;

create unique index if not exists chauffeurs_email_lower_uidx
  on public.chauffeurs (lower(email))
  where email is not null and length(trim(email)) > 0;

create table if not exists public.chauffeur_leave_ranges (
  id uuid primary key default extensions.gen_random_uuid(),
  chauffeur_id uuid not null references public.chauffeurs(id) on delete cascade,
  from_date date not null,
  until_date date not null,
  check (until_date >= from_date)
);

create index if not exists chauffeur_leave_ranges_chauffeur_idx
  on public.chauffeur_leave_ranges (chauffeur_id, from_date);

create table if not exists public.vehicle_seats (
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  seat text not null check (seat in ('morning', 'night')),
  chauffeur_id uuid not null references public.chauffeurs(id) on delete cascade,
  primary key (vehicle_id, seat),
  unique (chauffeur_id)
);

comment on table public.chauffeur_leave_ranges is
  'Inclusive Zurich civil-date leave. Leave wins over the shift window.';
comment on table public.vehicle_seats is
  'A plate has Morning and Night only. Third assign is refused in the Worker.';

-- Backfill seats from default_vehicle_id: 1st created → morning, 2nd → night.
insert into public.vehicle_seats (vehicle_id, seat, chauffeur_id)
select default_vehicle_id,
       case when rn = 1 then 'morning' else 'night' end,
       id
from (
  select
    id,
    default_vehicle_id,
    row_number() over (
      partition by default_vehicle_id
      order by created_at, id
    ) as rn
  from public.chauffeurs
  where default_vehicle_id is not null
) ranked
where rn <= 2
on conflict do nothing;

-- Third+ chauffeurs on the same plate become unpaired. Do not invent a third seat.
update public.chauffeurs c
set default_vehicle_id = null
where c.id in (
  select id
  from (
    select
      id,
      row_number() over (
        partition by default_vehicle_id
        order by created_at, id
      ) as rn
    from public.chauffeurs
    where default_vehicle_id is not null
  ) ranked
  where rn >= 3
);
