-- consent_choice_reader.test.sql
--
-- Proves public.consent_choice(): the latest consent_log row for the bound subject under one policy
-- version decides (ties to the higher id), rows under an older version never decide (D-03b), an
-- as-of time hides later rows (META-05, no backfill), only anon can execute it, and no table
-- privilege on consent_log was added.
--
-- Fixtures carry explicit recorded_at values: record_consent rows in one transaction all share now().
-- Versions are literals; the test does not depend on the TS constant.
--
-- Run as `postgres` by `supabase test db`.
begin;
select plan(24);

-- Fixtures (as postgres) ----------------------------------------------------------------------
-- Subject A: t1 Accept, t3 Necessary only, plus an old-version reject_all shaped like live row id 3.
-- Subject B: its own Accept. Subject C: reject_all then a later settings_change marketing true.
-- Subject D: reject_all at t1, accept_all at t3. Subject E: two rows at the same recorded_at.
insert into public.consent_log
  (consent_subject_id, policy_version, method, necessary, functional, analytics, marketing, locale, recorded_at)
values
  ('a0000000-0000-0000-0000-00000000000a', '2026-09-12', 'reject_all',   true, false, false, false, 'en', '2026-09-29 14:05+00'),
  ('a0000000-0000-0000-0000-00000000000a', '9999-01-01', 'accept_all',   true, true,  true,  true,  'en', '2026-10-02 10:00+00'),
  ('a0000000-0000-0000-0000-00000000000a', '9999-01-01', 'reject_all',   true, false, false, false, 'en', '2026-10-02 12:00+00'),
  ('b0000000-0000-0000-0000-00000000000b', '9999-01-01', 'accept_all',   true, true,  true,  true,  'en', '2026-10-02 10:00+00'),
  ('c0000000-0000-0000-0000-00000000000c', '9999-01-01', 'reject_all',   true, false, false, false, 'en', '2026-10-02 10:00+00'),
  ('c0000000-0000-0000-0000-00000000000c', '9999-01-01', 'settings_change', true, false, false, true, 'en', '2026-10-02 11:00+00'),
  ('d0000000-0000-0000-0000-00000000000d', '9999-01-01', 'reject_all',   true, false, false, false, 'en', '2026-10-02 10:00+00'),
  ('d0000000-0000-0000-0000-00000000000d', '9999-01-01', 'accept_all',   true, true,  true,  true,  'en', '2026-10-02 12:00+00'),
  ('e0000000-0000-0000-0000-00000000000e', '9999-01-01', 'accept_all',   true, true,  true,  true,  'en', '2026-10-02 10:00+00'),
  ('e0000000-0000-0000-0000-00000000000e', '9999-01-01', 'reject_all',   true, false, false, false, 'en', '2026-10-02 10:00+00');

-- G1: EXECUTE grants ---------------------------------------------------------------------------
select ok(has_function_privilege('anon', 'public.consent_choice(text,timestamptz)', 'EXECUTE'),
  'G1 anon can execute consent_choice');
select ok(not has_function_privilege('authenticated', 'public.consent_choice(text,timestamptz)', 'EXECUTE'),
  'G1 authenticated cannot execute consent_choice');
select ok(not has_function_privilege('vamos_guest', 'public.consent_choice(text,timestamptz)', 'EXECUTE'),
  'G1 vamos_guest cannot execute consent_choice');
select ok(not has_function_privilege('vamos_public', 'public.consent_choice(text,timestamptz)', 'EXECUTE'),
  'G1 vamos_public cannot execute consent_choice');
select ok(not has_function_privilege('vamos_system', 'public.consent_choice(text,timestamptz)', 'EXECUTE'),
  'G1 vamos_system cannot execute consent_choice');
select ok(
  not exists (
    select 1
      from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
     where p.oid = 'public.consent_choice(text,timestamptz)'::regprocedure
       and a.grantee = 0
  ),
  'G1 PUBLIC has no EXECUTE on consent_choice');

