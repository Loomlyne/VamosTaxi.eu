-- pay_link_hold.test.sql
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
select plan(41);

-- Fixtures --------------------------------------------------------------------------------
insert into public.vehicle_classes (slug, passenger_capacity, luggage_capacity)
values ('plh-first', 3, 3);

insert into public.rate_versions (slug, label)
values ('plh-rv', 'Pay link hold fixture');

insert into public.distance_rates (
  rate_version_id, vehicle_class_id, max_pax, base_fare_rappen, per_km_rappen, min_fare_rappen
)
select rv.id, vc.id, 3, 1, 2, 3
  from public.rate_versions rv, public.vehicle_classes vc
 where rv.slug = 'plh-rv'
   and vc.slug = 'plh-first';

update public.rate_versions set status = 'live' where slug = 'plh-rv';

create temporary table plh_fx as
select
  vc.id as vehicle_class_id,
  rv.id as rate_version_id,
  sv.id as settings_version_id,
  now() + interval '45 minutes' as lock_exp,
  now() + interval '30 days' as token_expires_at
from public.vehicle_classes vc
join public.rate_versions rv on rv.slug = 'plh-rv'
join public.settings_versions sv on sv.slug = 'launch-baseline'
where vc.slug = 'plh-first';
grant select on plh_fx to public;

create function pg_temp.plh_snapshot()
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
      'policy_doc', 'pay-link-hold'
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
  from plh_fx fx
$$;
grant execute on function pg_temp.plh_snapshot() to public;

create function pg_temp.plh_legs(p_scheduled_at timestamptz)
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
  from plh_fx fx
$$;
grant execute on function pg_temp.plh_legs(timestamptz) to public;

create function pg_temp.plh_book(
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
      p_snapshot => pg_temp.plh_snapshot(),
      p_legs => pg_temp.plh_legs(now() + interval '3 days'),
      p_coupon_id => null,
      p_coupon_code => null,
      p_manage_token_hash => p_hash,
      p_manage_token_expires_at => (select token_expires_at from plh_fx),
      p_stripe_payment_intent_id => p_cs,
      p_stripe_checkout_session_id => p_cs,
      p_charged_rappen => 6,
      p_actor_customer_id => null
    )
$$;
grant execute on function pg_temp.plh_book(uuid, text, text, bytea, text) to public;

create function pg_temp.plh_send(p_booking_id uuid, p_hash bytea, p_expires timestamptz)
returns timestamptz
language sql
volatile
as $$
  select public.checkout_set_pay_link(
    p_booking_id, 'individual', '', '', '', 'payer@example.test', p_hash, p_expires
  )
$$;
grant execute on function pg_temp.plh_send(uuid, bytea, timestamptz) to public;

-- Backdate a booking's snapshot clocks (payment window + quote lock) into the past.
create function pg_temp.plh_expire_snapshot(p_snapshot_id bigint)
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

-- Four bookings: A (link sent, still held), N (no link), E (link sent, 24 h passed),
-- P (link sent, then paid -- D-21 -- and charged twice -- D-22).
set local role vamos_checkout;
create temporary table plh_a as select * from pg_temp.plh_book(
  '21500000-0000-4000-8000-00000000000a'::uuid, 'plh-a', 'cs_plh_a_1', decode(repeat('b1', 32), 'hex'), 'plh-a@example.test');
create temporary table plh_n as select * from pg_temp.plh_book(
  '21500000-0000-4000-8000-00000000000b'::uuid, 'plh-n', 'cs_plh_n_1', decode(repeat('b2', 32), 'hex'), 'plh-n@example.test');
create temporary table plh_e as select * from pg_temp.plh_book(
  '21500000-0000-4000-8000-00000000000c'::uuid, 'plh-e', 'cs_plh_e_1', decode(repeat('b3', 32), 'hex'), 'plh-e@example.test');
create temporary table plh_p as select * from pg_temp.plh_book(
  '21500000-0000-4000-8000-00000000000d'::uuid, 'plh-p', 'cs_plh_p_1', decode(repeat('b4', 32), 'hex'), 'plh-p@example.test');
reset role;

-- 0. Schema and grants -------------------------------------------------------------------
select has_column('public', 'bookings', 'hold_until', 'bookings.hold_until exists (D-20)');
select has_function('public', 'checkout_pay_link_state', array['bytea', 'text'],
  'checkout_pay_link_state(bytea, text) exists (D-21/D-22)');
