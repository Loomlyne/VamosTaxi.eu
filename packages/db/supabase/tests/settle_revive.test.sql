-- settle_revive.test.sql
--
-- Plan 26.1-02. Proves the new settlement machine: a successful payment always
-- ends confirmed (D-03/D-03a), the real PaymentIntent id is written back
-- (D-05), a second successful charge on the same snapshot is flagged
-- duplicate rather than raising 23505 (D-22), and a requote-cancelled booking
-- is refunded, never revived, because its successor booking already exists
-- (D-03b). Synthetic rappen integers throughout -- never a real CHF amount,
-- and never the string CHF followed by digits (D-34).
--
-- Fixture note: every cancellation state this file needs (account cancel,
-- abandon, staff cancel, requote cancel) is produced by calling the REAL
-- production RPC (checkout_cancel_unpaid / checkout_abandon_unpaid /
-- ops_cancel_booking / checkout_requote_cancel) so this file also proves the
-- settle function reads their actual `via` payload strings correctly. The one
-- exception is `expire_unpaid`: that RPC's own SECURITY DEFINER helper
-- (create_quote_snapshot) refuses to mint a snapshot whose quote lock is
-- already in the past, so a cron-swept fixture cannot be built through the
-- real RPC inside a single transaction. That one case constructs the
-- equivalent end state by hand (cancelled booking + cancelled legs + a
-- booking.status_changed event with payload->>'via' = 'expire_unpaid') --
-- checkout_expire_unpaid's own correctness is proven in its own test file;
-- this file only proves checkout_payment_settle's reaction to that state.
begin;
select plan(85);

-- Fixtures --------------------------------------------------------------------------------
insert into public.vehicle_classes (slug, passenger_capacity, luggage_capacity)
values ('rt-first', 3, 3);

insert into public.rate_versions (slug, label)
values ('rt-rv', 'Settle revive fixture');

insert into public.distance_rates (
  rate_version_id, vehicle_class_id, max_pax, base_fare_rappen, per_km_rappen, min_fare_rappen
)
select rv.id, vc.id, 3, 1, 2, 3
  from public.rate_versions rv, public.vehicle_classes vc
 where rv.slug = 'rt-rv'
   and vc.slug = 'rt-first';

update public.rate_versions set status = 'live' where slug = 'rt-rv';

insert into public.coupons (code, kind, percent, active)
values ('RT-REVIVE-10', 'percent', 10.00, true);

-- vamos_checkout has no SELECT on public.coupons; resolve the id once here,
-- under the default (unrestricted) test role, and hand the id through.
create temporary table rt_coupon as
select id from public.coupons where code = 'RT-REVIVE-10';
grant select on rt_coupon to public;

create temporary table rt_fx as
select
  vc.id as vehicle_class_id,
  rv.id as rate_version_id,
  sv.id as settings_version_id,
  now() + interval '45 minutes' as lock_exp,
  now() + interval '30 days' as token_expires_at
from public.vehicle_classes vc
join public.rate_versions rv on rv.slug = 'rt-rv'
join public.settings_versions sv on sv.slug = 'launch-baseline'
where vc.slug = 'rt-first';
grant select on rt_fx to public;

create function pg_temp.rt_snapshot()
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'vehicle_class_id', fx.vehicle_class_id,
    'rate_version_id', fx.rate_version_id,
    'settings_version_id', fx.settings_version_id,
    'engine_version', 'quote-engine@settle-revive',
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
      'policy_doc', 'settle-revive'
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
  from rt_fx fx
$$;
grant execute on function pg_temp.rt_snapshot() to public;

create function pg_temp.rt_legs(p_scheduled_at timestamptz)
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
  from rt_fx fx
$$;
grant execute on function pg_temp.rt_legs(timestamptz) to public;

