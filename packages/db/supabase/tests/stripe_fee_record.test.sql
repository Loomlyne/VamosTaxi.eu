-- stripe_fee_record.test.sql
--
-- 20261007290000 (owner decision 2026-10-04, answer 3; controller 2026-10-04: the sweep also fills in
-- the past payments): the fee Stripe took is written once per captured payment by
-- checkout_payment_fee_record; checkout_payment_fee_pending lists what the hourly sweep still has to read
-- (last 30 days, pi_ or cs_ ids, newest first, default 20, never more than 100). Refused values write
-- nothing and return false, never raise. Grants: vamos_system only. Rolled back. Synthetic rappen
-- integers only, never a product CHF figure. Run as postgres by `supabase test db`.
begin;
select plan(36);

insert into public.vehicle_classes (slug, passenger_capacity, luggage_capacity, name)
values ('sfr-class', 4, 4, 'Economy');
-- Rows below are inserted with triggers off (replica), so the fixture version never has to go live.
insert into public.rate_versions (slug, label) values ('sfr-rv', 'SFR fixture');

insert into public.bookings (reference, contact_name, contact_email, status, locale)
select public.next_booking_reference(), 'SFR ' || k, 'sfr-' || k || '@vamostaxi.eu', 'confirmed', 'en'
  from unnest(array['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) as k;

set local session_replication_role = replica;

insert into public.price_snapshots (
  quote_id, vehicle_class_id, rate_version_id, rate_version_is_live, settings_version_id,
  engine_version, pax, bags, lines, policy,
  subtotal_rappen, surcharges_rappen, discount_rappen, total_rappen,
  expires_at, quote_lock_expires_at, booking_id, source
)
select
  gen_random_uuid(), vc.id, rv.id, true, sv.id, 'quote-engine@sfr', 1, 1,
  jsonb_build_array(jsonb_build_object('seq', 1, 'code', 'distance_fare', 'kind', 'fare',
                                       'i18n_key', 'price.line.transfer', 'amount_rappen', 10000)),
  jsonb_build_object('cancellation_tiers', '[]'::jsonb, 'free_cancel_hours', 24,
                     'airport_waiting_minutes', 60, 'city_waiting_minutes', 15,
                     'settings_version_id', sv.id, 'modification_deadline_hours', 24,
                     'min_advance_minutes', 180, 'policy_doc', 'test'),
  10000, 0, 0, 10000, now() + interval '1 day', now() + interval '1 day', b.id, 'web'
from public.vehicle_classes vc
cross join public.bookings b
cross join lateral (select id from public.rate_versions where slug = 'sfr-rv') rv
cross join lateral (select id from public.settings_versions order by id limit 1) sv
where vc.slug = 'sfr-class' and b.contact_email like 'sfr-%@vamostaxi.eu';

update public.bookings b
   set price_snapshot_id = s.id
  from public.price_snapshots s
 where s.booking_id = b.id and s.engine_version = 'quote-engine@sfr';

-- a: succeeded, now. g: succeeded, 1 h ago. b: a duplicate charge (refunded, captured), 2 h ago.
-- e: succeeded 3 h ago, still stores its Checkout Session id. d: succeeded 80 h ago (inside 30 days).
-- h: succeeded 31 days ago (outside). c: never paid. f: failed.
insert into public.booking_payments (booking_id, snapshot_id, stripe_payment_intent_id, charged_rappen,
                                     charged_currency, status, captured_at)
select b.id, b.price_snapshot_id, v.pi, 10000, 'CHF', v.status, v.captured_at
  from public.bookings b
  join (values
    ('sfr-a@vamostaxi.eu', 'pi_sfr_a', 'succeeded', now()),
    ('sfr-g@vamostaxi.eu', 'pi_sfr_g', 'succeeded', now() - interval '1 hour'),
    ('sfr-b@vamostaxi.eu', 'pi_sfr_b', 'duplicate', now() - interval '2 hours'),
    ('sfr-e@vamostaxi.eu', 'cs_test_sfr_e', 'succeeded', now() - interval '3 hours'),
    ('sfr-d@vamostaxi.eu', 'pi_sfr_d', 'succeeded', now() - interval '80 hours'),
    ('sfr-h@vamostaxi.eu', 'pi_sfr_h', 'succeeded', now() - interval '31 days'),
    ('sfr-c@vamostaxi.eu', 'pi_sfr_c', 'requires_payment', null::timestamptz),
    ('sfr-f@vamostaxi.eu', 'pi_sfr_f', 'failed', null::timestamptz)
  ) as v(email, pi, status, captured_at) on v.email = b.contact_email;

set local session_replication_role = origin;

create function pg_temp.fee(p_pi pg_catalog.text) returns pg_catalog.int4
language sql stable as $$
  select stripe_fee_rappen::pg_catalog.int4 from public.booking_payments where stripe_payment_intent_id = p_pi
$$;

-- This file's rows only, in the order the function returns them.
create function pg_temp.pending(p_limit pg_catalog.int4) returns pg_catalog.text[]
language sql stable as $$
  select coalesce(array_agg(x.stripe_payment_intent_id order by x.n), '{}')
    from (select stripe_payment_intent_id, row_number() over () as n
            from public.checkout_payment_fee_pending(p_limit)
           where stripe_payment_intent_id ~ '^(pi|cs_test)_sfr_') as x
$$;

-- Shape ------------------------------------------------------------------------------------------
select ok((select p.prosecdef and p.proconfig @> array['search_path=""', 'lock_timeout=2s', 'statement_timeout=5s']
             from pg_proc p where p.oid = 'public.checkout_payment_fee_record(text,int4)'::regprocedure),
          'record: security definer, search_path "", lock_timeout 2s, statement_timeout 5s');
select ok((select p.prosecdef and p.proconfig @> array['search_path=""', 'lock_timeout=2s', 'statement_timeout=5s']
             from pg_proc p where p.oid = 'public.checkout_payment_fee_pending(int4)'::regprocedure),
          'pending: security definer, search_path "", lock_timeout 2s, statement_timeout 5s');
select is((select p.provolatile::text from pg_proc p where p.oid = 'public.checkout_payment_fee_pending(int4)'::regprocedure),
          's', 'pending: stable (reads only)');
select is(pg_get_function_arguments('public.checkout_payment_fee_pending(int4)'::regprocedure),
          'p_limit integer DEFAULT 20', 'pending: 20 a run unless the caller says otherwise');

-- Grants -----------------------------------------------------------------------------------------
select ok((select bool_and(a.grantee::regrole::text in ('postgres', 'service_role', 'vamos_system'))
                  and bool_or(a.grantee::regrole::text = 'vamos_system')
             from pg_proc p, aclexplode(p.proacl) a
            where p.oid = 'public.checkout_payment_fee_record(text,int4)'::regprocedure
              and a.privilege_type = 'EXECUTE'),
          'record: EXECUTE for vamos_system, otherwise only postgres and service_role');
select ok((select bool_and(a.grantee::regrole::text in ('postgres', 'service_role', 'vamos_system'))
                  and bool_or(a.grantee::regrole::text = 'vamos_system')
             from pg_proc p, aclexplode(p.proacl) a
            where p.oid = 'public.checkout_payment_fee_pending(int4)'::regprocedure
              and a.privilege_type = 'EXECUTE'),
          'pending: EXECUTE for vamos_system, otherwise only postgres and service_role');
select ok(not has_function_privilege('anon', 'public.checkout_payment_fee_record(text,int4)', 'EXECUTE')
      and not has_function_privilege('authenticated', 'public.checkout_payment_fee_record(text,int4)', 'EXECUTE')
      and not has_function_privilege('vamos_staff', 'public.checkout_payment_fee_record(text,int4)', 'EXECUTE')
      and not has_function_privilege('vamos_guest', 'public.checkout_payment_fee_record(text,int4)', 'EXECUTE')
      and not has_function_privilege('anon', 'public.checkout_payment_fee_pending(int4)', 'EXECUTE')
      and not has_function_privilege('authenticated', 'public.checkout_payment_fee_pending(int4)', 'EXECUTE'),
  'no customer, guest or staff role can call either function');

-- Pending ----------------------------------------------------------------------------------------
select is(pg_temp.pending(100), array['pi_sfr_a', 'pi_sfr_g', 'pi_sfr_b', 'cs_test_sfr_e', 'pi_sfr_d'],
  'pending: captured (succeeded or duplicate), fee NULL, last 30 days, pi_ and cs_ ids, newest first');
select ok('pi_sfr_d' = any (pg_temp.pending(100)), 'pending: a payment from 80 h ago is still listed (backfill)');
select ok('pi_sfr_h' <> all (pg_temp.pending(100)), 'pending: a payment older than 30 days is not listed');
select ok('cs_test_sfr_e' = any (pg_temp.pending(100)), 'pending: a payment that stores its Checkout Session id is listed');
select is(pg_temp.pending(1), array['pi_sfr_a'], 'pending: the limit is honoured');
select is(pg_temp.pending(0), '{}'::text[], 'pending: limit 0 lists nothing');
select is(pg_temp.pending(-5), '{}'::text[], 'pending: a negative limit lists nothing');
select ok((select count(*) <= 100 from public.checkout_payment_fee_pending(100000)), 'pending: never more than 100');

-- Record, as the Worker's role ------------------------------------------------------------------
set local role vamos_system;
select ok(public.checkout_payment_fee_record('pi_sfr_a', 317), 'record: a succeeded row takes its fee');
select ok(not public.checkout_payment_fee_record('pi_sfr_a', 317), 'record: the same fee again writes nothing');
select ok(not public.checkout_payment_fee_record('pi_sfr_a', 318), 'record: a different fee never overwrites');
select ok(public.checkout_payment_fee_record('pi_sfr_b', 290), 'record: a refunded duplicate charge takes its fee');
select ok(public.checkout_payment_fee_record('cs_test_sfr_e', 305), 'record: a payment stored by its Checkout Session id takes its fee');
select ok(public.checkout_payment_fee_record('pi_sfr_d', 333), 'record: a payment from 80 h ago takes its fee');
select ok(public.checkout_payment_fee_record('pi_sfr_h', 334), 'record: a payment older than the window still takes its fee');
select ok(not public.checkout_payment_fee_record('pi_sfr_c', 300), 'record: an unpaid row is refused');
select ok(not public.checkout_payment_fee_record('pi_sfr_f', 300), 'record: a failed row is refused');
select ok(not public.checkout_payment_fee_record('pi_sfr_nope', 300), 'record: an unknown PaymentIntent writes nothing');
select ok(not public.checkout_payment_fee_record('ch_sfr_g', 300), 'record: an id that is neither pi_ nor cs_ is refused');
select ok(not public.checkout_payment_fee_record('pi_sfr_g', 0), 'record: fee 0 is refused');
select ok(not public.checkout_payment_fee_record('pi_sfr_g', -1), 'record: a negative fee is refused');
select ok(not public.checkout_payment_fee_record('pi_sfr_g', null), 'record: a null fee is refused');
select ok(not public.checkout_payment_fee_record(null, 300), 'record: a null id is refused');
select ok(not public.checkout_payment_fee_record('pi_sfr_g', 10000), 'record: a fee equal to the charge is refused');
reset role;

select is(pg_temp.fee('pi_sfr_a'), 317, 'stored: the first fee stays');
select ok(pg_temp.fee('pi_sfr_g') is null and pg_temp.fee('pi_sfr_c') is null and pg_temp.fee('pi_sfr_f') is null,
  'stored: refused calls left every other fee NULL');
select is(pg_temp.pending(100), array['pi_sfr_g'], 'pending: recorded rows leave the list');

-- Callers without the grant ---------------------------------------------------------------------
set local role anon;
select throws_ok($$ select public.checkout_payment_fee_record('pi_sfr_g', 300) $$, '42501', null,
  'anon cannot record a fee');
reset role;
set local role authenticated;
select throws_ok($$ select * from public.checkout_payment_fee_pending(10) $$, '42501', null,
  'authenticated cannot list pending fees');
reset role;

select * from finish();
rollback;
