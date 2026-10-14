-- Phase 32 plan 12: fixtures for translate-browser.e2e.mjs (surfaces B and C). LOCAL LAB ONLY.
-- Refuses to run unless the throwaway-stack marker role exists (lab.sh set_roles makes it; never on a hosted project).
-- Idempotent: every row it owns carries a 'p32-' key and is deleted first. Synthetic people and text only, no amounts,
-- no invented figures. Translations are inserted as cache rows so no model is called (the lab Worker has no AI binding).
\set ON_ERROR_STOP on
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'vamos_throwaway_test_stack') then
    raise exception 'translate-seed.sql: not a throwaway lab stack (marker role missing), refusing';
  end if;
end
$$;

begin;

-- ---- clean previous runs ------------------------------------------------------------------------------------------
delete from public.translations t
 using public.reviews r
 where r.external_ref like 'p32-%' and t.context = 'review'
   and t.source_text = r.body;
delete from public.reviews where external_ref like 'p32-%';
delete from public.contact_submissions where idempotency_key like 'p32-%';

-- ---- support tickets (surface B) ------------------------------------------------------------------------------------
-- One ticket per case; the surname is the search token the browser types.
select public.submit_contact_message('p32-de', 'Lena Kessler', 'p32-de@example.test', '', '',
  'Guten Tag, ich brauche am Freitag einen Kindersitz. Bitte bestätigen Sie die Abholung am Ausgang B.', 'de');
select public.submit_contact_message('p32-ar', 'Omar Haddad', 'p32-ar@example.test', '', '',
  'مرحبا، أحتاج إلى مقعد للأطفال يوم الجمعة. يرجى تأكيد مكان الالتقاء عند المخرج.', 'ar');
select public.submit_contact_message('p32-it', 'Giulia Rossi', 'p32-it@example.test', '', '',
  'Buongiorno, vorrei sapere se l''autista può aspettare all''uscita del terminal. Grazie mille.', 'en');
select public.submit_contact_message('p32-en', 'Sam Brown', 'p32-en@example.test', '', '',
  'Hello, can the driver wait at the arrivals exit? Thank you.', 'en');
select public.submit_contact_message('p32-pend', 'Nora Weber', 'p32-pend@example.test', '', '',
  'Bonjour, est-ce que le chauffeur peut attendre devant la sortie des arrivées ?', 'fr');
select public.submit_contact_message('p32-fail', 'Paul Fischer', 'p32-fail@example.test', '', '',
  'Hallo, bitte rufen Sie mich vor der Abholung an.', 'de');
select public.submit_contact_message('p32-closed', 'Eva Meier', 'p32-closed@example.test', '', '',
  'Danke, alles hat gut geklappt.', 'de');

update public.contact_submissions set ticket_status = 'closed', closed_at = now()
 where idempotency_key = 'p32-closed';

create temporary table p32_msg on commit drop as
select s.idempotency_key as k, m.id
  from public.contact_submissions s
  join public.support_messages m on m.submission_id = s.id and m.direction = 'inbound_form'
 where s.idempotency_key like 'p32-%';

update public.support_messages m set detected_lang = v.lang
  from p32_msg x
  join (values ('p32-de', 'de'), ('p32-ar', 'ar'), ('p32-it', 'it'), ('p32-en', 'en'), ('p32-closed', 'de')) as v(k, lang) on v.k = x.k
 where m.id = x.id;

insert into public.support_message_translations (message_id, target_lang, body, status, prompt_version)
select x.id, v.target, v.body, 'done', 1
  from p32_msg x
  join (values
    ('p32-de', 'en', 'Hello, I need a child seat on Friday. Please confirm the pickup at exit B.'),
    ('p32-de', 'fr', 'Bonjour, j''ai besoin d''un siège enfant vendredi. Merci de confirmer la prise en charge à la sortie B.'),
    ('p32-de', 'ar', 'مرحبا، أحتاج إلى مقعد للأطفال يوم الجمعة. يرجى تأكيد الالتقاء عند المخرج B.'),
    ('p32-ar', 'en', 'Hello, I need a child seat on Friday. Please confirm the meeting point at the exit.'),
    ('p32-ar', 'de', 'Hallo, ich brauche am Freitag einen Kindersitz. Bitte bestätigen Sie den Treffpunkt am Ausgang.'),
    ('p32-ar', 'fr', 'Bonjour, j''ai besoin d''un siège enfant vendredi. Merci de confirmer le point de rendez-vous à la sortie.'),
    ('p32-it', 'en', 'Good morning, I would like to know if the driver can wait at the terminal exit. Many thanks.'),
    ('p32-it', 'de', 'Guten Morgen, ich möchte wissen, ob der Fahrer am Ausgang des Terminals warten kann. Vielen Dank.'),
    ('p32-it', 'fr', 'Bonjour, je voudrais savoir si le chauffeur peut attendre à la sortie du terminal. Merci beaucoup.'),
    ('p32-it', 'ar', 'صباح الخير، أود أن أعرف إن كان السائق يستطيع الانتظار عند مخرج المبنى. شكرا جزيلا.'),
    ('p32-en', 'de', 'Hallo, kann der Fahrer am Ausgang der Ankunftshalle warten? Danke.'),
    ('p32-en', 'fr', 'Bonjour, le chauffeur peut-il attendre à la sortie des arrivées ? Merci.'),
    ('p32-en', 'ar', 'مرحبا، هل يمكن للسائق الانتظار عند مخرج الوصول؟ شكرا.')
  ) as v(k, target, body) on v.k = x.k;

