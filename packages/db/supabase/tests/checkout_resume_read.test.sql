-- checkout_resume_read.test.sql
--
-- Plan 26.3-11 (D-24, D-25, T-26.3-11-01, T-26.3-11-05). The resume read answers only to the
-- SHA-256 of the booking's own manage token; every other hash returns zero rows and only
-- vamos_checkout may execute it. Synthetic rappen integers only.
begin;
select plan(13);

insert into public.vehicle_classes (slug, passenger_capacity, luggage_capacity)
values ('crr-economy', 3, 3);
insert into public.rate_versions (slug, label) values ('crr-rv', 'checkout_resume_read fixture');
insert into public.settings_versions (slug, label) values ('crr-policy', 'checkout_resume_read fixture');

create temporary table crr_q as select gen_random_uuid() as quote_id;
grant select on crr_q to public;

insert into public.bookings (contact_name, contact_email, contact_phone, company_name, company_address,
                             company_vat, note, quote_id, status, checkout_trip_query, pay_link_sent_at)
select 'Ada Rider', 'crr-a@example.test', '+41000000001', 'Rider AG', 'Bahnhofstr 1', 'CHE-1',
       'Ring the bell', q.quote_id, 'pending', 'from=ZRH&to=HB', null
  from crr_q q;

insert into public.price_snapshots (
  quote_id, vehicle_class_id, rate_version_id, rate_version_is_live, settings_version_id,
  engine_version, pax, bags, lines, policy, booking_id, expires_at, quote_lock_expires_at,
  subtotal_rappen, surcharges_rappen, discount_rappen, total_rappen, coupon_id, coupon_code
)
select q.quote_id, vc.id, rv.id, false, sv.id, 'quote-engine@crr', 1, 0,
       '[{"seq":1,"leg_seq":1,"kind":"fare","code":"distance_fare","i18n_key":"price.line.transfer","amount_rappen":900},
         {"seq":2,"leg_seq":1,"kind":"surcharge","code":"child_seat","i18n_key":"price.surcharge.custom","amount_rappen":100}]'::jsonb,
       jsonb_build_object('cancellation_tiers', '[]'::jsonb, 'free_cancel_hours', 24,
                          'airport_waiting_minutes', 60, 'city_waiting_minutes', 15,
                          'settings_version_id', 1, 'modification_deadline_hours', 24,
                          'min_advance_minutes', 180, 'policy_doc', 'test'),
       b.id, now() + interval '30 minutes', now() + interval '30 minutes',
       1000, 0, 0, 1000, null, null
  from crr_q q, public.vehicle_classes vc, public.rate_versions rv, public.settings_versions sv, public.bookings b
 where vc.slug = 'crr-economy' and rv.slug = 'crr-rv' and sv.slug = 'crr-policy'
   and b.contact_email = 'crr-a@example.test';

update public.bookings set price_snapshot_id = (select id from public.price_snapshots where engine_version = 'quote-engine@crr'),
                           price_total_rappen = 1000
 where contact_email = 'crr-a@example.test';

insert into public.booking_access_tokens (booking_id, token_hash, expires_at)
select b.id, extensions.digest('crr-token', 'sha256'), now() + interval '1 day'
  from public.bookings b where b.contact_email = 'crr-a@example.test';
insert into public.booking_access_tokens (booking_id, token_hash, expires_at)
select b.id, extensions.digest('crr-token-old', 'sha256'), now() - interval '1 hour'
  from public.bookings b where b.contact_email = 'crr-a@example.test';
insert into public.booking_access_tokens (booking_id, token_hash, expires_at, revoked_at)
select b.id, extensions.digest('crr-token-rev', 'sha256'), now() + interval '1 day', now()
  from public.bookings b where b.contact_email = 'crr-a@example.test';

create temporary table crr_ref as select reference from public.bookings where contact_email = 'crr-a@example.test';
grant select on crr_ref to public;

set local role vamos_checkout;

select is(
  (select count(*)::int from public.checkout_resume_read((select quote_id from crr_q), extensions.digest('crr-token', 'sha256'))),
  1, '(1) the matching hash returns one row');
select is(
  (select reference from public.checkout_resume_read((select quote_id from crr_q), extensions.digest('crr-token', 'sha256'))),
  (select reference from crr_ref), '(2) it is the booking of that quote');
select is(
  (select class_slug from public.checkout_resume_read((select quote_id from crr_q), extensions.digest('crr-token', 'sha256'))),
  'crr-economy', '(3) class slug from the snapshot');
select is(
  (select extra_codes from public.checkout_resume_read((select quote_id from crr_q), extensions.digest('crr-token', 'sha256'))),
  array['child_seat']::text[], '(4) extra codes are the surcharge lines only');
select is(
  (select contact_name || '|' || company_name || '|' || note || '|' || checkout_trip_query
     from public.checkout_resume_read((select quote_id from crr_q), extensions.digest('crr-token', 'sha256'))),
  'Ada Rider|Rider AG|Ring the bell|from=ZRH&to=HB', '(5) contact, company, note and trip query come back');
select is(
  (select charged_rappen from public.checkout_resume_read((select quote_id from crr_q), extensions.digest('crr-token', 'sha256'))),
  1000, '(6) charged amount');
select is(
  (select pay_link_sent from public.checkout_resume_read((select quote_id from crr_q), extensions.digest('crr-token', 'sha256'))),
  false, '(7) pay link flag');

select is(
  (select count(*)::int from public.checkout_resume_read((select quote_id from crr_q), extensions.digest('wrong', 'sha256'))),
  0, '(8) a wrong hash returns zero rows');
select is(
  (select count(*)::int from public.checkout_resume_read((select quote_id from crr_q), extensions.digest('crr-token-old', 'sha256'))),
  0, '(9) an expired token returns zero rows');
select is(
  (select count(*)::int from public.checkout_resume_read((select quote_id from crr_q), extensions.digest('crr-token-rev', 'sha256'))),
  0, '(10) a revoked token returns zero rows');
select is(
  (select count(*)::int from public.checkout_resume_read(gen_random_uuid(), extensions.digest('crr-token', 'sha256'))),
  0, '(11) another quote id returns zero rows');

reset role;
set local role anon;
select throws_ok(
  $$select * from public.checkout_resume_read(gen_random_uuid(), extensions.digest('x', 'sha256'))$$,
  '42501', null, '(12) anon cannot execute');
reset role;
select ok(
  has_function_privilege('vamos_checkout', 'public.checkout_resume_read(uuid, bytea)', 'execute')
  and not has_function_privilege('vamos_guest', 'public.checkout_resume_read(uuid, bytea)', 'execute'),
  '(13) vamos_checkout yes, vamos_guest no');

select * from finish();
rollback;
