-- rest_function_grants.test.sql
--
-- 261005 money hardening S6, migrations 20261007310000 (grant, coupon codes) and 20261007320000 (revoke). Eight SECURITY DEFINER functions were executable
-- by anon (and some by authenticated), so anyone could call them through Supabase REST with the public
-- key, past the Worker's rate limits. EXECUTE now sits with vamos_checkout (the Worker's public
-- identity, which REST can never become), and quote_rate_book shows coupon codes and notes to staff only.
-- The customer functions the Worker calls AS authenticated keep that grant on purpose.
-- Synthetic rappen integers only.
begin;
select plan(51);

-- Fixtures --------------------------------------------------------------------------------
update public.rate_versions set status = 'retired' where status = 'live';
insert into public.vehicle_classes (slug, passenger_capacity, luggage_capacity)
values ('rfg-economy', 3, 3);
insert into public.rate_versions (slug, label) values ('rfg-rv', 'rest grants fixture');
insert into public.distance_rates (rate_version_id, vehicle_class_id, max_pax, base_fare_rappen, per_km_rappen, min_fare_rappen)
select rv.id, vc.id, 3, 1, 2, 3
  from public.rate_versions rv, public.vehicle_classes vc
 where rv.slug = 'rfg-rv' and vc.slug = 'rfg-economy';
insert into public.coupons (code, kind, percent, active, note, rate_version_id)
select 'RFG-SECRET', 'percent', 10.00, true, 'staff note RFG', rv.id
  from public.rate_versions rv where rv.slug = 'rfg-rv';
update public.rate_versions set status = 'live' where slug = 'rfg-rv';

