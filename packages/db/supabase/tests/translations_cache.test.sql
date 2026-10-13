-- translations_cache.test.sql
--
-- Phase 32 plan 02 (F-05, F-06, D-09; T-32-07, T-32-09, T-32-10, T-32-11). The public-safe translation
-- cache: a machine write never overwrites a human row, a mark never touches a human or a done row,
-- translation_read returns review rows only, the table itself is unreadable by every client role, the
-- writers are vamos_system only, and every write leaves an audit row.
begin;
select plan(47);

select has_table('public', 'translations', 'translations exists');
select ok((select relrowsecurity from pg_class where oid = 'public.translations'::regclass), 'RLS is on');

-- ── EXECUTE per role ───────────────────────────────────────────────────────────────────── 15
select function_privs_are('public', 'translation_read', '{text,text}'::text[], 'anon', '{EXECUTE}'::text[], 'read: anon has EXECUTE');
select function_privs_are('public', 'translation_read', '{text,text}'::text[], 'vamos_public', '{EXECUTE}'::text[], 'read: vamos_public has EXECUTE');
select function_privs_are('public', 'translation_read', '{text,text}'::text[], 'vamos_system', '{EXECUTE}'::text[], 'read: vamos_system has EXECUTE');
select function_privs_are('public', 'translation_read', '{text,text}'::text[], 'authenticated', '{}'::text[], 'read: authenticated has no EXECUTE');
select function_privs_are('public', 'translation_read', '{text,text}'::text[], 'vamos_staff', '{}'::text[], 'read: vamos_staff has no EXECUTE');

select function_privs_are('public', 'system_translation_put_machine', '{text,text,text,text,text,text,integer}'::text[], 'vamos_system', '{EXECUTE}'::text[], 'put: vamos_system has EXECUTE');
select function_privs_are('public', 'system_translation_put_machine', '{text,text,text,text,text,text,integer}'::text[], 'anon', '{}'::text[], 'put: anon has no EXECUTE');
select function_privs_are('public', 'system_translation_put_machine', '{text,text,text,text,text,text,integer}'::text[], 'authenticated', '{}'::text[], 'put: authenticated has no EXECUTE');
select function_privs_are('public', 'system_translation_put_machine', '{text,text,text,text,text,text,integer}'::text[], 'vamos_public', '{}'::text[], 'put: vamos_public has no EXECUTE');
select function_privs_are('public', 'system_translation_put_machine', '{text,text,text,text,text,text,integer}'::text[], 'vamos_staff', '{}'::text[], 'put: vamos_staff has no EXECUTE');

select function_privs_are('public', 'system_translation_mark', '{text,text,text,text,text,text,text}'::text[], 'vamos_system', '{EXECUTE}'::text[], 'mark: vamos_system has EXECUTE');
select function_privs_are('public', 'system_translation_mark', '{text,text,text,text,text,text,text}'::text[], 'anon', '{}'::text[], 'mark: anon has no EXECUTE');
select function_privs_are('public', 'system_translation_mark', '{text,text,text,text,text,text,text}'::text[], 'authenticated', '{}'::text[], 'mark: authenticated has no EXECUTE');
select function_privs_are('public', 'system_translation_mark', '{text,text,text,text,text,text,text}'::text[], 'vamos_public', '{}'::text[], 'mark: vamos_public has no EXECUTE');
select function_privs_are('public', 'system_translation_mark', '{text,text,text,text,text,text,text}'::text[], 'vamos_staff', '{}'::text[], 'mark: vamos_staff has no EXECUTE');

-- ── The table is closed to every client role ───────────────────────────────────────────── 4
set local role anon;
select throws_ok($$ select * from public.translations $$, '42501', null, 'anon cannot select the table');
reset role;
set local role authenticated;
select throws_ok($$ select * from public.translations $$, '42501', null, 'authenticated cannot select the table');
reset role;
set local role vamos_public;
select throws_ok($$ select * from public.translations $$, '42501', null, 'vamos_public cannot select the table');
reset role;
set local role vamos_system;
select throws_ok($$ insert into public.translations (source_hash, source_lang, target_lang, source_text, context)
                    values (repeat('f', 64), 'en', 'de', 'x', 'review') $$, '42501', null, 'vamos_system cannot write the table directly');
reset role;

-- ── Human wins ─────────────────────────────────────────────────────────────────────────── 3
insert into public.translations (source_hash, source_lang, target_lang, source_text, translated_text, origin, status, context, prompt_version)
values (repeat('a', 64), 'en', 'de', 'Great driver', 'Menschlich', 'human', 'done', 'review', 1);

set local role vamos_system;
select is(
  (select origin || '|' || translated_text
     from public.system_translation_put_machine(repeat('a', 64), 'en', 'de', 'Great driver', 'Maschine', 'review', 1)),
  'human|Menschlich',
  'put on a human row returns the human text'
);
reset role;
select is((select translated_text from public.translations where source_hash = repeat('a', 64) and target_lang = 'de'),
  'Menschlich', 'the human text is unchanged after a machine put');
select is((select origin from public.translations where source_hash = repeat('a', 64) and target_lang = 'de'),
  'human', 'the row is still human');

