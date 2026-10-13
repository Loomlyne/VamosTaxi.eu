-- edit_request_retired_class.test.sql
--
-- Phase 30 (vehicle class lifecycle), plan 30-03, migration 20261012220000_edit_request_retired_class.sql.
--   Decision 8: Accept on a customer edit request is refused while the trip's class, or the class the
--   request names, is retired. acceptPaidEdit asks public.booking_edit_request_class_retired(uuid) inside
--   asSystem; vamos_system is definer-only, so the answer must come from a SECURITY DEFINER function.
-- Fixtures modelled on assign_retired_class.test.sql. Rolled back. Synthetic 1-rappen figures only,
-- never a product CHF.
begin;
select plan(13);

-- ── fixtures ────────────────────────────────────────────────────────────────────────────────────
insert into public.vehicle_classes (slug, name, passenger_capacity, luggage_capacity, active)
values ('er-live', 'ER live class', 6, 6, true),
       ('er-gone', 'ER retired class', 6, 6, true);

-- label, class slug of the leg, payload
create temporary table er_spec (label text, cls text, payload jsonb);
insert into er_spec values
  ('a', 'er-gone', '{"scheduled_local":"2031-01-01T10:00"}'),   -- leg in the retired class
  ('b', 'er-live', '{"vehicle_class_slug":"er-gone"}'),          -- Live leg, request names the retired class
  ('c', 'er-live', '{"vehicle_class_slug":"er-live"}'),          -- both Live
  ('d', 'er-live', '{"scheduled_local":"2031-01-01T10:00"}');    -- Live leg, no class in the request

insert into public.bookings (reference, contact_name, contact_email, status, locale)
select public.next_booking_reference(), 'ER ' || s.label, 'er-' || s.label || '@vamostaxi.eu',
       'confirmed'::public.booking_status, 'en'
  from er_spec s;

insert into public.booking_legs (
  booking_id, leg_seq, direction, pickup_text, dropoff_text,
  scheduled_at, scheduled_local, vehicle_class_id, estimated_duration_minutes, pax, bags
)
select b.id, 1, 'outbound', 'ZRH Airport', 'Zurich HB',
       now() + interval '5 days', to_char(now() + interval '5 days', 'YYYY-MM-DD"T"HH24:MI'),
       vc.id, 60, 2, 2
  from er_spec s
  join public.bookings b on b.contact_email = 'er-' || s.label || '@vamostaxi.eu'
  join public.vehicle_classes vc on vc.slug = s.cls;

set local session_replication_role = replica;
create temporary table er_ps (n int, id bigint);
with ins as (
  insert into public.price_snapshots (
    quote_id, vehicle_class_id, rate_version_id, rate_version_is_live, settings_version_id,
    engine_version, pax, bags, lines, policy,
    subtotal_rappen, surcharges_rappen, discount_rappen, total_rappen,
    expires_at, quote_lock_expires_at
  )
  select
    gen_random_uuid(), vc.id, rv.id, false, sv.id, 'quote-engine@er', 2, 2, '[]'::jsonb,
    jsonb_build_object('cancellation_tiers', '[]'::jsonb, 'free_cancel_hours', 24,
                       'airport_waiting_minutes', 60, 'city_waiting_minutes', 15,
                       'settings_version_id', sv.id, 'modification_deadline_hours', 24,
                       'min_advance_minutes', 180, 'policy_doc', 'test'),
    1, 0, 0, 1, now() + interval '1 day', now() + interval '1 day'
  from public.vehicle_classes vc
  cross join lateral (select id from public.rate_versions order by id limit 1) rv
  cross join lateral (select id from public.settings_versions order by id limit 1) sv
  cross join generate_series(1, 4) as g(n)
  where vc.slug = 'er-live'
  returning id
)
insert into er_ps select row_number() over (order by id), id from ins;