create function pg_temp.rt_book(
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
        'contact_name', 'Settle Revive Guest',
        'contact_email', p_email,
        'contact_phone', '+417****7082'
      ),
      p_locale => 'en',
      p_display_currency => 'CHF',
      p_snapshot => pg_temp.rt_snapshot(),
      p_legs => pg_temp.rt_legs(p_scheduled_at),
      p_coupon_id => p_coupon_id,
      p_coupon_code => p_coupon_code,
      p_manage_token_hash => p_hash,
      p_manage_token_expires_at => (select token_expires_at from rt_fx),
      p_stripe_payment_intent_id => p_pi,
      p_stripe_checkout_session_id => p_cs,
      p_charged_rappen => 6,
      p_actor_customer_id => null
    )
$$;
grant execute on function pg_temp.rt_book(
  uuid, text, text, text, bytea, text, timestamptz, int8, text
) to public;

-- Grants (D-07 threat T-26.1-07) ------------------------------------------------
select function_privs_are('public', 'checkout_payment_settle',
  '{text,text,text,text,text,numeric,text,timestamptz,int8,text}'::text[], 'anon', '{}'::text[],
  'checkout_payment_settle v2: anon holds no EXECUTE');
select function_privs_are('public', 'checkout_payment_settle',
  '{text,text,text,text,text,numeric,text,timestamptz,int8,text}'::text[], 'authenticated', '{}'::text[],
  'checkout_payment_settle v2: authenticated holds no EXECUTE');
select function_privs_are('public', 'checkout_payment_settle',
  '{text,text,text,text,text,numeric,text,timestamptz,int8,text}'::text[], 'vamos_system', '{EXECUTE}'::text[],
  'checkout_payment_settle v2: vamos_system holds EXECUTE');
select function_privs_are('public', 'checkout_duplicate_refund_record',
  '{int8,text,rappen,text}'::text[], 'anon', '{}'::text[],
  'checkout_duplicate_refund_record: anon holds no EXECUTE');
select function_privs_are('public', 'checkout_duplicate_refund_record',
  '{int8,text,rappen,text}'::text[], 'authenticated', '{}'::text[],
  'checkout_duplicate_refund_record: authenticated holds no EXECUTE');
select function_privs_are('public', 'checkout_duplicate_refund_record',
  '{int8,text,rappen,text}'::text[], 'vamos_system', '{EXECUTE}'::text[],
  'checkout_duplicate_refund_record: vamos_system holds EXECUTE');

-- Every event id this file settles needs its own stripe_events row first --
-- checkout_payment_settle only stamps processed_at on an existing row (it is
-- not the insert-first ledger step; that is stripe_event_record, tested in
-- settlement_rpcs.test.sql).
insert into public.stripe_events (id, type, stripe_created, object_id, payload)
values
  ('evt_rt_happy', 'checkout.session.completed', now(), 'cs_rt_happy', '{}'::jsonb),
  ('evt_rt_multi', 'checkout.session.completed', now(), 'cs_rt_multi_a', '{}'::jsonb),
  ('evt_rt_expire', 'checkout.session.completed', now(), 'cs_rt_expire', '{}'::jsonb),
  ('evt_rt_account', 'checkout.session.completed', now(), 'cs_rt_account', '{}'::jsonb),
  ('evt_rt_abandon', 'checkout.session.completed', now(), 'cs_rt_abandon', '{}'::jsonb),
  ('evt_rt_staff', 'checkout.session.completed', now(), 'cs_rt_staff', '{}'::jsonb),
  ('evt_rt_requote', 'checkout.session.completed', now(), 'cs_rt_requote', '{}'::jsonb),
  ('evt_rt_past', 'checkout.session.completed', now(), 'cs_rt_past', '{}'::jsonb),
  ('evt_rt_test', 'checkout.session.completed', now(), 'cs_rt_test', '{}'::jsonb),
  ('evt_rt_dup_1', 'checkout.session.completed', now(), 'cs_rt_dup_1', '{}'::jsonb),
  ('evt_rt_dup_2', 'checkout.session.completed', now(), 'cs_rt_dup_2', '{}'::jsonb),
  ('evt_rt_dup_2b', 'checkout.session.completed', now(), 'cs_rt_dup_2', '{}'::jsonb);

