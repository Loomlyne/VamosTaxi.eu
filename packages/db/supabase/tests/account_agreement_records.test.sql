-- account_agreement_records.test.sql
--
-- Phase 26.5 plan 01. The guest-account switch, the shared append-only record table
-- (checkout + /sign-up, D-19) and the five definer functions: behaviour, grants, append-only,
-- CHECKs, and the D-05 unconfirmed-user case. Synthetic rows, rolled back.
begin;
select plan(66);


insert into public.vehicle_classes (slug, passenger_capacity, luggage_capacity)
values ('aar-first', 3, 3);

insert into public.rate_versions (slug, label)
values ('aar-rv', 'aar fixture');

insert into public.distance_rates (
  rate_version_id, vehicle_class_id, max_pax, base_fare_rappen, per_km_rappen, min_fare_rappen
)
select rv.id, vc.id, 3, 1, 2, 3
  from public.rate_versions rv, public.vehicle_classes vc
 where rv.slug = 'aar-rv'
   and vc.slug = 'aar-first';

update public.rate_versions set status = 'live' where slug = 'aar-rv';


create temporary table aar_fx as
select
  vc.id as vehicle_class_id,
  rv.id as rate_version_id,
  sv.id as settings_version_id,
  now() + interval '45 minutes' as lock_exp,
  now() + interval '30 days' as token_expires_at
from public.vehicle_classes vc
join public.rate_versions rv on rv.slug = 'aar-rv'
join public.settings_versions sv on sv.slug = 'launch-baseline'
where vc.slug = 'aar-first';
grant select on aar_fx to public;

create function pg_temp.aar_snapshot()
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'vehicle_class_id', fx.vehicle_class_id,
    'rate_version_id', fx.rate_version_id,
    'settings_version_id', fx.settings_version_id,
    'engine_version', 'quote-engine@aar',
    'lock_exp', fx.lock_exp,
    'pax', 1,
    'bags', 0,
    'lines', jsonb_build_array(jsonb_build_object(
      'seq', 1, 'code', 'distance_fare', 'kind', 'fare',
      'i18n_key', 'price.line.distance', 'amount_rappen', 6
    )),
    'policy', jsonb_build_object(
      'cancellation_tiers', '[]'::jsonb,
      'free_cancel_hours', 24,
      'airport_waiting_minutes', 60,
      'city_waiting_minutes', 15,
      'settings_version_id', fx.settings_version_id,
      'modification_deadline_hours', 24,
      'min_advance_minutes', 180,
      'policy_doc', 'aar'
    ),
    'shown_alternatives', '[]'::jsonb,
    'display_currency', 'CHF',
    'source', 'web',
    'subtotal_rappen', 6,
    'surcharges_rappen', 0,
    'discount_rappen', 0,
    'total_rappen', 6,
    'distance_km', 12.5,
    'duration_min', 25
  )
  from aar_fx fx
$$;
grant execute on function pg_temp.aar_snapshot() to public;

create function pg_temp.aar_legs(p_scheduled_at timestamptz)
returns jsonb
language sql
stable
as $$
  select jsonb_build_array(jsonb_build_object(
    'leg_seq', 1,
    'direction', 'outbound',
    'pickup_text', 'ZRH Airport',
    'pickup_place_id', null,
    'pickup_lat', 47.458056,
    'pickup_lng', 8.549167,
    'dropoff_text', 'Zurich HB',
    'dropoff_place_id', null,
    'dropoff_lat', 47.378177,
    'dropoff_lng', 8.540192,
    'scheduled_at', p_scheduled_at::text,
    'scheduled_local', to_char(p_scheduled_at, 'YYYY-MM-DD"T"HH24:MI'),
    'flight_no', null,
    'vehicle_class_id', fx.vehicle_class_id,
    'pax', 1,
    'bags', 0,
    'estimated_duration_minutes', 25,
    'duration_min', 25,
    'distance_km', 12.5,
    'leg_subtotal_rappen', 6,
    'booking_leg_id', null
  ))
  from aar_fx fx
$$;
grant execute on function pg_temp.aar_legs(timestamptz) to public;

