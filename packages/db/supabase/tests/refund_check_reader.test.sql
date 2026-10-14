-- refund_check_reader.test.sql
--
-- 20261012240000 (Phase 31, refunds in Stripe; 31-CONTEXT D-09..D-12, C-02):
--   refund_check_read(jsonb)          the nightly refund check reader: reads only, one row per input element in
--                                     input order, reference never name or e-mail, more than 500 inputs raise;
--                                     for a recorded refund, its booking id and whether its mail was claimed.
--   notification_claim_refund(...)    one refund mail claim per Stripe refund (dedupe booking:refund:<re_id>),
--                                     only for a refund recorded on that booking, locale from the booking.
--   notification_refund_read(int8)    booking, Stripe refund id and recorded refund_rappen for an unsent claim.
-- Grants: vamos_system only. Rolled back. Synthetic ids and rappen integers only, never a product CHF figure.
-- Run as postgres by `supabase test db`.
begin;
select plan(55);

-- Fixtures -----------------------------------------------------------------------------------------
insert into public.vehicle_classes (slug, passenger_capacity, luggage_capacity, name)
values ('rcr-class', 4, 4, 'Economy');
insert into public.rate_versions (slug, label) values ('rcr-rv', 'RCR fixture');

-- a: locale de, one payment with four Stripe refunds (recorded, different amount, reversed, missing).
-- b: locale en, a succeeded payment and a duplicate charge refunded in full (left out of the sum).
-- c: locale fr, refunded_rappen differs from its refund rows.
insert into public.bookings (reference, contact_name, contact_email, status, locale)
select public.next_booking_reference(), 'RCR ' || k, 'rcr-' || k || '@vamostaxi.eu', 'confirmed', l
  from (values ('a', 'de'), ('b', 'en'), ('c', 'fr')) as v(k, l);

set local session_replication_role = replica;

insert into public.price_snapshots (
  quote_id, vehicle_class_id, rate_version_id, rate_version_is_live, settings_version_id,
  engine_version, pax, bags, lines, policy,
  subtotal_rappen, surcharges_rappen, discount_rappen, total_rappen,
  expires_at, quote_lock_expires_at, booking_id, source
)
select
  gen_random_uuid(), vc.id, rv.id, true, sv.id, 'quote-engine@rcr', 1, 1, '[]'::jsonb,
  jsonb_build_object('cancellation_tiers', '[]'::jsonb, 'free_cancel_hours', 24,
                     'airport_waiting_minutes', 60, 'city_waiting_minutes', 15,
                     'settings_version_id', sv.id, 'modification_deadline_hours', 24,
                     'min_advance_minutes', 180, 'policy_doc', 'test'),
  10000, 0, 0, 10000, now() + interval '1 day', now() + interval '1 day', b.id, 'web'
from public.vehicle_classes vc
cross join public.bookings b
cross join lateral (select id from public.rate_versions where slug = 'rcr-rv') rv
cross join lateral (select id from public.settings_versions order by id limit 1) sv
where vc.slug = 'rcr-class' and b.contact_email like 'rcr-%@vamostaxi.eu';

update public.bookings b
   set price_snapshot_id = s.id
  from public.price_snapshots s
 where s.booking_id = b.id and s.engine_version = 'quote-engine@rcr';

insert into public.booking_payments (booking_id, snapshot_id, stripe_payment_intent_id, charged_rappen,
                                     charged_currency, status, captured_at)
select b.id, b.price_snapshot_id, v.pi, 10000, 'CHF', v.status, now()
  from public.bookings b
  join (values
    ('rcr-a@vamostaxi.eu', 'pi_t_a', 'succeeded'),
    ('rcr-b@vamostaxi.eu', 'pi_t_b', 'succeeded'),
    ('rcr-b@vamostaxi.eu', 'pi_t_b_dup', 'duplicate'),
    ('rcr-c@vamostaxi.eu', 'pi_t_c', 'succeeded')
  ) as v(email, pi, status) on v.email = b.contact_email;

insert into public.booking_refunds (booking_id, snapshot_id, payment_id, reason, basis_rappen, refund_percent,
                                    refund_rappen, tier_applied, hours_before, stripe_refund_id)