-- 1. Happy path: pending booking, cs_ stored at creation, pi_ written back on
--    settle, booking confirmed (D-05). -----------------------------------------
set local role vamos_checkout;
create temporary table rt_out_happy as
  select * from pg_temp.rt_book(
    '10000000-0000-4000-8000-000000000001'::uuid, 'rt-happy',
    'cs_rt_happy', 'cs_rt_happy',
    decode(repeat('01', 32), 'hex'), 'rt-happy@example.test',
    now() + interval '3 days'
  );
reset role;
select lives_ok(
  $$ select 1 from rt_out_happy $$,
  'happy: booking created'
);

create temporary table rt_settle_happy as
  select * from public.checkout_payment_settle(
    'evt_rt_happy', 'cs_rt_happy', 'pi_rt_happy', 'succeeded',
    'CHF', null, null, null, null
  );

select is(
  (select bp.status from public.booking_payments bp join rt_out_happy o on o.payment_id = bp.id),
  'succeeded', 'happy: payment status succeeded'
);
select is(
  (select bp.stripe_payment_intent_id from public.booking_payments bp join rt_out_happy o on o.payment_id = bp.id),
  'pi_rt_happy', 'happy: cs_ written at creation is corrected to the real pi_ at settle (D-05)'
);
select is(
  (select b.status::text from public.bookings b join rt_out_happy o on o.booking_id = b.id),
  'confirmed', 'happy: booking confirmed'
);
select is((select revived from rt_settle_happy), false, 'happy: revived is false');
select is((select duplicate from rt_settle_happy), false, 'happy: duplicate is false');
select is((select refund_required from rt_settle_happy), false, 'happy: refund_required is false');
select is((select refund_reason from rt_settle_happy), null, 'happy: refund_reason is null');
select ok(
  (select processed_at is not null from public.stripe_events where id = 'evt_rt_happy'),
  'happy: stripe_events.processed_at stamped'
);

-- 2. other_open_session_ids + whitelist: cs_->pi_ allowed, pi_->anything refused ---
set local role vamos_checkout;
create temporary table rt_out_multi as
  select * from pg_temp.rt_book(
    '10000000-0000-4000-8000-000000000002'::uuid, 'rt-multi',
    'cs_rt_multi_a', 'cs_rt_multi_a',
    decode(repeat('02', 32), 'hex'), 'rt-multi@example.test',
    now() + interval '3 days'
  );
reset role;

select lives_ok(
  $$
    insert into public.booking_payments (
      booking_id, snapshot_id, stripe_payment_intent_id, stripe_checkout_session_id,
      charged_rappen, charged_currency, status
    )
    select o.booking_id, o.snapshot_id, 'cs_rt_multi_b', 'cs_rt_multi_b', 6, 'CHF', 'requires_payment'
      from rt_out_multi o
  $$,
  'multi: second requires_payment row inserted on the same snapshot'
);

select lives_ok(
  $$
    insert into public.booking_payments (
      booking_id, snapshot_id, stripe_payment_intent_id, stripe_checkout_session_id,
      charged_rappen, charged_currency, status
    )
    select o.booking_id, o.snapshot_id, 'pi_rt_direct_x', null, 6, 'CHF', 'requires_payment'
      from rt_out_multi o
  $$,
  'multi: a third row inserted whose stripe_payment_intent_id is already pi_-shaped'
);

create temporary table rt_settle_multi as
  select * from public.checkout_payment_settle(
    'evt_rt_multi', 'cs_rt_multi_a', 'pi_rt_multi_a', 'succeeded',
    'CHF', null, null, null, null
  );

select is(
  (select other_open_session_ids from rt_settle_multi),
  array['cs_rt_multi_b'],
  'multi: other_open_session_ids returns the sibling requires_payment session (D-21/D-22)'
);
select is(
  (select b.status::text from public.bookings b join rt_out_multi o on o.booking_id = b.id),
  'confirmed', 'multi: settled booking confirmed'
);