-- G2: definer, empty search_path ---------------------------------------------------------------
select ok((select prosecdef from pg_proc where oid = 'public.consent_choice(text,timestamptz)'::regprocedure),
  'G2 consent_choice is SECURITY DEFINER');
select is((select proconfig from pg_proc where oid = 'public.consent_choice(text,timestamptz)'::regprocedure),
  array['search_path=""'],
  'G2 proconfig is exactly search_path=""');

set local role anon;

-- G4: no subject bound -> 0 rows, no error -----------------------------------------------------
select is((select count(*)::int from public.consent_choice('9999-01-01')), 0,
  'G4 no GUC set: 0 rows, no error');
select set_config('request.vamos.consent_subject', '', true);
select is((select count(*)::int from public.consent_choice('9999-01-01')), 0,
  'G4 empty GUC: 0 rows, no error');

-- G3: no table privilege was added -------------------------------------------------------------
select throws_ok($$ select 1 from public.consent_log limit 1 $$, '42501', null,
  'G3 anon still cannot select from consent_log');

-- Subject A ------------------------------------------------------------------------------------
select set_config('request.vamos.consent_subject', 'a0000000-0000-0000-0000-00000000000a', true);
select is((select marketing from public.consent_choice('9999-01-01')), false,
  'R3 later Necessary only wins over the earlier Accept');
select is((select marketing from public.consent_choice('9999-01-01', '2026-10-02 11:00+00')), true,
  'R5 as of a time between Accept and Necessary only: Accept counts');
select is((select count(*)::int from public.consent_choice('9999-01-01', '2026-10-02 09:00+00')), 0,
  'R6 as of a time before the first row: 0 rows');
select is((select count(*)::int from public.consent_choice('2026-10-03')), 0,
  'R2 the old-version reject_all (shape of live row id 3) never decides a new version');
select is((select method from public.consent_choice('2026-09-12')), 'reject_all',
  'R2 asking for the old version returns that row: the filter is the version, not the method');

-- R1: single Accept (subject B) ----------------------------------------------------------------
select set_config('request.vamos.consent_subject', 'b0000000-0000-0000-0000-00000000000b', true);
select is((select marketing from public.consent_choice('9999-01-01')), true,
  'R1 one current-version Accept: marketing true');
select is((select count(*)::int from public.consent_choice('9999-01-01')), 1,
  'R8 subject B sees exactly one row, never subject A rows');

-- R4: reject then settings_change marketing on (subject C) -------------------------------------
select set_config('request.vamos.consent_subject', 'c0000000-0000-0000-0000-00000000000c', true);
select is((select marketing from public.consent_choice('9999-01-01')), true,
  'R4 Necessary only then Save choices with Marketing on: marketing true');

-- R6: reject at t1, accept at t3 (subject D) ---------------------------------------------------
select set_config('request.vamos.consent_subject', 'd0000000-0000-0000-0000-00000000000d', true);
select is((select marketing from public.consent_choice('9999-01-01', '2026-10-02 11:00+00')), false,
  'R6 Accept recorded after T is not backfilled: as of T the reject row decides');
select is((select marketing from public.consent_choice('9999-01-01')), true,
  'R6 as of now the later Accept decides');

-- R7: identical recorded_at, higher id wins (subject E, reject_all inserted second) -------------
select set_config('request.vamos.consent_subject', 'e0000000-0000-0000-0000-00000000000e', true);
select is((select method from public.consent_choice('9999-01-01')), 'reject_all',
  'R7 tie on recorded_at: the higher id wins');

reset role;

-- G5: end to end, record_consent as anon then the reader ---------------------------------------
set local role anon;
select set_config('request.vamos.consent_subject', 'f0000000-0000-0000-0000-00000000000f', true);
select lives_ok(
  $$ select public.record_consent(true, true, true, true, 'accept_all', 'en', '9999-01-01') $$,
  'G5 record_consent lives_ok as anon with a bound subject');
select is((select marketing from public.consent_choice('9999-01-01')), true,
  'G5 the reader returns the row record_consent just wrote');
reset role;

select * from finish();
rollback;
