-- manage_booking_money_driver.test.sql
--
-- Quick 260929-mbp. The manage-booking page reads money and driver through two narrow definers.
-- Valid token: saved snapshot lines, method, presentment, driver with four fields only. Other
-- booking, revoked, expired or unknown token: nothing. Unassigned: driver null. Grants narrow.
-- Rolled back. Synthetic rappen integers only, never a product CHF figure.
begin;
select plan(32);

insert into public.vehicle_classes (slug, passenger_capacity, luggage_capacity, name)
values ('mbd-class', 4, 4, 'Van luxury');
insert into public.rate_versions (slug, label) values ('mbd-rv', 'MBD fixture');
update public.rate_versions set status = 'live' where slug = 'mbd-rv';

insert into public.vehicles (vehicle_class_id, model, plate)
select id, 'Mercedes V-Class', 'ZH 123456' from public.vehicle_classes where slug = 'mbd-class';
insert into public.chauffeurs (full_name, phone, licence_number, email, note)
values ('Anna Marie Keller', '+41 79 000 00 77', 'LIC-MBD', 'anna.private@example.test', 'private note');

insert into public.bookings (reference, contact_name, contact_email, status, locale)
values
  (public.next_booking_reference(), 'MBD Assigned', 'mbd-a@vamostaxi.eu', 'confirmed', 'en'),
  (public.next_booking_reference(), 'MBD Unassigned', 'mbd-u@vamostaxi.eu', 'confirmed', 'en'),
  (public.next_booking_reference(), 'MBD Pending', 'mbd-p@vamostaxi.eu', 'pending', 'en');

insert into public.booking_legs (
  booking_id, leg_seq, direction, pickup_text, dropoff_text,
  scheduled_at, scheduled_local, vehicle_class_id, estimated_duration_minutes, pax, bags
)
select b.id, 1, 'outbound', 'ZRH Airport', 'Zurich HB',
       now() + interval '48 hours', to_char(now() + interval '48 hours', 'YYYY-MM-DD"T"HH24:MI'),
       vc.id, 60, 2, 2
  from public.bookings b, public.vehicle_classes vc
 where b.contact_email like 'mbd-%@vamostaxi.eu' and vc.slug = 'mbd-class';

set local session_replication_role = replica;

insert into public.price_snapshots (
  quote_id, vehicle_class_id, rate_version_id, rate_version_is_live, settings_version_id,
  engine_version, pax, bags, lines, policy,
  subtotal_rappen, surcharges_rappen, discount_rappen, total_rappen,
  expires_at, quote_lock_expires_at, booking_id, source
)
select
  gen_random_uuid(), vc.id, rv.id, true, sv.id, 'quote-engine@mbd', 2, 2,
  jsonb_build_array(
    jsonb_build_object('seq', 1, 'code', 'distance_fare', 'kind', 'fare', 'i18n_key', 'price.line.transfer',
                       'amount_rappen', 9000, 'params', jsonb_build_object('vehicleClass', 'mbd-class')),
    jsonb_build_object('seq', 2, 'code', 'child-seat', 'kind', 'surcharge', 'i18n_key', 'price.surcharge.custom',
                       'amount_rappen', 1000,
                       'params', jsonb_build_object('names', jsonb_build_object('en', 'Child seat', 'de', 'Kindersitz',
                                                    'internal', 'do not leak'))),
    jsonb_build_object('seq', 3, 'code', 'coupon', 'kind', 'coupon', 'i18n_key', 'price.line.coupon',
                       'amount_rappen', -500),
    jsonb_build_object('seq', 4, 'code', 'vat', 'kind', 'vat', 'i18n_key', 'price.line.vat',
                       'amount_rappen', 770, 'params', jsonb_build_object('vatRateBps', 81))
  ),
  jsonb_build_object('cancellation_tiers', '[]'::jsonb, 'free_cancel_hours', 24,
                     'airport_waiting_minutes', 60, 'city_waiting_minutes', 15,
                     'settings_version_id', sv.id, 'modification_deadline_hours', 24,
                     'min_advance_minutes', 180, 'policy_doc', 'test'),
  9000, 1770, 500, 10270, now() + interval '1 day', now() + interval '1 day', b.id, 'web'
from public.vehicle_classes vc
cross join public.bookings b
cross join lateral (select id from public.rate_versions where slug = 'mbd-rv') rv
cross join lateral (select id from public.settings_versions order by id limit 1) sv
where vc.slug = 'mbd-class' and b.contact_email like 'mbd-%@vamostaxi.eu';

