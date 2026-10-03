-- meta_purchase.test.sql
--
-- Phase 29 plan 02 (META-10..13, D-01..D-05): the once-only Meta Purchase claim.
-- meta_purchase_claim decides send or skip inside one transaction under the booking lock and
-- writes one row per booking; a later payment writes nothing; every row-writing decision empties
-- the three cookie values; the Pay press writer takes a consent subject. Synthetic data only,
-- rappen integers only. Run as postgres by `supabase test db`.
begin;
select plan(115);

-- ── objects and grants ───────────────────────────────────────────────────────────────────────
select has_column('public', 'bookings', 'meta_consent_subject', 'bookings.meta_consent_subject exists');
select col_type_is('public', 'bookings', 'meta_consent_subject', 'uuid', 'meta_consent_subject is uuid');
select col_is_null('public', 'bookings', 'meta_consent_subject', 'meta_consent_subject is nullable');
select col_hasnt_default('public', 'bookings', 'meta_consent_subject', 'meta_consent_subject has no default');
select ok(not has_column_privilege('authenticated', 'public.bookings', 'meta_consent_subject', 'SELECT'), 'authenticated cannot select meta_consent_subject');
select ok(not has_column_privilege('vamos_guest', 'public.bookings', 'meta_consent_subject', 'SELECT'), 'vamos_guest cannot select meta_consent_subject');

select has_table('public', 'meta_purchase_events', 'meta_purchase_events exists');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.meta_purchase_events'::regclass), 'meta_purchase_events: RLS enabled and forced');
select ok(not exists (
  select 1 from pg_roles r, unnest(array['SELECT','INSERT','UPDATE','DELETE']) p(priv)
   where r.rolname in ('anon','authenticated','vamos_guest','vamos_edge','vamos_public','vamos_checkout','vamos_system')
     and has_table_privilege(r.rolname, 'public.meta_purchase_events', p.priv)
), 'meta_purchase_events: no table privilege for any app role');
select is((select count(*)::int from pg_policy where polrelid = 'public.meta_purchase_events'::regclass), 0, 'meta_purchase_events has no policies');

select function_privs_are('public', 'meta_purchase_claim', '{uuid,bigint,text,boolean,boolean,text}'::text[], 'vamos_system', '{EXECUTE}'::text[], 'claim: vamos_system has EXECUTE');
select function_privs_are('public', 'meta_purchase_finish', '{uuid,uuid,text,integer,integer,integer}'::text[], 'vamos_system', '{EXECUTE}'::text[], 'finish: vamos_system has EXECUTE');
select function_privs_are('public', 'meta_purchase_clear_ids', '{uuid}'::text[], 'vamos_system', '{EXECUTE}'::text[], 'clear_ids: vamos_system has EXECUTE');
select function_privs_are('public', 'checkout_set_meta_click_ids', '{uuid,text,text,uuid}'::text[], 'vamos_checkout', '{EXECUTE}'::text[], '4-arg writer: vamos_checkout has EXECUTE');
select function_privs_are('public', 'meta_purchase_sweep', '{}'::text[], 'vamos_system', '{EXECUTE}'::text[], 'sweep: vamos_system has EXECUTE');
select ok(not exists (
  select 1 from pg_roles r
   where r.rolname in ('anon','authenticated','vamos_guest','vamos_checkout','vamos_edge','vamos_public')
     and has_function_privilege(r.rolname, 'public.meta_purchase_sweep()', 'EXECUTE')
), 'sweep: no EXECUTE for anon, authenticated, vamos_guest, vamos_checkout, vamos_edge, vamos_public');
select ok((select p.prosecdef and p.proconfig @> array['search_path=""', 'lock_timeout=2s', 'statement_timeout=5s']
             from pg_proc p where p.oid = 'public.meta_purchase_sweep()'::regprocedure),
          'sweep: security definer, search_path "", lock_timeout 2s, statement_timeout 5s');
