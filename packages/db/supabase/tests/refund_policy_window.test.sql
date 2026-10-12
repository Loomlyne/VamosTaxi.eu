-- refund_policy_window.test.sql
--
-- J7 (payments review 2026-10-09). Migration 20261012150000_refund_policy_window.sql.
--   W6-01  the full-refund window is the free_cancel_hours the booking was sold under (the policy in its
--          first price snapshot), not the literal 24. Proven at 12, 24 and 48 hours, on both sides of
--          each window, and with a case the old literal 24 answers the other way round.
--   W6-02  hours-before is real elapsed time (timestamptz): proven across the 2026-10-25 Zurich DST
--          change (25 real hours, wall-clock arithmetic said 24) and the 2027-03-28 one (23 real hours).
--   W6-03  the clock still runs from original_scheduled_at (decision D-26): a booking moved close in
--          after purchase stays on its original pickup.
-- Synthetic integer rappen only (8000 captured), rolled back.
begin;
select plan(22);

insert into public.vehicle_classes (slug, passenger_capacity, luggage_capacity)
values ('pw-class', 3, 3);

-- One booking, one outbound leg `p_hours` from now, one snapshot carrying `p_policy_hours` (null: no
-- snapshot at all), one captured payment of 8000.
create function pg_temp.pw_booking(p_tag text, p_hours numeric, p_policy_hours jsonb)
returns uuid
language plpgsql
as $$
declare
  v_id uuid;
  v_snap bigint;
begin
  insert into public.bookings (contact_name, contact_email, status)
  values ('PW ' || p_tag, 'pw-' || p_tag || '@vamostaxi.eu', 'confirmed')
  returning id into v_id;

  insert into public.booking_legs (
    booking_id, leg_seq, direction, pickup_text, dropoff_text,
    scheduled_at, scheduled_local, vehicle_class_id, status
  )
  select v_id, 1, 'outbound', 'ZRH Airport', 'Zurich HB',
         now() + (p_hours * interval '1 hour'),
         to_char(now() + (p_hours * interval '1 hour'), 'YYYY-MM-DD"T"HH24:MI'),
         vc.id, 'confirmed'
    from public.vehicle_classes vc where vc.slug = 'pw-class';

  if p_policy_hours is not null then
    set local session_replication_role = replica;
    insert into public.price_snapshots (
      quote_id, vehicle_class_id, rate_version_id, rate_version_is_live, settings_version_id,
      engine_version, pax, bags, lines, policy,
      subtotal_rappen, surcharges_rappen, discount_rappen, total_rappen,
      expires_at, quote_lock_expires_at, booking_id
    )
    select gen_random_uuid(), vc.id, rv.id, false, sv.id, 'quote-engine@pw-' || p_tag, 2, 2, '[]'::jsonb,
           jsonb_build_object(
             'cancellation_tiers', '[]'::jsonb, 'free_cancel_hours', p_policy_hours,
             'airport_waiting_minutes', 60, 'city_waiting_minutes', 15,
             'settings_version_id', sv.id, 'modification_deadline_hours', 24,
             'min_advance_minutes', 180, 'policy_doc', 'pw'
           ),
           8000, 0, 0, 8000, now() + interval '1 day', now() + interval '1 day', v_id
      from public.vehicle_classes vc
      cross join lateral (select id from public.rate_versions order by id limit 1) rv
      cross join lateral (select id from public.settings_versions order by id limit 1) sv
     where vc.slug = 'pw-class'
    returning id into v_snap;
    update public.bookings set price_snapshot_id = v_snap where id = v_id;

    insert into public.booking_payments (
      booking_id, snapshot_id, stripe_payment_intent_id, charged_rappen, status, captured_at
    ) values (v_id, v_snap, 'pi_pw_' || p_tag, 8000, 'succeeded', now());
    set local session_replication_role = origin;
  else
    -- No snapshot: the payment still needs one (not null), so a bare snapshot with no booking link.
    set local session_replication_role = replica;
    insert into public.price_snapshots (
      quote_id, vehicle_class_id, rate_version_id, rate_version_is_live, settings_version_id,
      engine_version, pax, bags, lines, policy,
      subtotal_rappen, surcharges_rappen, discount_rappen, total_rappen,
      expires_at, quote_lock_expires_at, booking_id
    )
    select gen_random_uuid(), vc.id, rv.id, false, sv.id, 'quote-engine@pw-' || p_tag, 2, 2, '[]'::jsonb,
           jsonb_build_object(
             'cancellation_tiers', '[]'::jsonb, 'free_cancel_hours', 999,
             'airport_waiting_minutes', 60, 'city_waiting_minutes', 15,
             'settings_version_id', sv.id, 'modification_deadline_hours', 24,
             'min_advance_minutes', 180, 'policy_doc', 'pw-unlinked'
           ),
           8000, 0, 0, 8000, now() + interval '1 day', now() + interval '1 day', null
      from public.vehicle_classes vc
      cross join lateral (select id from public.rate_versions order by id limit 1) rv
      cross join lateral (select id from public.settings_versions order by id limit 1) sv
     where vc.slug = 'pw-class'
    returning id into v_snap;
    insert into public.booking_payments (
      booking_id, snapshot_id, stripe_payment_intent_id, charged_rappen, status, captured_at
    ) values (v_id, v_snap, 'pi_pw_' || p_tag, 8000, 'succeeded', now());
    set local session_replication_role = origin;
  end if;
  return v_id;
