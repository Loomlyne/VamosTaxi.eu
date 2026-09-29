-- pay_link_lines.test.sql
--
-- Plan 26.1-15 (D-20, D-20a, D-21, D-22). A sent pay link holds the booking
-- and its price for 24 hours from the moment it is sent -- one clock
-- (bookings.hold_until) for the link lookup, the charge gate trigger and the
-- unpaid-expiry cron. checkout_pay_link_state tells the recipient page why a
-- link is no longer payable: paid, refunded as a duplicate, or expired.
--
-- Time travel: now() is frozen inside one transaction, so "24 h + 1 s after
-- sending" is simulated by moving hold_until / the token expiry / the
-- snapshot clocks into the past (the snapshot through the same
-- disable/enable append-only trigger pair unpaid_cancel_session.test.sql
-- uses). Synthetic rappen integers only -- never a real CHF amount (D-13).
begin;
select plan(14);

-- Fixtures --------------------------------------------------------------------------------
insert into public.vehicle_classes (slug, passenger_capacity, luggage_capacity)
values ('pll-first', 3, 3);

insert into public.rate_versions (slug, label)
values ('pll-rv', 'Pay link hold fixture');

insert into public.distance_rates (
  rate_version_id, vehicle_class_id, max_pax, base_fare_rappen, per_km_rappen, min_fare_rappen
)
select rv.id, vc.id, 3, 1, 2, 3
  from public.rate_versions rv, public.vehicle_classes vc
 where rv.slug = 'pll-rv'
   and vc.slug = 'pll-first';

update public.rate_versions set status = 'live' where slug = 'pll-rv';

create temporary table pll_fx as
select
  vc.id as vehicle_class_id,
  rv.id as rate_version_id,
  sv.id as settings_version_id,
  now() + interval '45 minutes' as lock_exp,
  now() + interval '30 days' as token_expires_at
from public.vehicle_classes vc
join public.rate_versions rv on rv.slug = 'pll-rv'
join public.settings_versions sv on sv.slug = 'launch-baseline'
where vc.slug = 'pll-first';
grant select on pll_fx to public;

create function pg_temp.pll_snapshot()
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'vehicle_class_id', fx.vehicle_class_id,
    'rate_version_id', fx.rate_version_id,
    'settings_version_id', fx.settings_version_id,
    'engine_version', 'quote-engine@pay-link-hold',
    'lock_exp', fx.lock_exp,
    'pax', 1,
    'bags', 0,
    'lines', jsonb_build_array(
      jsonb_build_object('seq', 1, 'code', 'distance_fare', 'kind', 'fare',
        'i18n_key', 'price.line.distance', 'amount_rappen', 6),
      jsonb_build_object('seq', 2, 'code', 'child-seat', 'kind', 'surcharge',
        'i18n_key', 'price.surcharge.custom',
        'params', jsonb_build_object('name', 'Child seat', 'secret', 'x',
          'names', jsonb_build_object('en', 'Child seat', 'de', 'Kindersitz', 'fr', 'Siege enfant', 'ar', 'x', 'extra', 'no')),
        'amount_rappen', 10),
      jsonb_build_object('seq', 3, 'code', 'vat', 'kind', 'vat',
        'i18n_key', 'price.line.vat', 'params', jsonb_build_object('vatRateBps', 810), 'amount_rappen', 1)
    ),
    'policy', jsonb_build_object(
      'cancellation_tiers', '[]'::jsonb,
      'free_cancel_hours', 24,
      'airport_waiting_minutes', 60,
      'city_waiting_minutes', 15,
      'settings_version_id', fx.settings_version_id,
      'modification_deadline_hours', 24,
      'min_advance_minutes', 180,
      'policy_doc', 'pay-link-hold'
    ),
    'shown_alternatives', '[]'::jsonb,
    'display_currency', 'CHF',
    'source', 'web',
    'subtotal_rappen', 7,
    'surcharges_rappen', 10,
    'discount_rappen', 0,
    'total_rappen', 17,
    'distance_km', 12.5,
    'duration_min', 25
  )
  from pll_fx fx
$$;
grant execute on function pg_temp.pll_snapshot() to public;

create function pg_temp.pll_legs(p_scheduled_at timestamptz)
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
  from pll_fx fx
$$;
grant execute on function pg_temp.pll_legs(timestamptz) to public;

create function pg_temp.pll_book(
  p_quote_id uuid,
  p_key text,
  p_cs text,
  p_hash bytea,
  p_email text
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
        'contact_name', 'Pay Link Hold Guest',
        'contact_email', p_email,
        'contact_phone', '+41000000000'
      ),
      p_locale => 'en',
      p_display_currency => 'CHF',
      p_snapshot => pg_temp.pll_snapshot(),
      p_legs => pg_temp.pll_legs(now() + interval '3 days'),
      p_coupon_id => null,
      p_coupon_code => null,
      p_manage_token_hash => p_hash,
      p_manage_token_expires_at => (select token_expires_at from pll_fx),
      p_stripe_payment_intent_id => p_cs,
      p_stripe_checkout_session_id => p_cs,
      p_charged_rappen => 17,
      p_actor_customer_id => null
    )
