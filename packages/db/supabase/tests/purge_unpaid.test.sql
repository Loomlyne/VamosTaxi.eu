-- purge_unpaid.test.sql
--
-- Plan 26.3-07 Task 1 (D-25, D-45, T-26.3-07-01..03, -07). Proves purge_unpaid_booking deletes only
-- an eligible unpaid booking, leaves exactly one non-PII audit line, that the append-only
-- carve-out stays closed for every other caller/row/state, and that checkout_expire_unpaid no
-- longer cancels a pending booking that has no pay link. Synthetic rappen only.
begin;
select plan(29);

insert into public.vehicle_classes (slug, passenger_capacity, luggage_capacity)
values ('pu-first', 3, 3);

insert into public.rate_versions (slug, label)
values ('pu-rv', 'Purge unpaid fixture');

insert into public.distance_rates (
  rate_version_id, vehicle_class_id, max_pax, base_fare_rappen, per_km_rappen, min_fare_rappen
)
select rv.id, vc.id, 3, 1, 2, 3
  from public.rate_versions rv, public.vehicle_classes vc
 where rv.slug = 'pu-rv'
   and vc.slug = 'pu-first';

update public.rate_versions set status = 'live' where slug = 'pu-rv';


create temporary table pu_fx as
select
  vc.id as vehicle_class_id,
  rv.id as rate_version_id,
  sv.id as settings_version_id,
  now() + interval '45 minutes' as lock_exp,
  now() + interval '30 days' as token_expires_at
from public.vehicle_classes vc
join public.rate_versions rv on rv.slug = 'pu-rv'
join public.settings_versions sv on sv.slug = 'launch-baseline'
where vc.slug = 'pu-first';
grant select on pu_fx to public;

create function pg_temp.pu_snapshot()
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'vehicle_class_id', fx.vehicle_class_id,
    'rate_version_id', fx.rate_version_id,
    'settings_version_id', fx.settings_version_id,
    'engine_version', 'quote-engine@purge-unpaid',
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
      'policy_doc', 'purge-unpaid'
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
  from pu_fx fx
$$;
grant execute on function pg_temp.pu_snapshot() to public;

create function pg_temp.pu_legs(p_scheduled_at timestamptz)
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
  from pu_fx fx
$$;
grant execute on function pg_temp.pu_legs(timestamptz) to public;

create function pg_temp.pu_book(
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
        'contact_name', 'Purge Guest',
        'contact_email', p_email,
        'contact_phone', '+417****7082'
      ),
      p_locale => 'en',
      p_display_currency => 'CHF',
      p_snapshot => pg_temp.pu_snapshot(),
      p_legs => pg_temp.pu_legs(p_scheduled_at),
      p_coupon_id => p_coupon_id,
      p_coupon_code => p_coupon_code,
      p_manage_token_hash => p_hash,
      p_manage_token_expires_at => (select token_expires_at from pu_fx),
      p_stripe_payment_intent_id => p_pi,
      p_stripe_checkout_session_id => p_cs,
      p_charged_rappen => 6,
      p_actor_customer_id => null
    )
$$;
grant execute on function pg_temp.pu_book(
  uuid, text, text, text, bytea, text, timestamptz, int8, text
) to public;


