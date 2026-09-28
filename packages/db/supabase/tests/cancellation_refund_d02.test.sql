-- cancellation_refund_d02.test.sql
--
-- 09-01 Wave 0: D-02 windows vs original_scheduled_at AT TIME ZONE Europe/Zurich (D-26).
-- D-04: auto_full is 100% of captured charged_rappen after coupon, not snapshot list.
-- Windows: >24h auto_full; 24h–6h pending_ops; ≤6h none. After pickup: none.
-- 26.1-17 D-24 (owner, 2026-09-27): everything inside 24 h -- including ≤6h and after pickup --
-- is now pending_ops: the admin approves and sets the percentage. The ≤6h / after-pickup
-- assertions below were updated to pending_ops, not deleted.
-- LIFE-02 live percent-inside-24h tier is superseded — D-02 has no such live tier.
-- Synthetic integer rappen only (comment rolled back, never a real amount). No LX1234. No TRIP.
begin;
select plan(14);

insert into public.vehicle_classes (slug, passenger_capacity, luggage_capacity)
values ('first', 3, 3);

insert into public.bookings (contact_name, contact_email, status)
values
  ('LC9 D02 Auto Full', 'lc9-d02-autofull@vamostaxi.eu', 'paid'),
  ('LC9 D02 Pending Ops', 'lc9-d02-pendingops@vamostaxi.eu', 'paid'),
  ('LC9 D02 None Window', 'lc9-d02-none@vamostaxi.eu', 'paid'),
  ('LC9 D02 Shifted', 'lc9-d02-shifted@vamostaxi.eu', 'paid'),
  ('LC9 D02 After Pickup', 'lc9-d02-afterpickup@vamostaxi.eu', 'paid');

insert into public.booking_legs (
  booking_id, leg_seq, direction, pickup_text, dropoff_text,
  scheduled_at, scheduled_local, vehicle_class_id, status
)
select b.id, 1, 'outbound', 'ZRH Airport', 'Zurich HB',
       now() + interval '48 hours',
       to_char(now() + interval '48 hours', 'YYYY-MM-DD"T"HH24:MI'),
       vc.id, 'confirmed'
  from public.bookings b, public.vehicle_classes vc
 where b.contact_email in (
         'lc9-d02-autofull@vamostaxi.eu',
         'lc9-d02-shifted@vamostaxi.eu'
       )
   and vc.slug = 'first';

insert into public.booking_legs (
  booking_id, leg_seq, direction, pickup_text, dropoff_text,
  scheduled_at, scheduled_local, vehicle_class_id, status
)
select b.id, 1, 'outbound', 'ZRH Airport', 'Zurich HB',
       now() + interval '12 hours',
       to_char(now() + interval '12 hours', 'YYYY-MM-DD"T"HH24:MI'),
       vc.id, 'confirmed'
  from public.bookings b, public.vehicle_classes vc
 where b.contact_email = 'lc9-d02-pendingops@vamostaxi.eu'
   and vc.slug = 'first';

insert into public.booking_legs (
  booking_id, leg_seq, direction, pickup_text, dropoff_text,
  scheduled_at, scheduled_local, vehicle_class_id, status
)
select b.id, 1, 'outbound', 'ZRH Airport', 'Zurich HB',
       now() + interval '3 hours',
       to_char(now() + interval '3 hours', 'YYYY-MM-DD"T"HH24:MI'),
       vc.id, 'confirmed'
  from public.bookings b, public.vehicle_classes vc
 where b.contact_email = 'lc9-d02-none@vamostaxi.eu'
   and vc.slug = 'first';

insert into public.booking_legs (
  booking_id, leg_seq, direction, pickup_text, dropoff_text,
  scheduled_at, scheduled_local, vehicle_class_id, status
)
select b.id, 1, 'outbound', 'ZRH Airport', 'Zurich HB',
       now() - interval '1 hour',
       to_char(now() - interval '1 hour', 'YYYY-MM-DD"T"HH24:MI'),
       vc.id, 'confirmed'
  from public.bookings b, public.vehicle_classes vc
 where b.contact_email = 'lc9-d02-afterpickup@vamostaxi.eu'
   and vc.slug = 'first';

-- D-26: shift scheduled_at close in; hours stay on original_scheduled_at (frozen at insert).
update public.booking_legs
   set scheduled_at = now() + interval '3 hours',
       scheduled_local = to_char(now() + interval '3 hours', 'YYYY-MM-DD"T"HH24:MI')
 where booking_id = (
   select id from public.bookings where contact_email = 'lc9-d02-shifted@vamostaxi.eu'
 );

insert into public.booking_access_tokens (booking_id, token_hash, expires_at)
select b.id, extensions.digest('lc9-d02-afterpickup', 'sha256'), now() + interval '1 day'
  from public.bookings b where b.contact_email = 'lc9-d02-afterpickup@vamostaxi.eu';

set local session_replication_role = replica;

insert into public.price_snapshots (
  quote_id, vehicle_class_id, rate_version_id, rate_version_is_live, settings_version_id,
  engine_version, pax, bags, lines, policy,
  subtotal_rappen, surcharges_rappen, discount_rappen, total_rappen,
  expires_at, quote_lock_expires_at, booking_id
)
select
  gen_random_uuid(),
  vc.id,
  rv.id,
  false,
  sv.id,
  'quote-engine@09-01-d02-' || b.contact_email,
  2, 2,
  '[]'::jsonb,
  jsonb_build_object(
    'cancellation_tiers', '[]'::jsonb,
    'free_cancel_hours', 24,
    'airport_waiting_minutes', 60,
    'city_waiting_minutes', 15,
    'settings_version_id', sv.id,
    'modification_deadline_hours', 24,
    'min_advance_minutes', 180,
    'policy_doc', 'd02'
  ),
  10000, 0, 0, 10000,
  now() + interval '1 day',
  now() + interval '1 day',
  b.id
