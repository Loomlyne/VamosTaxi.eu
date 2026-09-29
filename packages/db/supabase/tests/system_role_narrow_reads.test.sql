-- system_role_narrow_reads.test.sql
--
-- Quick 260929-pga (extension). vamos_system is definer-only: it has no table access outside the
-- support tables. Every raw table statement Worker code used to issue through asSystem is replaced
-- by one narrow SECURITY DEFINER function. This file proves per function: EXECUTE for vamos_system
-- only, definer with an empty search_path, the answer it gives, and that the raw table read/write
-- is still refused (42501) to vamos_system. Synthetic rows, rolled back.
begin;
select plan(48);

insert into public.vehicle_classes (slug, passenger_capacity, luggage_capacity)
values ('snr-first', 3, 3);

insert into public.rate_versions (slug, label)
values ('snr-rv', 'Worker arrays fixture');

insert into public.distance_rates (
  rate_version_id, vehicle_class_id, max_pax, base_fare_rappen, per_km_rappen, min_fare_rappen
)
select rv.id, vc.id, 3, 1, 2, 3
  from public.rate_versions rv, public.vehicle_classes vc
 where rv.slug = 'snr-rv'
   and vc.slug = 'snr-first';

update public.rate_versions set status = 'live' where slug = 'snr-rv';


create temporary table snr_fx as
select
  vc.id as vehicle_class_id,
  rv.id as rate_version_id,
  sv.id as settings_version_id,
  now() + interval '45 minutes' as lock_exp,
  now() + interval '30 days' as token_expires_at
from public.vehicle_classes vc
join public.rate_versions rv on rv.slug = 'snr-rv'
join public.settings_versions sv on sv.slug = 'launch-baseline'
where vc.slug = 'snr-first';
grant select on snr_fx to public;

create function pg_temp.snr_snapshot()
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'vehicle_class_id', fx.vehicle_class_id,
    'rate_version_id', fx.rate_version_id,
    'settings_version_id', fx.settings_version_id,
    'engine_version', 'quote-engine@worker-arrays',
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
      'policy_doc', 'worker-arrays'
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
  from snr_fx fx
$$;
grant execute on function pg_temp.snr_snapshot() to public;

create function pg_temp.snr_legs(p_scheduled_at timestamptz)
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
  from snr_fx fx
$$;
grant execute on function pg_temp.snr_legs(timestamptz) to public;

create function pg_temp.snr_book(
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
        'contact_name', 'Array Guest',
        'contact_email', p_email,
        'contact_phone', '+417****7082'
      ),
      p_locale => 'en',
      p_display_currency => 'CHF',
      p_snapshot => pg_temp.snr_snapshot(),
      p_legs => pg_temp.snr_legs(p_scheduled_at),
      p_coupon_id => p_coupon_id,
      p_coupon_code => p_coupon_code,
      p_manage_token_hash => p_hash,
      p_manage_token_expires_at => (select token_expires_at from snr_fx),
      p_stripe_payment_intent_id => p_pi,
      p_stripe_checkout_session_id => p_cs,
      p_charged_rappen => 6,
      p_actor_customer_id => null
    )
$$;
grant execute on function pg_temp.snr_book(
  uuid, text, text, text, bytea, text, timestamptz, int8, text
) to public;

-- Bookings ---------------------------------------------------------------------------------
set local role vamos_checkout;
create temporary table snr_a as select * from pg_temp.snr_book('60000000-0000-4000-8000-000000000001'::uuid,'snr-a','cs_snr_a','cs_snr_a',decode(repeat('d1',32),'hex'),'snr-a@example.test', now()+interval '3 days');
create temporary table snr_b as select * from pg_temp.snr_book('60000000-0000-4000-8000-000000000002'::uuid,'snr-b','cs_snr_b','cs_snr_b',decode(repeat('d2',32),'hex'),'snr-b@example.test', now()+interval '3 days');
reset role;
create temporary table snr_a2 as select * from snr_a;
create temporary table snr_b2 as select * from snr_b;
grant select on snr_a2, snr_b2 to public;
-- (snr_a and snr_b belong to vamos_checkout; the copies below are owned by the test user)
-- MARK
create temporary table snr_ref as
  select (select reference from public.bookings where id = (select booking_id from snr_a2)) as ref_a,
         (select reference from public.bookings where id = (select booking_id from snr_b2)) as ref_b;
grant select on snr_ref to public;

set local session_replication_role = replica;
update public.booking_payments set status = 'succeeded', captured_at = now() where booking_id = (select booking_id from snr_b2);
set local session_replication_role = origin;

