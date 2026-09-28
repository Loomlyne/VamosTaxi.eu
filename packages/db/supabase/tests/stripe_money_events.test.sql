-- stripe_money_events.test.sql
--
-- Plan 26.1-08 (D-07). Proves charge.refunded and charge.dispute.* facts reach
-- the database: stripe_charge_refunded_record records a dashboard refund
-- against the exact payment row (idempotent on stripe_refund_id), never
-- records an app-tagged refund itself (26.1-05 metadata vamos_source=app)
-- so booking effects apply exactly once in either arrival order, and keeps a
-- refund on a duplicate payment off the booking's own ledger;
-- stripe_dispute_upsert keeps one booking_disputes row per dispute and never
-- lets an older event overwrite a newer status. Synthetic rappen integers
-- throughout -- never a real CHF amount, and never the string CHF followed by
-- digits (D-34).
begin;
select plan(58);

-- Fixtures --------------------------------------------------------------------------------
insert into public.vehicle_classes (slug, passenger_capacity, luggage_capacity)
values ('sm-first', 3, 3);

insert into public.rate_versions (slug, label)
values ('sm-rv', 'Stripe money events fixture');

insert into public.distance_rates (
  rate_version_id, vehicle_class_id, max_pax, base_fare_rappen, per_km_rappen, min_fare_rappen
)
select rv.id, vc.id, 3, 1, 2, 3
  from public.rate_versions rv, public.vehicle_classes vc
 where rv.slug = 'sm-rv'
   and vc.slug = 'sm-first';

update public.rate_versions set status = 'live' where slug = 'sm-rv';

create temporary table sm_fx as
select
  vc.id as vehicle_class_id,
  rv.id as rate_version_id,
  sv.id as settings_version_id,
  now() + interval '45 minutes' as lock_exp,
  now() + interval '30 days' as token_expires_at
from public.vehicle_classes vc
join public.rate_versions rv on rv.slug = 'sm-rv'
join public.settings_versions sv on sv.slug = 'launch-baseline'
where vc.slug = 'sm-first';
grant select on sm_fx to public;

create function pg_temp.sm_snapshot()
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'vehicle_class_id', fx.vehicle_class_id,
    'rate_version_id', fx.rate_version_id,
    'settings_version_id', fx.settings_version_id,
    'engine_version', 'quote-engine@stripe-money-events',
    'lock_exp', fx.lock_exp,
    'pax', 1,
    'bags', 0,
    'lines', jsonb_build_array(jsonb_build_object(
      'seq', 1, 'code', 'distance_fare', 'kind', 'fare',
      'i18n_key', 'price.line.distance', 'amount_rappen', 6
    )),
    'policy', jsonb_build_object(
      'cancellation_tiers', '[]'::jsonb,
      'free_cancel_hours', 24,
      'airport_waiting_minutes', 60,
      'city_waiting_minutes', 15,
      'settings_version_id', fx.settings_version_id,
      'modification_deadline_hours', 24,
      'min_advance_minutes', 180,
      'policy_doc', 'stripe-money-events'
    ),
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
  from sm_fx fx
$$;
grant execute on function pg_temp.sm_snapshot() to public;

create function pg_temp.sm_legs(p_scheduled_at timestamptz)
returns jsonb
language sql
stable
as $$
  select jsonb_build_array(jsonb_build_object(
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
    'scheduled_at', p_scheduled_at::text,
    'scheduled_local', to_char(p_scheduled_at, 'YYYY-MM-DD"T"HH24:MI'),
    'flight_no', null,
    'vehicle_class_id', fx.vehicle_class_id,
    'pax', 1,
    'bags', 0,
    'estimated_duration_minutes', 25,
    'duration_min', 25,
    'distance_km', 12.5,
    'leg_subtotal_rappen', 6,
    'booking_leg_id', null
  ))
  from sm_fx fx
$$;
grant execute on function pg_temp.sm_legs(timestamptz) to public;

-- Book (as vamos_checkout, the real RPC) and settle succeeded with a real pi_.
create function pg_temp.sm_paid(p_n int)
returns table (booking_id uuid, payment_id bigint, snapshot_id bigint)
language plpgsql
volatile
as $$
declare
  v_out record;
