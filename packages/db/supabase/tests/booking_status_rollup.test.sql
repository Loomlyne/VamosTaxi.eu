-- booking_status_rollup.test.sql
--
-- 09-01 Wave 0: U21 roll-up + customer-cancel gates. Functions may land in 09-02.
-- D-10: all-cancelled legs → bookings.status cancelled, never refunded.
-- D-02: completed hides cancel; ops no_show → not_cancellable; after original
-- pickup (not completed) cancel still allowed, refund_mode none.
-- Synthetic integer rappen only. Rolled back. No LX1234. No TRIP.
begin;
select plan(24);

insert into public.vehicle_classes (slug, passenger_capacity, luggage_capacity)
values ('first', 3, 3);

insert into public.bookings (contact_name, contact_email, status)
values
  ('LC9 Rollup All Cancel', 'lc9-rollup-allcancel@vamostaxi.eu', 'confirmed'),
  ('LC9 Rollup No Show', 'lc9-rollup-noshow@vamostaxi.eu', 'confirmed'),
  ('LC9 Rollup Completed', 'lc9-rollup-completed@vamostaxi.eu', 'confirmed'),
  ('LC9 Rollup After Pickup', 'lc9-rollup-afterpickup@vamostaxi.eu', 'confirmed'),
  ('LC9 Ops Mark Complete', 'lc9-ops-mark-complete@vamostaxi.eu', 'confirmed'),
  ('LC9 Ops Mark NoShow', 'lc9-ops-mark-noshow@vamostaxi.eu', 'confirmed');

insert into public.booking_legs (
  booking_id, leg_seq, direction, pickup_text, dropoff_text,
  scheduled_at, scheduled_local, vehicle_class_id, status
)
select b.id, 1, 'outbound', 'ZRH Airport', 'Zurich HB',
       now() + interval '3 days',
       to_char(now() + interval '3 days', 'YYYY-MM-DD"T"HH24:MI'),
       vc.id, 'confirmed'
  from public.bookings b, public.vehicle_classes vc
 where b.contact_email in (
         'lc9-rollup-allcancel@vamostaxi.eu',
         'lc9-rollup-noshow@vamostaxi.eu',
         'lc9-rollup-completed@vamostaxi.eu',
         'lc9-ops-mark-complete@vamostaxi.eu',
         'lc9-ops-mark-noshow@vamostaxi.eu'
       )
   and vc.slug = 'first';

insert into public.booking_legs (
  booking_id, leg_seq, direction, pickup_text, dropoff_text,
  scheduled_at, scheduled_local, vehicle_class_id, status
)
select b.id, 2, 'outbound', 'Zurich HB', 'ZRH Airport',
       now() + interval '4 days',
       to_char(now() + interval '4 days', 'YYYY-MM-DD"T"HH24:MI'),
       vc.id, 'confirmed'
  from public.bookings b, public.vehicle_classes vc
 where b.contact_email = 'lc9-rollup-allcancel@vamostaxi.eu'
   and vc.slug = 'first';

-- After original pickup, not completed (D-02): cancel still allowed.
insert into public.booking_legs (
  booking_id, leg_seq, direction, pickup_text, dropoff_text,
  scheduled_at, scheduled_local, vehicle_class_id, status
)
select b.id, 1, 'outbound', 'ZRH Airport', 'Zurich HB',
       now() - interval '2 hours',
       to_char(now() - interval '2 hours', 'YYYY-MM-DD"T"HH24:MI'),
       vc.id, 'confirmed'
  from public.bookings b, public.vehicle_classes vc
 where b.contact_email = 'lc9-rollup-afterpickup@vamostaxi.eu'
   and vc.slug = 'first';

insert into public.booking_access_tokens (booking_id, token_hash, expires_at)
select b.id, extensions.digest('lc9-rollup-noshow', 'sha256'), now() + interval '1 day'
  from public.bookings b where b.contact_email = 'lc9-rollup-noshow@vamostaxi.eu';
insert into public.booking_access_tokens (booking_id, token_hash, expires_at)
select b.id, extensions.digest('lc9-rollup-completed', 'sha256'), now() + interval '1 day'
  from public.bookings b where b.contact_email = 'lc9-rollup-completed@vamostaxi.eu';
insert into public.booking_access_tokens (booking_id, token_hash, expires_at)
select b.id, extensions.digest('lc9-rollup-afterpickup', 'sha256'), now() + interval '1 day'
  from public.bookings b where b.contact_email = 'lc9-rollup-afterpickup@vamostaxi.eu';

create temporary table fx as
select
  (select id from public.bookings where contact_email = 'lc9-rollup-allcancel@vamostaxi.eu') as all_cancelled,
  (select id from public.bookings where contact_email = 'lc9-rollup-noshow@vamostaxi.eu') as no_show,
  (select id from public.bookings where contact_email = 'lc9-rollup-completed@vamostaxi.eu') as completed,
  (select id from public.bookings where contact_email = 'lc9-rollup-afterpickup@vamostaxi.eu') as after_pickup,
  (select id from public.bookings where contact_email = 'lc9-ops-mark-complete@vamostaxi.eu') as ops_complete,
  (select id from public.bookings where contact_email = 'lc9-ops-mark-noshow@vamostaxi.eu') as ops_no_show;

