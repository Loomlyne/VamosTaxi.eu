-- unpaid_cancel_session.test.sql
--
-- Plan 26.1-06 (D-04/D-11/D-11a). Closes audit X9: account cancel and cron
-- expiry cancelled the DB row but left the Stripe Checkout Session payable.
-- Proves every unpaid cancel/expire RPC now also returns the booking's open
-- ('requires_payment') Checkout Session ids, and gives back the booking's
-- coupon use so caps count paid uses only. Synthetic rappen integers
-- throughout -- never a real CHF amount, and never the string CHF followed
-- by digits (D-34).
--
-- Fixture note: checkout_expire_unpaid's own create_quote_snapshot helper
-- refuses to mint a snapshot whose lock is already in the past (QUOTE-04),
-- so this file builds a normal pending booking through the real
-- checkout_create_booking RPC and then backdates its
-- price_snapshots.quote_lock_expires_at by disabling/re-enabling the
-- append-only trigger around one UPDATE -- the same technique
-- 20260913180000_ops_pricing_source.sql itself uses to backfill a frozen
-- table. checkout_expire_unpaid's own correctness at finding that row is
-- what this file proves; the disable/enable pair never touches anything
-- this plan did not itself need to backdate.
begin;
select plan(41);

-- Fixtures --------------------------------------------------------------------------------
insert into public.vehicle_classes (slug, passenger_capacity, luggage_capacity)
values ('ucs-first', 3, 3);

insert into public.rate_versions (slug, label)
values ('ucs-rv', 'Unpaid cancel session fixture');

insert into public.distance_rates (
  rate_version_id, vehicle_class_id, max_pax, base_fare_rappen, per_km_rappen, min_fare_rappen
)
select rv.id, vc.id, 3, 1, 2, 3
  from public.rate_versions rv, public.vehicle_classes vc
 where rv.slug = 'ucs-rv'
   and vc.slug = 'ucs-first';

update public.rate_versions set status = 'live' where slug = 'ucs-rv';

insert into public.coupons (code, kind, percent, global_limit, active)
values
  ('UCS-CANCEL-1', 'percent', 10.00, 1, true),
  ('UCS-OPS-1', 'percent', 10.00, 1, true),
  ('UCS-OPS-PAID-1', 'percent', 10.00, 1, true),
  ('UCS-ABANDON-1', 'percent', 10.00, 1, true),
  ('UCS-REQUOTE-1', 'percent', 10.00, 1, true),
  ('UCS-CAP-1', 'percent', 10.00, 1, true);

-- vamos_checkout has no SELECT on public.coupons; resolve ids once here,
-- under the default (unrestricted) test role, and hand them through.
create temporary table ucs_coupon as
select code, id from public.coupons
 where code in (
   'UCS-CANCEL-1', 'UCS-OPS-1', 'UCS-OPS-PAID-1', 'UCS-ABANDON-1', 'UCS-REQUOTE-1', 'UCS-CAP-1'
 );
grant select on ucs_coupon to public;

create temporary table ucs_fx as
select
  vc.id as vehicle_class_id,
  rv.id as rate_version_id,
  sv.id as settings_version_id,
  now() + interval '45 minutes' as lock_exp,
  now() + interval '30 days' as token_expires_at
from public.vehicle_classes vc
join public.rate_versions rv on rv.slug = 'ucs-rv'
join public.settings_versions sv on sv.slug = 'launch-baseline'
where vc.slug = 'ucs-first';
grant select on ucs_fx to public;

create function pg_temp.ucs_snapshot()
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'vehicle_class_id', fx.vehicle_class_id,
    'rate_version_id', fx.rate_version_id,
    'settings_version_id', fx.settings_version_id,
    'engine_version', 'quote-engine@unpaid-cancel-session',
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
      'policy_doc', 'unpaid-cancel-session'
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
  from ucs_fx fx
$$;
grant execute on function pg_temp.ucs_snapshot() to public;

create function pg_temp.ucs_legs(p_scheduled_at timestamptz)
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
  from ucs_fx fx
$$;
grant execute on function pg_temp.ucs_legs(timestamptz) to public;

