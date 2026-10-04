-- meta_purchase_lock_order.test.sql
--
-- 20261007270000: meta_purchase_claim and meta_purchase_sweep lock the payment row before the booking
-- row, the order of checkout_payment_settle, so a repeated settle cannot deadlock with them. One pgTAP
-- session cannot race itself: this file pins the order in the function text and the unchanged
-- attributes and grants. The two-connection proof is packages/db/test/local/meta-purchase-lock-order.test.ts.
-- Run as postgres by `supabase test db`.
begin;
select plan(12);

create function pg_temp.def(p_fn pg_catalog.regprocedure) returns pg_catalog.text
language sql stable as $$ select pg_catalog.pg_get_functiondef(p_fn) $$;

create function pg_temp.pos(p_fn pg_catalog.regprocedure, p_text pg_catalog.text) returns pg_catalog.int4
language sql stable as $$ select pg_catalog.strpos(pg_temp.def(p_fn), p_text) $$;

create function pg_temp.hits(p_fn pg_catalog.regprocedure, p_pattern pg_catalog.text) returns pg_catalog.int4
language sql stable as $$ select count(*)::pg_catalog.int4 from pg_catalog.regexp_matches(pg_temp.def(p_fn), p_pattern, 'g') $$;

-- ── claim ────────────────────────────────────────────────────────────────────────────────────
select ok(pg_temp.pos('public.meta_purchase_claim(uuid,int8,text,bool,bool,text)',
                     'from public.booking_payments p where p.id = p_payment_id for key share;') > 0,
          'claim: locks its payment row FOR KEY SHARE');
select ok(pg_temp.pos('public.meta_purchase_claim(uuid,int8,text,bool,bool,text)',
                     'from public.booking_payments p where p.id = p_payment_id for key share;') > 0
          and pg_temp.pos('public.meta_purchase_claim(uuid,int8,text,bool,bool,text)',
                     'from public.booking_payments p where p.id = p_payment_id for key share;')
          < pg_temp.pos('public.meta_purchase_claim(uuid,int8,text,bool,bool,text)',
                       'from public.bookings b where b.id = p_booking_id for update;'),
          'claim: the payment lock comes before the booking lock');
select is(pg_temp.hits('public.meta_purchase_claim(uuid,int8,text,bool,bool,text)', 'for (update|no key update|share|key share)'), 2,
          'claim: exactly two row locks (payment KEY SHARE, booking UPDATE)');

-- ── sweep ────────────────────────────────────────────────────────────────────────────────────
select ok(pg_temp.pos('public.meta_purchase_sweep()', 'for key share skip locked;') > 0
          and pg_temp.pos('public.meta_purchase_sweep()', 'for key share skip locked;')
              < pg_temp.pos('public.meta_purchase_sweep()', 'for update of b skip locked;'),
          'sweep: payment KEY SHARE (skip locked) before booking FOR UPDATE (skip locked)');
select is(pg_temp.hits('public.meta_purchase_sweep()', 'for (update|no key update|share|key share)'), 2,
          'sweep: exactly two row locks, both per booking; the candidate read takes none');
select is(pg_temp.hits('public.meta_purchase_sweep()', 'skip locked'), 2,
          'sweep: both row locks skip a row another session holds');
select ok(pg_temp.def('public.meta_purchase_sweep()') ~ 'limit 500',
          'sweep: still at most 500 candidates per run');

-- ── the settle order both follow ─────────────────────────────────────────────────────────────
select ok(pg_temp.pos('public.checkout_payment_settle(text,text,text,text,text,numeric,text,timestamptz,int8,text)',
                     'from public.booking_payments as bp')
          < pg_temp.pos('public.checkout_payment_settle(text,text,text,text,text,numeric,text,timestamptz,int8,text)',
                       'from public.bookings as b'),
          'settle: still locks the payment before the booking (if this changes, revisit claim and sweep)');

-- ── attributes and grants unchanged ──────────────────────────────────────────────────────────
select ok((select p.prosecdef and p.proconfig @> array['search_path=""', 'lock_timeout=2s', 'statement_timeout=5s']
             from pg_proc p where p.oid = 'public.meta_purchase_claim(uuid,int8,text,bool,bool,text)'::regprocedure),
          'claim: security definer, search_path "", lock_timeout 2s, statement_timeout 5s');
select ok((select p.prosecdef and p.proconfig @> array['search_path=""', 'lock_timeout=2s', 'statement_timeout=5s']
             from pg_proc p where p.oid = 'public.meta_purchase_sweep()'::regprocedure),
          'sweep: security definer, search_path "", lock_timeout 2s, statement_timeout 5s');
select ok((select bool_and(a.grantee::regrole::text in ('postgres', 'service_role', 'vamos_system'))
                  and bool_or(a.grantee::regrole::text = 'vamos_system')
             from pg_proc p, aclexplode(p.proacl) a
            where p.oid = 'public.meta_purchase_claim(uuid,int8,text,bool,bool,text)'::regprocedure
              and a.privilege_type = 'EXECUTE'),
          'claim: EXECUTE for vamos_system, otherwise only postgres and service_role');
select ok((select bool_and(a.grantee::regrole::text in ('postgres', 'service_role', 'vamos_system'))
                  and bool_or(a.grantee::regrole::text = 'vamos_system')
             from pg_proc p, aclexplode(p.proacl) a
            where p.oid = 'public.meta_purchase_sweep()'::regprocedure
              and a.privilege_type = 'EXECUTE'),
          'sweep: EXECUTE for vamos_system, otherwise only postgres and service_role');

select * from finish();
rollback;