update public.bookings b
   set price_snapshot_id = s.id
  from public.price_snapshots s
 where s.booking_id = b.id and s.engine_version = 'quote-engine@mbd';

-- Assigned booking: paid in EUR (presentment 1100 cents) by TWINT-less card, method recorded later.
insert into public.booking_payments (
  booking_id, snapshot_id, stripe_payment_intent_id, charged_rappen, charged_currency,
  fx_rate, fx_source, fx_quoted_at, presentment_amount_minor, presentment_currency, status, captured_at
)
select b.id, b.price_snapshot_id, 'pi_mbd_a', 10270, 'EUR', 1.07, 'test', now(), 1100, 'EUR', 'succeeded', now()
  from public.bookings b where b.contact_email = 'mbd-a@vamostaxi.eu';
insert into public.booking_payments (
  booking_id, snapshot_id, stripe_payment_intent_id, charged_rappen, charged_currency, status, captured_at
)
select b.id, b.price_snapshot_id, 'pi_mbd_u', 10270, 'CHF', 'succeeded', now()
  from public.bookings b where b.contact_email = 'mbd-u@vamostaxi.eu';

set local session_replication_role = origin;

update public.booking_legs l
   set assigned_chauffeur_id = (select id from public.chauffeurs where licence_number = 'LIC-MBD'),
       assigned_vehicle_id = (select id from public.vehicles where plate = 'ZH 123456'),
       turnaround_buffer_minutes = 15
  from public.bookings b
 where b.id = l.booking_id and b.contact_email = 'mbd-a@vamostaxi.eu';

insert into public.booking_access_tokens (booking_id, token_hash, expires_at)
select b.id, extensions.digest('mbd-token-a', 'sha256'), now() + interval '1 day'
  from public.bookings b where b.contact_email = 'mbd-a@vamostaxi.eu';
insert into public.booking_access_tokens (booking_id, token_hash, expires_at)
select b.id, extensions.digest('mbd-token-u', 'sha256'), now() + interval '1 day'
  from public.bookings b where b.contact_email = 'mbd-u@vamostaxi.eu';
insert into public.booking_access_tokens (booking_id, token_hash, expires_at, revoked_at)
select b.id, extensions.digest('mbd-token-r', 'sha256'), now() + interval '1 day', now()
  from public.bookings b where b.contact_email = 'mbd-a@vamostaxi.eu';
insert into public.booking_access_tokens (booking_id, token_hash, expires_at)
select b.id, extensions.digest('mbd-token-e', 'sha256'), now() - interval '1 hour'
  from public.bookings b where b.contact_email = 'mbd-a@vamostaxi.eu';

create temporary table mbd as
select public.manage_booking_extras(extensions.digest('mbd-token-a', 'sha256')) as a,
       public.manage_booking_extras(extensions.digest('mbd-token-u', 'sha256')) as u;
grant select on mbd to public;

-- Money -------------------------------------------------------------------------------
select is((select (a -> 'money' ->> 'charged_rappen')::int from mbd), 10270, 'valid token: charged_rappen');
select is((select a -> 'money' ->> 'vehicle_class_name' from mbd), 'Van luxury', 'valid token: class display name');
select is((select jsonb_array_length(a -> 'money' -> 'lines') from mbd), 4, 'valid token: four saved snapshot lines');
select is((select a -> 'money' -> 'lines' -> 1 -> 'names' ->> 'de' from mbd), 'Kindersitz', 'extra: owner name in German');
select ok(not (select a -> 'money' -> 'lines' -> 1 -> 'names' ? 'internal' from mbd), 'extra: only the four locale names leave');
select is((select (a -> 'money' -> 'lines' -> 1 ->> 'amount_rappen')::int from mbd), 1000, 'extra: 1000 from the snapshot');
select is((select (a -> 'money' -> 'lines' -> 2 ->> 'amount_rappen')::int from mbd), -500, 'voucher line is negative');
select is((select (a -> 'money' -> 'lines' -> 3 ->> 'vat_rate_bps')::int from mbd), 81, 'VAT line carries its rate');
select is((select (a -> 'money' ->> 'presentment_amount_minor')::int from mbd), 1100, 'EUR presentment amount');
select is((select a -> 'money' ->> 'presentment_currency' from mbd), 'EUR', 'EUR presentment currency');
select ok((select a -> 'money' -> 'payment_method_type' = 'null'::jsonb from mbd), 'old payment: method null');

