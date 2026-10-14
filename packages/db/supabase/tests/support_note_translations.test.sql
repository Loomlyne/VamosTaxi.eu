-- support_note_translations.test.sql
--
-- Phase 32 plan 02 (RESEARCH pitfall 3, D-12; T-32-06, T-32-10). Customer text translations are
-- staff-only: anon, authenticated (a customer JWT, even for their own message), vamos_public,
-- vamos_edge and vamos_guest get 42501 on both tables; vamos_staff reads them only with staff claims.
-- Every system_* function is vamos_system only. The backlog lists ids, stops listing an item once it
-- has rows, lists a changed note again, and retries failed items after 24 h (fewer than 10 attempts).
-- The note DLQ writer marks failures for the current note only and never touches a done row.
-- An erased booking's note is never listed, read or written (PR #83 fix round 1, privacy).
begin;
select plan(79);

insert into auth.users (id, email, aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('32020000-0000-4000-a000-000000000001', 'snt-admin@vamostaxi.eu', 'authenticated', 'authenticated', '{}', '{}', now(), now()),
  ('32020000-0000-4000-a000-000000000002', 'snt-customer@example.test', 'authenticated', 'authenticated', '{}', '{}', now(), now());
insert into public.staff (user_id, role, active, accepted_at) values
  ('32020000-0000-4000-a000-000000000001', 'admin', true, now());
update public.customers set full_name = 'Customer SNT', email = 'snt-customer@example.test'
 where user_id = '32020000-0000-4000-a000-000000000002';

do $$
begin
  perform public.submit_contact_message('k-snt-1', 'Anna', 'snt-customer@example.test', '', '', 'Bitte mit Kindersitz, danke.', 'en');
  perform public.submit_contact_message('k-snt-2', 'Ben', 'snt-ben@example.test', '', '', 'Second message.', 'de');
end
$$;

insert into public.bookings (contact_name, contact_email, customer_id, status, note)
select 'Booking SNT', 'snt-customer@example.test', c.id, 'confirmed', 'Bitte am Ausgang B warten.'
  from public.customers c where c.user_id = '32020000-0000-4000-a000-000000000002';

-- An erased booking (staff_erase_unpaid_booking sets erased_at) that still carries a note.
insert into public.bookings (contact_name, contact_email, customer_id, status, note, erased_at)
select 'Booking SNT erased', 'snt-customer@example.test', c.id, 'quote', 'Bitte nicht uebersetzen.', now()
  from public.customers c where c.user_id = '32020000-0000-4000-a000-000000000002';

create temporary table fx as
select (select id from public.contact_submissions where idempotency_key = 'k-snt-1') as sub_id,
       (select m.id from public.support_messages m join public.contact_submissions s on s.id = m.submission_id
         where s.idempotency_key = 'k-snt-1' and m.direction = 'inbound_form') as msg_id,
       (select m.id from public.support_messages m join public.contact_submissions s on s.id = m.submission_id
         where s.idempotency_key = 'k-snt-2' and m.direction = 'inbound_form') as msg2_id,
       (select id from public.bookings where contact_name = 'Booking SNT') as booking_id,
       (select id from public.bookings where contact_name = 'Booking SNT erased') as erased_id,
       encode(sha256(convert_to('Bitte nicht uebersetzen.', 'UTF8')), 'hex') as erased_hash,
       encode(sha256(convert_to('Bitte am Ausgang B warten.', 'UTF8')), 'hex') as note_hash,
       encode(sha256(convert_to('Neuer Text bitte.', 'UTF8')), 'hex') as note_hash2;
grant select on fx to public;

insert into public.support_messages (submission_id, direction, body_text)
select sub_id, 'outbound_staff', 'Our reply.' from fx;

create temporary table out_msg as
select m.id from public.support_messages m where m.submission_id = (select sub_id from fx) and m.direction = 'outbound_staff';
grant select on out_msg to public;

-- ── Shape ──────────────────────────────────────────────────────────────────────────────── 4
select has_table('public', 'support_message_translations', 'support_message_translations exists');
select has_table('public', 'booking_note_translations', 'booking_note_translations exists');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.support_message_translations'::regclass), 'support_message_translations: enable + force RLS');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.booking_note_translations'::regclass), 'booking_note_translations: enable + force RLS');