select ok(not exists (
  select 1 from pg_roles r, (values
    ('public.meta_purchase_claim(uuid,int8,text,bool,bool,text)'),
    ('public.meta_purchase_finish(uuid,uuid,text,int4,int4,int4)'),
    ('public.meta_purchase_clear_ids(uuid)')) f(sig)
   where r.rolname in ('anon','authenticated','vamos_guest','vamos_checkout','vamos_edge','vamos_public')
     and has_function_privilege(r.rolname, f.sig, 'EXECUTE')
), 'claim, finish, clear_ids: no EXECUTE for anon, authenticated, vamos_guest, vamos_checkout, vamos_edge, vamos_public');
select ok(not exists (
  select 1 from pg_roles r
   where r.rolname in ('anon','authenticated','vamos_guest','vamos_system','vamos_edge','vamos_public')
     and has_function_privilege(r.rolname, 'public.checkout_set_meta_click_ids(uuid,text,text,uuid)', 'EXECUTE')
), '4-arg writer: no EXECUTE for anon, authenticated, vamos_guest, vamos_system, vamos_edge, vamos_public');
select ok(not exists (
  select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
   where p.oid in ('public.meta_purchase_claim(uuid,int8,text,bool,bool,text)'::regprocedure,
                   'public.meta_purchase_finish(uuid,uuid,text,int4,int4,int4)'::regprocedure,
                   'public.meta_purchase_clear_ids(uuid)'::regprocedure,
                   'public.checkout_set_meta_click_ids(uuid,text,text,uuid)'::regprocedure,
                   'public.tg_bookings_meta_click_ids_pending_only()'::regprocedure)
     and a.grantee = 0
), 'new functions: PUBLIC has no EXECUTE (F-13)');

select ok((select bool_and(p.prosecdef and p.proconfig @> array['search_path=""'])
             from pg_proc p where p.oid in (
               'public.meta_purchase_claim(uuid,int8,text,bool,bool,text)'::regprocedure,
               'public.meta_purchase_finish(uuid,uuid,text,int4,int4,int4)'::regprocedure,
               'public.meta_purchase_clear_ids(uuid)'::regprocedure,
               'public.checkout_set_meta_click_ids(uuid,text,text,uuid)'::regprocedure)),
          'claim, finish, clear_ids, 4-arg writer are security definer with search_path ""');
select ok((select bool_and(p.proconfig @> array['lock_timeout=2s', 'statement_timeout=5s'])
             from pg_proc p where p.oid in (
               'public.meta_purchase_claim(uuid,int8,text,bool,bool,text)'::regprocedure,
               'public.meta_purchase_finish(uuid,uuid,text,int4,int4,int4)'::regprocedure,
               'public.meta_purchase_clear_ids(uuid)'::regprocedure)),
          'claim, finish, clear_ids carry lock_timeout 2s and statement_timeout 5s (WR-01)');
select ok((select p.proconfig @> array['search_path=""'] from pg_proc p where p.oid = 'public.tg_bookings_meta_click_ids_pending_only()'::regprocedure), 'trigger function has search_path ""');

-- ── fixtures (triggers off: rows are shaped directly, as postgres) ───────────────────────────
set local session_replication_role = replica;

insert into public.consent_log (consent_subject_id, policy_version, method, necessary, functional, analytics, marketing, locale, recorded_at) values
  ('29a00000-0000-4000-8000-000000000001', '2026-10-01', 'accept_all',  true, true,  true,  true,  'en', now() - interval '3 hours'),
  ('29a00000-0000-4000-8000-000000000002', '2026-10-01', 'accept_all',  true, true,  true,  true,  'en', now() - interval '3 hours'),
  ('29a00000-0000-4000-8000-000000000002', '2026-10-01', 'reject_all',  true, false, false, false, 'en', now() - interval '2 hours'),
  ('29a00000-0000-4000-8000-000000000003', '2026-09-12', 'accept_all',  true, true,  true,  true,  'en', now() - interval '3 hours'),
  ('29a00000-0000-4000-8000-000000000004', '2026-10-01', 'accept_all',  true, true,  true,  true,  'en', now() - interval '4 hours'),
  ('29a00000-0000-4000-8000-000000000004', '2026-10-01', 'reject_all',  true, false, false, false, 'en', now() - interval '3 hours'),
  ('29a00000-0000-4000-8000-000000000004', '2026-10-01', 'accept_all',  true, true,  true,  true,  'en', now() - interval '2 hours');

