-- refunds_by_hand.test.sql
--
-- 20-10 P1: refunds by hand. Nothing goes to Stripe on a cancel; a paid booking cancelled
-- more than 24 h ahead is left as "refund due" (pending_ops + owed = captured) and the team
-- sends the money, payment by payment, through booking_refund_intents.
--   1.1/1.2  the cancel rule in app.apply_customer_cancel and ops_cancel_booking
--   1.3      table booking_refund_intents
--   1.4      ops_refund_plan (percent OR exact amount; full-tier rule)
--   1.5      ops_refund_intent_sent
--   1.6      ops_refund_intent_failed
--   E        ops_refund_decide refuses a decline on a full-tier booking
-- Rolled back. Synthetic integer rappen only (10000 = 100 %), never a product CHF.
begin;
select plan(102);

insert into public.vehicle_classes (slug, passenger_capacity, luggage_capacity)
values ('rh-class', 3, 3);

insert into auth.users (id, email, aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('20100000-0000-4000-a000-000000000001', 'rh-admin@vamostaxi.eu', 'authenticated', 'authenticated', '{}'::jsonb, '{}'::jsonb, now(), now());
insert into public.staff (user_id, role, active, accepted_at, full_name)
values ('20100000-0000-4000-a000-000000000001', 'admin', true, now(), 'RH Admin');

create temporary table fx (k text primary key, id uuid not null);
create temporary table pay (k text not null, n int not null, id bigint not null, primary key (k, n));

-- One booking with one leg (origin role: the leg trigger sets original_scheduled_at).
create function pg_temp.rh_mk(p_key text, p_offs interval, p_paid boolean default true)
returns uuid language plpgsql as $$
declare
  v_b uuid;
begin
  insert into public.bookings (contact_name, contact_email, status)
  values ('RH ' || p_key, 'rh-' || p_key || '@vamostaxi.eu',
          case when p_paid then 'paid' else 'pending' end::public.booking_status)
  returning id into v_b;

  insert into public.booking_legs (
    booking_id, leg_seq, direction, pickup_text, dropoff_text,
    scheduled_at, scheduled_local, vehicle_class_id, status
  )
  select v_b, 1, 'outbound', 'ZRH Airport', 'Zurich HB',
         now() + p_offs, to_char(now() + p_offs, 'YYYY-MM-DD"T"HH24:MI'), vc.id, 'confirmed'
    from public.vehicle_classes vc where vc.slug = 'rh-class';
  insert into pg_temp.fx values (p_key, v_b);
  return v_b;
end $$;

-- One snapshot per amount and (when paid) one captured payment per amount (replica role).
create function pg_temp.rh_pay(p_key text, p_amounts int[], p_paid boolean default true)
returns void language plpgsql as $$
declare
  v_b uuid := (select id from pg_temp.fx where k = p_key);
  v_snap bigint;
  v_pay bigint;
  v_amt int;
  v_i int := 0;
begin
  foreach v_amt in array p_amounts loop
    v_i := v_i + 1;
    insert into public.price_snapshots (
      quote_id, vehicle_class_id, rate_version_id, rate_version_is_live, settings_version_id,
      engine_version, pax, bags, lines, policy,
      subtotal_rappen, surcharges_rappen, discount_rappen, total_rappen,
      expires_at, quote_lock_expires_at, booking_id
    )
    select gen_random_uuid(), vc.id, rv.id, false, sv.id,
           'quote-engine@20-10-' || p_key || '-' || v_i,
           2, 2, '[]'::jsonb,
           jsonb_build_object(
             'cancellation_tiers', '[]'::jsonb, 'free_cancel_hours', 24,
             'airport_waiting_minutes', 60, 'city_waiting_minutes', 15,
             'settings_version_id', sv.id, 'modification_deadline_hours', 24,
             'min_advance_minutes', 180, 'policy_doc', 'rh'),
           v_amt, 0, 0, v_amt,
           now() + interval '1 day', now() + interval '1 day', v_b
      from public.vehicle_classes vc
      cross join lateral (select id from public.rate_versions order by id limit 1) rv
      cross join lateral (select id from public.settings_versions order by id limit 1) sv
     where vc.slug = 'rh-class'
    returning id into v_snap;
    if p_paid then
      insert into public.booking_payments (
        booking_id, snapshot_id, stripe_payment_intent_id, charged_rappen, status, captured_at
      ) values (v_b, v_snap, 'pi_rh_' || p_key || '_' || v_i, v_amt, 'succeeded', now())
      returning id into v_pay;
      insert into pg_temp.pay values (p_key, v_i, v_pay);
    end if;
  end loop;
end $$;

create function pg_temp.b(p_key text) returns uuid language sql as $$ select id from pg_temp.fx where k = p_key $$;
create function pg_temp.p(p_key text, p_n int) returns bigint language sql as $$ select id from pg_temp.pay where k = p_key and n = p_n $$;
create function pg_temp.adm() returns uuid language sql as $$ select '20100000-0000-4000-a000-000000000001'::uuid $$;

select pg_temp.rh_mk('g30', interval '30 hours');
select pg_temp.rh_mk('c30', interval '30 hours');
select pg_temp.rh_mk('a3', interval '3 hours');
select pg_temp.rh_mk('u30', interval '30 hours', false);
select pg_temp.rh_mk('s30', interval '30 hours');
select pg_temp.rh_mk('s3', interval '3 hours');
select pg_temp.rh_mk('t2a', interval '30 hours');
select pg_temp.rh_mk('t2b', interval '30 hours');
select pg_temp.rh_mk('t2c', interval '30 hours');
select pg_temp.rh_mk('t2d', interval '30 hours');
select pg_temp.rh_mk('d1', interval '3 hours');
select pg_temp.rh_mk('d2', interval '3 hours');
select pg_temp.rh_mk('d3', interval '3 hours');
select pg_temp.rh_mk('d4', interval '3 hours');
select pg_temp.rh_mk('d5', interval '3 hours');
select pg_temp.rh_mk('d6', interval '3 hours');
select pg_temp.rh_mk('paid', interval '30 hours');

set local session_replication_role = replica;
select pg_temp.rh_pay('g30', array[8000]);
select pg_temp.rh_pay('c30', array[8000]);
select pg_temp.rh_pay('a3', array[8000]);
select pg_temp.rh_pay('u30', array[8000], false);
select pg_temp.rh_pay('s30', array[8000]);
select pg_temp.rh_pay('s3', array[8000]);
select pg_temp.rh_pay('t2a', array[10000, 2000]);
select pg_temp.rh_pay('t2b', array[10000, 2000]);
select pg_temp.rh_pay('t2c', array[10000, 2000]);
select pg_temp.rh_pay('t2d', array[10000, 2000]);
select pg_temp.rh_pay('d1', array[10000]);
select pg_temp.rh_pay('d2', array[10000]);
select pg_temp.rh_pay('d3', array[10000]);
select pg_temp.rh_pay('d4', array[10000]);
select pg_temp.rh_pay('d5', array[10000]);
select pg_temp.rh_pay('d6', array[10000, 2000]);
select pg_temp.rh_pay('paid', array[8000]);
set local session_replication_role = origin;

update public.bookings b
   set price_snapshot_id = (select min(s.id) from public.price_snapshots s where s.booking_id = b.id)
 where b.id in (select id from pg_temp.fx);

insert into public.booking_access_tokens (booking_id, token_hash, expires_at)
values (pg_temp.b('g30'), extensions.digest('rh-g30-token', 'sha256'), now() + interval '1 day');

-- ── shape, grants ────────────────────────────────────────────────────────────────── 17
select has_table('public', 'booking_refund_intents', 'booking_refund_intents exists');
select has_function('public', 'ops_refund_plan',
  array['uuid', 'uuid', 'bigint', 'numeric', 'text', 'boolean', 'integer'], 'ops_refund_plan exists');
select has_function('public', 'ops_refund_intent_sent',
  array['bigint', 'text', 'rappen', 'text', 'timestamp with time zone'], 'ops_refund_intent_sent exists');
select has_function('public', 'ops_refund_intent_failed', array['bigint', 'text', 'boolean'], 'ops_refund_intent_failed exists');
select function_privs_are('public', 'ops_refund_plan', '{uuid,uuid,int8,numeric,text,bool,int4}'::text[], 'vamos_system', '{EXECUTE}'::text[],
  'ops_refund_plan: vamos_system holds EXECUTE');
select function_privs_are('public', 'ops_refund_plan', '{uuid,uuid,int8,numeric,text,bool,int4}'::text[], 'anon', '{}'::text[],
  'ops_refund_plan: anon holds no EXECUTE');
select function_privs_are('public', 'ops_refund_plan', '{uuid,uuid,int8,numeric,text,bool,int4}'::text[], 'authenticated', '{}'::text[],
  'ops_refund_plan: authenticated holds no EXECUTE');
select function_privs_are('public', 'ops_refund_intent_sent', '{int8,text,rappen,text,timestamptz}'::text[], 'vamos_system', '{EXECUTE}'::text[],
  'ops_refund_intent_sent: vamos_system holds EXECUTE');
select function_privs_are('public', 'ops_refund_intent_sent', '{int8,text,rappen,text,timestamptz}'::text[], 'authenticated', '{}'::text[],
  'ops_refund_intent_sent: authenticated holds no EXECUTE');
select function_privs_are('public', 'ops_refund_intent_sent', '{int8,text,rappen,text,timestamptz}'::text[], 'anon', '{}'::text[],
  'ops_refund_intent_sent: anon holds no EXECUTE');
select function_privs_are('public', 'ops_refund_intent_failed', '{int8,text,bool}'::text[], 'vamos_system', '{EXECUTE}'::text[],
  'ops_refund_intent_failed: vamos_system holds EXECUTE');
select function_privs_are('public', 'ops_refund_intent_failed', '{int8,text,bool}'::text[], 'authenticated', '{}'::text[],
  'ops_refund_intent_failed: authenticated holds no EXECUTE');
select function_privs_are('public', 'ops_refund_intent_failed', '{int8,text,bool}'::text[], 'anon', '{}'::text[],
  'ops_refund_intent_failed: anon holds no EXECUTE');
select table_privs_are('public', 'booking_refund_intents', 'vamos_staff', '{SELECT}'::text[], 'vamos_staff reads booking_refund_intents, nothing else');
select table_privs_are('public', 'booking_refund_intents', 'anon', '{}'::text[], 'anon holds no privilege on booking_refund_intents');
select table_privs_are('public', 'booking_refund_intents', 'authenticated', '{}'::text[], 'authenticated holds no privilege on booking_refund_intents');
select table_privs_are('public', 'booking_refund_intents', 'vamos_guest', '{}'::text[], 'vamos_guest holds no privilege on booking_refund_intents');

-- ── 1.1 / 1.2 the cancel rule ─────────────────────────────────────────────────────── 12
select lives_ok(
  $$ select * from public.manage_booking_cancel(extensions.digest('rh-g30-token', 'sha256')) $$,
  'guest cancel 30 h before pickup of a paid booking lives');
select ok(
  (select refund_status = 'pending_ops' and refund_owed_rappen = 8000
     from public.bookings where id = pg_temp.b('g30')),
  'cancel > 24 h, paid, guest link -> pending_ops, owed = captured (8000)');
select ok(
  exists (select 1 from public.booking_events
           where booking_id = pg_temp.b('g30') and kind = 'booking.status_changed'
             and payload ->> 'refund_mode' = 'auto_full' and (payload ->> 'refund_rappen')::int = 8000),
  'the cancel event still says refund_mode auto_full, refund_rappen 8000');
select is(
  (select refund_mode from app.apply_customer_cancel(pg_temp.b('c30'), null, 'customer', 'rh', 'rh')),
  'auto_full', 'apply_customer_cancel at 30 h returns refund_mode auto_full');
select ok(
  (select refund_status = 'pending_ops' and refund_owed_rappen = 8000
     from public.bookings where id = pg_temp.b('c30')),
  'apply_customer_cancel > 24 h, paid -> pending_ops, owed = captured');
select lives_ok(
  format($f$select * from public.customer_paid_cancel(%L::uuid)$f$, pg_temp.b('paid')),
  'customer_paid_cancel of a paid booking 30 h ahead lives');
select ok(
  (select refund_status = 'pending_ops' and refund_owed_rappen = 8000
     from public.bookings where id = pg_temp.b('paid')),
  'customer_paid_cancel > 24 h -> pending_ops, owed = captured');
select lives_ok(
  format($f$select * from app.apply_customer_cancel(%L::uuid, null, 'customer', 'rh', 'rh')$f$, pg_temp.b('a3')),
  'cancel 3 h before pickup lives');
select ok(
  (select refund_status = 'pending_ops' and refund_owed_rappen is null
     from public.bookings where id = pg_temp.b('a3')),
  'cancel inside 24 h, paid -> pending_ops, owed null (unchanged: the team decides)');
select ok(
  (select (select refund_mode from app.apply_customer_cancel(pg_temp.b('u30'), null, 'customer', 'rh', 'rh')) = 'auto_full'
      and b.refund_status = 'none' and coalesce(b.refund_owed_rappen, 0) = 0
     from public.bookings b where b.id = pg_temp.b('u30')),
  'cancel > 24 h of an UNPAID booking -> refund_status none, nothing owed');
select * from public.ops_cancel_booking(pg_temp.b('s30'), pg_temp.adm());
select ok(
  (select refund_status = 'pending_ops' and refund_owed_rappen = 8000
     from public.bookings where id = pg_temp.b('s30')),
  'staff cancel > 24 h, paid -> pending_ops, owed = captured');
select * from public.ops_cancel_booking(pg_temp.b('s3'), pg_temp.adm());
select ok(
  (select refund_status = 'pending_ops' and refund_owed_rappen is null
     from public.bookings where id = pg_temp.b('s3')),
  'staff cancel inside 24 h, paid -> pending_ops, owed null (unchanged)');

-- two payments (10000 + 2000), cancelled 30 h ahead by staff: a full-tier booking
select * from public.ops_cancel_booking(pg_temp.b('t2a'), pg_temp.adm());
select * from public.ops_cancel_booking(pg_temp.b('t2b'), pg_temp.adm());
select * from public.ops_cancel_booking(pg_temp.b('t2c'), pg_temp.adm());
select * from public.ops_cancel_booking(pg_temp.b('t2d'), pg_temp.adm());

-- ── 1.3 table ────────────────────────────────────────────────────────────────────── 3
select throws_ok(
  format($f$insert into public.booking_refund_intents
      (booking_id, payment_id, batch_id, amount_rappen, reason, tier, state)
    values (%L::uuid, %s, gen_random_uuid(), 100, 'ops_cancel', 'full', 'x')$f$,
    pg_temp.b('g30'), pg_temp.p('g30', 1)),
  '23514', null, 'the state check refuses an unknown state');
insert into public.booking_refund_intents (booking_id, payment_id, batch_id, amount_rappen, reason, tier, state)
values (pg_temp.b('g30'), pg_temp.p('g30', 1), gen_random_uuid(), 100, 'ops_cancel', 'full', 'intended');
select throws_ok(
  format($f$insert into public.booking_refund_intents
      (booking_id, payment_id, batch_id, amount_rappen, reason, tier, state)
    values (%L::uuid, %s, gen_random_uuid(), 100, 'ops_cancel', 'full', 'failed')$f$,
    pg_temp.b('g30'), pg_temp.p('g30', 1)),
  '23505', null, 'a second open intent for one payment is refused');
select ok(
  (select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.booking_refund_intents'::regclass)
  and not exists (select 1 from pg_policies where tablename = 'booking_refund_intents'
                   and roles && array['anon', 'authenticated', 'vamos_guest']::name[]),
  'RLS on and forced, no policy for anon / authenticated / vamos_guest');
delete from public.booking_refund_intents where booking_id = pg_temp.b('g30');

-- ── 1.4 plan: refusals ───────────────────────────────────────────────────────────── 12
select throws_ok(
  format($f$select * from public.ops_refund_plan(%L::uuid, %L::uuid)$f$, gen_random_uuid(), pg_temp.adm()),
  'P0002', 'not-found', 'plan: unknown booking -> not-found');
select throws_ok(
  format($f$select * from public.ops_refund_plan(%L::uuid, %L::uuid)$f$, pg_temp.b('u30'), pg_temp.adm()),
  'P0001', 'not-paid', 'plan: nothing captured -> not-paid');
select throws_ok(
  format($f$select * from public.ops_refund_plan(%L::uuid, %L::uuid, %s)$f$, pg_temp.b('t2a'), pg_temp.adm(), pg_temp.p('d1', 1)),
  'P0001', 'not-paid', 'plan: a payment of another booking -> not-paid');
select throws_ok(
  format($f$select * from public.ops_refund_plan(%L::uuid, %L::uuid, p_resume_only => true)$f$, pg_temp.b('t2a'), pg_temp.adm()),
  'P0001', 'nothing-to-retry', 'plan: retry with no open intent -> nothing-to-retry');
select throws_ok(
  format($f$select * from public.ops_refund_plan(%L::uuid, %L::uuid, p_reason => 'bogus')$f$, pg_temp.b('t2a'), pg_temp.adm()),
  '22023', 'invalid-reason', 'plan: unknown reason -> invalid-reason');
select throws_ok(
  format($f$select * from public.ops_refund_plan(%L::uuid, %L::uuid, p_percent => 0)$f$, pg_temp.b('d1'), pg_temp.adm()),
  '22023', 'invalid-amount', 'plan: percent 0 -> invalid-amount');
select throws_ok(
  format($f$select * from public.ops_refund_plan(%L::uuid, %L::uuid, p_percent => 101)$f$, pg_temp.b('d1'), pg_temp.adm()),
  '22023', 'invalid-amount', 'plan: percent above 100 -> invalid-amount');
select throws_ok(
  format($f$select * from public.ops_refund_plan(%L::uuid, %L::uuid, p_amount_rappen => 0)$f$, pg_temp.b('d1'), pg_temp.adm()),
  '22023', 'invalid-amount', 'plan: exact amount 0 -> invalid-amount');
select throws_ok(
  format($f$select * from public.ops_refund_plan(%L::uuid, %L::uuid, p_percent => 50, p_amount_rappen => 3500)$f$, pg_temp.b('d1'), pg_temp.adm()),
  '22023', 'invalid-amount', 'plan: percent and exact amount together -> refused');
select throws_ok(
  format($f$select * from public.ops_refund_plan(%L::uuid, %L::uuid, p_amount_rappen => 3500)$f$, pg_temp.b('d6'), pg_temp.adm()),
  '22023', 'invalid-amount', 'plan: exact amount with two payments and none chosen -> refused');
select is((select count(*)::int from public.booking_refund_intents), 0, 'no refusal left an intent behind');
select is(
  (select refund_status from public.bookings where id = pg_temp.b('t2a')),
  'pending_ops', 'no refusal changed the booking');

-- ── decided tier (inside 24 h): percent or exact amount ───────────────────────────── 11
select * from app.apply_customer_cancel(pg_temp.b('d1'), null, 'customer', 'rh', 'rh');
select * from app.apply_customer_cancel(pg_temp.b('d2'), null, 'customer', 'rh', 'rh');
select * from app.apply_customer_cancel(pg_temp.b('d3'), null, 'customer', 'rh', 'rh');
select * from app.apply_customer_cancel(pg_temp.b('d4'), null, 'customer', 'rh', 'rh');
select * from app.apply_customer_cancel(pg_temp.b('d5'), null, 'customer', 'rh', 'rh');
select * from app.apply_customer_cancel(pg_temp.b('d6'), null, 'customer', 'rh', 'rh');

-- 3000 of the 10000 payment already refunded, on d1..d5 (recorded directly, as Stripe would have).
insert into public.booking_refunds (
  booking_id, snapshot_id, payment_id, reason, basis_rappen, refund_percent, refund_rappen,
  tier_applied, hours_before, stripe_refund_id)
select b.id, p.snapshot_id, p.id, 'ops_cancel', 10000, 30, 3000,
       '{"source":"ops_decided"}'::jsonb, 3, 're_rh_prior_' || f.k
  from pg_temp.fx f
  join public.bookings b on b.id = f.id
  join public.booking_payments p on p.booking_id = b.id
 where f.k in ('d1', 'd2', 'd3', 'd4', 'd5');
update public.bookings set refunded_rappen = 3000
 where id in (select id from pg_temp.fx where k in ('d1', 'd2', 'd3', 'd4', 'd5'));

create temporary table pl_d1 as
  select * from public.ops_refund_plan(pg_temp.b('d1'), pg_temp.adm(), p_percent => 50);
select is((select count(*)::int from pl_d1), 1, 'decided: percent 50 of a 10000 payment -> one intent');
select is((select amount_rappen from pl_d1), 5000,
  'decided: 50 % of what was PAID (10000), 30 already refunded -> 5000, not 50 % of what is left');
select ok(
  (select refund_status = 'processing' and refund_owed_rappen = 8000
     from public.bookings where id = pg_temp.b('d1')),
  'decided: booking is processing and owes refunded + planned (3000 + 5000)');
select ok(
  (select i.state = 'intended' and i.decided_percent = 50 and i.tier = 'decided'
          and i.actor_id = pg_temp.adm() and i.attempts = 0
     from public.booking_refund_intents i where i.id = (select intent_id from pl_d1)),
  'decided: intent row carries the percent, tier decided, the actor, attempts 0');
select is(
  (select amount_rappen from public.ops_refund_plan(pg_temp.b('d2'), pg_temp.adm(), p_amount_rappen => 3500)),
  3500, 'decided: exact amount 3500 -> 3500');
select is(
  (select decided_percent from public.booking_refund_intents where booking_id = pg_temp.b('d2')),
  35.00, 'decided: an exact amount stores its percent of the payment (35.00)');
select throws_ok(
  format($f$select * from public.ops_refund_plan(%L::uuid, %L::uuid, p_amount_rappen => 8000)$f$, pg_temp.b('d3'), pg_temp.adm()),
  'P0001', 'refund-exceeds-remaining', 'decided: exact 8000 when 7000 is left -> refused');
select throws_ok(
  format($f$select * from public.ops_refund_plan(%L::uuid, %L::uuid, p_percent => 40, p_amount_rappen => 3500)$f$, pg_temp.b('d4'), pg_temp.adm()),
  '22023', 'invalid-amount', 'decided: percent and exact amount together -> refused');
select is(
  (select amount_rappen from public.ops_refund_plan(pg_temp.b('d5'), pg_temp.adm(), p_percent => 100)),
  7000, 'decided: 100 % of a partly refunded payment is capped at what is left (7000)');
select is(
  (select amount_rappen from public.ops_refund_plan(pg_temp.b('d6'), pg_temp.adm(), pg_temp.p('d6', 2), p_amount_rappen => 500)),
  500, 'decided: exact amount with one chosen payment of two -> that payment only');
select is(
  (select count(*)::int from public.booking_refund_intents where booking_id = pg_temp.b('d6')),
  1, 'decided: choosing one payment plans no intent for the other');

-- ── full tier: 100 % only ─────────────────────────────────────────────────────────── 8
select ok(
  (select refund_status = 'pending_ops' and refund_owed_rappen = 12000
     from public.bookings where id = pg_temp.b('t2d')),
  'two payments cancelled > 24 h: pending_ops, owed = 10000 + 2000');
select throws_ok(
  format($f$select * from public.ops_refund_plan(%L::uuid, %L::uuid, p_percent => 50)$f$, pg_temp.b('t2d'), pg_temp.adm()),
  'P0001', 'full-refund-only', 'full tier: 50 % of all payments is refused');
select throws_ok(
  format($f$select * from public.ops_refund_plan(%L::uuid, %L::uuid, pg_temp.p('t2d', 1)::bigint, p_percent => 50)$f$, pg_temp.b('t2d'), pg_temp.adm()),
  'P0001', 'full-refund-only', 'full tier: 50 % of one chosen payment is refused');
select throws_ok(
  format($f$select * from public.ops_refund_plan(%L::uuid, %L::uuid, %s::bigint, p_amount_rappen => 5000)$f$, pg_temp.b('t2d'), pg_temp.adm(), pg_temp.p('t2d', 1)),
  'P0001', 'full-refund-only', 'full tier: an exact amount below the payment''s remainder is refused');
select is((select count(*)::int from public.booking_refund_intents where booking_id = pg_temp.b('t2d')), 0,
  'full tier: the refused plans left no intent');

create temporary table dq as
  select format($f$select public.ops_refund_decide(%L::uuid, 'decline')$f$, pg_temp.b('t2d')) as q;
grant select on dq to vamos_staff;
set local role vamos_staff;
select set_config('request.jwt.claims',
  jsonb_build_object('sub', '20100000-0000-4000-a000-000000000001', 'role', 'authenticated', 'aal', 'aal2',
    'app_metadata', jsonb_build_object('vamos_role', 'admin'))::text,
  true);
select throws_ok(
  (select q from dq),
  'P0001', 'full-refund-only', 'full tier: the admin cannot decline');
reset role;
select set_config('request.jwt.claims', '', true);
select ok(
  (select refund_status = 'pending_ops' and refund_owed_rappen = 12000
     from public.bookings where id = pg_temp.b('t2d')),
  'full tier: the refused decline changed nothing');
select ok(
  not exists (select 1 from public.booking_events where booking_id = pg_temp.b('t2d') and kind = 'refund.declined'),
  'full tier: the refused decline wrote no event');

-- ── 1.4 plan: two payments, all of it ─────────────────────────────────────────────── 8
create temporary table pl_t2a as
  select * from public.ops_refund_plan(pg_temp.b('t2a'), pg_temp.adm());
select is((select count(*)::int from pl_t2a), 2, 'plan {}: two payments -> two intents');
select is((select array_agg(amount_rappen order by payment_id) from pl_t2a), array[10000, 2000],
  'plan {}: 10000 and 2000 (the rest of each payment)');
select ok(
  (select bool_and(resumed = false and state = 'intended' and attempts = 0
                   and idempotency_key = 'refund-intent:' || intent_id
                   and stripe_payment_intent_id like 'pi_rh_t2a_%') from pl_t2a),
  'plan {}: fresh intents, key refund-intent:<id>, Stripe payment intent returned');
select ok(
  (select refund_status = 'processing' and refund_owed_rappen = 12000
     from public.bookings where id = pg_temp.b('t2a')),
  'plan {}: booking processing, owed stays 12000');
select is((select array_agg(amount_rappen order by payment_id)
             from public.ops_refund_plan(pg_temp.b('t2b'), pg_temp.adm(), p_percent => 100)),
  array[10000, 2000], 'plan 100 % of all payments: two intents 10000 and 2000');
select is(
  (select array_agg(intent_id order by payment_id) from public.ops_refund_plan(pg_temp.b('t2a'), pg_temp.adm())),
  (select array_agg(intent_id order by payment_id) from pl_t2a),
  'a second plan while intents are open returns the same intents');
select ok(
  (select bool_and(resumed) from public.ops_refund_plan(pg_temp.b('t2a'), pg_temp.adm(), p_percent => 50)),
  'a second plan (even with other arguments) is a resume');
select is((select count(*)::int from public.booking_refund_intents where booking_id = pg_temp.b('t2a')), 2,
  'a second plan created no new row');

-- ── 1.4 plan: one payment on a full-tier booking ──────────────────────────────────── 3
create temporary table pl_t2c as
  select * from public.ops_refund_plan(pg_temp.b('t2c'), pg_temp.adm(), pg_temp.p('t2c', 1), 100);
select ok(
  (select count(*) = 1 and min(amount_rappen) = 10000 and min(payment_id) = pg_temp.p('t2c', 1) from pl_t2c),
  'full tier: pick one payment at 100 % -> one intent of 10000 on that payment');
select ok(
  (select refund_status = 'processing' and refund_owed_rappen = 12000
     from public.bookings where id = pg_temp.b('t2c')),
  'full tier: owed keeps 12000 while only one payment is planned');
select ok(
  (select intent_id from public.ops_refund_plan(pg_temp.b('t2c'), pg_temp.adm())) = (select intent_id from pl_t2c),
  'full tier: a plan for everything while the one intent is open resumes it');

-- ── 1.5 intent_sent ───────────────────────────────────────────────────────────────── 20
select ok(
  (select refund_rappen = 10000 and payment_id = pg_temp.p('t2c', 1) and booking_id = pg_temp.b('t2c')
          and reference is not null and refunded_rappen = 10000 and due_rappen = 2000
          and open_intents = 0 and refund_status = 'pending_ops'
     from public.ops_refund_intent_sent(
            (select intent_id from pl_t2c), 're_rh_t2c_1', 25, 'CH', '2026-10-03T00:00:00Z')),
  'sent, one payment of a full-tier booking: refunded 10000, due 2000, no open intent, back to pending_ops');
select ok(
  exists (select 1 from public.booking_refunds r
           where r.stripe_refund_id = 're_rh_t2c_1' and r.payment_id = pg_temp.p('t2c', 1)
             and r.refund_rappen = 10000 and r.basis_rappen = 10000 and r.refund_percent = 100
             and r.decided_by = pg_temp.adm() and r.payout_country = 'CH'
             and r.available_on = '2026-10-03T00:00:00Z' and r.reason = 'ops_cancel'
             and r.tier_applied ->> 'source' = 'ops_full'),
  'sent: one booking_refunds row with actor, payout facts and the full-tier source');
select ok(
  exists (select 1 from public.booking_events e
           where e.booking_id = pg_temp.b('t2c') and e.kind = 'refund.issued'
             and e.payment_id = pg_temp.p('t2c', 1) and e.actor_id = pg_temp.adm()),
  'sent: a refund.issued event by the actor on that payment');
select is((select stripe_fee_rappen::int from public.booking_payments where id = pg_temp.p('t2c', 1)), 25,
  'sent: the Stripe fee is stored on the payment');
select ok(
  (select i.state = 'sent' and i.stripe_refund_id = 're_rh_t2c_1' and i.refund_id is not null
     from public.booking_refund_intents i where i.id = (select intent_id from pl_t2c)),
  'sent: the intent is marked sent and linked to its refund row');
select ok(
  (select refunded_rappen = 10000 and refund_owed_rappen = 12000 and refund_status = 'pending_ops'
     from public.bookings where id = pg_temp.b('t2c')),
  'sent: booking pending_ops, refunded 10000, owed 12000 (the rest is still due)');
-- the same call again: no second row
select ok(
  (select refunded_rappen = 10000 and due_rappen = 2000
     from public.ops_refund_intent_sent((select intent_id from pl_t2c), 're_rh_t2c_1')),
  'sent twice: same facts back');
select is((select count(*)::int from public.booking_refunds where booking_id = pg_temp.b('t2c')), 1,
  'sent twice: still one booking_refunds row');
select is((select refunded_rappen::int from public.bookings where id = pg_temp.b('t2c')), 10000,
  'sent twice: refunded_rappen counted once');
select is((select count(*)::int from public.booking_events where booking_id = pg_temp.b('t2c') and kind = 'refund.issued'), 1,
  'sent twice: one refund.issued event');
-- the rest of the full-tier booking can be planned after the first one (100 % of the remaining payment)
select is(
  (select array_agg(amount_rappen) from public.ops_refund_plan(pg_temp.b('t2c'), pg_temp.adm())),
  array[2000], 'after one payment was sent, a plan {} plans only the rest (2000)');

-- two intents, one sent -> processing; one failed -> failed with what went and what is due
select ok(
  (select refund_status = 'processing' and open_intents = 1 and refunded_rappen = 10000 and due_rappen = 2000
     from public.ops_refund_intent_sent(
            (select intent_id from pl_t2a where payment_id = pg_temp.p('t2a', 1)), 're_rh_t2a_1')),
  'two intents, one sent: processing, one open, refunded 10000, due 2000');
select ok(
  (select state = 'failed' and attempts = 1 and open_intents = 1 and refund_status = 'failed'
          and refunded_rappen = 10000 and due_rappen = 2000
     from public.ops_refund_intent_failed(
            (select intent_id from pl_t2a where payment_id = pg_temp.p('t2a', 2)), 'card_declined')),
  'failed: intent failed, attempts 1, booking failed, refunded 10000 and due 2000 are derivable');
select ok(
  (select i.last_error = 'card_declined' from public.booking_refund_intents i
    where i.id = (select intent_id from pl_t2a where payment_id = pg_temp.p('t2a', 2))),
  'failed: last_error kept');
select ok(
  (select state = 'sent' and attempts = 0
     from public.ops_refund_intent_failed(
            (select intent_id from pl_t2a where payment_id = pg_temp.p('t2a', 1)), 'late error')),
  'failed on a sent intent: no change');
select ok(
  (select bool_and(resumed) and count(*) = 1 and min(state) = 'failed' and min(attempts) = 1
     from public.ops_refund_plan(pg_temp.b('t2a'), pg_temp.adm(), p_resume_only => true)),
  'retry: plan resumes only the failed intent, attempts 1');
select ok(
  (select refund_status = 'processing' from public.bookings where id = pg_temp.b('t2a')),
  'retry: the booking is processing again');
select ok(
  (select refund_status = 'refunded' and due_rappen = 0 and refunded_rappen = 12000 and open_intents = 0
     from public.ops_refund_intent_sent(
            (select intent_id from pl_t2a where payment_id = pg_temp.p('t2a', 2)), 're_rh_t2a_2')),
  'both sent: refunded, due 0, refunded 12000');
select throws_ok(
  format($f$select * from public.ops_refund_plan(%L::uuid, %L::uuid)$f$, pg_temp.b('t2a'), pg_temp.adm()),
  'P0001', 'already-refunded', 'plan on a fully refunded booking -> already-refunded');

-- ── 1.6 void ──────────────────────────────────────────────────────────────────────── 6
create temporary table pl_t2b as
  select * from public.ops_refund_plan(pg_temp.b('t2b'), pg_temp.adm());
select ok(
  (select count(*) = 2 from pl_t2b where resumed),
  'the earlier plan of t2b is still open, so this call resumed it');
select ok(
  (select refund_status = 'processing' from public.ops_refund_intent_sent(
     (select intent_id from pl_t2b where payment_id = pg_temp.p('t2b', 1)), 're_rh_t2b_1')),
  'void case: first payment sent');
select ok(
  (select state = 'void' and open_intents = 0 and refund_status = 'pending_ops' and due_rappen = 2000
     from public.ops_refund_intent_failed(
            (select intent_id from pl_t2b where payment_id = pg_temp.p('t2b', 2)), 'charge_already_refunded', true)),
  'void: the intent is void and closed; full-tier booking goes back to pending_ops with 2000 due');
select is(
  (select array_agg(amount_rappen) from public.ops_refund_plan(pg_temp.b('t2b'), pg_temp.adm())),
  array[2000], 'void: a new plan is possible and plans the 2000');
select is(
  (select attempts from public.booking_refund_intents
    where id = (select intent_id from pl_t2b where payment_id = pg_temp.p('t2b', 2))),
  1, 'void: the void intent keeps its attempt count');
select throws_ok(
  $$ select * from public.ops_refund_intent_sent(0, 're_rh_none') $$,
  'P0002', 'not-found', 'sent: unknown intent -> not-found');

-- ── decided tier settles to what went ─────────────────────────────────────────────── 3
select ok(
  (select refund_status = 'refunded' and refunded_rappen = 8000 and due_rappen = 0
     from public.ops_refund_intent_sent((select intent_id from pl_d1), 're_rh_d1')),
  'decided: 3000 already refunded + 5000 sent -> refunded, due 0');
select ok(
  (select refund_owed_rappen = 8000 from public.bookings where id = pg_temp.b('d1')),
  'decided: owed = refunded after the decided amount went');
create temporary table fl_d2 as
  select * from public.ops_refund_intent_failed(
    (select id from public.booking_refund_intents where booking_id = pg_temp.b('d2')), 'gone', true);
select ok(
  (select refund_status = 'pending_ops' and due_rappen = 0 and state = 'void' from fl_d2)
  and (select refund_owed_rappen is null from public.bookings where id = pg_temp.b('d2')),
  'decided, void, nothing else sent: back to pending_ops with owed null (the team decides again)');

select * from finish();
rollback;
