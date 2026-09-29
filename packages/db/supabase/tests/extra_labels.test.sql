-- extra_labels.test.sql
--
-- Plan 26.3-07 Task 3 (D-44, T-26.3-07-06). Names are readable by everyone through the read RPC,
-- writable only by an admin, code format and length enforced, and every insert/update writes an
-- audit_log row with a non-null record_id (the id identity column is what makes that work).
begin;
select plan(15);

insert into auth.users (id, email, aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('26300000-0000-4000-a000-000000000001', 'xl-admin@vamostaxi.eu', 'authenticated', 'authenticated', '{}', '{}', now(), now()),
  ('26300000-0000-4000-a000-000000000002', 'xl-dispatch@vamostaxi.eu', 'authenticated', 'authenticated', '{}', '{}', now(), now());
insert into public.staff (user_id, role, active, accepted_at) values
  ('26300000-0000-4000-a000-000000000001', 'admin', true, now()),
  ('26300000-0000-4000-a000-000000000002', 'dispatcher', true, now());

select has_table('public', 'extra_labels', 'extra_labels exists');
select ok((select relrowsecurity from pg_class where oid = 'public.extra_labels'::regclass), 'RLS is on');
select function_privs_are('public', 'staff_extra_label_upsert', '{text,text,text,text,text,text[]}'::text[], 'anon', '{}'::text[], 'upsert: anon has no EXECUTE');
select function_privs_are('public', 'staff_extra_label_upsert', '{text,text,text,text,text,text[]}'::text[], 'vamos_checkout', '{}'::text[], 'upsert: vamos_checkout has no EXECUTE');
select function_privs_are('public', 'extra_labels_read', '{}'::text[], 'anon', '{EXECUTE}'::text[], 'read: anon has EXECUTE');

-- Dispatcher refused, admin accepted.
set local role vamos_staff;
select set_config('request.jwt.claims', jsonb_build_object('sub','26300000-0000-4000-a000-000000000002','role','authenticated','aal','aal2','app_metadata',jsonb_build_object('vamos_role','dispatcher'))::text, true);
select throws_ok($$ select public.staff_extra_label_upsert('child_seat','Child seat',null,null,null,'{}') $$, '42501', null, 'a dispatcher cannot write a name');
select set_config('request.jwt.claims', jsonb_build_object('sub','26300000-0000-4000-a000-000000000001','role','authenticated','aal','aal2','app_metadata',jsonb_build_object('vamos_role','admin'))::text, true);
select lives_ok($$ select public.staff_extra_label_upsert('child_seat','Child seat','Kindersitz',null,'مقعد أطفال','{ar}') $$, 'admin inserts a name');
select lives_ok($$ select public.staff_extra_label_upsert('child_seat','Child seat ','Kindersitz','Siege enfant',null,'{}') $$, 'admin upserts on the same code');
select throws_ok($$ select public.staff_extra_label_upsert('Bad Code!','x',null,null,null,'{}') $$, '23514', null, 'code format enforced');
select throws_ok($$ select public.staff_extra_label_upsert('too_long', repeat('x', 81),null,null,null,'{}') $$, '23514', null, 'label length enforced');
reset role;

select is((select count(*)::int from public.extra_labels where code = 'child_seat'), 1, 'upsert keeps one row per code');
select is((select label_en || '|' || label_de || '|' || label_fr || '|' || coalesce(label_ar, 'null') from public.extra_labels where code = 'child_seat'),
  'Child seat|Kindersitz|Siege enfant|null', 'the update replaced every language, trimmed');

-- Anyone reads; anon cannot write or read the table directly.
set local role anon;
select is((select label_de from public.extra_labels_read() where code = 'child_seat'), 'Kindersitz', 'anon reads through extra_labels_read');
select throws_ok($$ insert into public.extra_labels (code, label_en) values ('anon_try', 'x') $$, '42501', null, 'anon cannot write the table');
reset role;

select is((select count(*)::int from public.audit_log where table_name = 'extra_labels' and record_id is not null
            and action in ('insert', 'update')), 2, 'insert and update each wrote an audit row with a record_id');

select * from finish();
rollback;