end;
$$;

create function pg_temp.pw_mode(p_booking uuid) returns text
language sql as $$
  select refund_mode from public.compute_cancellation_refund(p_booking)
$$;

-- ── W6-01: the window follows the published setting ───────────────────────────────────── 14
-- window 12
select is(pg_temp.pw_mode(pg_temp.pw_booking('w12-out', 13, to_jsonb(12))), 'auto_full',
          'W6-01: window 12, pickup in 13 h: auto_full');
select is(pg_temp.pw_mode(pg_temp.pw_booking('w12-in', 11, to_jsonb(12))), 'pending_ops',
          'W6-01: window 12, pickup in 11 h: pending_ops');
select is(pg_temp.pw_mode(pg_temp.pw_booking('w12-20h', 20, to_jsonb(12))), 'auto_full',
          'W6-01: window 12, pickup in 20 h: auto_full (the old literal 24 said pending_ops)');
-- window 24: behaves exactly as before
select is(pg_temp.pw_mode(pg_temp.pw_booking('w24-out', 25, to_jsonb(24))), 'auto_full',
          'W6-01: window 24, pickup in 25 h: auto_full (unchanged)');
select is(pg_temp.pw_mode(pg_temp.pw_booking('w24-in', 23, to_jsonb(24))), 'pending_ops',
          'W6-01: window 24, pickup in 23 h: pending_ops (unchanged)');
-- window 48
select is(pg_temp.pw_mode(pg_temp.pw_booking('w48-out', 49, to_jsonb(48))), 'auto_full',
          'W6-01: window 48, pickup in 49 h: auto_full');
select is(pg_temp.pw_mode(pg_temp.pw_booking('w48-in', 47, to_jsonb(48))), 'pending_ops',
          'W6-01: window 48, pickup in 47 h: pending_ops');
select is(pg_temp.pw_mode(pg_temp.pw_booking('w48-30h', 30, to_jsonb(48))), 'pending_ops',
          'W6-01: window 48, pickup in 30 h: pending_ops (the old literal 24 said auto_full)');
-- amounts follow the mode
select is((select refund_rappen from public.compute_cancellation_refund(pg_temp.pw_booking('w12-amt', 20, to_jsonb(12))))::int, 8000,
          'W6-01: auto_full at window 12 refunds the captured 8000');
select is((select refund_rappen from public.compute_cancellation_refund(pg_temp.pw_booking('w48-amt', 30, to_jsonb(48)))), null,
          'W6-01: pending_ops at window 48 leaves the amount to the admin');
-- window 0: any cancel before pickup is free
select is(pg_temp.pw_mode(pg_temp.pw_booking('w0', 1, to_jsonb(0))), 'auto_full',
          'W6-01: window 0, pickup in 1 h: auto_full');
-- unknown window: 24, as before
select is(pg_temp.pw_mode(pg_temp.pw_booking('wnone-out', 25, null)), 'auto_full',
          'W6-01: no snapshot on the booking, pickup in 25 h: auto_full (fallback 24)');
select is(pg_temp.pw_mode(pg_temp.pw_booking('wnone-in', 23, null)), 'pending_ops',
          'W6-01: no snapshot on the booking, pickup in 23 h: pending_ops (fallback 24)');
