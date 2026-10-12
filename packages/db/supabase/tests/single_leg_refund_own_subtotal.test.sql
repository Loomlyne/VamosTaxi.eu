-- single_leg_refund_own_subtotal.test.sql
--
-- Owner decision 2026-10-11 (.planning/decisions/2026-10-11-single-leg-refund-own-subtotal.md),
-- migration 20261013100000. Closes GAP-3 of phase 04 validation. Cancelling one leg of a two-leg
-- booking refunds that leg's own amount:
--   rule 1  basis = the leg's price_snapshot_legs.leg_subtotal_rappen, booking discount shared pro rata
--   rule 2  window = hours from that leg's own original_scheduled_at
--   rule 3  never more than captured; all cancelled legs together never more than captured
--   rule 4  from the stored row only: a rate book change does not move it
-- plus: a whole-booking cancel is unchanged, a leg with no stored amount goes to the admin, and the
-- Refund click (ops_refund_plan) sends exactly the leg's amount.
-- Synthetic integer rappen only, rolled back.
begin;
select plan(42);

insert into public.vehicle_classes (slug, passenger_capacity, luggage_capacity)
values ('slr-class', 3, 3);
insert into public.rate_versions (slug, label) values ('slr-rv', 'SLR fixture');
insert into public.distance_rates (rate_version_id, vehicle_class_id, max_pax, base_fare_rappen, per_km_rappen, min_fare_rappen)
select rv.id, vc.id, 3, 1000, 300, 2000
  from public.rate_versions rv, public.vehicle_classes vc
 where rv.slug = 'slr-rv' and vc.slug = 'slr-class';