create function pg_temp.aar_book(
  p_quote_id uuid,
  p_key text,
  p_pi text,
  p_cs text,
  p_hash bytea,
  p_email text,
  p_scheduled_at timestamptz,
  p_coupon_id int8 default null,
  p_coupon_code text default null
)
returns table (
  booking_id uuid,
  reference text,
  snapshot_id bigint,
  payment_id bigint,
  replayed boolean
)
language sql
volatile
as $$
  select *
    from public.checkout_create_booking(
      p_quote_id => p_quote_id,
      p_idempotency_key => p_key,
      p_contact => jsonb_build_object(
        'contact_name', 'Aar Guest',
        'contact_email', p_email,
        'contact_phone', '+417****7082'
      ),
      p_locale => 'en',
      p_display_currency => 'CHF',
      p_snapshot => pg_temp.aar_snapshot(),
      p_legs => pg_temp.aar_legs(p_scheduled_at),
      p_coupon_id => p_coupon_id,
      p_coupon_code => p_coupon_code,
      p_manage_token_hash => p_hash,
      p_manage_token_expires_at => (select token_expires_at from aar_fx),
      p_stripe_payment_intent_id => p_pi,
      p_stripe_checkout_session_id => p_cs,
      p_charged_rappen => 6,
      p_actor_customer_id => null
    )
$$;
grant execute on function pg_temp.aar_book(
  uuid, text, text, text, bytea, text, timestamptz, int8, text
) to public;


-- Bookings: a unpaid, b paid (settled), c direct row for e-mail cases ----------------------------
set local role vamos_checkout;
create temporary table aar_a as select * from pg_temp.aar_book('61000000-0000-4000-8000-000000000001'::uuid,'aar-a','cs_aar_a','cs_aar_a',decode(repeat('e1',32),'hex'),'aar-a@example.test', now()+interval '3 days');
create temporary table aar_b as select * from pg_temp.aar_book('61000000-0000-4000-8000-000000000002'::uuid,'aar-b','cs_aar_b','cs_aar_b',decode(repeat('e2',32),'hex'),'aar-b@example.test', now()+interval '3 days');
reset role;
create temporary table aar_a2 as select * from aar_a;
create temporary table aar_b2 as select * from aar_b;
grant select on aar_a2, aar_b2 to public;

set local session_replication_role = replica;
update public.booking_payments set status = 'succeeded', captured_at = now() where booking_id = (select booking_id from aar_b2);
set local session_replication_role = origin;

insert into auth.users (id, email, aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, email_confirmed_at) values
  ('a5000000-0000-0000-0000-000000000001', 'Known.User@Example.test', 'authenticated', 'authenticated', '{}', '{}', now(), now(), now()),
  ('a5000000-0000-0000-0000-000000000002', 'unconf.checkout@example.test', 'authenticated', 'authenticated', '{}', '{"vamos_account_origin":"checkout-create"}', now(), now(), null);

-- Switch ----------------------------------------------------------------------------------------
select col_not_null('public', 'settings', 'guest_accounts_live', 'switch column is not null');
select col_default_is('public', 'settings', 'guest_accounts_live', 'false', 'switch defaults false');
select is(public.checkout_account_settings(), false, 'checkout_account_settings is false by default');

-- Grants ----------------------------------------------------------------------------------------
select is(has_function_privilege('anon', 'public.checkout_account_settings()', 'execute'), true, 'settings: anon EXECUTE');
select is(has_function_privilege('authenticated', 'public.checkout_account_settings()', 'execute'), true, 'settings: authenticated EXECUTE');
select is(has_function_privilege('vamos_checkout', 'public.checkout_account_settings()', 'execute'), true, 'settings: checkout EXECUTE');
select is(has_function_privilege('vamos_system', 'public.checkout_account_settings()', 'execute'), true, 'settings: system EXECUTE');

select is(has_function_privilege('vamos_checkout', 'public.checkout_email_has_account(text)', 'execute'), true, 'has_account: checkout EXECUTE');
select is((select count(*)::int from unnest(array['anon','authenticated','vamos_system']) r
            where has_function_privilege(r, 'public.checkout_email_has_account(text)', 'execute')), 0, 'has_account: no other role');