begin
  execute 'set local role vamos_checkout';
  select * into v_out
    from public.checkout_create_booking(
      p_quote_id => ('20000000-0000-4000-8000-' || lpad(p_n::text, 12, '0'))::uuid,
      p_idempotency_key => 'sm-' || p_n,
      p_contact => jsonb_build_object(
        'contact_name', 'Stripe Money Guest',
        'contact_email', 'sm-' || p_n || '@example.test',
        'contact_phone', '+417****7082'
      ),
      p_locale => 'en',
      p_display_currency => 'CHF',
      p_snapshot => pg_temp.sm_snapshot(),
      p_legs => pg_temp.sm_legs(now() + interval '3 days'),
      p_coupon_id => null,
      p_coupon_code => null,
      p_manage_token_hash => decode(lpad(to_hex(p_n), 64, '0'), 'hex'),
      p_manage_token_expires_at => (select token_expires_at from sm_fx),
      p_stripe_payment_intent_id => 'cs_sm_' || p_n,
      p_stripe_checkout_session_id => 'cs_sm_' || p_n,
      p_charged_rappen => 6,
      p_actor_customer_id => null
    );
  execute 'reset role';

  insert into public.stripe_events (id, type, stripe_created, object_id, payload)
  values ('evt_sm_' || p_n, 'checkout.session.completed', now(), 'cs_sm_' || p_n, '{}'::jsonb);

  perform * from public.checkout_payment_settle(
    'evt_sm_' || p_n, 'cs_sm_' || p_n, 'pi_sm_' || p_n, 'succeeded',
    'CHF', null, null, null, null
  );

  return query select v_out.booking_id, v_out.payment_id, v_out.snapshot_id;
end;
$$;

create temporary table sm_a as select * from pg_temp.sm_paid(1);
create temporary table sm_b as select * from pg_temp.sm_paid(2);
create temporary table sm_c as select * from pg_temp.sm_paid(3);
create temporary table sm_d as select * from pg_temp.sm_paid(4);
create temporary table sm_e as select * from pg_temp.sm_paid(5);
create temporary table sm_f as select * from pg_temp.sm_paid(6);
grant select on sm_a, sm_b, sm_c, sm_d, sm_e, sm_f to public;

-- 0. Grants, RLS, reason CHECK (T-26.1-28) ------------------------------------------ 12
select function_privs_are('public', 'stripe_charge_refunded_record',
  '{text,text,text,rappen,timestamptz,bool}'::text[], 'anon', '{}'::text[],
  'stripe_charge_refunded_record: anon holds no EXECUTE');
select function_privs_are('public', 'stripe_charge_refunded_record',
  '{text,text,text,rappen,timestamptz,bool}'::text[], 'authenticated', '{}'::text[],
  'stripe_charge_refunded_record: authenticated holds no EXECUTE');
select function_privs_are('public', 'stripe_charge_refunded_record',
  '{text,text,text,rappen,timestamptz,bool}'::text[], 'vamos_system', '{EXECUTE}'::text[],
  'stripe_charge_refunded_record: vamos_system holds EXECUTE');
select function_privs_are('public', 'stripe_dispute_upsert',
  '{text,text,text,text,text,rappen,timestamptz}'::text[], 'anon', '{}'::text[],
  'stripe_dispute_upsert: anon holds no EXECUTE');
select function_privs_are('public', 'stripe_dispute_upsert',
  '{text,text,text,text,text,rappen,timestamptz}'::text[], 'authenticated', '{}'::text[],
  'stripe_dispute_upsert: authenticated holds no EXECUTE');
select function_privs_are('public', 'stripe_dispute_upsert',
  '{text,text,text,text,text,rappen,timestamptz}'::text[], 'vamos_system', '{EXECUTE}'::text[],
  'stripe_dispute_upsert: vamos_system holds EXECUTE');

select ok(
  (select c.relrowsecurity and c.relforcerowsecurity
     from pg_catalog.pg_class c where c.oid = 'public.booking_disputes'::regclass),
  'booking_disputes: RLS enabled and forced'
);
select table_privs_are('public', 'booking_disputes', 'anon', '{}'::text[],
  'booking_disputes: anon holds no table privilege');
select table_privs_are('public', 'booking_disputes', 'authenticated', '{}'::text[],
  'booking_disputes: authenticated (customer) holds no table privilege');
