-- settlement_rpcs.test.sql
--
-- Proves plan 07-03: settlement RPCs are vamos_system-only, insert-first dedupe,
-- stripe_created ordering (D-14), pending→paid→confirmed (D-15), one-success,
-- claim-then-send + sweep (D-17/D-19/U18). Synthetic figures, rolled back at the
-- end of this file -- never a real CHF amount (D-34).
begin;
select plan(94);

-- Fixtures --------------------------------------------------------------------------------
insert into public.vehicle_classes (slug, passenger_capacity, luggage_capacity)
values ('first', 3, 3);

insert into public.rate_versions (slug, label)
values ('settle-rv', 'Settlement RPC live fixture');

-- Synthetic figures, rolled back at the end of this file -- never a real CHF amount (D-34).
insert into public.distance_rates (
  rate_version_id, vehicle_class_id, max_pax, base_fare_rappen, per_km_rappen, min_fare_rappen
)
select rv.id, vc.id, 3, 1, 2, 3
  from public.rate_versions rv, public.vehicle_classes vc
 where rv.slug = 'settle-rv'
   and vc.slug = 'first';

update public.rate_versions set status = 'live' where slug = 'settle-rv';

create temporary table settle_fx as
select
  vc.id as vehicle_class_id,
  rv.id as rate_version_id,
  sv.id as settings_version_id,
  now() + interval '45 minutes' as lock_exp,
  now() + interval '30 days' as token_expires_at,
  jsonb_build_object(
    'cancellation_tiers', '[]'::jsonb,
    'free_cancel_hours', 24,
    'airport_waiting_minutes', 60,
    'city_waiting_minutes', 15,
    'settings_version_id', sv.id,
    'modification_deadline_hours', 24,
    'min_advance_minutes', 180,
    'policy_doc', 'settle-rpc'
  ) as policy,
  jsonb_build_array(jsonb_build_object(
    'seq', 1, 'code', 'distance_fare', 'kind', 'fare',
    'i18n_key', 'price.line.distance', 'amount_rappen', 6
  )) as lines,
  jsonb_build_array(jsonb_build_object(
    'leg_seq', 1,
    'direction', 'outbound',
    'pickup_text', 'ZRH Airport',
    'pickup_place_id', null,
    'pickup_lat', 47.458056,
    'pickup_lng', 8.549167,
    'dropoff_text', 'Zurich HB',
    'dropoff_place_id', null,
    'dropoff_lat', 47.378177,
    'dropoff_lng', 8.540192,
    'scheduled_at', (now() + interval '3 days')::text,
    'scheduled_local', to_char(now() + interval '3 days', 'YYYY-MM-DD"T"HH24:MI'),
    'flight_no', null,
    'vehicle_class_id', vc.id,
    'pax', 1,
    'bags', 0,
    'estimated_duration_minutes', 25,
    'duration_min', 25,
    'distance_km', 12.5,
    'leg_subtotal_rappen', 6,
    'booking_leg_id', null
  )) as legs
from public.vehicle_classes vc
join public.rate_versions rv on rv.slug = 'settle-rv'
join public.settings_versions sv on sv.slug = 'launch-baseline'
where vc.slug = 'first';
grant select on settle_fx to public;

create function pg_temp.settle_snapshot()
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'vehicle_class_id', fx.vehicle_class_id,
    'rate_version_id', fx.rate_version_id,
    'settings_version_id', fx.settings_version_id,
    'engine_version', 'quote-engine@settle-rpc',
    'lock_exp', fx.lock_exp,
    'pax', 1,
    'bags', 0,
    'lines', fx.lines,
    'policy', fx.policy,
    'shown_alternatives', '[]'::jsonb,
    'display_currency', 'CHF',
    'source', 'web',
    'subtotal_rappen', 6,
    'surcharges_rappen', 0,
    'discount_rappen', 0,
    'total_rappen', 6,
    'distance_km', 12.5,
    'duration_min', 25
  )
  from settle_fx fx
$$;
grant execute on function pg_temp.settle_snapshot() to public;

