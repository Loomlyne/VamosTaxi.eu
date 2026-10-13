-- reviews_language.test.sql
--
-- Phase 32 plan 02 (D-09, T-32-08, T-32-10). reviews.language is readable by the public roles (column
-- grant), a review is reached in public by an opaque 16-hex ref (never its row id), the ref resolves
-- published reviews only, review_ref is callable by exactly the four roles the public list needs (and
-- nothing leaks to service_role through PUBLIC), and the review language job is vamos_system only.
begin;
select plan(32);

select has_column('public', 'reviews', 'language', 'reviews.language exists');
select ok(has_column_privilege('anon', 'public.reviews', 'language', 'SELECT'), 'anon can select reviews.language');
select ok(has_column_privilege('vamos_public', 'public.reviews', 'language', 'SELECT'), 'vamos_public can select reviews.language');
select ok(has_column_privilege('authenticated', 'public.reviews', 'language', 'SELECT'), 'authenticated can select reviews.language');

insert into public.reviews (external_ref, author_name, body, rating, published, language)
values ('rl-pub', 'Author Pub', 'Puenktlich und freundlich, gerne wieder.', 5, true, 'de'),
       ('rl-hid', 'Author Hid', 'Hidden review body.', 4, false, null);

create temporary table rl as
select (select id from public.reviews where external_ref = 'rl-pub') as pub_id,
       (select id from public.reviews where external_ref = 'rl-hid') as hid_id,
       public.review_ref('Puenktlich und freundlich, gerne wieder.') as pub_ref,
       public.review_ref('Hidden review body.') as hid_ref,
       (select count(*)::int from public.reviews where published) as published_count;
grant select on rl to public;

-- ── The ref ────────────────────────────────────────────────────────────────────────────── 2
select matches((select pub_ref from rl), '^[0-9a-f]{16}$', 'review_ref is 16 hex characters');
select isnt((select pub_ref from rl), (select pub_id::text from rl), 'review_ref is not the row id');

-- ── review_translation_source: published only ──────────────────────────────────────────── 5
set local role anon;
select is((select body || '|' || language from public.review_translation_source((select pub_ref from rl))),
  'Puenktlich und freundlich, gerne wieder.|de', 'anon resolves a published review ref to its body and language');
select is((select count(*)::int from public.review_translation_source((select hid_ref from rl))), 0, 'an unpublished review ref resolves to nothing');
select is((select count(*)::int from public.review_translation_source('0000000000000000')), 0, 'an unknown ref resolves to nothing');
select is((select count(*)::int from public.review_translation_source('not-a-ref')), 0, 'a malformed ref resolves to nothing');
reset role;
set local role vamos_public;
select is((select language from public.review_translation_source((select pub_ref from rl))), 'de', 'vamos_public resolves a published ref');
reset role;

-- ── review_ref EXECUTE: exactly the public list's roles ────────────────────────────────── 6
select function_privs_are('public', 'review_ref', array['text'], 'anon', array['EXECUTE'], 'review_ref: anon has EXECUTE');
select function_privs_are('public', 'review_ref', array['text'], 'vamos_public', array['EXECUTE'], 'review_ref: vamos_public has EXECUTE');
select function_privs_are('public', 'review_ref', array['text'], 'authenticated', array['EXECUTE'], 'review_ref: authenticated has EXECUTE');
select function_privs_are('public', 'review_ref', array['text'], 'vamos_system', array['EXECUTE'], 'review_ref: vamos_system has EXECUTE');
select ok(not has_function_privilege('service_role', 'public.review_ref(text)', 'EXECUTE'), 'review_ref: service_role has no EXECUTE (nothing through PUBLIC)');
set local role vamos_public;
select is((select count(*)::int from (select public.review_ref(body) from public.reviews where published) as x),
  (select published_count from rl), 'vamos_public: review_ref(body) over the published list returns one row per review');
reset role;

-- ── review_translation_source EXECUTE ──────────────────────────────────────────────────── 4
select function_privs_are('public', 'review_translation_source', array['text'], 'anon', array['EXECUTE'], 'source: anon has EXECUTE');
select function_privs_are('public', 'review_translation_source', array['text'], 'vamos_public', array['EXECUTE'], 'source: vamos_public has EXECUTE');
select function_privs_are('public', 'review_translation_source', array['text'], 'vamos_system', array['EXECUTE'], 'source: vamos_system has EXECUTE');
select function_privs_are('public', 'review_translation_source', array['text'], 'authenticated', '{}'::text[], 'source: authenticated has no EXECUTE');

-- ── Review language job: vamos_system only ─────────────────────────────────────────────── 6
select function_privs_are('public', 'system_review_language_source', array['uuid'], 'vamos_system', array['EXECUTE'], 'language source: vamos_system has EXECUTE');
select function_privs_are('public', 'system_review_language_source', array['uuid'], 'anon', '{}'::text[], 'language source: anon has no EXECUTE');
select function_privs_are('public', 'system_review_language_source', array['uuid'], 'vamos_staff', '{}'::text[], 'language source: vamos_staff has no EXECUTE');
select function_privs_are('public', 'system_review_language_set', array['uuid', 'text'], 'vamos_system', array['EXECUTE'], 'language set: vamos_system has EXECUTE');
select function_privs_are('public', 'system_review_language_set', array['uuid', 'text'], 'anon', '{}'::text[], 'language set: anon has no EXECUTE');
select function_privs_are('public', 'system_review_language_set', array['uuid', 'text'], 'vamos_staff', '{}'::text[], 'language set: vamos_staff has no EXECUTE');

-- ── The job reads and writes ───────────────────────────────────────────────────────────── 5
set local role vamos_system;
select is((select body || '|' || coalesce(language, 'null') || '|' || published::text from public.system_review_language_source((select hid_id from rl))),
  'Hidden review body.|null|false', 'the job reads body, language and published by id');
select lives_ok($$ select public.system_review_language_set((select hid_id from rl), 'en') $$, 'the job sets a language');
select throws_ok($$ select public.system_review_language_set((select hid_id from rl), 'und') $$, '22023', null, 'a non ISO 639-1 code is refused');
reset role;
select is((select language from public.reviews where external_ref = 'rl-hid'), 'en', 'the language is stored');
set local role anon;
select throws_ok($$ select public.system_review_language_set((select hid_id from rl), 'fr') $$, '42501', null, 'anon cannot call the language writer');
reset role;

select * from finish();
rollback;