insert into public.booking_edit_requests (booking_id, actor, quote_snapshot_id, status, extra_session_id, payload)
select booking_id, 'customer', snapshot_id, 'requested', 'cs_snr_extra', '{"scheduled_local":"2031-01-01T10:00"}'::jsonb from snr_a2;

-- Grants, definer, empty search_path ------------------------------------------------------
create temporary table snr_fns as
  select f::regprocedure as fn from unnest(array[
    'public.paid_cancel_mail_read(uuid)', 'public.booking_captured_payment(uuid)',
    'public.price_changed_unpaid_contacts()', 'public.expired_booking_contact(uuid)',
    'public.must_fix_trip_read(text)', 'public.booking_snapshot_policy(uuid)',
    'public.phone_booking_unpaid_read(text)', 'public.manage_booking_review_state(uuid)',
    'public.edit_request_snapshot_total(bigint)', 'public.edit_request_booking_contact(uuid)',
    'public.edit_request_pending_payload(text)', 'public.booking_trip_for_mail(uuid)',
    'public.edit_request_extra_session(text)', 'public.booking_refund_processing_mark(uuid)',
    'public.edit_request_refuse(text)', 'public.booking_flight_write(uuid,text,text,uuid)'
  ]) f;
grant select on snr_fns to public;
select is((select count(*)::int from snr_fns), 16, 'sixteen narrow functions');
select is((select count(*)::int from snr_fns where has_function_privilege('vamos_system', fn, 'execute')), 16, 'vamos_system has EXECUTE on all');
select is((select count(*)::int from snr_fns, unnest(array['vamos_edge','anon','authenticated','vamos_checkout','vamos_guest']) r
            where has_function_privilege(r, fn, 'execute')), 0, 'no other role has EXECUTE on any');
select is((select count(*)::int from snr_fns join pg_proc p on p.oid = fn
            where p.prosecdef and p.proconfig = array['search_path=""']), 16, 'all definer with an empty search_path');

-- Raw reads and the writes stay refused to vamos_system ------------------------------------
set local role vamos_system;
select throws_ok($$select 1 from public.bookings limit 1$$, '42501', null, 'raw: bookings');
select throws_ok($$select 1 from public.booking_legs limit 1$$, '42501', null, 'raw: booking_legs');
select throws_ok($$select 1 from public.chauffeurs limit 1$$, '42501', null, 'raw: chauffeurs');
select throws_ok($$select 1 from public.booking_payments limit 1$$, '42501', null, 'raw: booking_payments');
select throws_ok($$select 1 from public.price_snapshots limit 1$$, '42501', null, 'raw: price_snapshots');
select throws_ok($$select 1 from public.booking_edit_requests limit 1$$, '42501', null, 'raw: booking_edit_requests');
select throws_ok($$select 1 from public.reviews limit 1$$, '42501', null, 'raw: reviews');
select throws_ok($$select 1 from public.vehicle_classes limit 1$$, '42501', null, 'raw: vehicle_classes');
select throws_ok($$update public.bookings set refund_status = 'processing'$$, '42501', null, 'raw: update bookings');
select throws_ok($$update public.booking_legs set flight_no = 'X'$$, '42501', null, 'raw: update booking_legs');
select throws_ok($$update public.booking_edit_requests set status = 'superseded'$$, '42501', null, 'raw: update booking_edit_requests');
select throws_ok($$insert into public.booking_events (booking_id, kind, actor_kind) select id, 'x', 'guest' from public.bookings$$, '42501', null, 'raw: insert booking_events');

-- The functions answer as vamos_system -----------------------------------------------------
select is((select reference = (select ref_a from snr_ref) and pickup_text = 'ZRH Airport' and assigned_chauffeur_id is null and chauffeur_email is null
             from public.paid_cancel_mail_read((select booking_id from snr_a2))), true, 'paid_cancel_mail_read: first leg, no driver');
select is((select count(*)::int from public.paid_cancel_mail_read('00000000-0000-4000-8000-000000000000')), 0, 'paid_cancel_mail_read: unknown booking is empty');

select is((select charged_rappen from public.booking_captured_payment((select booking_id from snr_b2))), 6, 'booking_captured_payment: paid booking');
select is((select count(*)::int from public.booking_captured_payment((select booking_id from snr_a2))), 0, 'booking_captured_payment: unpaid booking is empty');

select is((select count(*)::int from public.price_changed_unpaid_contacts() where contact_email = 'snr-a@example.test' and locked_rappen = 6), 1, 'price_changed_unpaid_contacts: pending booking with its locked total');
select is((select count(*)::int from public.price_changed_unpaid_contacts() where contact_email = 'snr-b@example.test'), 1, 'price_changed_unpaid_contacts: status filter is pending (fixture rows are pending)');