select is(has_function_privilege('vamos_checkout', 'public.record_account_agreement(text,uuid,text,text,text,text,text,inet)', 'execute'), true, 'record: checkout EXECUTE');
select is((select count(*)::int from unnest(array['anon','authenticated']) r
            where has_function_privilege(r, 'public.record_account_agreement(text,uuid,text,text,text,text,text,inet)', 'execute')), 0, 'record: no other role');

select is(has_function_privilege('vamos_system', 'public.checkout_account_request_for_booking(uuid)', 'execute'), true, 'request_for_booking: system EXECUTE');
select is((select count(*)::int from unnest(array['anon','authenticated','vamos_checkout']) r
            where has_function_privilege(r, 'public.checkout_account_request_for_booking(uuid)', 'execute')), 0, 'request_for_booking: no other role');

select is(has_function_privilege('vamos_system', 'public.checkout_account_user_state(text)', 'execute'), true, 'user_state: system EXECUTE');
select is((select count(*)::int from unnest(array['anon','authenticated','vamos_checkout']) r
            where has_function_privilege(r, 'public.checkout_account_user_state(text)', 'execute')), 0, 'user_state: no other role');

select is((select count(*)::int from pg_proc p where p.oid in (
    'public.checkout_account_settings()'::regprocedure, 'public.checkout_email_has_account(text)'::regprocedure,
    'public.record_account_agreement(text,uuid,text,text,text,text,text,inet)'::regprocedure,
    'public.checkout_account_request_for_booking(uuid)'::regprocedure, 'public.checkout_account_user_state(text)'::regprocedure)
    and p.prosecdef and p.proconfig = array['search_path=""']), 5, 'all five are definer with an empty search_path');

select is((select count(*)::int from unnest(array['anon','authenticated','vamos_checkout','vamos_system']) r
            where has_table_privilege(r, 'public.account_agreement_records', 'select,insert,update,delete')), 0, 'no role has a table privilege on the record table');
select is((select relrowsecurity from pg_class where oid = 'public.account_agreement_records'::regclass), true, 'RLS is on');

-- Table shape -----------------------------------------------------------------------------------
select is((select count(*)::int from pg_constraint where conname = 'account_agreement_records_surface_check'), 1, 'surface constraint keeps its name');
select is((select count(*)::int from pg_indexes where tablename = 'account_agreement_records'
            and indexdef like '%(booking_id, recorded_at DESC)%'), 1, 'index on booking_id, recorded_at desc');
select is((select count(*)::int from pg_indexes where tablename = 'account_agreement_records'
            and indexdef like '%lower(email)%recorded_at DESC%'), 1, 'index on lower(email), recorded_at desc');

-- CHECKs by direct insert (as postgres) ---------------------------------------------------------
select throws_ok($$insert into public.account_agreement_records (surface, email, choice, record_kind, text_version, locale) values ('checkout','x@e.test','create','consent',null,'en')$$, '23502', null, 'text_version null refused');
select throws_ok($$insert into public.account_agreement_records (surface, email, choice, record_kind, text_version, locale) values ('checkout','x@e.test','create','consent','','en')$$, '23514', null, 'blank text_version refused');
select throws_ok($$insert into public.account_agreement_records (surface, email, choice, record_kind, text_version, locale) values ('checkout','x@e.test','create','informed','v1','en')$$, '23514', null, 'create with informed refused');
select throws_ok($$insert into public.account_agreement_records (surface, email, choice, record_kind, text_version, locale) values ('checkout','x@e.test','guest','consent','v1','en')$$, '23514', null, 'guest with consent refused');
select throws_ok($$insert into public.account_agreement_records (surface, email, choice, record_kind, text_version, locale) values ('mobile','x@e.test','create','consent','v1','en')$$, '23514', null, 'unknown surface refused');
select throws_ok($$insert into public.account_agreement_records (surface, email, choice, record_kind, text_version, locale) values ('sign-up','x@e.test','guest','informed','v1','en')$$, '23514', null, 'sign-up guest refused');
select throws_ok($$insert into public.account_agreement_records (surface, booking_id, email, choice, record_kind, text_version, locale) select 'sign-up', booking_id, 'x@e.test','create','consent','v1','en' from aar_a2$$, '23514', null, 'sign-up with a booking refused');

