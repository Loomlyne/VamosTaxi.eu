-- append_only.test.sql
--
-- Proves DATA-08's foundation and D-18's four layers over the seven append-only tables
-- (the drafted six plus settings_versions, F-02), the two documented carve-outs (price_snapshots
-- binding a quote to its booking; consent_log's erasure redaction, F-10), the F-03 TRUNCATE
-- closure (a row trigger never fires on TRUNCATE, and RLS/FORCE RLS does not filter it at all),
-- and the F-22 postgres-role BYPASSRLS dependency that makes the two definer write paths
-- (tg_audit_row, record_consent) work under FORCE RLS with zero INSERT policy for any role.
--
-- Layer 1 (the trigger) is the only layer that binds `postgres` -- layers 2-4 are bypassed by
-- table ownership/BYPASSRLS -- so every mutation/delete/truncate assertion below runs as
-- `postgres` unless a role switch is explicit.
--
-- Run as `postgres` by `supabase test db`.
begin;
select plan(44);

-- Fixtures ------------------------------------------------------------------------------------
insert into public.vehicle_classes (slug, passenger_capacity, luggage_capacity)
values ('first', 3, 3);                                    -- also produces the audit_log row

insert into public.rate_versions (slug, label) values ('ao-rv', 'Append-only fixture rate version');
insert into public.distance_rates (rate_version_id, vehicle_class_id, max_pax, base_fare_rappen, per_km_rappen, min_fare_rappen)
select rv.id, vc.id, 3, 1, 2, 3
  from public.rate_versions rv, public.vehicle_classes vc
 where rv.slug = 'ao-rv' and vc.slug = 'first';
update public.rate_versions set status = 'live' where slug = 'ao-rv';   -- fully priced, passes

insert into public.settings_versions (slug, label) values ('ao-price-policy', 'Append-only price policy fixture');
insert into public.settings_versions (slug, label) values ('ao-immutable', 'Append-only immutability fixture');

-- DEVIATION (Rule 1, bug fix -- Plan 02-09 seeds the settings singleton): the id=1 row already
-- exists from supabase/seed.sql, so this insert is no longer needed for the F-22 UPDATE below
-- (and would collide on settings_pkey if left in).

insert into public.customers (full_name, email) values ('Append Only Customer', 'ao-customer@example.test');
insert into public.customers (full_name, email) values ('Append Only Other Customer', 'ao-other-customer@example.test');

insert into auth.users (id, email, aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('f0000000-0000-0000-0000-000000000001', 'ao-consent-fixture@vamostaxi.eu', 'authenticated',
        'authenticated', '{}'::jsonb, '{}'::jsonb, now(), now());
insert into public.customers (user_id, full_name, email)
values ('f0000000-0000-0000-0000-000000000001', 'Append Only Consent Customer', 'ao-consent-customer@example.test');

insert into public.bookings (contact_name, contact_email, customer_id)
select 'Append Only Booking', 'ao-booking@example.test', c.id
  from public.customers c where c.email = 'ao-customer@example.test';
insert into public.bookings (contact_name, contact_email)
values ('Append Only Other Booking', 'ao-other-booking@example.test');

insert into public.booking_legs (booking_id, leg_seq, direction, pickup_text, dropoff_text,
                                  scheduled_at, scheduled_local, vehicle_class_id)
select b.id, 1, 'outbound', 'ZRH', 'Zurich HB', now() + interval '3 days',
       to_char(now() + interval '3 days', 'YYYY-MM-DD"T"HH24:MI'), vc.id
  from public.bookings b, public.vehicle_classes vc
 where b.contact_email = 'ao-booking@example.test' and vc.slug = 'first';

create temporary table fx as
select vc.id as vehicle_class_id, rv.id as rate_version_id, sv.id as settings_version_id,
       b.id as booking_id, b2.id as other_booking_id, l.id as leg_id
  from public.vehicle_classes vc, public.rate_versions rv, public.settings_versions sv,
       public.bookings b, public.bookings b2, public.booking_legs l
 where vc.slug = 'first' and rv.slug = 'ao-rv' and sv.slug = 'ao-price-policy'
   and b.contact_email = 'ao-booking@example.test'
   and b2.contact_email = 'ao-other-booking@example.test'
   and l.booking_id = b.id;

create temporary table pol as
select jsonb_build_object('cancellation_tiers', '[]'::jsonb, 'free_cancel_hours', 24,
                           'airport_waiting_minutes', 60, 'city_waiting_minutes', 15,
                           'settings_version_id', fx.settings_version_id) as policy
  from fx;

-- S1: an UNBOUND quote snapshot -- "a snapshot with booking_id NULL" and carve-out 1's target.
insert into public.price_snapshots (
  quote_id, vehicle_class_id, rate_version_id, rate_version_is_live, settings_version_id,
  engine_version, pax, bags, lines, policy, subtotal_rappen, surcharges_rappen,
  discount_rappen, total_rappen, expires_at
)
select gen_random_uuid(), fx.vehicle_class_id, fx.rate_version_id, false, fx.settings_version_id,
       'quote-engine@ao-s1', 1, 0, '[]'::jsonb, pol.policy, 6, 0, 0, 6, now() + interval '30 minutes'
  from fx, pol;

-- S2: BOUND at insert -- the chosen snapshot the payment/refund chain settles against.
insert into public.price_snapshots (
  quote_id, vehicle_class_id, rate_version_id, rate_version_is_live, settings_version_id,
  engine_version, pax, bags, lines, policy, booking_id, subtotal_rappen, surcharges_rappen,
  discount_rappen, total_rappen, expires_at
)
select gen_random_uuid(), fx.vehicle_class_id, fx.rate_version_id, false, fx.settings_version_id,
       'quote-engine@ao-s2', 1, 0, '[]'::jsonb, pol.policy, fx.booking_id, 6, 0, 0, 6,
       now() + interval '30 minutes'
  from fx, pol;

update public.bookings set price_snapshot_id =
  (select id from public.price_snapshots where engine_version = 'quote-engine@ao-s2')
  where contact_email = 'ao-booking@example.test';

-- A snapshot leg under S2.
insert into public.price_snapshot_legs (snapshot_id, leg_seq, booking_leg_id, leg_subtotal_rappen)
select s.id, 1, fx.leg_id, 6
  from public.price_snapshots s, fx
 where s.engine_version = 'quote-engine@ao-s2';

-- A booking event, inserted directly as postgres (D-17: application-written, never a trigger).
insert into public.booking_events (booking_id, kind, actor_kind, actor_label, payload)
select fx.booking_id, 'note.added', 'staff', 'Append-only fixture', '{}'::jsonb from fx;

-- A payment + refund chain -- synthetic integers, this whole file rolls back at the end (D-34).
insert into public.booking_payments (booking_id, snapshot_id, stripe_payment_intent_id, charged_rappen, status)
select fx.booking_id, s.id, 'pi_ao-fixture', 6, 'requires_payment'
  from fx, public.price_snapshots s where s.engine_version = 'quote-engine@ao-s2';
update public.booking_payments set status = 'succeeded', captured_at = now()
 where stripe_payment_intent_id = 'pi_ao-fixture';

insert into public.booking_refunds (booking_id, snapshot_id, payment_id, reason, basis_rappen,
                                     refund_percent, refund_rappen, tier_applied, hours_before)
select fx.booking_id, s.id, p.id, 'customer_cancel', 6, 100.00, 6, '{}'::jsonb, 24.0
  from fx, public.price_snapshots s, public.booking_payments p
 where s.engine_version = 'quote-engine@ao-s2' and p.stripe_payment_intent_id = 'pi_ao-fixture';

-- A consent_log row anchored to a real customer, via record_consent -- carve-out 2's target
-- (F-10) and the generic-loop target below.
set local role authenticated;
select set_config('request.jwt.claims',
  jsonb_build_object('sub', 'f0000000-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('request.vamos.consent_subject', 'a9000000-0000-0000-0000-000000000001', true);
select public.record_consent(true, true, false, false, 'accept_all', 'en', '2026-08-ao');
reset role;

-- Section A: for each of the seven append-only tables, UPDATE and DELETE raise -----------------
-- restrict_violation as `postgres` (layer 1 is the only layer that binds table ownership). ----
select throws_ok(
  $$ update public.price_snapshots set engine_version = 'mutated' where engine_version = 'quote-engine@ao-s2' $$,
  '23001', null, '(A1) price_snapshots UPDATE raises restrict_violation'
);
select throws_ok(
  $$ delete from public.price_snapshots where engine_version = 'quote-engine@ao-s1' $$,
  '23001', null, '(A2) price_snapshots DELETE raises restrict_violation'
);
select throws_ok(
  $$ update public.price_snapshot_legs set leg_subtotal_rappen = 999
       where snapshot_id = (select id from public.price_snapshots where engine_version = 'quote-engine@ao-s2') and leg_seq = 1 $$,
  '23001', null, '(A3) price_snapshot_legs UPDATE raises restrict_violation'
);
select throws_ok(
  $$ delete from public.price_snapshot_legs
       where snapshot_id = (select id from public.price_snapshots where engine_version = 'quote-engine@ao-s2') and leg_seq = 1 $$,
  '23001', null, '(A4) price_snapshot_legs DELETE raises restrict_violation'
);
select throws_ok(
  $$ update public.booking_events set actor_label = 'mutated' where kind = 'note.added' $$,
  '23001', null, '(A5) booking_events UPDATE raises restrict_violation'
);
select throws_ok(
  $$ delete from public.booking_events where kind = 'note.added' $$,
  '23001', null, '(A6) booking_events DELETE raises restrict_violation'
);
select throws_ok(
  $$ update public.booking_refunds set refund_rappen = 1 where reason = 'customer_cancel' $$,
  '23001', null, '(A7) booking_refunds UPDATE raises restrict_violation'
);
select throws_ok(
  $$ delete from public.booking_refunds where reason = 'customer_cancel' $$,
  '23001', null, '(A8) booking_refunds DELETE raises restrict_violation'
);
select throws_ok(
  $$ update public.audit_log set after_value = '{}'::jsonb where table_name = 'vehicle_classes' and action = 'insert' $$,
  '23001', null, '(A9) audit_log UPDATE raises restrict_violation'
);
select throws_ok(
  $$ delete from public.audit_log where table_name = 'vehicle_classes' and action = 'insert' $$,
  '23001', null, '(A10) audit_log DELETE raises restrict_violation'
);
select throws_ok(
  $$ update public.consent_log set policy_version = 'mutated' where policy_version = '2026-08-ao' $$,
  '23001', null, '(A11) consent_log UPDATE raises restrict_violation'
);
select throws_ok(
  $$ delete from public.consent_log where policy_version = '2026-08-ao' $$,
  '23001', null, '(A12) consent_log DELETE raises restrict_violation'
);
select throws_ok(
  $$ update public.settings_versions set free_cancel_hours = 0 where slug = 'ao-immutable' $$,
  '23001', null, '(A13) settings_versions UPDATE raises restrict_violation (F-02)'
);
select throws_ok(
  $$ delete from public.settings_versions where slug = 'ao-immutable' $$,
  '23001', null, '(A14) settings_versions DELETE raises restrict_violation (F-02)'
);

-- Section B: carve-out 1 -- price_snapshots.booking_id NULL -> non-NULL, nothing else changed. -
select throws_ok(
  $$ update public.price_snapshots set booking_id = (select booking_id from fx), total_rappen = null
       where engine_version = 'quote-engine@ao-s1' $$,
  '23001', null, '(B1) binding booking_id AND changing another column raises (not the narrow carve-out)'
);
select lives_ok(
  $$ update public.price_snapshots set booking_id = (select booking_id from fx)
       where engine_version = 'quote-engine@ao-s1' and booking_id is null $$,
  '(B2) binding booking_id alone, NULL -> non-NULL, lives_ok (the one permitted mutation)'
);
select throws_ok(
  $$ update public.price_snapshots set booking_id = (select other_booking_id from fx)
       where engine_version = 'quote-engine@ao-s1' $$,
  '23001', null, '(B3) a second change to booking_id (now non-NULL) raises -- never the reverse'
);

-- Section C: carve-out 2 -- consent_log.customer_id non-NULL -> NULL, nothing else changed (F-10).
select throws_ok(
  $$ update public.consent_log set customer_id = null, marketing = true where policy_version = '2026-08-ao' $$,
  '23001', null, '(C1) redacting customer_id AND changing another column raises (not the narrow carve-out)'
);
select lives_ok(
  $$ update public.consent_log set customer_id = null
       where policy_version = '2026-08-ao' and customer_id is not null $$,
  '(C2) redacting customer_id alone, non-NULL -> NULL, lives_ok (D-19 erasure path, F-10)'
);
select throws_ok(
  $$ update public.consent_log set customer_id = (select id from public.customers where email = 'ao-other-customer@example.test')
       where policy_version = '2026-08-ao' $$,
  '23001', null, '(C3) a second change to customer_id (now NULL) raises -- never the reverse'
);

-- Section D/E: service_role holds neither UPDATE nor DELETE on any of the seven. ----------------
select is(has_table_privilege('service_role','public.price_snapshots','update'), false, '(D1) service_role: no UPDATE on price_snapshots');
select is(has_table_privilege('service_role','public.price_snapshot_legs','update'), false, '(D2) service_role: no UPDATE on price_snapshot_legs');
select is(has_table_privilege('service_role','public.booking_events','update'), false, '(D3) service_role: no UPDATE on booking_events');
select is(has_table_privilege('service_role','public.booking_refunds','update'), false, '(D4) service_role: no UPDATE on booking_refunds');
select is(has_table_privilege('service_role','public.audit_log','update'), false, '(D5) service_role: no UPDATE on audit_log');
select is(has_table_privilege('service_role','public.consent_log','update'), false, '(D6) service_role: no UPDATE on consent_log');
select is(has_table_privilege('service_role','public.settings_versions','update'), false, '(D7) service_role: no UPDATE on settings_versions (F-02)');

select is(has_table_privilege('service_role','public.price_snapshots','delete'), false, '(E1) service_role: no DELETE on price_snapshots');
select is(has_table_privilege('service_role','public.price_snapshot_legs','delete'), false, '(E2) service_role: no DELETE on price_snapshot_legs');
select is(has_table_privilege('service_role','public.booking_events','delete'), false, '(E3) service_role: no DELETE on booking_events');
select is(has_table_privilege('service_role','public.booking_refunds','delete'), false, '(E4) service_role: no DELETE on booking_refunds');
select is(has_table_privilege('service_role','public.audit_log','delete'), false, '(E5) service_role: no DELETE on audit_log');
select is(has_table_privilege('service_role','public.consent_log','delete'), false, '(E6) service_role: no DELETE on consent_log');
select is(has_table_privilege('service_role','public.settings_versions','delete'), false, '(E7) service_role: no DELETE on settings_versions (F-02)');

-- Section F: FORCE RLS on all nine (the seven append-only plus stripe_events/booking_notifications).
select is(
  (select count(*) from pg_class where relforcerowsecurity and relname in (
    'price_snapshots','price_snapshot_legs','booking_events','booking_refunds','audit_log',
    'consent_log','settings_versions','stripe_events','booking_notifications'))::int,
  9,
  '(F1) FORCE ROW LEVEL SECURITY is set on all nine tables'
);

-- Section G/H/I: F-03 -- TRUNCATE is closed at the grant layer for service_role, and the ------
-- trigger layer stops even the table owner (postgres), where the grant no longer bites. --------
set local role service_role;
select throws_ok(
  $$ truncate public.audit_log $$, '42501', null,
  '(G1) service_role cannot TRUNCATE audit_log (grant revoked)'
);
select throws_ok(
  $$ truncate public.booking_events $$, '42501', null,
  '(G2) service_role cannot TRUNCATE booking_events (grant revoked)'
);
select throws_ok(
  $$ truncate public.consent_log $$, '42501', null,
  '(G3) service_role cannot TRUNCATE consent_log (grant revoked)'
);
reset role;

select throws_ok(
  $$ truncate public.consent_log $$, '23001', null,
  '(H1) postgres -- table owner, bypasses the grant revoke -- is still stopped by the trigger'
);

select is_empty(
  $$ select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
        and has_table_privilege('service_role', c.oid, 'truncate') $$,
  '(I1) service_role holds TRUNCATE on zero tables in schema public'
);

-- Section J: F-02 -- settings_versions' one legal write is append (a fresh INSERT). -------------
select lives_ok(
  $$ insert into public.settings_versions (slug, label) values ('ao-immutable-insert', 'x') $$,
  '(J1) inserting a new settings_versions row lives_ok -- append is the only legal write'
);

-- Section K/L: F-22 -- both definer write paths succeed under FORCE RLS with no INSERT policy, --
-- because the owning role (postgres) carries BYPASSRLS/superuser. Assert the dependency itself. -
update public.settings set phone = '+41 00 000 00 00' where id = 1;
select is(
  (select count(*) from public.audit_log where table_name = 'settings' and action = 'update')::int,
  1,
  '(K1) tg_audit_row writes one audit_log row for a settings UPDATE under FORCE RLS'
);

select set_config('request.vamos.consent_subject', 'b8000000-0000-0000-0000-000000000001', true);
select public.record_consent(true, false, false, false, 'save_choices', 'en', '2026-08-ao-force-rls');
select is(
  (select count(*) from public.consent_log where consent_subject_id = 'b8000000-0000-0000-0000-000000000001'::uuid)::int,
  1,
  '(K2) record_consent writes one consent_log row under FORCE RLS'
);

select ok(
  (select rolbypassrls or rolsuper from pg_roles where rolname = current_user),
  '(L1) the definer functions'' owner (current_user) carries BYPASSRLS or is a superuser -- F-22: a future re-owning to a minimal role fails HERE, not silently'
);

select * from finish();
rollback;
