-- 20260823000011_booking_legs.sql
--
-- The dispatchable unit (ADR-006, D-11): one row for a one-way trip, two (leg_seq 1/2,
-- direction outbound/return) for a return -- never a `bookings.return_at` column and never two
-- bookings. Assignment (chauffeur, vehicle) lives HERE, not on `bookings` (D-13, supersedes
-- GSD-LAUNCH's `bookings.assigned_chauffeur_id`, ADR-014 §2 Q3).
--
-- OPS-03's exclusion constraints are forward-designed correct on day one: two independent
-- partial EXCLUDE USING gist constraints over a STORED generated tstzrange, never one combined
-- constraint (which would only block the exact chauffeur+vehicle PAIR recurring, not either
-- resource double-booked with a different partner) and never a live settings join (a generated
-- column cannot subquery another table -- D-14 snapshots the buffer by trigger instead).

create table public.booking_legs (
  id                    uuid primary key default extensions.gen_random_uuid(),
  booking_id            uuid not null references public.bookings(id) on delete restrict,
  leg_seq               smallint not null check (leg_seq in (1,2)),
  direction             leg_direction not null,

  pickup_text           text not null,
  pickup_place_id       text,
  pickup_lat            numeric(9,6),
  pickup_lng            numeric(9,6),
  dropoff_text          text not null,
  dropoff_place_id      text,
  dropoff_lat           numeric(9,6),
  dropoff_lng           numeric(9,6),
  origin_zone_id        uuid references public.service_zones(id) on delete set null,
  dest_zone_id          uuid references public.service_zones(id) on delete set null,

  scheduled_at          timestamptz not null,   -- entered as Europe/Zurich wall clock, converted at the edge
  -- 'YYYY-MM-DDTHH:MM', the fact the customer agreed to. DST-proof for audit: recomputing
  -- "was this 23:10?" from a UTC instant months later, after a DST transition, is a bug this
  -- column exists to prevent.
  scheduled_local       text not null,
  flight_no             text,
  vehicle_class_id      uuid not null references public.vehicle_classes(id) on delete restrict,
  pax                   smallint not null default 1 check (pax between 1 and 16),
  bags                  smallint not null default 0 check (bags between 0 and 16),
  status                booking_status not null default 'quote',

  assigned_chauffeur_id uuid references public.chauffeurs(id) on delete restrict,
  assigned_vehicle_id   uuid references public.vehicles(id)   on delete restrict,

  -- Snapshotted, never joined live. A generated column cannot subquery another table, and
  -- QUOTE-05's rule applies anyway: a later settings change must not silently recompute a
  -- historical leg's exclusion range (D-14).
  estimated_duration_minutes integer check (estimated_duration_minutes >= 0),
  turnaround_buffer_minutes  integer check (turnaround_buffer_minutes  >= 0),

  -- STORED explicitly (D-28): PG17 has no VIRTUAL, PG18 defaults to VIRTUAL. Correct on both.
  --
  -- greatest(…, 30) on the duration is not a fudge, it is the difference between a constraint
  -- and a no-op. tstzrange(t, t, '[)') is the EMPTY range, and && is false for an empty range
  -- against everything -- so a leg with no duration and no buffer would be accepted against any
  -- other leg, silently, with no error anywhere. The 30-minute floor means the worst case of an
  -- unestimated leg is under-blocking by a bounded amount rather than not blocking at all; the
  -- booking_legs_assignable CHECK below is what stops it happening on an ASSIGNED leg at all.
  --
  -- DEVIATION (Rule 1, bug fix): the draft's literal `scheduled_at + (...) * interval '1
  -- minute'` fails CREATE TABLE with `42P17 generation expression is not immutable` --
  -- `timestamptz_pl_interval` (the `+` operator between timestamptz and interval) is STABLE,
  -- not IMMUTABLE, because Postgres can't tell at parse time that an interval built purely from
  -- minutes carries no month/day component needing timezone-aware calendar math. The fix
  -- reroutes the same arithmetic through `timezone('UTC', ...)` on both sides: converting a
  -- timestamptz to/from a naive timestamp IN A FIXED, DST-FREE ZONE is IMMUTABLE
  -- (`timestamptz -> timestamp` and `timestamp -> timestamptz` overloads of `timezone(text,
  -- ...)` both are), and `timestamp + interval` (`timestamp_pl_interval`) is IMMUTABLE too. The
  -- result is bit-for-bit the same instant as the draft's expression -- pure duration addition
  -- has no DST ambiguity regardless of which zone the arithmetic is nominally performed in.
  scheduled_range tstzrange generated always as (
    tstzrange(
      scheduled_at,
      timezone('UTC', timezone('UTC', scheduled_at)
        + (greatest(coalesce(estimated_duration_minutes, 0), 30)
           + coalesce(turnaround_buffer_minutes, 0)) * interval '1 minute'),
      '[)'
    )
  ) stored,

  note        text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  unique (booking_id, leg_seq),

  -- OPS-03 is only real if the range is real. A leg taken over the phone (OPS-04, U22) or
  -- created during a Mapbox outage has no duration estimate; a ZRH->Zermatt run is ~3h, and a
  -- leg whose range is just the turnaround buffer lets dispatch put the same driver on a 09:00
  -- Zermatt transfer and a 09:40 airport pickup with the constraint reporting no conflict.
  -- Refuse the assignment instead: dispatch must enter a duration.
  constraint booking_legs_assignable check (
    (assigned_chauffeur_id is null and assigned_vehicle_id is null)
    or (estimated_duration_minutes is not null and estimated_duration_minutes > 0
        and turnaround_buffer_minutes is not null)
  ),
  constraint booking_legs_range_nonempty check (
    (assigned_chauffeur_id is null and assigned_vehicle_id is null)
    or not isempty(scheduled_range)
  )
);
comment on table public.booking_legs is 'The dispatchable unit: one row one-way, two for a return. Own driver, vehicle, time, flight and status (ADR-006, D-11).';

create index booking_legs_booking   on public.booking_legs (booking_id, leg_seq);
create index booking_legs_schedule  on public.booking_legs (scheduled_at)
  where status not in ('cancelled','no_show');
create index booking_legs_chauffeur on public.booking_legs (assigned_chauffeur_id, scheduled_at)
  where assigned_chauffeur_id is not null;

-- DEFERRABLE INITIALLY IMMEDIATE: checked per statement by default, so ordinary assignment
-- still fails fast with 23P01 -- but a transaction that ends in a legal state may ask for the
-- check to be postponed to COMMIT with `set constraints … deferred`. Two Phase 8/9 paths need
-- that and would otherwise be impossible: swapping two overlapping legs between drivers A and
-- B (the first UPDATE raises even though the final state is legal), and LIFE-06's flight-delay
-- shift, which moves `scheduled_at` into a later assignment's window and must report a
-- conflict, not hard-fail the delay handler mid-way. U17 (what a deferred violation looks like
-- to a dispatcher) is owned by Phase 8/9; Phase 2 ships the constraint correct on day one.
alter table public.booking_legs
  add constraint booking_legs_chauffeur_no_overlap
  exclude using gist (assigned_chauffeur_id with =, scheduled_range with &&)
  where (assigned_chauffeur_id is not null and status not in ('cancelled','no_show'))
  deferrable initially immediate;

alter table public.booking_legs
  add constraint booking_legs_vehicle_no_overlap
  exclude using gist (assigned_vehicle_id with =, scheduled_range with &&)
  where (assigned_vehicle_id is not null and status not in ('cancelled','no_show'))
  deferrable initially immediate;

-- Snapshot the buffer the first time EITHER resource is assigned. Firing on the chauffeur
-- column alone leaves a vehicle-only assignment with a NULL buffer, and a vehicle can be
-- double-booked just as expensively as a driver (D-14).
--
-- F-20: `set search_path = ''` -- the draft omits it on this one function while every other
-- function in this migration set pins it; it is SECURITY INVOKER and already schema-qualifies
-- its one table read (`public.settings`), so this is convention repair rather than a live
-- privilege escalation, but F-13's previously un-revoked CREATE on schema public (closed in
-- ...002_roles_and_helpers.sql) is exactly what makes an unpinned search_path worth closing.
create or replace function public.tg_leg_snapshot_buffer()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (new.assigned_chauffeur_id is not null or new.assigned_vehicle_id is not null)
     and new.turnaround_buffer_minutes is null then
    select greatest(chauffeur_turnaround_minutes, 1) into new.turnaround_buffer_minutes
      from public.settings where id = 1;
  end if;
  return new;
end $$;

revoke all on function public.tg_leg_snapshot_buffer() from public;

create trigger booking_legs_snapshot_buffer
  before insert or update of assigned_chauffeur_id, assigned_vehicle_id on public.booking_legs
  for each row execute function public.tg_leg_snapshot_buffer();