create function pg_temp.settle_book(
  p_quote_id uuid,
  p_key text,
  p_pi text,
  p_cs text,
  p_hash bytea
)
returns table (
  booking_id uuid,
  reference text,
  snapshot_id bigint,
  payment_id bigint,
  replayed boolean
)
language sql
volatile
as $$
  select *
    from public.checkout_create_booking(
      p_quote_id => p_quote_id,
      p_idempotency_key => p_key,
      p_contact => jsonb_build_object(
        'contact_name', 'Settle RPC Guest',
        'contact_email', 'settle-rpc@example.test',
        'contact_phone', '+417****7082'
      ),
      p_locale => 'en',
      p_display_currency => 'CHF',
      p_snapshot => pg_temp.settle_snapshot(),
      p_legs => (select legs from settle_fx),
      p_coupon_id => null,
      p_coupon_code => null,
      p_manage_token_hash => p_hash,
      p_manage_token_expires_at => (select token_expires_at from settle_fx),
      p_stripe_payment_intent_id => p_pi,
      p_stripe_checkout_session_id => p_cs,
      p_charged_rappen => 6,
      p_actor_customer_id => null
    )
$$;
grant execute on function pg_temp.settle_book(uuid, text, text, text, bytea) to public;

-- Grants (one assertion per function/role pair) --------------------------------
select function_privs_are('public', 'stripe_event_record', '{text,text,timestamptz,text,jsonb}'::text[], 'anon', '{}'::text[], 'stripe_event_record: anon holds no EXECUTE');
select function_privs_are('public', 'stripe_event_record', '{text,text,timestamptz,text,jsonb}'::text[], 'authenticated', '{}'::text[], 'stripe_event_record: authenticated holds no EXECUTE');
select function_privs_are('public', 'stripe_event_record', '{text,text,timestamptz,text,jsonb}'::text[], 'vamos_staff', '{}'::text[], 'stripe_event_record: vamos_staff holds no EXECUTE');
select function_privs_are('public', 'stripe_event_record', '{text,text,timestamptz,text,jsonb}'::text[], 'vamos_guest', '{}'::text[], 'stripe_event_record: vamos_guest holds no EXECUTE');
select function_privs_are('public', 'stripe_event_record', '{text,text,timestamptz,text,jsonb}'::text[], 'vamos_public', '{}'::text[], 'stripe_event_record: vamos_public holds no EXECUTE');
select function_privs_are('public', 'stripe_event_record', '{text,text,timestamptz,text,jsonb}'::text[], 'vamos_system', '{EXECUTE}'::text[], 'stripe_event_record: vamos_system holds EXECUTE');

select function_privs_are('public', 'stripe_event_begin', '{text,text[],timestamptz}'::text[], 'anon', '{}'::text[], 'stripe_event_begin: anon holds no EXECUTE');
select function_privs_are('public', 'stripe_event_begin', '{text,text[],timestamptz}'::text[], 'authenticated', '{}'::text[], 'stripe_event_begin: authenticated holds no EXECUTE');
select function_privs_are('public', 'stripe_event_begin', '{text,text[],timestamptz}'::text[], 'vamos_staff', '{}'::text[], 'stripe_event_begin: vamos_staff holds no EXECUTE');
select function_privs_are('public', 'stripe_event_begin', '{text,text[],timestamptz}'::text[], 'vamos_guest', '{}'::text[], 'stripe_event_begin: vamos_guest holds no EXECUTE');
select function_privs_are('public', 'stripe_event_begin', '{text,text[],timestamptz}'::text[], 'vamos_public', '{}'::text[], 'stripe_event_begin: vamos_public holds no EXECUTE');
select function_privs_are('public', 'stripe_event_begin', '{text,text[],timestamptz}'::text[], 'vamos_system', '{EXECUTE}'::text[], 'stripe_event_begin: vamos_system holds EXECUTE');

select function_privs_are('public', 'stripe_event_settle', '{text,text}'::text[], 'anon', '{}'::text[], 'stripe_event_settle: anon holds no EXECUTE');
select function_privs_are('public', 'stripe_event_settle', '{text,text}'::text[], 'authenticated', '{}'::text[], 'stripe_event_settle: authenticated holds no EXECUTE');
select function_privs_are('public', 'stripe_event_settle', '{text,text}'::text[], 'vamos_staff', '{}'::text[], 'stripe_event_settle: vamos_staff holds no EXECUTE');
select function_privs_are('public', 'stripe_event_settle', '{text,text}'::text[], 'vamos_guest', '{}'::text[], 'stripe_event_settle: vamos_guest holds no EXECUTE');
select function_privs_are('public', 'stripe_event_settle', '{text,text}'::text[], 'vamos_public', '{}'::text[], 'stripe_event_settle: vamos_public holds no EXECUTE');
select function_privs_are('public', 'stripe_event_settle', '{text,text}'::text[], 'vamos_system', '{EXECUTE}'::text[], 'stripe_event_settle: vamos_system holds EXECUTE');

