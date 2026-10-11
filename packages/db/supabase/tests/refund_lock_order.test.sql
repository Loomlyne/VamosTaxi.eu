-- refund_lock_order.test.sql
--
-- 20261007280000: the refund, change-request and difference-settle functions lock the payment row
-- before the booking row, the order of checkout_payment_settle and meta_purchase_claim, and take no
-- payment lock after the booking lock. Under the booking lock they read the payment again and raise
-- 'payment-changed' (40001) if it moved. One pgTAP session cannot race itself: this file pins the
-- order in the function text, the unchanged attributes and the grants. The two-connection proof is
-- packages/db/test/local/refund-lock-order.test.ts. Run as postgres by `supabase test db`.
begin;
select plan(39);

-- The body as statements, in order, comments removed, white space folded, lower case.
create function pg_temp.stmts(p_fn pg_catalog.regprocedure)
returns table (n pg_catalog.int4, s pg_catalog.text)
language sql stable as $$
  select t.o::pg_catalog.int4, pg_catalog.lower(pg_catalog.regexp_replace(t.x, '\s+', ' ', 'g'))
    from pg_catalog.regexp_split_to_table(
           pg_catalog.regexp_replace((select p.prosrc from pg_catalog.pg_proc p where p.oid = p_fn), '--[^\n]*', '', 'g'),
           ';') with ordinality as t(x, o)
$$;

-- Statement numbers that row-lock booking_payments, that lock the booking, and so on.
create function pg_temp.at(p_fn pg_catalog.regprocedure, p_kind pg_catalog.text)
returns pg_catalog.int4[]
language sql stable as $$
  select coalesce(pg_catalog.array_agg(x.n order by x.n), '{}')
    from pg_temp.stmts(p_fn) x
   where case p_kind
           when 'pay' then x.s ~ 'public\.booking_payments\M' and x.s ~ '\mfor (update|no key update|share|key share)\M'
           when 'booking' then x.s ~ 'from public\.bookings\M' and x.s ~ '\mfor update\M'
           when 'request' then x.s ~ 'from public\.booking_edit_requests\M' and x.s ~ '\mfor update\M'
           when 'intent' then x.s ~ 'from public\.booking_refund_intents\M' and x.s ~ '\mfor update\M'
           when 'changed' then x.s ~ 'raise exception ''payment-changed'' using errcode = ''40001'''
           when 'accept' then x.s ~ 'public\.booking_edit_request_accept\('
         end
$$;

create temp table fns (fn pg_catalog.regprocedure, label pg_catalog.text) on commit drop;
insert into fns values
  ('public.ops_refund_plan(uuid,uuid,int8,numeric,text,bool,int4)', 'ops_refund_plan'),
  ('public.ops_refund_intent_sent(int8,text,public.rappen,text,timestamptz)', 'ops_refund_intent_sent'),
  ('public.ops_refund_record(uuid,int8,text,uuid,public.rappen,text,public.rappen)', 'ops_refund_record'),
  ('public.record_booking_refund(uuid,text,text,timestamptz,public.rappen)', 'record_booking_refund'),
  ('public.booking_edit_request_accept(uuid,uuid)', 'booking_edit_request_accept'),
  ('public.booking_edit_refund_record(uuid,text,uuid,public.rappen)', 'booking_edit_refund_record'),
  ('public.booking_staff_change(uuid,uuid,text,int8,int4,jsonb,text,int4)', 'booking_staff_change'),
  ('public.booking_staff_trip_change(uuid,uuid,text,jsonb,int8,int4,jsonb,text,numeric,int4,jsonb,int4,text)', 'booking_staff_trip_change'),
  ('public.checkout_extra_payment_settle(text,text,text,text,text,numeric,text,timestamptz,int8,int8,text,int8,text)', 'checkout_extra_payment_settle');

-- ── per function: the payment first, one booking lock, the re-check after it (27) ─────────────
select ok(pg_catalog.cardinality(pg_temp.at(f.fn, 'pay')) >= 1
          and (select pg_catalog.max(v) from pg_catalog.unnest(pg_temp.at(f.fn, 'pay')) v)
              < (select pg_catalog.min(v) from pg_catalog.unnest(pg_temp.at(f.fn, 'booking')) v),
          f.label || ': every payment row lock comes before the booking lock')
  from fns f order by f.label;

