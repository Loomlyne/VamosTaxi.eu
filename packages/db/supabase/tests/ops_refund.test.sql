-- ops_refund.test.sql
--
-- 08-05: ops_refund_record refuses null stripe_refund_id; with id inserts
-- booking_refunds + refund.issued. ops_cancel_booking writes
-- booking.status_changed, no Stripe. EXECUTE vamos_system only.
-- Rolled back. Synthetic 1-rappen figures only — never a product CHF.
begin;
select plan(30);  -- was 27 since a796c25; the file has 30 assertions (the fixture crash hid it)

insert into public.vehicle_classes (slug, passenger_capacity, luggage_capacity)
values ('orf-class', 4, 4);

insert into auth.users (id, email, aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values (
  'a0805000-0000-4000-8000-000000000805',
  'orf-dispatcher@vamostaxi.eu',
  'authenticated',
  'authenticated',
  '{}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
);

insert into public.staff (user_id, role, active, full_name)
values ('a0805000-0000-4000-8000-000000000805', 'dispatcher', true, 'ORF Dispatcher');

insert into public.bookings (reference, contact_name, contact_email, payer_email, status, locale)
values
  (public.next_booking_reference(), 'ORF Unpaid', 'orf-unpaid@vamostaxi.eu', null, 'quote', 'en'),
  (public.next_booking_reference(), 'ORF Paid', 'orf-paid@vamostaxi.eu', 'orf-company@vamostaxi.eu', 'paid', 'de'),
  (public.next_booking_reference(), 'ORF Cancel Paid', 'orf-cancel-paid@vamostaxi.eu', null, 'paid', 'en'),
  (public.next_booking_reference(), 'ORF Frozen', 'orf-frozen@vamostaxi.eu', null, 'cancelled', 'en');

insert into public.booking_legs (
  booking_id, leg_seq, direction, pickup_text, dropoff_text,
  scheduled_at, scheduled_local, vehicle_class_id, estimated_duration_minutes, pax, bags
)
select b.id, 1, 'outbound', 'ZRH Airport', 'Zurich HB',
       '2027-10-24 10:00:00+02'::timestamptz, '2027-10-24T10:00',
       vc.id, 60, 2, 2
  from public.bookings b, public.vehicle_classes vc
 where b.contact_email in (
         'orf-unpaid@vamostaxi.eu',
         'orf-paid@vamostaxi.eu',
         'orf-cancel-paid@vamostaxi.eu',
         'orf-frozen@vamostaxi.eu'
       )
   and vc.slug = 'orf-class';

set local session_replication_role = replica;

insert into public.price_snapshots (
  quote_id, vehicle_class_id, rate_version_id, rate_version_is_live, settings_version_id,
  engine_version, pax, bags, lines, policy,
  subtotal_rappen, surcharges_rappen, discount_rappen, total_rappen,
  expires_at, quote_lock_expires_at
)
select
  gen_random_uuid(),
  vc.id,
  rv.id,
  false,
  sv.id,
  'quote-engine@08-05',
  2, 2,
  '[]'::jsonb,
  -- eight-key policy: price_snapshots_policy_shape (20260825000003)
  jsonb_build_object('cancellation_tiers', '[]'::jsonb, 'free_cancel_hours', 24,
                     'airport_waiting_minutes', 60, 'city_waiting_minutes', 15,
                     'settings_version_id', sv.id, 'modification_deadline_hours', 24,
                     'min_advance_minutes', 180, 'policy_doc', 'test'),
  1, 0, 0, 1,
  now() + interval '1 day',
  now() + interval '1 day'
from public.vehicle_classes vc
cross join lateral (select id from public.rate_versions order by id limit 1) rv
cross join lateral (select id from public.settings_versions order by id limit 1) sv
-- one snapshot per succeeded payment: booking_payments_one_success_per_snapshot (20260910175309)
cross join generate_series(1, 2) as g(n)
where vc.slug = 'orf-class';

insert into public.booking_payments (
  booking_id, snapshot_id, stripe_payment_intent_id, charged_rappen, status, captured_at
)
select b.id, ps.id, 'pi_orf_paid', 1, 'succeeded', now()
  from public.bookings b
  cross join lateral (select id from public.price_snapshots order by id desc limit 1 offset 0) ps
 where b.contact_email = 'orf-paid@vamostaxi.eu';

insert into public.booking_payments (
  booking_id, snapshot_id, stripe_payment_intent_id, charged_rappen, status, captured_at
)
select b.id, ps.id, 'pi_orf_cancel_paid', 1, 'succeeded', now()
  from public.bookings b
  cross join lateral (select id from public.price_snapshots order by id desc limit 1 offset 1) ps
 where b.contact_email = 'orf-cancel-paid@vamostaxi.eu';

set local session_replication_role = origin;

create temporary table fx as
select
  (select id from public.bookings where contact_email = 'orf-unpaid@vamostaxi.eu') as unpaid,
  (select id from public.bookings where contact_email = 'orf-paid@vamostaxi.eu') as paid,
  (select id from public.bookings where contact_email = 'orf-cancel-paid@vamostaxi.eu') as cancel_paid,
  (select id from public.bookings where contact_email = 'orf-frozen@vamostaxi.eu') as frozen,
  (select p.id from public.booking_payments p
     join public.bookings b on b.id = p.booking_id
    where b.contact_email = 'orf-paid@vamostaxi.eu') as pay,
  'a0805000-0000-4000-8000-000000000805'::uuid as actor;

select has_column(
  'public',
  'booking_payments',
  'stripe_fee_rappen',
  'booking_payments.stripe_fee_rappen exists (D-31)'
);

select function_privs_are('public', 'ops_refund_record', '{uuid,int8,text,uuid,rappen,text,rappen}'::text[], 'anon', '{}'::text[], 'ops_refund_record: anon holds no EXECUTE');
select function_privs_are('public', 'ops_refund_record', '{uuid,int8,text,uuid,rappen,text,rappen}'::text[], 'authenticated', '{}'::text[], 'ops_refund_record: authenticated holds no EXECUTE');
select function_privs_are('public', 'ops_refund_record', '{uuid,int8,text,uuid,rappen,text,rappen}'::text[], 'vamos_staff', '{}'::text[], 'ops_refund_record: vamos_staff holds no EXECUTE');
select function_privs_are('public', 'ops_refund_record', '{uuid,int8,text,uuid,rappen,text,rappen}'::text[], 'vamos_guest', '{}'::text[], 'ops_refund_record: vamos_guest holds no EXECUTE');
select function_privs_are('public', 'ops_refund_record', '{uuid,int8,text,uuid,rappen,text,rappen}'::text[], 'vamos_public', '{}'::text[], 'ops_refund_record: vamos_public holds no EXECUTE');
select function_privs_are('public', 'ops_refund_record', '{uuid,int8,text,uuid,rappen,text,rappen}'::text[], 'vamos_system', '{EXECUTE}'::text[], 'ops_refund_record: vamos_system holds EXECUTE');

select function_privs_are('public', 'ops_cancel_booking', '{uuid,uuid}'::text[], 'anon', '{}'::text[], 'ops_cancel_booking: anon holds no EXECUTE');
select function_privs_are('public', 'ops_cancel_booking', '{uuid,uuid}'::text[], 'authenticated', '{}'::text[], 'ops_cancel_booking: authenticated holds no EXECUTE');
select function_privs_are('public', 'ops_cancel_booking', '{uuid,uuid}'::text[], 'vamos_staff', '{}'::text[], 'ops_cancel_booking: vamos_staff holds no EXECUTE');
select function_privs_are('public', 'ops_cancel_booking', '{uuid,uuid}'::text[], 'vamos_guest', '{}'::text[], 'ops_cancel_booking: vamos_guest holds no EXECUTE');
select function_privs_are('public', 'ops_cancel_booking', '{uuid,uuid}'::text[], 'vamos_public', '{}'::text[], 'ops_cancel_booking: vamos_public holds no EXECUTE');
select function_privs_are('public', 'ops_cancel_booking', '{uuid,uuid}'::text[], 'vamos_system', '{EXECUTE}'::text[], 'ops_cancel_booking: vamos_system holds EXECUTE');

select throws_ok(
  format(
    $f$select * from public.ops_refund_record(%L::uuid, %s::bigint, NULL::text, %L::uuid)$f$,
    (select paid from fx), (select pay from fx), (select actor from fx)
  ),
  'P0001',
  'stripe-refund-id-required',
  'null stripe_refund_id refused'
);

select throws_ok(
  format(
    $f$select * from public.ops_refund_record(%L::uuid, %s::bigint, %L::text, %L::uuid)$f$,
    (select paid from fx), (select pay from fx), '', (select actor from fx)
  ),
  'P0001',
  'stripe-refund-id-required',
  'empty stripe_refund_id refused'
);

select throws_ok(
  format(
    $f$select * from public.ops_refund_record(%L::uuid, %s::bigint, %L::text, %L::uuid)$f$,
    (select unpaid from fx), (select pay from fx), 're_orf_unpaid', (select actor from fx)
  ),
  'P0001',
  'not-paid',
  'unpaid refund refused'
);

select lives_ok(
  format(
    $f$select * from public.ops_refund_record(%L::uuid, %s::bigint, %L::text, %L::uuid, 2)$f$,
    (select paid from fx), (select pay from fx), 're_orf_paid', (select actor from fx)
  ),
  'refund with stripe id records'
);

select ok(
  exists (
    select 1 from public.booking_refunds
     where booking_id = (select paid from fx)
       and stripe_refund_id = 're_orf_paid'
       and refund_percent = 100
  ),
  'booking_refunds row inserted'
);

select ok(
  exists (
    select 1 from public.booking_events
     where booking_id = (select paid from fx)
       and kind = 'refund.issued'
  ),
  'refund.issued event inserted'
);

select ok(
  exists (
    select 1 from public.bookings
     where id = (select paid from fx)
       and status = 'paid'
       and refund_status = 'refunded'
  ),
  'D-10: booking status stays paid; refund_status refunded after Stripe id'
);

select ok(
  exists (
    select 1 from public.booking_payments
     where id = (select pay from fx)
       and stripe_fee_rappen = 2
  ),
  'stripe_fee_rappen written only when provided'
);

select lives_ok(
  format(
    $f$select * from public.ops_refund_record(%L::uuid, %s::bigint, %L::text, %L::uuid)$f$,
    (select paid from fx), (select pay from fx), 're_orf_paid', (select actor from fx)
  ),
  'replay same stripe_refund_id is idempotent'
);

select throws_ok(
  format(
    $f$select * from public.ops_refund_record(%L::uuid, %s::bigint, %L::text, %L::uuid)$f$,
    (select paid from fx), (select pay from fx), 're_orf_other', (select actor from fx)
  ),
  'P0001',
  'already-refunded',
  'second stripe id on same payment refused'
);

select lives_ok(
  format(
    $f$select * from public.ops_cancel_booking(%L::uuid, %L::uuid)$f$,
    (select unpaid from fx), (select actor from fx)
  ),
  'unpaid cancel drops with no Stripe'
);

select ok(
  exists (
    select 1 from public.booking_events
     where booking_id = (select unpaid from fx)
       and kind = 'booking.status_changed'
       and to_status = 'cancelled'
  ),
  'unpaid cancel writes booking.status_changed'
);

select ok(
  not exists (
    select 1 from public.booking_refunds
     where booking_id = (select unpaid from fx)
  ),
  'unpaid cancel writes no booking_refunds'
);

select lives_ok(
  format(
    $f$select * from public.ops_cancel_booking(%L::uuid, %L::uuid)$f$,
    (select cancel_paid from fx), (select actor from fx)
  ),
  'paid cancel does not refund'
);

select ok(
  not exists (
    select 1 from public.booking_refunds
     where booking_id = (select cancel_paid from fx)
  ),
  'paid cancel writes no booking_refunds'
);

select ok(
  exists (
    select 1 from public.booking_events
     where booking_id = (select cancel_paid from fx)
       and kind = 'booking.status_changed'
       and to_status = 'cancelled'
  ),
  'paid cancel writes booking.status_changed'
);

select throws_ok(
  format(
    $f$select * from public.ops_cancel_booking(%L::uuid, %L::uuid)$f$,
    (select frozen from fx), (select actor from fx)
  ),
  'P0001',
  'frozen',
  'frozen cancelled refuses cancel'
);

select * from finish();
rollback;
