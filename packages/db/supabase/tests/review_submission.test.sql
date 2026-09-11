-- review_submission.test.sql
--
-- 09-01 Wave 0: D-18 submit_review allow/deny. Function may land in 09-03.
-- Refuses unpaid and cancelled (cancelled+refunded still refused).
-- Allows captured paid/confirmed/assigned, completed, paid no-show,
-- and completed/no_show after an ops refund.
-- Inserts public.reviews.booking_id. Synthetic integer rappen only.
-- Rolled back. No LX1234. No TRIP. No EXECUTE to anon.
begin;
select plan(15);

insert into public.vehicle_classes (slug, passenger_capacity, luggage_capacity)
values ('lc9-review', 3, 3);

insert into public.bookings (contact_name, contact_email, status)
values
  ('LC9 Review Unpaid', 'lc9-rev-unpaid@vamostaxi.eu', 'pending'),
  ('LC9 Review Cancelled', 'lc9-rev-cancelled@vamostaxi.eu', 'cancelled'),
  ('LC9 Review Cancel Refunded', 'lc9-rev-cancel-refunded@vamostaxi.eu', 'cancelled'),
  ('LC9 Review Paid', 'lc9-rev-paid@vamostaxi.eu', 'paid'),
  ('LC9 Review Confirmed', 'lc9-rev-confirmed@vamostaxi.eu', 'confirmed'),
  ('LC9 Review Assigned', 'lc9-rev-assigned@vamostaxi.eu', 'assigned'),
  ('LC9 Review Completed', 'lc9-rev-completed@vamostaxi.eu', 'completed'),
  ('LC9 Review No Show', 'lc9-rev-noshow@vamostaxi.eu', 'no_show'),
  ('LC9 Review Completed Refund', 'lc9-rev-completed-refund@vamostaxi.eu', 'completed'),
  ('LC9 Review NoShow Refund', 'lc9-rev-noshow-refund@vamostaxi.eu', 'no_show');

insert into public.booking_legs (
  booking_id, leg_seq, direction, pickup_text, dropoff_text,
  scheduled_at, scheduled_local, vehicle_class_id, status
)
select b.id, 1, 'outbound', 'ZRH Airport', 'Zurich HB',
       now() + interval '2 days',
       to_char(now() + interval '2 days', 'YYYY-MM-DD"T"HH24:MI'),
       vc.id, 'confirmed'
  from public.bookings b, public.vehicle_classes vc
 where b.contact_email like 'lc9-rev-%@vamostaxi.eu'
   and vc.slug = 'lc9-review';

insert into public.booking_access_tokens (booking_id, token_hash, expires_at)
select b.id, extensions.digest(split_part(b.contact_email, '@', 1), 'sha256'), now() + interval '1 day'
  from public.bookings b
 where b.contact_email like 'lc9-rev-%@vamostaxi.eu';

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
  'quote-engine@09-01-review-' || b.contact_email,
  2, 2,
  '[]'::jsonb,
  '{}'::jsonb,
  1, 0, 0, 1,
  now() + interval '1 day',
  now() + interval '1 day',
  b.id
from public.bookings b
join public.vehicle_classes vc on vc.slug = 'lc9-review'
cross join lateral (select id from public.rate_versions order by id limit 1) rv
cross join lateral (select id from public.settings_versions order by id limit 1) sv
where b.contact_email like 'lc9-rev-%@vamostaxi.eu'
  and b.contact_email <> 'lc9-rev-unpaid@vamostaxi.eu';

update public.bookings b
   set price_snapshot_id = s.id
  from public.price_snapshots s
 where s.booking_id = b.id
   and s.engine_version like 'quote-engine@09-01-review-%';

insert into public.booking_payments (
  booking_id, snapshot_id, stripe_payment_intent_id, charged_rappen, status, captured_at
)
select b.id, b.price_snapshot_id, 'pi_lc9_rev_' || replace(b.contact_email, '@', '_'),
       1, 'succeeded', now()
  from public.bookings b
 where b.contact_email like 'lc9-rev-%@vamostaxi.eu'
   and b.contact_email <> 'lc9-rev-unpaid@vamostaxi.eu';

insert into public.booking_refunds (
  booking_id, snapshot_id, payment_id, reason,
  basis_rappen, refund_percent, refund_rappen, tier_applied, hours_before,
  stripe_refund_id
)
select b.id, b.price_snapshot_id, p.id, 'ops_cancel',
       1, 100, 1, '{}'::jsonb, 0,
       're_lc9_rev_' || replace(b.contact_email, '@', '_')
  from public.bookings b
  join public.booking_payments p on p.booking_id = b.id
 where b.contact_email in (
   'lc9-rev-cancel-refunded@vamostaxi.eu',
   'lc9-rev-completed-refund@vamostaxi.eu',
   'lc9-rev-noshow-refund@vamostaxi.eu'
 );