create function pg_temp.ucs_book(
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
        'contact_name', 'Unpaid Cancel Session Guest',
        'contact_email', p_email,
        'contact_phone', '+417****7082'
      ),
      p_locale => 'en',
      p_display_currency => 'CHF',
      p_snapshot => pg_temp.ucs_snapshot(),
      p_legs => pg_temp.ucs_legs(p_scheduled_at),
      p_coupon_id => p_coupon_id,
      p_coupon_code => p_coupon_code,
      p_manage_token_hash => p_hash,
      p_manage_token_expires_at => (select token_expires_at from ucs_fx),
      p_stripe_payment_intent_id => p_pi,
      p_stripe_checkout_session_id => p_cs,
      p_charged_rappen => 6,
      p_actor_customer_id => null
    )
$$;
grant execute on function pg_temp.ucs_book(
  uuid, text, text, text, bytea, text, timestamptz, int8, text
) to public;

-- Grants unchanged (D-04 acceptance) ------------------------------------------
select function_privs_are('public', 'checkout_cancel_unpaid', '{text}'::text[],
  'anon', '{}'::text[], 'checkout_cancel_unpaid: anon holds no EXECUTE');
select function_privs_are('public', 'checkout_cancel_unpaid', '{text}'::text[],
  'authenticated', '{EXECUTE}'::text[], 'checkout_cancel_unpaid: authenticated holds EXECUTE (unchanged grant)');
select function_privs_are('public', 'checkout_expire_unpaid', '{}'::text[],
  'authenticated', '{}'::text[], 'checkout_expire_unpaid: authenticated holds no EXECUTE');
select function_privs_are('public', 'checkout_expire_unpaid', '{}'::text[],
  'vamos_system', '{EXECUTE}'::text[], 'checkout_expire_unpaid: vamos_system holds EXECUTE (unchanged grant)');
select function_privs_are('public', 'ops_cancel_booking', '{uuid,uuid}'::text[],
  'authenticated', '{}'::text[], 'ops_cancel_booking: authenticated holds no EXECUTE');
select function_privs_are('public', 'ops_cancel_booking', '{uuid,uuid}'::text[],
  'vamos_system', '{EXECUTE}'::text[], 'ops_cancel_booking: vamos_system holds EXECUTE (unchanged grant)');
select function_privs_are('public', 'checkout_abandon_unpaid', '{uuid}'::text[],
  'authenticated', '{}'::text[], 'checkout_abandon_unpaid: authenticated holds no EXECUTE');
select function_privs_are('public', 'checkout_abandon_unpaid', '{uuid}'::text[],
  'vamos_checkout', '{EXECUTE}'::text[], 'checkout_abandon_unpaid: vamos_checkout holds EXECUTE (unchanged grant)');
select function_privs_are('public', 'checkout_requote_cancel', '{uuid}'::text[],
  'authenticated', '{}'::text[], 'checkout_requote_cancel: authenticated holds no EXECUTE');
select function_privs_are('public', 'checkout_requote_cancel', '{uuid}'::text[],
  'vamos_checkout', '{EXECUTE}'::text[], 'checkout_requote_cancel: vamos_checkout holds EXECUTE (unchanged grant)');

-- 1. Account cancel: open session ids returned, old two-column select still works ---------
set local role vamos_checkout;
create temporary table ucs_out_account as
  select * from pg_temp.ucs_book(
    '20000000-0000-4000-8000-000000000001'::uuid, 'ucs-account',
    'cs_ucs_account_1', 'cs_ucs_account_1',
    decode(repeat('a1', 32), 'hex'), 'ucs-account@example.test',
    now() + interval '3 days'
  );
grant select on ucs_out_account to public;
reset role;

-- A second, stray requires_payment row on the same booking (e.g. a retried
-- checkout intent) -- the RPC must find and return it too.
insert into public.booking_payments (
  booking_id, snapshot_id, stripe_payment_intent_id, stripe_checkout_session_id,
  charged_rappen, charged_currency, status
)
select o.booking_id, o.snapshot_id, 'cs_ucs_account_2', 'cs_ucs_account_2', 6, 'CHF', 'requires_payment'
  from ucs_out_account o;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object('sub', '30000000-0000-4000-8000-000000000001', 'role', 'authenticated', 'email', 'ucs-account@example.test')::text,
  true
);
create temporary table ucs_cancel_account as
  select * from public.checkout_cancel_unpaid((select reference from ucs_out_account));
reset role;

