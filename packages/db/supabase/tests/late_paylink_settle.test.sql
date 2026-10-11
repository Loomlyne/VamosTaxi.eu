-- late_paylink_settle.test.sql
--
-- Stripe payments review 2026-10-09, job J4, migration 20261009115000 (W5-01, W5-11, W4-05, W5-13).
--   A  a pay-link payment inside its 24 h hold takes the normal pending -> paid -> confirmed path (legs
--      confirmed, status events); the revive branch (cancelled, or lock and hold both past) confirms legs and
--      logs booking.status_changed next to booking.revived; the refund path for a gone pickup is unchanged.
--   B  a revive gives a coupon use back only while the coupon's caps allow it.
--   C  stripe_event_begin supersedes only an event that would regress a payment, only by a later paid event.
--   D  purge_unpaid_booking refuses while a requires_payment row names an unproved session; mark dead.
--   E  grants and shape.
-- Rolled back. Synthetic integer rappen only.
begin;
select plan(47);

-- Fixtures --------------------------------------------------------------------------------
update public.rate_versions set status = 'retired' where status = 'live';
insert into public.vehicle_classes (slug, passenger_capacity, luggage_capacity)
values ('lpl-eco', 3, 3);
insert into public.rate_versions (slug, label) values ('lpl-rv', 'late paylink fixture');
insert into public.distance_rates (rate_version_id, vehicle_class_id, max_pax, base_fare_rappen, per_km_rappen, min_fare_rappen)
select rv.id, vc.id, 3, 1, 2, 3
  from public.rate_versions rv, public.vehicle_classes vc
 where rv.slug = 'lpl-rv' and vc.slug = 'lpl-eco';
update public.rate_versions set status = 'live' where slug = 'lpl-rv';
insert into public.settings_versions (slug, label) values ('lpl-policy', 'late paylink fixture');

-- One pending booking (one leg, one price record of 9, one open payment cs_lpl_<tag>, pi_lpl_<tag>).
create function pg_temp.lpl_mk(p_tag text, p_status text default 'pending', p_is_test boolean default false, p_offs interval default interval '3 days')
returns uuid language plpgsql as $$
declare
  v_b uuid;
  v_snap bigint;
begin
  insert into public.bookings (contact_name, contact_email, contact_phone, quote_id, status, is_test)
  values ('LPL ' || p_tag, 'lpl-' || p_tag || '@example.test', '+41000000099', gen_random_uuid(),
          p_status::public.booking_status, p_is_test)
  returning id into v_b;

  insert into public.price_snapshots (
    quote_id, vehicle_class_id, rate_version_id, rate_version_is_live, settings_version_id,
    engine_version, pax, bags, lines, policy, booking_id, expires_at, quote_lock_expires_at,
    subtotal_rappen, surcharges_rappen, discount_rappen, total_rappen, coupon_id, coupon_code
  )
  select (select quote_id from public.bookings where id = v_b), vc.id, rv.id, true, sv.id,
         'quote-engine@sns', 1, 0,
         '[{"seq":1,"leg_seq":1,"kind":"fare","code":"distance_fare","i18n_key":"price.line.transfer","amount_rappen":9}]'::jsonb,
         jsonb_build_object('cancellation_tiers', '[]'::jsonb, 'free_cancel_hours', 24,
                            'airport_waiting_minutes', 60, 'city_waiting_minutes', 15,
                            'settings_version_id', 1, 'modification_deadline_hours', 24,
                            'min_advance_minutes', 180, 'policy_doc', 'test'),
         v_b, now() + interval '30 minutes', now() + interval '30 minutes',
         9, 0, 0, 9, null, null
    from public.vehicle_classes vc, public.rate_versions rv, public.settings_versions sv
   where vc.slug = 'lpl-eco' and rv.slug = 'lpl-rv' and sv.slug = 'lpl-policy'
  returning id into v_snap;

  update public.bookings set price_snapshot_id = v_snap, price_total_rappen = 9 where id = v_b;

  insert into public.booking_legs (
    booking_id, leg_seq, direction, pickup_text, dropoff_text,
    scheduled_at, scheduled_local, vehicle_class_id, status
  )
  select v_b, 1, 'outbound', 'ZRH Airport', 'Zurich HB',
         now() + p_offs, to_char(now() + p_offs, 'YYYY-MM-DD"T"HH24:MI'),
         vc.id, p_status::public.booking_status
    from public.vehicle_classes vc where vc.slug = 'lpl-eco';

  insert into public.booking_payments (
    booking_id, snapshot_id, stripe_payment_intent_id, stripe_checkout_session_id,
    charged_rappen, charged_currency, status
  ) values (v_b, v_snap, 'cs_lpl_' || p_tag, 'cs_lpl_' || p_tag, 9, 'CHF', 'requires_payment');
  return v_b;
