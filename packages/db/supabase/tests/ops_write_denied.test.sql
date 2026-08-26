-- ops_write_denied.test.sql
--
-- Proves the ledger set (booking_events, price_snapshots, price_snapshot_legs, booking_payments,
-- booking_refunds, booking_notifications, stripe_events -- seven tables) is SELECT-only for
-- vamos_staff, even at aal2 with admin claims: no INSERT, no UPDATE, no DELETE anywhere in the
-- set. A dispatcher (or a stolen dispatcher/admin JWT) must never be able to forge a settlement,
-- a price decision, or a webhook idempotency row.
begin;
select plan(13);

insert into auth.users (id, email, aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('e0000000-0000-0000-0000-00000000000a', 'owd-admin@vamostaxi.eu', 'authenticated', 'authenticated', '{}'::jsonb, '{}'::jsonb, now(), now());
insert into public.staff (user_id, role, active) values ('e0000000-0000-0000-0000-00000000000a', 'admin', true);

set local role vamos_staff;
select set_config('request.jwt.claims',
  jsonb_build_object('sub', 'e0000000-0000-0000-0000-00000000000a', 'role', 'authenticated', 'aal', 'aal2',
    'app_metadata', jsonb_build_object('vamos_role', 'admin'))::text,
  true);

select throws_ok(
  $$ insert into public.booking_events (booking_id, kind, actor_kind, actor_label)
     values (gen_random_uuid(), 'note.added', 'staff', 'Admin') $$,
  '42501', null,
  '(1) vamos_staff at aal2 cannot INSERT into booking_events'
);
select throws_ok(
  $$ insert into public.price_snapshots (quote_id, vehicle_class_id, rate_version_id,
       rate_version_is_live, settings_version_id, engine_version, pax, bags, lines, policy, expires_at)
     values (gen_random_uuid(), gen_random_uuid(), 1, true, 1, 'x', 1, 0, '[]'::jsonb, '{}'::jsonb, now()) $$,
  '42501', null,
  '(2) vamos_staff at aal2 cannot INSERT into price_snapshots'
);
select throws_ok(
  $$ update public.booking_payments set status = 'succeeded' $$,
  '42501', null,
  '(3) vamos_staff at aal2 cannot UPDATE booking_payments'
);
select throws_ok(
  $$ delete from public.stripe_events $$,
  '42501', null,
  '(4) vamos_staff at aal2 cannot DELETE from stripe_events'
);
select throws_ok(
  $$ delete from public.booking_refunds $$,
  '42501', null,
  '(5) vamos_staff at aal2 cannot DELETE from booking_refunds'
);
select lives_ok(
  $$ select count(*) from public.booking_events $$,
  '(6) vamos_staff at aal2 can SELECT booking_events (SELECT is granted)'
);
reset role;

select table_privs_are('public', 'booking_events', 'vamos_staff', array['SELECT'], '(7) vamos_staff holds exactly SELECT on booking_events');
select table_privs_are('public', 'price_snapshots', 'vamos_staff', array['SELECT'], '(8) vamos_staff holds exactly SELECT on price_snapshots');
select table_privs_are('public', 'price_snapshot_legs', 'vamos_staff', array['SELECT'], '(9) vamos_staff holds exactly SELECT on price_snapshot_legs');
select table_privs_are('public', 'booking_payments', 'vamos_staff', array['SELECT'], '(10) vamos_staff holds exactly SELECT on booking_payments');
select table_privs_are('public', 'booking_refunds', 'vamos_staff', array['SELECT'], '(11) vamos_staff holds exactly SELECT on booking_refunds');
select table_privs_are('public', 'booking_notifications', 'vamos_staff', array['SELECT'], '(12) vamos_staff holds exactly SELECT on booking_notifications');
-- stripe_events' SELECT grant to vamos_staff is COLUMN-scoped (F-11 excludes `payload`), and
-- has_table_privilege() -- what table_privs_are checks -- only reports a WHOLE-TABLE grant, so
-- the correct expectation here is zero table-level privileges, not SELECT. The column-scoped
-- grant itself (and payload's exclusion from it) is proved directly in fail_closed.test.sql and
-- ops_role_rls.test.sql via column_privs_are / information_schema.column_privileges.
select table_privs_are('public', 'stripe_events', 'vamos_staff', array[]::text[], '(13) vamos_staff holds zero WHOLE-TABLE privileges on stripe_events -- its SELECT is column-scoped, excluding payload (F-11)');

select * from finish();
rollback;