select is((select locked_rappen from public.expired_booking_contact((select booking_id from snr_a2))), 6, 'expired_booking_contact: locked total');
select is((select contact_email from public.expired_booking_contact((select booking_id from snr_a2))), 'snr-a@example.test', 'expired_booking_contact: e-mail');

select is((select count(*)::int from public.must_fix_trip_read((select ref_a from snr_ref))), 1, 'must_fix_trip_read: by reference');
select is((select count(*)::int from public.must_fix_trip_read((select booking_id::text from snr_a2))), 1, 'must_fix_trip_read: by id');
select is((select count(*)::int from public.must_fix_trip_read('VT-NOPE')), 0, 'must_fix_trip_read: unknown key is empty');

select is((select public.booking_snapshot_policy((select booking_id from snr_a2))->>'free_cancel_hours'), '24', 'booking_snapshot_policy: policy jsonb');

select is((select status || '|' || class_slug || '|' || pax::text || '|' || charged_rappen::text || '|' || stripe_checkout_session_id
             from public.phone_booking_unpaid_read((select ref_a from snr_ref))),
  'pending|snr-first|1|6|cs_snr_a', 'phone_booking_unpaid_read: booking, class, leg, latest payment');
select is((select snap_total_rappen from public.phone_booking_unpaid_read((select booking_id::text from snr_a2))), 6, 'phone_booking_unpaid_read: by id, snapshot total');
select is((select count(*)::int from public.phone_booking_unpaid_read('VT-NOPE')), 0, 'phone_booking_unpaid_read: unknown key is empty');
select is((select captured_at is not null from public.phone_booking_unpaid_read((select ref_b from snr_ref))), true, 'phone_booking_unpaid_read: captured payment visible');

select is((select review_submitted from public.manage_booking_review_state((select booking_id from snr_a2))), false, 'manage_booking_review_state: no review');

select is(public.edit_request_snapshot_total((select snapshot_id from snr_a2)), 6, 'edit_request_snapshot_total');
select is((select contact_email from public.edit_request_booking_contact((select booking_id from snr_a2))), 'snr-a@example.test', 'edit_request_booking_contact');
select is((select payload->>'scheduled_local' from public.edit_request_pending_payload((select ref_a from snr_ref))), '2031-01-01T10:00', 'edit_request_pending_payload');
select is((select extra_session_id from public.edit_request_extra_session((select ref_a from snr_ref))), 'cs_snr_extra', 'edit_request_extra_session');
select is((select booking_leg_id is not null and pickup_text = 'ZRH Airport' from public.booking_trip_for_mail((select booking_id from snr_a2))), true, 'booking_trip_for_mail: leg 1');

select lives_ok($$select public.booking_refund_processing_mark((select booking_id from snr_b2))$$, 'booking_refund_processing_mark runs');
select is((select reference from public.booking_flight_write((select booking_id from snr_a2), 'LX 318', 'guest', null)), (select ref_a from snr_ref), 'booking_flight_write: returns the trip for the mail');
select throws_ok($$select * from public.booking_flight_write('00000000-0000-4000-8000-000000000000', 'LX 1', 'guest', null)$$, 'P0002', null, 'booking_flight_write: unknown booking raises P0002');

select is((select count(*)::int from public.edit_request_refuse('VT-NOPE')), 0, 'edit_request_refuse: unknown key is empty');
select is((select request_id is not null from public.edit_request_refuse((select ref_a from snr_ref))), true, 'edit_request_refuse: supersedes the pending request');
select is((select count(*)::int from public.edit_request_refuse((select ref_a from snr_ref))), 0, 'edit_request_refuse: nothing pending the second time');
reset role;

-- Effects (checked as the owner) -----------------------------------------------------------
select is((select refund_status from public.bookings where id = (select booking_id from snr_b2)), 'processing', 'effect: refund_status is processing');
select is((select flight_no from public.booking_legs where booking_id = (select booking_id from snr_a2)), 'LX 318', 'effect: flight number on the first leg');
select is((select count(*)::int from public.booking_events where booking_id = (select booking_id from snr_a2) and kind = 'booking.modified' and actor_kind = 'guest' and payload->>'flight_no' = 'LX 318'), 1, 'effect: one booking.modified event');
select is((select status from public.booking_edit_requests where booking_id = (select booking_id from snr_a2)), 'superseded', 'effect: request superseded');

select * from finish();
rollback;