select p.booking_id, p.snapshot_id, p.id, v.reason, v.rappen, 100, v.rappen, '{}'::jsonb, 0, v.re
  from public.booking_payments p
  join (values
    ('pi_t_a', 're_t_rec', 'stripe_dashboard', 2000),
    ('pi_t_a', 're_t_diff', 'stripe_dashboard', 1500),
    ('pi_t_a', 're_t_rev', 'ops_cancel', 1000),
    ('pi_t_b_dup', 're_t_dup', 'duplicate_charge', 10000),
    ('pi_t_b', 're_t_b', 'stripe_dashboard', 500),
    ('pi_t_c', 're_t_c', 'ops_cancel', 3000)
  ) as v(pi, re, reason, rappen) on v.pi = p.stripe_payment_intent_id;

insert into public.booking_refund_reversals (refund_id, booking_id, payment_id, stripe_refund_id, stripe_status,
                                             failure_reason, reversed_rappen, stripe_created)
select r.id, r.booking_id, r.payment_id, r.stripe_refund_id, 'failed', 'expired_or_canceled_card', r.refund_rappen, now()
  from public.booking_refunds r where r.stripe_refund_id = 're_t_rev';

update public.bookings b
   set refunded_rappen = v.refunded, refund_status = v.status
  from (values ('rcr-a@vamostaxi.eu', 3500, 'none'),
               ('rcr-b@vamostaxi.eu', 500, 'none'),
               ('rcr-c@vamostaxi.eu', 5000, 'refunded')) as v(email, refunded, status)
 where b.contact_email = v.email;

set local session_replication_role = origin;

create function pg_temp.ref(p_k text) returns text language sql stable as $$
  select reference from public.bookings where contact_email = 'rcr-' || p_k || '@vamostaxi.eu'
$$;
create function pg_temp.counts() returns text language sql stable as $$
  select concat_ws(',',
    (select count(*) from public.bookings), (select count(*) from public.booking_payments),
    (select count(*) from public.booking_refunds), (select count(*) from public.booking_refund_reversals),
    (select count(*) from public.booking_notifications))
$$;

create temp table rcr (
  n pg_catalog.int8, stripe_refund_id text, payment_intent_id text, payment_found bool, payment_status text,
  booking_reference text, site_refund_rappen int8, site_reason text, site_reversed bool,
  booking_refunded_rappen int8, booking_rows_sum_rappen int8, booking_refund_status text
);
create temp table ids as
  select substr(contact_email, 5, 1) as k, id from public.bookings where contact_email like 'rcr-_@vamostaxi.eu';
create temp table misc (k text primary key, v text);
create temp table claims (k text primary key, id int8);
grant select, insert on rcr, misc, claims to vamos_system;
grant select on ids to vamos_system;

insert into misc values ('counts_before', pg_temp.counts());

-- Shape --------------------------------------------------------------------------------------------- 9
select ok((select p.prosecdef and p.proconfig @> array['search_path=""', 'lock_timeout=2s', 'statement_timeout=5s']
             from pg_proc p where p.oid = 'public.refund_check_read(jsonb)'::regprocedure),
          'reader: security definer, search_path "", lock_timeout 2s, statement_timeout 5s');
select ok((select p.prosecdef and p.proconfig @> array['search_path=""']
             from pg_proc p where p.oid = 'public.notification_claim_refund(uuid,text,text)'::regprocedure),
          'claim: security definer, search_path ""');
select ok((select p.prosecdef and p.proconfig @> array['search_path=""']
             from pg_proc p where p.oid = 'public.notification_refund_read(int8)'::regprocedure),
          'claim reader: security definer, search_path ""');
select is((select p.provolatile::text from pg_proc p where p.oid = 'public.refund_check_read(jsonb)'::regprocedure),
          's', 'reader: stable (Postgres refuses a write inside it)');
select is((select p.provolatile::text from pg_proc p where p.oid = 'public.notification_refund_read(int8)'::regprocedure),
          's', 'claim reader: stable');
select is((select l.lanname::text from pg_proc p join pg_language l on l.oid = p.prolang
            where p.oid = 'public.refund_check_read(jsonb)'::regprocedure),
          'plpgsql', 'reader: plpgsql (so it can raise too_many_refunds)');
select is((select l.lanname::text from pg_proc p join pg_language l on l.oid = p.prolang
            where p.oid = 'public.notification_claim_refund(uuid,text,text)'::regprocedure),
          'plpgsql', 'claim: plpgsql');