$$;
grant execute on function pg_temp.pll_book(uuid, text, text, bytea, text) to public;

create function pg_temp.pll_send(p_booking_id uuid, p_hash bytea, p_expires timestamptz)
returns timestamptz
language sql
volatile
as $$
  select public.checkout_set_pay_link(
    p_booking_id, 'individual', '', '', '', 'payer@example.test', p_hash, p_expires
  )
$$;
grant execute on function pg_temp.pll_send(uuid, bytea, timestamptz) to public;

-- Backdate a booking's snapshot clocks (payment window + quote lock) into the past.
create function pg_temp.pll_expire_snapshot(p_snapshot_id bigint)
returns void
language plpgsql
as $$
begin
  alter table public.price_snapshots disable trigger price_snapshots_append_only;
  update public.price_snapshots
     set expires_at = now() - interval '1 hour',
         quote_lock_expires_at = now() - interval '1 hour'
   where id = p_snapshot_id;
  alter table public.price_snapshots enable trigger price_snapshots_append_only;
end
$$;

-- Two bookings: A (link sent), N (no link).
set local role vamos_checkout;
create temporary table pll_a as select * from pg_temp.pll_book(
  '21500000-0000-4000-8000-0000000000a1'::uuid, 'pll-a', 'cs_pll_a_1', decode(repeat('d1', 32), 'hex'), 'pll-a@example.test');
create temporary table pll_n as select * from pg_temp.pll_book(
  '21500000-0000-4000-8000-0000000000a2'::uuid, 'pll-n', 'cs_pll_n_1', decode(repeat('d2', 32), 'hex'), 'pll-n@example.test');
select pg_temp.pll_send((select booking_id from pll_a), decode(repeat('e1', 32), 'hex'), now() + interval '24 hours');
reset role;

select has_function('public', 'checkout_pay_link_lines', array['bytea'], 'checkout_pay_link_lines(bytea) exists');
select function_privs_are('public', 'checkout_pay_link_lines', '{bytea}'::text[],
  'vamos_checkout', '{EXECUTE}'::text[], 'vamos_checkout holds EXECUTE');
select function_privs_are('public', 'checkout_pay_link_lines', '{bytea}'::text[],
  'anon', '{}'::text[], 'anon holds no EXECUTE');
select function_privs_are('public', 'checkout_pay_link_lines', '{bytea}'::text[],
  'authenticated', '{}'::text[], 'authenticated holds no EXECUTE');
select is((select prosecdef from pg_proc where oid = 'public.checkout_pay_link_lines(bytea)'::regprocedure),
  true, 'security definer');
select ok((select proconfig::text like '%search_path=%' from pg_proc where oid = 'public.checkout_pay_link_lines(bytea)'::regprocedure),
  'fixed empty search_path');

set local role vamos_checkout;
create temporary table pll_rows as
  select * from public.checkout_pay_link_lines(decode(repeat('e1', 32), 'hex'));
create temporary table pll_wrong as
  select * from public.checkout_pay_link_lines(decode(repeat('ff', 32), 'hex'));
reset role;

select is((select count(*)::int from pll_rows), 3, 'valid token: the saved lines come back');
select is((select array_agg(kind order by seq) from pll_rows), array['fare','surcharge','vat'], 'lines keep their order and kind');
select is((select sum(amount_rappen)::int from pll_rows), 17, 'lines sum to the snapshot total');
select is((select names from pll_rows where code = 'child-seat'),
  '{"en":"Child seat","de":"Kindersitz","fr":"Siege enfant","ar":"x"}'::jsonb,
  'names reduced to the four locale keys; nothing else leaks');
select is((select vat_rate_bps from pll_rows where kind = 'vat'), 810, 'vat rate carried');
select is((select count(*)::int from pll_wrong), 0, 'wrong token: nothing');

update public.booking_access_tokens set revoked_at = now() where token_hash = decode(repeat('e1', 32), 'hex');
set local role vamos_checkout;
create temporary table pll_revoked as
  select * from public.checkout_pay_link_lines(decode(repeat('e1', 32), 'hex'));
reset role;
select is((select count(*)::int from pll_revoked), 0, 'revoked token: nothing');

update public.booking_access_tokens set revoked_at = null, expires_at = now() - interval '1 second'
 where token_hash = decode(repeat('e1', 32), 'hex');
set local role vamos_checkout;
create temporary table pll_expired as
  select * from public.checkout_pay_link_lines(decode(repeat('e1', 32), 'hex'));
reset role;
select is((select count(*)::int from pll_expired), 0, 'expired token: nothing');

select * from finish();
rollback;