insert into auth.users (id, email, aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('26101301-0000-4000-a000-000000000001', 'slr-admin@vamostaxi.eu', 'authenticated', 'authenticated',
        '{}'::jsonb, '{}'::jsonb, now(), now());
insert into public.staff (user_id, role, active, accepted_at, full_name)
values ('26101301-0000-4000-a000-000000000001', 'admin', true, now(), 'SLR Admin');

-- A booking with one leg per entry of p_hours (leg 1 outbound, leg 2 return), a price snapshot with a
-- price_snapshot_legs row per leg (p_subs, null = no stored amount), a free_cancel_hours window of 24,
-- the given discount, and one captured payment of p_captured.
create function pg_temp.slr_booking(
  p_tag text, p_hours numeric[], p_subs int[], p_discount int, p_captured int
)
returns uuid
language plpgsql
as $$
declare
  v_id uuid;
  v_snap bigint;
  v_sum int := 0;
  i int;
begin
  insert into public.bookings (contact_name, contact_email, status)
  values ('SLR ' || p_tag, 'slr-' || p_tag || '@vamostaxi.eu', 'confirmed')
  returning id into v_id;

  for i in 1 .. array_length(p_hours, 1) loop
    insert into public.booking_legs (
      booking_id, leg_seq, direction, pickup_text, dropoff_text,
      scheduled_at, scheduled_local, vehicle_class_id, status
    )
    select v_id, i, (case when i = 1 then 'outbound' else 'return' end)::public.leg_direction,
           case when i = 1 then 'ZRH Airport' else 'Zurich HB' end,
           case when i = 1 then 'Zurich HB' else 'ZRH Airport' end,
           now() + (p_hours[i] * interval '1 hour'),
           to_char(now() + (p_hours[i] * interval '1 hour'), 'YYYY-MM-DD"T"HH24:MI'),
           vc.id, 'confirmed'
      from public.vehicle_classes vc where vc.slug = 'slr-class';
    v_sum := v_sum + coalesce(p_subs[i], 0);
  end loop;

  set local session_replication_role = replica;
  insert into public.price_snapshots (
    quote_id, vehicle_class_id, rate_version_id, rate_version_is_live, settings_version_id,
    engine_version, pax, bags, lines, policy,
    subtotal_rappen, surcharges_rappen, discount_rappen, total_rappen,
    expires_at, quote_lock_expires_at, booking_id
  )
  select gen_random_uuid(), vc.id, rv.id, false, sv.id, 'quote-engine@slr-' || p_tag, 2, 2, '[]'::jsonb,
         jsonb_build_object(
           'cancellation_tiers', '[]'::jsonb, 'free_cancel_hours', 24,
           'airport_waiting_minutes', 60, 'city_waiting_minutes', 15,
           'settings_version_id', sv.id, 'modification_deadline_hours', 24,
           'min_advance_minutes', 180, 'policy_doc', 'slr'
         ),
         v_sum, 0, p_discount, v_sum - p_discount, now() + interval '1 day', now() + interval '1 day', v_id
    from public.vehicle_classes vc
    cross join (select id from public.rate_versions where slug = 'slr-rv') rv
    cross join lateral (select id from public.settings_versions order by id limit 1) sv
   where vc.slug = 'slr-class'
  returning id into v_snap;
  update public.bookings set price_snapshot_id = v_snap where id = v_id;

  insert into public.price_snapshot_legs (snapshot_id, leg_seq, booking_leg_id, leg_subtotal_rappen)
  select v_snap, l.leg_seq, l.id, p_subs[l.leg_seq]
    from public.booking_legs l
   where l.booking_id = v_id;

  insert into public.booking_payments (
    booking_id, snapshot_id, stripe_payment_intent_id, charged_rappen, status, captured_at
  ) values (v_id, v_snap, 'pi_slr_' || p_tag, p_captured, 'succeeded', now());
  set local session_replication_role = origin;
  return v_id;
end;
$$;

create function pg_temp.slr_cancel(p_booking uuid, p_leg int)
returns table (refund_mode text, refund_rappen int, basis_rappen int, hours_before numeric)
language sql as $$
  select c.refund_mode, c.refund_rappen::int, c.basis_rappen::int, c.hours_before
    from app.apply_customer_cancel(p_booking, p_leg::int2, 'guest', 'slr test', 'manage_link') as c
$$;

create function pg_temp.slr_owed(p_booking uuid) returns int
language sql as $$ select refund_owed_rappen::int from public.bookings where id = p_booking $$;

create function pg_temp.slr_rs(p_booking uuid) returns text
language sql as $$ select refund_status from public.bookings where id = p_booking $$;

create function pg_temp.slr_last_payload(p_booking uuid) returns jsonb
language sql as $$
  select payload from public.booking_events
   where booking_id = p_booking and kind = 'booking.status_changed'
   order by id desc limit 1
$$;

create temp table fx (k text primary key, id uuid);

-- ── Decision test: legs 4000 + 6000, 10000 captured, cancel leg 2 ──────────────────────── 8
insert into fx values ('core', pg_temp.slr_booking('core', array[48, 96], array[4000, 6000], 0, 10000));
create temp table core_res as select * from pg_temp.slr_cancel((select id from fx where k = 'core'), 2);

select is((select refund_mode from core_res), 'auto_full', 'core: leg 2 cancelled 96 h ahead is auto_full');
select is((select refund_rappen from core_res), 6000,
          'core: the refund is leg 2''s own stored subtotal (6000), not the 10000 captured');
select is((select basis_rappen from core_res), 6000, 'core: the basis returned is leg 2''s amount');
select is(pg_temp.slr_owed((select id from fx where k = 'core')), 6000, 'core: refund_owed_rappen = 6000');
select is(pg_temp.slr_rs((select id from fx where k = 'core')), 'pending_ops', 'core: refund due (pending_ops)');
select is((select status::text from public.booking_legs where booking_id = (select id from fx where k = 'core') and leg_seq = 1),
          'confirmed', 'core: leg 1 stays live');
select is((select status::text from public.bookings where id = (select id from fx where k = 'core')),
          'partially_cancelled', 'core: the booking is partially_cancelled');
select is(pg_temp.slr_last_payload((select id from fx where k = 'core')) -> 'refund_basis', '"leg"'::jsonb,
          'core: the cancel event records refund_basis leg');

-- ── Rule 4: a rate book change does not move the leg amount ───────────────────────────── 4
insert into fx values ('rate', pg_temp.slr_booking('rate', array[48, 96], array[4000, 6000], 0, 10000));
create temp table rate_before as
  select app.leg_refund_basis((select id from fx where k = 'rate'), 2::int2)::int as b;

set local session_replication_role = replica;
update public.distance_rates
   set base_fare_rappen = base_fare_rappen * 3, per_km_rappen = per_km_rappen * 3, min_fare_rappen = min_fare_rappen * 3
 where rate_version_id = (select id from public.rate_versions where slug = 'slr-rv');
set local session_replication_role = origin;

select is((select per_km_rappen::int from public.distance_rates
            where rate_version_id = (select id from public.rate_versions where slug = 'slr-rv')), 900,
          'rule 4: the rate book did change (per km 300 -> 900)');
select is((select b from rate_before), 6000, 'rule 4: leg 2 basis before the change = 6000');
select is(app.leg_refund_basis((select id from fx where k = 'rate'), 2::int2)::int, 6000,
          'rule 4: leg 2 basis after the change is still 6000');
select is((select refund_rappen from pg_temp.slr_cancel((select id from fx where k = 'rate'), 2)), 6000,
          'rule 4: cancelling leg 2 after the change refunds the stored 6000');

-- ── Rule 1: a booking discount is shared pro rata ─────────────────────────────────────── 6
-- 4000 + 6000, discount 1000, 9000 captured: leg 1 3600, leg 2 5400.
insert into fx values ('disc', pg_temp.slr_booking('disc', array[48, 96], array[4000, 6000], 1000, 9000));
select is(app.leg_refund_basis((select id from fx where k = 'disc'), 1::int2)::int, 3600,
          'rule 1: leg 1 carries 400 of the 1000 discount (3600)');
select is(app.leg_refund_basis((select id from fx where k = 'disc'), 2::int2)::int, 5400,
          'rule 1: leg 2 carries 600 of the 1000 discount (5400)');
select is((select refund_rappen from pg_temp.slr_cancel((select id from fx where k = 'disc'), 2)), 5400,
          'rule 1: cancelling leg 2 refunds 5400');
-- Uneven split: 3333 + 6667, discount 1001: shares 334 + 667, legs 2999 + 6000, sum = 8999 = total.
insert into fx values ('odd', pg_temp.slr_booking('odd', array[48, 96], array[3333, 6667], 1001, 8999));
select is(app.leg_refund_basis((select id from fx where k = 'odd'), 1::int2)::int, 2999,
          'rule 1: uneven split, leg 1 = 3333 - 334');
select is(app.leg_refund_basis((select id from fx where k = 'odd'), 2::int2)::int, 6000,
          'rule 1: uneven split, leg 2 = 6667 - 667');
select is(app.leg_refund_basis((select id from fx where k = 'odd'), 1::int2)::int
          + app.leg_refund_basis((select id from fx where k = 'odd'), 2::int2)::int, 8999,
          'rule 1: the legs add up to the snapshot total exactly (no rappen lost or made)');

-- ── Rule 2: the window runs from leg 2's own pickup ───────────────────────────────────── 5
-- Leg 1 in 10 h (inside 24), leg 2 in 72 h (outside).
insert into fx values ('win', pg_temp.slr_booking('win', array[10, 72], array[4000, 6000], 0, 10000));
select is((select refund_mode from public.compute_cancellation_refund((select id from fx where k = 'win'))),
          'pending_ops', 'rule 2: the booking-level clock (earliest leg, 10 h) says pending_ops');
create temp table win_res as select * from pg_temp.slr_cancel((select id from fx where k = 'win'), 2);
select is((select refund_mode from win_res), 'auto_full', 'rule 2: leg 2 (72 h) is outside the window: auto_full');
select ok((select hours_before from win_res) between 71.9 and 72.1, 'rule 2: hours_before is measured to leg 2 (72 h)');
select is((select refund_rappen from win_res), 6000, 'rule 2: and refunds leg 2''s 6000');
-- Leg 2 inside the window: the admin decides, nothing owed yet.
insert into fx values ('win-in', pg_temp.slr_booking('win-in', array[5, 20], array[4000, 6000], 0, 10000));
select is((select refund_mode || ':' || coalesce(refund_rappen::text, 'null') from pg_temp.slr_cancel((select id from fx where k = 'win-in'), 2)),
          'pending_ops:null', 'rule 2: leg 2 in 20 h is inside the window: pending_ops, amount left to the admin');

-- ── Rule 3: never more than captured ──────────────────────────────────────────────────── 2
insert into fx values ('cap', pg_temp.slr_booking('cap', array[48, 96], array[4000, 6000], 0, 5000));
select is((select refund_rappen from pg_temp.slr_cancel((select id from fx where k = 'cap'), 2)), 5000,
          'rule 3: leg 2 is 6000 but only 5000 was captured: refund 5000');
select is(pg_temp.slr_owed((select id from fx where k = 'cap')), 5000, 'rule 3: owed 5000');

-- ── Rule 3: two cancelled legs together never more than captured ─────────────────────── 5
insert into fx values ('sum', pg_temp.slr_booking('sum', array[48, 96], array[4000, 6000], 0, 8000));
select is((select refund_rappen from pg_temp.slr_cancel((select id from fx where k = 'sum'), 1)), 4000,
          'rule 3: leg 1 cancelled first refunds its 4000');
select is(pg_temp.slr_owed((select id from fx where k = 'sum')), 4000, 'rule 3: owed 4000 after leg 1');
select is((select refund_rappen from pg_temp.slr_cancel((select id from fx where k = 'sum'), 2)), 4000,
          'rule 3: leg 2 (6000) then gets only the 4000 left of the 8000 captured');
select is(pg_temp.slr_owed((select id from fx where k = 'sum')), 8000, 'rule 3: owed for both legs = 8000 = captured');
select is((select status::text from public.bookings where id = (select id from fx where k = 'sum')),
          'cancelled', 'rule 3: both legs cancelled: booking cancelled');

-- ── A leg with no stored amount (every live snapshot today) goes to the admin ──────────── 2
insert into fx values ('null', pg_temp.slr_booking('null', array[48, 96], array[null, null]::int[], 0, 10000));
select is((select refund_mode || ':' || coalesce(refund_rappen::text, 'null') from pg_temp.slr_cancel((select id from fx where k = 'null'), 2)),
          'pending_ops:null', 'no stored leg amount: pending_ops, the admin decides, nothing auto-owed');
select is(pg_temp.slr_owed((select id from fx where k = 'null')), null, 'no stored leg amount: owed stays null');

-- ── Whole-booking cancel is unchanged ─────────────────────────────────────────────────── 6
insert into fx values ('whole', pg_temp.slr_booking('whole', array[48, 96], array[4000, 6000], 0, 10000));
create temp table whole_res as select * from pg_temp.slr_cancel((select id from fx where k = 'whole'), null);
select is((select refund_mode || ':' || refund_rappen from whole_res), 'auto_full:10000',
          'whole: p_leg_seq null refunds everything captured (10000), as before');
select is(pg_temp.slr_owed((select id from fx where k = 'whole')), 10000, 'whole: owed 10000, as before');
select ok(not (pg_temp.slr_last_payload((select id from fx where k = 'whole')) ? 'refund_basis'),
          'whole: the event payload has no refund_basis key (same payload as before)');
-- One-leg booking with its leg named: still the booking-level refund (leg row says 3000, 8000 captured).
insert into fx values ('one', pg_temp.slr_booking('one', array[48], array[3000], 0, 8000));
select is((select refund_mode || ':' || refund_rappen from pg_temp.slr_cancel((select id from fx where k = 'one'), 1)),
          'auto_full:8000', 'whole: the only leg of a one-leg booking named: booking-level 8000, as before');
select ok(not (pg_temp.slr_last_payload((select id from fx where k = 'one')) ? 'refund_basis'),
          'whole: one-leg booking payload has no refund_basis key');
-- Window from the earliest leg still applies to a whole cancel.
insert into fx values ('whole-in', pg_temp.slr_booking('whole-in', array[10, 72], array[4000, 6000], 0, 10000));
select is((select refund_mode || ':' || coalesce(refund_rappen::text, 'null') from pg_temp.slr_cancel((select id from fx where k = 'whole-in'), null)),
          'pending_ops:null', 'whole: earliest leg in 10 h: pending_ops, as before');

-- ── The Refund click sends exactly the leg's amount ───────────────────────────────────── 4
select throws_ok(
  format($f$select * from public.ops_refund_plan(%L::uuid, '26101301-0000-4000-a000-000000000001'::uuid, null, 50)$f$,
         (select id from fx where k = 'core')),
  '22023', 'invalid-amount', 'refund click: a percentage other than 100 on a single-leg due is refused');
create temp table plan_core as
  select * from public.ops_refund_plan((select id from fx where k = 'core'), '26101301-0000-4000-a000-000000000001'::uuid);
select is((select sum(amount_rappen)::int from plan_core), 6000,
          'refund click: leg 2 cancelled, the plan sends 6000 of the 10000 payment (not all of it)');
select is((select tier || ':' || reason from public.booking_refund_intents where booking_id = (select id from fx where k = 'core')),
          'full:customer_cancel', 'refund click: tier full, reason customer_cancel');
create temp table plan_whole as
  select * from public.ops_refund_plan((select id from fx where k = 'whole'), '26101301-0000-4000-a000-000000000001'::uuid);
select is((select sum(amount_rappen)::int || ':' || (select tier || ':' || reason from public.booking_refund_intents where booking_id = (select id from fx where k = 'whole'))
             from plan_whole),
          '10000:full:ops_cancel', 'refund click on a whole-booking cancel: 10000, full, ops_cancel, as before');

select * from finish();
rollback;