end $$;

create function pg_temp.lpl_ev(p_id text, p_type text, p_object text, p_age interval default interval '0 minutes')
returns void language sql as $$
  insert into public.stripe_events (id, type, stripe_created, object_id, payload, received_at)
  values (p_id, p_type, now() - p_age, p_object, '{}'::jsonb, now() - p_age)
$$;

create function pg_temp.lpl_settle(p_event text, p_tag text)
returns table (already_settled bool, revived bool, duplicate bool, refund_required bool, refund_reason text,
               payment_id int8, amount_mismatch bool)
language sql as $$
  select s.already_settled, s.revived, s.duplicate, s.refund_required, s.refund_reason, s.payment_id, s.amount_mismatch
    from public.checkout_payment_settle(p_event, 'cs_lpl_' || p_tag, 'pi_lpl_' || p_tag, 'succeeded',
                                        'CHF', null, null, null, null, null) as s
$$;


create function pg_temp.lpl_b(p_tag text) returns uuid language sql as $$
  select b.id from public.bookings b where b.contact_email = 'lpl-' || p_tag || '@example.test'
$$;
-- age a booking's price lock (append-only table: replica role skips the guard)
create function pg_temp.lpl_age_lock(p_tag text) returns void language plpgsql as $$
begin
  set local session_replication_role = replica;
  update public.price_snapshots set quote_lock_expires_at = now() - interval '2 hours' where booking_id = pg_temp.lpl_b(p_tag);
  set local session_replication_role = origin;
end $$;
create function pg_temp.lpl_events(p_tag text, p_kind text, p_to text default null) returns int language sql as $$
  select count(*)::int from public.booking_events e
   where e.booking_id = pg_temp.lpl_b(p_tag) and e.kind = p_kind and (p_to is null or e.to_status::text = p_to)
$$;

-- A. W5-01: late payments --------------------------------------------------------------------------
-- A1 a pay-link booking: the 30-minute price lock has run out, the 24 h hold is open
select pg_temp.lpl_mk('hold');
update public.bookings set pay_link_sent_at = now() - interval '3 hours', hold_until = now() + interval '21 hours' where id = pg_temp.lpl_b('hold');
select pg_temp.lpl_age_lock('hold');
select pg_temp.lpl_ev('evt_lpl_hold', 'checkout.session.completed', 'cs_lpl_hold');
create temporary table a1 as select * from pg_temp.lpl_settle('evt_lpl_hold', 'hold');
select ok((select not revived and not already_settled and not refund_required from a1), '(1) W5-01: a pay-link payment inside its hold is a normal settle: not revived, no refund');
select is((select status::text from public.bookings where id = pg_temp.lpl_b('hold')), 'confirmed', '(2) the booking is confirmed');
select is((select count(*)::int from public.booking_legs where booking_id = pg_temp.lpl_b('hold') and status = 'confirmed'), 1, '(3) and its leg is confirmed (it stayed pending before)');
select is(pg_temp.lpl_events('hold', 'booking.status_changed', 'paid'), 1, '(4) the pending -> paid status event is written');
select is(pg_temp.lpl_events('hold', 'booking.status_changed', 'confirmed'), 1, '(5) the paid -> confirmed status event is written');
select is(pg_temp.lpl_events('hold', 'booking.revived'), 0, '(6) no booking.revived event for a booking nobody cancelled');
select is(pg_temp.lpl_events('hold', 'payment.succeeded'), 1, '(7) one payment.succeeded event');