select throws_ok(
  $$ update public.booking_payments set stripe_payment_intent_id = 'pi_rt_direct_y' where stripe_payment_intent_id = 'pi_rt_direct_x' $$,
  '23001', null,
  'whitelist: changing an already-pi_ value on a non-succeeded row still raises restrict_violation'
);

select throws_ok(
  $$ update public.booking_payments set stripe_payment_intent_id = 'pi_rt_other' where stripe_payment_intent_id = 'pi_rt_happy' $$,
  '23001', null,
  'whitelist: a succeeded row stays terminal for stripe_payment_intent_id'
);

-- 3. Revive: cancelled via expire_unpaid (cron), pickup ahead, coupon use --------
--    given back and reclaimed by the revive (D-03/D-11a intent).
--    See the file header note: this state is constructed by hand rather than
--    through the real checkout_expire_unpaid() cron RPC.
set local role vamos_checkout;
create temporary table rt_out_expire as
  select * from pg_temp.rt_book(
    '10000000-0000-4000-8000-000000000010'::uuid, 'rt-expire',
    'cs_rt_expire', 'cs_rt_expire',
    decode(repeat('10', 32), 'hex'), 'rt-expire@example.test',
    now() + interval '3 days',
    (select id from rt_coupon),
    'RT-REVIVE-10'
  );
reset role;

select ok(
  (select exists (
     select 1 from public.coupon_redemptions r
     join rt_out_expire o on o.booking_id = r.booking_id
     where r.released_at is null
  )),
  'expire: coupon_redemptions row exists, unreleased, right after booking'
);

-- Simulate a prior coupon-release side effect (D-11a, not this plan) so the
-- revive's own clear-the-release step has something real to undo.
update public.coupon_redemptions r
   set released_at = now(), released_reason = 'unpaid_cancel'
  from rt_out_expire o
 where r.booking_id = o.booking_id;

update public.booking_legs bl
   set status = 'cancelled'
  from rt_out_expire o
 where bl.booking_id = o.booking_id
   and bl.status not in ('completed', 'no_show', 'cancelled');

update public.bookings b
   set status = 'cancelled', updated_at = now()
  from rt_out_expire o
 where b.id = o.booking_id;

insert into public.booking_events (
  booking_id, kind, actor_kind, actor_label, from_status, to_status, payload
)
select o.booking_id, 'booking.status_changed', 'cron', 'unpaid lock',
       'pending'::public.booking_status, 'cancelled'::public.booking_status,
       jsonb_build_object('via', 'expire_unpaid')
  from rt_out_expire o;

select ok(
  (select b.status::text = 'cancelled' from public.bookings b join rt_out_expire o on o.booking_id = b.id),
  'expire: booking is cancelled before settle'
);

create temporary table rt_settle_expire as
  select * from public.checkout_payment_settle(
    'evt_rt_expire', 'cs_rt_expire', 'pi_rt_expire', 'succeeded',
    'CHF', null, null, null, null
  );

select is(
  (select b.status::text from public.bookings b join rt_out_expire o on o.booking_id = b.id),
  'confirmed', 'expire: revived to confirmed (D-03)'
);
select is(
  (select bl.status::text from public.booking_legs bl join rt_out_expire o on o.booking_id = bl.booking_id),
  'confirmed', 'expire: leg revived to confirmed'
);
select ok(
  (select exists (
     select 1 from public.booking_events e
     join rt_out_expire o on o.booking_id = e.booking_id
     where e.kind = 'booking.revived'
  )),
  'expire: booking.revived event written'
);
select is(
  (select r.released_at from public.coupon_redemptions r join rt_out_expire o on o.booking_id = r.booking_id),
  null, 'expire: coupon_redemptions.released_at cleared by the revive'
);
select is((select revived from rt_settle_expire), true, 'expire: revived flag true');
select is((select refund_required from rt_settle_expire), false, 'expire: refund_required false');
select ok(
  (select processed_at is not null from public.stripe_events where id = 'evt_rt_expire'),
  'expire: stripe_events.processed_at stamped'
);