insert into public.bookings (id, contact_name, contact_email, status, is_test, erased_at, meta_fbp, meta_fbc, meta_consent_subject)
select ('c2900000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid, 'Purchase ' || n, 'purchase-' || n || '@example.test',
       st::public.booking_status, tst, ers,
       case when ids then 'fb.1.1727771234567.1234567890' end,
       case when ids then 'fb.1.1727771234567.IwAR0abc_DEF-123' end,
       sub
  from (values
    (1,  'paid',      false, null::timestamptz, true,  '29a00000-0000-4000-8000-000000000001'::uuid),
    (2,  'paid',      false, null, true,  '29a00000-0000-4000-8000-000000000001'),
    (3,  'paid',      false, now(), true, '29a00000-0000-4000-8000-000000000001'),
    (4,  'cancelled', false, null, true,  '29a00000-0000-4000-8000-000000000001'),
    (5,  'paid',      true,  null, true,  '29a00000-0000-4000-8000-000000000001'),
    (6,  'paid',      false, null, true,  '29a00000-0000-4000-8000-000000000001'),
    (7,  'paid',      false, null, true,  '29a00000-0000-4000-8000-000000000001'),
    (8,  'paid',      false, null, true,  '29a00000-0000-4000-8000-000000000001'),
    (9,  'paid',      false, null, true,  '29a00000-0000-4000-8000-000000000001'),
    (10, 'paid',      false, null, true,  '29a00000-0000-4000-8000-000000000001'),
    (11, 'paid',      false, null, true,  '29a00000-0000-4000-8000-000000000001'),
    (12, 'paid',      false, null, false, '29a00000-0000-4000-8000-000000000001'),
    (13, 'paid',      false, null, true,  null),
    (14, 'paid',      false, null, true,  '29a00000-0000-4000-8000-000000000002'),
    (15, 'paid',      false, null, true,  '29a00000-0000-4000-8000-000000000003'),
    (16, 'paid',      false, null, true,  '29a00000-0000-4000-8000-000000000004'),
    (17, 'paid',      false, null, true,  '29a00000-0000-4000-8000-000000000001'),
    (18, 'paid',      false, null, true,  '29a00000-0000-4000-8000-000000000001'),
    (19, 'paid',      false, null, true,  '29a00000-0000-4000-8000-000000000001'),
    (20, 'paid',      false, null, true,  '29a00000-0000-4000-8000-000000000001'),
    (21, 'pending',   false, null, false, null),
    (22, 'paid',      false, null, false, null),
    (23, 'paid',      false, null, true,  '29a00000-0000-4000-8000-000000000001'),
    (24, 'pending',   false, null, false, null),
    (25, 'pending',   false, null, false, null),
    (26, 'paid',      false, null, true,  '29a00000-0000-4000-8000-000000000001')
  ) as v(n, st, tst, ers, ids, sub);

-- The table rule "charged above zero" and "one succeeded payment per booking" are dropped inside
-- this rolled-back transaction so the zero-charge and not-first branches can be shaped.
alter table public.booking_payments drop constraint booking_payments_charged_rappen_check;
drop index public.booking_payments_one_success_per_snapshot;

insert into public.booking_payments (booking_id, snapshot_id, stripe_payment_intent_id, charged_rappen, status, captured_at)
select ('c2900000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid, 0, 'pi_29_' || tag, rap, 'succeeded', cap
  from (values
    (1,  '01',  12000, now() - interval '1 hour'),
    (2,  '02',  12000, now() - interval '1 hour'),
    (3,  '03',  12000, now() - interval '1 hour'),
    (4,  '04',  12000, now() - interval '1 hour'),
    (5,  '05',  12000, now() - interval '1 hour'),
    (6,  '06',  12000, now() - interval '1 hour'),
    (7,  '07',  0,     now() - interval '1 hour'),
    (8,  '08',  12000, now() - interval '8 days'),
    (9,  '09',  12000, now() - interval '1 hour'),
    (10, '10',  12000, now() - interval '1 hour'),
    (11, '11',  12000, now() - interval '1 hour'),
    (12, '12',  12000, now() - interval '1 hour'),
    (13, '13',  12000, now() - interval '1 hour'),
    (14, '14',  12000, now() - interval '1 hour'),
    (15, '15',  12000, now() - interval '1 hour'),
    (16, '16',  12000, now() - interval '1 hour'),
    (17, '17a', 5000,  now() - interval '2 hours'),
    (17, '17b', 7000,  now() - interval '1 hour'),
    (18, '18',  12000, now() - interval '1 hour'),
    (19, '19',  12000, now() - interval '1 hour'),
    (26, '26',  12000, now() - interval '1 hour')
  ) as v(n, tag, rap, cap);

insert into public.booking_refunds (booking_id, snapshot_id, payment_id, reason, basis_rappen, refund_percent, refund_rappen, tier_applied, hours_before)
select b.booking_id, 0, b.id, 'customer_cancel', 12000, 100, 12000, '{}'::jsonb, 48
  from public.booking_payments b where b.stripe_payment_intent_id = 'pi_29_06';

-- Sweep fixtures (WR-02): 27 recent and untouched, 28 old payment, 29 idle for two hours, 30 pending,
-- 31 already has a row, 32 cancelled without a payment.
insert into public.bookings (id, contact_name, contact_email, status, is_test, meta_fbp, meta_fbc, meta_consent_subject, updated_at)
select ('c2900000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid, 'Sweep ' || n, 'sweep-' || n || '@example.test',
       st::public.booking_status, false, 'fb.1.1727771234567.1234567890', 'fb.1.1727771234567.IwAR0abc_DEF-123',
       '29a00000-0000-4000-8000-000000000001', upd
  from (values
    (27, 'paid',      now()),
    (28, 'paid',      now()),
    (29, 'paid',      now() - interval '2 hours'),
    (30, 'pending',   now() - interval '3 hours'),
    (31, 'paid',      now()),
    (32, 'cancelled', now() - interval '3 hours')
  ) as v(n, st, upd);
insert into public.booking_payments (booking_id, snapshot_id, stripe_payment_intent_id, charged_rappen, status, captured_at)
select ('c2900000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid, 0, 'pi_29_' || n, 12000, 'succeeded', cap
  from (values (27, now() - interval '30 minutes'), (28, now() - interval '8 days'), (29, now() - interval '3 hours'), (31, now() - interval '3 hours')) as v(n, cap);
insert into public.meta_purchase_events (booking_id, payment_id, state, skip_reason, test_event)
select ('c2900000-0000-0000-0000-000000000031')::uuid, id, 'skipped', 'no_ids', false
  from public.booking_payments where stripe_payment_intent_id = 'pi_29_31';

set local session_replication_role = origin;

create function pg_temp.pid(p_tag text) returns int8 language sql as
  $$ select id from public.booking_payments where stripe_payment_intent_id = 'pi_29_' || p_tag $$;
create function pg_temp.bid(p_n int) returns uuid language sql as
  $$ select ('c2900000-0000-0000-0000-0000000000' || lpad(p_n::text, 2, '0'))::uuid $$;
create function pg_temp.wiped(p_n int) returns boolean language sql as
  $$ select meta_fbp is null and meta_fbc is null and meta_consent_subject is null from public.bookings where id = pg_temp.bid(p_n) $$;

-- ── writer: 4-arg, as the checkout role ──────────────────────────────────────────────────────
set local role vamos_checkout;
select lives_ok($$ select public.checkout_set_meta_click_ids(pg_temp.bid(21), 'fb.1.1727771234567.1234567890', 'fb.1.1727771234567.IwAR0abc_DEF-123', '29a00000-0000-4000-8000-000000000001') $$, 'writer: pending booking takes ids and subject');
reset role;
select is((select meta_fbp || '|' || meta_fbc || '|' || meta_consent_subject::text from public.bookings where id = pg_temp.bid(21)),
  'fb.1.1727771234567.1234567890|fb.1.1727771234567.IwAR0abc_DEF-123|29a00000-0000-4000-8000-000000000001', 'writer: all three stored');
set local role vamos_checkout;
select throws_ok($$ select public.checkout_set_meta_click_ids(pg_temp.bid(24), 'fb.1.1727771234567.1234567890', null, null) $$, '22023', null, 'writer: ids without a subject raise 22023');
select throws_ok($$ select public.checkout_set_meta_click_ids(pg_temp.bid(22), 'fb.1.1727771234567.1234567890', null, '29a00000-0000-4000-8000-000000000001') $$, '55000', null, 'writer: paid booking raises 55000');
select throws_ok($$ select public.checkout_set_meta_click_ids('c2900000-0000-0000-0000-0000000000ff', null, null, null) $$, 'P0002', null, 'writer: unknown booking raises P0002');
select lives_ok($$ select public.checkout_set_meta_click_ids(pg_temp.bid(21), null, null, null) $$, 'writer: all null clears');
select lives_ok($$ select public.checkout_set_meta_click_ids(pg_temp.bid(25), 'fb.1.1727771234567.1234567890', null) $$, 'writer: 3-arg overload still works (deploy gap)');
reset role;
select ok(pg_temp.wiped(21), 'writer: all three empty after clearing');
select is((select meta_fbp from public.bookings where id = pg_temp.bid(25)), 'fb.1.1727771234567.1234567890', '3-arg writer stored the id');
-- WR-03: the 3-arg writer clears a subject the new Worker saved earlier
reset role;
update public.bookings set meta_consent_subject = '29a00000-0000-4000-8000-000000000001' where id = pg_temp.bid(25);
set local role vamos_checkout;
select lives_ok($$ select public.checkout_set_meta_click_ids(pg_temp.bid(25), 'fb.1.1727771234567.1234567890', null) $$, '3-arg writer: second press on a booking that holds a subject');
reset role;
select is((select meta_consent_subject from public.bookings where id = pg_temp.bid(25)), null, '3-arg writer: consent subject cleared (WR-03)');
select function_privs_are('public', 'checkout_set_meta_click_ids', '{uuid,text,text}'::text[], 'vamos_checkout', '{EXECUTE}'::text[], '3-arg writer: vamos_checkout keeps EXECUTE');

-- ── trigger over three columns ───────────────────────────────────────────────────────────────
select throws_ok($$ update public.bookings set meta_consent_subject = '29a00000-0000-4000-8000-000000000009' where id = pg_temp.bid(22) $$, '55000', null, 'trigger: subject set on a paid booking raises 55000 (postgres too)');
select lives_ok($$ update public.bookings set meta_consent_subject = null where id = pg_temp.bid(23) $$, 'trigger: subject set to NULL on a paid booking succeeds');

-- ── claim: send ──────────────────────────────────────────────────────────────────────────────
create temp table r01 as select * from public.meta_purchase_claim(pg_temp.bid(1), pg_temp.pid('01'), '2026-10-01', false, false, null);
select is((select decision from r01), 'send', 'send: decision');
select is((select reason from r01), null, 'send: reason null');
select isnt((select event_id from r01), null, 'send: event id returned');
select is((select fbp from r01), 'fb.1.1727771234567.1234567890', 'send: fbp returned');
select is((select fbc from r01), 'fb.1.1727771234567.IwAR0abc_DEF-123', 'send: fbc returned');
select is((select charged_rappen from r01), 12000, 'send: charged_rappen returned');
select isnt((select captured_at from r01), null, 'send: capture time returned');
select ok(pg_temp.wiped(1), 'send: fbp, fbc and consent subject emptied on the booking');
select is((select state || '|' || test_event::text from public.meta_purchase_events where booking_id = pg_temp.bid(1)), 'sending|false', 'send: one sending row, test_event as passed');
select is((select event_id from public.meta_purchase_events where booking_id = pg_temp.bid(1)), (select event_id from r01), 'send: row event id equals the returned one');
select ok((select e.event_id::text not like '%' || b.reference || '%' and e.event_id::text <> b.reference
             from public.meta_purchase_events e join public.bookings b on b.id = e.booking_id where e.booking_id = pg_temp.bid(1)),
          'send: event id is not the booking reference');

create temp table r01b as select * from public.meta_purchase_claim(pg_temp.bid(1), pg_temp.pid('01'), '2026-10-01', false, false, null);
select is((select decision from r01b), 'already', 'again: decision already');
select is((select event_id from r01b), null, 'again: no event id');
select is((select count(*)::int from public.meta_purchase_events where booking_id = pg_temp.bid(1)), 1, 'again: still one row');
select is((select event_id from public.meta_purchase_events where booking_id = pg_temp.bid(1)), (select event_id from r01), 'again: event id unchanged');

-- ── claim: skip branches (each: one skipped row with the reason, three columns emptied) ──────
create temp table sk (n int, reason text);
insert into sk select 2, reason from public.meta_purchase_claim(pg_temp.bid(2), pg_temp.pid('02'), '2026-10-01', false, true, null);
insert into sk select 3, reason from public.meta_purchase_claim(pg_temp.bid(3), pg_temp.pid('03'), '2026-10-01', false, false, null);
insert into sk select 4, reason from public.meta_purchase_claim(pg_temp.bid(4), pg_temp.pid('04'), '2026-10-01', false, false, null);
insert into sk select 5, reason from public.meta_purchase_claim(pg_temp.bid(5), pg_temp.pid('05'), '2026-10-01', false, false, null);
insert into sk select 6, reason from public.meta_purchase_claim(pg_temp.bid(6), pg_temp.pid('06'), '2026-10-01', false, false, null);
insert into sk select 7, reason from public.meta_purchase_claim(pg_temp.bid(7), pg_temp.pid('07'), '2026-10-01', false, false, null);
insert into sk select 8, reason from public.meta_purchase_claim(pg_temp.bid(8), pg_temp.pid('08'), '2026-10-01', false, false, null);
insert into sk select 9, reason from public.meta_purchase_claim(pg_temp.bid(9), pg_temp.pid('09'), '2026-10-01', true, false, 'no_test_code');
insert into sk select 10, reason from public.meta_purchase_claim(pg_temp.bid(10), pg_temp.pid('10'), '2026-10-01', false, false, 'gate_closed');
insert into sk select 11, reason from public.meta_purchase_claim(pg_temp.bid(11), pg_temp.pid('11'), '2026-10-01', false, false, 'no_token');
insert into sk select 12, reason from public.meta_purchase_claim(pg_temp.bid(12), pg_temp.pid('12'), '2026-10-01', false, false, null);
insert into sk select 13, reason from public.meta_purchase_claim(pg_temp.bid(13), pg_temp.pid('13'), '2026-10-01', false, false, null);
insert into sk select 14, reason from public.meta_purchase_claim(pg_temp.bid(14), pg_temp.pid('14'), '2026-10-01', false, false, null);
insert into sk select 15, reason from public.meta_purchase_claim(pg_temp.bid(15), pg_temp.pid('15'), '2026-10-01', false, false, null);

select is((select reason from sk where n = 2), 'refunded', 'skip: refund required by the Worker -> refunded');
select is((select reason from sk where n = 3), 'erased', 'skip: erased booking -> erased');
select is((select reason from sk where n = 4), 'not_paid', 'skip: cancelled booking -> not_paid');
select is((select reason from sk where n = 5), 'is_test', 'skip: test booking -> is_test');
select is((select reason from sk where n = 6), 'refunded', 'skip: refund row for the payment -> refunded');
select is((select reason from sk where n = 7), 'zero_charge', 'skip: zero charge -> zero_charge');
select is((select reason from sk where n = 8), 'too_old', 'skip: capture 8 days ago -> too_old');
select is((select reason from sk where n = 9), 'no_test_code', 'skip: worker no_test_code');
select is((select reason from sk where n = 10), 'gate_closed', 'skip: worker gate_closed');
select is((select reason from sk where n = 11), 'no_token', 'skip: worker no_token');
select is((select reason from sk where n = 12), 'no_ids', 'skip: both ids empty -> no_ids');
select is((select reason from sk where n = 13), 'no_subject', 'skip: no consent subject -> no_subject');
select is((select reason from sk where n = 14), 'consent_off', 'skip: accept then refuse -> consent_off');
select is((select reason from sk where n = 15), 'consent_off', 'skip: consent only under an older policy -> consent_off');
select is((select count(*)::int from sk where reason is not null), 14, 'skip: every skip branch answered a reason');
select is((select string_agg(distinct decision, ',') from (
            select (select decision from public.meta_purchase_claim(pg_temp.bid(2), pg_temp.pid('02'), '2026-10-01', false, false, null)) as decision) d),
          'already', 'skip: asking again answers already');
select is((select count(*)::int from public.meta_purchase_events e where e.state = 'skipped' and e.skip_reason is not null
            and e.booking_id in (select pg_temp.bid(n) from generate_series(2, 15) n)), 14, 'skip: 14 skipped rows with a reason');
select is((select count(*)::int from public.meta_purchase_events where booking_id in (select pg_temp.bid(n) from generate_series(2, 15) n)
            and test_event), 1, 'skip: test_event stored as passed (only booking 9)');
select ok((select bool_and(pg_temp.wiped(n)) from generate_series(2, 15) n), 'skip: every skip emptied fbp, fbc and consent subject');

-- ── accept, refuse, accept: latest wins ──────────────────────────────────────────────────────
select is((select decision from public.meta_purchase_claim(pg_temp.bid(16), pg_temp.pid('16'), '2026-10-01', false, false, null)), 'send', 'consent: accept, refuse, accept -> send');

-- ── not the first payment ────────────────────────────────────────────────────────────────────
select is((select decision || '|' || reason from public.meta_purchase_claim(pg_temp.bid(17), pg_temp.pid('17b'), '2026-10-01', false, false, null)),
  'skip|not_first_payment', 'later payment: skip not_first_payment');
select is((select count(*)::int from public.meta_purchase_events where booking_id = pg_temp.bid(17)), 0, 'later payment: no row written');
select ok(not pg_temp.wiped(17), 'later payment: nothing cleared');
select is((select decision from public.meta_purchase_claim(pg_temp.bid(17), pg_temp.pid('17a'), '2026-10-01', false, false, null)), 'send', 'first payment still sends after the later one was refused');
select is((select decision || '|' || reason from public.meta_purchase_claim(pg_temp.bid(18), pg_temp.pid('01'), '2026-10-01', false, false, null)),
  'skip|not_first_payment', 'payment of another booking: skip not_first_payment');
select is((select count(*)::int from public.meta_purchase_events where booking_id = pg_temp.bid(18)), 0, 'payment of another booking: no row written');
select ok(not pg_temp.wiped(18), 'payment of another booking: nothing cleared');
select throws_ok($$ select * from public.meta_purchase_claim(pg_temp.bid(19), pg_temp.pid('19'), '2026-10-01', false, false, 'bogus') $$, '22023', null, 'claim: unknown worker skip raises 22023');
select throws_ok($$ select * from public.meta_purchase_claim('c2900000-0000-0000-0000-0000000000ff', 1, '2026-10-01', false, false, null) $$, 'P0002', null, 'claim: unknown booking raises P0002');

-- ── finish ───────────────────────────────────────────────────────────────────────────────────
select lives_ok($$ select public.meta_purchase_finish(pg_temp.bid(1), '00000000-0000-4000-8000-0000000000aa', 'sent', 200, null, null) $$, 'finish: wrong event id does nothing');
select is((select state from public.meta_purchase_events where booking_id = pg_temp.bid(1)), 'sending', 'finish: wrong event id left the row sending');
select lives_ok($$ select public.meta_purchase_finish(pg_temp.bid(1), (select event_id from r01), 'sent', 200, null, null) $$, 'finish: sending -> sent');
select is((select state || '|' || http_status::text || '|' || (finished_at is not null)::text from public.meta_purchase_events where booking_id = pg_temp.bid(1)), 'sent|200|true', 'finish: state, http status, finished_at set');
select lives_ok($$ select public.meta_purchase_finish(pg_temp.bid(1), (select event_id from r01), 'failed', 500, 1, 2) $$, 'finish: second finish does nothing');
select is((select state || '|' || http_status::text from public.meta_purchase_events where booking_id = pg_temp.bid(1)), 'sent|200', 'finish: second finish changed nothing');
select throws_ok($$ select public.meta_purchase_finish(pg_temp.bid(1), (select event_id from r01), 'skipped', 200, null, null) $$, '22023', null, 'finish: state outside sent/rejected/failed raises 22023');
select lives_ok($$ select public.meta_purchase_finish(pg_temp.bid(16), (select event_id from public.meta_purchase_events where booking_id = pg_temp.bid(16)), 'rejected', 400, 100, 33) $$, 'finish: sending -> rejected');
select is((select state || '|' || graph_code::text || '|' || graph_subcode::text from public.meta_purchase_events where booking_id = pg_temp.bid(16)), 'rejected|100|33', 'finish: graph code and subcode stored');

-- ── table checks ─────────────────────────────────────────────────────────────────────────────
select throws_ok($$ insert into public.meta_purchase_events (booking_id, payment_id, state, skip_reason, test_event) values (pg_temp.bid(19), pg_temp.pid('19'), 'skipped', null, false) $$, '23514', null, 'table: skipped without a reason is refused');
select throws_ok($$ insert into public.meta_purchase_events (booking_id, payment_id, state, skip_reason, test_event) values (pg_temp.bid(19), pg_temp.pid('19'), 'sending', 'no_ids', false) $$, '23514', null, 'table: a reason on a non-skipped row is refused');
select throws_ok($$ insert into public.meta_purchase_events (booking_id, payment_id, state, skip_reason, test_event) values (pg_temp.bid(19), pg_temp.pid('19'), 'skipped', 'not_first_payment', false) $$, '23514', null, 'table: not_first_payment is not a stored reason');
select throws_ok($$ insert into public.meta_purchase_events (booking_id, payment_id, state, test_event) values (pg_temp.bid(1), pg_temp.pid('01'), 'sending', false) $$, '23505', null, 'table: one row per booking');

-- ── clear_ids ────────────────────────────────────────────────────────────────────────────────
select lives_ok($$ select public.meta_purchase_clear_ids(pg_temp.bid(20)) $$, 'clear_ids: paid booking holding ids');
select ok(pg_temp.wiped(20), 'clear_ids: fbp, fbc and consent subject emptied');
select lives_ok($$ select public.meta_purchase_clear_ids('c2900000-0000-0000-0000-0000000000ff') $$, 'clear_ids: unknown booking returns without error');
select is((select count(*)::int from public.meta_purchase_events where booking_id = pg_temp.bid(20)), 0, 'clear_ids: writes no event row');

-- ── sweep (WR-02) ────────────────────────────────────────────────────────────────────────────
set local role vamos_system;
select set_config('t29.swept', public.meta_purchase_sweep()::text, false);
reset role;
select ok(current_setting('t29.swept')::int >= 4, 'sweep: cleaned at least the four fixture bookings');
select ok(not pg_temp.wiped(27), 'sweep: a paid booking without a row, touched and paid minutes ago, is left alone');
select ok(not pg_temp.wiped(30), 'sweep: a pending booking is left alone');
select ok(pg_temp.wiped(28), 'sweep: first payment older than seven days: values wiped');
select is((select state || '|' || skip_reason from public.meta_purchase_events where booking_id = pg_temp.bid(28)), 'skipped|interrupted', 'sweep: old payment without a row records skipped / interrupted');
select ok(pg_temp.wiped(29), 'sweep: idle for two hours without a row: values wiped');
select is((select state || '|' || skip_reason from public.meta_purchase_events where booking_id = pg_temp.bid(29)), 'skipped|interrupted', 'sweep: idle booking without a row records skipped / interrupted');
select ok(pg_temp.wiped(31), 'sweep: booking that already has a row: values wiped');
select is((select count(*)::int || '|' || min(skip_reason) from public.meta_purchase_events where booking_id = pg_temp.bid(31)), '1|no_ids', 'sweep: existing row left as it was');
select ok(pg_temp.wiped(32), 'sweep: cancelled booking without a payment: values wiped');
select is((select count(*)::int from public.meta_purchase_events where booking_id = pg_temp.bid(32)), 0, 'sweep: no payment, no row written');
set local role vamos_system;
select is(public.meta_purchase_sweep(), 0, 'sweep: a second run has nothing left to clean');
select is(pg_typeof(public.meta_purchase_sweep())::text, 'integer', 'sweep: returns one int4');
reset role;
select is((select decision from public.meta_purchase_claim(pg_temp.bid(28), pg_temp.pid('28'), '2026-10-01', false, false, null)), 'already', 'sweep: a late claim on a swept booking answers already');

-- ── role path: the system role can run claim, finish, clear_ids ──────────────────────────────
select set_config('t29.pid26', pg_temp.pid('26')::text, false);
set local role vamos_system;
select lives_ok($$ select * from public.meta_purchase_claim(pg_temp.bid(26), current_setting('t29.pid26')::int8, '2026-10-01', false, false, null) $$, 'vamos_system can call the claim');
select lives_ok($$ select public.meta_purchase_clear_ids(pg_temp.bid(26)) $$, 'vamos_system can call clear_ids');
reset role;
select is((select count(*)::int from public.meta_purchase_events where booking_id = pg_temp.bid(26)), 1, 'vamos_system claim wrote its row');

select * from finish();
rollback;
