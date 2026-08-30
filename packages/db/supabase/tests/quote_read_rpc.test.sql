-- quote_read_rpc.test.sql
--
-- D-34: the anonymous quote identity reads pricing through three SECURITY DEFINER
-- functions and still gets 42501 on every pricing table. No table grant opened.
--
-- D-46: no CHF figure. Catalog assertions plus seeded-draft reads; the null-lock
-- fixture is a new settings_versions row (append-only — never mutate the seed).
begin;
select plan(22);

-- 1. PUBLIC holds no EXECUTE on any of the three ---------------------------------------
select function_privs_are(
  'public', 'quote_rate_book', '{boolean}'::text[],
  'public', '{}'::text[],
  '(1a) PUBLIC holds no EXECUTE on quote_rate_book'
);
select function_privs_are(
  'public', 'quote_settings_version', '{timestamptz}'::text[],
  'public', '{}'::text[],
  '(1b) PUBLIC holds no EXECUTE on quote_settings_version'
);
select function_privs_are(
  'public', 'quote_lock_deadline', '{bigint}'::text[],
  'public', '{}'::text[],
  '(1c) PUBLIC holds no EXECUTE on quote_lock_deadline'
);

-- 2. The quote identity (anon) holds EXECUTE on all three ------------------------------
select function_privs_are(
  'public', 'quote_rate_book', '{boolean}'::text[],
  'anon', '{EXECUTE}'::text[],
  '(2a) anon holds EXECUTE on quote_rate_book'
);
select function_privs_are(
  'public', 'quote_settings_version', '{timestamptz}'::text[],
  'anon', '{EXECUTE}'::text[],
  '(2b) anon holds EXECUTE on quote_settings_version'
);
select function_privs_are(
  'public', 'quote_lock_deadline', '{bigint}'::text[],
  'anon', '{EXECUTE}'::text[],
  '(2c) anon holds EXECUTE on quote_lock_deadline'
);

-- Ids the invoker cannot read from locked tables; grant the temp table to public
-- so the anon cases can still name a settings_versions row by id.
create temporary table qrr_ids as
select sv.id as launch_id
  from public.settings_versions sv
 where sv.slug = 'launch-baseline';
grant select on qrr_ids to public;

insert into public.settings_versions (slug, label, quote_lock_minutes, effective_from)
values ('qrr-null-lock', 'Null lock fixture', null, now() + interval '1 day');

create temporary table qrr_null as
select sv.id as null_lock_id
  from public.settings_versions sv
 where sv.slug = 'qrr-null-lock';
grant select on qrr_null to public;

-- 3–8 under the quote identity ---------------------------------------------------------
set local role anon;

-- 3. Tables stay locked; only the functions opened ------------------------------------
select throws_ok(
  $$ select count(*) from public.rate_versions $$,
  '42501',
  null,
  '(3a) anon selecting rate_versions raises 42501'
);
select throws_ok(
  $$ select count(*) from public.surcharges $$,
  '42501',
  null,
  '(3b) anon selecting surcharges raises 42501'
);
select throws_ok(
  $$ select count(*) from public.settings_versions $$,
  '42501',
  null,
  '(3c) anon selecting settings_versions raises 42501'
);

-- 4. Launch state: no live version, rate_version is SQL/JSON null (QUOTE-10) -----------
select lives_ok(
  $$ select public.quote_rate_book() $$,
  '(4a) anon can execute quote_rate_book()'
);
select is(
  public.quote_rate_book() -> 'rate_version',
  'null'::jsonb,
  '(4b) quote_rate_book() rate_version is JSON null against the seeded draft-only database'
);

-- 5. D-33 staging branch: prefer-draft returns seed-placeholder without any env var ----
select is(
  public.quote_rate_book(true) #>> '{rate_version,slug}',
  'seed-placeholder',
  '(5a) quote_rate_book(true) returns seed-placeholder'
);
select is(
  public.quote_rate_book(true) #>> '{rate_version,status}',
  'draft',
  '(5b) quote_rate_book(true) labels the book status=draft'
);

-- 6. Ten surcharges ordered by code; first element carries predicate -------------------
select is(
  (
    select array_agg(s ->> 'code')
      from jsonb_array_elements(public.quote_rate_book(true) -> 'surcharges') as s
  ),
  array[
    'airport_pickup',
    'child_seat',
    'extra_stop',
    'meet_greet',
    'night',
    'oversized_luggage',
    'return_trip',
    'ski_rack',
    'waiting_airport',
    'waiting_city'
  ]::text[],
  '(6a) surcharges array has ten elements ordered by code'
);
select ok(
  (public.quote_rate_book(true) -> 'surcharges' -> 0) ? 'predicate',
  '(6b) first surcharge carries a predicate key'
);

-- 7. Dated policy version; never the newest regardless of date -------------------------
select is(
  public.quote_settings_version(now()) ->> 'slug',
  'launch-baseline',
  '(7a) quote_settings_version(now()) returns the seeded launch-baseline row'
);
select is(
  public.quote_settings_version('1999-01-01'::timestamptz),
  null::jsonb,
  '(7b) quote_settings_version(1999-01-01) returns SQL null'
);

-- 8. Lock deadline is in the future; null minutes raises rather than defaulting --------
select ok(
  public.quote_lock_deadline((select launch_id from qrr_ids)) > now(),
  '(8a) quote_lock_deadline(seeded id) is strictly greater than now()'
);
select throws_ok(
  $$ select public.quote_lock_deadline((select null_lock_id from qrr_null)) $$,
  '23001',
  null,
  '(8b) null quote_lock_minutes raises restrict_violation (D-24)'
);

reset role;

-- 9. prosecdef is true for all three, from pg_proc -------------------------------------
select is(
  (
    select p.prosecdef
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'quote_rate_book'
  ),
  true,
  '(9a) quote_rate_book is security definer (prosecdef)'
);
select is(
  (
    select p.prosecdef
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'quote_settings_version'
  ),
  true,
  '(9b) quote_settings_version is security definer (prosecdef)'
);
select is(
  (
    select p.prosecdef
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'quote_lock_deadline'
  ),
  true,
  '(9c) quote_lock_deadline is security definer (prosecdef)'
);

select * from finish();
rollback;