select is(
  (select array_length(stripe_checkout_session_ids, 1) from ucs_cancel_account),
  2, 'account: returns both open Stripe Checkout Session ids (D-04)'
);
select ok(
  (select 'cs_ucs_account_1' = any(stripe_checkout_session_ids) from ucs_cancel_account),
  'account: includes the session stored at booking creation'
);
select ok(
  (select 'cs_ucs_account_2' = any(stripe_checkout_session_ids) from ucs_cancel_account),
  'account: includes the stray second session'
);
select is(
  (select b.status::text from public.bookings b join ucs_out_account o on o.booking_id = b.id),
  'cancelled', 'account: booking is cancelled'
);

-- Old two-column callers are unaffected by the appended column (backward compatible).
set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object('sub', '30000000-0000-4000-8000-000000000002', 'role', 'authenticated', 'email', 'ucs-account-2@example.test')::text,
  true
);
reset role;

set local role vamos_checkout;
create temporary table ucs_out_compat as
  select * from pg_temp.ucs_book(
    '20000000-0000-4000-8000-000000000002'::uuid, 'ucs-compat',
    'cs_ucs_compat_1', 'cs_ucs_compat_1',
    decode(repeat('a2', 32), 'hex'), 'ucs-compat@example.test',
    now() + interval '3 days'
  );
grant select on ucs_out_compat to public;
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object('sub', '30000000-0000-4000-8000-000000000002', 'role', 'authenticated', 'email', 'ucs-compat@example.test')::text,
  true
);
select lives_ok(
  $$
    select booking_id, reference
      from public.checkout_cancel_unpaid((select reference from ucs_out_compat))
  $$,
  'compat: old two-column select (booking_id, reference) still works (backward compatible)'
);
reset role;

-- 2. Cron expiry: backdate the lock, expect open session id + coupon release ---------------
set local role vamos_checkout;
create temporary table ucs_out_expire as
  select * from pg_temp.ucs_book(
    '20000000-0000-4000-8000-000000000003'::uuid, 'ucs-expire',
    'cs_ucs_expire_1', 'cs_ucs_expire_1',
    decode(repeat('a3', 32), 'hex'), 'ucs-expire@example.test',
    now() + interval '3 days',
    (select id from ucs_coupon where code = 'UCS-CANCEL-1'),
    'UCS-CANCEL-1'
  );
reset role;

select ok(
  (select exists (
     select 1 from public.coupon_redemptions r
     join ucs_out_expire o on o.booking_id = r.booking_id
     where r.released_at is null
  )),
  'expire: coupon_redemptions row exists, unreleased, right after booking'
);

alter table public.price_snapshots disable trigger price_snapshots_append_only;
update public.price_snapshots ps
   set quote_lock_expires_at = now() - interval '1 hour'
  from ucs_out_expire o
 where ps.id = o.snapshot_id;
alter table public.price_snapshots enable trigger price_snapshots_append_only;

select ok(
  (select ps.quote_lock_expires_at <= now()
     from public.price_snapshots ps
     join ucs_out_expire o on o.snapshot_id = ps.id),
  'expire: fixture lock backdated into the past'
);

create temporary table ucs_expired as
  select * from public.checkout_expire_unpaid();

select ok(
  (select count(*) from ucs_expired
    join ucs_out_expire o on o.booking_id = ucs_expired.booking_id) = 1,
  'expire: the backdated booking is among the cron''s cancelled rows'
);
select is(
  (select b.status::text from public.bookings b join ucs_out_expire o on o.booking_id = b.id),
  'cancelled', 'expire: booking is cancelled'
);
select ok(
  (select 'cs_ucs_expire_1' = any(e.stripe_checkout_session_ids)
     from ucs_expired e
     join ucs_out_expire o on o.booking_id = e.booking_id),
  'expire: returns the booking''s open Stripe Checkout Session id (D-04)'
);
select is(
  (select r.released_at is not null
     from public.coupon_redemptions r
     join ucs_out_expire o on o.booking_id = r.booking_id),
  true, 'expire: coupon_redemptions.released_at is set (D-11a)'
);
select is(
  (select r.released_reason
     from public.coupon_redemptions r
     join ucs_out_expire o on o.booking_id = r.booking_id),
  'unpaid_cancelled', 'expire: released_reason is unpaid_cancelled'
);

-- 3. ops_cancel_booking: unpaid -- session ids returned, coupon released -------------------
set local role vamos_checkout;
create temporary table ucs_out_ops as
  select * from pg_temp.ucs_book(
    '20000000-0000-4000-8000-000000000004'::uuid, 'ucs-ops',
    'cs_ucs_ops_1', 'cs_ucs_ops_1',
    decode(repeat('a4', 32), 'hex'), 'ucs-ops@example.test',
    now() + interval '3 days',
    (select id from ucs_coupon where code = 'UCS-OPS-1'),
    'UCS-OPS-1'
  );