select function_privs_are('public', 'checkout_payment_settle', '{text,text,text,text,text,numeric,text,timestamptz,int8,text}'::text[], 'anon', '{}'::text[], 'checkout_payment_settle: anon holds no EXECUTE');
select function_privs_are('public', 'checkout_payment_settle', '{text,text,text,text,text,numeric,text,timestamptz,int8,text}'::text[], 'authenticated', '{}'::text[], 'checkout_payment_settle: authenticated holds no EXECUTE');
select function_privs_are('public', 'checkout_payment_settle', '{text,text,text,text,text,numeric,text,timestamptz,int8,text}'::text[], 'vamos_staff', '{}'::text[], 'checkout_payment_settle: vamos_staff holds no EXECUTE');
select function_privs_are('public', 'checkout_payment_settle', '{text,text,text,text,text,numeric,text,timestamptz,int8,text}'::text[], 'vamos_guest', '{}'::text[], 'checkout_payment_settle: vamos_guest holds no EXECUTE');
select function_privs_are('public', 'checkout_payment_settle', '{text,text,text,text,text,numeric,text,timestamptz,int8,text}'::text[], 'vamos_public', '{}'::text[], 'checkout_payment_settle: vamos_public holds no EXECUTE');
select function_privs_are('public', 'checkout_payment_settle', '{text,text,text,text,text,numeric,text,timestamptz,int8,text}'::text[], 'vamos_system', '{EXECUTE}'::text[], 'checkout_payment_settle: vamos_system holds EXECUTE');

select function_privs_are('public', 'notification_claim', '{uuid,text,uuid,text,text,text}'::text[], 'anon', '{}'::text[], 'notification_claim: anon holds no EXECUTE');
select function_privs_are('public', 'notification_claim', '{uuid,text,uuid,text,text,text}'::text[], 'authenticated', '{}'::text[], 'notification_claim: authenticated holds no EXECUTE');
select function_privs_are('public', 'notification_claim', '{uuid,text,uuid,text,text,text}'::text[], 'vamos_staff', '{}'::text[], 'notification_claim: vamos_staff holds no EXECUTE');
select function_privs_are('public', 'notification_claim', '{uuid,text,uuid,text,text,text}'::text[], 'vamos_guest', '{}'::text[], 'notification_claim: vamos_guest holds no EXECUTE');
select function_privs_are('public', 'notification_claim', '{uuid,text,uuid,text,text,text}'::text[], 'vamos_public', '{}'::text[], 'notification_claim: vamos_public holds no EXECUTE');
select function_privs_are('public', 'notification_claim', '{uuid,text,uuid,text,text,text}'::text[], 'vamos_system', '{EXECUTE}'::text[], 'notification_claim: vamos_system holds EXECUTE');

select function_privs_are('public', 'notification_settle', '{int8,text,text}'::text[], 'anon', '{}'::text[], 'notification_settle: anon holds no EXECUTE');
select function_privs_are('public', 'notification_settle', '{int8,text,text}'::text[], 'authenticated', '{}'::text[], 'notification_settle: authenticated holds no EXECUTE');
select function_privs_are('public', 'notification_settle', '{int8,text,text}'::text[], 'vamos_staff', '{}'::text[], 'notification_settle: vamos_staff holds no EXECUTE');
select function_privs_are('public', 'notification_settle', '{int8,text,text}'::text[], 'vamos_guest', '{}'::text[], 'notification_settle: vamos_guest holds no EXECUTE');
select function_privs_are('public', 'notification_settle', '{int8,text,text}'::text[], 'vamos_public', '{}'::text[], 'notification_settle: vamos_public holds no EXECUTE');
select function_privs_are('public', 'notification_settle', '{int8,text,text}'::text[], 'vamos_system', '{EXECUTE}'::text[], 'notification_settle: vamos_system holds EXECUTE');

