-- checkout_rpc.test.sql
--
-- Proves plan 07-02: public.checkout_create_booking is the only checkout writer.
-- Grant model (D-01 / T-07-04), status='pending' (D-02), hashed manage token (D-03),
-- U20 replay, coupon cap (Phase 4 D-30), timeline (DATA-08), charge-gate rollback
-- (QUOTE-10). Synthetic figures, rolled back at the end of this file -- never a
-- real CHF amount (D-34).
begin;
select plan(39);

-- Fixtures --------------------------------------------------------------------------------
insert into public.vehicle_classes (slug, passenger_capacity, luggage_capacity)
values ('first', 3, 3);

insert into public.rate_versions (slug, label)
values
  ('checkout-rpc-rv', 'Checkout RPC live fixture'),
  ('checkout-rpc-draft', 'Checkout RPC draft fixture');

-- Synthetic figures, rolled back at the end of this file -- never a real CHF amount (D-34).
insert into public.distance_rates (
  rate_version_id, vehicle_class_id, max_pax, base_fare_rappen, per_km_rappen, min_fare_rappen
)
select rv.id, vc.id, 3, 1, 2, 3
  from public.rate_versions rv, public.vehicle_classes vc
 where rv.slug in ('checkout-rpc-rv', 'checkout-rpc-draft')
   and vc.slug = 'first';

update public.rate_versions set status = 'live' where slug = 'checkout-rpc-rv';

insert into public.coupons (code, kind, percent, global_limit, active)
values ('CHECKOUTRPC', 'percent', 10.00, 1, true);

create temporary table crpc_fx as
select
  vc.id as vehicle_class_id,
  live.id as live_rate_version_id,
  draft.id as draft_rate_version_id,
  sv.id as settings_version_id,
  cpn.id as coupon_id,
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
    'policy_doc', 'checkout-rpc'
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
join public.rate_versions live on live.slug = 'checkout-rpc-rv'
join public.rate_versions draft on draft.slug = 'checkout-rpc-draft'
join public.settings_versions sv on sv.slug = 'launch-baseline'
join public.coupons cpn on cpn.code = 'CHECKOUTRPC'
where vc.slug = 'first';
grant select on crpc_fx to public;

create function pg_temp.crpc_snapshot(p_rate_version_id bigint, p_engine text)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'vehicle_class_id', fx.vehicle_class_id,
    'rate_version_id', p_rate_version_id,
    'settings_version_id', fx.settings_version_id,
    'engine_version', p_engine,
    'lock_exp', fx.lock_exp,
    'pax', 1,
    'bags', 0,
    'lines', fx.lines,
    'policy', fx.policy,
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
  from crpc_fx fx
$$;
grant execute on function pg_temp.crpc_snapshot(bigint, text) to public;

create function pg_temp.crpc_call(
  p_quote_id uuid,
  p_key text,
  p_pi text,
  p_cs text,
  p_hash bytea,
  p_coupon_id bigint default null,
  p_coupon_code text default null,
  p_rate_version_id bigint default null,
  p_engine text default 'quote-engine@checkout-rpc'
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
        'contact_name', 'Checkout RPC Guest',
        'contact_email', 'checkout-rpc@example.test',
        'contact_phone', '+41796267082'
      ),
      p_locale => 'en',
      p_display_currency => 'CHF',
      p_snapshot => pg_temp.crpc_snapshot(
        coalesce(p_rate_version_id, (select live_rate_version_id from crpc_fx)),
        p_engine
      ),
      p_legs => (select legs from crpc_fx),
      p_coupon_id => p_coupon_id,
      p_coupon_code => p_coupon_code,
      p_manage_token_hash => p_hash,
      p_manage_token_expires_at => (select token_expires_at from crpc_fx),
      p_stripe_payment_intent_id => p_pi,
      p_stripe_checkout_session_id => p_cs,
      p_charged_rappen => 6,
      p_actor_customer_id => null
    )
$$;
grant execute on function pg_temp.crpc_call(uuid, text, text, text, bytea, bigint, text, bigint, text) to public;

-- Arg types for function_privs_are (must match the CREATE FUNCTION argument list).
-- uuid,text,jsonb,text,text,jsonb,jsonb,int8,text,bytea,timestamptz,text,text,rappen,uuid