select is(pg_temp.pw_mode(pg_temp.pw_booking('wtext', 30, to_jsonb('soon'::text))), 'auto_full',
          'W6-01: a policy value that is not a number falls back to 24 (30 h is outside it)');

-- ── W6-01: which version: the first snapshot, not a later re-price ─────────────────────── 1
set local session_replication_role = replica;
insert into public.price_snapshots (
  quote_id, vehicle_class_id, rate_version_id, rate_version_is_live, settings_version_id,
  engine_version, pax, bags, lines, policy,
  subtotal_rappen, surcharges_rappen, discount_rappen, total_rappen,
  expires_at, quote_lock_expires_at, booking_id
)
select gen_random_uuid(), vc.id, rv.id, false, sv.id, 'quote-engine@pw-reprice', 2, 2, '[]'::jsonb,
       jsonb_build_object(
         'cancellation_tiers', '[]'::jsonb, 'free_cancel_hours', 72,
         'airport_waiting_minutes', 60, 'city_waiting_minutes', 15,
         'settings_version_id', sv.id, 'modification_deadline_hours', 24,
         'min_advance_minutes', 180, 'policy_doc', 'pw-reprice'
       ),
       8000, 0, 0, 8000, now() + interval '1 day', now() + interval '1 day',
       (select id from public.bookings where contact_email = 'pw-w12-out@vamostaxi.eu')
  from public.vehicle_classes vc
  cross join lateral (select id from public.rate_versions order by id limit 1) rv
  cross join lateral (select id from public.settings_versions order by id limit 1) sv
 where vc.slug = 'pw-class';
set local session_replication_role = origin;
select is(pg_temp.pw_mode((select id from public.bookings where contact_email = 'pw-w12-out@vamostaxi.eu')), 'auto_full',
          'W6-01: a later snapshot (window 72) does not move the window the booking was sold under (12)');

-- ── W6-02: real elapsed hours across DST ────────────────────────────────────────────── 5
select is(app.refund_hours_before('2026-10-25 10:00:00+01'::timestamptz, '2026-10-24 10:00:00+02'::timestamptz), 25.00,
          'W6-02: Sat 10:00 to Sun 10:00 over the 2026-10-25 clock change is 25 real hours (wall clock said 24)');
select is(app.refund_hours_before('2027-03-28 10:00:00+02'::timestamptz, '2027-03-27 10:00:00+01'::timestamptz), 23.00,
          'W6-02: the spring change (2027-03-28) is 23 real hours (wall clock said 24)');
select is(app.refund_hours_before('2026-10-26 10:00:00+01'::timestamptz, '2026-10-25 10:00:00+01'::timestamptz), 24.00,
          'W6-02: a plain day with no change is 24 hours');
select is(app.refund_hours_before('2026-10-24 08:00:00+00'::timestamptz, '2026-10-24 10:00:00+00'::timestamptz), -2.00,
          'W6-02: after the pickup the hours are negative');
select ok(
  (select pg_catalog.pg_get_functiondef(p.oid) ~ 'app\.refund_hours_before\(v_original, pg_catalog\.now\(\)\)'
          and pg_catalog.pg_get_functiondef(p.oid) !~* 'at time zone'
     from pg_catalog.pg_proc p
    where p.oid = 'public.compute_cancellation_refund(uuid)'::regprocedure),
  'W6-02: compute_cancellation_refund measures with app.refund_hours_before(original, now()) and no AT TIME ZONE arithmetic'
);

-- ── W6-03 / D-26: the clock stays on the original pickup ─────────────────────────────── 2
select is(pg_temp.pw_mode(pg_temp.pw_booking('moved', 48, to_jsonb(24))), 'auto_full', 'fixture: 48 h ahead, window 24: auto_full');
update public.booking_legs
   set scheduled_at = now() + interval '3 hours',
       scheduled_local = to_char(now() + interval '3 hours', 'YYYY-MM-DD"T"HH24:MI')
 where booking_id = (select id from public.bookings where contact_email = 'pw-moved@vamostaxi.eu');
select is(pg_temp.pw_mode((select id from public.bookings where contact_email = 'pw-moved@vamostaxi.eu')), 'auto_full',
          'W6-03 / D-26: after a time change to 3 h from now the window still runs from the original pickup');

select * from finish();
rollback;
