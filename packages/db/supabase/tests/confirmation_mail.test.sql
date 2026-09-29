-- confirmation_mail.test.sql
--
-- Plan 26.3-01 (D-29, D-39). After a booking settles, vamos_system reads every
-- confirmation-mail field through checkout_booking_for_email (definer), and
-- notification_confirmation_missing finds a paid booking with no claim.
-- Fixture slugs/emails prefixed conf-mail-. Synthetic figures, rolled back —
-- never a real CHF amount (D-34).
begin;
select plan(22);

insert into public.vehicle_classes (slug, name, passenger_capacity, luggage_capacity)
values ('first', 'Conf-mail class', 3, 3);

insert into public.rate_versions (slug, label)
values ('conf-mail-rv', 'conf-mail rate fixture');

insert into public.settings_versions (slug, label)
values ('conf-mail-policy', 'conf-mail policy fixture');

update public.rate_versions set status = 'live' where slug = 'conf-mail-rv';

insert into public.bookings (contact_name, contact_email, status)
values ('conf-mail Booking', 'conf-mail-booking@example.test', 'pending');

insert into public.booking_legs (booking_id, leg_seq, direction, pickup_text, dropoff_text,
                                  scheduled_at, scheduled_local, vehicle_class_id)
select b.id, 1, 'outbound', 'ZRH', 'Zurich HB', now() + interval '3 days',
       to_char(now() + interval '3 days', 'YYYY-MM-DD"T"HH24:MI'), vc.id
  from public.bookings b, public.vehicle_classes vc
 where b.contact_email = 'conf-mail-booking@example.test' and vc.slug = 'first';

create temporary table cm as
select vc.id as vehicle_class_id, rv.id as rate_version_id, sv.id as settings_version_id,
       b.id as booking_id
  from public.vehicle_classes vc, public.rate_versions rv, public.settings_versions sv,
       public.bookings b
 where vc.slug = 'first' and rv.slug = 'conf-mail-rv'
   and sv.slug = 'conf-mail-policy'
   and b.contact_email = 'conf-mail-booking@example.test';
grant select on cm to public;

insert into public.price_snapshots (
  quote_id, vehicle_class_id, rate_version_id, rate_version_is_live, settings_version_id,
  engine_version, pax, bags, lines, policy, booking_id,
  subtotal_rappen, surcharges_rappen, discount_rappen, total_rappen, expires_at, quote_lock_expires_at
)
select gen_random_uuid(), cm.vehicle_class_id, cm.rate_version_id, true, cm.settings_version_id,
       'conf-mail@s1', 1, 0, jsonb_build_array(jsonb_build_object(
         'seq', 1, 'code', 'distance_fare', 'kind', 'fare',
         'i18n_key', 'price.line.transfer', 'amount_rappen', 6
       )),
       jsonb_build_object('cancellation_tiers', '[]'::jsonb, 'free_cancel_hours', 24,
                          'airport_waiting_minutes', 60, 'city_waiting_minutes', 15,
                          'settings_version_id', 1,
                          'modification_deadline_hours', 24,
                          'min_advance_minutes', 180,
                          'policy_doc', 'test',
                          'vat_rate_bps', 7,
                          'extras', jsonb_build_array('child_seat')),
       cm.booking_id, 6, 0, 0, 6,
       now() + interval '30 minutes', now() + interval '30 minutes'
  from cm;

update public.bookings set price_snapshot_id =
  (select id from public.price_snapshots where engine_version = 'conf-mail@s1')
 where id = (select booking_id from cm);

insert into public.booking_payments (
  booking_id, snapshot_id, stripe_payment_intent_id, stripe_checkout_session_id,
  charged_rappen, status
)
select cm.booking_id, ps.id, 'cs_conf_mail_1', 'cs_conf_mail_1', 6, 'requires_payment'
  from cm, public.price_snapshots ps where ps.engine_version = 'conf-mail@s1';

-- Before settle: no captured payment, so nothing is missing a confirmation.
set local role vamos_system;
select is(
  (select count(*)::int from public.notification_confirmation_missing('-1 minute'::interval)
    where booking_id = (select booking_id from cm)),
  0,
  'missing sweep: an unpaid booking is not listed'
);

-- Settle as the Worker does (10th argument: presentment currency, lower case from Stripe).
select lives_ok(
  $$ select * from public.checkout_payment_settle(
       'evt_conf_mail_1', 'cs_conf_mail_1', 'pi_conf_mail_1', 'succeeded',
       null, null, null, null, null, 'chf') $$,
  'vamos_system settles the payment through the 10-argument RPC'
);

create temporary table cm_mail as
select * from public.checkout_booking_for_email((select booking_id from cm));
reset role;

select is((select count(*)::int from cm_mail), 1, 'email RPC returns one row for the booking');
select isnt((select lines from cm_mail), null, 'email RPC: lines is not null');
select is((select jsonb_array_length(lines) from cm_mail), 1, 'email RPC: lines carries the snapshot line');
select is((select policy_extras from cm_mail), '["child_seat"]'::jsonb, 'email RPC: policy_extras from policy.extras');
select is((select vehicle_class_name from cm_mail), 'Conf-mail class', 'email RPC: vehicle_class_name');
select is((select vehicle_class_slug from cm_mail), 'first', 'email RPC: vehicle_class_slug kept');
select is((select vat_rate_bps from cm_mail), 7, 'email RPC: vat_rate_bps from the snapshot policy');
select is((select coupon_code from cm_mail), null, 'email RPC: no coupon code');
select is((select coupon_rappen from cm_mail), null::bigint, 'email RPC: coupon_rappen null when no coupon');
select is((select charged_rappen from cm_mail), 6::bigint, 'email RPC: charged_rappen from the succeeded payment');
select is((select presentment_currency from cm_mail), 'CHF', 'email RPC: presentment_currency upper-cased');
select is((select contact_email from cm_mail), 'conf-mail-booking@example.test', 'email RPC: contact_email kept');
select is((select pickup_text from cm_mail), 'ZRH', 'email RPC: first-leg pickup kept');

select is(
  (select status::text from public.bookings where id = (select booking_id from cm)),
  'confirmed',
  'settle confirmed the booking'
);

-- Paid, no claim: the hourly sweep must see it.
set local role vamos_system;
select is(
  (select count(*)::int from public.notification_confirmation_missing('-1 minute'::interval)
    where booking_id = (select booking_id from cm)),
  1,
  'missing sweep: a confirmed + captured booking with no confirmation claim is listed'
);
select is(
  (select count(*)::int from public.notification_confirmation_missing('1 hour'::interval)
    where booking_id = (select booking_id from cm)),
  0,
  'missing sweep: a capture younger than the threshold is left for the live path'
);
select isnt(
  public.notification_claim((select booking_id from cm), 'confirmation', null, 'email', 'en',
                            'confirmation@2026-09-30-1'),
  null,
  'claim succeeds'
);
select is(
  (select count(*)::int from public.notification_confirmation_missing('-1 minute'::interval)
    where booking_id = (select booking_id from cm)),
  0,
  'missing sweep: once claimed the booking is no longer listed'
);
reset role;

-- Privileges -----------------------------------------------------------------------------------
select function_privs_are('public', 'notification_confirmation_missing', '{interval}'::text[],
  'anon', '{}'::text[], 'notification_confirmation_missing: anon holds no EXECUTE');
select function_privs_are('public', 'checkout_booking_for_email', '{uuid}'::text[],
  'vamos_checkout', '{}'::text[], 'checkout_booking_for_email: vamos_checkout holds no EXECUTE');

select * from finish();
rollback;