-- A2 the lock AND the hold are past, the cron has not cancelled it yet: the revive branch
select pg_temp.lpl_mk('exp');
update public.bookings set pay_link_sent_at = now() - interval '2 days', hold_until = now() - interval '1 day' where id = pg_temp.lpl_b('exp');
select pg_temp.lpl_age_lock('exp');
select pg_temp.lpl_ev('evt_lpl_exp', 'checkout.session.completed', 'cs_lpl_exp');
create temporary table a2 as select * from pg_temp.lpl_settle('evt_lpl_exp', 'exp');
select ok((select revived and not refund_required from a2), '(8) lock and hold both past: the late payment is revived (pickup is ahead)');
select is((select status::text from public.bookings where id = pg_temp.lpl_b('exp')), 'confirmed', '(9) the booking is confirmed');
select is((select count(*)::int from public.booking_legs where booking_id = pg_temp.lpl_b('exp') and status = 'confirmed'), 1, '(10) W5-01: the leg is confirmed too (it stayed pending before)');
select is(pg_temp.lpl_events('exp', 'booking.revived'), 1, '(11) booking.revived is logged');
select is(pg_temp.lpl_events('exp', 'booking.status_changed', 'confirmed'), 1, '(12) W5-01: and the booking.status_changed event, like every confirmation');

-- A3 a booking the cron cancelled is revived the same way: legs and both events
select pg_temp.lpl_mk('can');
update public.booking_legs set status = 'cancelled' where booking_id = pg_temp.lpl_b('can');
update public.bookings set status = 'cancelled' where id = pg_temp.lpl_b('can');
select pg_temp.lpl_ev('evt_lpl_can', 'checkout.session.completed', 'cs_lpl_can');
create temporary table a3 as select * from pg_temp.lpl_settle('evt_lpl_can', 'can');
select ok((select revived from a3), '(13) a cancelled booking is revived');
select is((select count(*)::int from public.booking_legs where booking_id = pg_temp.lpl_b('can') and status = 'confirmed'), 1, '(14) its cancelled leg is confirmed');
select is(pg_temp.lpl_events('can', 'booking.revived') + pg_temp.lpl_events('can', 'booking.status_changed', 'confirmed'), 2, '(15) both events are logged');

-- A4 the price lock is still live and no hold: unchanged normal path
select pg_temp.lpl_mk('live');
select pg_temp.lpl_ev('evt_lpl_live', 'checkout.session.completed', 'cs_lpl_live');
select ok((select not revived from pg_temp.lpl_settle('evt_lpl_live', 'live')), '(16) a payment inside the price lock is unchanged: normal path');
select is(pg_temp.lpl_events('live', 'booking.status_changed', 'confirmed'), 1, '(17) with its status events');

-- A5 truly expired and the pickup has passed: refund path unchanged (never confirmed)
select pg_temp.lpl_mk('past', 'pending', false, interval '-1 hour');
select pg_temp.lpl_age_lock('past');
select pg_temp.lpl_ev('evt_lpl_past', 'checkout.session.completed', 'cs_lpl_past');
select ok((select refund_required and refund_reason = 'paid_after_cancel' and not revived from pg_temp.lpl_settle('evt_lpl_past', 'past')),
  '(18) lock and hold past and the pickup gone: refund order, never confirmed (unchanged)');

