-- webhook_ordering.test.sql
--
-- Complements settlement_rpcs.test.sql (plan 07-03). That file asserts
-- privileges, one-success, and a single superseded pair. This file exists
-- for the sequences that need two or three events: duplicate delivery,
-- out-of-order vs in-order, two-intents, no-double-send.
-- Synthetic figures, rolled back at the end of this file -- never a real CHF amount (D-34).
begin;
select plan(14);

insert into public.vehicle_classes (slug, passenger_capacity, luggage_capacity)
values ('first', 3, 3);

insert into public.rate_versions (slug, label)
values ('wh-ord-rv', 'Webhook ordering fixture');

-- Synthetic figures, rolled back at the end of this file -- never a real CHF amount (D-34).
insert into public.distance_rates (
  rate_version_id, vehicle_class_id, max_pax, base_fare_rappen, per_km_rappen, min_fare_rappen
)
select rv.id, vc.id, 3, 1, 2, 3
  from public.rate_versions rv, public.vehicle_classes vc
 where rv.slug = 'wh-ord-rv'
   and vc.slug = 'first';

update public.rate_versions set status = 'live' where slug = 'wh-ord-rv';

create temporary table wo_fx as
select
  vc.id as vehicle_class_id,
  rv.id as rate_version_id,
  sv.id as settings_version_id,
  now() + interval '45 minutes' as lock_exp,
  now() + interval '30 days' as token_expires_at,
  jsonb_build_object(
    'cancellation_tiers', '[]'::jsonb,
    'free_cancel_hours', 24,
    'airport_waiting_minutes', 60,
    'city_waiting_minutes', 15,
    'settings_version_id', sv.id,
    'modification_deadline_hours', 24,
    'min_advance_minutes', 180,
    'policy_doc', 'wh-ord'
  ) as policy,
  jsonb_build_array(jsonb_build_object(
    'seq', 1, 'code', 'distance_fare', 'kind', 'fare',
    'i18n_key', 'price.line.distance', 'amount_rappen', 6
  )) as lines,
  jsonb_build_array(jsonb_build_object(
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
    'scheduled_at', (now() + interval '3 days')::text,
    'scheduled_local', to_char(now() + interval '3 days', 'YYYY-MM-DD"T"HH24:MI'),
    'flight_no', null,
    'vehicle_class_id', vc.id,
    'pax', 1,
    'bags', 0,
    'estimated_duration_minutes', 25,
    'duration_min', 25,
    'distance_km', 12.5,
    'leg_subtotal_rappen', 6,
    'booking_leg_id', null
  )) as legs
from public.vehicle_classes vc
join public.rate_versions rv on rv.slug = 'wh-ord-rv'
join public.settings_versions sv on sv.slug = 'launch-baseline'
where vc.slug = 'first';
grant select on wo_fx to public;

create function pg_temp.wo_snapshot()
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'vehicle_class_id', fx.vehicle_class_id,
    'rate_version_id', fx.rate_version_id,
    'settings_version_id', fx.settings_version_id,
    'engine_version', 'quote-engine@wh-ord',
    'lock_exp', fx.lock_exp,
    'pax', 1,
    'bags', 0,
    'lines', fx.lines,
    'policy', fx.policy,
    'shown_alternatives', '[]'::jsonb,
    'display_currency', chr(67)||chr(72)||chr(70),
    'source', 'web',
    'subtotal_rappen', 6,
    'surcharges_rappen', 0,
    'discount_rappen', 0,
    'total_rappen', 6,
    'distance_km', 12.5,
    'duration_min', 25
  )
  from wo_fx fx
$$;
grant execute on function pg_temp.wo_snapshot() to public;

create function pg_temp.wo_book(p_quote_id uuid, p_key text, p_pi text, p_cs text, p_hash bytea)
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
        'contact_name', 'Webhook Ord Guest',
        'contact_email', 'wh-ord@example.test',
        'contact_phone', '+417****7082'
      ),
      p_locale => 'en',
      p_display_currency => chr(67)||chr(72)||chr(70),
      p_snapshot => pg_temp.wo_snapshot(),
      p_legs => (select legs from wo_fx),
      p_coupon_id => null,
      p_coupon_code => null,
      p_manage_token_hash => p_hash,
      p_manage_token_expires_at => (select token_expires_at from wo_fx),
      p_stripe_payment_intent_id => p_pi,
      p_stripe_checkout_session_id => p_cs,
      p_charged_rappen => 6,
      p_actor_customer_id => null
    )
$$;
grant execute on function pg_temp.wo_book(uuid, text, text, text, bytea) to public;

create temporary table wo_out (
  booking_id uuid,
  reference text,
  snapshot_id bigint,
  payment_id bigint,
  replayed boolean
);
grant all on wo_out to public;

set local role vamos_checkout;
insert into wo_out
select * from pg_temp.wo_book(
  '00000000-0000-4000-8000-000000000501'::uuid,
  'wh-ord-1',
  'pi_wh_ord_1',
  'cs_wh_ord_1',
  decode('11', 'hex') || decode(repeat('00', 31), 'hex')
);
reset role;