-- Failed: not detected, a failed row in every language, so it reads "Translation not available" in all four.
insert into public.support_message_translations (message_id, target_lang, body, status, attempts)
select x.id, l, null, 'failed', 3 from p32_msg x cross join unnest(array['en', 'de', 'fr', 'ar']) as l where x.k = 'p32-fail';

-- Pending: no row, not detected, created now (translate-run refreshes created_at before each frame: older than
-- 15 minutes reads as failed by design).
update public.support_messages m set created_at = now() from p32_msg x where m.id = x.id and x.k = 'p32-pend';

-- ---- published reviews (surface C) ----------------------------------------------------------------------------------
-- Seven published reviews, so the drift wall runs at widths with more than one column.
insert into public.reviews (external_ref, source, author_name, author_role, body, rating, published, sort_order, language) values
  ('p32-rv-de', 'manual', 'Lena K.', '', 'Der Fahrer war pünktlich am Ausgang und hat beim Gepäck geholfen. Sehr angenehme Fahrt.', 5, true, 1, 'de'),
  ('p32-rv-ar', 'manual', 'Omar H.', '', 'كان السائق في الموعد عند المخرج وساعدنا في الأمتعة. رحلة مريحة جدا.', 5, true, 2, 'ar'),
  ('p32-rv-en', 'manual', 'Sam B.', '', 'The driver was waiting at the exit and helped with our bags. A calm ride.', 5, true, 3, 'en'),
  ('p32-rv-null', 'manual', 'Alex R.', '', 'Clean car, friendly driver, easy booking.', 5, true, 4, null),
  ('p32-rv-de2', 'manual', 'Paul F.', '', 'Freundlicher Fahrer und ein sauberes Auto. Gerne wieder.', 5, true, 5, 'de'),
  ('p32-rv-en2', 'manual', 'Mia T.', '', 'Easy to book and the car was spotless.', 5, true, 6, 'en'),
  ('p32-rv-en3', 'manual', 'Noah L.', '', 'Friendly driver who knew the way well.', 5, true, 7, 'en');

-- Cached translations (context review, done) keyed like lib/translate/hash.ts:
-- sha256(lang || '\n' || NFC, trimmed, whitespace runs collapsed). p32-rv-de2 has none (the failure path).
insert into public.translations (source_hash, source_lang, target_lang, source_text, translated_text, origin, status, context, prompt_version)
select encode(sha256(convert_to(r.language || E'\n' || regexp_replace(btrim(normalize(r.body, NFC)), '\s+', ' ', 'g'), 'UTF8')), 'hex'),
       r.language, v.target, r.body, v.body, 'machine', 'done', 'review', 1
  from public.reviews r
  join (values
    ('p32-rv-de', 'en', 'The driver was on time at the exit and helped with the luggage. A very pleasant ride.'),
    ('p32-rv-de', 'fr', 'Le chauffeur était à l''heure à la sortie et a aidé avec les bagages. Un trajet très agréable.'),
    ('p32-rv-de', 'ar', 'كان السائق في الموعد عند المخرج وساعد في الأمتعة. رحلة ممتعة جدا.'),
    ('p32-rv-ar', 'en', 'The driver was on time at the exit and helped us with the luggage. A very comfortable ride.'),
    ('p32-rv-ar', 'de', 'Der Fahrer war pünktlich am Ausgang und half uns mit dem Gepäck. Eine sehr bequeme Fahrt.'),
    ('p32-rv-ar', 'fr', 'Le chauffeur était à l''heure à la sortie et nous a aidés avec les bagages. Un trajet très confortable.')
  ) as v(k, target, body) on v.k = r.external_ref;

commit;

-- The browser script reads these back (refs and ticket names), so it never guesses an id.
select 'review', external_ref, public.review_ref(body) from public.reviews where external_ref like 'p32-%' order by sort_order;