select is(pg_get_function_result('public.refund_check_read(jsonb)'::regprocedure),
          'TABLE(stripe_refund_id text, payment_intent_id text, payment_found boolean, payment_status text, '
          || 'booking_reference text, site_refund_rappen bigint, site_reason text, site_reversed boolean, '
          || 'booking_refunded_rappen bigint, booking_rows_sum_rappen bigint, booking_refund_status text, '
          || 'site_refund_booking_id uuid, refund_mail_claimed boolean)',
          'reader: column list pinned (reference and amounts only, no name or e-mail)');
select is(pg_get_function_result('public.notification_refund_read(int8)'::regprocedure),
          'TABLE(booking_id uuid, stripe_refund_id text, refund_rappen bigint, locale text)',
          'claim reader: column list pinned');

-- Grants -------------------------------------------------------------------------------------------- 7
select ok(not has_function_privilege('anon', 'public.refund_check_read(jsonb)', 'EXECUTE')
      and not has_function_privilege('authenticated', 'public.refund_check_read(jsonb)', 'EXECUTE')
      and not has_function_privilege('service_role', 'public.refund_check_read(jsonb)', 'EXECUTE')
      and not has_function_privilege('vamos_staff', 'public.refund_check_read(jsonb)', 'EXECUTE')
      and not has_function_privilege('vamos_guest', 'public.refund_check_read(jsonb)', 'EXECUTE'),
  'reader: no anon, authenticated, service_role, staff or guest EXECUTE');
select ok(not has_function_privilege('anon', 'public.notification_claim_refund(uuid,text,text)', 'EXECUTE')
      and not has_function_privilege('authenticated', 'public.notification_claim_refund(uuid,text,text)', 'EXECUTE')
      and not has_function_privilege('service_role', 'public.notification_claim_refund(uuid,text,text)', 'EXECUTE')
      and not has_function_privilege('vamos_staff', 'public.notification_claim_refund(uuid,text,text)', 'EXECUTE')
      and not has_function_privilege('vamos_guest', 'public.notification_claim_refund(uuid,text,text)', 'EXECUTE'),
  'claim: no anon, authenticated, service_role, staff or guest EXECUTE');
select ok(not has_function_privilege('anon', 'public.notification_refund_read(int8)', 'EXECUTE')
      and not has_function_privilege('authenticated', 'public.notification_refund_read(int8)', 'EXECUTE')
      and not has_function_privilege('service_role', 'public.notification_refund_read(int8)', 'EXECUTE')
      and not has_function_privilege('vamos_staff', 'public.notification_refund_read(int8)', 'EXECUTE')
      and not has_function_privilege('vamos_guest', 'public.notification_refund_read(int8)', 'EXECUTE'),
  'claim reader: no anon, authenticated, service_role, staff or guest EXECUTE');
select ok(has_function_privilege('vamos_system', 'public.refund_check_read(jsonb)', 'EXECUTE')
      and has_function_privilege('vamos_system', 'public.notification_claim_refund(uuid,text,text)', 'EXECUTE')
      and has_function_privilege('vamos_system', 'public.notification_refund_read(int8)', 'EXECUTE'),
  'vamos_system can call all three');
select ok((select bool_and(a.grantee::regrole::text in ('postgres', 'vamos_system'))
             from pg_proc p, aclexplode(p.proacl) a
            where p.oid in ('public.refund_check_read(jsonb)'::regprocedure,
                            'public.notification_claim_refund(uuid,text,text)'::regprocedure,
                            'public.notification_refund_read(int8)'::regprocedure)
              and a.privilege_type = 'EXECUTE'),
  'EXECUTE grantees of all three: the owner and vamos_system only');
set local role anon;
select throws_ok($$ select * from public.refund_check_read('[]'::jsonb) $$, '42501', null, 'anon cannot run the reader');
reset role;
set local role authenticated;
select throws_ok($$ select public.notification_claim_refund(gen_random_uuid(), 're_t_rec', 'refund@2026-10-13-1') $$,
  '42501', null, 'authenticated cannot claim a refund mail');
reset role;

