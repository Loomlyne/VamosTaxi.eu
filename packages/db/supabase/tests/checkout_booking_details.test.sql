-- checkout_booking_details.test.sql
--
-- Plan 26.3-07 Task 2 (D-15, D-24, D-25, T-26.3-07-05): checkout_set_booking_details is
-- pending-only, trims, caps lengths, is vamos_checkout only; checkout_booking_session_ids lists
-- every session of a booking. Synthetic rappen only.
begin;
select plan(19);

insert into public.vehicle_classes (slug, passenger_capacity, luggage_capacity)
values ('cd-first', 3, 3);

insert into public.rate_versions (slug, label)
values ('cd-rv', 'Booking details fixture');

insert into public.distance_rates (
  rate_version_id, vehicle_class_id, max_pax, base_fare_rappen, per_km_rappen, min_fare_rappen
)
select rv.id, vc.id, 3, 1, 2, 3
  from public.rate_versions rv, public.vehicle_classes vc
 where rv.slug = 'cd-rv'
   and vc.slug = 'cd-first';

update public.rate_versions set status = 'live' where slug = 'cd-rv';


create temporary table cd_fx as
select
  vc.id as vehicle_class_id,
  rv.id as rate_version_id,
  sv.id as settings_version_id,
  now() + interval '45 minutes' as lock_exp,
  now() + interval '30 days' as token_expires_at
from public.vehicle_classes vc
join public.rate_versions rv on rv.slug = 'cd-rv'
join public.settings_versions sv on sv.slug = 'launch-baseline'
where vc.slug = 'cd-first';
grant select on cd_fx to public;

create function pg_temp.cd_snapshot()
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'vehicle_class_id', fx.vehicle_class_id,
    'rate_version_id', fx.rate_version_id,
    'settings_version_id', fx.settings_version_id,
    'engine_version', 'quote-engine@checkout-details',
    'lock_exp', fx.lock_exp,
    'pax', 1,
    'bags', 0,
    'lines', jsonb_build_array(jsonb_build_object(
      'seq', 1, 'code', 'distance_fare', 'kind', 'fare',
      'i18n_key', 'price.line.distance', 'amount_rappen', 6
    )),
    'policy', jsonb_build_object(
      'cancellation_tiers', '[]'::jsonb,
      'free_cancel_hours', 24,
      'airport_waiting_minutes', 60,
      'city_waiting_minutes', 15,
      'settings_version_id', fx.settings_version_id,
      'modification_deadline_hours', 24,
      'min_advance_minutes', 180,
      'policy_doc', 'checkout-details'
    ),
    'shown_alternatives', '[]'::jsonb,
    'display_currency', 'CHF',
    'source', 'web',
    'subtotal_rappen', 6,
    'surcharges_rappen', 0,
    'discount_rappen', 0,
    'total_rappen', 6,
    'distance_km', 12.5,
    'duration_min', 25
  )
  from cd_fx fx
$$;
grant execute on function pg_temp.cd_snapshot() to public;

create function pg_temp.cd_legs(p_scheduled_at timestamptz)
returns jsonb
language sql
stable
as $$
  select jsonb_build_array(jsonb_build_object(
    'leg_seq', 1,
    'direction', 'outbound',
    'pickup_text', 'ZRH Airport',
    'pickup_place_id', null,
    'pickup_lat', 47.458056,
    'pickup_lng', 8.549167,
    'dropoff_text', 'Zurich HB',
    'dropoff_place_id', null,
    'dropoff_lat', 47.378177,
    'dropoff_lng', 8.540192,
    'scheduled_at', p_scheduled_at::text,
    'scheduled_local', to_char(p_scheduled_at, 'YYYY-MM-DD"T"HH24:MI'),
    'flight_no', null,
    'vehicle_class_id', fx.vehicle_class_id,
    'pax', 1,
    'bags', 0,
    'estimated_duration_minutes', 25,
    'duration_min', 25,
    'distance_km', 12.5,
    'leg_subtotal_rappen', 6,
    'booking_leg_id', null
  ))
  from cd_fx fx
$$;
grant execute on function pg_temp.cd_legs(timestamptz) to public;

create function pg_temp.cd_book(
  p_quote_id uuid,
  p_key text,
  p_pi text,
  p_cs text,
  p_hash bytea,
  p_email text,
  p_scheduled_at timestamptz,
  p_coupon_id int8 default null,
  p_coupon_code text default null
)
returns table (
  booking_id uuid,
  reference text,
  snapshot_id bigint,
  payment_id bigint,
  replayed boolean
)
language sql
volatile
as $$
  select *
    from public.checkout_create_booking(
      p_quote_id => p_quote_id,
      p_idempotency_key => p_key,
      p_contact => jsonb_build_object(
        'contact_name', 'Details Guest',
        'contact_email', p_email,
        'contact_phone', '+417****7082'
      ),
      p_locale => 'en',
      p_display_currency => 'CHF',
      p_snapshot => pg_temp.cd_snapshot(),
      p_legs => pg_temp.cd_legs(p_scheduled_at),
      p_coupon_id => p_coupon_id,
      p_coupon_code => p_coupon_code,
      p_manage_token_hash => p_hash,
      p_manage_token_expires_at => (select token_expires_at from cd_fx),
      p_stripe_payment_intent_id => p_pi,
      p_stripe_checkout_session_id => p_cs,
      p_charged_rappen => 6,
      p_actor_customer_id => null
    )