-- a captured payment for every trip (an edit request exists only on a paid booking)
insert into public.booking_payments (booking_id, snapshot_id, stripe_payment_intent_id, charged_rappen, status, captured_at)
select b.id, p.id, 'pi_er_' || x.label, 1, 'succeeded', now()
  from (select label, row_number() over (order by label) as n from er_spec) x
  join er_ps p on p.n = x.n
  join public.bookings b on b.contact_email = 'er-' || x.label || '@vamostaxi.eu';
set local session_replication_role = origin;

insert into public.booking_edit_requests (booking_id, actor, quote_snapshot_id, status, payload)
select b.id, 'customer', p.id, 'requested', x.payload
  from (select label, payload, row_number() over (order by label) as n from er_spec) x
  join er_ps p on p.n = x.n
  join public.bookings b on b.contact_email = 'er-' || x.label || '@vamostaxi.eu';

update public.vehicle_classes set hidden_at = now(), active = false where slug = 'er-gone';

create temporary table fx as
select
  (select r.id from public.booking_edit_requests r join public.bookings b on b.id = r.booking_id
    where b.contact_email = 'er-a@vamostaxi.eu') as r_a,
  (select r.id from public.booking_edit_requests r join public.bookings b on b.id = r.booking_id
    where b.contact_email = 'er-b@vamostaxi.eu') as r_b,
  (select r.id from public.booking_edit_requests r join public.bookings b on b.id = r.booking_id
    where b.contact_email = 'er-c@vamostaxi.eu') as r_c,
  (select r.id from public.booking_edit_requests r join public.bookings b on b.id = r.booking_id
    where b.contact_email = 'er-d@vamostaxi.eu') as r_d;
grant select on fx to public;

-- ── privileges ──────────────────────────────────────────────────────────────────────────────────
-- service_role is not asserted: live holds a default EXECUTE for it on new functions.
select has_function('public', 'booking_edit_request_class_retired', array['uuid'],
  'booking_edit_request_class_retired(uuid) exists');
select ok((select prosecdef and proconfig = array['search_path=""']
             from pg_proc where oid = 'public.booking_edit_request_class_retired(uuid)'::regprocedure),
  'SECURITY DEFINER with an empty search_path');
select ok(has_function_privilege('vamos_system', 'public.booking_edit_request_class_retired(uuid)', 'execute'),
  'vamos_system can execute it');
select ok(not has_function_privilege('anon', 'public.booking_edit_request_class_retired(uuid)', 'execute'),
  'anon cannot execute it');
select ok(not has_function_privilege('authenticated', 'public.booking_edit_request_class_retired(uuid)', 'execute'),
  'authenticated cannot execute it');

-- ── answers ─────────────────────────────────────────────────────────────────────────────────────
select is(public.booking_edit_request_class_retired((select r_a from fx)), true,
  'true: the trip''s leg is in a retired class');
select is(public.booking_edit_request_class_retired((select r_b from fx)), true,
  'true: the leg is Live but the request names a retired class');
select is(public.booking_edit_request_class_retired((select r_c from fx)), false,
  'false: leg and requested class are both Live');
select is(public.booking_edit_request_class_retired((select r_d from fx)), false,
  'false: Live leg, the request names no class');
select is(public.booking_edit_request_class_retired(gen_random_uuid()), false,
  'false: an unknown request id');

-- ── as vamos_system (definer-only: no table grants), the way acceptPaidEdit calls it ────────────
set local role vamos_system;
select throws_ok($$select 1 from public.booking_edit_requests limit 1$$, '42501', null,
  'vamos_system cannot read booking_edit_requests directly (the old raw query failed here)');
select is(public.booking_edit_request_class_retired((select r_a from fx)), true,
  'as vamos_system: true for the trip in a retired class');
select is(public.booking_edit_request_class_retired((select r_c from fx)), false,
  'as vamos_system: false when both classes are Live');
reset role;

select * from finish();
rollback;