-- B. W5-13: coupon caps on revive ------------------------------------------------------------------
insert into public.coupons (code, kind, percent, active, global_limit)
values ('LPL-ONE', 'percent', 10.00, true, 1), ('LPL-TWO', 'percent', 10.00, true, 2);
select pg_temp.lpl_mk('c1', 'cancelled');
select pg_temp.lpl_mk('c1b');
select pg_temp.lpl_mk('c2', 'cancelled');
-- c1: its redemption is released (the booking was cancelled unpaid) and another booking has taken the only use
insert into public.coupon_redemptions (coupon_id, booking_id, payment_id)
select (select id from public.coupons where code = 'LPL-ONE'), pg_temp.lpl_b('c1'), p.id
  from public.booking_payments p where p.stripe_checkout_session_id = 'cs_lpl_c1';
update public.coupon_redemptions set released_at = now(), released_reason = 'unpaid_cancelled' where booking_id = pg_temp.lpl_b('c1');
insert into public.coupon_redemptions (coupon_id, booking_id, payment_id)
select (select id from public.coupons where code = 'LPL-ONE'), pg_temp.lpl_b('c1b'), p.id
  from public.booking_payments p where p.stripe_checkout_session_id = 'cs_lpl_c1b';
select pg_temp.lpl_ev('evt_lpl_c1', 'checkout.session.completed', 'cs_lpl_c1');
select ok((select revived from pg_temp.lpl_settle('evt_lpl_c1', 'c1')), '(19) fixture: the cancelled booking with a released coupon use is revived');
select ok((select released_at is not null from public.coupon_redemptions where booking_id = pg_temp.lpl_b('c1')),
  '(20) W5-13: the coupon use stays released: its only use is taken, re-activating it would break the cap');
select is((select (e.payload ->> 'coupon_kept_released')::int from public.booking_events e where e.booking_id = pg_temp.lpl_b('c1') and e.kind = 'booking.revived'), 1,
  '(21) and the revive event says so');
select is((select count(*)::int from public.coupon_redemptions where coupon_id = (select id from public.coupons where code = 'LPL-ONE') and released_at is null), 1,
  '(22) the coupon is never above its cap');
-- c2: the cap has room
insert into public.coupon_redemptions (coupon_id, booking_id, payment_id)
select (select id from public.coupons where code = 'LPL-TWO'), pg_temp.lpl_b('c2'), p.id
  from public.booking_payments p where p.stripe_checkout_session_id = 'cs_lpl_c2';
update public.coupon_redemptions set released_at = now(), released_reason = 'unpaid_cancelled' where booking_id = pg_temp.lpl_b('c2');
select pg_temp.lpl_ev('evt_lpl_c2', 'checkout.session.completed', 'cs_lpl_c2');
select ok((select revived from pg_temp.lpl_settle('evt_lpl_c2', 'c2')), '(23) fixture: the second cancelled booking is revived');
select ok((select released_at is null and released_reason is null from public.coupon_redemptions where booking_id = pg_temp.lpl_b('c2')),
  '(24) the coupon use is given back while the cap has room');
select ok((select not (e.payload ? 'coupon_kept_released') from public.booking_events e where e.booking_id = pg_temp.lpl_b('c2') and e.kind = 'booking.revived'),
  '(25) and the revive event carries no coupon note');

-- C. W4-05: supersession is by event type ---------------------------------------------------------
-- a processed paid completed at t2; an older expired / canceled event is out of order
select pg_temp.lpl_ev('evt_ord_paid', 'checkout.session.completed', 'cs_ord');
update public.stripe_events set stripe_created = now(), processed_at = now() where id = 'evt_ord_paid';
select pg_temp.lpl_ev('evt_ord_exp', 'checkout.session.expired', 'cs_ord');
update public.stripe_events set stripe_created = now() - interval '5 minutes' where id = 'evt_ord_exp';
select pg_temp.lpl_ev('evt_ord_can', 'payment_intent.canceled', 'pi_ord');
update public.stripe_events set stripe_created = now() - interval '5 minutes' where id = 'evt_ord_can';
select is((select reason from public.stripe_event_begin('evt_ord_exp', array['cs_ord', 'pi_ord'], now() - interval '5 minutes')), 'superseded',
  '(26) an older expired event after a processed paid one is refused (out-of-order guarantee kept)');