select has_function('public', 'checkout_booking_hold_until', array['uuid'],
  'checkout_booking_hold_until(uuid) exists (traveller read)');
select function_privs_are('public', 'checkout_pay_link_state', '{bytea,text}'::text[],
  'vamos_checkout', '{EXECUTE}'::text[], 'checkout_pay_link_state: vamos_checkout holds EXECUTE');
select function_privs_are('public', 'checkout_pay_link_state', '{bytea,text}'::text[],
  'anon', '{}'::text[], 'checkout_pay_link_state: anon holds no EXECUTE');
select function_privs_are('public', 'checkout_pay_link_state', '{bytea,text}'::text[],
  'authenticated', '{}'::text[], 'checkout_pay_link_state: authenticated holds no EXECUTE');
select function_privs_are('public', 'checkout_booking_hold_until', '{uuid}'::text[],
  'vamos_checkout', '{EXECUTE}'::text[], 'checkout_booking_hold_until: vamos_checkout holds EXECUTE');
select function_privs_are('public', 'checkout_booking_hold_until', '{uuid}'::text[],
  'authenticated', '{}'::text[], 'checkout_booking_hold_until: authenticated holds no EXECUTE');

-- 1. No pay link: behaves exactly as before ---------------------------------------------
select ok(
  (select b.hold_until is null from public.bookings b join plh_n n on n.booking_id = b.id),
  'no link: hold_until stays null'
);
set local role vamos_checkout;
create temporary table plh_n_hold as
  select public.checkout_booking_hold_until('21500000-0000-4000-8000-00000000000b'::uuid) as hold_until;
reset role;
select ok((select hold_until is null from plh_n_hold), 'no link: checkout_booking_hold_until is null');

select pg_temp.plh_expire_snapshot((select snapshot_id from plh_n));
select throws_ok(
  $$ insert into public.booking_payments (
       booking_id, snapshot_id, stripe_payment_intent_id, stripe_checkout_session_id,
       charged_rappen, charged_currency, status
     )
     select n.booking_id, n.snapshot_id, 'cs_plh_n_2', 'cs_plh_n_2', 6, 'CHF', 'requires_payment'
       from plh_n n $$,
  '23001', null,
  'no link: the charge gate still refuses a payment on an expired snapshot'
);

-- 2. Link sent now: one 24-hour clock ----------------------------------------------------
set local role vamos_checkout;
select pg_temp.plh_send((select booking_id from plh_a), decode(repeat('c1', 32), 'hex'), now() + interval '24 hours');
create temporary table plh_a_hold as
  select public.checkout_booking_hold_until('21500000-0000-4000-8000-00000000000a'::uuid) as hold_until;
reset role;

select is(
  (select b.hold_until from public.bookings b join plh_a a on a.booking_id = b.id),
  now() + interval '24 hours',
  'send: hold_until = token_expires_at = now() + 24 h (D-20a)'
);
select is((select hold_until from plh_a_hold), now() + interval '24 hours',
  'send: checkout_booking_hold_until returns the hold for the quote');
select is(
  (select t.expires_at from public.booking_access_tokens t where t.token_hash = decode(repeat('c1', 32), 'hex')),
  now() + interval '24 hours',
  'send: the pay token expires on the same clock'
);

-- The quote lock the link was sent under runs out; the hold carries the booking.
select pg_temp.plh_expire_snapshot((select snapshot_id from plh_a));

select is(
  (select count(*)::int from public.checkout_pay_link_by_hash(decode(repeat('c1', 32), 'hex'))),
  1, 'held: checkout_pay_link_by_hash still returns the row after the quote lock ran out'
);
select is(
  (select snapshot_expires_at from public.checkout_pay_link_by_hash(decode(repeat('c1', 32), 'hex'))),
  now() + interval '24 hours',
  'held: snapshot_expires_at = hold_until'
);
select lives_ok(
  $$ insert into public.booking_payments (
       booking_id, snapshot_id, stripe_payment_intent_id, stripe_checkout_session_id,
       charged_rappen, charged_currency, status
     )
     select a.booking_id, a.snapshot_id, 'cs_plh_a_2', 'cs_plh_a_2', 6, 'CHF', 'requires_payment'
       from plh_a a $$,
  'held: the charge gate accepts a payment inside the hold'
);
set local role vamos_checkout;
create temporary table plh_a_state as
  select * from public.checkout_pay_link_state(decode(repeat('c1', 32), 'hex'));