select has_function(
  'public',
  'recompute_booking_status',
  'public.recompute_booking_status exists'
);

select function_privs_are(
  'public',
  'recompute_booking_status',
  '{uuid}'::text[],
  'anon',
  '{}'::text[],
  'recompute_booking_status: anon holds no EXECUTE'
);

update public.booking_legs
   set status = 'cancelled'
 where booking_id = (select all_cancelled from fx);

select lives_ok(
  format(
    $f$select public.recompute_booking_status(%L::uuid)$f$,
    (select all_cancelled from fx)
  ),
  'recompute_booking_status on all-cancelled legs lives'
);

select is(
  (select status from public.bookings where id = (select all_cancelled from fx))::text,
  'cancelled',
  'D-10: all-cancelled legs → bookings.status cancelled'
);

select isnt(
  (select status from public.bookings where id = (select all_cancelled from fx))::text,
  'refunded',
  'D-10: bookings.status is never refunded (refund is a money line)'
);

update public.booking_legs
   set status = 'no_show'
 where booking_id = (select no_show from fx);

select lives_ok(
  format(
    $f$select public.recompute_booking_status(%L::uuid)$f$,
    (select no_show from fx)
  ),
  'recompute_booking_status on ops no_show lives'
);

select is(
  (select status from public.bookings where id = (select no_show from fx))::text,
  'no_show',
  'ops-marked no_show on the only leg → bookings.status no_show'
);

select throws_ok(
  $$ select * from public.manage_booking_cancel(extensions.digest('lc9-rollup-noshow', 'sha256')) $$,
  'P0001',
  'not_cancellable',
  'ops no_show → not_cancellable'
);

update public.booking_legs
   set status = 'completed'
 where booking_id = (select completed from fx);

select lives_ok(
  format(
    $f$select public.recompute_booking_status(%L::uuid)$f$,
    (select completed from fx)
  ),
  'recompute_booking_status on completed lives'
);

select throws_ok(
  $$ select * from public.manage_booking_cancel(extensions.digest('lc9-rollup-completed', 'sha256')) $$,
  'P0001',
  'not_cancellable',
  'completed hides customer cancel (not_cancellable)'
);

select lives_ok(
  $$ select * from public.manage_booking_cancel(extensions.digest('lc9-rollup-afterpickup', 'sha256')) $$,
  'D-02: after original pickup, not completed: cancel still allowed'
);

select is(
  (select refund_mode
     from public.compute_cancellation_refund((select after_pickup from fx))),
  'none',
  'D-02: after original pickup, refund_mode none'
);

select is(
  (select status from public.bookings where id = (select after_pickup from fx))::text,
  'cancelled',
  'after-pickup cancel leaves bookings.status cancelled (D-10)'
);

select has_function(
  'public',
  'ops_mark_complete',
  'public.ops_mark_complete exists'
);

select has_function(
  'public',
  'ops_mark_no_show',
  'public.ops_mark_no_show exists'
);

select function_privs_are(
  'public',
  'ops_mark_complete',
  '{uuid,uuid,bytea}'::text[],
  'anon',
  '{}'::text[],
  'ops_mark_complete: anon holds no EXECUTE'
);

select function_privs_are(
  'public',
  'ops_mark_no_show',
  '{uuid,uuid,bytea}'::text[],
  'anon',
  '{}'::text[],
  'ops_mark_no_show: anon holds no EXECUTE'
);

insert into public.booking_access_tokens (booking_id, token_hash, expires_at)
select b.id, extensions.digest('lc9-ops-mark-complete', 'sha256'), now() + interval '1 day'
  from public.bookings b where b.contact_email = 'lc9-ops-mark-complete@vamostaxi.eu';

select lives_ok(
  format(
    $f$select * from public.ops_mark_complete(%L::uuid, '00000000-0000-0000-0000-000000000001'::uuid)$f$,
    (select ops_complete from fx)
  ),
  'ops_mark_complete lives'
);

select is(
  (select status from public.bookings where id = (select ops_complete from fx))::text,
  'completed',
  'ops_mark_complete rolls up bookings.status completed'
);

select throws_ok(
  $$ select * from public.manage_booking_cancel(extensions.digest('lc9-ops-mark-complete', 'sha256')) $$,
  'P0001',
  'not_cancellable',
  'ops_mark_complete hides customer cancel'
);

select throws_ok(
  format(
    $f$select * from public.ops_mark_complete(%L::uuid, '00000000-0000-0000-0000-000000000001'::uuid)$f$,
    (select ops_complete from fx)
  ),
  'P0001',
  'frozen',
  'ops_mark_complete on completed is frozen'
);

select lives_ok(
  format(
    $f$select * from public.ops_mark_no_show(%L::uuid, '00000000-0000-0000-0000-000000000001'::uuid)$f$,
    (select ops_no_show from fx)
  ),
  'ops_mark_no_show lives'
);

select is(
  (select status from public.bookings where id = (select ops_no_show from fx))::text,
  'no_show',
  'ops_mark_no_show rolls up bookings.status no_show'
);

select is(
  (select count(*)::int from public.booking_refunds
    where booking_id = (select ops_no_show from fx)),
  0,
  'ops_mark_no_show does not auto-refund'
);

select * from finish();
rollback;