-- Driver ------------------------------------------------------------------------------
select is((select a -> 'driver' ->> 'first_name' from mbd), 'Anna', 'driver: first name only');
select is((select a -> 'driver' ->> 'phone' from mbd), '+41 79 000 00 77', 'driver: phone');
select is((select a -> 'driver' ->> 'vehicle_model' from mbd), 'Mercedes V-Class', 'driver: vehicle model');
select is((select a -> 'driver' ->> 'plate' from mbd), 'ZH 123456', 'driver: plate');
select is((select array_agg(k order by k) from mbd, jsonb_object_keys(a -> 'driver') k),
  array['first_name', 'phone', 'plate', 'vehicle_model'], 'driver: exactly the four keys');
select ok(position('Keller' in (select a::text from mbd)) = 0
      and position('anna.private' in (select a::text from mbd)) = 0
      and position('private note' in (select a::text from mbd)) = 0,
  'no surname, e-mail or note anywhere in the payload');
select ok((select u -> 'driver' = 'null'::jsonb from mbd), 'unassigned: driver is null');
select is((select (u -> 'money' ->> 'charged_rappen')::int from mbd), 10270, 'unassigned: money still returned');

-- Other / bad tokens ---------------------------------------------------------------------
select ok(public.manage_booking_extras(extensions.digest('mbd-token-r', 'sha256')) is null, 'revoked token: null');
select ok(public.manage_booking_extras(extensions.digest('mbd-token-e', 'sha256')) is null, 'expired token: null');
select ok(public.manage_booking_extras(extensions.digest('mbd-nope', 'sha256')) is null, 'unknown token: null');
select ok((select (u -> 'driver') is not distinct from 'null'::jsonb and u::text not like '%Anna%' from mbd),
  'token of another booking never returns the first booking''s driver');

-- Method write path -------------------------------------------------------------------------
select ok(public.checkout_payment_method_record('pi_mbd_a', 'card'), 'method recorded on a succeeded row');
select ok(not public.checkout_payment_method_record('pi_mbd_a', 'twint'), 'method is write-once via the definer');
select is(public.manage_booking_extras(extensions.digest('mbd-token-a', 'sha256')) -> 'money' ->> 'payment_method_type',
  'card', 'money read shows the recorded method');

-- Grants ------------------------------------------------------------------------------------
select ok(has_function_privilege('vamos_guest', 'public.manage_booking_extras(bytea)', 'EXECUTE')
      and not has_function_privilege('anon', 'public.manage_booking_extras(bytea)', 'EXECUTE')
      and not has_function_privilege('authenticated', 'public.manage_booking_extras(bytea)', 'EXECUTE'),
  'token function: vamos_guest only');
select ok(not has_function_privilege('anon', 'public.manage_driver_for(uuid)', 'EXECUTE')
      and not has_function_privilege('authenticated', 'public.manage_driver_for(uuid)', 'EXECUTE')
      and not has_function_privilege('vamos_guest', 'public.manage_driver_for(uuid)', 'EXECUTE')
      and not has_function_privilege('authenticated', 'public.manage_money_for(uuid)', 'EXECUTE')
      and not has_function_privilege('vamos_guest', 'public.manage_money_for(uuid)', 'EXECUTE'),
  'helpers: no caller role can execute');
select ok(not has_table_privilege('vamos_guest', 'public.chauffeurs', 'SELECT')
      and not has_table_privilege('anon', 'public.chauffeurs', 'SELECT')
      and not has_table_privilege('vamos_guest', 'public.vehicles', 'SELECT')
      and not has_table_privilege('anon', 'public.vehicles', 'SELECT'),
  'chauffeurs and vehicles stay ungranted to guest roles');

-- Signed-in owner ---------------------------------------------------------------------------
create temporary table mbd_ref as
select reference, contact_email from public.bookings where contact_email like 'mbd-%@vamostaxi.eu';
grant select on mbd_ref to public;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a4000000-0000-0000-0000-000000000001","role":"authenticated","email":"MBD-A@vamostaxi.eu"}', true);
select is(public.customer_booking_extras((select reference from mbd_ref where contact_email = 'mbd-a@vamostaxi.eu')) -> 'driver' ->> 'first_name',
  'Anna', 'owner: driver first name by reference');
select ok(public.customer_booking_extras((select reference from mbd_ref where contact_email = 'mbd-u@vamostaxi.eu')) is null,
  'owner: someone else''s booking returns nothing');
select ok(public.customer_booking_extras((select reference from mbd_ref where contact_email = 'mbd-p@vamostaxi.eu')) is null,
  'owner: unpaid booking returns nothing');
reset role;

select * from finish();
rollback;