-- Bookings ---------------------------------------------------------------------------------
set local role vamos_checkout;
create temporary table pu_a as select * from pg_temp.pu_book('40000000-0000-4000-8000-000000000001'::uuid,'pu-a','cs_pu_a','cs_pu_a',decode(repeat('b1',32),'hex'),'pu-a@example.test', now()+interval '3 days');
create temporary table pu_paid as select * from pg_temp.pu_book('40000000-0000-4000-8000-000000000002'::uuid,'pu-paid','cs_pu_paid','cs_pu_paid',decode(repeat('b2',32),'hex'),'pu-paid@example.test', now()+interval '3 days');
create temporary table pu_link as select * from pg_temp.pu_book('40000000-0000-4000-8000-000000000003'::uuid,'pu-link','cs_pu_link','cs_pu_link',decode(repeat('b3',32),'hex'),'pu-link@example.test', now()+interval '3 days');
create temporary table pu_note as select * from pg_temp.pu_book('40000000-0000-4000-8000-000000000004'::uuid,'pu-note','cs_pu_note','cs_pu_note',decode(repeat('b4',32),'hex'),'pu-note@example.test', now()+interval '3 days');
create temporary table pu_exp as select * from pg_temp.pu_book('40000000-0000-4000-8000-000000000005'::uuid,'pu-exp','cs_pu_exp','cs_pu_exp',decode(repeat('b5',32),'hex'),'pu-exp@example.test', now()+interval '3 days');
create temporary table pu_explink as select * from pg_temp.pu_book('40000000-0000-4000-8000-000000000006'::uuid,'pu-explink','cs_pu_explink','cs_pu_explink',decode(repeat('b6',32),'hex'),'pu-explink@example.test', now()+interval '3 days');
reset role;
grant select on pu_a, pu_paid, pu_link, pu_note, pu_exp, pu_explink to public;

-- Make three of them ineligible, and back-date two locks (replica role skips the guard triggers).
set local session_replication_role = replica;
update public.booking_payments set status = 'succeeded', captured_at = now() where booking_id = (select booking_id from pu_paid);
update public.bookings set pay_link_sent_at = now() where id in (select booking_id from pu_link union select booking_id from pu_explink);
update public.price_snapshots set quote_lock_expires_at = now() - interval '2 hours'
 where booking_id in (select booking_id from pu_exp union select booking_id from pu_explink);
set local session_replication_role = origin;
insert into public.booking_notifications (booking_id, kind, locale, dedupe_key)
select booking_id, 'confirmation', 'en', 'pu-note-key' from pu_note;

-- Grants ---------------------------------------------------------------------------------
select function_privs_are('public','purge_unpaid_booking','{uuid,text}'::text[],'anon','{}'::text[],'purge: anon has no EXECUTE');
select function_privs_are('public','purge_unpaid_booking','{uuid,text}'::text[],'authenticated','{}'::text[],'purge: authenticated has no EXECUTE');
select function_privs_are('public','purge_unpaid_booking','{uuid,text}'::text[],'vamos_system','{EXECUTE}'::text[],'purge: vamos_system has EXECUTE');
select function_privs_are('public','purge_candidates','{interval}'::text[],'vamos_checkout','{}'::text[],'candidates: vamos_checkout has no EXECUTE');
select function_privs_are('public','purge_candidates','{interval}'::text[],'vamos_system','{EXECUTE}'::text[],'candidates: vamos_system has EXECUTE');

-- Candidates: a=eligible, exp=eligible; paid/link/note/explink not ---------------------------
select is((select count(*)::int from public.purge_candidates('-1 minute'::interval)
            where booking_id in (select booking_id from pu_a union select booking_id from pu_exp)), 2,
  'candidates: both eligible bookings listed');
select is((select count(*)::int from public.purge_candidates('-1 minute'::interval)
            where booking_id in (select booking_id from pu_paid union select booking_id from pu_link union select booking_id from pu_note union select booking_id from pu_explink)), 0,
  'candidates: paid, pay-link and notified bookings never listed');
select is((select session_ids from public.purge_candidates('-1 minute'::interval) where booking_id = (select booking_id from pu_a)),
  array['cs_pu_a'], 'candidates: carries the Stripe session ids');
select is((select count(*)::int from public.purge_candidates('1 day'::interval) where booking_id = (select booking_id from pu_a)), 0,
  'candidates: age filter respected');

