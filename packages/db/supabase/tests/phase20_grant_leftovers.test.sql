-- phase20_grant_leftovers.test.sql
--
-- 20261007180000 (Phase 20 G7, G10, G11, G12). Each removed grant is gone, each grant the live
-- site uses is still there, and the real caller role still gets an answer:
--   quotes          asQuote  -> anon         (lib/db/quote.ts)
--   price editor    asStaff  -> vamos_staff  (lib/ops/rate-book.ts, api/staff/rate-book)
--   consent banner  asAnon   -> anon         (app/api/consent/route.ts)
--   extra names     asQuote  -> anon         (lib/checkout/checkout-catalog.ts)
-- No role inherits another here (every membership is `inherit false`), so has_function_privilege
-- reads the direct grant.
begin;
select plan(40);

-- (G7) ---------------------------------------------------------------------------------------
select ok((select relrowsecurity from pg_class where oid = 'public.staff_daily_digests'::regclass),
  'G7 staff_daily_digests has RLS on');
set local role anon;
select throws_ok($$ select count(*) from public.staff_daily_digests $$, '42501', null,
  'G7 anon cannot read staff_daily_digests');
reset role;

-- (G10) quote read functions: gone from the login roles, kept for anon --------------------------
select ok(not has_function_privilege('vamos_edge', 'public.quote_rate_book(boolean)', 'EXECUTE'), 'G10 vamos_edge: no quote_rate_book');
select ok(not has_function_privilege('vamos_public', 'public.quote_rate_book(boolean)', 'EXECUTE'), 'G10 vamos_public: no quote_rate_book');
select ok(not has_function_privilege('vamos_edge', 'public.evaluate_coupon(text,uuid,extensions.citext)', 'EXECUTE'), 'G10 vamos_edge: no evaluate_coupon');
select ok(not has_function_privilege('vamos_public', 'public.evaluate_coupon(text,uuid,extensions.citext)', 'EXECUTE'), 'G10 vamos_public: no evaluate_coupon');
select ok(not has_function_privilege('vamos_edge', 'public.quote_lock_deadline(bigint)', 'EXECUTE'), 'G10 vamos_edge: no quote_lock_deadline');
select ok(not has_function_privilege('vamos_public', 'public.quote_lock_deadline(bigint)', 'EXECUTE'), 'G10 vamos_public: no quote_lock_deadline');
select ok(not has_function_privilege('vamos_edge', 'public.quote_settings_version(timestamptz)', 'EXECUTE'), 'G10 vamos_edge: no quote_settings_version');
select ok(not has_function_privilege('vamos_public', 'public.quote_settings_version(timestamptz)', 'EXECUTE'), 'G10 vamos_public: no quote_settings_version');

select ok(has_function_privilege('anon', 'public.quote_rate_book(boolean)', 'EXECUTE'), 'G10 anon keeps quote_rate_book');
select ok(has_function_privilege('anon', 'public.evaluate_coupon(text,uuid,extensions.citext)', 'EXECUTE'), 'G10 anon keeps evaluate_coupon');
select ok(has_function_privilege('anon', 'public.quote_lock_deadline(bigint)', 'EXECUTE'), 'G10 anon keeps quote_lock_deadline');
select ok(has_function_privilege('anon', 'public.quote_settings_version(timestamptz)', 'EXECUTE'), 'G10 anon keeps quote_settings_version');
select ok(has_function_privilege('vamos_staff', 'public.quote_rate_book(boolean)', 'EXECUTE'), 'G10 vamos_staff keeps quote_rate_book');

-- create_quote_snapshot: no caller role at all; checkout_create_booking (definer) is the only
-- caller. service_role is allowed: live holds the Supabase default grant (read 2026-10-02), a
-- local stack does not, and it is the server key that bypasses RLS anyway.
select is(
  (select count(*)::int
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
     cross join lateral aclexplode(coalesce(p.proacl, '{}'::aclitem[])) a
    where n.nspname = 'public' and p.proname = 'create_quote_snapshot'
      and a.privilege_type = 'EXECUTE'
      and a.grantee not in (p.proowner, 'service_role'::regrole::oid)),
  0, 'G10 create_quote_snapshot: EXECUTE held by its owner and service_role only');
select ok((select prosecdef from pg_proc where oid = 'public.checkout_create_booking'::regproc),
  'G10 checkout_create_booking (the snapshot caller) is security definer');

