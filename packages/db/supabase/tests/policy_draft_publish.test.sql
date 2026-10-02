-- policy_draft_publish.test.sql
--
-- Owner decision 2026-10-02: the four policy values get a draft and a Publish.
-- He went to set the waiting time to 30 minutes and the dashboard box saved nothing.
--
-- What is locked here: the draft row always exists (a database built from zero runs the
-- migrations before the seed, so a seed-from-live insert alone leaves no row and Save
-- silently keeps nothing); Publish supersedes rather than mutates; everything the four
-- values do not name is carried forward; an unchanged draft is refused; and the bounds
-- live on the columns, not only in TypeScript.
-- Rolled back. Synthetic minutes and hours only, never a product CHF.
begin;
select plan(18);

-- ── schema ──────────────────────────────────────────────────────────────────────── 7
select has_table('public', 'settings_policy_draft', 'settings_policy_draft exists');
select has_column('public', 'settings_policy_draft', 'min_advance_minutes', 'draft.min_advance_minutes exists');
select has_column('public', 'settings_policy_draft', 'free_cancel_hours', 'draft.free_cancel_hours exists');
select has_column('public', 'settings_policy_draft', 'airport_waiting_minutes', 'draft.airport_waiting_minutes exists');
select has_column('public', 'settings_policy_draft', 'city_waiting_minutes', 'draft.city_waiting_minutes exists');
select has_function('public', 'policy_publish_draft', array['uuid'], 'policy_publish_draft(uuid) exists');
select ok(
  not has_table_privilege('anon', 'public.settings_policy_draft', 'select'),
  'anon cannot read the draft');

-- ── the row is always there ──────────────────────────────────────────────────────── 2
select is(
  (select count(*)::int from public.settings_policy_draft),
  1,
  'exactly one draft row exists on a fresh database');
select throws_ok(
  $$insert into public.settings_policy_draft (id) values (2)$$,
  '23514',
  null,
  'a second draft row is refused by the id = 1 check');

-- ── bounds are on the columns ────────────────────────────────────────────────────── 3
select throws_ok(
  $$update public.settings_policy_draft set city_waiting_minutes = -1 where id = 1$$,
  '23514', null, 'a negative city waiting time is refused');
select throws_ok(
  $$update public.settings_policy_draft set airport_waiting_minutes = 1441 where id = 1$$,
  '23514', null, 'more than a day of airport waiting is refused');
select lives_ok(
  $$update public.settings_policy_draft set free_cancel_hours = 0 where id = 1$$,
  'zero free cancellation is a real answer, not a refusal');

-- ── publish ──────────────────────────────────────────────────────────────────────── 6
-- Bring the draft to exactly what is live, so "nothing to publish" is the honest state.
update public.settings_policy_draft d set
  min_advance_minutes = sv.min_advance_minutes,
  free_cancel_hours = sv.free_cancel_hours,
  airport_waiting_minutes = sv.airport_waiting_minutes,
  city_waiting_minutes = sv.city_waiting_minutes
from (
  select * from public.settings_versions
   where effective_from <= now() order by effective_from desc, id desc limit 1
) sv
where d.id = 1;

select throws_ok(
  $$select public.policy_publish_draft(null)$$,
  '22023', null, 'publishing a draft that is already live is refused');

update public.settings_policy_draft set city_waiting_minutes = 45 where id = 1;

select lives_ok(
  $$select public.policy_publish_draft(null)$$,
  'a changed draft publishes');

select is(
  (select sv.city_waiting_minutes from public.settings_versions sv
    where sv.effective_from <= now() order by sv.effective_from desc, sv.id desc limit 1),
  45,
  'the live policy now grants the published city waiting time');

select is(
  (select sv.cancellation_tiers from public.settings_versions sv
    order by sv.id desc limit 1),
  (select sv.cancellation_tiers from public.settings_versions sv
    order by sv.id asc limit 1),
  'the cancellation tiers were carried forward, not dropped');

select alike(
  (select sv.slug from public.settings_versions sv order by sv.id desc limit 1),
  'policy-publish-%',
  'the new row says how it was made');

select throws_ok(
  $$update public.settings_versions set city_waiting_minutes = 1 where id = 1$$,
  '23001', null, 'history stays append-only after this migration');

select finish();
rollback;