select function_privs_are('public', 'notification_sweep', '{interval,text[]}'::text[], 'anon', '{}'::text[], 'notification_sweep: anon holds no EXECUTE');
select function_privs_are('public', 'notification_sweep', '{interval,text[]}'::text[], 'authenticated', '{}'::text[], 'notification_sweep: authenticated holds no EXECUTE');
select function_privs_are('public', 'notification_sweep', '{interval,text[]}'::text[], 'vamos_staff', '{}'::text[], 'notification_sweep: vamos_staff holds no EXECUTE');
select function_privs_are('public', 'notification_sweep', '{interval,text[]}'::text[], 'vamos_guest', '{}'::text[], 'notification_sweep: vamos_guest holds no EXECUTE');
select function_privs_are('public', 'notification_sweep', '{interval,text[]}'::text[], 'vamos_public', '{}'::text[], 'notification_sweep: vamos_public holds no EXECUTE');
select function_privs_are('public', 'notification_sweep', '{interval,text[]}'::text[], 'vamos_system', '{EXECUTE}'::text[], 'notification_sweep: vamos_system holds EXECUTE');

-- Happy booking via shipped RPC ------------------------------------------------
create temporary table settle_out (
  booking_id uuid,
  reference text,
  snapshot_id bigint,
  payment_id bigint,
  replayed boolean
);
grant all on settle_out to public;

set local role vamos_checkout;
select lives_ok(
  $$
    insert into settle_out
    select * from pg_temp.settle_book(
      '00000000-0000-4000-8000-000000000201'::uuid,
      'settle-rpc-happy',
      'pi_settle_happy',
      'cs_settle_happy',
      decode(repeat('21', 32), 'hex')
    )
  $$,
  'checkout_create_booking as vamos_checkout for settle fixture'
);
reset role;

-- Dedupe (PAY-05) --------------------------------------------------------------
set local role vamos_system;
select is(
  public.stripe_event_record(
    'evt_settle_dedupe',
    'checkout.session.completed',
    timestamptz '2026-08-25 10:00:00+00',
    'cs_settle_happy',
    '{}'::jsonb
  ),
  true,
  'stripe_event_record returns true on first call'
);
select is(
  public.stripe_event_record(
    'evt_settle_dedupe',
    'checkout.session.completed',
    timestamptz '2026-08-25 10:00:00+00',
    'cs_settle_happy',
    '{}'::jsonb
  ),
  false,
  'stripe_event_record returns false on identical second call'
);
reset role;

select is(
  (select count(*)::bigint from public.stripe_events where id = 'evt_settle_dedupe'),
  1::bigint,
  'stripe_events count stays 1 after duplicate record'
);

-- Settlement (D-15) ------------------------------------------------------------
create temporary table settle_begin1 as
  select * from public.stripe_event_begin(
    'evt_settle_dedupe',
    array['cs_settle_happy', 'pi_settle_happy']::text[],
    timestamptz '2026-08-25 10:00:00+00'
  );
grant all on settle_begin1 to public;

select is((select should_process from settle_begin1), true, 'stripe_event_begin first succeeded event is ok');
select is((select reason from settle_begin1), 'ok', 'stripe_event_begin first succeeded reason is ok');

create temporary table settle_pay as
  select * from public.checkout_payment_settle(
    'evt_settle_dedupe',
    'cs_settle_happy',
    'pi_settle_happy',
    'succeeded',
    'CHF',
    null,
    null,
    null,
    null
  );
grant all on settle_pay to public;

