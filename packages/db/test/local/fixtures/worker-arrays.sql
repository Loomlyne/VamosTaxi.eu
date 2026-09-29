-- packages/db/test/local/fixtures/worker-arrays.sql
--
-- Fixture for worker-arrays.test.ts. Runs inside one rolled-back transaction. Synthetic rappen only,
-- adapted from supabase/tests/purge_unpaid.test.sql and settle_revive.test.sql (same booking
-- factory, prefix pga).

insert into public.vehicle_classes (slug, passenger_capacity, luggage_capacity)
values ('pga-first', 3, 3);

insert into public.rate_versions (slug, label)
values ('pga-rv', 'Worker arrays fixture');

insert into public.distance_rates (
  rate_version_id, vehicle_class_id, max_pax, base_fare_rappen, per_km_rappen, min_fare_rappen
)
select rv.id, vc.id, 3, 1, 2, 3
  from public.rate_versions rv, public.vehicle_classes vc
 where rv.slug = 'pga-rv'
   and vc.slug = 'pga-first';

update public.rate_versions set status = 'live' where slug = 'pga-rv';


create temporary table pga_fx as
select
  vc.id as vehicle_class_id,
  rv.id as rate_version_id,
  sv.id as settings_version_id,
  now() + interval '45 minutes' as lock_exp,
  now() + interval '30 days' as token_expires_at
from public.vehicle_classes vc
join public.rate_versions rv on rv.slug = 'pga-rv'
join public.settings_versions sv on sv.slug = 'launch-baseline'
where vc.slug = 'pga-first';
grant select on pga_fx to public;

create function pg_temp.pga_snapshot()
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
  from pga_fx fx
$$;
grant execute on function pg_temp.pga_snapshot() to public;

create function pg_temp.pga_legs(p_scheduled_at timestamptz)
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
  from pga_fx fx
$$;
grant execute on function pg_temp.pga_legs(timestamptz) to public;

create function pg_temp.pga_book(
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
      p_snapshot => pg_temp.pga_snapshot(),
      p_legs => pg_temp.pga_legs(p_scheduled_at),
      p_coupon_id => p_coupon_id,
      p_coupon_code => p_coupon_code,
      p_manage_token_hash => p_hash,
      p_manage_token_expires_at => (select token_expires_at from pga_fx),
      p_stripe_payment_intent_id => p_pi,
      p_stripe_checkout_session_id => p_cs,
      p_charged_rappen => 6,
      p_actor_customer_id => null
    )
$$;
grant execute on function pg_temp.pga_book(
  uuid, text, text, text, bytea, text, timestamptz, int8, text
) to public;

-- Bookings ---------------------------------------------------------------------------------
set local role vamos_checkout;
-- eligible unpaid booking with TWO Stripe sessions (purge_candidates, checkout_booking_session_ids)
create temporary table pga_a as select * from pg_temp.pga_book('50000000-0000-4000-8000-000000000001'::uuid,'pga-a','cs_pga_a1','cs_pga_a1',decode(repeat('c1',32),'hex'),'pga-a@example.test', now()+interval '3 days');
-- pay-link booking whose lock has expired (checkout_expire_unpaid)
create temporary table pga_link as select * from pg_temp.pga_book('50000000-0000-4000-8000-000000000002'::uuid,'pga-link','cs_pga_l1','cs_pga_l1',decode(repeat('c2',32),'hex'),'pga-link@example.test', now()+interval '3 days');
-- booking settled on one session while a sibling stays open (checkout_payment_settle)
create temporary table pga_settle as select * from pg_temp.pga_book('50000000-0000-4000-8000-000000000003'::uuid,'pga-settle','cs_pga_s1','cs_pga_s1',decode(repeat('c3',32),'hex'),'pga-settle@example.test', now()+interval '3 days');
-- booking with an unsent claim (notification_sweep)
create temporary table pga_note as select * from pg_temp.pga_book('50000000-0000-4000-8000-000000000004'::uuid,'pga-note','cs_pga_n1','cs_pga_n1',decode(repeat('c4',32),'hex'),'pga-note@example.test', now()+interval '3 days');
reset role;
grant select on pga_a, pga_link, pga_settle, pga_note to public;

insert into public.booking_payments (
  booking_id, snapshot_id, stripe_payment_intent_id, stripe_checkout_session_id,
  charged_rappen, charged_currency, status
)
select booking_id, snapshot_id, 'cs_pga_a2', 'cs_pga_a2', 6, 'CHF', 'requires_payment' from pga_a
union all
select booking_id, snapshot_id, 'cs_pga_s2', 'cs_pga_s2', 6, 'CHF', 'requires_payment' from pga_settle;

set local session_replication_role = replica;
update public.bookings set pay_link_sent_at = now() where id = (select booking_id from pga_link);
update public.price_snapshots set quote_lock_expires_at = now() - interval '2 hours'
 where booking_id = (select booking_id from pga_link);
set local session_replication_role = origin;

insert into public.booking_notifications (booking_id, kind, locale, dedupe_key)
select booking_id, 'confirmation', 'en', 'pga-note-key' from pga_note;
