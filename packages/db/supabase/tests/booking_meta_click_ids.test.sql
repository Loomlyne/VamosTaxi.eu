-- booking_meta_click_ids.test.sql
--
-- Phase 28 plan 01 (META-09, D-09..D-11): the two Meta cookie values on a booking.
-- checkout_set_meta_click_ids is pending-only and vamos_checkout only; a trigger refuses a new or
-- changed value on any non-pending booking for every role; setting to NULL is always allowed;
-- formats are checked by the database. Synthetic data only.
begin;
select plan(47);

-- columns: two nullable text columns, no default
select has_column('public', 'bookings', 'meta_fbp', 'column meta_fbp exists');
select has_column('public', 'bookings', 'meta_fbc', 'column meta_fbc exists');
select col_is_null('public', 'bookings', 'meta_fbp', 'meta_fbp is nullable');
select col_is_null('public', 'bookings', 'meta_fbc', 'meta_fbc is nullable');
select col_hasnt_default('public', 'bookings', 'meta_fbp', 'meta_fbp has no default');
select col_hasnt_default('public', 'bookings', 'meta_fbc', 'meta_fbc has no default');

-- grants
select function_privs_are('public', 'checkout_set_meta_click_ids', '{uuid,text,text}'::text[], 'vamos_checkout', '{EXECUTE}'::text[], 'meta ids: vamos_checkout has EXECUTE');
select function_privs_are('public', 'checkout_set_meta_click_ids', '{uuid,text,text}'::text[], 'anon', '{}'::text[], 'meta ids: anon has no EXECUTE');
select function_privs_are('public', 'checkout_set_meta_click_ids', '{uuid,text,text}'::text[], 'authenticated', '{}'::text[], 'meta ids: authenticated has no EXECUTE');
select function_privs_are('public', 'checkout_set_meta_click_ids', '{uuid,text,text}'::text[], 'vamos_guest', '{}'::text[], 'meta ids: vamos_guest has no EXECUTE');
select function_privs_are('public', 'checkout_set_meta_click_ids', '{uuid,text,text}'::text[], 'vamos_system', '{}'::text[], 'meta ids: vamos_system has no EXECUTE');
select ok(not has_function_privilege('public', 'public.checkout_set_meta_click_ids(uuid,text,text)', 'EXECUTE'), 'meta ids: public has no EXECUTE');

-- column privileges: customers and guests cannot read the two columns
select ok(not has_column_privilege('authenticated', 'public.bookings', 'meta_fbp', 'SELECT'), 'authenticated cannot select meta_fbp');
select ok(not has_column_privilege('authenticated', 'public.bookings', 'meta_fbc', 'SELECT'), 'authenticated cannot select meta_fbc');
select ok(not has_column_privilege('vamos_guest', 'public.bookings', 'meta_fbp', 'SELECT'), 'vamos_guest cannot select meta_fbp');
select ok(not has_column_privilege('vamos_guest', 'public.bookings', 'meta_fbc', 'SELECT'), 'vamos_guest cannot select meta_fbc');

-- definer functions pin an empty search_path
select ok((select p.prosecdef and p.proconfig @> array['search_path=""']
             from pg_proc p where p.oid = 'public.checkout_set_meta_click_ids(uuid,text,text)'::regprocedure),
          'writer is security definer with search_path ""');
select ok((select p.proconfig @> array['search_path=""']
             from pg_proc p where p.oid = 'public.tg_bookings_meta_click_ids_pending_only()'::regprocedure),
          'trigger function has search_path ""');

select ok(not has_function_privilege('public', 'public.tg_bookings_meta_click_ids_pending_only()', 'EXECUTE'), 'trigger function is not executable by public');

