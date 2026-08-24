-- 20260823000010_bookings.sql
--
-- The commercial record (DATA-01, DATA-03). Four GSD-LAUNCH rows are deliberately absent from
-- `bookings` below, each superseded by a Phase 2 decision (ADR-014 §2, "the four GSD-LAUNCH
-- schema conflicts, all A"):
--   `price_chf numeric`     -> price_snapshots (D-07, ADR-014 §2 Q1) -- table ships in ...013
--   `manage_token uuid`     -> booking_access_tokens (D-15, ADR-014 §2 Q2) -- ships in ...012
--   `assigned_chauffeur_id` -> booking_legs.assigned_chauffeur_id (D-13, ADR-006, ADR-014 §2 Q3)
--   `return_at`             -> a second booking_legs row, leg_seq=2 (D-11, ADR-006, ADR-014 §2 Q3)
-- This migration must not carry both shapes for any of the four.
--
-- ROLL-UP RULE for booking_status: see ...003_types.sql's comment on the enum -- Phase 2 lands
-- the vocabulary and the rule (U21), Phase 9 lands the general trigger; manage_booking_cancel
-- (...012_booking_access_tokens.sql) implements the rule inline for the one path Phase 2 ships
-- live.

-- ADR-003: VT-YY-####. The year segment partitions the numeric space, so a collision only has
-- to be checked against the current year. Digits stay because dispatchers read references
-- aloud. Enumerable by construction -- which is exactly why the manage link is a token (D-15)
-- and must never become a lookup by reference alone.
create table public.booking_reference_counters (
  year_2      smallint primary key check (year_2 between 0 and 99),
  -- Five digits, from the start. ADR-003's shape already tolerates it (the reference regex is
  -- `[0-9]{4,5}`), and a four-digit ceiling turns "the year's references are used up" into a
  -- total booking outage with no rollback: the counter advance commits in the caller's own
  -- transaction, so it cannot be undone by refusing the 10 001st call.
  last_serial integer not null default 0 check (last_serial between 0 and 99999)
);
comment on table public.booking_reference_counters is 'Per-year serial for VT-YY-#### (ADR-003, D-12). One row per calendar year (Europe/Zurich).';

/**
 * A reference is allocated by a purchase, never by a price check. Two things enforce that:
 *  - a quote no longer inserts a `bookings` row at all (price_snapshots.booking_id is
 *    nullable, ...013), so an anonymous scraper cannot consume the year's space by asking
 *    for prices;
 *  - EXECUTE is granted narrowly (see below), never to PUBLIC. A SECURITY DEFINER function is
 *    granted to PUBLIC by default, which would let any session -- anon included -- call it
 *    until the year's serial space is exhausted, permanently breaking booking creation for the
 *    rest of the calendar year (T-02-13).
 *
 * F-16: EXECUTE is granted to `service_role` AND `vamos_staff`, not `service_role` alone. A
 * column DEFAULT is evaluated as the INSERTING role, and Plan 02-08 grants `vamos_staff`
 * INSERT on `bookings` for OPS-04's phone-booking flow -- a dispatcher creating a booking
 * without an explicit `reference` would otherwise get `42501 permission denied for function
 * next_booking_reference`, and the 2 a.m. repair for that 42501 is `grant execute ... to
 * authenticated`, which re-opens the exact anonymous counter-exhaustion this revoke exists to
 * prevent. The revoke from PUBLIC and the denial for `anon`/`authenticated` are unchanged.
 */
create or replace function public.next_booking_reference() returns text
language plpgsql security definer set search_path = '' as $$
declare
  y smallint := (extract(year from (now() at time zone 'Europe/Zurich'))::int % 100);
  n integer;
begin
  insert into public.booking_reference_counters (year_2, last_serial)
  values (y, 1)
  on conflict (year_2) do update set last_serial = public.booking_reference_counters.last_serial + 1
  returning last_serial into n;

  if n > 99999 then
    raise exception 'booking reference space exhausted for year %', y
      using errcode = 'restrict_violation',
            hint = 'ADR-003 allows a wider serial within a year without changing the shape.';
  end if;
  return format('VT-%s-%s', lpad(y::text, 2, '0'), lpad(n::text, 4, '0'));
end $$;

revoke all on function public.next_booking_reference() from public;
grant execute on function public.next_booking_reference() to service_role, vamos_staff;

create table public.bookings (
  id                  uuid primary key default extensions.gen_random_uuid(),
  reference           text not null unique default public.next_booking_reference()
                        check (reference ~ '^VT-[0-9]{2}-[0-9]{4,5}$'),
  -- Nullable: a guest books without an account (PAY-03); AUTH-06 sets it on claim.
  customer_id         uuid references public.customers(id) on delete restrict,
  -- Contact details as given at booking time, so a guest booking is self-contained and a later
  -- account edit does not rewrite what the confirmation said.
  contact_name        text not null,
  contact_email       extensions.citext not null,
  contact_phone       text not null default '',
  -- PAY-05 / project constraint "idempotent payment AND booking creation". The unique on
  -- booking_payments.stripe_payment_intent_id (...014) covers the payment, not the purchase: a
  -- double-clicked checkout or a retried POST creates two bookings, two references and two
  -- PaymentIntents. Client-generated, echoed to Stripe as its Idempotency-Key (U20 -- who mints
  -- it and its lifetime is Phase 7; the unique partial index ships here).
  idempotency_key     text,
  -- One quote can become at most one booking. Cheap belt on the same failure.
  quote_id            uuid,
  is_return           boolean not null default false,
  status              booking_status not null default 'quote',
  locale              text not null default 'en' check (locale in ('en','de','fr','ar')),
  display_currency    display_currency not null default 'CHF',
  -- The authoritative price. Supersedes GSD-LAUNCH's `price_chf numeric` (D-07). Plain column
  -- until ...013_price_snapshots.sql exists and attaches the FK.
  price_snapshot_id   bigint,
  -- Denormalised CACHE for the ops board's list query (OPS-01). Maintained by a later trigger,
  -- never written by hand, never the truth -- and never a real number until the CHF matrix
  -- lands (D-34): nullable, defaults NULL. The `rappen` domain's non-negative CHECK (F-17) is
  -- the only constraint this column needs; it carries no hand-written check of its own.
  price_total_rappen  rappen,
  note                text not null default '',
  erased_at           timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
comment on table public.bookings is 'The commercial record: one per purchase, one reference, one price, one Stripe charge. Trip details live on booking_legs (ADR-006, D-11). D-19: no ON DELETE CASCADE targets this table -- it is never deleted.';

create index bookings_customer     on public.bookings (customer_id) where customer_id is not null;
create index bookings_status_time  on public.bookings (status, created_at desc);
create index bookings_reference    on public.bookings (reference);
create unique index bookings_idempotency on public.bookings (idempotency_key)
  where idempotency_key is not null;
create unique index bookings_quote       on public.bookings (quote_id)
  where quote_id is not null;
