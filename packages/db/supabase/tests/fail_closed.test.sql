-- fail_closed.test.sql
--
-- D-02: the grant is the stronger of the two gates, so a denial must be 42501 (grant layer),
-- never an empty result (RLS layer only) -- an empty result would mean the grant boundary is
-- missing and only RLS is holding. Proves vamos_edge holds SELECT on none of the 29 public
-- tables; vamos_public holds SELECT on exactly the four cacheable content tables (plus the
-- settings_public view, D-03); authenticated holds no grant at all on any ops/ledger table; and
-- the literal DATA-06 fail-closed statement (a forgotten identity wrapper raises 42501, not an
-- empty result). Runs against the FULL migration set (...20-...24) -- this file is the
-- regression test that would have caught F-01/F-05/F-08/F-11 the moment each one landed.
begin;
select plan(43);

-- Fixtures ------------------------------------------------------------------------------------
insert into public.vehicle_classes (slug, passenger_capacity, luggage_capacity)
values ('economy', 3, 3);
insert into public.rate_versions (slug, label) values ('fc-rv', 'fail_closed fixture');
insert into public.settings_versions (slug, label) values ('fc-policy', 'fail_closed fixture');

insert into auth.users (id, email, aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('d0000000-0000-0000-0000-00000000000a', 'fc-a@example.test', 'authenticated', 'authenticated', '{}'::jsonb, '{}'::jsonb, now(), now());
insert into public.customers (user_id, full_name, email)
values ('d0000000-0000-0000-0000-00000000000a', 'Customer FC', 'fc-cust-a@example.test');

insert into public.bookings (contact_name, contact_email, customer_id, note)
select 'Booking FC', 'fc-booking-a@example.test', c.id, 'Dispatcher eyes only'
  from public.customers c where c.email = 'fc-cust-a@example.test';

insert into public.booking_access_tokens (booking_id, token_hash, expires_at)
select b.id, extensions.digest('fc-token-a', 'sha256'), now() + interval '1 day'
  from public.bookings b where b.contact_email = 'fc-booking-a@example.test';

create temporary table fx as
select (select id from public.bookings where contact_email = 'fc-booking-a@example.test') as booking_a;
-- Temp tables default to owner-only privileges; the role switches below need to read it too.
grant select on fx to public;

-- (1)-(29) D-02: vamos_edge holds SELECT on none of the 29 public tables ----------------------
select ok(not has_table_privilege('vamos_edge', 'public.settings', 'select'), '(1) vamos_edge: no SELECT on settings');
select ok(not has_table_privilege('vamos_edge', 'public.settings_versions', 'select'), '(2) vamos_edge: no SELECT on settings_versions');
select ok(not has_table_privilege('vamos_edge', 'public.vehicle_classes', 'select'), '(3) vamos_edge: no SELECT on vehicle_classes');
select ok(not has_table_privilege('vamos_edge', 'public.vehicles', 'select'), '(4) vamos_edge: no SELECT on vehicles');
select ok(not has_table_privilege('vamos_edge', 'public.chauffeurs', 'select'), '(5) vamos_edge: no SELECT on chauffeurs');
select ok(not has_table_privilege('vamos_edge', 'public.customers', 'select'), '(6) vamos_edge: no SELECT on customers');
select ok(not has_table_privilege('vamos_edge', 'public.staff', 'select'), '(7) vamos_edge: no SELECT on staff');
select ok(not has_table_privilege('vamos_edge', 'public.service_zones', 'select'), '(8) vamos_edge: no SELECT on service_zones');
select ok(not has_table_privilege('vamos_edge', 'public.rate_versions', 'select'), '(9) vamos_edge: no SELECT on rate_versions');
select ok(not has_table_privilege('vamos_edge', 'public.distance_rates', 'select'), '(10) vamos_edge: no SELECT on distance_rates');
select ok(not has_table_privilege('vamos_edge', 'public.fixed_routes', 'select'), '(11) vamos_edge: no SELECT on fixed_routes');
select ok(not has_table_privilege('vamos_edge', 'public.surcharges', 'select'), '(12) vamos_edge: no SELECT on surcharges');
select ok(not has_table_privilege('vamos_edge', 'public.coupons', 'select'), '(13) vamos_edge: no SELECT on coupons');
select ok(not has_table_privilege('vamos_edge', 'public.coupon_redemptions', 'select'), '(14) vamos_edge: no SELECT on coupon_redemptions');
select ok(not has_table_privilege('vamos_edge', 'public.bookings', 'select'), '(15) vamos_edge: no SELECT on bookings');
select ok(not has_table_privilege('vamos_edge', 'public.booking_legs', 'select'), '(16) vamos_edge: no SELECT on booking_legs');
select ok(not has_table_privilege('vamos_edge', 'public.booking_access_tokens', 'select'), '(17) vamos_edge: no SELECT on booking_access_tokens');
select ok(not has_table_privilege('vamos_edge', 'public.booking_reference_counters', 'select'), '(18) vamos_edge: no SELECT on booking_reference_counters');
select ok(not has_table_privilege('vamos_edge', 'public.price_snapshots', 'select'), '(19) vamos_edge: no SELECT on price_snapshots');
select ok(not has_table_privilege('vamos_edge', 'public.price_snapshot_legs', 'select'), '(20) vamos_edge: no SELECT on price_snapshot_legs');
select ok(not has_table_privilege('vamos_edge', 'public.booking_payments', 'select'), '(21) vamos_edge: no SELECT on booking_payments');
select ok(not has_table_privilege('vamos_edge', 'public.booking_refunds', 'select'), '(22) vamos_edge: no SELECT on booking_refunds');
select ok(not has_table_privilege('vamos_edge', 'public.stripe_events', 'select'), '(23) vamos_edge: no SELECT on stripe_events');
select ok(not has_table_privilege('vamos_edge', 'public.booking_notifications', 'select'), '(24) vamos_edge: no SELECT on booking_notifications');
select ok(not has_table_privilege('vamos_edge', 'public.booking_events', 'select'), '(25) vamos_edge: no SELECT on booking_events');
select ok(not has_table_privilege('vamos_edge', 'public.audit_log', 'select'), '(26) vamos_edge: no SELECT on audit_log');
select ok(not has_table_privilege('vamos_edge', 'public.consent_log', 'select'), '(27) vamos_edge: no SELECT on consent_log');
select ok(not has_table_privilege('vamos_edge', 'public.content_strings', 'select'), '(28) vamos_edge: no SELECT on content_strings');
select ok(not has_table_privilege('vamos_edge', 'public.reviews', 'select'), '(29) vamos_edge: no SELECT on reviews');

-- (30) vamos_public holds SELECT on exactly the four cacheable content tables plus the
-- settings_public view (D-03) -- nothing else is ever granted to vamos_public. --------------
select set_eq(
  $$ select table_name::text from information_schema.role_table_grants
      where grantee = 'vamos_public' and table_schema = 'public' and privilege_type = 'SELECT' $$,
  $$ values ('content_strings'),('reviews'),('vehicle_classes'),('service_zones'),('settings_public') $$,
  '(30) vamos_public holds SELECT on exactly the four public-content tables plus settings_public'
);

-- (31) authenticated has no grant at all on any ops/ledger table ------------------------------
select is_empty(
  $$ select table_name from information_schema.role_table_grants
      where grantee = 'authenticated' and table_schema = 'public'
        and table_name in ('chauffeurs','vehicles','staff','rate_versions','distance_rates',
                            'surcharges','coupons','audit_log','consent_log','stripe_events',
                            'booking_payments','settings') $$,
  '(31) authenticated holds no grant at all on any ops/ledger table'
);

-- (32) DATA-06's fail-closed baseline: a forgotten identity wrapper raises 42501, never an
-- empty result -- the literal statement Phase 3's identity-scoped connection depends on. -------
set local role vamos_edge;
select throws_ok(
  $$ select count(*) from public.bookings $$,
  '42501', null,
  '(32) vamos_edge selecting bookings with no identity bound raises 42501 (fail-closed, not empty)'
);
reset role;

-- (33) the whole policy surface is non-trivial. ------------------------------------------------
select ok(
  (select count(*) from pg_policies where schemaname = 'public') > 40,
  '(33) more than 40 policies exist across the RLS migration set'
);

-- (34) F-05: the exact authenticated grant surface -- the regression that would have caught
-- the draft's over-broad per-table revoke loops the moment they landed.
--
-- DEVIATION (Rule 1, bug fix): `information_schema.role_table_grants` only surfaces a WHOLE-TABLE
-- ACL entry (`pg_class.relacl`) -- a column-scoped grant (`grant select (col1, col2) on t to
-- role`, which is what F-01 requires on `customers`/`bookings`/`booking_legs`) lives in
-- `pg_attribute.attacl` and never appears there at all (confirmed empirically: querying
-- role_table_grants alone for `authenticated` after this migration set returns only the five
-- whole-table grants, silently omitting the three column-scoped tables). The union with
-- `information_schema.column_privileges` below is what makes this assertion actually prove the
-- F-05 invariant instead of a false negative on the exact tables F-01 exists to protect.
select set_eq(
  $$ select table_name::text from (
       select table_name from information_schema.role_table_grants
        where grantee = 'authenticated' and table_schema = 'public'
       union
       select table_name from information_schema.column_privileges
        where grantee = 'authenticated' and table_schema = 'public'
     ) g $$,
  $$ values ('customers'),('bookings'),('booking_legs'),('price_snapshots'),('price_snapshot_legs'),
            ('content_strings'),('reviews'),('vehicle_classes'),('service_zones'),('settings_public') $$,
  '(34) F-05: authenticated holds a grant (whole-table or column-scoped) on exactly these ten tables/views'
);

-- (35) F-01: note is never column-granted to authenticated or vamos_guest on bookings/booking_legs.
select is_empty(
  $$ select 1 from information_schema.column_privileges
      where grantee in ('authenticated','vamos_guest')
        and table_name in ('bookings','booking_legs') and column_name = 'note' $$,
  '(35) F-01: neither authenticated nor vamos_guest holds any privilege on bookings/booking_legs.note'
);

-- (36) F-08: token_hash is never column-granted to vamos_staff. --------------------------------
select is_empty(
  $$ select 1 from information_schema.column_privileges
      where grantee = 'vamos_staff' and table_name = 'booking_access_tokens' and column_name = 'token_hash' $$,
  '(36) F-08: vamos_staff holds no privilege on booking_access_tokens.token_hash'
);

-- (37) F-11: payload is never column-granted to vamos_staff. -----------------------------------
select is_empty(
  $$ select 1 from information_schema.column_privileges
      where grantee = 'vamos_staff' and table_name = 'stripe_events' and column_name = 'payload' $$,
  '(37) F-11: vamos_staff holds no privilege on stripe_events.payload'
);

-- Positive halves -- the fix cannot be "revoke everything". -------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  jsonb_build_object('sub', 'd0000000-0000-0000-0000-00000000000a', 'role', 'authenticated', 'aal', 'aal2')::text,
  true);
select lives_ok(
  $$ select reference, status, price_total_rappen from public.bookings $$,
  '(38) authenticated can select reference/status/price_total_rappen on its own booking'
);
select is(
  (select reference from public.bookings),
  (select reference from public.bookings b where b.id = (select booking_a from fx)),
  '(39) authenticated as customer FC sees exactly FC''s own booking'
);
select throws_ok(
  $$ select note from public.bookings $$,
  '42501', null,
  '(40) authenticated cannot select bookings.note (F-01, grant layer)'
);
reset role;

set local role vamos_guest;
select set_config('request.vamos.manage_token_hash', encode(extensions.digest('fc-token-a', 'sha256'), 'hex'), true);
select lives_ok(
  $$ select reference, status, price_total_rappen from public.bookings $$,
  '(41) vamos_guest with a valid token can select reference/status/price_total_rappen'
);
select is(
  (select reference from public.bookings),
  (select reference from public.bookings b where b.id = (select booking_a from fx)),
  '(42) vamos_guest with a valid token sees exactly the one booking the token names'
);
select throws_ok(
  $$ select note from public.bookings $$,
  '42501', null,
  '(43) vamos_guest cannot select bookings.note (F-01, grant layer)'
);
reset role;

select * from finish();
rollback;