-- fixtures
insert into auth.users (id, email, aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('28000000-0000-4000-a000-000000000001', 'meta-admin@example.test', 'authenticated', 'authenticated', '{}', '{}', now(), now());
insert into public.staff (user_id, role, active, accepted_at) values
  ('28000000-0000-4000-a000-000000000001', 'admin', true, now());
insert into public.bookings (id, contact_name, contact_email, status) values
  ('c2800000-0000-0000-0000-000000000001', 'Meta Pending', 'meta-a@example.test', 'pending'),
  ('c2800000-0000-0000-0000-000000000002', 'Meta Paid', 'meta-b@example.test', 'paid'),
  ('c2800000-0000-0000-0000-000000000003', 'Meta Confirmed', 'meta-c@example.test', 'confirmed');

-- pending booking: set, then clear (as the checkout role)
set local role vamos_checkout;
select lives_ok($$ select public.checkout_set_meta_click_ids('c2800000-0000-0000-0000-000000000001', 'fb.1.1727771234567.1234567890', 'fb.1.1727771234567.IwAR0abc_DEF-123') $$, 'pending booking takes both values');
reset role;
select is((select meta_fbp || '|' || meta_fbc from public.bookings where id = 'c2800000-0000-0000-0000-000000000001'),
          'fb.1.1727771234567.1234567890|fb.1.1727771234567.IwAR0abc_DEF-123', 'both values stored');
set local role vamos_checkout;
select lives_ok($$ select public.checkout_set_meta_click_ids('c2800000-0000-0000-0000-000000000001', null, null) $$, 'NULL, NULL clears both');
reset role;
select is((select count(*)::int from public.bookings where id = 'c2800000-0000-0000-0000-000000000001' and meta_fbp is null and meta_fbc is null), 1, 'both values cleared');

-- paid and confirmed: refused by the writer, row unchanged
set local role vamos_checkout;
select throws_ok($$ select public.checkout_set_meta_click_ids('c2800000-0000-0000-0000-000000000002', 'fb.1.1727771234567.1234567890', null) $$, '55000', null, 'paid booking refused by the writer');
select throws_ok($$ select public.checkout_set_meta_click_ids('c2800000-0000-0000-0000-000000000003', null, 'fb.1.1727771234567.abc') $$, '55000', null, 'confirmed booking refused by the writer');
select throws_ok($$ select public.checkout_set_meta_click_ids('c2800000-0000-0000-0000-0000000000ff', null, null) $$, 'P0002', null, 'unknown booking id is P0002');
reset role;
select is((select count(*)::int from public.bookings where id in ('c2800000-0000-0000-0000-000000000002','c2800000-0000-0000-0000-000000000003') and (meta_fbp is not null or meta_fbc is not null)), 0, 'paid and confirmed rows unchanged');

-- trigger: the database owner cannot backfill a paid booking
select throws_ok($$ update public.bookings set meta_fbp = 'fb.1.1727771234567.1234567890' where id = 'c2800000-0000-0000-0000-000000000002' $$, '55000', null, 'superuser update on a paid booking refused');
select throws_ok($$ update public.bookings set meta_fbc = 'fb.1.1727771234567.abc' where id = 'c2800000-0000-0000-0000-000000000003' $$, '55000', null, 'superuser update on a confirmed booking refused');
-- trigger: a staff role cannot either (staff hold whole-table UPDATE)
set local role vamos_staff;
select set_config('request.jwt.claims', jsonb_build_object('sub','28000000-0000-4000-a000-000000000001','role','authenticated','aal','aal2','app_metadata',jsonb_build_object('vamos_role','admin'))::text, true);
select is((select count(*)::int from public.bookings where id = 'c2800000-0000-0000-0000-000000000002'), 1, 'staff sees the paid fixture (so the refusal below is the trigger, not row security)');
select throws_ok($$ update public.bookings set meta_fbp = 'fb.1.1727771234567.1234567890' where id = 'c2800000-0000-0000-0000-000000000002' $$, '55000', null, 'staff update on a paid booking refused');
reset role;
-- trigger: insert of a paid booking with a value
select throws_ok($$ insert into public.bookings (id, contact_name, contact_email, status, meta_fbp) values ('c2800000-0000-0000-0000-000000000004', 'x', 'meta-d@example.test', 'paid', 'fb.1.1727771234567.1234567890') $$, '55000', null, 'insert of a paid booking with a value refused');
select lives_ok($$ insert into public.bookings (id, contact_name, contact_email, status, meta_fbp) values ('c2800000-0000-0000-0000-000000000005', 'x', 'meta-e@example.test', 'pending', 'fb.1.1727771234567.1234567890') $$, 'insert of a pending booking with a value accepted');

-- a paid booking that already holds a value (set while pending): other updates pass, NULL passes
update public.bookings set status = 'paid' where id = 'c2800000-0000-0000-0000-000000000005';
select lives_ok($$ update public.bookings set note = 'later note' where id = 'c2800000-0000-0000-0000-000000000005' $$, 'other columns of a paid booking with values still update');
select lives_ok($$ update public.bookings set status = 'confirmed' where id = 'c2800000-0000-0000-0000-000000000005' $$, 'status change on a booking with values is not blocked');
select lives_ok($$ update public.bookings set meta_fbp = null, meta_fbc = null where id = 'c2800000-0000-0000-0000-000000000005' $$, 'NULL on a non-pending booking is allowed (erasure)');
select is((select meta_fbp is null from public.bookings where id = 'c2800000-0000-0000-0000-000000000005'), true, 'value erased on the confirmed booking');

-- formats (pending booking, as the checkout role)
set local role vamos_checkout;
select throws_ok($$ select public.checkout_set_meta_click_ids('c2800000-0000-0000-0000-000000000001', 'abc', null) $$, '23514', null, 'fbp: free text refused');
select throws_ok($$ select public.checkout_set_meta_click_ids('c2800000-0000-0000-0000-000000000001', 'fb.1.123.456', null) $$, '23514', null, 'fbp: time too short refused');
select throws_ok(format($$ select public.checkout_set_meta_click_ids('c2800000-0000-0000-0000-000000000001', %L, null) $$, 'fb.1.1727771234567.' || repeat('1', 50)), '23514', null, 'fbp: 65+ chars refused');
select throws_ok($$ select public.checkout_set_meta_click_ids('c2800000-0000-0000-0000-000000000001', null, 'fb.1.1727771234567.ab cd') $$, '23514', null, 'fbc: a space refused');
select throws_ok(format($$ select public.checkout_set_meta_click_ids('c2800000-0000-0000-0000-000000000001', null, %L) $$, 'fb.1.1727771234567.' || repeat('a', 590)), '23514', null, 'fbc: longer than 600 refused');
select lives_ok($$ select public.checkout_set_meta_click_ids('c2800000-0000-0000-0000-000000000001', 'fb.1.1727771234567.1234567890', 'fb.1.1727771234567.IwAR0abc_DEF-123.AQ') $$, 'fbc with the AQ appendix accepted');
select lives_ok($$ select public.checkout_set_meta_click_ids('c2800000-0000-0000-0000-000000000001', 'fb.1.1727771234567.1234567890.AQ', 'fb.1.1727771234567.IwAR0abc_DEF-123.abcd1234') $$, 'fbp with AQ and fbc with an 8-char appendix accepted');
select lives_ok($$ select public.checkout_set_meta_click_ids('c2800000-0000-0000-0000-000000000001', 'fb.2.1727771234567.1234567890', 'fb.1.1727771234567.1234567890') $$, 'plain digits accepted');
reset role;
select is((select meta_fbp from public.bookings where id = 'c2800000-0000-0000-0000-000000000001'), 'fb.2.1727771234567.1234567890', 'last good value stored');

-- no existing booking carries a value except the fixtures this file made
select is((select count(*)::int from public.bookings where (meta_fbp is not null or meta_fbc is not null) and id::text not like 'c2800000-%'), 0, 'no other booking carries a value');

select * from finish();
rollback;