-- has_account -----------------------------------------------------------------------------------
set local role vamos_checkout;
select is(public.checkout_email_has_account('  KNOWN.user@example.TEST '), true, 'has_account: mixed case and spaces');
select is(public.checkout_email_has_account('unconf.checkout@example.test'), true, 'has_account: unconfirmed counts');
select is(public.checkout_email_has_account('nobody@example.test'), false, 'has_account: unknown is false');

-- record: checkout surface ----------------------------------------------------------------------
select ok(public.record_account_agreement('checkout', (select booking_id from aar_b2), null, 'create', '2026-09-29', 'de', 'ua', '203.0.113.0') > 0, 'record: create returns an id');
select ok(public.record_account_agreement('checkout', (select booking_id from aar_a2), null, 'create', '2026-09-29', 'en', null, null) > 0, 'record: create on the unpaid booking');
select throws_ok($$select public.record_account_agreement('checkout', (select booking_id from aar_b2), null, 'guest', '2026-09-29', 'en', null, null)$$, '22023', null, 'record: guest refused while the switch is off (D-09)');
reset role;
update public.settings set guest_accounts_live = true where id = 1;
select is(public.checkout_account_settings(), true, 'checkout_account_settings is true after the update');
set local role vamos_checkout;
select ok(public.record_account_agreement('checkout', (select booking_id from aar_b2), null, 'guest', '2026-09-29', 'fr', null, null) > 0, 'record: guest accepted while the switch is on');
select throws_ok($$select public.record_account_agreement('checkout', (select booking_id from aar_b2), null, 'create', null, 'en', null, null)$$, '22023', null, 'record: null version refused (create)');
select throws_ok($$select public.record_account_agreement('checkout', (select booking_id from aar_b2), null, 'guest', '  ', 'en', null, null)$$, '22023', null, 'record: blank version refused (guest)');
select throws_ok($$select public.record_account_agreement('checkout', '00000000-0000-4000-8000-000000000000', null, 'create', 'v1', 'en', null, null)$$, '22023', null, 'record: unknown booking refused');
select throws_ok($$select public.record_account_agreement('checkout', null, null, 'create', 'v1', 'en', null, null)$$, '22023', null, 'record: null booking refused');
select throws_ok($$select public.record_account_agreement('checkout', (select booking_id from aar_b2), null, 'maybe', 'v1', 'en', null, null)$$, '22023', null, 'record: bad choice refused');
select throws_ok($$select public.record_account_agreement('checkout', (select booking_id from aar_b2), null, 'create', 'v1', 'es', null, null)$$, '22023', null, 'record: bad locale refused');
select throws_ok($$select public.record_account_agreement('checkout', (select booking_id from aar_b2), 'evil@example.test', 'create', 'v1', 'en', null, null)$$, '22023', null, 'record: a passed e-mail is refused on checkout (D-19)');
-- record: sign-up surface refusals
select throws_ok($$select public.record_account_agreement('sign-up', (select booking_id from aar_b2), 'a@example.test', 'create', 'v1', 'en', null, null)$$, '22023', null, 'sign-up: a booking is refused');
select throws_ok($$select public.record_account_agreement('sign-up', null, null, 'create', 'v1', 'en', null, null)$$, '22023', null, 'sign-up: missing e-mail refused');
select throws_ok($$select public.record_account_agreement('sign-up', null, 'a@example.test', 'guest', 'v1', 'en', null, null)$$, '22023', null, 'sign-up: guest refused');
select throws_ok($$select public.record_account_agreement('app', null, 'a@example.test', 'create', 'v1', 'en', null, null)$$, '22023', null, 'record: unknown surface refused');
reset role;

-- Rows written above ----------------------------------------------------------------------------
select is((select record_kind || '/' || surface || '/' || email from public.account_agreement_records
            where booking_id = (select booking_id from aar_b2) and choice = 'create'),
          'consent/checkout/aar-b@example.test', 'create row: consent, checkout surface, e-mail copied from the booking (D-12)');