-- Grant model (D-01, T-07-04) -------------------------------------------------
select function_privs_are(
  'public', 'checkout_create_booking',
  '{uuid,text,jsonb,text,text,jsonb,jsonb,int8,text,bytea,timestamptz,text,text,rappen,uuid}'::text[],
  'anon', '{}'::text[],
  '(grant a) anon holds no EXECUTE on checkout_create_booking (D-01)'
);
select function_privs_are(
  'public', 'checkout_create_booking',
  '{uuid,text,jsonb,text,text,jsonb,jsonb,int8,text,bytea,timestamptz,text,text,rappen,uuid}'::text[],
  'authenticated', '{}'::text[],
  '(grant b) authenticated holds no EXECUTE on checkout_create_booking (D-01)'
);
select function_privs_are(
  'public', 'checkout_create_booking',
  '{uuid,text,jsonb,text,text,jsonb,jsonb,int8,text,bytea,timestamptz,text,text,rappen,uuid}'::text[],
  'vamos_public', '{}'::text[],
  '(grant c) vamos_public holds no EXECUTE on checkout_create_booking (D-01)'
);
select function_privs_are(
  'public', 'checkout_create_booking',
  '{uuid,text,jsonb,text,text,jsonb,jsonb,int8,text,bytea,timestamptz,text,text,rappen,uuid}'::text[],
  'vamos_staff', '{}'::text[],
  '(grant d) vamos_staff holds no EXECUTE on checkout_create_booking (D-01)'
);
select function_privs_are(
  'public', 'checkout_create_booking',
  '{uuid,text,jsonb,text,text,jsonb,jsonb,int8,text,bytea,timestamptz,text,text,rappen,uuid}'::text[],
  'vamos_guest', '{}'::text[],
  '(grant e) vamos_guest holds no EXECUTE on checkout_create_booking (D-01)'
);
select function_privs_are(
  'public', 'checkout_create_booking',
  '{uuid,text,jsonb,text,text,jsonb,jsonb,int8,text,bytea,timestamptz,text,text,rappen,uuid}'::text[],
  'vamos_checkout', '{EXECUTE}'::text[],
  '(grant f) vamos_checkout holds EXECUTE on checkout_create_booking (D-01)'
);

set local role anon;
select throws_ok(
  $$
    insert into public.bookings (contact_name, contact_email)
    values ('anon cannot insert', 'anon-insert@example.test')
  $$,
  '42501',
  null,
  '(grant g) direct insert into bookings as anon raises 42501 (D-01)'
);
reset role;

create temporary table crpc_out (
  booking_id uuid,
  reference text,
  snapshot_id bigint,
  payment_id bigint,
  replayed boolean
);
grant all on crpc_out to public;

set local role vamos_checkout;
select lives_ok(
  $$
    insert into crpc_out
    select * from pg_temp.crpc_call(
      '00000000-0000-4000-8000-000000000101'::uuid,
      'checkout-rpc-happy',
      'pi_checkout_rpc_happy',
      'cs_checkout_rpc_happy',
      decode(repeat('11', 32), 'hex')
    )
  $$,
  '(grant h) checkout_create_booking as vamos_checkout succeeds (D-01)'
);
reset role;