select is((select reason from public.stripe_event_begin('evt_ord_can', array['cs_ord', 'pi_ord'], now() - interval '5 minutes')), 'superseded',
  '(27) an older canceled event after a processed paid one is refused');
-- a paid completed that waits in a retry is NOT dropped because a later unrelated event was processed
select pg_temp.lpl_ev('evt_ord2_paid', 'checkout.session.completed', 'cs_ord2');
update public.stripe_events set stripe_created = now() - interval '5 minutes' where id = 'evt_ord2_paid';
select pg_temp.lpl_ev('evt_ord2_refund', 'charge.refunded', 'ch_ord2');
update public.stripe_events set stripe_created = now(), processed_at = now() where id = 'evt_ord2_refund';
select is((select reason from public.stripe_event_begin('evt_ord2_paid', array['cs_ord2', 'ch_ord2'], now() - interval '5 minutes')), 'ok',
  '(28) W4-05: a paid completed event is not dropped because a later refund event on the same objects was processed');
select pg_temp.lpl_ev('evt_ord2_ign', 'payment_intent.succeeded', 'pi_ord2');
update public.stripe_events set stripe_created = now(), processed_at = now() where id = 'evt_ord2_ign';
select pg_temp.lpl_ev('evt_ord2_paid2', 'checkout.session.completed', 'cs_ord2b');
update public.stripe_events set stripe_created = now() - interval '5 minutes' where id = 'evt_ord2_paid2';
select is((select reason from public.stripe_event_begin('evt_ord2_paid2', array['cs_ord2b', 'pi_ord2'], now() - interval '5 minutes')), 'ok',
  '(29) nor because a later ignored-type event (payment_intent.succeeded) was processed: a paid event is never superseded');
-- a dispute event and a refund event are never superseded
select pg_temp.lpl_ev('evt_ord3_disp', 'charge.dispute.created', 'dp_ord3');
update public.stripe_events set stripe_created = now() - interval '5 minutes' where id = 'evt_ord3_disp';
select pg_temp.lpl_ev('evt_ord3_ref', 'charge.refunded', 'ch_ord3');
update public.stripe_events set stripe_created = now(), processed_at = now() where id = 'evt_ord3_ref';
select is((select reason from public.stripe_event_begin('evt_ord3_disp', array['dp_ord3', 'ch_ord3', 'pi_ord3'], now() - interval '5 minutes')), 'ok',
  '(30) a dispute event is not dropped because a later refund event was processed');
-- a failure is not superseded by a later FAILURE
select pg_temp.lpl_ev('evt_ord4_exp', 'checkout.session.expired', 'cs_ord4');
update public.stripe_events set stripe_created = now() - interval '5 minutes' where id = 'evt_ord4_exp';
select pg_temp.lpl_ev('evt_ord4_can', 'payment_intent.canceled', 'pi_ord4');
update public.stripe_events set stripe_created = now(), processed_at = now() where id = 'evt_ord4_can';
select is((select reason from public.stripe_event_begin('evt_ord4_exp', array['cs_ord4', 'pi_ord4'], now() - interval '5 minutes')), 'ok',
  '(31) an expired event is not dropped because a later canceled event (also a failure) was processed');
-- already processed and the unknown event keep their answers
select is((select reason from public.stripe_event_begin('evt_ord_paid', array['cs_ord'], now())), 'already_processed', '(32) an already processed event answers already_processed (unchanged)');
select throws_ok($$select * from public.stripe_event_begin('evt_ord_unknown', array['cs_x'], now())$$, 'P0002', 'event_not_found', '(33) an unknown event raises P0002 (unchanged)');