-- ── EXECUTE: vamos_system only ─────────────────────────────────────────────────────────── 16
create temporary table fns (sig text, name text, args text[]);
insert into fns values
  ('public.system_support_translation_source(uuid)', 'system_support_translation_source', '{uuid}'),
  ('public.system_support_form_message_id(uuid)', 'system_support_form_message_id', '{uuid}'),
  ('public.system_support_translation_put(uuid,text,jsonb)', 'system_support_translation_put', '{uuid,text,jsonb}'),
  ('public.system_support_translation_fail(uuid)', 'system_support_translation_fail', '{uuid}'),
  ('public.system_booking_note_source(uuid)', 'system_booking_note_source', '{uuid}'),
  ('public.system_booking_note_translation_put(uuid,text,text,jsonb)', 'system_booking_note_translation_put', '{uuid,text,text,jsonb}'),
  ('public.system_booking_note_translation_fail(uuid,text)', 'system_booking_note_translation_fail', '{uuid,text}'),
  ('public.system_translation_backlog(integer)', 'system_translation_backlog', '{integer}');
select function_privs_are('public', name, args, 'vamos_system', '{EXECUTE}'::text[], name || ': vamos_system has EXECUTE') from fns order by name;
select ok(not (has_function_privilege('anon', sig, 'EXECUTE') or has_function_privilege('authenticated', sig, 'EXECUTE')
               or has_function_privilege('vamos_public', sig, 'EXECUTE') or has_function_privilege('vamos_staff', sig, 'EXECUTE')
               or has_function_privilege('vamos_checkout', sig, 'EXECUTE') or has_function_privilege('vamos_edge', sig, 'EXECUTE')),
          name || ': no other role has EXECUTE') from fns order by name;

-- ── Readers ────────────────────────────────────────────────────────────────────────────── 3
set local role vamos_system;
select is((select body_text || '|' || direction || '|' || form_locale || '|' || coalesce(detected_lang, 'null') from public.system_support_translation_source((select msg_id from fx))),
  'Bitte mit Kindersitz, danke.|inbound_form|en|null', 'support source: body, direction, form locale, no language yet');
select is(public.system_support_form_message_id((select sub_id from fx)), (select msg_id from fx), 'the inbound_form message of a submission');
select is((select note || '|' || note_hash from public.system_booking_note_source((select booking_id from fx))),
  'Bitte am Ausgang B warten.|' || (select note_hash from fx), 'note source: text and sha256');

-- ── Backlog before any translation ─────────────────────────────────────────────────────── 4
select ok(exists (select 1 from public.system_translation_backlog(200) b where b.kind = 'support' and b.id = (select msg_id from fx)::text),
  'backlog lists an inbound message with no rows');
select ok(not exists (select 1 from public.system_translation_backlog(200) b where b.id = (select id from out_msg)::text),
  'backlog never lists his outbound message');
select ok(exists (select 1 from public.system_translation_backlog(200) b where b.kind = 'note' and b.id = (select booking_id from fx)::text),
  'backlog lists a booking whose note has no rows');
select is((select count(*)::int from public.system_translation_backlog(100000)), (select count(*)::int from public.system_translation_backlog(200)),
  'backlog caps the limit at 200');

-- ── Erased booking: never listed, read or written ───────────────────────────────────────── 5
select ok(not exists (select 1 from public.system_translation_backlog(200) b where b.id = (select erased_id from fx)::text),
  'backlog never lists an erased booking, even with a note');
select is((select count(*)::int from public.system_booking_note_source((select erased_id from fx))), 0,
  'note source returns nothing for an erased booking');
select is(public.system_booking_note_translation_put((select erased_id from fx), 'de', (select erased_hash from fx),
  '{"en":{"body":"Please do not translate.","status":"done","prompt_version":1}}'::jsonb), 0,
  'note put writes nothing for an erased booking');
select lives_ok($$ select public.system_booking_note_translation_fail((select erased_id from fx), (select erased_hash from fx)) $$,
  'note fail on an erased booking runs');
reset role;
select is((select count(*)::int from public.booking_note_translations where booking_id = (select erased_id from fx)), 0,
  'no translation row exists for the erased booking');
set local role vamos_system;

-- ── Support put ────────────────────────────────────────────────────────────────────────── 8
select is(public.system_support_translation_put((select msg_id from fx), 'DE',
  '{"en":{"body":"Please with a child seat, thanks.","status":"done","prompt_version":1},"fr":{"body":null,"status":"rejected"},"de":{"body":"  ","status":"done"},"xx":{"body":"x","status":"done"},"ar":{"body":"y","status":"pending"}}'::jsonb), 3,
  'put writes en, fr and de (unknown key and unknown status ignored)');
reset role;
select is((select detected_lang from public.support_messages where id = (select msg_id from fx)), 'de', 'detected language stored, lower-cased');
select is((select status || '|' || body || '|' || prompt_version from public.support_message_translations where message_id = (select msg_id from fx) and target_lang = 'en'),
  'done|Please with a child seat, thanks.|1', 'en done row stored');
select is((select status || '|' || coalesce(body, 'null') from public.support_message_translations where message_id = (select msg_id from fx) and target_lang = 'de'),
  'rejected|null', 'a done entry with a blank body is stored as rejected');