-- Reader, as the Worker's role --------------------------------------------------------------------- 20
set local role vamos_system;
insert into rcr
select r.ordinality, r.stripe_refund_id, r.payment_intent_id, r.payment_found, r.payment_status, r.booking_reference,
       r.site_refund_rappen, r.site_reason, r.site_reversed, r.booking_refunded_rappen, r.booking_rows_sum_rappen,
       r.booking_refund_status
  from public.refund_check_read('[
    {"id": "re_t_missing", "payment_intent": "pi_t_a"},
    {"id": "re_t_rec", "payment_intent": "pi_t_a"},
    {"id": "re_t_none", "payment_intent": "pi_t_none"},
    {"id": "re_t_diff", "payment_intent": "pi_t_a"},
    {"id": "re_t_rev", "payment_intent": "pi_t_a"},
    {"id": "re_t_dup", "payment_intent": "pi_t_b_dup"},
    {"id": "re_t_b", "payment_intent": "pi_t_b"},
    {"id": "re_t_c", "payment_intent": "pi_t_c"},
    42,
    {"id": 7, "payment_intent": "pi_t_a"},
    {"id": "re_t_nopi", "payment_intent": null}
  ]'::jsonb) with ordinality as r;
insert into misc values ('null_rows', (select count(*) from public.refund_check_read(null))::text);
insert into misc values ('object_rows', (select count(*) from public.refund_check_read('{"id": "re_t_rec"}'::jsonb))::text);
insert into misc values ('empty_rows', (select count(*) from public.refund_check_read('[]'::jsonb))::text);
insert into misc values ('max_rows', (select count(*) from public.refund_check_read(
  (select jsonb_agg(jsonb_build_object('id', 're_t_bulk_' || g, 'payment_intent', 'pi_t_a')) from generate_series(1, 500) g)))::text);
select throws_ok(
  $$ select * from public.refund_check_read(
       (select jsonb_agg(jsonb_build_object('id', 're_t_bulk_' || g, 'payment_intent', null)) from generate_series(1, 501) g)) $$,
  '23514', 'too_many_refunds', 'reader: more than 500 refunds raise too_many_refunds');
reset role;

select is((select count(*)::int from rcr), 11, 'reader: one row per input element');
select is((select array_agg(stripe_refund_id order by n) from rcr),
          array['re_t_missing', 're_t_rec', 're_t_none', 're_t_diff', 're_t_rev', 're_t_dup', 're_t_b', 're_t_c',
                null, null, 're_t_nopi'],
          'reader: output order equals input order, ids echoed');
select is((select row(payment_intent_id, payment_found, payment_status, booking_reference = pg_temp.ref('a'),
                      site_refund_rappen, site_reason, site_reversed, booking_refunded_rappen, booking_rows_sum_rappen,
                      booking_refund_status)::text from rcr where n = 2),
          row('pi_t_a', true, 'succeeded', true, 2000::int8, 'stripe_dashboard', false, 3500::int8, 3500::int8, 'none')::text,
          'reader: a recorded refund shows its booking, amount and reason');
select is((select row(payment_found, payment_status, booking_reference = pg_temp.ref('a'), site_refund_rappen,
                      site_reason, site_reversed, booking_refunded_rappen, booking_rows_sum_rappen)::text from rcr where n = 1),
          row(true, 'succeeded', true, null::int8, null::text, false, 3500::int8, 3500::int8)::text,
          'reader: a refund missing on the booking has a payment and no site row');
select is((select row(payment_intent_id, payment_found, payment_status, booking_reference, site_refund_rappen,
                      site_reversed, booking_refunded_rappen, booking_rows_sum_rappen, booking_refund_status)::text
             from rcr where n = 3),
          row('pi_t_none', false, null::text, null::text, null::int8, false, null::int8, null::int8, null::text)::text,
          'reader: a refund on a payment no booking holds is unlinked');
select is((select site_refund_rappen from rcr where n = 4), 1500::int8,
          'reader: the site amount is returned for the Worker to compare with Stripe');
select is((select row(site_refund_rappen, site_reversed, booking_rows_sum_rappen)::text from rcr where n = 5),
          row(1000::int8, true, 3500::int8)::text,
          'reader: a reversed refund is flagged and left out of the booking sum');
select is((select row(payment_status, booking_reference = pg_temp.ref('b'), site_refund_rappen, site_reason,
                      booking_refunded_rappen, booking_rows_sum_rappen)::text from rcr where n = 6),
          row('duplicate', true, 10000::int8, 'duplicate_charge', 500::int8, 500::int8)::text,
          'reader: a duplicate-charge refund is found and its payment left out of the booking sum');
select is((select row(payment_status, site_refund_rappen, booking_rows_sum_rappen)::text from rcr where n = 7),
          row('succeeded', 500::int8, 500::int8)::text,
          'reader: the booking sum counts the succeeded payment only');