select table_privs_are('public', 'booking_disputes', 'vamos_guest', '{}'::text[],
  'booking_disputes: vamos_guest holds no table privilege');
select table_privs_are('public', 'booking_disputes', 'vamos_staff', '{SELECT}'::text[],
  'booking_disputes: vamos_staff holds SELECT only');
select ok(
  (select pg_catalog.pg_get_constraintdef(c.oid) like '%stripe_dashboard%'
         and pg_catalog.pg_get_constraintdef(c.oid) like '%requote_superseded%'
     from pg_catalog.pg_constraint c
    where c.conrelid = 'public.booking_refunds'::regclass
      and c.conname = 'booking_refunds_reason_check'),
  'booking_refunds.reason CHECK adds stripe_dashboard and keeps the 26.1-02 reasons'
);

-- 1. Arrival order A: the app recorder writes first, charge.refunded is a no-op. ---- 4
select lives_ok(
  $$ select * from public.record_booking_refund((select booking_id from sm_a), 're_sm_a', null, null, 2) $$,
  'A: app recorder (record_booking_refund) writes the refund first'
);
select is(
  (select outcome from public.stripe_charge_refunded_record('pi_sm_1', 'cs_sm_1', 're_sm_a', 2, now(), true)),
  'already', 'A: app-tagged charge.refunded after the app row is a no-op'
);
select is(
  (select count(*)::int from public.booking_refunds where stripe_refund_id = 're_sm_a'),
  1, 'A: exactly one booking_refunds row'
);
select is(
  (select b.refunded_rappen::int from public.bookings b join sm_a a on a.booking_id = b.id),
  2, 'A: booking refund effects applied once'
);

-- 2. Arrival order B: charge.refunded first -> app_refund_pending, retried later. ---- 6
select throws_ok(
  $$ select * from public.stripe_charge_refunded_record('pi_sm_2', 'cs_sm_2', 're_sm_b', 2, now(), true) $$,
  'P0002', 'app_refund_pending',
  'B: app-tagged charge.refunded before the app row raises app_refund_pending (consumer retries)'
);
select is(
  (select count(*)::int from public.booking_refunds where stripe_refund_id = 're_sm_b'),
  0, 'B: nothing recorded by the refused call'
);
select lives_ok(
  $$ select * from public.record_booking_refund((select booking_id from sm_b), 're_sm_b', null, null, 2) $$,
  'B: app recorder lands afterwards'
);
select is(
  (select outcome from public.stripe_charge_refunded_record('pi_sm_2', 'cs_sm_2', 're_sm_b', 2, now(), true)),
  'already', 'B: retried charge.refunded is now a no-op'
);
select is(
  (select count(*)::int from public.booking_refunds where stripe_refund_id = 're_sm_b'),
  1, 'B: exactly one booking_refunds row'
);
select is(
  (select b.refunded_rappen::int from public.bookings b join sm_b a on a.booking_id = b.id),
  2, 'B: booking refund effects applied once'
);

-- 3. Dashboard full refund: recorded against the exact payment, idempotent. -------- 9
select is(
  (select outcome from public.stripe_charge_refunded_record('pi_sm_3', null, 're_sm_c', 6, now(), false)),
  'recorded', 'C: dashboard refund is recorded'
);
select is(
  (select reason from public.booking_refunds where stripe_refund_id = 're_sm_c'),
  'stripe_dashboard', 'C: reason is stripe_dashboard'
);
select is(
  (select r.payment_id from public.booking_refunds r where r.stripe_refund_id = 're_sm_c'),
  (select payment_id from sm_c), 'C: row points at the exact payment row'
);
select is(
  (select b.refunded_rappen::int from public.bookings b join sm_c c on c.booking_id = b.id),
  6, 'C: refunded_rappen carries the refund'
);
select is(
  (select b.refund_status from public.bookings b join sm_c c on c.booking_id = b.id),
  'refunded', 'C: a full refund sets refund_status refunded'
);
select is(
  (select outcome from public.stripe_charge_refunded_record('pi_sm_3', null, 're_sm_c', 6, now(), false)),
  'already', 'C: replayed charge.refunded is a no-op (T-26.1-27)'
);
select is(
  (select count(*)::int from public.booking_refunds where stripe_refund_id = 're_sm_c'),
  1, 'C: exactly one row after the replay'
);
select is(
  (select b.refunded_rappen::int from public.bookings b join sm_c c on c.booking_id = b.id),
  6, 'C: replay does not double the booking effect'
);
select is(
  (select count(*)::int from public.booking_events e join sm_c c on c.booking_id = e.booking_id
    where e.kind = 'refund.issued' and e.actor_kind = 'stripe'),
  1, 'C: one refund.issued event with actor_kind stripe'
);