select is((select already_settled from settle_pay), false, 'first checkout_payment_settle already_settled is false');
select is(
  (select bp.status from public.booking_payments bp join settle_out o on o.payment_id = bp.id),
  'succeeded',
  'payment status is succeeded'
);
select ok(
  (select bp.captured_at is not null from public.booking_payments bp join settle_out o on o.payment_id = bp.id),
  'captured_at is set on success'
);
select is(
  (select b.status::text from public.bookings b join settle_out o on o.booking_id = b.id),
  'confirmed',
  'bookings.status is confirmed'
);
select is(
  (select bl.status::text
     from public.booking_legs bl
     join settle_out o on o.booking_id = bl.booking_id),
  'confirmed',
  'booking_legs.status is confirmed'
);
select ok(
  (select exists (
     select 1 from public.booking_events e
     join settle_out o on o.booking_id = e.booking_id
     where e.kind = 'payment.succeeded' and e.payment_id = o.payment_id
  )),
  'payment.succeeded event written'
);
select is(
  (select count(*)::bigint from public.booking_events e
    join settle_out o on o.booking_id = e.booking_id
   where e.kind = 'booking.status_changed'),
  2::bigint,
  'two booking.status_changed events (pending→paid, paid→confirmed)'
);
select ok(
  (select exists (
     select 1 from public.booking_events e
     join settle_out o on o.booking_id = e.booking_id
     where e.kind = 'booking.status_changed'
       and e.from_status = 'pending' and e.to_status = 'paid'
  )),
  'status_changed pending → paid has both statuses'
);
select ok(
  (select exists (
     select 1 from public.booking_events e
     join settle_out o on o.booking_id = e.booking_id
     where e.kind = 'booking.status_changed'
       and e.from_status = 'paid' and e.to_status = 'confirmed'
  )),
  'status_changed paid → confirmed has both statuses'
);
select ok(
  (select processed_at is not null from public.stripe_events where id = 'evt_settle_dedupe'),
  'stripe_events.processed_at set in the same transaction'
);

create temporary table settle_event_count as
  select count(*)::bigint as n
    from public.booking_events e
    join settle_out o on o.booking_id = e.booking_id;
grant all on settle_event_count to public;

create temporary table settle_pay2 as
  select * from public.checkout_payment_settle(
    'evt_settle_dedupe',
    'cs_settle_happy',
    'pi_settle_happy',
    'succeeded',
    'CHF',
    null, null, null, null
  );
grant all on settle_pay2 to public;

select is((select already_settled from settle_pay2), true, 'second identical settle returns already_settled true');
select is(
  (select count(*)::bigint from public.booking_events e
    join settle_out o on o.booking_id = e.booking_id),
  (select n from settle_event_count),
  'already_settled changes nothing (booking_events count unchanged)'
);

-- Ordering (D-14) --------------------------------------------------------------
select is(
  public.stripe_event_record(
    'evt_settle_canceled_old',
    'checkout.session.async_payment_failed',
    timestamptz '2026-08-25 09:00:00+00',
    'pi_settle_happy',
    '{}'::jsonb
  ),
  true,
  'record older canceled event'
);

create temporary table settle_begin_old as
  select * from public.stripe_event_begin(
    'evt_settle_canceled_old',
    array['cs_settle_happy', 'pi_settle_happy']::text[],
    timestamptz '2026-08-25 09:00:00+00'
  );
grant all on settle_begin_old to public;

select is((select should_process from settle_begin_old), false, 'out-of-order canceled should_process is false');
select is((select reason from settle_begin_old), 'superseded', 'out-of-order canceled reason is superseded');
select is(
  (select b.status::text from public.bookings b join settle_out o on o.booking_id = b.id),
  'confirmed',
  'booking stays confirmed after superseded canceled'
);

select is(
  public.stripe_event_record(
    'evt_settle_later',
    'checkout.session.completed',
    timestamptz '2026-08-25 11:00:00+00',
    'cs_settle_happy',
    '{}'::jsonb
  ),
  true,
  'record later event'
);

create temporary table settle_begin_later as
  select * from public.stripe_event_begin(
    'evt_settle_later',
    array['cs_settle_happy', 'pi_settle_happy']::text[],
    timestamptz '2026-08-25 11:00:00+00'
  );
grant all on settle_begin_later to public;

select is((select should_process from settle_begin_later), true, 'later event after earlier processed one should_process is true');

create temporary table settle_begin_later2 as
  select * from public.stripe_event_begin(
    'evt_settle_later',
    array['cs_settle_happy', 'pi_settle_happy']::text[],
    timestamptz '2026-08-25 11:00:00+00'
  );
grant all on settle_begin_later2 to public;

select is(
  (select attempts from public.stripe_events where id = 'evt_settle_later'),
  2,
  'two stripe_event_begin calls leave attempts = 2'
);

-- FX (D-11 end-to-end) ---------------------------------------------------------
create temporary table settle_fx_out (
  booking_id uuid,
  reference text,
  snapshot_id bigint,
  payment_id bigint,
  replayed boolean
);
grant all on settle_fx_out to public;