-- 4. Revive: cancelled via account_cancel, pickup ahead (D-03/D-18) -------------
set local role vamos_checkout;
create temporary table rt_out_account as
  select * from pg_temp.rt_book(
    '10000000-0000-4000-8000-000000000003'::uuid, 'rt-account',
    'cs_rt_account', 'cs_rt_account',
    decode(repeat('03', 32), 'hex'), 'rt-account@example.test',
    now() + interval '3 days'
  );
grant select on rt_out_account to public;
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object('sub', '20000000-0000-4000-8000-000000000003', 'role', 'authenticated', 'email', 'rt-account@example.test')::text,
  true
);
select lives_ok(
  $$ select * from public.checkout_cancel_unpaid((select reference from rt_out_account)) $$,
  'account: checkout_cancel_unpaid cancels the pending booking'
);
reset role;

select ok(
  (select b.status::text = 'cancelled' from public.bookings b join rt_out_account o on o.booking_id = b.id),
  'account: booking is cancelled before settle'
);

create temporary table rt_settle_account as
  select * from public.checkout_payment_settle(
    'evt_rt_account', 'cs_rt_account', 'pi_rt_account', 'succeeded',
    'CHF', null, null, null, null
  );

select is(
  (select b.status::text from public.bookings b join rt_out_account o on o.booking_id = b.id),
  'confirmed', 'account: revived to confirmed (D-03)'
);
select is((select revived from rt_settle_account), true, 'account: revived flag true');
select ok(
  (select processed_at is not null from public.stripe_events where id = 'evt_rt_account'),
  'account: stripe_events.processed_at stamped'
);

-- 5. Revive: cancelled via leave_payment / abandon (D-03) -----------------------
set local role vamos_checkout;
create temporary table rt_out_abandon as
  select * from pg_temp.rt_book(
    '10000000-0000-4000-8000-000000000004'::uuid, 'rt-abandon',
    'cs_rt_abandon', 'cs_rt_abandon',
    decode(repeat('04', 32), 'hex'), 'rt-abandon@example.test',
    now() + interval '3 days'
  );
reset role;

set local role vamos_checkout;
select lives_ok(
  $$
    select * from public.checkout_abandon_unpaid(
      '10000000-0000-4000-8000-000000000004'::uuid
    )
  $$,
  'abandon: checkout_abandon_unpaid cancels by quote_id'
);
reset role;

select ok(
  (select b.status::text = 'cancelled' from public.bookings b join rt_out_abandon o on o.booking_id = b.id),
  'abandon: booking is cancelled before settle'
);
select is(
  (select bp.status from public.booking_payments bp join rt_out_abandon o on o.payment_id = bp.id),
  'canceled', 'abandon: payment row set to canceled by the abandon RPC'
);

create temporary table rt_settle_abandon as
  select * from public.checkout_payment_settle(
    'evt_rt_abandon', 'cs_rt_abandon', 'pi_rt_abandon', 'succeeded',
    'CHF', null, null, null, null
  );

select is(
  (select b.status::text from public.bookings b join rt_out_abandon o on o.booking_id = b.id),
  'confirmed', 'abandon: revived to confirmed even though the customer left payment (D-03)'
);
select is((select revived from rt_settle_abandon), true, 'abandon: revived flag true');
select is(
  (select bp.status from public.booking_payments bp join rt_out_abandon o on o.payment_id = bp.id),
  'succeeded', 'abandon: payment transitions canceled -> succeeded'
);

-- 6. Revive: staff (ops) cancel also revives (D-03a) ----------------------------
set local role vamos_checkout;
create temporary table rt_out_staff as
  select * from pg_temp.rt_book(
    '10000000-0000-4000-8000-000000000005'::uuid, 'rt-staff',
    'cs_rt_staff', 'cs_rt_staff',
    decode(repeat('05', 32), 'hex'), 'rt-staff@example.test',
    now() + interval '3 days'
  );
