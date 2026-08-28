-- 20260825000008_flight_provenance.sql
--
-- D-20: two provenance columns on booking_legs so Phase 9 (LIFE-06) has something to shift,
-- and an eighteenth booking_events kind so "we looked" is distinct from "it moved".
--
-- Written from the verified LOCK inside Phase 7's checkout transaction, never from a client
-- body and never by a trigger — a provenance column a client can set is not provenance.
--
-- Negative space:
--   - no CHF amount (D-46)
--   - no function body, so no search_path = '' DECLARE-block types to schema-qualify
--   - no timestamptz + interval in an IMMUTABLE context
--   - no booking_legs append-only whitelist to extend: 20260823000019_append_only.sql
--     attaches tg_append_only to price_snapshots, price_snapshot_legs, booking_events,
--     booking_refunds, audit_log, consent_log, settings_versions — not booking_legs.
--     booking_legs is a mutable working table; Phase 9's delay shift UPDATEs it, including
--     these two columns, without a column whitelist. Asserted by reading ...019, not assumed.
--
-- Timestamp: `supabase migration new flight_provenance` produced 20260828134247 (sorts after
-- 20260825000007). Renamed to the reserved Phase-4 ordinal 08 (packages/db/README.md). D-38
-- forbids inventing a timestamp; it does not forbid placing a CLI-generated file into the
-- ordinal the phase DAG already reserved.

-- ---------------------------------------------------------------------------
-- booking_legs.flight_checked_at (D-20)
-- ---------------------------------------------------------------------------
alter table public.booking_legs
  add column flight_checked_at timestamptz;

comment on column public.booking_legs.flight_checked_at is
  'D-20: when we last verified the landing time. Written from the verified LOCK inside Phase 7 checkout, never from a client body and never by a trigger. Nullable, no default — a provenance column a client can set is not provenance.';

-- ---------------------------------------------------------------------------
-- booking_legs.flight_time_source (D-20)
-- ---------------------------------------------------------------------------
-- CHECK, not an enum, matching booking_events.kind's own reasoning: the vocabulary may grow
-- (Phase 9 does not add a fourth source, but renaming an enum label is painful and this is
-- not an oversight).
alter table public.booking_legs
  add column flight_time_source text
  constraint booking_legs_flight_time_source_check
  check (flight_time_source in ('scheduled', 'estimated', 'actual'));

comment on column public.booking_legs.flight_time_source is
  'D-20: landing_source copied from the lock (scheduled / estimated / actual). CHECK not enum — same reason as booking_events.kind. Paired with flight_checked_at.';

-- ---------------------------------------------------------------------------
-- Paired constraint (D-20)
-- ---------------------------------------------------------------------------
-- Both provenance columns are NULL or both are set. A non-NULL flight_time_source also
-- requires a non-NULL flight_no. This is the row it refuses: a leg claiming an `actual`
-- landing time for no flight at all.
alter table public.booking_legs
  add constraint booking_legs_flight_provenance_pair
  check (
    (flight_checked_at is null and flight_time_source is null)
    or (
      flight_checked_at is not null
      and flight_time_source is not null
      and flight_no is not null
    )
  );

comment on constraint booking_legs_flight_provenance_pair on public.booking_legs is
  'D-20: flight_checked_at and flight_time_source are both NULL or both set; a non-NULL source requires flight_no. Refuses a leg claiming an actual landing time for no flight at all.';

-- ---------------------------------------------------------------------------
-- booking_events.kind — drop and recreate with all 17 landed values plus flight.autofilled
-- ---------------------------------------------------------------------------
-- The constraint is a CHECK, not an enum, precisely so this addition is a drop-and-recreate
-- rather than an ALTER TYPE. Write all eighteen out; no regex, no NOT IN shortcut.
--
-- flight.autofilled (THIS PLAN, D-20) records that we looked.
-- flight.delayed (Phase 9, LIFE-06) records that it moved.
-- They are distinct on purpose.
alter table public.booking_events
  drop constraint booking_events_kind_check;

alter table public.booking_events
  add constraint booking_events_kind_check
  check (kind in (
    'booking.created',
    'booking.status_changed',
    'booking.modified',
    'booking.claimed',
    'price.quoted',
    'price.repriced',
    'price.superseded',
    'payment.intent_created',
    'payment.succeeded',
    'payment.failed',
    'refund.requested',
    'refund.issued',
    'assignment.chauffeur_set',
    'assignment.vehicle_set',
    'assignment.cleared',
    'flight.delayed',
    'note.added',
    'flight.autofilled'
  ));

comment on constraint booking_events_kind_check on public.booking_events is
  'Eighteen kinds. flight.autofilled (D-20) is distinct from flight.delayed (LIFE-06): one records that we looked, the other that it moved.';