-- checkout_expire_unpaid: no-pay-link row is left pending, pay-link row is cancelled ---------
create temporary table pu_expire as select * from public.checkout_expire_unpaid();
select is((select count(*)::int from pu_expire where booking_id = (select booking_id from pu_exp)), 0,
  'expire: expired-lock booking without a pay link is not returned');
select is((select status::text from public.bookings where id = (select booking_id from pu_exp)), 'pending',
  'expire: it stays pending until purged');
select is((select status::text from public.bookings where id = (select booking_id from pu_explink)), 'cancelled',
  'expire: expired pay-link booking is still cancelled');

-- Purge of an eligible booking ------------------------------------------------------------
set local role vamos_checkout;
select is(public.purge_unpaid_booking((select booking_id from pu_a), 'unpaid_expired'), true, 'purge: eligible booking returns true');
reset role;
select is((select count(*)::int from public.bookings where id = (select booking_id from pu_a)), 0, 'purge: booking row gone');
select is((select count(*)::int from public.price_snapshots where booking_id = (select booking_id from pu_a)), 0, 'purge: snapshots gone');
select is((select count(*)::int from public.booking_payments where booking_id = (select booking_id from pu_a))
        + (select count(*)::int from public.booking_legs where booking_id = (select booking_id from pu_a))
        + (select count(*)::int from public.booking_events where booking_id = (select booking_id from pu_a))
        + (select count(*)::int from public.booking_access_tokens where booking_id = (select booking_id from pu_a)), 0,
  'purge: payments, legs, events and tokens gone');
select is((select count(*)::int from public.audit_log where table_name = 'bookings' and action = 'delete'
            and record_id = (select booking_id::text from pu_a)), 1, 'purge: exactly one audit row');
select is((select array_agg(k order by k) from public.audit_log a, jsonb_object_keys(a.before_value) k
            where a.table_name = 'bookings' and a.record_id = (select booking_id::text from pu_a)),
  array['created_at','deleted_at','reason','reference'], 'purge: audit before_value has only the four non-PII keys');
select is((select before_value ->> 'reason' from public.audit_log where record_id = (select booking_id::text from pu_a)), 'unpaid_expired', 'purge: audit reason recorded');

-- Refusals --------------------------------------------------------------------------------
select is(public.purge_unpaid_booking((select booking_id from pu_paid), 'unpaid_expired'), false, 'purge: paid booking refused');
select is(public.purge_unpaid_booking((select booking_id from pu_link), 'unpaid_expired'), false, 'purge: pay-link booking refused');
select is(public.purge_unpaid_booking((select booking_id from pu_note), 'unpaid_expired'), false, 'purge: notified booking refused');
select is(public.purge_unpaid_booking((select booking_id from pu_explink), 'superseded'), false, 'purge: cancelled booking refused');
select is((select count(*)::int from public.bookings where id in (select booking_id from pu_paid union select booking_id from pu_link union select booking_id from pu_note)), 3,
  'purge: refused bookings untouched');
select throws_ok($$ select public.purge_unpaid_booking(gen_random_uuid(), 'because') $$, '22023', null, 'purge: unknown reason throws');

-- Carve-out closed ------------------------------------------------------------------------
select set_config('vamos.purge_unpaid', 'on', true);
select throws_ok(format($$ delete from public.price_snapshots where booking_id = %L $$, (select booking_id from pu_paid)),
  '23001', null, 'closed: flag on, paid booking snapshot delete throws');
select throws_ok(format($$ delete from public.booking_events where booking_id = %L $$, (select booking_id from pu_link)),
  '23001', null, 'closed: flag on, pay-link booking event delete throws');
select throws_ok($$ delete from public.audit_log $$, '23001', null, 'closed: flag on, audit_log delete throws');
select set_config('vamos.purge_unpaid', 'off', true);
select throws_ok(format($$ delete from public.price_snapshots where booking_id = %L $$, (select booking_id from pu_exp)),
  '23001', null, 'closed: flag off, even an eligible booking snapshot delete throws');

select * from finish();
rollback;