set local role vamos_checkout;
select lives_ok(
  $$
    insert into settle_fx_out
    select * from pg_temp.settle_book(
      '00000000-0000-4000-8000-000000000202'::uuid,
      'settle-rpc-fx',
      'pi_settle_fx',
      'cs_settle_fx',
      decode(repeat('22', 32), 'hex')
    )
  $$,
  'checkout_create_booking for FX fixture'
);
reset role;

select is(
  public.stripe_event_record(
    'evt_settle_fx',
    'checkout.session.completed',
    timestamptz '2026-08-25 12:00:00+00',
    'cs_settle_fx',
    '{}'::jsonb
  ),
  true,
  'record FX settlement event'
);

select lives_ok(
  $$
    select public.checkout_payment_settle(
      'evt_settle_fx',
      'cs_settle_fx',
      'pi_settle_fx',
      'succeeded',
      'EUR',
      0.92,
      'stripe',
      timestamptz '2026-08-25 12:00:00+00',
      7
    )
  $$,
  'settle succeeded with EUR plus FX quadruple'
);

select is(
  (select bp.charged_rappen from public.booking_payments bp join settle_fx_out o on o.payment_id = bp.id),
  6::public.rappen,
  'EUR settlement leaves charged_rappen untouched'
);
select is(
  (select bp.charged_currency from public.booking_payments bp join settle_fx_out o on o.payment_id = bp.id),
  'EUR',
  'charged_currency is EUR'
);
select is(
  (select bp.fx_rate from public.booking_payments bp join settle_fx_out o on o.payment_id = bp.id),
  0.92::numeric,
  'fx_rate populated'
);
select is(
  (select bp.fx_source from public.booking_payments bp join settle_fx_out o on o.payment_id = bp.id),
  'stripe',
  'fx_source populated'
);
select ok(
  (select bp.fx_quoted_at is not null from public.booking_payments bp join settle_fx_out o on o.payment_id = bp.id),
  'fx_quoted_at populated'
);
select is(
  (select bp.presentment_amount_minor from public.booking_payments bp join settle_fx_out o on o.payment_id = bp.id),
  7::bigint,
  'presentment_amount_minor populated'
);

create temporary table settle_fx_once (
  booking_id uuid,
  reference text,
  snapshot_id bigint,
  payment_id bigint,
  replayed boolean
);
grant all on settle_fx_once to public;

set local role vamos_checkout;
select lives_ok(
  $$
    insert into settle_fx_once
    select * from pg_temp.settle_book(
      '00000000-0000-4000-8000-000000000203'::uuid,
      'settle-rpc-fx-once',
      'pi_settle_fx_once',
      'cs_settle_fx_once',
      decode(repeat('23', 32), 'hex')
    )
  $$,
  'checkout_create_booking for FX write-once fixture'
);
reset role;

select is(
  public.stripe_event_record(
    'evt_settle_fx_fail',
    'payment_intent.payment_failed',
    timestamptz '2026-08-25 12:30:00+00',
    'pi_settle_fx_once',
    '{}'::jsonb
  ),
  true,
  'record FX write-once failed event'
);

select lives_ok(
  $$
    select public.checkout_payment_settle(
      'evt_settle_fx_fail',
      'cs_settle_fx_once',
      'pi_settle_fx_once',
      'failed',
      'EUR',
      0.92,
      'stripe',
      timestamptz '2026-08-25 12:30:00+00',
      7
    )
  $$,
  'failed settlement writes FX quadruple while status is not succeeded'
);

select throws_ok(
  $$
    select public.checkout_payment_settle(
      'evt_settle_fx_fail',
      'cs_settle_fx_once',
      'pi_settle_fx_once',
      'succeeded',
      'EUR',
      0.91,
      'stripe',
      timestamptz '2026-08-25 12:31:00+00',
      7
    )
  $$,
  '23001',
  null,
  'second settlement changing fx_rate raises restrict_violation'
);

-- One success ------------------------------------------------------------------
select lives_ok(
  $$
    insert into public.booking_payments (
      booking_id, snapshot_id, stripe_payment_intent_id, stripe_checkout_session_id,
      charged_rappen, charged_currency, status
    )
    select o.booking_id, o.snapshot_id, 'pi_settle_second', 'cs_settle_second',
           6, 'CHF', 'requires_payment'
      from settle_out o
  $$,
  'second booking_payments row for the same booking inserts while requires_payment'
);

