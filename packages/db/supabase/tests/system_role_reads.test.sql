-- system_role_reads.test.sql
--
-- Plan 26.3-01 (D-39, root cause 2 of VT-26-0737). Every SQL statement
-- apps/web/lib/checkout/notify.ts issues under asSystem (SET ROLE vamos_system)
-- must run as vamos_system. The raw price_snapshots read that caused the
-- 42501 is proven forbidden, which is why notify.ts no longer issues it.
-- Fixture prefixed sys-reads-. Synthetic figures, rolled back.
begin;
select plan(12);

insert into public.vehicle_classes (slug, name, passenger_capacity, luggage_capacity)
values ('first', 'Sys-reads class', 3, 3);
insert into public.rate_versions (slug, label) values ('sys-reads-rv', 'sys-reads rate fixture');
insert into public.settings_versions (slug, label) values ('sys-reads-policy', 'sys-reads policy fixture');
update public.rate_versions set status = 'live' where slug = 'sys-reads-rv';

insert into public.bookings (contact_name, contact_email)
values ('sys-reads Booking', 'sys-reads-booking@example.test');

insert into public.booking_legs (booking_id, leg_seq, direction, pickup_text, dropoff_text,
                                  scheduled_at, scheduled_local, vehicle_class_id)
select b.id, 1, 'outbound', 'ZRH', 'Zurich HB', now() + interval '3 days',
       to_char(now() + interval '3 days', 'YYYY-MM-DD"T"HH24:MI'), vc.id
  from public.bookings b, public.vehicle_classes vc
 where b.contact_email = 'sys-reads-booking@example.test' and vc.slug = 'first';

insert into public.price_snapshots (
  quote_id, vehicle_class_id, rate_version_id, rate_version_is_live, settings_version_id,
  engine_version, pax, bags, lines, policy, booking_id,
  subtotal_rappen, surcharges_rappen, discount_rappen, total_rappen, expires_at, quote_lock_expires_at
)
select gen_random_uuid(), vc.id, rv.id, true, sv.id,
       'sys-reads@s1', 1, 0, jsonb_build_array(jsonb_build_object(
         'seq', 1, 'code', 'distance_fare', 'kind', 'fare',
         'i18n_key', 'price.line.transfer', 'amount_rappen', 6
       )),
       jsonb_build_object('cancellation_tiers', '[]'::jsonb, 'free_cancel_hours', 24,
                          'airport_waiting_minutes', 60, 'city_waiting_minutes', 15,
                          'settings_version_id', 1, 'modification_deadline_hours', 24,
                          'min_advance_minutes', 180, 'policy_doc', 'test'),
       b.id, 6, 0, 0, 6, now() + interval '30 minutes', now() + interval '30 minutes'
  from public.vehicle_classes vc, public.rate_versions rv, public.settings_versions sv,
       public.bookings b
 where vc.slug = 'first' and rv.slug = 'sys-reads-rv' and sv.slug = 'sys-reads-policy'
   and b.contact_email = 'sys-reads-booking@example.test';

create temporary table sr as
select b.id as booking_id from public.bookings b
 where b.contact_email = 'sys-reads-booking@example.test';
grant select on sr to public;

update public.bookings set price_snapshot_id =
  (select id from public.price_snapshots where engine_version = 'sys-reads@s1')
 where id = (select booking_id from sr);

create temporary table sr_claim (id bigint);
grant all on sr_claim to public;

set local role vamos_system;

select lives_ok(
  $$ select public.checkout_issue_manage_token(
       (select booking_id from sr),
       sha256('sys-reads-token'::bytea),
       now() + interval '30 days') $$,
  'vamos_system: checkout_issue_manage_token'
);
select lives_ok(
  $$ select * from public.checkout_booking_for_email((select booking_id from sr)) $$,
  'vamos_system: select * from checkout_booking_for_email'
);
select lives_ok(
  $$ insert into sr_claim
     select public.notification_claim((select booking_id from sr), 'confirmation', null::uuid,
                                      'email', 'en', 'confirmation@2026-09-30-1') $$,
  'vamos_system: notification_claim'
);
select isnt((select id from sr_claim), null, 'notification_claim returned a claim id');
select lives_ok(
  $$ select public.notification_settle((select id from sr_claim), null::text, 'resend_failed') $$,
  'vamos_system: notification_settle (failure)'
);
select lives_ok(
  $$ select * from public.notification_sweep('0 seconds'::interval, array['confirmation']::text[]) $$,
  'vamos_system: notification_sweep'
);
select lives_ok(
  $$ select * from public.notification_confirmation_missing('10 minutes'::interval) $$,
  'vamos_system: notification_confirmation_missing'
);
select lives_ok(
  $$ select public.notification_settle((select id from sr_claim), 'msg_sys_reads', null::text) $$,
  'vamos_system: notification_settle (success after a failure)'
);

-- Root cause 2: the raw read notify.ts used to issue.
select throws_ok(
  $$ select policy from public.price_snapshots limit 1 $$,
  '42501',
  null,
  'vamos_system cannot SELECT price_snapshots (the VT-26-0737 failure)'
);

reset role;

-- customer_id_for_user (D-32): vamos_checkout only.
select has_function('public', 'customer_id_for_user', array['uuid'], 'customer_id_for_user(uuid) exists');
select function_privs_are('public', 'customer_id_for_user', '{uuid}'::text[],
  'vamos_checkout', '{EXECUTE}'::text[], 'customer_id_for_user: vamos_checkout holds EXECUTE');
select function_privs_are('public', 'customer_id_for_user', '{uuid}'::text[],
  'anon', '{}'::text[], 'customer_id_for_user: anon holds no EXECUTE');

select * from finish();
rollback;