select is(pg_catalog.cardinality(pg_temp.at(f.fn, 'pay')) || '/' || pg_catalog.cardinality(pg_temp.at(f.fn, 'booking')), '1/1',
          f.label || ': one payment lock statement, one booking lock statement')
  from fns f order by f.label;

select ok(pg_catalog.cardinality(pg_temp.at(f.fn, 'changed')) = 1
          and (pg_temp.at(f.fn, 'changed'))[1] > (pg_temp.at(f.fn, 'booking'))[1],
          f.label || ': one payment-changed refusal (40001), under the booking lock')
  from fns f order by f.label;

-- ── what comes after the booking (6) ───────────────────────────────────────────────────────────
select ok((pg_temp.at(f.fn, 'request'))[1] > (pg_temp.at(f.fn, 'booking'))[1]
          and pg_catalog.cardinality(pg_temp.at(f.fn, 'request')) = 1,
          f.label || ': the change request is locked after the booking')
  from fns f
 where f.label in ('booking_edit_request_accept', 'booking_edit_refund_record', 'checkout_extra_payment_settle')
 order by f.label;

select ok((pg_temp.at(f.fn, 'intent'))[1] > (pg_temp.at(f.fn, 'booking'))[1],
          f.label || ': the refund intent is locked after the booking')
  from fns f where f.label = 'ops_refund_intent_sent';

select ok((pg_temp.at(f.fn, 'changed'))[1] < (pg_temp.at(f.fn, 'accept'))[1],
          f.label || ': the payment is checked before accept is called')
  from fns f where f.label in ('booking_staff_change', 'booking_staff_trip_change') order by f.label;

-- ── the order the others already follow (2) ────────────────────────────────────────────────────
select ok((pg_temp.at('public.checkout_payment_settle(text,text,text,text,text,numeric,text,timestamptz,int8,text,int8,text,int8,text)', 'pay'))[1]
          < (pg_temp.at('public.checkout_payment_settle(text,text,text,text,text,numeric,text,timestamptz,int8,text,int8,text,int8,text)', 'booking'))[1],
          'settle: still locks the payment before the booking (if this changes, revisit 20261007280000)');
select ok((pg_temp.at('public.meta_purchase_claim(uuid,int8,text,bool,bool,text)', 'pay'))[1]
          < (pg_temp.at('public.meta_purchase_claim(uuid,int8,text,bool,bool,text)', 'booking'))[1],
          'claim: still locks the payment before the booking');

-- ── attributes and grants unchanged (3) ─────────────────────────────────────────────────────────
select is((select pg_catalog.count(*)::pg_catalog.int4 from fns f join pg_catalog.pg_proc p on p.oid = f.fn
            where p.prosecdef and p.proconfig = array['search_path=""']), 9,
          'all nine: security definer, search_path "" and nothing else (no lock or statement timeout)');
select is((select pg_catalog.count(*)::pg_catalog.int4
             from fns f
            where (select pg_catalog.bool_and(a.grantee::pg_catalog.regrole::pg_catalog.text in ('postgres', 'service_role', 'vamos_system'))
                          and pg_catalog.bool_or(a.grantee::pg_catalog.regrole::pg_catalog.text = 'vamos_system')
                     from pg_catalog.pg_proc p, pg_catalog.aclexplode(p.proacl) a
                    where p.oid = f.fn and a.privilege_type = 'EXECUTE')), 6,
          'the six live ones: EXECUTE for vamos_system, otherwise only postgres and service_role');
-- J7 W5-06: the three legacy writers no application code calls lost vamos_system's EXECUTE.
select is((select pg_catalog.count(*)::pg_catalog.int4
             from fns f
            where f.label in ('ops_refund_record', 'record_booking_refund', 'booking_edit_refund_record')
              and (select pg_catalog.bool_and(a.grantee::pg_catalog.regrole::pg_catalog.text in ('postgres', 'service_role'))
                     from pg_catalog.pg_proc p, pg_catalog.aclexplode(p.proacl) a
                    where p.oid = f.fn and a.privilege_type = 'EXECUTE')), 3,
          'the three legacy refund writers: vamos_system holds no EXECUTE (J7 W5-06)');
select is((select pg_catalog.count(*)::pg_catalog.int4 from pg_catalog.pg_proc p
            where p.pronamespace = 'public'::pg_catalog.regnamespace
              and p.proname in (select f.label from fns f)), 9,
          'replaced in place: one function per name, no new overload');

select * from finish();
rollback;