reset role;

create temporary table ucs_ops_cancel as
  select * from public.ops_cancel_booking(
    (select booking_id from ucs_out_ops), null::uuid
  );

select ok(
  (select 'cs_ucs_ops_1' = any(stripe_checkout_session_ids) from ucs_ops_cancel),
  'ops unpaid: returns the booking''s open Stripe Checkout Session id (D-04)'
);
select is(
  (select paid from ucs_ops_cancel), false, 'ops unpaid: paid flag is false'
);
select is(
  (select r.released_at is not null
     from public.coupon_redemptions r
     join ucs_out_ops o on o.booking_id = r.booking_id),
  true, 'ops unpaid: coupon_redemptions.released_at is set (D-11a)'
);

-- 4. ops_cancel_booking: paid -- session ids empty, coupon NOT released -------------------
set local role vamos_checkout;
create temporary table ucs_out_ops_paid as
  select * from pg_temp.ucs_book(
    '20000000-0000-4000-8000-000000000005'::uuid, 'ucs-ops-paid',
    'cs_ucs_ops_paid_1', 'cs_ucs_ops_paid_1',
    decode(repeat('a5', 32), 'hex'), 'ucs-ops-paid@example.test',
    now() + interval '3 days',
    (select id from ucs_coupon where code = 'UCS-OPS-PAID-1'),
    'UCS-OPS-PAID-1'
  );
reset role;

insert into public.stripe_events (id, type, stripe_created, object_id, payload)
values ('evt_ucs_ops_paid', 'checkout.session.completed', now(), 'cs_ucs_ops_paid_1', '{}'::jsonb);

select lives_ok(
  $$
    select * from public.checkout_payment_settle(
      'evt_ucs_ops_paid', 'cs_ucs_ops_paid_1', 'pi_ucs_ops_paid_1', 'succeeded',
      'CHF', null, null, null, null
    )
  $$,
  'ops paid: payment settles'
);
select is(
  (select b.status::text from public.bookings b join ucs_out_ops_paid o on o.booking_id = b.id),
  'confirmed', 'ops paid: booking confirmed before the ops cancel'
);

create temporary table ucs_ops_cancel_paid as
  select * from public.ops_cancel_booking(
    (select booking_id from ucs_out_ops_paid), null::uuid
  );

select is(
  (select paid from ucs_ops_cancel_paid), true, 'ops paid: paid flag is true'
);
select is(
  (select array_length(stripe_checkout_session_ids, 1) from ucs_ops_cancel_paid),
  null, 'ops paid: no open Stripe Checkout Session ids (already captured, none requires_payment)'
);
select is(
  (select r.released_at
     from public.coupon_redemptions r
     join ucs_out_ops_paid o on o.booking_id = r.booking_id),
  null, 'ops paid: coupon_redemptions.released_at stays null -- a paid booking''s redemption stands'
);

-- 5. Abandon (leave payment): coupon released too (D-11a) ---------------------------------
set local role vamos_checkout;
create temporary table ucs_out_abandon as
  select * from pg_temp.ucs_book(
    '20000000-0000-4000-8000-000000000006'::uuid, 'ucs-abandon',
    'cs_ucs_abandon_1', 'cs_ucs_abandon_1',
    decode(repeat('a6', 32), 'hex'), 'ucs-abandon@example.test',
    now() + interval '3 days',
    (select id from ucs_coupon where code = 'UCS-ABANDON-1'),
    'UCS-ABANDON-1'
  );
reset role;

set local role vamos_checkout;
select lives_ok(
  $$
    select * from public.checkout_abandon_unpaid(
      '20000000-0000-4000-8000-000000000006'::uuid
    )
  $$,
  'abandon: checkout_abandon_unpaid cancels by quote_id'
);
reset role;

select ok(
  (select b.status::text = 'cancelled' from public.bookings b join ucs_out_abandon o on o.booking_id = b.id),
  'abandon: booking is cancelled'
);
select is(
  (select r.released_at is not null
     from public.coupon_redemptions r
     join ucs_out_abandon o on o.booking_id = r.booking_id),
  true, 'abandon: coupon_redemptions.released_at is set (D-11a)'
);