select is((select row(booking_reference = pg_temp.ref('c'), site_refund_rappen, booking_refunded_rappen,
                      booking_rows_sum_rappen, booking_refund_status)::text from rcr where n = 8),
          row(true, 3000::int8, 5000::int8, 3000::int8, 'refunded')::text,
          'reader: a booking whose refunded_rappen differs from its rows shows both');
select ok((select row(stripe_refund_id, payment_intent_id, payment_found, payment_status, booking_reference, site_refund_rappen,
                          site_reason, site_reversed, booking_refunded_rappen, booking_rows_sum_rappen, booking_refund_status) is null
             from rcr where n = 9), 'reader: an element that is not an object gives a row of nulls');
select ok((select row(stripe_refund_id, payment_intent_id, payment_found, payment_status, booking_reference, site_refund_rappen,
                          site_reason, site_reversed, booking_refunded_rappen, booking_rows_sum_rappen, booking_refund_status) is null
             from rcr where n = 10), 'reader: an element whose id is not a string gives a row of nulls');
select is((select row(stripe_refund_id, payment_intent_id, payment_found, site_refund_rappen)::text from rcr where n = 11),
          row('re_t_nopi', null::text, false, null::int8)::text,
          'reader: a refund without a payment intent is returned unlinked');
select ok(not exists (
            select 1 from rcr r cross join public.bookings b
             where b.contact_email like 'rcr-%' and (r::text like '%' || b.contact_email || '%'
                                                     or r::text like '%' || b.contact_name || '%')),
          'reader: no contact name or e-mail in any row');
select is((select v from misc where k = 'null_rows'), '0', 'reader: null input returns no rows');
select is((select v from misc where k = 'object_rows'), '0', 'reader: a non-array input returns no rows');
select is((select v from misc where k = 'empty_rows'), '0', 'reader: an empty array returns no rows');
select is((select v from misc where k = 'max_rows'), '500', 'reader: exactly 500 refunds are read');
select is(pg_temp.counts(), (select v from misc where k = 'counts_before'),
          'reader: bookings, payments, refunds, reversals and notifications unchanged');

-- Claim and claim reader, as the Worker's role ----------------------------------------------------- 16
set local role vamos_system;
insert into claims values ('a1', public.notification_claim_refund((select id from ids where k = 'a'), 're_t_rec', 'refund@2026-10-13-1'));
insert into claims values ('a2', public.notification_claim_refund((select id from ids where k = 'a'), 're_t_rec', 'refund@2026-10-13-1'));
insert into claims values ('b1', public.notification_claim_refund((select id from ids where k = 'b'), 're_t_b', 'refund@2026-10-13-1'));
insert into claims values ('c1', public.notification_claim_refund((select id from ids where k = 'c'), 're_t_c', 'refund@2026-10-13-1'));
insert into claims values ('conf', public.notification_claim((select id from ids where k = 'a'), 'confirmation', null, 'email', 'de',
                                                             'confirmation@2026-10-13-1'));
select throws_ok($$ select public.notification_claim_refund((select id from ids where k = 'a'), 're_t_diff', 'refund-v1') $$,
  '23514', 'invalid_template_version', 'claim: a template version without a date is refused');
select throws_ok($$ select public.notification_claim_refund((select id from ids where k = 'a'), 're_t_diff', null) $$,
  '23514', 'invalid_template_version', 'claim: a null template version is refused');
select throws_ok($$ select public.notification_claim_refund((select id from ids where k = 'a'), 'ch_t_a', 'refund@2026-10-13-1') $$,
  '23514', 'invalid_refund_id', 'claim: an id that is not a Stripe refund id is refused');
select throws_ok($$ select public.notification_claim_refund((select id from ids where k = 'a'), 're_t x''', 'refund@2026-10-13-1') $$,
  '23514', 'invalid_refund_id', 'claim: a refund id with a space or a quote is refused');
select throws_ok($$ select public.notification_claim_refund((select id from ids where k = 'a'), 're_t_missing', 'refund@2026-10-13-1') $$,
  'P0002', 'refund_not_recorded', 'claim: a refund not recorded on the site is refused');
select throws_ok($$ select public.notification_claim_refund((select id from ids where k = 'a'), 're_t_c', 'refund@2026-10-13-1') $$,
  'P0002', 'refund_not_recorded', 'claim: a refund recorded on another booking is refused');
reset role;