insert into auth.users (id, email, aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('26100500-0000-4000-a000-000000000001', 'rfg-admin@vamostaxi.eu', 'authenticated', 'authenticated', '{}', '{}', now(), now());
insert into public.staff (user_id, role, active, accepted_at)
values ('26100500-0000-4000-a000-000000000001', 'admin', true, now());

create temporary table rfg_fn (sig text, label text);
insert into rfg_fn values
  ('public.quote_rate_book(boolean)', 'quote_rate_book'),
  ('public.quote_settings_version(timestamptz)', 'quote_settings_version'),
  ('public.quote_lock_deadline(bigint)', 'quote_lock_deadline'),
  ('public.evaluate_coupon(text,uuid,extensions.citext)', 'evaluate_coupon'),
  ('public.extra_labels_read()', 'extra_labels_read'),
  ('public.consent_choice(text,timestamptz)', 'consent_choice'),
  ('public.record_consent(boolean,boolean,boolean,boolean,text,text,text,uuid,text,inet)', 'record_consent'),
  ('public.checkout_account_settings()', 'checkout_account_settings');
grant select on rfg_fn to public;

-- (1) Grants: none for anon / authenticated / PUBLIC, all for vamos_checkout ------------------
select ok(not has_function_privilege('anon', sig, 'EXECUTE'), 'anon: no EXECUTE on ' || label) from rfg_fn order by label;
select ok(not has_function_privilege('authenticated', sig, 'EXECUTE'), 'authenticated: no EXECUTE on ' || label) from rfg_fn order by label;
select ok(has_function_privilege('vamos_checkout', sig, 'EXECUTE'), 'vamos_checkout: EXECUTE on ' || label) from rfg_fn order by label;
select is(
  (select count(*)::int
     from rfg_fn f
     join pg_proc p on p.oid = f.sig::regprocedure
    where p.proacl::text ~ '(^|[{,])=X/'),
  0, 'PUBLIC holds EXECUTE on none of the eight');
select is(
  (select count(*)::int from rfg_fn f
    where has_function_privilege('vamos_edge', f.sig, 'EXECUTE') or has_function_privilege('vamos_public', f.sig, 'EXECUTE')),
  0, 'the two login roles hold EXECUTE on none of the eight');

-- What stays ------------------------------------------------------------------------------
select ok(has_function_privilege('vamos_staff', 'public.quote_rate_book(boolean)', 'EXECUTE'), 'vamos_staff keeps quote_rate_book (price preview)');
select ok(has_function_privilege('vamos_staff', 'public.extra_labels_read()', 'EXECUTE'), 'vamos_staff keeps extra_labels_read (price editor)');
select ok(has_function_privilege('vamos_system', 'public.checkout_account_settings()', 'EXECUTE'), 'vamos_system keeps checkout_account_settings');
-- Kept for authenticated on purpose: the Worker calls them as the signed-in customer (asCustomer = authenticated).
select ok(has_function_privilege('authenticated', 'public.customer_confirmation_read(text,uuid)', 'EXECUTE'), 'authenticated keeps customer_confirmation_read (asCustomer)');
select ok(has_function_privilege('authenticated', 'public.customer_booking_extras(text)', 'EXECUTE'), 'authenticated keeps customer_booking_extras (asCustomer)');
select ok(has_function_privilege('authenticated', 'public.customer_claim_guest_bookings()', 'EXECUTE'), 'authenticated keeps customer_claim_guest_bookings (asCustomer)');
select ok(has_function_privilege('authenticated', 'public.checkout_cancel_unpaid(text)', 'EXECUTE'), 'authenticated keeps checkout_cancel_unpaid (asCustomer)');
select ok(has_function_privilege('authenticated', 'public.staff_claim_invite()', 'EXECUTE'), 'authenticated keeps staff_claim_invite (supabase.rpc by design)');

-- (2) As REST would call them: refused --------------------------------------------------------
set local role anon;
select throws_ok($$ select public.quote_rate_book(false) $$, '42501', null, 'anon cannot read the price book (coupon codes)');
select throws_ok($$ select public.evaluate_coupon('RFG-SECRET') $$, '42501', null, 'anon cannot guess vouchers');
select throws_ok($$ select public.record_consent(true, false, false, false, 'reject_all', 'en', 'v1', null, null, null) $$, '42501', null, 'anon cannot write consent');
select throws_ok($$ select * from public.consent_choice('v1', null) $$, '42501', null, 'anon cannot read consent');
reset role;
set local role authenticated;
select throws_ok($$ select public.record_consent(true, false, false, false, 'reject_all', 'en', 'v1', null, null, null) $$, '42501', null, 'authenticated cannot write consent');
select throws_ok($$ select public.checkout_account_settings() $$, '42501', null, 'authenticated cannot read the account switch');
reset role;

-- (3) The Worker's public identity still works, and gets no coupon code -------------------------
create temporary table rfg_public (doc jsonb);
create temporary table rfg_staff (doc jsonb);
grant all on rfg_public, rfg_staff to public;

set local role vamos_checkout;
insert into rfg_public select public.quote_rate_book(false);
select lives_ok($$ select public.quote_settings_version(now()) $$, 'vamos_checkout runs quote_settings_version');
select is(public.evaluate_coupon('rfg-secret') -> 'ok', 'true'::jsonb, 'vamos_checkout evaluates a voucher the traveller typed');
select lives_ok($$ select * from public.extra_labels_read() $$, 'vamos_checkout reads extra names');
reset role;

select is((select doc -> 'rate_version' ->> 'slug' from rfg_public), 'rfg-rv', 'vamos_checkout reads the live book');
select is(jsonb_array_length((select doc -> 'coupons' from rfg_public)), 1, 'the public book still lists the coupon row');
select ok((select (doc -> 'coupons' -> 0) ? 'id' from rfg_public), 'the public coupon row keeps its id (engine matches by id)');
select ok(not (select (doc -> 'coupons' -> 0) ? 'code' from rfg_public), 'the public coupon row has no code');
select ok(not (select (doc -> 'coupons' -> 0) ? 'note' from rfg_public), 'the public coupon row has no note');
select ok((select doc::text !~ 'RFG-SECRET' and doc::text !~ 'staff note RFG' from rfg_public), 'neither the code nor the note appears anywhere in the public book');

-- Staff (dashboard preview) still see the code.
set local role vamos_staff;
select set_config('request.jwt.claims', jsonb_build_object('sub', '26100500-0000-4000-a000-000000000001', 'role', 'authenticated',
  'aal', 'aal2', 'app_metadata', jsonb_build_object('vamos_role', 'admin'))::text, true);
insert into rfg_staff select public.quote_rate_book(true);
reset role;
select is((select doc -> 'coupons' -> 0 ->> 'code' from rfg_staff), 'RFG-SECRET', 'staff see the coupon code');
select is((select doc -> 'coupons' -> 0 ->> 'note' from rfg_staff), 'staff note RFG', 'staff see the coupon note');

select * from finish();
rollback;
