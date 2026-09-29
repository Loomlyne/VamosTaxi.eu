-- refund_review.test.sql
--
-- 26.1-17: refund tiers and admin decisions (26.1-CONTEXT D-23/D-24/D-25/D-25a).
--   D-23: cancelled > 24 h before pickup -> auto_full (unchanged).
--   D-24: cancelled inside 24 h, inside 6 h, or after pickup -> pending_ops. The admin sets
--         the percentage (refund_percent/refund_rappen null until then) or declines.
--   D-25: after the trip the admin accepts (ops_refund_record reason post_trip) or rejects.
--   Nothing captured -> refund_mode none (there is nothing to review).
-- Rolled back. Synthetic integer rappen only (8000 = 100 %), never a product CHF.
begin;
select plan(45);

insert into public.vehicle_classes (slug, passenger_capacity, luggage_capacity)
values ('rr-class', 3, 3);

insert into auth.users (id, email, aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('26117000-0000-4000-a000-000000000001', 'rr-admin@vamostaxi.eu', 'authenticated', 'authenticated', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('26117000-0000-4000-a000-000000000002', 'rr-dispatch@vamostaxi.eu', 'authenticated', 'authenticated', '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.staff (user_id, role, active, accepted_at, full_name) values
  ('26117000-0000-4000-a000-000000000001', 'admin', true, now(), 'RR Admin'),
  ('26117000-0000-4000-a000-000000000002', 'dispatcher', true, now(), 'RR Dispatcher');

insert into public.bookings (contact_name, contact_email, status)
values
  ('RR 30h', 'rr-30h@vamostaxi.eu', 'paid'),
  ('RR 10h', 'rr-10h@vamostaxi.eu', 'paid'),
  ('RR 3h', 'rr-3h@vamostaxi.eu', 'paid'),
  ('RR After', 'rr-after@vamostaxi.eu', 'paid'),
  ('RR Done Reject', 'rr-done-reject@vamostaxi.eu', 'paid'),
  ('RR Done Accept', 'rr-done-accept@vamostaxi.eu', 'paid'),
  ('RR Unpaid 3h', 'rr-unpaid-3h@vamostaxi.eu', 'pending');

insert into public.booking_legs (
  booking_id, leg_seq, direction, pickup_text, dropoff_text,
  scheduled_at, scheduled_local, vehicle_class_id, status
)
select b.id, 1, 'outbound', 'ZRH Airport', 'Zurich HB',
       now() + x.offs,
       to_char(now() + x.offs, 'YYYY-MM-DD"T"HH24:MI'),
       vc.id, 'confirmed'
  from public.bookings b
  join (values
    ('rr-30h@vamostaxi.eu', interval '30 hours'),
    ('rr-10h@vamostaxi.eu', interval '10 hours'),
    ('rr-3h@vamostaxi.eu', interval '3 hours'),
    ('rr-after@vamostaxi.eu', interval '-2 hours'),
    ('rr-done-reject@vamostaxi.eu', interval '-5 hours'),
    ('rr-done-accept@vamostaxi.eu', interval '-5 hours'),
    ('rr-unpaid-3h@vamostaxi.eu', interval '3 hours')
  ) as x(email, offs) on x.email = b.contact_email
  cross join public.vehicle_classes vc
 where vc.slug = 'rr-class';

set local session_replication_role = replica;

insert into public.price_snapshots (
  quote_id, vehicle_class_id, rate_version_id, rate_version_is_live, settings_version_id,
  engine_version, pax, bags, lines, policy,
  subtotal_rappen, surcharges_rappen, discount_rappen, total_rappen,
  expires_at, quote_lock_expires_at, booking_id
)
select
  gen_random_uuid(), vc.id, rv.id, false, sv.id,
  'quote-engine@26.1-17-' || b.contact_email,
  2, 2, '[]'::jsonb,
  jsonb_build_object(
    'cancellation_tiers', '[]'::jsonb, 'free_cancel_hours', 24,
    'airport_waiting_minutes', 60, 'city_waiting_minutes', 15,
    'settings_version_id', sv.id, 'modification_deadline_hours', 24,
    'min_advance_minutes', 180, 'policy_doc', 'rr'
  ),
  8000, 0, 0, 8000,
  now() + interval '1 day', now() + interval '1 day', b.id
from public.bookings b
join public.vehicle_classes vc on vc.slug = 'rr-class'
cross join lateral (select id from public.rate_versions order by id limit 1) rv
cross join lateral (select id from public.settings_versions order by id limit 1) sv
where b.contact_email like 'rr-%@vamostaxi.eu';

update public.bookings b
   set price_snapshot_id = s.id
  from public.price_snapshots s
 where s.booking_id = b.id
   and s.engine_version like 'quote-engine@26.1-17-%';

insert into public.booking_payments (
  booking_id, snapshot_id, stripe_payment_intent_id, charged_rappen, status, captured_at
)
select b.id, b.price_snapshot_id, 'pi_rr_' || replace(b.contact_email, '@', '_'),
       8000, 'succeeded', now()
  from public.bookings b
 where b.contact_email like 'rr-%@vamostaxi.eu'
   and b.contact_email <> 'rr-unpaid-3h@vamostaxi.eu';

set local session_replication_role = origin;

-- The two post-trip bookings: the trip happened.
update public.booking_legs
   set status = 'completed'
 where booking_id in (
   select id from public.bookings
    where contact_email in ('rr-done-reject@vamostaxi.eu', 'rr-done-accept@vamostaxi.eu')
 );
select public.recompute_booking_status(id)
  from public.bookings
 where contact_email in ('rr-done-reject@vamostaxi.eu', 'rr-done-accept@vamostaxi.eu');

insert into public.booking_access_tokens (booking_id, token_hash, expires_at)
select b.id, extensions.digest('rr-3h-token', 'sha256'), now() + interval '1 day'
  from public.bookings b where b.contact_email = 'rr-3h@vamostaxi.eu';

create temporary table fx as
select
  (select id from public.bookings where contact_email = 'rr-30h@vamostaxi.eu') as h30,
  (select id from public.bookings where contact_email = 'rr-10h@vamostaxi.eu') as h10,
  (select id from public.bookings where contact_email = 'rr-3h@vamostaxi.eu') as h3,
  (select id from public.bookings where contact_email = 'rr-after@vamostaxi.eu') as after_pickup,
  (select id from public.bookings where contact_email = 'rr-done-reject@vamostaxi.eu') as done_reject,
  (select id from public.bookings where contact_email = 'rr-done-accept@vamostaxi.eu') as done_accept,
  (select id from public.bookings where contact_email = 'rr-unpaid-3h@vamostaxi.eu') as unpaid_h3,
  '26117000-0000-4000-a000-000000000001'::uuid as admin_id,
  '26117000-0000-4000-a000-000000000002'::uuid as dispatcher_id;

grant select on fx to vamos_staff, vamos_guest;

create temporary table pay as
select b.contact_email, p.id as payment_id
  from public.booking_payments p
  join public.bookings b on b.id = p.booking_id
 where b.contact_email like 'rr-%@vamostaxi.eu';

-- ── shape and grants ─────────────────────────────────────────────────────────────── 8
select has_function('public', 'ops_refund_decide', array['uuid', 'text'],
  'public.ops_refund_decide(uuid, text) exists');
select function_privs_are('public', 'ops_refund_decide', '{uuid,text}'::text[], 'vamos_staff', '{EXECUTE}'::text[],
  'ops_refund_decide: vamos_staff holds EXECUTE (the function itself requires app.is_admin())');
select function_privs_are('public', 'ops_refund_decide', '{uuid,text}'::text[], 'anon', '{}'::text[],
  'ops_refund_decide: anon holds no EXECUTE');
select function_privs_are('public', 'ops_refund_decide', '{uuid,text}'::text[], 'authenticated', '{}'::text[],
  'ops_refund_decide: authenticated (customer) holds no EXECUTE — D-25a: no customer refund button');
select function_privs_are('public', 'ops_refund_record', '{uuid,int8,text,uuid,rappen,text,rappen}'::text[], 'vamos_system', '{EXECUTE}'::text[],
  'ops_refund_record(+p_reason, +p_refund_rappen): vamos_system holds EXECUTE');
select function_privs_are('public', 'ops_refund_record', '{uuid,int8,text,uuid,rappen,text,rappen}'::text[], 'vamos_staff', '{}'::text[],
  'ops_refund_record: vamos_staff holds no EXECUTE');
select ok(
  (select pg_catalog.pg_get_constraintdef(c.oid) like '%declined%'
     from pg_catalog.pg_constraint c
    where c.conrelid = 'public.bookings'::regclass
      and c.conname = 'bookings_refund_status_check'),
  'bookings.refund_status CHECK allows declined'
);
select ok(
  (select pg_catalog.pg_get_constraintdef(c.oid) like '%post_trip%'
         and pg_catalog.pg_get_constraintdef(c.oid) like '%stripe_dashboard%'
     from pg_catalog.pg_constraint c
    where c.conrelid = 'public.booking_refunds'::regclass
      and c.conname = 'booking_refunds_reason_check'),
  'booking_refunds.reason CHECK adds post_trip and keeps stripe_dashboard'
);

-- ── D-23 / D-24 tiers ────────────────────────────────────────────────────────────── 9
select is(
  (select refund_mode from public.compute_cancellation_refund((select h30 from fx))),
  'auto_full', 'D-23: 30 h before pickup -> auto_full');
select ok(
  (select refund_rappen = basis_rappen and basis_rappen = 8000 and refund_percent = 100
     from public.compute_cancellation_refund((select h30 from fx))),
  'D-23: auto_full owes 100 % of captured');
select is(
  (select refund_mode from public.compute_cancellation_refund((select h10 from fx))),
  'pending_ops', 'D-24: 10 h before pickup -> pending_ops');
select ok(
  (select refund_rappen is null and refund_percent is null and basis_rappen = 8000
     from public.compute_cancellation_refund((select h10 from fx))),
  'D-24: 10 h -> the admin sets the amount (refund_rappen/refund_percent null, basis kept)');
select is(
  (select refund_mode from public.compute_cancellation_refund((select h3 from fx))),
  'pending_ops', 'D-24: 3 h before pickup -> pending_ops (no silent none zone)');
select ok(
  (select refund_rappen is null and refund_percent is null
     from public.compute_cancellation_refund((select h3 from fx))),
  'D-24: 3 h -> refund_rappen/refund_percent null');
select is(
  (select refund_mode from public.compute_cancellation_refund((select after_pickup from fx))),
  'pending_ops', 'D-24: after pickup -> pending_ops');
select ok(
  (select refund_rappen is null and refund_percent is null
     from public.compute_cancellation_refund((select after_pickup from fx))),
  'D-24: after pickup -> refund_rappen/refund_percent null');
select is(
  (select refund_mode from public.compute_cancellation_refund((select unpaid_h3 from fx))),
  'none', 'nothing captured -> none (nothing for the admin to review)');

-- ── cancel sets bookings.refund_status pending_ops ────────────────────────────────── 4
select lives_ok(
  $$ select * from public.manage_booking_cancel(extensions.digest('rr-3h-token', 'sha256')) $$,
  'D-24: guest cancel 3 h before pickup lives');
select ok(
  (select refund_status = 'pending_ops' and refund_owed_rappen is null
     from public.bookings where id = (select h3 from fx)),
  'D-24: 3 h cancel -> refund_status pending_ops, owed null until the admin decides');
select lives_ok(
  format($f$select * from app.apply_customer_cancel(%L::uuid, null, 'guest', 'rr', 'rr')$f$, (select after_pickup from fx)),
  'D-24: cancel after pickup lives');
select is(
  (select refund_status from public.bookings where id = (select after_pickup from fx)),
  'pending_ops', 'D-24: cancel after pickup -> refund_status pending_ops');

-- ── ops_refund_decide: decline ───────────────────────────────────────────────────── 8
set local role vamos_staff;
select set_config('request.jwt.claims',
  jsonb_build_object('sub', '26117000-0000-4000-a000-000000000002', 'role', 'authenticated', 'aal', 'aal2',
    'app_metadata', jsonb_build_object('vamos_role', 'dispatcher'))::text,
  true);
select throws_ok(
  format($f$select public.ops_refund_decide(%L::uuid, 'decline')$f$, (select h3 from fx)),
  '42501', null, 'a dispatcher cannot decide a refund');
reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select refund_status from public.bookings where id = (select h3 from fx)),
  'pending_ops', 'the refused dispatcher call changed nothing');

set local role vamos_staff;
select set_config('request.jwt.claims',
  jsonb_build_object('sub', '26117000-0000-4000-a000-000000000001', 'role', 'authenticated', 'aal', 'aal1',
    'app_metadata', jsonb_build_object('vamos_role', 'admin'))::text,
  true);
select lives_ok(
  format($f$select public.ops_refund_decide(%L::uuid, 'decline')$f$, (select h3 from fx)),
  'D-24: the admin declines a pending_ops refund');
select throws_ok(
  format($f$select public.ops_refund_decide(%L::uuid, 'decline')$f$, (select h3 from fx)),
  'P0001', 'not-pending', 'decline twice is refused (not-pending)');
select throws_ok(
  format($f$select public.ops_refund_decide(%L::uuid, 'maybe')$f$, (select h10 from fx)),
  '22023', 'invalid-decision', 'an unknown decision is refused');
select throws_ok(
  format($f$select public.ops_refund_decide(%L::uuid, 'reject')$f$, (select h10 from fx)),
  'P0001', 'not-post-trip', 'reject is only for a trip that happened (D-25)');
select lives_ok(
  format($f$select public.ops_refund_decide(%L::uuid, 'reject')$f$, (select done_reject from fx)),
  'D-25: the admin rejects a post-trip refund request');
reset role;
select set_config('request.jwt.claims', '', true);

select ok(
  (select refund_status = 'declined' and refund_owed_rappen = 0
     from public.bookings where id = (select h3 from fx)),
  'decline -> refund_status declined, owed 0');

-- ── decisions are recorded ───────────────────────────────────────────────────────── 3
select ok(
  exists (select 1 from public.booking_events
           where booking_id = (select h3 from fx)
             and kind = 'refund.declined'
             and actor_kind = 'staff'
             and actor_id = (select admin_id from fx)),
  'decline writes a refund.declined event by the admin');
select ok(
  (select refund_status = 'declined' from public.bookings where id = (select done_reject from fx)),
  'reject -> refund_status declined');
select ok(
  exists (select 1 from public.booking_events
           where booking_id = (select done_reject from fx)
             and kind = 'refund.rejected'
             and actor_id = (select admin_id from fx)),
  'reject writes a refund.rejected event by the admin');

-- ── ops_refund_record: old 5-argument form, percentage, post_trip ───────────────── 11
select lives_ok(
  format($f$select * from public.ops_refund_record(%L::uuid, %s::bigint, %L::text, %L::uuid, null)$f$,
    (select h30 from fx), (select payment_id from pay where contact_email = 'rr-30h@vamostaxi.eu'),
    're_rr_30h', (select admin_id from fx)),
  'the 5-argument call form still works (Worker deployed before this migration)');
select ok(
  exists (select 1 from public.booking_refunds
           where stripe_refund_id = 're_rr_30h' and reason = 'ops_cancel'
             and refund_rappen = 8000 and refund_percent = 100),
  '5-argument form refunds the full remaining with reason ops_cancel');

select lives_ok(
  format($f$select * from app.apply_customer_cancel(%L::uuid, null, 'guest', 'rr', 'rr')$f$, (select h10 from fx)),
  'D-24: cancel 10 h before pickup lives');
select lives_ok(
  format($f$select * from public.ops_refund_record(%L::uuid, %s::bigint, %L::text, %L::uuid, null, null, 3200)$f$,
    (select h10 from fx), (select payment_id from pay where contact_email = 'rr-10h@vamostaxi.eu'),
    're_rr_10h', (select admin_id from fx)),
  'D-24: the admin records a 40 % refund');
select ok(
  exists (select 1 from public.booking_refunds
           where stripe_refund_id = 're_rr_10h' and refund_rappen = 3200
             and refund_percent = 40 and basis_rappen = 8000
             and decided_by = (select admin_id from fx)),
  'the percentage row carries 40 %, the recorded amount, and decided_by');
select ok(
  (select refund_status = 'refunded' and refunded_rappen = 3200 and refund_owed_rappen = 3200
     from public.bookings where id = (select h10 from fx)),
  'the decided percentage settles the pending_ops line: refunded, owed = refunded');
select throws_ok(
  format($f$select * from public.ops_refund_record(%L::uuid, %s::bigint, %L::text, %L::uuid, null, null, 9000)$f$,
    (select h10 from fx), (select payment_id from pay where contact_email = 'rr-10h@vamostaxi.eu'),
    're_rr_10h_over', (select admin_id from fx)),
  'P0001', 'refund-exceeds-remaining', 'an amount above the remaining capture is refused');
select throws_ok(
  format($f$select * from public.ops_refund_record(%L::uuid, %s::bigint, %L::text, %L::uuid, null, null, 0)$f$,
    (select h10 from fx), (select payment_id from pay where contact_email = 'rr-10h@vamostaxi.eu'),
    're_rr_10h_zero', (select admin_id from fx)),
  '22023', 'invalid-amount', 'a zero amount is refused');
select throws_ok(
  format($f$select * from public.ops_refund_record(%L::uuid, %s::bigint, %L::text, %L::uuid, null, 'bogus')$f$,
    (select done_accept from fx), (select payment_id from pay where contact_email = 'rr-done-accept@vamostaxi.eu'),
    're_rr_bogus', (select admin_id from fx)),
  '22023', 'invalid-reason', 'an unknown reason is refused');
select lives_ok(
  format($f$select * from public.ops_refund_record(%L::uuid, %s::bigint, %L::text, %L::uuid, p_reason => 'post_trip')$f$,
    (select done_accept from fx), (select payment_id from pay where contact_email = 'rr-done-accept@vamostaxi.eu'),
    're_rr_post', (select admin_id from fx)),
  'D-25: the admin accepts a post-trip request');
select ok(
  exists (select 1 from public.booking_refunds
           where stripe_refund_id = 're_rr_post' and reason = 'post_trip'
             and refund_rappen = 8000 and decided_by = (select admin_id from fx)),
  'D-25: post-trip accept records the full remaining with reason post_trip');

-- ── the owner still reads the refund line ────────────────────────────────────────── 2
select column_privs_are('public', 'bookings', 'refund_status', 'authenticated', '{SELECT}'::text[],
  'customer column grant on refund_status unchanged');
set local role vamos_guest;
select is(
  (select refund_status from public.manage_booking_read(extensions.digest('rr-3h-token', 'sha256'))),
  'declined', 'the booking owner (manage link) reads refund_status declined');
reset role;

select * from finish();
rollback;