set local session_replication_role = origin;

select has_function(
  'public',
  'submit_review',
  'public.submit_review exists'
);

select has_column(
  'public',
  'reviews',
  'booking_id',
  'public.reviews.booking_id exists (D-18)'
);

select function_privs_are(
  'public',
  'submit_review',
  '{bytea,int2,int2,int2,text,text}'::text[],
  'anon',
  '{}'::text[],
  'submit_review: anon holds no EXECUTE'
);

select throws_ok(
  $$ select * from public.submit_review(
       extensions.digest('lc9-rev-unpaid', 'sha256'),
       5::smallint, 5::smallint, 5::smallint, null, null) $$,
  'P0001',
  'not_reviewable',
  'D-18: submit_review refuses unpaid'
);

select throws_ok(
  $$ select * from public.submit_review(
       extensions.digest('lc9-rev-cancelled', 'sha256'),
       5::smallint, 5::smallint, 5::smallint, null, null) $$,
  'P0001',
  'not_reviewable',
  'D-18: submit_review refuses cancelled'
);

select throws_ok(
  $$ select * from public.submit_review(
       extensions.digest('lc9-rev-cancel-refunded', 'sha256'),
       5::smallint, 5::smallint, 5::smallint, null, null) $$,
  'P0001',
  'not_reviewable',
  'D-18: cancelled+refunded still refused'
);

select lives_ok(
  $$ select * from public.submit_review(
       extensions.digest('lc9-rev-paid', 'sha256'),
       5::smallint, 5::smallint, 5::smallint, 'paid ok', null) $$,
  'D-18: captured paid allowed'
);

select lives_ok(
  $$ select * from public.submit_review(
       extensions.digest('lc9-rev-confirmed', 'sha256'),
       5::smallint, 5::smallint, 5::smallint, 'confirmed ok', null) $$,
  'D-18: captured confirmed allowed'
);

select lives_ok(
  $$ select * from public.submit_review(
       extensions.digest('lc9-rev-assigned', 'sha256'),
       5::smallint, 5::smallint, 5::smallint, 'assigned ok', null) $$,
  'D-18: captured assigned allowed'
);

select lives_ok(
  $$ select * from public.submit_review(
       extensions.digest('lc9-rev-completed', 'sha256'),
       5::smallint, 5::smallint, 5::smallint, 'completed ok', null) $$,
  'D-18: completed allowed'
);

select lives_ok(
  $$ select * from public.submit_review(
       extensions.digest('lc9-rev-noshow', 'sha256'),
       5::smallint, 5::smallint, 5::smallint, 'paid no-show ok', null) $$,
  'D-18: paid no-show allowed'
);

select lives_ok(
  $$ select * from public.submit_review(
       extensions.digest('lc9-rev-completed-refund', 'sha256'),
       5::smallint, 5::smallint, 5::smallint, 'completed after ops refund', null) $$,
  'D-18: completed after ops refund allowed'
);

select lives_ok(
  $$ select * from public.submit_review(
       extensions.digest('lc9-rev-noshow-refund', 'sha256'),
       5::smallint, 5::smallint, 5::smallint, 'no_show after ops refund', null) $$,
  'D-18: no_show after ops refund allowed'
);

select is(
  (select count(*)::int
     from public.reviews r
     join public.bookings b on b.id = r.booking_id
    where b.contact_email in (
      'lc9-rev-paid@vamostaxi.eu',
      'lc9-rev-confirmed@vamostaxi.eu',
      'lc9-rev-assigned@vamostaxi.eu',
      'lc9-rev-completed@vamostaxi.eu',
      'lc9-rev-noshow@vamostaxi.eu',
      'lc9-rev-completed-refund@vamostaxi.eu',
      'lc9-rev-noshow-refund@vamostaxi.eu'
    )),
  7,
  'D-18: allowed submits insert public.reviews with booking_id'
);

select is(
  (select count(*)::int
     from public.reviews r
     join public.bookings b on b.id = r.booking_id
    where b.contact_email in (
      'lc9-rev-unpaid@vamostaxi.eu',
      'lc9-rev-cancelled@vamostaxi.eu',
      'lc9-rev-cancel-refunded@vamostaxi.eu'
    )),
  0,
  'D-18: refused states leave no reviews.booking_id row'
);

select * from finish();
rollback;