select is((select count(*)::int from public.support_message_translations where message_id = (select msg_id from fx)), 3, 'three rows, no unknown language');
set local role vamos_system;
select ok(not exists (select 1 from public.system_translation_backlog(200) b where b.id = (select msg_id from fx)::text), 'backlog stops listing the message after a put');
select is(public.system_support_translation_put((select msg_id from fx), null, '{"en":{"body":null,"status":"rejected"}}'::jsonb), 1, 'a later rejected answer runs');
select throws_ok($$ select public.system_support_translation_put((select msg_id from fx), 'de', '["en"]'::jsonb) $$, '22023', null, 'a non-object payload is refused');
reset role;

-- ── A rejected answer never replaces a done one; long bodies are refused ───────────────── 4
select is((select status from public.support_message_translations where message_id = (select msg_id from fx) and target_lang = 'en'), 'done', 'en is still done');
set local role vamos_system;
select lives_ok($$ select public.system_support_translation_put((select msg2_id from fx), 'de', jsonb_build_object('en', jsonb_build_object('body', repeat('x', 8001), 'status', 'done'))) $$, 'a put with an over-long body runs');
reset role;
select is((select status || '|' || coalesce(body, 'null') from public.support_message_translations where message_id = (select msg2_id from fx) and target_lang = 'en'),
  'rejected|null', 'a body over 8000 characters is never written');
select is((select detected_lang from public.support_messages where id = (select msg_id from fx)), 'de', 'a null detection leaves the stored language');

-- ── Support DLQ ────────────────────────────────────────────────────────────────────────── 7
set local role vamos_system;
select lives_ok($$ select public.system_support_translation_fail((select msg_id from fx)) $$, 'fail on a message with a done row runs');
reset role;
select is((select string_agg(target_lang || ':' || status, ',' order by target_lang) from public.support_message_translations where message_id = (select msg_id from fx)),
  'de:rejected,en:done,fr:rejected', 'fail writes nothing when a done row exists');
delete from public.support_message_translations where message_id = (select msg2_id from fx);
set local role vamos_system;
select lives_ok($$ select public.system_support_translation_fail((select msg2_id from fx)) $$, 'fail on a message with no rows runs');
reset role;
select is((select string_agg(target_lang || ':' || status || ':' || attempts, ',' order by target_lang) from public.support_message_translations where message_id = (select msg2_id from fx)),
  'ar:failed:1,de:failed:1,en:failed:1,fr:failed:1', 'fail marks all four targets failed');
set local role vamos_system;
select ok(not exists (select 1 from public.system_translation_backlog(200) b where b.id = (select msg2_id from fx)::text), 'a fresh failure is not retried yet');
reset role;
update public.support_message_translations set updated_at = now() - interval '25 hours' where message_id = (select msg2_id from fx);
set local role vamos_system;
select ok(exists (select 1 from public.system_translation_backlog(200) b where b.kind = 'support' and b.id = (select msg2_id from fx)::text), 'a failure older than 24 h is retried');
reset role;
update public.support_message_translations set attempts = 10 where message_id = (select msg2_id from fx);
set local role vamos_system;
select ok(not exists (select 1 from public.system_translation_backlog(200) b where b.id = (select msg2_id from fx)::text), 'after 10 attempts it is not retried');
reset role;

-- ── Booking note put, note change, stale hash ──────────────────────────────────────────── 5
set local role vamos_system;
select is(public.system_booking_note_translation_put((select booking_id from fx), 'de', (select note_hash from fx),
  '{"en":{"body":"Please wait at exit B.","status":"done","prompt_version":1},"fr":{"body":"Attendez a la sortie B.","status":"done","prompt_version":1}}'::jsonb), 2,
  'note put writes two languages');
select ok(not exists (select 1 from public.system_translation_backlog(200) b where b.kind = 'note' and b.id = (select booking_id from fx)::text), 'backlog stops listing the note');
reset role;
update public.bookings set note = 'Neuer Text bitte.' where id = (select booking_id from fx);
set local role vamos_system;
select ok(exists (select 1 from public.system_translation_backlog(200) b where b.kind = 'note' and b.id = (select booking_id from fx)::text), 'a changed note (new hash) is listed again');
select is(public.system_booking_note_translation_put((select booking_id from fx), 'de', (select note_hash from fx),
  '{"en":{"body":"Old","status":"done","prompt_version":1}}'::jsonb), 0, 'a put for the old note (stale hash) writes nothing');
reset role;
select is((select string_agg(target_lang || ':' || body, ',' order by target_lang) from public.booking_note_translations where booking_id = (select booking_id from fx)),
  'en:Please wait at exit B.,fr:Attendez a la sortie B.', 'the stale put changed nothing');