-- 6. Requote cancel: coupon released too (D-11a) ------------------------------------------
set local role vamos_checkout;
create temporary table ucs_out_requote as
  select * from pg_temp.ucs_book(
    '20000000-0000-4000-8000-000000000007'::uuid, 'ucs-requote',
    'cs_ucs_requote_1', 'cs_ucs_requote_1',
    decode(repeat('a7', 32), 'hex'), 'ucs-requote@example.test',
    now() + interval '3 days',
    (select id from ucs_coupon where code = 'UCS-REQUOTE-1'),
    'UCS-REQUOTE-1'
  );
reset role;

set local role vamos_checkout;
select lives_ok(
  $$
    select * from public.checkout_requote_cancel(
      '20000000-0000-4000-8000-000000000007'::uuid
    )
  $$,
  'requote: checkout_requote_cancel cancels by quote_id'
);
reset role;

select ok(
  (select b.status::text = 'cancelled' from public.bookings b join ucs_out_requote o on o.booking_id = b.id),
  'requote: booking is cancelled'
);
select is(
  (select r.released_at is not null
     from public.coupon_redemptions r
     join ucs_out_requote o on o.booking_id = r.booking_id),
  true, 'requote: coupon_redemptions.released_at is set (D-11a)'
);

-- 7. End-to-end cap reclaim: a global_limit=1 coupon freed by a cancel can be
--    redeemed again by a brand new booking (D-11a's own stated example). A
--    dedicated coupon/quote_id pair, self-contained, so the cap-reached
--    assertion below is not affected by any earlier section's own release. --
set local role vamos_checkout;
create temporary table ucs_out_cap_hold as
  select * from pg_temp.ucs_book(
    '20000000-0000-4000-8000-000000000103'::uuid, 'ucs-cap-hold',
    'cs_ucs_cap_hold', 'cs_ucs_cap_hold',
    decode(repeat('b0', 32), 'hex'), 'ucs-cap-hold@example.test',
    now() + interval '3 days',
    (select id from ucs_coupon where code = 'UCS-CAP-1'),
    'UCS-CAP-1'
  );
grant select on ucs_out_cap_hold to public;
reset role;

select lives_ok(
  $$ select 1 from ucs_out_cap_hold $$,
  'cap: first redemption against global_limit=1 succeeds'
);

set local role vamos_checkout;
select throws_ok(
  $$
    select * from pg_temp.ucs_book(
      '20000000-0000-4000-8000-000000000104'::uuid, 'ucs-cap-blocked',
      'cs_ucs_cap_blocked', 'cs_ucs_cap_blocked',
      decode(repeat('b1', 32), 'hex'), 'ucs-cap-blocked@example.test',
      now() + interval '3 days',
      (select id from ucs_coupon where code = 'UCS-CAP-1'),
      'UCS-CAP-1'
    )
  $$,
  '23001', null,
  'cap: before any cancel, UCS-CAP-1 (global_limit=1, already used) is refused'
);
reset role;

set local role vamos_checkout;
select lives_ok(
  $$
    select * from public.checkout_abandon_unpaid(
      '20000000-0000-4000-8000-000000000103'::uuid
    )
  $$,
  'cap: cancelling the cap-holding booking releases its coupon use'
);
reset role;

-- The cancel above released UCS-CAP-1''s use, so a brand new booking can
-- redeem it again.
set local role vamos_checkout;
create temporary table ucs_out_reclaim as
  select * from pg_temp.ucs_book(
    '20000000-0000-4000-8000-000000000105'::uuid, 'ucs-cap-reclaim',
    'cs_ucs_cap_reclaim', 'cs_ucs_cap_reclaim',
    decode(repeat('b2', 32), 'hex'), 'ucs-cap-reclaim@example.test',
    now() + interval '3 days',
    (select id from ucs_coupon where code = 'UCS-CAP-1'),
    'UCS-CAP-1'
  );
reset role;

select lives_ok(
  $$ select 1 from ucs_out_reclaim $$,
  'cap: a released global_limit=1 coupon use is redeemable by a new booking (D-11a)'
);
select is(
  (select count(*)::bigint from public.coupon_redemptions r
    join ucs_coupon c on c.id = r.coupon_id
   where c.code = 'UCS-CAP-1' and r.released_at is null),
  1::bigint,
  'cap: exactly one unreleased redemption of UCS-CAP-1 after the reclaim'
);

select * from finish();
rollback;