-- 4. Dashboard partial refunds, first resolved by session id. ---------------------- 7
select is(
  (select outcome from public.stripe_charge_refunded_record('pi_sm_unknown', 'cs_sm_4', 're_sm_d1', 2, now(), false)),
  'recorded', 'D: an unmatched pi_ falls back to the session id'
);
select is(
  (select r.payment_id from public.booking_refunds r where r.stripe_refund_id = 're_sm_d1'),
  (select payment_id from sm_d), 'D: session fallback resolves the exact payment row'
);
select is(
  (select b.refunded_rappen::int from public.bookings b join sm_d d on d.booking_id = b.id),
  2, 'D: partial refund adds to refunded_rappen'
);
select is(
  (select b.refund_status from public.bookings b join sm_d d on d.booking_id = b.id),
  'none', 'D: a partial refund does not mark the booking refunded'
);
select is(
  (select outcome from public.stripe_charge_refunded_record('pi_sm_4', null, 're_sm_d2', 4, now(), false)),
  'recorded', 'D: the second partial refund is recorded'
);
select is(
  (select b.refunded_rappen::int from public.bookings b join sm_d d on d.booking_id = b.id),
  6, 'D: refunded_rappen sums both refunds'
);
select is(
  (select b.refund_status from public.bookings b join sm_d d on d.booking_id = b.id),
  'refunded', 'D: reaching the full charge marks the booking refunded'
);

-- 5. A refund on a duplicate payment row never touches the booking's ledger. ------- 5
insert into public.booking_payments (
  booking_id, snapshot_id, stripe_payment_intent_id, stripe_checkout_session_id,
  charged_rappen, charged_currency, status
)
select e.booking_id, e.snapshot_id, 'cs_sm_5b', 'cs_sm_5b', 6, 'CHF', 'requires_payment'
  from sm_e e;
insert into public.stripe_events (id, type, stripe_created, object_id, payload)
values ('evt_sm_5b', 'checkout.session.completed', now(), 'cs_sm_5b', '{}'::jsonb);
create temporary table sm_settle_5b as
select * from public.checkout_payment_settle(
  'evt_sm_5b', 'cs_sm_5b', 'pi_sm_5b', 'succeeded', 'CHF', null, null, null, null
);

select is(
  (select status from public.booking_payments where stripe_checkout_session_id = 'cs_sm_5b'),
  'duplicate', 'E: the second charge is a duplicate payment row'
);
select is(
  (select outcome from public.stripe_charge_refunded_record('pi_sm_5b', null, 're_sm_e', 6, now(), false)),
  'recorded', 'E: dashboard refund on the duplicate is recorded'
);
select is(
  (select r.payment_id from public.booking_refunds r where r.stripe_refund_id = 're_sm_e'),
  (select id from public.booking_payments where stripe_checkout_session_id = 'cs_sm_5b'),
  'E: row points at the duplicate payment, not the booking''s original'
);
select is(
  (select coalesce(b.refunded_rappen, 0)::int from public.bookings b join sm_e e on e.booking_id = b.id),
  0, 'E: booking refunded_rappen unchanged'
);
select is(
  (select b.refund_status from public.bookings b join sm_e e on e.booking_id = b.id),
  'none', 'E: booking refund_status unchanged'
);

-- 6. Unknown payment and bad input. ------------------------------------------------ 3
select throws_ok(
  $$ select * from public.stripe_charge_refunded_record('pi_sm_nope', 'cs_sm_nope', 're_sm_nope', 1, now(), false) $$,
  'P0002', 'payment_not_found',
  'F: unknown payment raises P0002 (consumer retries, then DLQ alert)'
);
select throws_ok(
  $$ select * from public.stripe_charge_refunded_record('pi_sm_3', null, ' ', 1, now(), false) $$,
  'P0001', 'stripe-refund-id-required',
  'F: a blank refund id is refused'
);
select is(
  (select count(*)::int from public.booking_refunds where stripe_refund_id = 're_sm_nope'),
  0, 'F: nothing recorded for an unknown payment'
);