-- Initial state (D-02) --------------------------------------------------------
select is(
  (select b.status::text from public.bookings b join crpc_out o on o.booking_id = b.id),
  'pending',
  '(state a) bookings.status is pending, not quote (D-02)'
);
select matches(
  (select o.reference from crpc_out o),
  '^VT-[0-9]{2}-[0-9]{4,5}$',
  '(state b) bookings.reference matches VT-YY-NNNNN'
);
select is(
  (select bp.status::text from public.booking_payments bp join crpc_out o on o.payment_id = bp.id),
  'requires_payment',
  '(state c) booking_payments.status is requires_payment'
);
select is(
  (select bp.charged_currency from public.booking_payments bp join crpc_out o on o.payment_id = bp.id),
  'CHF',
  '(state d) booking_payments.charged_currency is CHF'
);
select is(
  (select bp.fx_rate from public.booking_payments bp join crpc_out o on o.payment_id = bp.id),
  null,
  '(state e) fx_rate is NULL'
);
select is(
  (select bp.fx_source from public.booking_payments bp join crpc_out o on o.payment_id = bp.id),
  null,
  '(state f) fx_source is NULL'
);
select is(
  (select bp.fx_quoted_at from public.booking_payments bp join crpc_out o on o.payment_id = bp.id),
  null,
  '(state g) fx_quoted_at is NULL'
);
select is(
  (select bp.presentment_amount_minor from public.booking_payments bp join crpc_out o on o.payment_id = bp.id),
  null,
  '(state h) presentment_amount_minor is NULL'
);
select is(
  (select b.price_snapshot_id from public.bookings b join crpc_out o on o.booking_id = b.id),
  (select o.snapshot_id from crpc_out o),
  '(state i) bookings.price_snapshot_id equals returned snapshot_id'
);
select is(
  (select s.booking_id from public.price_snapshots s join crpc_out o on o.snapshot_id = s.id),
  (select o.booking_id from crpc_out o),
  '(state j) price_snapshots.booking_id equals returned booking_id'
);

-- Manage token (D-03) ---------------------------------------------------------
select is(
  (select count(*)::bigint
     from public.booking_access_tokens t
     join crpc_out o on o.booking_id = t.booking_id),
  1::bigint,
  '(token a) exactly one booking_access_tokens row (D-03)'
);
select is(
  (select t.purpose
     from public.booking_access_tokens t
     join crpc_out o on o.booking_id = t.booking_id),
  'manage',
  '(token b) purpose is manage'
);
select is(
  (select octet_length(t.token_hash)
     from public.booking_access_tokens t
     join crpc_out o on o.booking_id = t.booking_id),
  32,
  '(token c) octet_length(token_hash) = 32'
);
select is(
  (select t.revoked_at
     from public.booking_access_tokens t
     join crpc_out o on o.booking_id = t.booking_id),
  null,
  '(token d) revoked_at is null'
);
select ok(
  (select t.expires_at > now()
     from public.booking_access_tokens t
     join crpc_out o on o.booking_id = t.booking_id),
  '(token e) expires_at > now()'
);
select ok(
  (select p.prosrc !~ 'gen_random_bytes'
     from pg_catalog.pg_proc p
     join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'checkout_create_booking'),
  '(token f) function source does not contain gen_random_bytes (D-03)'
);

-- Idempotent replay (U20) -----------------------------------------------------
create temporary table crpc_replay as
select * from pg_temp.crpc_call(
  '00000000-0000-4000-8000-000000000101'::uuid,
  'checkout-rpc-happy',
  'pi_checkout_rpc_happy',
  'cs_checkout_rpc_happy',
  decode(repeat('11', 32), 'hex')
);

select is(
  (select r.booking_id from crpc_replay r),
  (select o.booking_id from crpc_out o),
  '(replay a) same idempotency_key returns the same booking_id (U20)'
);
select is(
  (select r.reference from crpc_replay r),
  (select o.reference from crpc_out o),
  '(replay b) same idempotency_key returns the same reference (U20)'
);
select is(
  (select r.replayed from crpc_replay r),
  true,
  '(replay c) second call sets replayed = true (U20)'
);
select is(
  (select count(*)::bigint from public.bookings where idempotency_key = 'checkout-rpc-happy'),
  1::bigint,
  '(replay d) still one bookings row for that idempotency_key'
);
select is(
  (select count(*)::bigint
     from public.booking_payments bp
     join crpc_out o on o.booking_id = bp.booking_id),
  1::bigint,
  '(replay e) still one booking_payments row for that booking'
);
select throws_ok(
  $$
    select * from pg_temp.crpc_call(
      '00000000-0000-4000-8000-000000000101'::uuid,
      'checkout-rpc-second-key',
      'pi_checkout_rpc_second',
      'cs_checkout_rpc_second',
      decode(repeat('22', 32), 'hex')
    )
  $$,
  '23001',
  'quote_already_booked',
  '(replay f) same quote_id different idempotency_key raises quote_already_booked'
);