reset role;
select is(
  (select state || '|' || coalesce(reference, '') from plh_a_state),
  'payable|' || (select reference from plh_a),
  'state: a held link is payable, with its reference'
);

-- 3. Resend does not restart the clock and never holds past sent + 24 h (D-37, T-26.1-47) --
update public.bookings b
   set pay_link_sent_at = now() - interval '10 hours',
       hold_until = now() + interval '14 hours'
  from plh_a a
 where b.id = a.booking_id;

set local role vamos_checkout;
select pg_temp.plh_send((select booking_id from plh_a), decode(repeat('c2', 32), 'hex'), now() + interval '24 hours');
reset role;

select is(
  (select b.hold_until from public.bookings b join plh_a a on a.booking_id = b.id),
  now() + interval '14 hours',
  'resend: hold_until is not pushed past the first send + 24 h'
);
select is(
  (select t.expires_at from public.booking_access_tokens t where t.token_hash = decode(repeat('c2', 32), 'hex')),
  now() + interval '14 hours',
  'resend: the new token expires with the hold, not 24 h from the resend'
);

update public.booking_access_tokens set revoked_at = now()
 where token_hash = decode(repeat('c2', 32), 'hex');
select is(
  (select state || '|' || coalesce(reference, '') from public.checkout_pay_link_state(decode(repeat('c2', 32), 'hex'))),
  'expired|',
  'state: a revoked token answers expired with no reference'
);
select is(
  (select state from public.checkout_pay_link_state(decode(repeat('c1', 32), 'hex'))),
  'payable',
  'state: the unrevoked first token is still payable'
);

-- 4. 24 h + 1 s after sending: refused everywhere --------------------------------------
set local role vamos_checkout;
select pg_temp.plh_send((select booking_id from plh_e), decode(repeat('c3', 32), 'hex'), now() + interval '24 hours');
reset role;

update public.bookings b
   set pay_link_sent_at = now() - interval '24 hours 1 second',
       hold_until = now() - interval '1 second'
  from plh_e e
 where b.id = e.booking_id;
update public.booking_access_tokens set expires_at = now() - interval '1 second'
 where token_hash = decode(repeat('c3', 32), 'hex');
select pg_temp.plh_expire_snapshot((select snapshot_id from plh_e));

select throws_ok(
  $$ select * from public.checkout_pay_link_by_hash(decode(repeat('c3', 32), 'hex')) $$,
  'P0002', null,
  'expired: checkout_pay_link_by_hash raises P0002 once the hold is over'
);
select is(
  (select state || '|' || coalesce(reference, '') from public.checkout_pay_link_state(decode(repeat('c3', 32), 'hex'))),
  'expired|',
  'state: a link past its hold answers expired with no reference'
);
select throws_ok(
  $$ insert into public.booking_payments (
       booking_id, snapshot_id, stripe_payment_intent_id, stripe_checkout_session_id,
       charged_rappen, charged_currency, status
     )
     select e.booking_id, e.snapshot_id, 'cs_plh_e_2', 'cs_plh_e_2', 6, 'CHF', 'requires_payment'
       from plh_e e $$,
  '23001', null,
  'expired: the charge gate refuses a payment once the hold is over'
);

-- 5. Paid (D-21) and charged twice then refunded (D-22) ----------------------------------
set local role vamos_checkout;
select pg_temp.plh_send((select booking_id from plh_p), decode(repeat('c4', 32), 'hex'), now() + interval '24 hours');
reset role;

-- The recipient opened the link: their own session on the same snapshot.
insert into public.booking_payments (
  booking_id, snapshot_id, stripe_payment_intent_id, stripe_checkout_session_id,
  charged_rappen, charged_currency, status
)
select p.booking_id, p.snapshot_id, 'cs_plh_p_2', 'cs_plh_p_2', 6, 'CHF', 'requires_payment'
  from plh_p p;

-- The traveller pays first on their own page.
select * from public.checkout_payment_settle(
  'evt_plh_p_1', 'cs_plh_p_1', 'pi_plh_p_1', 'succeeded', 'CHF', null, null, null, null
);