-- ── Booking note DLQ ───────────────────────────────────────────────────────────────────── 8
set local role vamos_system;
select lives_ok($$ select public.system_booking_note_translation_fail((select booking_id from fx), (select note_hash from fx)) $$, 'note fail with a stale hash runs');
reset role;
select is((select count(*)::int from public.booking_note_translations where booking_id = (select booking_id from fx) and status = 'failed'), 0,
  'note fail with a stale hash writes nothing');
set local role vamos_system;
select lives_ok($$ select public.system_booking_note_translation_fail((select booking_id from fx), (select note_hash2 from fx)) $$, 'note fail for the current note runs');
reset role;
select is((select string_agg(target_lang || ':' || status, ',' order by target_lang) from public.booking_note_translations
            where booking_id = (select booking_id from fx) and note_hash = (select note_hash2 from fx)),
  'ar:failed,de:failed,en:failed,fr:failed', 'note fail marks the four targets of the current note failed');
select is((select count(*)::int from public.booking_note_translations where booking_id = (select booking_id from fx) and note_hash <> (select note_hash2 from fx)), 0,
  'rows of the earlier note are gone');
set local role vamos_system;
select is(public.system_booking_note_translation_put((select booking_id from fx), 'de', (select note_hash2 from fx), '{"en":{"body":"New text please.","status":"done","prompt_version":1}}'::jsonb), 1, 'a put for the current note writes en');
select lives_ok($$ select public.system_booking_note_translation_fail((select booking_id from fx), (select note_hash2 from fx)) $$, 'note fail after a done row runs');
reset role;
select is((select status || '|' || body || '|' || attempts from public.booking_note_translations where booking_id = (select booking_id from fx) and target_lang = 'en'),
  'done|New text please.|2', 'note fail never touches a done row');

-- ── Who can read the tables ────────────────────────────────────────────────────────────── 14
set local role anon;
select throws_ok($$ select * from public.support_message_translations $$, '42501', null, 'anon: support_message_translations refused');
select throws_ok($$ select * from public.booking_note_translations $$, '42501', null, 'anon: booking_note_translations refused');
reset role;
set local role authenticated;
select set_config('request.jwt.claims', jsonb_build_object('sub', '32020000-0000-4000-a000-000000000002', 'role', 'authenticated', 'aal', 'aal2', 'email', 'snt-customer@example.test')::text, true);
select throws_ok($$ select body from public.support_message_translations where message_id = (select msg_id from fx) $$, '42501', null,
  'authenticated customer: cannot read the translation of their own message');
select throws_ok($$ select body from public.booking_note_translations where booking_id = (select booking_id from fx) $$, '42501', null,
  'authenticated customer: cannot read the translation of their own booking note');
reset role;
set local role vamos_public;
select throws_ok($$ select * from public.support_message_translations $$, '42501', null, 'vamos_public: support_message_translations refused');
select throws_ok($$ select * from public.booking_note_translations $$, '42501', null, 'vamos_public: booking_note_translations refused');
reset role;
set local role vamos_edge;
select throws_ok($$ select * from public.support_message_translations $$, '42501', null, 'vamos_edge: support_message_translations refused');
select throws_ok($$ select * from public.booking_note_translations $$, '42501', null, 'vamos_edge: booking_note_translations refused');
reset role;
set local role vamos_guest;
select throws_ok($$ select * from public.support_message_translations $$, '42501', null, 'vamos_guest: support_message_translations refused');
select throws_ok($$ select * from public.booking_note_translations $$, '42501', null, 'vamos_guest: booking_note_translations refused');
reset role;
set local role vamos_staff;
select set_config('request.jwt.claims', jsonb_build_object('sub', '32020000-0000-4000-a000-000000000002', 'role', 'authenticated', 'aal', 'aal2')::text, true);
select is((select count(*)::int from public.support_message_translations), 0, 'vamos_staff without staff claims sees no row');
select set_config('request.jwt.claims', jsonb_build_object('sub', '32020000-0000-4000-a000-000000000001', 'role', 'authenticated', 'aal', 'aal2', 'app_metadata', jsonb_build_object('vamos_role', 'admin'))::text, true);
select is((select count(*)::int from public.support_message_translations where message_id = (select msg_id from fx)), 3, 'staff reads the message translations');
select is((select count(*)::int from public.booking_note_translations where booking_id = (select booking_id from fx)), 4, 'staff reads the note translations');
select throws_ok($$ insert into public.support_message_translations (message_id, target_lang, status) values ((select msg_id from fx), 'en', 'failed') $$, '42501', null,
  'staff cannot write a translation row');
reset role;

-- ── Cascade ────────────────────────────────────────────────────────────────────────────── 1
delete from public.support_messages where id = (select msg_id from fx);
select is((select count(*)::int from public.support_message_translations where message_id = (select msg_id from fx)), 0, 'deleting a message deletes its translations');

select * from finish();
rollback;