$$;
grant execute on function pg_temp.cd_book(
  uuid, text, text, text, bytea, text, timestamptz, int8, text
) to public;


set local role vamos_checkout;
create temporary table cd_a as select * from pg_temp.cd_book('50000000-0000-4000-8000-000000000001'::uuid,'cd-a','cs_cd_a','cs_cd_a',decode(repeat('c1',32),'hex'),'cd-a@example.test', now()+interval '3 days');
create temporary table cd_b as select * from pg_temp.cd_book('50000000-0000-4000-8000-000000000002'::uuid,'cd-b','cs_cd_b','cs_cd_b',decode(repeat('c2',32),'hex'),'cd-b@example.test', now()+interval '3 days');
reset role;
grant select on cd_a, cd_b to public;

insert into public.booking_payments (booking_id, snapshot_id, stripe_payment_intent_id, stripe_checkout_session_id, charged_rappen, charged_currency, status)
select booking_id, snapshot_id, 'cs_cd_a_2', 'cs_cd_a_2', 6, 'CHF', 'requires_payment' from cd_a;

select function_privs_are('public','checkout_set_booking_details','{uuid,text,text,text,text,text}'::text[],'anon','{}'::text[],'details: anon has no EXECUTE');
select function_privs_are('public','checkout_set_booking_details','{uuid,text,text,text,text,text}'::text[],'authenticated','{}'::text[],'details: authenticated has no EXECUTE');
select function_privs_are('public','checkout_set_booking_details','{uuid,text,text,text,text,text}'::text[],'vamos_checkout','{EXECUTE}'::text[],'details: vamos_checkout has EXECUTE');
select function_privs_are('public','checkout_booking_session_ids','{uuid}'::text[],'anon','{}'::text[],'sessions: anon has no EXECUTE');
select function_privs_are('public','checkout_booking_session_ids','{uuid}'::text[],'vamos_system','{EXECUTE}'::text[],'sessions: vamos_system has EXECUTE');

select is((select public.checkout_booking_session_ids((select booking_id from cd_a))), array['cs_cd_a','cs_cd_a_2'], 'sessions: both sessions of a two-payment booking');
select is((select public.checkout_booking_session_ids(gen_random_uuid())), array[]::text[], 'sessions: unknown booking gives an empty list');

set local role vamos_checkout;
select lives_ok(format($$ select public.checkout_set_booking_details(%L, '  Acme AG ', ' Bahnhofstr 1, Zurich ', ' CHE-123 ', ' Ring twice ', 'from=zrh&pax=2') $$, (select booking_id from cd_a)), 'details: pending booking accepts the fields');
reset role;
select is((select billing_kind || '|' || company_name || '|' || company_address || '|' || company_vat || '|' || note || '|' || checkout_trip_query
             from public.bookings where id = (select booking_id from cd_a)),
  'company|Acme AG|Bahnhofstr 1, Zurich|CHE-123|Ring twice|from=zrh&pax=2', 'details: trimmed values stored, billing_kind company');
set local role vamos_checkout;
select lives_ok(format($$ select public.checkout_set_booking_details(%L, '', '', '', '', '') $$, (select booking_id from cd_a)), 'details: empty company clears it');
reset role;
select is((select billing_kind || '|' || company_name from public.bookings where id = (select booking_id from cd_a)), 'individual|', 'details: empty company name is an individual booking');

set local role vamos_checkout;
select throws_ok(format($$ select public.checkout_set_booking_details(%L, %L, '', '', '', '') $$, (select booking_id from cd_a), repeat('x', 201)), '22001', null, 'caps: company name 201 refused');
select throws_ok(format($$ select public.checkout_set_booking_details(%L, '', %L, '', '', '') $$, (select booking_id from cd_a), repeat('x', 401)), '22001', null, 'caps: address 401 refused');
select throws_ok(format($$ select public.checkout_set_booking_details(%L, '', '', %L, '', '') $$, (select booking_id from cd_a), repeat('x', 41)), '22001', null, 'caps: VAT 41 refused');
select throws_ok(format($$ select public.checkout_set_booking_details(%L, '', '', '', %L, '') $$, (select booking_id from cd_a), repeat('x', 501)), '22001', null, 'caps: note 501 refused');
select throws_ok(format($$ select public.checkout_set_booking_details(%L, '', '', '', '', %L) $$, (select booking_id from cd_a), repeat('x', 2001)), '22001', null, 'caps: trip query 2001 refused');
reset role;

update public.bookings set status = 'confirmed' where id = (select booking_id from cd_b);
set local role vamos_checkout;
select throws_ok(format($$ select public.checkout_set_booking_details(%L, 'Acme', '', '', '', '') $$, (select booking_id from cd_b)), '55000', null, 'details: a confirmed booking is refused');
reset role;
select is((select company_name from public.bookings where id = (select booking_id from cd_b)), '', 'details: confirmed booking unchanged');
select is((select checkout_trip_query from public.bookings where id = (select booking_id from cd_b)), '', 'trip query column defaults to empty');

select * from finish();
rollback;