reset role;

select lives_ok(
  $$
    select * from public.ops_cancel_booking(
      (select booking_id from rt_out_staff), null::uuid
    )
  $$,
  'staff: ops_cancel_booking cancels the pending booking'
);

select ok(
  (select b.status::text = 'cancelled' from public.bookings b join rt_out_staff o on o.booking_id = b.id),
  'staff: booking is cancelled before settle'
);

create temporary table rt_settle_staff as
  select * from public.checkout_payment_settle(
    'evt_rt_staff', 'cs_rt_staff', 'pi_rt_staff', 'succeeded',
    'CHF', null, null, null, null
  );

select is(
  (select b.status::text from public.bookings b join rt_out_staff o on o.booking_id = b.id),
  'confirmed', 'staff: staff-cancelled booking still revives to confirmed (D-03a)'
);
select is((select revived from rt_settle_staff), true, 'staff: revived flag true');

-- 7. Requote-cancelled: never revived, refunded instead (D-03b) -----------------
set local role vamos_checkout;
create temporary table rt_out_requote as
  select * from pg_temp.rt_book(
    '10000000-0000-4000-8000-000000000006'::uuid, 'rt-requote',
    'cs_rt_requote', 'cs_rt_requote',
    decode(repeat('06', 32), 'hex'), 'rt-requote@example.test',
    now() + interval '3 days'
  );
reset role;

set local role vamos_checkout;
select lives_ok(
  $$
    select * from public.checkout_requote_cancel(
      '10000000-0000-4000-8000-000000000006'::uuid
    )
  $$,
  'requote: checkout_requote_cancel cancels by quote_id'
);
reset role;

select ok(
  (select b.status::text = 'cancelled' from public.bookings b join rt_out_requote o on o.booking_id = b.id),
  'requote: booking is cancelled before settle'
);

create temporary table rt_settle_requote as
  select * from public.checkout_payment_settle(
    'evt_rt_requote', 'cs_rt_requote', 'pi_rt_requote', 'succeeded',
    'CHF', null, null, null, null
  );

select is(
  (select b.status::text from public.bookings b join rt_out_requote o on o.booking_id = b.id),
  'cancelled', 'requote: booking stays cancelled, never revived (a successor booking exists)'
);
select is((select revived from rt_settle_requote), false, 'requote: revived flag false');
select is((select refund_required from rt_settle_requote), true, 'requote: refund_required true');
select is(
  (select refund_reason from rt_settle_requote), 'requote_superseded',
  'requote: refund_reason is requote_superseded'
);
select ok(
  (select processed_at is not null from public.stripe_events where id = 'evt_rt_requote'),
  'requote: stripe_events.processed_at stamped'
);

-- 8. Paid after cancel: pickup already passed, never revived (D-03 exception) ---
set local role vamos_checkout;
create temporary table rt_out_past as
  select * from pg_temp.rt_book(
    '10000000-0000-4000-8000-000000000007'::uuid, 'rt-past',
    'cs_rt_past', 'cs_rt_past',
    decode(repeat('07', 32), 'hex'), 'rt-past@example.test',
    now() - interval '2 days'
  );
grant select on rt_out_past to public;
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object('sub', '20000000-0000-4000-8000-000000000007', 'role', 'authenticated', 'email', 'rt-past@example.test')::text,
  true
);
select lives_ok(
  $$ select * from public.checkout_cancel_unpaid((select reference from rt_out_past)) $$,
  'past: checkout_cancel_unpaid cancels the pending (already-past-pickup) booking'
);
reset role;

select ok(
  (select b.status::text = 'cancelled' from public.bookings b join rt_out_past o on o.booking_id = b.id),
  'past: booking is cancelled before settle'
);

