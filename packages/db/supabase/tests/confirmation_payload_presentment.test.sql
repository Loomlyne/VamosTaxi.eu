-- confirmation_payload_presentment.test.sql
--
-- 26.3 gap G3 (D-21, D-29): confirmation_payload returns payment.presentment_amount_minor,
-- payment.presentment_currency and legs[].vehicle_class_name; existing fields stay; grants
-- stay as strict as 20260928170000 made them.
-- Rolled back. Synthetic 1-rappen / 1-cent figures only, never a product CHF.
begin;
select plan(14);

insert into public.vehicle_classes (slug, passenger_capacity, luggage_capacity, name)
values ('cpp-class', 4, 4, 'Van luxury');

insert into public.rate_versions (slug, label) values ('cpp-rv', 'CPP fixture');
update public.rate_versions set status = 'live' where slug = 'cpp-rv';

insert into public.bookings (reference, contact_name, contact_email, status, locale)
values
  (public.next_booking_reference(), 'CPP Eur', 'cpp-eur@vamostaxi.eu', 'confirmed', 'en'),
  (public.next_booking_reference(), 'CPP Chf', 'cpp-chf@vamostaxi.eu', 'confirmed', 'en');

insert into public.booking_legs (
  booking_id, leg_seq, direction, pickup_text, dropoff_text,
  scheduled_at, scheduled_local, vehicle_class_id, estimated_duration_minutes, pax, bags
)
select b.id, 1, 'outbound', 'ZRH Airport', 'Zurich HB',
       now() + interval '48 hours', to_char(now() + interval '48 hours', 'YYYY-MM-DD"T"HH24:MI'),
       vc.id, 60, 2, 2
  from public.bookings b, public.vehicle_classes vc
 where b.contact_email in ('cpp-eur@vamostaxi.eu', 'cpp-chf@vamostaxi.eu')
   and vc.slug = 'cpp-class';

set local session_replication_role = replica;

insert into public.price_snapshots (
  quote_id, vehicle_class_id, rate_version_id, rate_version_is_live, settings_version_id,
  engine_version, pax, bags, lines, policy,
  subtotal_rappen, surcharges_rappen, discount_rappen, total_rappen,
  expires_at, quote_lock_expires_at, booking_id, source
)
select
  gen_random_uuid(), vc.id, rv.id, true, sv.id, 'quote-engine@26-3-g3', 2, 2,
  jsonb_build_array(jsonb_build_object('seq', 1, 'code', 'distance_fare', 'kind', 'fare', 'i18n_key', 'price.line.transfer', 'amount_rappen', 8)),
  jsonb_build_object('cancellation_tiers', '[]'::jsonb, 'free_cancel_hours', 24,
                     'airport_waiting_minutes', 60, 'city_waiting_minutes', 15,
                     'settings_version_id', sv.id, 'modification_deadline_hours', 24,
                     'min_advance_minutes', 180, 'policy_doc', 'test'),
  8, 0, 0, 8, now() + interval '1 day', now() + interval '1 day', b.id, 'web'
from public.vehicle_classes vc
cross join public.bookings b
cross join lateral (select id from public.rate_versions where slug = 'cpp-rv') rv
cross join lateral (select id from public.settings_versions order by id limit 1) sv
where vc.slug = 'cpp-class'
  and b.contact_email in ('cpp-eur@vamostaxi.eu', 'cpp-chf@vamostaxi.eu');

update public.bookings b
   set price_snapshot_id = s.id
  from public.price_snapshots s
 where s.booking_id = b.id and s.engine_version = 'quote-engine@26-3-g3';

-- EUR payment: charged_currency EUR with the four FX facts and the presentment currency.
insert into public.booking_payments (
  booking_id, snapshot_id, stripe_payment_intent_id, charged_rappen, charged_currency,
  fx_rate, fx_source, fx_quoted_at, presentment_amount_minor, presentment_currency,
  status, captured_at
)
select b.id, b.price_snapshot_id, 'pi_cpp_eur', 8, 'EUR', 1.05, 'test', now(), 9, 'EUR', 'succeeded', now()
  from public.bookings b where b.contact_email = 'cpp-eur@vamostaxi.eu';

-- CHF payment: no presentment facts.
insert into public.booking_payments (
  booking_id, snapshot_id, stripe_payment_intent_id, charged_rappen, charged_currency, status, captured_at
)
select b.id, b.price_snapshot_id, 'pi_cpp_chf', 8, 'CHF', 'succeeded', now()
  from public.bookings b where b.contact_email = 'cpp-chf@vamostaxi.eu';

set local session_replication_role = origin;

create temporary table cpp as
select
  public.confirmation_payload((select id from public.bookings where contact_email = 'cpp-eur@vamostaxi.eu')) as eur,
  public.confirmation_payload((select id from public.bookings where contact_email = 'cpp-chf@vamostaxi.eu')) as chf;

select is((select (eur -> 'payment' ->> 'presentment_amount_minor')::int from cpp), 9,
  'EUR payment: presentment_amount_minor is returned');
select is((select eur -> 'payment' ->> 'presentment_currency' from cpp), 'EUR',
  'EUR payment: presentment_currency is returned');
select ok((select (chf -> 'payment') ? 'presentment_amount_minor' from cpp)
      and (select (chf -> 'payment' -> 'presentment_amount_minor') = 'null'::jsonb from cpp),
  'CHF payment: presentment_amount_minor key present and null');
select ok((select (chf -> 'payment') ? 'presentment_currency' from cpp)
      and (select (chf -> 'payment' -> 'presentment_currency') = 'null'::jsonb from cpp),
  'CHF payment: presentment_currency key present and null');
select is((select eur -> 'legs' -> 0 ->> 'vehicle_class_name' from cpp), 'Van luxury',
  'legs[].vehicle_class_name is the class display name, not the slug');

-- Existing fields still present.
select is((select eur -> 'booking' ->> 'status' from cpp), 'confirmed', 'booking.status still present');
select ok((select (eur -> 'booking') ? 'refund_status' and (eur -> 'booking') ? 'refunded_rappen' from cpp),
  'refund facts still present');
select is((select eur -> 'legs' -> 0 ->> 'pickup_text' from cpp), 'ZRH Airport', 'legs still carry pickup_text');
select ok((select (eur -> 'legs' -> 0) ? 'vehicle_class_id' from cpp), 'legs still carry vehicle_class_id');
select is((select (eur -> 'payment' ->> 'charged_rappen')::int from cpp), 8, 'payment.charged_rappen still present');
select ok((select (eur -> 'snapshot') ? 'total_rappen' from cpp), 'snapshot still present');

-- Grants unchanged.
select ok(not has_function_privilege('anon', 'public.confirmation_payload(uuid)', 'execute'),
  'anon cannot execute confirmation_payload');
select ok(not has_function_privilege('vamos_guest', 'public.confirmation_payload(uuid)', 'execute'),
  'vamos_guest cannot execute confirmation_payload');
select ok((select prosecdef from pg_proc where oid = 'public.confirmation_payload(uuid)'::regprocedure),
  'confirmation_payload is still security definer');

select * from finish();
rollback;
