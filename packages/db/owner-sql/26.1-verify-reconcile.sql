-- 26.1-verify-reconcile.sql
--
-- Read-only. Owner runs in the Supabase SQL editor (plan 26.1-28). Paste the output back.
--
-- Before running: replace REPLACE_WITH_FULL_CS_TEST_SESSION_ID below with the full Checkout
-- Session id that starts cs_test_a1lyA5 (it is an id, not an amount). If you leave the
-- placeholder, section 1 returns only its count row (0).
--
-- One SELECT statement, so the SQL editor shows one result table. Every section starts
-- with a count row (row_kind = 'count'), so an empty section still shows up as 0.
--
-- Sections:
--   1 session       the booking paid through that Checkout Session, its payments and refunds
--   2 dlq           stripe_events never processed after 8 or more attempts
--   3 cancel_paid   cancelled bookings with a succeeded payment and no booking_refunds row
--   4 refund_due    payments settle marked refund-required that have no refund row:
--                   status 'duplicate' (duplicate_charge), or 'succeeded' on a test booking
--                   (test_booking). A cancelled booking with a succeeded payment
--                   (paid_after_cancel / requote_superseded) is already in section 3.
--
-- Columns returned: booking reference, booking status, pickup date (Zurich), payment id,
-- payment status, the first 3 characters of stripe_payment_intent_id (pi_ or cs_), refund
-- amount in rappen and refund reason. For dlq rows: event id, event type, attempts and the
-- first 3 characters of the Stripe object id. No names, emails, phone numbers, addresses,
-- card data, error text or payloads are selected. Nothing is changed.

with params as (
  select 'REPLACE_WITH_FULL_CS_TEST_SESSION_ID'::text as session_id
),
first_leg as (
  select distinct on (l.booking_id)
         l.booking_id,
         (l.scheduled_at at time zone 'Europe/Zurich')::date as pickup_date
    from public.booking_legs l
   order by l.booking_id, l.leg_seq
),
s1 as (
  select b.reference, b.status::text as booking_status, fl.pickup_date,
         p.id as payment_id, p.status as payment_status,
         pg_catalog.left(p.stripe_payment_intent_id, 3) as pi_prefix,
         r.refund_rappen, r.reason as refund_reason
    from params x
    join public.booking_payments p
      on p.stripe_checkout_session_id = x.session_id
      or p.stripe_payment_intent_id = x.session_id
    join public.bookings b on b.id = p.booking_id
    left join first_leg fl on fl.booking_id = b.id
    left join public.booking_refunds r on r.payment_id = p.id
),
s2 as (
  select e.id as event_id, e.type as event_type, e.attempts,
         pg_catalog.left(e.object_id, 3) as object_prefix,
         (e.received_at at time zone 'Europe/Zurich')::date as received_date
    from public.stripe_events e
   where e.processed_at is null
     and e.attempts >= 8
),
s3 as (
  select b.reference, b.status::text as booking_status, fl.pickup_date,
         p.id as payment_id, p.status as payment_status,
         pg_catalog.left(p.stripe_payment_intent_id, 3) as pi_prefix
    from public.bookings b
    join public.booking_payments p on p.booking_id = b.id and p.status = 'succeeded'
    left join first_leg fl on fl.booking_id = b.id
   where b.status = 'cancelled'
     and not exists (select 1 from public.booking_refunds r where r.booking_id = b.id)
),
s4 as (
  select b.reference, b.status::text as booking_status, fl.pickup_date,
         p.id as payment_id, p.status as payment_status,
         pg_catalog.left(p.stripe_payment_intent_id, 3) as pi_prefix,
         case when p.status = 'duplicate' then 'duplicate_charge' else 'test_booking' end as refund_due_reason
    from public.booking_payments p
    join public.bookings b on b.id = p.booking_id
    left join first_leg fl on fl.booking_id = b.id
   where (p.status = 'duplicate'
          or (p.status = 'succeeded' and b.is_test and b.status <> 'cancelled'))
     and not exists (select 1 from public.booking_refunds r where r.payment_id = p.id)
),
out_rows as (
  select 1 as sec, 0 as ord, '1 session' as section, 'count' as row_kind,
         null::text as reference, null::text as booking_status, null::date as pickup_date,
         null::bigint as payment_id, null::text as payment_status, null::text as pi_prefix,
         null::integer as refund_rappen, null::text as refund_reason,
         (select pg_catalog.count(*) from s1)::text as detail
  union all
  select 1, 1, '1 session', 'row', reference, booking_status, pickup_date, payment_id,
         payment_status, pi_prefix, refund_rappen, refund_reason, null
    from s1
  union all
  select 2, 0, '2 dlq', 'count', null, null, null, null, null, null, null, null,
         (select pg_catalog.count(*) from s2)::text
  union all
  select 2, 1, '2 dlq', 'row', event_id, null, received_date, null, null, object_prefix, null, null,
         event_type || ' attempts=' || attempts::text
    from s2
  union all
  select 3, 0, '3 cancel_paid', 'count', null, null, null, null, null, null, null, null,
         (select pg_catalog.count(*) from s3)::text
  union all
  select 3, 1, '3 cancel_paid', 'row', reference, booking_status, pickup_date, payment_id,
         payment_status, pi_prefix, null, null, 'no refund row'
    from s3
  union all
  select 4, 0, '4 refund_due', 'count', null, null, null, null, null, null, null, null,
         (select pg_catalog.count(*) from s4)::text
  union all
  select 4, 1, '4 refund_due', 'row', reference, booking_status, pickup_date, payment_id,
         payment_status, pi_prefix, null, refund_due_reason, 'no refund row'
    from s4
)
select section, row_kind, reference, booking_status, pickup_date, payment_id, payment_status,
       pi_prefix, refund_rappen, refund_reason, detail
  from out_rows
 order by sec, ord, pickup_date nulls last, reference, payment_id;