-- Coupon (Phase 4 D-30) -------------------------------------------------------
create temporary table crpc_coupon as
select * from pg_temp.crpc_call(
  '00000000-0000-4000-8000-000000000102'::uuid,
  'checkout-rpc-coupon-1',
  'pi_checkout_rpc_coupon_1',
  'cs_checkout_rpc_coupon_1',
  decode(repeat('33', 32), 'hex'),
  (select coupon_id from crpc_fx),
  'CHECKOUTRPC',
  null,
  'quote-engine@checkout-rpc-coupon-1'
);

select lives_ok(
  $$ select 1 from crpc_coupon $$,
  '(coupon a) first redemption against global_limit=1 succeeds (D-30)'
);
select throws_ok(
  $$
    select * from pg_temp.crpc_call(
      '00000000-0000-4000-8000-000000000103'::uuid,
      'checkout-rpc-coupon-2',
      'pi_checkout_rpc_coupon_2',
      'cs_checkout_rpc_coupon_2',
      decode(repeat('44', 32), 'hex'),
      (select coupon_id from crpc_fx),
      'CHECKOUTRPC',
      null,
      'quote-engine@checkout-rpc-coupon-2'
    )
  $$,
  '23001',
  null,
  '(coupon b) second redemption of the same coupon raises restrict_violation (D-30)'
);
select is(
  (select r.payment_id
     from public.coupon_redemptions r
     join crpc_coupon c on c.booking_id = r.booking_id),
  (select c.payment_id from crpc_coupon c),
  '(coupon c) redemption.payment_id points at the booking payment row'
);

-- Timeline (DATA-08) ----------------------------------------------------------
select is(
  (select count(*)::bigint
     from public.booking_events e
     join crpc_out o on o.booking_id = e.booking_id
    where e.kind in ('price.quoted', 'booking.created', 'payment.intent_created')),
  3::bigint,
  '(timeline a) three booking_events kinds for the booking (DATA-08)'
);
select ok(
  (select e.snapshot_id is not null
     from public.booking_events e
     join crpc_out o on o.booking_id = e.booking_id
    where e.kind = 'price.quoted'),
  '(timeline b) price.quoted carries snapshot_id'
);
select ok(
  (select e.payment_id is not null
     from public.booking_events e
     join crpc_out o on o.booking_id = e.booking_id
    where e.kind = 'payment.intent_created'),
  '(timeline c) payment.intent_created carries payment_id'
);
select is(
  (select e.actor_kind
     from public.booking_events e
     join crpc_out o on o.booking_id = e.booking_id
    where e.kind = 'booking.created'),
  'guest',
  '(timeline d) actor_kind is guest when no customer id was passed'
);

-- Charge gate still gates (QUOTE-10) ------------------------------------------
-- Nested block: the function raise must roll back the bookings INSERT, not
-- leave a pending row behind the exception.
do $nested$
begin
  begin
    perform * from pg_temp.crpc_call(
      '00000000-0000-4000-8000-000000000104'::uuid,
      'checkout-rpc-draft',
      'pi_checkout_rpc_draft',
      'cs_checkout_rpc_draft',
      decode(repeat('55', 32), 'hex'),
      null,
      null,
      (select draft_rate_version_id from crpc_fx),
      'quote-engine@checkout-rpc-draft'
    );
    raise exception 'checkout_create_booking did not raise on draft rate version';
  exception
    when sqlstate '23001' then
      null;
  end;
end
$nested$;

select throws_ok(
  $$
    select * from pg_temp.crpc_call(
      '00000000-0000-4000-8000-000000000105'::uuid,
      'checkout-rpc-draft-2',
      'pi_checkout_rpc_draft_2',
      'cs_checkout_rpc_draft_2',
      decode(repeat('66', 32), 'hex'),
      null,
      null,
      (select draft_rate_version_id from crpc_fx),
      'quote-engine@checkout-rpc-draft-2'
    )
  $$,
  '23001',
  null,
  '(gate a) draft rate version raises restrict_violation (QUOTE-10)'
);
select is(
  (select count(*)::bigint
     from public.bookings
    where idempotency_key in ('checkout-rpc-draft', 'checkout-rpc-draft-2')),
  0::bigint,
  '(gate b) draft raise leaves no bookings row (function rollback)'
);

select * from finish();
rollback;