-- Duplicate delivery ----------------------------------------------------------
select is(
  public.stripe_event_record(
    'evt_wh_dup',
    'checkout.session.completed',
    timestamptz '2026-08-25 10:00:00+00',
    'cs_wh_ord_1',
    '{}'::jsonb
  ),
  true,
  'first record of evt_wh_dup inserts'
);
select is(
  public.stripe_event_record(
    'evt_wh_dup',
    'checkout.session.completed',
    timestamptz '2026-08-25 10:00:00+00',
    'cs_wh_ord_1',
    '{}'::jsonb
  ),
  false,
  'duplicate event id does not insert a second row'
);
select is(
  (select count(*)::bigint from public.stripe_events where id = 'evt_wh_dup'),
  1::bigint,
  'one stripe_events row after duplicate delivery'
);

create temporary table wo_begin1 as
  select * from public.stripe_event_begin(
    'evt_wh_dup',
    array['cs_wh_ord_1', 'pi_wh_ord_1']::text[],
    timestamptz '2026-08-25 10:00:00+00'
  );
grant all on wo_begin1 to public;

select is((select reason from wo_begin1), 'ok', 'first begin of completed is ok');

create temporary table wo_pay as
  select * from public.checkout_payment_settle(
    'evt_wh_dup',
    'cs_wh_ord_1',
    'pi_wh_ord_1',
    'succeeded',
    chr(67)||chr(72)||chr(70),
    null, null, null, null
  );
grant all on wo_pay to public;

-- Out-of-order canceled after completed --------------------------------------
select is(
  public.stripe_event_record(
    'evt_wh_old_cancel',
    'payment_intent.canceled',
    timestamptz '2026-08-25 09:00:00+00',
    'pi_wh_ord_1',
    '{}'::jsonb
  ),
  true,
  'record older canceled'
);

create temporary table wo_begin_old as
  select * from public.stripe_event_begin(
    'evt_wh_old_cancel',
    array['cs_wh_ord_1', 'pi_wh_ord_1']::text[],
    timestamptz '2026-08-25 09:00:00+00'
  );
grant all on wo_begin_old to public;

select is((select reason from wo_begin_old), 'superseded', 'older canceled is superseded');
select is(
  (select b.status::text from public.bookings b join wo_out o on o.booking_id = b.id),
  'confirmed',
  'booking stays confirmed after superseded canceled'
);

-- In-order pair on a second family -------------------------------------------
select is(
  public.stripe_event_record(
    'evt_wh_ord_cancel',
    'payment_intent.canceled',
    timestamptz '2026-08-25 08:00:00+00',
    'pi_wh_ord_other',
    '{}'::jsonb
  ),
  true,
  'record in-order canceled'
);
select is(
  public.stripe_event_record(
    'evt_wh_ord_done',
    'checkout.session.completed',
    timestamptz '2026-08-25 08:05:00+00',
    'cs_wh_ord_other',
    '{}'::jsonb
  ),
  true,
  'record in-order completed'
);

create temporary table wo_begin_in1 as
  select * from public.stripe_event_begin(
    'evt_wh_ord_cancel',
    array['cs_wh_ord_other', 'pi_wh_ord_other']::text[],
    timestamptz '2026-08-25 08:00:00+00'
  );
grant all on wo_begin_in1 to public;
select is((select reason from wo_begin_in1), 'ok', 'in-order canceled begin is ok');
select public.stripe_event_settle('evt_wh_ord_cancel', null);

create temporary table wo_begin_in2 as
  select * from public.stripe_event_begin(
    'evt_wh_ord_done',
    array['cs_wh_ord_other', 'pi_wh_ord_other']::text[],
    timestamptz '2026-08-25 08:05:00+00'
  );
grant all on wo_begin_in2 to public;
select is((select reason from wo_begin_in2), 'ok', 'in-order completed is not refused');

-- Two intents, one booking ----------------------------------------------------
select throws_ok(
  $$
    select public.checkout_payment_settle(
      'evt_wh_second',
      'cs_wh_ord_2',
      'pi_wh_ord_2',
      'succeeded',
      chr(67)||chr(72)||chr(70),
      null, null, null, null
    )
  $$,
  'P0002',
  null,
  'unknown second intent is payment_not_found, not a silent overwrite'
);

-- A real second payment row on the same booking is 23505. Insert via checkout
-- is blocked by quote_already_booked; the constraint is asserted in
-- settlement_rpcs.test.sql. Here we prove the claim gate instead.

select is(
  public.notification_claim(
    (select booking_id from wo_out),
    'confirmation',
    null,
    'email',
    'en',
    'confirmation@2026-08-25-1'
  ) is not null,
  true,
  'first notification_claim returns an id'
);
select is(
  public.notification_claim(
    (select booking_id from wo_out),
    'confirmation',
    null,
    'email',
    'en',
    'confirmation@2026-08-25-1'
  ),
  null::bigint,
  'second notification_claim for booking_id:confirmation: returns NULL'
);

select * from finish();
rollback;