select is(
  (select b.status::text from public.bookings b join plh_p p on p.booking_id = b.id),
  'confirmed', 'paid: the booking is confirmed by the first payment'
);
select is(
  (select state || '|' || coalesce(reference, '') from public.checkout_pay_link_state(decode(repeat('c4', 32), 'hex'))),
  'paid|' || (select reference from plh_p),
  'state: a paid booking answers paid with its reference (D-21)'
);
select throws_ok(
  $$ select * from public.checkout_pay_link_by_hash(decode(repeat('c4', 32), 'hex')) $$,
  'P0002', null,
  'paid: checkout_pay_link_by_hash no longer returns a payable row'
);

-- The recipient's charge also succeeds: it lands as a duplicate.
select * from public.checkout_payment_settle(
  'evt_plh_p_2', 'cs_plh_p_2', 'pi_plh_p_2', 'succeeded', 'CHF', null, null, null, null
);
select is(
  (select bp.status from public.booking_payments bp where bp.stripe_checkout_session_id = 'cs_plh_p_2'),
  'duplicate', 'race: the second charge is recorded as a duplicate'
);
select is(
  (select state from public.checkout_pay_link_state(decode(repeat('c4', 32), 'hex'), 'cs_plh_p_2')),
  'paid', 'state: before the refund is recorded the duplicate session still reads paid'
);

select * from public.checkout_duplicate_refund_record(
  (select bp.id from public.booking_payments bp where bp.stripe_checkout_session_id = 'cs_plh_p_2'),
  're_plh_p_2', 6, 'duplicate_charge'
);

set local role vamos_checkout;
create temporary table plh_p_race as
  select * from public.checkout_pay_link_state(decode(repeat('c4', 32), 'hex'), 'cs_plh_p_2');
reset role;
select is(
  (select state || '|' || coalesce(reference, '') from plh_p_race),
  'refunded_duplicate|' || (select reference from plh_p),
  'state: the recipient''s refunded duplicate session answers refunded_duplicate (D-22)'
);
select is(
  (select state from public.checkout_pay_link_state(decode(repeat('c4', 32), 'hex'), 'cs_plh_p_1')),
  'paid', 'state: the winning session answers paid'
);
select is(
  (select state || '|' || coalesce(reference, '') from public.checkout_pay_link_state(decode(repeat('c3', 32), 'hex'), 'cs_plh_p_2')),
  'expired|',
  'state: a duplicate session of another booking does not leak through a different token'
);
select is(
  (select state || '|' || coalesce(reference, '') from public.checkout_pay_link_state(decode(repeat('ff', 32), 'hex'), 'cs_plh_p_2')),
  'expired|',
  'state: an unknown token answers expired with no reference'
);
select is(
  (select state || '|' || coalesce(reference, '') from public.checkout_pay_link_state(decode(repeat('b1', 32), 'hex'))),
  'expired|',
  'state: a manage token is not a pay token'
);

-- 6. The cron honours the hold ----------------------------------------------------------
create temporary table plh_cron as select * from public.checkout_expire_unpaid();

select ok(
  not exists (select 1 from plh_cron c join plh_a a on a.booking_id = c.booking_id),
  'cron: a booking inside its pay-link hold is not cancelled'
);
select is(
  (select b.status::text from public.bookings b join plh_a a on a.booking_id = b.id),
  'pending', 'cron: the held booking stays pending'
);
select ok(
  exists (select 1 from plh_cron c join plh_e e on e.booking_id = c.booking_id),
  'cron: a booking past its hold is cancelled'
);
select ok(
  (select 'cs_plh_e_1' = any(c.stripe_checkout_session_ids) from plh_cron c join plh_e e on e.booking_id = c.booking_id),
  'cron: returns the expired booking''s open session ids to expire (D-04)'
);
select ok(
  not exists (select 1 from plh_cron c join plh_n n on n.booking_id = c.booking_id),
  'cron: a booking with no pay link is not cancelled (26.3-07 D-25: the purge removes it)'
);
select is(
  (select state || '|' || coalesce(reference, '') from public.checkout_pay_link_state(decode(repeat('c3', 32), 'hex'))),
  'expired|',
  'state: a cancelled booking answers expired with no reference'
);

select * from finish();
rollback;