create temporary table rt_settle_past as
  select * from public.checkout_payment_settle(
    'evt_rt_past', 'cs_rt_past', 'pi_rt_past', 'succeeded',
    'CHF', null, null, null, null
  );

select is(
  (select b.status::text from public.bookings b join rt_out_past o on o.booking_id = b.id),
  'cancelled', 'past: booking stays cancelled -- pickup already passed'
);
select is((select revived from rt_settle_past), false, 'past: revived flag false');
select is((select refund_required from rt_settle_past), true, 'past: refund_required true');
select is(
  (select refund_reason from rt_settle_past), 'paid_after_cancel',
  'past: refund_reason is paid_after_cancel'
);
select ok(
  (select processed_at is not null from public.stripe_events where id = 'evt_rt_past'),
  'past: stripe_events.processed_at stamped'
);

-- 9. is_test booking: money captured, booking untouched (D-03 exception) -------
set local role vamos_checkout;
create temporary table rt_out_test as
  select * from pg_temp.rt_book(
    '10000000-0000-4000-8000-000000000008'::uuid, 'rt-test',
    'cs_rt_test', 'cs_rt_test',
    decode(repeat('08', 32), 'hex'), 'rt-test@example.test',
    now() + interval '3 days'
  );
reset role;

update public.bookings set is_test = true
 where id = (select booking_id from rt_out_test);

create temporary table rt_settle_test as
  select * from public.checkout_payment_settle(
    'evt_rt_test', 'cs_rt_test', 'pi_rt_test', 'succeeded',
    'CHF', null, null, null, null
  );

select is(
  (select b.status::text from public.bookings b join rt_out_test o on o.booking_id = b.id),
  'pending', 'is_test: booking status untouched'
);
select is((select refund_required from rt_settle_test), true, 'is_test: refund_required true');
select is(
  (select refund_reason from rt_settle_test), 'test_booking',
  'is_test: refund_reason is test_booking'
);
select is(
  (select bp.status from public.booking_payments bp join rt_out_test o on o.payment_id = bp.id),
  'succeeded', 'is_test: payment still captured'
);
select ok(
  (select processed_at is not null from public.stripe_events where id = 'evt_rt_test'),
  'is_test: stripe_events.processed_at stamped'
);

-- 10. Duplicate: a second succeeded charge on an already-paid, staff-cancelled --
--    booking is flagged duplicate, not double-revived (D-22). ------------------
set local role vamos_checkout;
create temporary table rt_out_dup as
  select * from pg_temp.rt_book(
    '10000000-0000-4000-8000-000000000009'::uuid, 'rt-dup',
    'cs_rt_dup_1', 'cs_rt_dup_1',
    decode(repeat('09', 32), 'hex'), 'rt-dup@example.test',
    now() + interval '3 days'
  );
reset role;

select lives_ok(
  $$
    insert into public.booking_payments (
      booking_id, snapshot_id, stripe_payment_intent_id, stripe_checkout_session_id,
      charged_rappen, charged_currency, status
    )
    select o.booking_id, o.snapshot_id, 'cs_rt_dup_2', 'cs_rt_dup_2', 6, 'CHF', 'requires_payment'
      from rt_out_dup o
  $$,
  'dup: second requires_payment row inserted on the same snapshot'
);

select lives_ok(
  $$
    select * from public.checkout_payment_settle(
      'evt_rt_dup_1', 'cs_rt_dup_1', 'pi_rt_dup_1', 'succeeded', 'CHF', null, null, null, null
    )
  $$,
  'dup: first payment settles without error'
);
select is(
  (select b.status::text from public.bookings b join rt_out_dup o on o.booking_id = b.id),
  'confirmed', 'dup: booking confirmed after the first payment'
);

select lives_ok(
  $$
    select * from public.ops_cancel_booking(
      (select booking_id from rt_out_dup), null::uuid
    )
  $$,
  'dup: staff cancels the now-paid booking'
);
select ok(
  (select b.status::text = 'cancelled' from public.bookings b join rt_out_dup o on o.booking_id = b.id),
  'dup: booking is cancelled (paid=true) before the second settle'
);