-- The real callers still answer.
set local role anon;
select lives_ok($$ select public.quote_rate_book(false) $$, 'G10 anon runs quote_rate_book');
select lives_ok($$ select public.quote_settings_version(now()) $$, 'G10 anon runs quote_settings_version');
select lives_ok($$ select public.evaluate_coupon('NO-SUCH-CODE') $$, 'G10 anon runs evaluate_coupon');
reset role;
set local role vamos_edge;
select throws_ok($$ select public.quote_rate_book(false) $$, '42501', null, 'G10 vamos_edge cannot run quote_rate_book');
reset role;
set local role vamos_public;
select throws_ok($$ select public.quote_settings_version(now()) $$, '42501', null, 'G10 vamos_public cannot run quote_settings_version');
reset role;

-- (G11) record_consent ----------------------------------------------------------------------
select ok(not has_function_privilege('vamos_guest', 'public.record_consent(boolean,boolean,boolean,boolean,text,text,text,uuid,text,inet)', 'EXECUTE'), 'G11 vamos_guest: no record_consent');
select ok(not has_function_privilege('vamos_public', 'public.record_consent(boolean,boolean,boolean,boolean,text,text,text,uuid,text,inet)', 'EXECUTE'), 'G11 vamos_public: no record_consent');
select ok(has_function_privilege('anon', 'public.record_consent(boolean,boolean,boolean,boolean,text,text,text,uuid,text,inet)', 'EXECUTE'), 'G11 anon keeps record_consent');
select ok(has_function_privilege('authenticated', 'public.record_consent(boolean,boolean,boolean,boolean,text,text,text,uuid,text,inet)', 'EXECUTE'), 'G11 authenticated keeps record_consent');

set local role anon;
select set_config('request.vamos.consent_subject', 'f2000000-0000-4000-8000-000000000001', true);
select lives_ok($$ select public.record_consent(true, true, false, false, 'accept_all', 'en', '2026-08') $$,
  'G11 anon still records consent (the banner path)');
reset role;
set local role vamos_guest;
select throws_ok($$ select public.record_consent(true, true, false, false, 'accept_all', 'en', '2026-08') $$,
  '42501', null, 'G11 vamos_guest cannot record consent');
reset role;
set local role vamos_public;
select throws_ok($$ select public.record_consent(true, true, false, false, 'accept_all', 'en', '2026-08') $$,
  '42501', null, 'G11 vamos_public cannot record consent');
reset role;

-- (G12) extra_labels_read -------------------------------------------------------------------
select ok(not has_function_privilege('authenticated', 'public.extra_labels_read()', 'EXECUTE'), 'G12 authenticated: no extra_labels_read');
select ok(not has_function_privilege('vamos_checkout', 'public.extra_labels_read()', 'EXECUTE'), 'G12 vamos_checkout: no extra_labels_read');
select ok(not has_function_privilege('vamos_system', 'public.extra_labels_read()', 'EXECUTE'), 'G12 vamos_system: no extra_labels_read');
select ok(has_function_privilege('anon', 'public.extra_labels_read()', 'EXECUTE'), 'G12 anon keeps extra_labels_read');
select ok(has_function_privilege('vamos_staff', 'public.extra_labels_read()', 'EXECUTE'), 'G12 vamos_staff keeps extra_labels_read');

set local role anon;
select lives_ok($$ select * from public.extra_labels_read() $$, 'G12 anon reads extra names (checkout catalog)');
reset role;
set local role vamos_staff;
select lives_ok($$ select * from public.extra_labels_read() $$, 'G12 vamos_staff reads extra names (price editor)');
reset role;
set local role vamos_checkout;
select throws_ok($$ select * from public.extra_labels_read() $$, '42501', null, 'G12 vamos_checkout cannot read extra names');
reset role;
set local role vamos_system;
select throws_ok($$ select * from public.extra_labels_read() $$, '42501', null, 'G12 vamos_system cannot read extra names');
reset role;
set local role authenticated;
select throws_ok($$ select * from public.extra_labels_read() $$, '42501', null, 'G12 authenticated cannot read extra names');
reset role;

-- PUBLIC holds none of them (unchanged, guarded so a later re-grant shows here).
select ok(not exists (
  select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    cross join lateral aclexplode(coalesce(p.proacl, '{}'::aclitem[])) a
   where n.nspname = 'public'
     and p.proname in ('quote_rate_book','evaluate_coupon','quote_lock_deadline','quote_settings_version',
                       'create_quote_snapshot','record_consent','extra_labels_read')
     and a.grantee = 0),
  'PUBLIC holds EXECUTE on none of the seven');

select * from finish();
rollback;