-- ── Machine rows refresh ───────────────────────────────────────────────────────────────── 3
set local role vamos_system;
select is(
  (select origin || '|' || translated_text || '|' || status
     from public.system_translation_put_machine(repeat('b', 64), 'en', 'fr', 'On time', 'Eins', 'review', 1)),
  'machine|Eins|done',
  'a first machine put inserts a done machine row'
);
select lives_ok($$ select public.system_translation_put_machine(repeat('b', 64), 'en', 'fr', 'On time', 'Zwei', 'review', 2) $$,
  'a second machine put on the same key runs');
reset role;
select is((select translated_text || '|' || attempts || '|' || prompt_version from public.translations where source_hash = repeat('b', 64) and target_lang = 'fr'),
  'Zwei|2|2', 'a machine row is refreshed (text, attempts, prompt version)');

-- ── Marks never touch a human or a done row ────────────────────────────────────────────── 7
set local role vamos_system;
select lives_ok($$ select public.system_translation_mark(repeat('b', 64), 'fr', 'en', 'On time', 'review', 'failed', 'timeout') $$, 'mark on a done row runs');
select lives_ok($$ select public.system_translation_mark(repeat('a', 64), 'de', 'en', 'Great driver', 'review', 'rejected', 'guard') $$, 'mark on a human row runs');
select lives_ok($$ select public.system_translation_mark(repeat('c', 64), 'ar', 'en', 'Clean car', 'review', 'rejected', 'guard') $$, 'mark on a new key runs');
select lives_ok($$ select public.system_translation_mark(repeat('d', 64), 'ar', 'en', 'Nice', 'review', 'failed', 'Some Text!') $$, 'mark with a free-text reason runs');
select throws_ok($$ select public.system_translation_mark(repeat('d', 64), 'ar', 'en', 'Nice', 'review', 'done', 'guard') $$, '22023', null, 'mark refuses status done');
reset role;
select is((select status || '|' || translated_text from public.translations where source_hash = repeat('b', 64) and target_lang = 'fr'),
  'done|Zwei', 'a done machine row is untouched by a mark');
select is((select status || '|' || origin || '|' || translated_text from public.translations where source_hash = repeat('a', 64) and target_lang = 'de'),
  'done|human|Menschlich', 'a human row is untouched by a mark');

-- ── Marks on open rows ─────────────────────────────────────────────────────────────────── 4
select is((select status || '|' || last_error || '|' || attempts || '|' || coalesce(translated_text, 'null') from public.translations where source_hash = repeat('c', 64)),
  'rejected|guard|1|null', 'a mark inserts a rejected row with the reason code and no text');
select is((select last_error from public.translations where source_hash = repeat('d', 64)),
  'other', 'a reason that is not a code is stored as other');
set local role vamos_system;
select lives_ok($$ select public.system_translation_mark(repeat('c', 64), 'ar', 'en', 'Clean car', 'review', 'failed', 'timeout') $$, 'a second mark on the open row runs');
reset role;
select is((select status || '|' || last_error || '|' || attempts from public.translations where source_hash = repeat('c', 64)),
  'failed|timeout|2', 'a second mark on an open row counts the attempt');

-- ── translation_read: review rows only ─────────────────────────────────────────────────── 4
set local role anon;
select is((select status || '|' || coalesce(translated_text, 'null') from public.translation_read(repeat('c', 64), 'ar')),
  'failed|null', 'anon reads the state of a failed row, no text');
reset role;
set local role vamos_public;
select is((select translated_text from public.translation_read(repeat('b', 64), 'fr')),
  'Zwei', 'vamos_public reads a done review translation');
select is((select count(*)::int from public.translation_read(repeat('b', 64), 'de')), 0, 'no row for another language');
reset role;
select ok(pg_get_functiondef('public.translation_read(text,text)'::regprocedure) like '%t.context = ''review''%',
  'translation_read filters on context review');

-- ── A put after a failure, and refusals ────────────────────────────────────────────────── 4
set local role vamos_system;
select lives_ok($$ select public.system_translation_put_machine(repeat('c', 64), 'en', 'ar', 'Clean car', 'سيارة نظيفة', 'review', 1) $$, 'a put after a failure runs');
select throws_ok($$ select public.system_translation_put_machine(repeat('e', 64), 'en', 'de', 'x', '  ', 'review', 1) $$, '22023', null, 'put refuses an empty translation');
select throws_ok($$ select public.system_translation_put_machine(repeat('e', 64), 'en', 'de', 'x', 'y', 'support', 1) $$, '23514', null, 'a context other than review is refused (customer text never here)');
reset role;
select is((select status || '|' || (last_error is null)::text from public.translations where source_hash = repeat('c', 64)),
  'done|true', 'a put after a failure stores the text and clears the reason');

-- ── Audit trail ────────────────────────────────────────────────────────────────────────── 1
-- Writes: human insert, b insert, b update, c insert, c update (mark), d insert, c update (put) = 7.
select is((select count(*)::int from public.audit_log where table_name = 'translations' and record_id is not null),
  7, 'every row change wrote an audit row with a record_id');

select * from finish();
rollback;