-- The second payment row settling succeeded IS the duplicate scenario: another
-- succeeded row (cs_rt_dup_1) already exists on the same snapshot.
select lives_ok(
  $$
    select * from public.checkout_payment_settle(
      'evt_rt_dup_2', 'cs_rt_dup_2', 'pi_rt_dup_2', 'succeeded', 'CHF', null, null, null, null
    )
  $$,
  'dup: second succeeded settle raises no exception (never 23505)'
);

select is(
  (select bp.status from public.booking_payments bp where bp.stripe_checkout_session_id = 'cs_rt_dup_2'),
  'duplicate', 'dup: second row lands as duplicate status, not succeeded'
);
select is(
  (select b.status::text from public.bookings b join rt_out_dup o on o.booking_id = b.id),
  'cancelled', 'dup: booking never revived twice -- stays cancelled'
);

-- Replay the same event id/session to prove the duplicate branch is safe to
-- retry (Stripe Queue redelivery) and still reports already_settled.
create temporary table rt_settle_dup2b as
  select * from public.checkout_payment_settle(
    'evt_rt_dup_2b', 'cs_rt_dup_2', 'pi_rt_dup_2', 'succeeded', 'CHF', null, null, null, null
  );

select is((select duplicate from rt_settle_dup2b), true, 'dup: duplicate flag true');
select is((select already_settled from rt_settle_dup2b), true, 'dup: already_settled true so the live Worker never sends a second confirmation');
select is((select refund_required from rt_settle_dup2b), true, 'dup: refund_required true');
select is((select refund_reason from rt_settle_dup2b), 'duplicate_charge', 'dup: refund_reason is duplicate_charge');
select ok(
  (select processed_at is not null from public.stripe_events where id = 'evt_rt_dup_2'),
  'dup: stripe_events.processed_at stamped'
);

-- 11. checkout_duplicate_refund_record -------------------------------------------
select lives_ok(
  $$
    select * from public.checkout_duplicate_refund_record(
      (select bp.id from public.booking_payments bp where bp.stripe_checkout_session_id = 'cs_rt_dup_2'),
      're_rt_dup_1', 6, 'duplicate_charge'
    )
  $$,
  'refund_record: records a duplicate_charge refund'
);

select is(
  (select r.reason from public.booking_refunds r where r.stripe_refund_id = 're_rt_dup_1'),
  'duplicate_charge', 'refund_record: reason stored is duplicate_charge'
);
select is(
  (select b.refund_status from public.bookings b join rt_out_dup o on o.booking_id = b.id),
  'none', 'refund_record: duplicate_charge does not touch bookings.refund_status'
);

select lives_ok(
  $$
    select * from public.checkout_duplicate_refund_record(
      (select bp.id from public.booking_payments bp where bp.stripe_checkout_session_id = 'cs_rt_dup_2'),
      're_rt_dup_1', 6, 'duplicate_charge'
    )
  $$,
  'refund_record: idempotent replay on the same stripe_refund_id'
);
select is(
  (select count(*)::bigint from public.booking_refunds where stripe_refund_id = 're_rt_dup_1'),
  1::bigint, 'refund_record: exactly one row for that stripe_refund_id after the replay'
);

select lives_ok(
  $$
    select * from public.checkout_duplicate_refund_record(
      (select bp.id from public.booking_payments bp join rt_out_test o on o.payment_id = bp.id),
      're_rt_test_1', 6, 'test_booking'
    )
  $$,
  'refund_record: records a test_booking refund'
);
select is(
  (select b.refund_status from public.bookings b join rt_out_test o on o.booking_id = b.id),
  'refunded', 'refund_record: test_booking DOES set bookings.refund_status'
);
select is(
  (select b.refunded_rappen from public.bookings b join rt_out_test o on o.booking_id = b.id) > 0,
  true, 'refund_record: test_booking increments refunded_rappen'
);

select * from finish();
rollback;