from public.bookings b
join public.vehicle_classes vc on vc.slug = 'first'
cross join lateral (select id from public.rate_versions order by id limit 1) rv
cross join lateral (select id from public.settings_versions order by id limit 1) sv
where b.contact_email in (
  'lc9-d02-autofull@vamostaxi.eu',
  'lc9-d02-pendingops@vamostaxi.eu',
  'lc9-d02-none@vamostaxi.eu',
  'lc9-d02-shifted@vamostaxi.eu',
  'lc9-d02-afterpickup@vamostaxi.eu'
);

update public.bookings b
   set price_snapshot_id = s.id
  from public.price_snapshots s
 where s.booking_id = b.id
   and s.engine_version like 'quote-engine@09-01-d02-%';

-- Captured after coupon: 8000 rappen. Snapshot list stays 10000 (D-04).
insert into public.booking_payments (
  booking_id, snapshot_id, stripe_payment_intent_id, charged_rappen, status, captured_at
)
select b.id, b.price_snapshot_id, 'pi_lc9_d02_' || replace(b.contact_email, '@', '_'),
       8000, 'succeeded', now()
  from public.bookings b
 where b.contact_email in (
   'lc9-d02-autofull@vamostaxi.eu',
   'lc9-d02-pendingops@vamostaxi.eu',
   'lc9-d02-none@vamostaxi.eu',
   'lc9-d02-shifted@vamostaxi.eu',
   'lc9-d02-afterpickup@vamostaxi.eu'
 );

set local session_replication_role = origin;

create temporary table fx as
select
  (select id from public.bookings where contact_email = 'lc9-d02-autofull@vamostaxi.eu') as auto_full,
  (select id from public.bookings where contact_email = 'lc9-d02-pendingops@vamostaxi.eu') as pending_ops,
  (select id from public.bookings where contact_email = 'lc9-d02-none@vamostaxi.eu') as none_window,
  (select id from public.bookings where contact_email = 'lc9-d02-shifted@vamostaxi.eu') as shifted,
  (select id from public.bookings where contact_email = 'lc9-d02-afterpickup@vamostaxi.eu') as after_pickup;

select has_function(
  'public',
  'compute_cancellation_refund',
  'public.compute_cancellation_refund exists'
);

select function_privs_are(
  'public',
  'compute_cancellation_refund',
  '{uuid}'::text[],
  'anon',
  '{}'::text[],
  'compute_cancellation_refund: anon holds no EXECUTE'
);

select has_column(
  'public',
  'booking_legs',
  'original_scheduled_at',
  'booking_legs.original_scheduled_at exists (D-26)'
);

select ok(
  exists (
    select 1
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = 'compute_cancellation_refund'
       and pg_catalog.pg_get_functiondef(p.oid) like '%Europe/Zurich%'
  ),
  'compute_cancellation_refund hours use Europe/Zurich'
);

select ok(
  exists (
    select 1
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = 'compute_cancellation_refund'
       and pg_catalog.pg_get_functiondef(p.oid) like '%original_scheduled_at%'
  ),
  'hours vs original_scheduled_at, not shifted scheduled_at (D-26)'
);

select is(
  (select refund_mode from public.compute_cancellation_refund((select auto_full from fx))),
  'auto_full',
  'D-02: >24h → auto_full'
);

select is(
  (select refund_rappen from public.compute_cancellation_refund((select auto_full from fx)))::bigint,
  8000::bigint,
  'D-04: auto_full refund_rappen = captured charged_rappen after coupon'
);

select isnt(
  (select refund_rappen from public.compute_cancellation_refund((select auto_full from fx)))::bigint,
  10000::bigint,
  'D-04: auto_full is not snapshot list-price rappen'
);

select is(
  (select refund_mode from public.compute_cancellation_refund((select pending_ops from fx))),
  'pending_ops',
  'D-02: 24h–6h → pending_ops'
);

select is(
  (select refund_mode from public.compute_cancellation_refund((select none_window from fx))),
  'pending_ops',
  'D-24 (supersedes D-02 ≤6h none): ≤6h → pending_ops, the admin decides'
);

select is(
  (select refund_mode from public.compute_cancellation_refund((select shifted from fx))),
  'auto_full',
  'D-26: original_scheduled_at AT TIME ZONE Europe/Zurich wins over shifted scheduled_at'
);

select is(
  (select refund_mode from public.compute_cancellation_refund((select after_pickup from fx))),
  'pending_ops',
  'D-24 (supersedes D-02 after-pickup none): after original pickup, refund_mode pending_ops'
);

select lives_ok(
  $$ select * from public.manage_booking_cancel(extensions.digest('lc9-d02-afterpickup', 'sha256')) $$,
  'after original pickup cancel allowed (D-02); refund is admin-reviewed (D-24)'
);

select function_privs_are(
  'public',
  'manage_booking_cancel',
  '{bytea,int2}'::text[],
  'anon',
  '{}'::text[],
  'manage_booking_cancel: anon holds no EXECUTE'
);

select * from finish();
rollback;
