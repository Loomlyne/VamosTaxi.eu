-- extra_labels_prune.test.sql
--
-- 26.2 P4 A6: staff_extra_labels_prune() deletes the four-language names of every extra whose
-- code no live or draft price book uses; names still used by the live book or the draft stay;
-- a dispatcher (not admin) is refused. Fixtures prefixed p4-; synthetic amounts; rolled back.
begin;
select plan(8);

select has_function('public', 'staff_extra_labels_prune', array[]::text[],
  'staff_extra_labels_prune() exists');
select function_privs_are('public', 'staff_extra_labels_prune', array[]::text[],
  'vamos_staff', array['EXECUTE'], 'vamos_staff holds EXECUTE');
select function_privs_are('public', 'staff_extra_labels_prune', array[]::text[],
  'authenticated', array[]::text[], 'authenticated holds no EXECUTE');
select function_privs_are('public', 'staff_extra_labels_prune', array[]::text[],
  'anon', array[]::text[], 'anon holds no EXECUTE');

insert into auth.users (id, email, aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('26200000-0000-4000-a000-00000000000a', 'p4-admin@example.test', 'authenticated', 'authenticated', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('26200000-0000-4000-a000-00000000000d', 'p4-dispatch@example.test', 'authenticated', 'authenticated', '{}'::jsonb, '{}'::jsonb, now(), now());
insert into public.staff (user_id, role, active, accepted_at) values
  ('26200000-0000-4000-a000-00000000000a', 'admin', true, now()),
  ('26200000-0000-4000-a000-00000000000d', 'dispatcher', true, now());

-- Two names. p4-draft is used by a draft book, p4-gone by no book any more (its extra was
-- deleted). The live-book case uses the same join with status 'live' (the seed's live book
-- carries no extra, and a live book is frozen, so it is not staged here).
insert into public.extra_labels (code, label_en) values ('p4-draft', 'P4 draft'), ('p4-gone', 'P4 gone');

insert into public.rate_versions (slug, label) values ('p4-prune-draft', 'p4 prune draft');
insert into public.surcharges (rate_version_id, code, kind, amount_rappen, applies_to, active, predicate)
select id, 'p4-draft', 'amount', 1, 'leg', true, '{"kind":"manual"}'::jsonb
  from public.rate_versions where slug = 'p4-prune-draft';

set local role vamos_staff;
select set_config('request.jwt.claims',
  jsonb_build_object('sub', '26200000-0000-4000-a000-00000000000d', 'role', 'authenticated', 'aal', 'aal1',
    'app_metadata', jsonb_build_object('vamos_role', 'dispatcher'))::text,
  true);
select throws_ok(
  $$ select public.staff_extra_labels_prune() $$,
  '42501', null,
  'a dispatcher (not admin) is refused'
);
reset role;
select set_config('request.jwt.claims', '', true);

set local role vamos_staff;
select set_config('request.jwt.claims',
  jsonb_build_object('sub', '26200000-0000-4000-a000-00000000000a', 'role', 'authenticated', 'aal', 'aal1',
    'app_metadata', jsonb_build_object('vamos_role', 'admin'))::text,
  true);
select ok(public.staff_extra_labels_prune() >= 1, 'the admin prune deletes at least the unused name');
reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select array_agg(code order by code) from public.extra_labels where code like 'p4-%'),
  array['p4-draft'],
  'the draft''s name stays; the unused one is gone'
);

select is(
  (select count(*) from public.extra_labels e
    where not exists (
      select 1 from public.surcharges s join public.rate_versions rv on rv.id = s.rate_version_id
       where s.code = e.code and rv.status in ('live', 'draft')))::int,
  0,
  'no name is left whose extra no live or draft book uses'
);

select * from finish();
rollback;
