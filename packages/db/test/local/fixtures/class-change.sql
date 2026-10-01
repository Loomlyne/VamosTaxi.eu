-- packages/db/test/local/fixtures/class-change.sql
--
-- Fixture for class-change-reprice.test.ts (26.2 P1). Runs inside one rolled-back transaction.
-- Synthetic integer rappen only. One paid Economy-like booking (p1c-eco) with a driver and his car
-- on it; a Business-like class (p1c-biz); a live price book; an admin.

insert into public.vehicle_classes (slug, passenger_capacity, luggage_capacity)
values ('p1c-eco', 4, 4), ('p1c-biz', 7, 7);

insert into public.rate_versions (slug, label) values ('p1c-rv', 'P1 class change fixture');
update public.rate_versions set status = 'live' where slug = 'p1c-rv';

insert into auth.users (id, email, aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('26020002-0000-4000-a000-000000000002', 'p1c-admin@vamostaxi.eu', 'authenticated', 'authenticated',
        '{}'::jsonb, '{}'::jsonb, now(), now());
insert into public.staff (user_id, role, active, accepted_at, full_name)
values ('26020002-0000-4000-a000-000000000002', 'admin', true, now(), 'P1C Admin');

insert into public.vehicles (vehicle_class_id, model, plate, seats, bags)
select vc.id, 'P1C Car', 'ZH-P1C-01', 4, 4 from public.vehicle_classes vc where vc.slug = 'p1c-eco';
insert into public.chauffeurs (full_name, phone, email, licence_number, default_vehicle_id, languages)
select 'P1C Driver', '+41 79 260 00 02', 'p1c-driver@vamostaxi.eu', 'LIC-P1C', v.id, array['fr', 'en']
  from public.vehicles v where v.plate = 'ZH-P1C-01';

insert into public.bookings (reference, contact_name, contact_email, status, locale)
values (public.next_booking_reference(), 'P1C Anna', 'p1c-anna@vamostaxi.eu', 'confirmed', 'en');

insert into public.booking_legs (
  booking_id, leg_seq, direction, pickup_text, dropoff_text,
  scheduled_at, scheduled_local, vehicle_class_id, status, pax, bags, estimated_duration_minutes
)
select b.id, 1, 'outbound', 'ZRH Airport', 'Zug', now() + interval '48 hours',
       to_char(now() + interval '48 hours', 'YYYY-MM-DD"T"HH24:MI'), vc.id, 'confirmed', 2, 1, 40
  from public.bookings b, public.vehicle_classes vc
 where b.contact_email = 'p1c-anna@vamostaxi.eu' and vc.slug = 'p1c-eco';

set local session_replication_role = replica;
insert into public.price_snapshots (
  quote_id, vehicle_class_id, rate_version_id, rate_version_is_live, settings_version_id,
  engine_version, pax, bags, lines, policy,
  subtotal_rappen, surcharges_rappen, discount_rappen, total_rappen,
  expires_at, quote_lock_expires_at, booking_id, source, distance_km, duration_min
)
select gen_random_uuid(), vc.id, rv.id, true, sv.id, 'quote-engine@p1c', 2, 1,
       '[{"seq":1,"leg_seq":1,"code":"distance_fare","kind":"fare","i18n_key":"price.line.transfer","amount_rappen":9},
         {"seq":2,"leg_seq":1,"code":"vat","kind":"vat","i18n_key":"price.line.vat","params":{"vatRateBps":81},"amount_rappen":1}]'::jsonb,
       jsonb_build_object('cancellation_tiers', '[]'::jsonb, 'free_cancel_hours', 24,
                          'airport_waiting_minutes', 60, 'city_waiting_minutes', 15,
                          'settings_version_id', sv.id, 'modification_deadline_hours', 24,
                          'min_advance_minutes', 180, 'policy_doc', 'test', 'extras', '[]'::jsonb),
       10, 0, 0, 10, now() + interval '1 day', now() + interval '1 day', b.id, 'web', 31.4, 40
  from public.vehicle_classes vc
  cross join public.bookings b
  cross join lateral (select id from public.rate_versions where slug = 'p1c-rv') rv
  cross join lateral (select id from public.settings_versions order by id limit 1) sv
 where vc.slug = 'p1c-eco' and b.contact_email = 'p1c-anna@vamostaxi.eu';
update public.bookings b set price_snapshot_id = s.id
  from public.price_snapshots s
 where s.booking_id = b.id and b.contact_email = 'p1c-anna@vamostaxi.eu';
insert into public.booking_payments (booking_id, snapshot_id, stripe_payment_intent_id, charged_rappen, status, captured_at)
select b.id, b.price_snapshot_id, 'pi_p1c_anna', 10, 'succeeded', now()
  from public.bookings b where b.contact_email = 'p1c-anna@vamostaxi.eu';
set local session_replication_role = origin;

update public.booking_legs l
   set assigned_chauffeur_id = c.id, assigned_vehicle_id = c.default_vehicle_id, status = 'assigned'
  from public.chauffeurs c, public.bookings b
 where c.email = 'p1c-driver@vamostaxi.eu' and b.contact_email = 'p1c-anna@vamostaxi.eu' and l.booking_id = b.id;

create temporary table p1c as
select b.id as booking_id, b.price_snapshot_id as snapshot_id, b.reference,
       (select id from public.rate_versions where slug = 'p1c-rv') as rate_version_id,
       (select id from public.chauffeurs where email = 'p1c-driver@vamostaxi.eu') as chauffeur_id
  from public.bookings b where b.contact_email = 'p1c-anna@vamostaxi.eu';
grant select on p1c to public;