-- 7. Disputes: one row per dispute, newest Stripe status wins (T-26.1-29). ---------- 8
select lives_ok(
  $$
    select * from public.stripe_dispute_upsert(
      'du_sm_1', 'pi_sm_6', null, 'warning_needs_response', 'fraudulent', 6,
      '2026-09-01T11:00:00Z'::timestamptz
    )
  $$,
  'G: dispute.created inserts the dispute row'
);
select is(
  (select status from public.booking_disputes where stripe_dispute_id = 'du_sm_1'),
  'warning_needs_response', 'G: status mirrors Stripe'
);
select is(
  (select d.payment_id from public.booking_disputes d where d.stripe_dispute_id = 'du_sm_1'),
  (select payment_id from sm_f), 'G: dispute points at the exact payment row'
);
select lives_ok(
  $$
    select * from public.stripe_dispute_upsert(
      'du_sm_1', 'pi_sm_6', null, 'under_review', 'fraudulent', 6,
      '2026-09-01T12:00:00Z'::timestamptz
    )
  $$,
  'G: dispute.updated with a newer timestamp updates in place'
);
select lives_ok(
  $$
    select * from public.stripe_dispute_upsert(
      'du_sm_1', 'pi_sm_6', null, 'lost', 'fraudulent', 6,
      '2026-09-01T10:00:00Z'::timestamptz
    )
  $$,
  'G: an older out-of-order event is accepted without error'
);
select is(
  (select status from public.booking_disputes where stripe_dispute_id = 'du_sm_1'),
  'under_review', 'G: the older event never overwrites the newer status'
);
select is(
  (select count(*)::int from public.booking_disputes where stripe_dispute_id = 'du_sm_1'),
  1, 'G: exactly one row per dispute'
);
select throws_ok(
  $$
    select * from public.stripe_dispute_upsert(
      'du_sm_nope', 'pi_sm_nope', 'cs_sm_nope', 'needs_response', null, 1,
      '2026-09-01T10:00:00Z'::timestamptz
    )
  $$,
  'P0002', 'payment_not_found',
  'G: a dispute on an unknown payment raises P0002'
);

-- 8. RLS: staff read, customers and anon refused (T-26.1-28). ---------------------- 4
insert into auth.users (id, email, aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('f0000000-0000-0000-0000-0000000005a1'::uuid, 'sm-dispatcher@vamostaxi.eu', 'authenticated', 'authenticated', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('f0000000-0000-0000-0000-0000000005a2'::uuid, 'sm-customer@vamostaxi.eu', 'authenticated', 'authenticated', '{}'::jsonb, '{}'::jsonb, now(), now());
insert into public.staff (user_id, role, active, accepted_at) values
  ('f0000000-0000-0000-0000-0000000005a1'::uuid, 'dispatcher', true, now());

set local role vamos_staff;
select set_config('request.jwt.claims',
  jsonb_build_object('sub', 'f0000000-0000-0000-0000-0000000005a1', 'role', 'authenticated', 'aal', 'aal2',
    'app_metadata', jsonb_build_object('vamos_role', 'dispatcher'))::text,
  true);
select is(
  (select count(*)::int from public.booking_disputes where stripe_dispute_id = 'du_sm_1'),
  1, 'H: staff can read disputes'
);
select throws_ok(
  $$
    insert into public.booking_disputes (booking_id, payment_id, stripe_dispute_id, status, stripe_created)
    select booking_id, payment_id, 'du_sm_staff', 'needs_response', now() from sm_f
  $$,
  '42501', null,
  'H: staff cannot write disputes directly'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claims',
  jsonb_build_object('sub', 'f0000000-0000-0000-0000-0000000005a2', 'role', 'authenticated', 'aal', 'aal2')::text,
  true);
select throws_ok(
  $$ select * from public.booking_disputes $$,
  '42501', null,
  'H: a customer cannot read disputes'
);
reset role;

set local role anon;
select throws_ok(
  $$ select * from public.booking_disputes $$,
  '42501', null,
  'H: anon cannot read disputes'
);
reset role;

select * from finish();
rollback;
