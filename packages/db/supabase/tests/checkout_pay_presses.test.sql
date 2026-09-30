-- checkout_pay_presses.test.sql
--
-- Phase 26.5 plan 04, D-20. Five Pay presses per quote, a replay is not a press, the sixth
-- is refused and not stored, quotes are counted apart, and only vamos_checkout can call the
-- function. Synthetic rows, rolled back.
begin;
select plan(16);

create temporary table cpp_ids (q1 uuid, q2 uuid);
insert into cpp_ids values ('00000000-0000-4000-8000-0000000c0001', '00000000-0000-4000-8000-0000000c0002');
grant select on cpp_ids to public;

select has_table('public', 'checkout_pay_presses', 'the press table exists');
select ok((select relrowsecurity from pg_class where oid = 'public.checkout_pay_presses'::regclass), 'RLS is on');
select table_privs_are('public', 'checkout_pay_presses', 'vamos_checkout', '{}'::text[], 'vamos_checkout has no table grant');
select table_privs_are('public', 'checkout_pay_presses', 'anon', '{}'::text[], 'anon has no table grant');
select table_privs_are('public', 'checkout_pay_presses', 'authenticated', '{}'::text[], 'authenticated has no table grant');
select function_privs_are('public', 'checkout_note_pay_press', '{uuid,text}'::text[], 'vamos_checkout', '{EXECUTE}'::text[], 'vamos_checkout can call it');
select function_privs_are('public', 'checkout_note_pay_press', '{uuid,text}'::text[], 'anon', '{}'::text[], 'anon cannot');
select function_privs_are('public', 'checkout_note_pay_press', '{uuid,text}'::text[], 'authenticated', '{}'::text[], 'authenticated cannot');
select ok((select prosecdef and proconfig = array['search_path=""'] from pg_proc where oid = 'public.checkout_note_pay_press(uuid,text)'::regprocedure),
  'SECURITY DEFINER with an empty search_path');

set local role vamos_checkout;
select is(public.checkout_note_pay_press((select q1 from cpp_ids), 'k1'), 'ok', 'press 1 is ok');
select is(public.checkout_note_pay_press((select q1 from cpp_ids), 'k1'), 'replay', 'the same key again is a replay');
select is((select string_agg(public.checkout_note_pay_press((select q1 from cpp_ids), 'k' || n), ',' order by n) from generate_series(2, 5) n),
  'ok,ok,ok,ok', 'presses 2 to 5 are ok');
select is(public.checkout_note_pay_press((select q1 from cpp_ids), 'k6'), 'limit', 'the sixth distinct key is refused');
select is(public.checkout_note_pay_press((select q1 from cpp_ids), 'k3'), 'replay', 'an earlier key is still a replay after the limit');
select is(public.checkout_note_pay_press((select q2 from cpp_ids), 'k1'), 'ok', 'another quote counts on its own');
reset role;

select is((select count(*)::int from public.checkout_pay_presses where quote_id = (select q1 from cpp_ids)), 5,
  'the refused sixth press was not stored');

select * from finish();
rollback;