select is((select record_kind from public.account_agreement_records
            where booking_id = (select booking_id from aar_b2) and choice = 'guest'), 'informed', 'guest row: informed (D-13)');
select is((select host(ip_truncated) from public.account_agreement_records
            where booking_id = (select booking_id from aar_b2) and choice = 'create'), '203.0.113.0', 'ip is stored');

-- sign-up as postgres; the vamos_system grant is proved in signup_agreement_grant.test.sql
select ok(public.record_account_agreement('sign-up', null, '  New.Person@Example.TEST ', 'create', '2026-09-29', 'ar', null, null) > 0, 'sign-up: create accepted');
select is((select record_kind || '/' || coalesce(booking_id::text, 'none') || '/' || email from public.account_agreement_records
            where surface = 'sign-up'), 'consent/none/new.person@example.test', 'sign-up row: consent, no booking, e-mail lower-cased');

-- Append-only -----------------------------------------------------------------------------------
select throws_ok($$update public.account_agreement_records set text_version = 'x'$$, null, null, 'UPDATE raises even as postgres');
select throws_ok($$delete from public.account_agreement_records$$, null, null, 'DELETE raises even as postgres');
set local role anon;
select throws_ok($$select 1 from public.account_agreement_records$$, '42501', null, 'anon: no select');
reset role;
set local role authenticated;
select throws_ok($$insert into public.account_agreement_records (surface,email,choice,record_kind,text_version,locale) values ('checkout','x@e.test','create','consent','v1','en')$$, '42501', null, 'authenticated: no insert');
reset role;

-- request_for_booking ---------------------------------------------------------------------------
set local role vamos_system;
select is((select count(*)::int from public.checkout_account_request_for_booking((select booking_id from aar_a2))), 0, 'request: nothing for the unpaid booking');
select is((select choice from public.checkout_account_request_for_booking((select booking_id from aar_b2))), 'guest', 'request: latest row for the paid booking (guest, switch on)');
select is((select email || '/' || full_name || '/' || locale from public.checkout_account_request_for_booking((select booking_id from aar_b2))),
          'aar-b@example.test/Aar Guest/fr', 'request: email, name, locale');
reset role;
update public.settings set guest_accounts_live = false where id = 1;
set local role vamos_system;
select is((select choice from public.checkout_account_request_for_booking((select booking_id from aar_b2))), 'create', 'request: guest row ignored while the switch is off');
reset role;
update public.bookings set contact_email = 'changed@example.test' where id = (select booking_id from aar_b2);
set local role vamos_system;
select is((select count(*)::int from public.checkout_account_request_for_booking((select booking_id from aar_b2))), 0, 'request: nothing after the booking e-mail changed');

-- user_state ------------------------------------------------------------------------------------
select is((select user_exists::text || confirmed::text || checkout_origin::text from public.checkout_account_user_state('nobody@example.test')), 'falsefalsefalse', 'user_state: unknown');
select is((select user_exists::text || confirmed::text || checkout_origin::text from public.checkout_account_user_state('Unconf.Checkout@example.test')), 'truefalsetrue', 'user_state: unconfirmed checkout-made');
select is((select user_exists::text || confirmed::text || checkout_origin::text from public.checkout_account_user_state('known.user@example.test')), 'truetruefalse', 'user_state: confirmed ordinary');
reset role;

-- D-05 ------------------------------------------------------------------------------------------
delete from public.customers where user_id = 'a5000000-0000-0000-0000-000000000002';
insert into public.bookings (id, contact_name, contact_email) values
  ('b5000000-0000-0000-0000-000000000002', 'Unconfirmed Guest', 'unconf.checkout@example.test');
select is(app.ensure_customer_for_user('a5000000-0000-0000-0000-000000000002'), null, 'D-05: ensure_customer_for_user is null for an unconfirmed user');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a5000000-0000-0000-0000-000000000002","role":"authenticated","email":"unconf.checkout@example.test"}', true);
select is(public.customer_claim_guest_bookings(), 0, 'D-05: an unconfirmed user claims no booking');
reset role;

select * from finish();
rollback;