select is(
  public.stripe_event_record(
    'evt_settle_second',
    'checkout.session.completed',
    timestamptz '2026-08-25 13:00:00+00',
    'cs_settle_second',
    '{}'::jsonb
  ),
  true,
  'record second-success event'
);

-- 26.1-02 D-22 superseded this assertion: a second succeeded charge on an
-- already-succeeded snapshot no longer raises 23505 -- it is flagged
-- duplicate (see settle_revive.test.sql for the full behaviour). Proven here
-- only as "does not raise" plus the duplicate status, so this file stays a
-- true record of checkout_payment_settle's live contract.
select lives_ok(
  $$
    select public.checkout_payment_settle(
      'evt_settle_second',
      'cs_settle_second',
      'pi_settle_second',
      'succeeded',
      'CHF',
      null, null, null, null
    )
  $$,
  'second succeeded payment on one booking never raises 23505 -- flagged duplicate instead (26.1-02 D-22)'
);
select is(
  (select status from public.booking_payments where stripe_checkout_session_id = 'cs_settle_second'),
  'duplicate',
  'second booking_payments row lands as duplicate status (26.1-02 D-22)'
);

-- Not found --------------------------------------------------------------------
select throws_ok(
  $$
    select public.checkout_payment_settle(
      'evt_missing',
      'cs_does_not_exist',
      'pi_does_not_exist',
      'succeeded',
      'CHF',
      null, null, null, null
    )
  $$,
  'P0002',
  null,
  'checkout_payment_settle against unknown session/intent raises P0002 payment_not_found'
);

-- Notifications (D-17/D-19/U18) ------------------------------------------------
select throws_ok(
  $$
    select public.notification_claim(
      (select booking_id from settle_out),
      'confirmation',
      null,
      'email',
      'en',
      'confirmation'
    )
  $$,
  '23514',
  null,
  'undated template_version confirmation raises'
);

create temporary table settle_claim as
  select public.notification_claim(
    (select booking_id from settle_out),
    'confirmation',
    null,
    'email',
    'en',
    'confirmation@2026-08-25-1'
  ) as id;
grant all on settle_claim to public;

select ok((select id is not null from settle_claim), 'notification_claim returns an id on first call');

select is(
  public.notification_claim(
    (select booking_id from settle_out),
    'confirmation',
    null,
    'email',
    'en',
    'confirmation@2026-08-25-1'
  ),
  null::bigint,
  'notification_claim returns NULL on duplicate dedupe_key'
);

select is(
  (select n.dedupe_key
     from public.booking_notifications n
     join settle_claim c on c.id = n.id),
  (select booking_id::text || ':confirmation:' from settle_out),
  'stored dedupe_key equals booking_id || '':confirmation:'' for NULL leg id'
);

-- pgTAP is one transaction: now() is stable, so created_at = now() fails
-- `created_at < now() - '0 seconds'`. Age the row so the 0-second sweep
-- (the plan's exact call) still sees it. Production calls are their own
-- transaction, so a committed claim is already strictly older than now().
update public.booking_notifications
   set created_at = created_at - interval '1 second'
 where id = (select id from settle_claim);

select is(
  (select count(*)::bigint
     from public.notification_sweep('0 seconds'::interval, array['confirmation']::text[])
    where id = (select id from settle_claim)),
  1::bigint,
  'notification_sweep returns the claimed-but-unsent row'
);

select lives_ok(
  $$
    select public.notification_settle(
      (select id from settle_claim),
      'msg_settle_1',
      null
    )
  $$,
  'notification_settle with a message id succeeds'
);

select ok(
  (select n.sent_at is not null
     from public.booking_notifications n
     join settle_claim c on c.id = n.id),
  'notification_settle sets sent_at'
);

select throws_ok(
  $$
    select public.notification_settle(
      (select id from settle_claim),
      'msg_settle_2',
      null
    )
  $$,
  '23001',
  null,
  'settling the same notification a second time raises restrict_violation'
);

select is(
  (select count(*)::bigint
     from public.notification_sweep('0 seconds'::interval, array['confirmation']::text[])
    where id = (select id from settle_claim)),
  0::bigint,
  'notification_sweep returns nothing once the row is settled'
);

select * from finish();
rollback;