-- D. W5-11: purge refuses a session nobody proved dead ----------------------------------------------
select pg_temp.lpl_mk('pg1');
select pg_temp.lpl_mk('pg2');
select is(public.purge_unpaid_booking(pg_temp.lpl_b('pg1'), 'superseded'), false, '(34) W5-11: superseded is refused while a requires_payment row names a session');
select is(public.checkout_payments_mark_dead(pg_temp.lpl_b('pg1'), array['cs_lpl_pg1']), 1, '(35) the verified session is marked dead');
select is(public.purge_unpaid_booking(pg_temp.lpl_b('pg1'), 'superseded'), true, '(36) then a superseded purge goes through, with the price lock still live (the customer replaced it)');
select is(public.purge_unpaid_booking(pg_temp.lpl_b('pg2'), 'unpaid_expired'), false, '(37) unpaid_expired is refused while the session is unproved');
-- a payment that settled meanwhile is never marked dead
select pg_temp.lpl_mk('pg3');
select * from pg_temp.lpl_settle('evt_lpl_pg3', 'pg3') where false;
update public.booking_payments set status = 'succeeded', captured_at = now() where stripe_checkout_session_id = 'cs_lpl_pg3';
select is(public.checkout_payments_mark_dead(pg_temp.lpl_b('pg3'), array['cs_lpl_pg3']), 0, '(38) a payment that already succeeded is never marked dead');
select is((select status from public.booking_payments where stripe_checkout_session_id = 'cs_lpl_pg3'), 'succeeded', '(39) and stays succeeded');
select is(public.checkout_payments_mark_dead(pg_temp.lpl_b('pg3'), array[]::text[]), 0, '(40) an empty list marks nothing');

-- E. grants and shape -------------------------------------------------------------------------------
select function_privs_are('public', 'checkout_payments_mark_dead', '{uuid,text[]}'::text[], 'vamos_system', '{EXECUTE}'::text[], '(41) mark dead: vamos_system holds EXECUTE');
select function_privs_are('public', 'checkout_payments_mark_dead', '{uuid,text[]}'::text[], 'vamos_checkout', '{EXECUTE}'::text[], '(42) mark dead: vamos_checkout holds EXECUTE (as purge)');
select is(
  (select count(*)::int
     from unnest(array['anon', 'authenticated', 'vamos_guest', 'vamos_staff', 'vamos_edge', 'vamos_public']) r
    where has_function_privilege(r, 'public.checkout_payments_mark_dead(uuid,text[])', 'EXECUTE')),
  0, '(43) no API role can mark payments dead');
select is((select count(*)::int from information_schema.routine_privileges
            where routine_schema = 'app' and routine_name = 'coupon_reactivate' and grantee in ('anon', 'authenticated', 'vamos_system', 'vamos_checkout', 'public', 'PUBLIC')), 0,
  '(44) app.coupon_reactivate has no grant');
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where ((n.nspname = 'public' and p.proname in ('checkout_payment_settle', 'stripe_event_begin', 'checkout_payments_mark_dead', 'purge_unpaid_booking'))
           or (n.nspname = 'app' and p.proname = 'coupon_reactivate'))
      and p.prosecdef and p.proconfig @> array['search_path=""']),
  5, '(45) the new and replaced functions are SECURITY DEFINER with search_path empty');
select ok(
  (select position('from public.booking_payments' in p.prosrc) > 0
          and position('from public.booking_payments' in p.prosrc) < position('from public.bookings' in p.prosrc)
          and position('from public.bookings' in p.prosrc) < position('update public.stripe_events' in p.prosrc)
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'checkout_payment_settle'),
  '(46) settle lock order unchanged: payment row, booking row, event row');
select ok((select obj_description(p.oid, 'pg_proc') like '%20261009115000%' from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname = 'purge_unpaid_booking'), '(47) the purge comment names this migration');

select * from finish();
rollback;
