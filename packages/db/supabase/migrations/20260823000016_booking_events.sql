-- 20260823000016_booking_events.sql
--
-- D-17: the app-written half of the audit split. `booking_events` is written INSIDE the
-- state-change transaction, using the service-role key, never by a trigger -- a trigger sees
-- an old/new diff but cannot express *why* ("customer cancelled" and "no-show sweep cancelled"
-- both just flip `status`) and cannot see an actor for a Stripe webhook or a cron job running
-- without a JWT. It survives tampering the same way every evidence table does (four layers,
-- ...19_append_only.sql): no INSERT/UPDATE/DELETE grant for any client-facing role at all, so
-- even a compromised `admin` JWT cannot forge or delete a timeline entry. Corrections are
-- compensating events, never an edit to an existing row. Rejected write attempts (a forged
-- INSERT from a stolen key that failed a CHECK) are Logpush's job, not this table's -- <deferred>.
--
-- booking_events answers *what happened, who did it, when*; price_snapshots answers *what was
-- true* (money, ~1-2 rows/booking). booking_events never contains money -- it REFERENCES a
-- snapshot for a price event, ~10-30 rows/booking.

create table public.booking_events (
  id             bigint generated always as identity primary key,
  booking_id     uuid not null references public.bookings(id) on delete restrict,
  booking_leg_id uuid references public.booking_legs(id) on delete restrict,
  at             timestamptz not null default now(),
  -- CHECK, not an enum (D-20): event taxonomies churn most, and renaming an enum label is
  -- painful. The full drafted vocabulary, all 17 kinds.
  kind           text not null check (kind in (
                   'booking.created','booking.status_changed','booking.modified','booking.claimed',
                   'price.quoted','price.repriced','price.superseded',
                   'payment.intent_created','payment.succeeded','payment.failed',
                   'refund.requested','refund.issued',
                   'assignment.chauffeur_set','assignment.vehicle_set','assignment.cleared',
                   'flight.delayed','note.added')),
  actor_kind     text not null check (actor_kind in ('customer','guest','staff','system','stripe','cron')),
  actor_id       uuid references auth.users(id) on delete set null,
  -- Frozen at write. The timeline must still read "Sara, dispatch" after Sara's row is gone;
  -- a join to a live profile row would render blank or, worse, someone else's name.
  actor_label    text not null default '',
  snapshot_id    bigint references public.price_snapshots(id) on delete restrict,
  payment_id     bigint references public.booking_payments(id) on delete restrict,
  refund_id      bigint references public.booking_refunds(id) on delete restrict,
  from_status    booking_status,
  to_status      booking_status,
  payload        jsonb not null default '{}'::jsonb,

  -- A price event that cannot point at the price it changed is not an audit trail.
  constraint booking_events_price_has_snapshot check (
    kind not like 'price.%' or snapshot_id is not null),
  constraint booking_events_status_pair check (
    kind <> 'booking.status_changed' or (from_status is not null and to_status is not null))
);
comment on table public.booking_events is 'Append-only booking timeline: who, what, when. References a snapshot for price events; never contains money
(DATA-08, D-17). Application-written inside the state-change transaction -- no trigger, no client write policy.';

create index booking_events_timeline on public.booking_events (booking_id, at desc);
