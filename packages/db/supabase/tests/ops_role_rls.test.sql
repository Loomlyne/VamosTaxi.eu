-- ops_role_rls.test.sql
--
-- Proves DATA-04 + AUTH-05's RLS half: `authenticated` (a customer) gets 42501 on ops data
-- (grant layer -- an empty result would be a failure of THIS test); `vamos_staff` at `aal1` is
-- not staff at all (policy layer: zero rows); at `aal2` with an active row, a dispatcher reaches
-- the working set but not the admin-only surfaces (rate_versions, staff writes); an inactive
-- staff row is revoked immediately. Plus the review-pass additions: F-02 (settings_versions
-- admin-only insert), F-08 (booking_access_tokens column split), F-11 (stripe_events.payload
-- excluded), F-18 (the dispatcher carve-out via app.rate_version_published is reachable, and
-- the freeze trigger still pins the amount independently of the RLS layer).
begin;
select plan(29);

-- Fixtures --------------------------------------------------------------------------------------
insert into public.vehicle_classes (slug, passenger_capacity, luggage_capacity)
values ('first', 3, 3);

insert into auth.users (id, email, aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('f0000000-0000-0000-0000-000000000001', 'orr-dispatcher@vamostaxi.eu', 'authenticated', 'authenticated', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('f0000000-0000-0000-0000-000000000002', 'orr-admin@vamostaxi.eu', 'authenticated', 'authenticated', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('f0000000-0000-0000-0000-000000000003', 'orr-inactive@vamostaxi.eu', 'authenticated', 'authenticated', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('f0000000-0000-0000-0000-000000000004', 'orr-customer@vamostaxi.eu', 'authenticated', 'authenticated', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('f0000000-0000-0000-0000-000000000005', 'orr-newhire@vamostaxi.eu', 'authenticated', 'authenticated', '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.staff (user_id, role, active) values
  ('f0000000-0000-0000-0000-000000000001', 'dispatcher', true),
  ('f0000000-0000-0000-0000-000000000002', 'admin', true),
  ('f0000000-0000-0000-0000-000000000003', 'dispatcher', false);

insert into public.chauffeurs (full_name, phone, licence_number, note)
values ('Chauffeur ORR', '+41 00 000 00 03', 'LIC-ORR-1', 'Speaks German');

insert into public.settings_versions (slug, label) values ('orr-policy', 'ops_role_rls fixture');

-- rv_draft: deliberately left with one UNPRICED distance_rates row, so an admin's publish
-- attempt raises tg_rate_version_transition's completeness check.
insert into public.rate_versions (slug, label) values ('orr-rv-draft', 'ops_role_rls draft fixture');
insert into public.distance_rates (rate_version_id, vehicle_class_id, max_pax, available)
select rv.id, vc.id, 3, true
  from public.rate_versions rv, public.vehicle_classes vc
 where rv.slug = 'orr-rv-draft' and vc.slug = 'first';

-- rv_live: fully priced (synthetic figures, rolled back at the end of this file -- never a real
-- CHF amount, D-34), published as postgres before any role switch below.
insert into public.rate_versions (slug, label) values ('orr-rv-live', 'ops_role_rls live fixture');
insert into public.distance_rates (rate_version_id, vehicle_class_id, max_pax, available,
                                    base_fare_rappen, per_km_rappen, min_fare_rappen)
select rv.id, vc.id, 3, true, 1, 2, 3
  from public.rate_versions rv, public.vehicle_classes vc
 where rv.slug = 'orr-rv-live' and vc.slug = 'first';
insert into public.service_zones (slug) values ('orr-zone-a'), ('orr-zone-b');
insert into public.fixed_routes (rate_version_id, origin_zone_id, dest_zone_id, vehicle_class_id,
                                  price_rappen, live)
select rv.id, za.id, zb.id, vc.id, 5, false
  from public.rate_versions rv, public.service_zones za, public.service_zones zb, public.vehicle_classes vc
 where rv.slug = 'orr-rv-live' and za.slug = 'orr-zone-a' and zb.slug = 'orr-zone-b' and vc.slug = 'first';
update public.rate_versions set status = 'live' where slug = 'orr-rv-live';

insert into public.bookings (contact_name, contact_email) values ('ORR Booking', 'orr-booking@example.test');
insert into public.booking_access_tokens (booking_id, token_hash, expires_at)
select b.id, extensions.digest('orr-token', 'sha256'), now() + interval '1 day'
  from public.bookings b where b.contact_email = 'orr-booking@example.test';

insert into public.stripe_events (id, type, stripe_created, payload)
values ('evt_orr', 'payment_intent.succeeded', now(), jsonb_build_object('billing_details', jsonb_build_object('name', 'Secret Name')));

create temporary table fx as
select
  (select id from public.rate_versions where slug = 'orr-rv-draft') as rv_draft,
  (select id from public.rate_versions where slug = 'orr-rv-live') as rv_live,
  (select fr.id from public.fixed_routes fr join public.rate_versions rv on rv.id = fr.rate_version_id where rv.slug = 'orr-rv-live') as fixed_route_live,
  (select id from public.booking_access_tokens limit 1) as token_id;
-- Temp tables default to owner-only privileges; the role switches below need to read it too.
grant select on fx to public;

-- (1) authenticated (a customer) gets 42501 on chauffeurs -- grant layer, not an empty result. --
set local role authenticated;
select set_config('request.jwt.claims',
  jsonb_build_object('sub', 'f0000000-0000-0000-0000-000000000004', 'role', 'authenticated', 'aal', 'aal2')::text,
  true);
select throws_ok(
  $$ select * from public.chauffeurs $$,
  '42501', null,
  '(1) authenticated (customer) selecting chauffeurs raises 42501 (grant layer)'
);
reset role;

-- (2)-(3) vamos_staff at aal1: policy layer says not staff -- zero rows, INSERT raises 42501. ---
set local role vamos_staff;
select set_config('request.jwt.claims',
  jsonb_build_object('sub', 'f0000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'aal', 'aal1',
    'app_metadata', jsonb_build_object('vamos_role', 'dispatcher'))::text,
  true);
select is((select count(*) from public.chauffeurs)::int, 0, '(2) dispatcher at aal1 sees zero chauffeurs (not staff yet)');
select throws_ok(
  $$ insert into public.chauffeurs (full_name, phone, licence_number) values ('X', '+41 0', 'LIC-X') $$,
  '42501', null,
  '(3) dispatcher at aal1 cannot INSERT into chauffeurs'
);
reset role;

-- (4)-(5) the same dispatcher at aal2 sees and can edit the working set. ------------------------
set local role vamos_staff;
select set_config('request.jwt.claims',
  jsonb_build_object('sub', 'f0000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'aal', 'aal2',
    'app_metadata', jsonb_build_object('vamos_role', 'dispatcher'))::text,
  true);
select ok((select count(*) from public.chauffeurs) >= 1, '(4) dispatcher at aal2 sees chauffeur rows');
select lives_ok(
  $$ update public.chauffeurs set note = 'Updated by dispatcher' $$,
  '(5) dispatcher at aal2 can update chauffeurs.note'
);
reset role;

-- (6) the inactive dispatcher at aal2 sees zero rows -- revocation is immediate. -----------------
set local role vamos_staff;
select set_config('request.jwt.claims',
  jsonb_build_object('sub', 'f0000000-0000-0000-0000-000000000003', 'role', 'authenticated', 'aal', 'aal2',
    'app_metadata', jsonb_build_object('vamos_role', 'dispatcher'))::text,
  true);
select is((select count(*) from public.chauffeurs)::int, 0, '(6) an inactive dispatcher at aal2 sees zero chauffeurs');
reset role;

-- (7)-(8) rate_versions and audit_log are admin-only -- a dispatcher sees zero rows on both. -----
set local role vamos_staff;
select set_config('request.jwt.claims',
  jsonb_build_object('sub', 'f0000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'aal', 'aal2',
    'app_metadata', jsonb_build_object('vamos_role', 'dispatcher'))::text,
  true);
select is((select count(*) from public.rate_versions)::int, 0, '(7) dispatcher at aal2 sees zero rate_versions (admin-only)');
select is((select count(*) from public.audit_log)::int, 0, '(8) dispatcher at aal2 sees zero audit_log rows (admin-only)');
reset role;

-- (9)-(10) the admin sees both. -------------------------------------------------------------------
set local role vamos_staff;
select set_config('request.jwt.claims',
  jsonb_build_object('sub', 'f0000000-0000-0000-0000-000000000002', 'role', 'authenticated', 'aal', 'aal2',
    'app_metadata', jsonb_build_object('vamos_role', 'admin'))::text,
  true);
select ok((select count(*) from public.rate_versions) >= 1, '(9) admin at aal2 sees rate_versions rows');
select ok((select count(*) from public.audit_log) >= 1, '(10) admin at aal2 sees audit_log rows (the chauffeurs update from (5) was audited)');
reset role;

-- (11)-(12) policy vs trigger, independent layers: the dispatcher's status update is silently
-- hidden by RLS (0 rows); the admin's identical update reaches the trigger and is refused for
-- being unpriced. -----------------------------------------------------------------------------
set local role vamos_staff;
select set_config('request.jwt.claims',
  jsonb_build_object('sub', 'f0000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'aal', 'aal2',
    'app_metadata', jsonb_build_object('vamos_role', 'dispatcher'))::text,
  true);
-- A data-modifying CTE must be the top-level statement, not a scalar subquery -- materialize the
-- row count into a temp table first, then assert on that.
create temporary table upd_rv_dispatcher as
with upd as (update public.rate_versions set status = 'live' where slug = 'orr-rv-draft' returning 1)
select count(*) as n from upd;
select is(
  (select n from upd_rv_dispatcher)::int,
  0,
  '(11) dispatcher''s attempt to publish rate_versions affects 0 rows (rate_versions_admin_write, restrictive)'
);
reset role;

set local role vamos_staff;
select set_config('request.jwt.claims',
  jsonb_build_object('sub', 'f0000000-0000-0000-0000-000000000002', 'role', 'authenticated', 'aal', 'aal2',
    'app_metadata', jsonb_build_object('vamos_role', 'admin'))::text,
  true);
select throws_ok(
  $$ update public.rate_versions set status = 'live' where slug = 'orr-rv-draft' $$,
  '23001', null,
  '(12) admin''s attempt to publish the unpriced draft raises restrict_violation (tg_rate_version_transition)'
);
reset role;

-- (13)-(15) staff_admin_write: only an admin may write to public.staff. --------------------------
set local role vamos_staff;
select set_config('request.jwt.claims',
  jsonb_build_object('sub', 'f0000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'aal', 'aal2',
    'app_metadata', jsonb_build_object('vamos_role', 'dispatcher'))::text,
  true);
select throws_ok(
  $$ insert into public.staff (user_id, role) values ('f0000000-0000-0000-0000-000000000005', 'dispatcher') $$,
  '42501', null,
  '(13) dispatcher cannot INSERT into staff (staff_admin_write)'
);
-- staff_admin_write's restrictive USING clause filters the target row out of the UPDATE's match
-- set entirely (not a WITH CHECK failure on an attempted write), so this affects 0 rows rather
-- than raising -- the same "policy layer, not an error" shape as (11).
create temporary table upd_staff_dispatcher as
with upd as (
  update public.staff set active = false where user_id = 'f0000000-0000-0000-0000-000000000002' returning 1
) select count(*) as n from upd;
select is(
  (select n from upd_staff_dispatcher)::int,
  0,
  '(14) dispatcher''s UPDATE staff.active affects 0 rows (staff_admin_write, restrictive)'
);
reset role;

set local role vamos_staff;
select set_config('request.jwt.claims',
  jsonb_build_object('sub', 'f0000000-0000-0000-0000-000000000002', 'role', 'authenticated', 'aal', 'aal2',
    'app_metadata', jsonb_build_object('vamos_role', 'admin'))::text,
  true);
select lives_ok(
  $$ insert into public.staff (user_id, role) values ('f0000000-0000-0000-0000-000000000005', 'dispatcher') $$,
  '(15) admin CAN INSERT into staff (staff_admin_write, AUTH-05''s invitation-only half)'
);
reset role;

select policies_are(
  'public', 'chauffeurs', array['chauffeurs_staff_gate','chauffeurs_staff_all'],
  '(16) chauffeurs carries exactly the two working-set policies'
);

-- F-02 (17)-(20): settings_versions is select+insert only, admin-gated on the insert. ------------
set local role vamos_staff;
select set_config('request.jwt.claims',
  jsonb_build_object('sub', 'f0000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'aal', 'aal2',
    'app_metadata', jsonb_build_object('vamos_role', 'dispatcher'))::text,
  true);
select ok((select count(*) from public.settings_versions) >= 1, '(17) dispatcher at aal2 can SELECT settings_versions');
select throws_ok(
  $$ insert into public.settings_versions (slug, label) values ('orr-dispatcher-attempt', 'x') $$,
  '42501', null,
  '(18) dispatcher cannot INSERT into settings_versions (settings_versions_admin_write)'
);
select throws_ok(
  $$ update public.settings_versions set free_cancel_hours = 0 where slug = 'orr-policy' $$,
  '42501', null,
  '(19) dispatcher cannot UPDATE settings_versions (no UPDATE grant survives ...19_append_only.sql)'
);
reset role;

set local role vamos_staff;
select set_config('request.jwt.claims',
  jsonb_build_object('sub', 'f0000000-0000-0000-0000-000000000002', 'role', 'authenticated', 'aal', 'aal2',
    'app_metadata', jsonb_build_object('vamos_role', 'admin'))::text,
  true);
select lives_ok(
  $$ insert into public.settings_versions (slug, label) values ('orr-admin-attempt', 'x') $$,
  '(20) admin CAN INSERT into settings_versions (settings_versions_admin_write)'
);
reset role;

-- F-08 (21)-(24): booking_access_tokens is column-split -- never token_hash. ----------------------
set local role vamos_staff;
select set_config('request.jwt.claims',
  jsonb_build_object('sub', 'f0000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'aal', 'aal2',
    'app_metadata', jsonb_build_object('vamos_role', 'dispatcher'))::text,
  true);
select throws_ok(
  $$ select token_hash from public.booking_access_tokens $$,
  '42501', null,
  '(21) dispatcher cannot select booking_access_tokens.token_hash'
);
select lives_ok(
  $$ select id, booking_id, expires_at, use_count from public.booking_access_tokens $$,
  '(22) dispatcher can select id/booking_id/expires_at/use_count on booking_access_tokens'
);
select lives_ok(
  $$ update public.booking_access_tokens set revoked_at = now() $$,
  '(23) dispatcher can update booking_access_tokens.revoked_at'
);
select throws_ok(
  $$ update public.booking_access_tokens set expires_at = now() $$,
  '42501', null,
  '(24) dispatcher cannot update booking_access_tokens.expires_at'
);
reset role;

-- F-11 (25)-(26): stripe_events is column-split -- never payload. ---------------------------------
set local role vamos_staff;
select set_config('request.jwt.claims',
  jsonb_build_object('sub', 'f0000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'aal', 'aal2',
    'app_metadata', jsonb_build_object('vamos_role', 'dispatcher'))::text,
  true);
select throws_ok(
  $$ select payload from public.stripe_events $$,
  '42501', null,
  '(25) dispatcher cannot select stripe_events.payload'
);
select lives_ok(
  $$ select id, type, processed_at from public.stripe_events $$,
  '(26) dispatcher can select id/type/processed_at on stripe_events'
);
reset role;

-- F-18 (27)-(29): the dispatcher carve-out is reachable via app.rate_version_published, and the
-- freeze trigger still pins the amount independently of the RLS layer. ----------------------------
set local role vamos_staff;
select set_config('request.jwt.claims',
  jsonb_build_object('sub', 'f0000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'aal', 'aal2',
    'app_metadata', jsonb_build_object('vamos_role', 'dispatcher'))::text,
  true);
-- A data-modifying CTE must be the top-level statement, not a scalar subquery -- materialize the
-- row count into a temp table first, then assert on that.
create temporary table upd_fr_dispatcher as
with upd as (update public.fixed_routes set live = true where id = (select fixed_route_live from fx) returning 1)
select count(*) as n from upd;
select is(
  (select n from upd_fr_dispatcher)::int,
  1,
  '(27) F-18: dispatcher''s update fixed_routes.live=true on a published version''s row affects 1 row (carve-out reachable)'
);
select throws_ok(
  format($$ update public.fixed_routes set price_rappen = 1 where id = %L $$, (select fixed_route_live from fx)),
  '23001', null,
  '(28) F-18: dispatcher''s update to fixed_routes.price_rappen still raises (tg_pricing_row_frozen pins the amount)'
);
reset role;

select function_privs_are(
  'app', 'rate_version_published', array['bigint'], 'vamos_staff', array['EXECUTE'],
  '(29) vamos_staff holds EXECUTE on app.rate_version_published(bigint)'
);

select * from finish();
rollback;