select ok((select id is not null from claims where k = 'a1'), 'claim: the first claim returns an id');
select ok((select id is null from claims where k = 'a2'), 'claim: a second claim of the same refund returns NULL');
select is((select row(count(*), min(n.kind), min(n.channel), min(n.locale), bool_and(n.booking_leg_id is null),
                      min(n.template_version), bool_and(n.booking_id = (select id from ids where k = 'a')))::text
             from public.booking_notifications n where n.dedupe_key = 'booking:refund:re_t_rec'),
          row(1::int8, 'refund', 'email', 'de', true, 'refund@2026-10-13-1', true)::text,
          'claim: one row, kind refund, email, booking a, locale from the booking (de)');
select is((select string_agg(n.locale, ',' order by n.locale) from public.booking_notifications n
            where n.id in (select id from claims where k in ('b1', 'c1'))),
          'en,fr', 'claim: locale follows each booking (en, fr)');

set local role vamos_system;
insert into misc values ('read_a1', (select row(r.booking_id = (select id from ids where k = 'a'), r.stripe_refund_id, r.refund_rappen, r.locale)::text
                                       from public.notification_refund_read((select id from claims where k = 'a1')) r));
insert into misc values ('read_conf', (select count(*) from public.notification_refund_read((select id from claims where k = 'conf')))::text);
insert into misc values ('read_unknown', (select count(*) from public.notification_refund_read(-1))::text);
select public.notification_settle((select id from claims where k = 'a1'), 'msg_t_a1', null);
select public.notification_settle((select id from claims where k = 'c1'), null, 'resend_down');
insert into misc values ('read_a1_sent', (select count(*) from public.notification_refund_read((select id from claims where k = 'a1')))::text);
insert into misc values ('read_c1_failed', (select row(r.stripe_refund_id, r.refund_rappen, r.locale)::text
                                              from public.notification_refund_read((select id from claims where k = 'c1')) r));
insert into misc values ('claim_after_sent',
  coalesce(public.notification_claim_refund((select id from ids where k = 'a'), 're_t_rec', 'refund@2026-10-13-1')::text, 'null'));
reset role;

select is((select v from misc where k = 'read_a1'), row(true, 're_t_rec', 2000::int8, 'de')::text,
          'claim reader: booking, Stripe refund id and the recorded refund_rappen');
select is((select v from misc where k = 'read_conf'), '0', 'claim reader: a claim that is not a refund claim gives no row');
select is((select v from misc where k = 'read_unknown'), '0', 'claim reader: an unknown claim gives no row');
select is((select v from misc where k = 'read_a1_sent'), '0', 'claim reader: a sent claim gives no row');
select is((select v from misc where k = 'read_c1_failed'), row('re_t_c', 3000::int8, 'fr')::text,
          'claim reader: a failed send is still read for the retry, with the recorded amount');
select is((select v from misc where k = 'claim_after_sent'), 'null', 'claim: a sent refund cannot be claimed again');

-- Reader after the claims: which recorded refunds still lack their mail claim ---------------------- 3
set local role vamos_system;
insert into misc values ('mail_rows', (
  select string_agg(row(r.stripe_refund_id, r.site_refund_booking_id = (select id from ids where k = 'a'),
                        r.refund_mail_claimed)::text, ';' order by r.ord)
    from public.refund_check_read('[
      {"id": "re_t_rec", "payment_intent": "pi_t_a"},
      {"id": "re_t_diff", "payment_intent": "pi_t_a"},
      {"id": "re_t_missing", "payment_intent": "pi_t_a"}
    ]'::jsonb) with ordinality as r(stripe_refund_id, payment_intent_id, payment_found, payment_status,
                                    booking_reference, site_refund_rappen, site_reason, site_reversed,
                                    booking_refunded_rappen, booking_rows_sum_rappen, booking_refund_status,
                                    site_refund_booking_id, refund_mail_claimed, ord)));
reset role;
select is(split_part((select v from misc where k = 'mail_rows'), ';', 1), row('re_t_rec', true, true)::text,
          'reader: a recorded refund with a mail claim says claimed, with its booking');
select is(split_part((select v from misc where k = 'mail_rows'), ';', 2), row('re_t_diff', true, false)::text,
          'reader: a recorded refund without a mail claim says not claimed, with its booking');
select is(split_part((select v from misc where k = 'mail_rows'), ';', 3), row('re_t_missing', null::bool, null::bool)::text,
          'reader: a refund the site has not recorded gives no booking and no claim answer');

select * from finish();
rollback;
