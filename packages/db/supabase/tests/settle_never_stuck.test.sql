-- settle_never_stuck.test.sql
--
-- Stripe payments review 2026-10-09, job J2, migration 20261012100000 (W4-01, W4-03, W4-09, W4-17,
-- W5-04, W5-12, W5-17). The extra-payment (difference) side of W4-17 and W5-12 is in
-- settle_safety.test.sql section I.
--   A  stripe_event_settle: an unknown id raises P0002, a processed row keeps its first processed_at and
--      its last_error; the open row is stamped / marked as before. stripe_event_close.
--   B  stripe_event_begin stamps last_attempt_at.
--   C  the sweep: what it claims, what it never claims, the bound, abandon once.
--   D  W4-03: a refund-required branch leaves the event open; a retry gets the refund order again; the
--      Worker's close stamps it.
--   E  W4-17 / W5-04: a late failed / canceled event never raises on a succeeded or duplicate payment.
--   F  W5-12: an unusable currency / FX tuple is recorded as a CHF capture without FX, never a CHECK raise.
--   G  grants.
-- Rolled back. Synthetic integer rappen only.
begin;
select plan(77);

-- Fixtures --------------------------------------------------------------------------------
update public.rate_versions set status = 'retired' where status = 'live';
insert into public.vehicle_classes (slug, passenger_capacity, luggage_capacity)
values ('sns-eco', 3, 3);
insert into public.rate_versions (slug, label) values ('sns-rv', 'never stuck fixture');
insert into public.distance_rates (rate_version_id, vehicle_class_id, max_pax, base_fare_rappen, per_km_rappen, min_fare_rappen)
select rv.id, vc.id, 3, 1, 2, 3
  from public.rate_versions rv, public.vehicle_classes vc
 where rv.slug = 'sns-rv' and vc.slug = 'sns-eco';
update public.rate_versions set status = 'live' where slug = 'sns-rv';
insert into public.settings_versions (slug, label) values ('sns-policy', 'never stuck fixture');

-- One pending booking (one leg, one price record of 9, one open payment cs_sns_<tag>, pi_sns_<tag>).
create function pg_temp.sns_mk(p_tag text, p_status text default 'pending', p_is_test boolean default false)
returns uuid language plpgsql as $$
declare
  v_b uuid;
  v_snap bigint;
begin
  insert into public.bookings (contact_name, contact_email, contact_phone, quote_id, status, is_test)
  values ('SNS ' || p_tag, 'sns-' || p_tag || '@example.test', '+41000000099', gen_random_uuid(),
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
   where vc.slug = 'sns-eco' and rv.slug = 'sns-rv' and sv.slug = 'sns-policy'
  returning id into v_snap;

  update public.bookings set price_snapshot_id = v_snap, price_total_rappen = 9 where id = v_b;

  insert into public.booking_legs (
    booking_id, leg_seq, direction, pickup_text, dropoff_text,
    scheduled_at, scheduled_local, vehicle_class_id, status
  )
  select v_b, 1, 'outbound', 'ZRH Airport', 'Zurich HB',
         now() + interval '3 days', to_char(now() + interval '3 days', 'YYYY-MM-DD"T"HH24:MI'),
         vc.id, p_status::public.booking_status
    from public.vehicle_classes vc where vc.slug = 'sns-eco';

  insert into public.booking_payments (
    booking_id, snapshot_id, stripe_payment_intent_id, stripe_checkout_session_id,
    charged_rappen, charged_currency, status
  ) values (v_b, v_snap, 'cs_sns_' || p_tag, 'cs_sns_' || p_tag, 9, 'CHF', 'requires_payment');
  return v_b;
end $$;

create function pg_temp.sns_ev(p_id text, p_type text, p_object text, p_age interval default interval '0 minutes')
returns void language sql as $$
  insert into public.stripe_events (id, type, stripe_created, object_id, payload, received_at)
  values (p_id, p_type, now() - p_age, p_object, '{}'::jsonb, now() - p_age)
$$;

create function pg_temp.sns_settle(p_event text, p_tag text, p_outcome text default 'succeeded',
                                    p_cur text default 'CHF', p_rate numeric default null,
                                    p_src text default null, p_at timestamptz default null,
                                    p_minor int8 default null, p_pcur text default null)
returns table (already_settled bool, revived bool, duplicate bool, refund_required bool, refund_reason text,
               payment_id int8, other_open_session_ids text[])
language sql as $$
  select s.already_settled, s.revived, s.duplicate, s.refund_required, s.refund_reason, s.payment_id,
         s.other_open_session_ids
    from public.checkout_payment_settle(p_event, 'cs_sns_' || p_tag, 'pi_sns_' || p_tag, p_outcome,
                                        p_cur, p_rate, p_src, p_at, p_minor, p_pcur) as s
$$;

select pg_temp.sns_mk('a');
select pg_temp.sns_mk('wt');
select pg_temp.sns_mk('test', 'pending', true);
select pg_temp.sns_mk('dup');
select pg_temp.sns_mk('late');
select pg_temp.sns_mk('latedup');
select pg_temp.sns_mk('fxg');
select pg_temp.sns_mk('fxc');
select pg_temp.sns_mk('fxe');
select pg_temp.sns_mk('fxi');

-- A. stripe_event_settle and stripe_event_close ---------------------------------------------------
select pg_temp.sns_ev('evt_sns_open', 'checkout.session.completed', 'cs_sns_a');
select pg_temp.sns_ev('evt_sns_done', 'checkout.session.completed', 'cs_sns_a');
update public.stripe_events set processed_at = timestamptz '2026-01-02 03:04:05+00', last_error = null
 where id = 'evt_sns_done';

select throws_ok(
  $$select public.stripe_event_settle('evt_sns_missing', null)$$, 'P0002', 'event_not_found',
  '(1) W5-17: settling an unknown event id raises P0002, not a silent success');
select throws_ok(
  $$select public.stripe_event_settle('evt_sns_missing', 'x')$$, 'P0002', 'event_not_found',
  '(2) W5-17: so does an error stamp on an unknown id');
select public.stripe_event_settle('evt_sns_done', null);
select is((select processed_at from public.stripe_events where id = 'evt_sns_done'),
  timestamptz '2026-01-02 03:04:05+00', '(3) W5-17: a processed row keeps its first processed_at');
select public.stripe_event_settle('evt_sns_done', 'late_error');
select ok((select last_error is null from public.stripe_events where id = 'evt_sns_done'),
  '(4) W5-17: no error is written onto a processed row');
select public.stripe_event_settle('evt_sns_open', 'P0001');
select ok((select processed_at is null and last_error = 'P0001' from public.stripe_events where id = 'evt_sns_open'),
  '(5) an error stamp on an open row records last_error and leaves it open (unchanged)');
select public.stripe_event_settle('evt_sns_open', null);
select ok((select processed_at is not null from public.stripe_events where id = 'evt_sns_open'),
  '(6) a null error stamps processed_at (unchanged)');

select pg_temp.sns_ev('evt_sns_close', 'checkout.session.expired', 'cs_sns_a');
select public.stripe_event_close('evt_sns_close', 'no_payment');
select ok((select processed_at is not null and last_error = 'no_payment' from public.stripe_events where id = 'evt_sns_close'),
  '(7) W4-09: close sets processed_at and keeps the reason in last_error');
select public.stripe_event_close('evt_sns_close', 'other_reason');
select is((select last_error from public.stripe_events where id = 'evt_sns_close'), 'no_payment',
  '(8) closing a processed event changes nothing');
select throws_ok($$select public.stripe_event_close('evt_sns_missing', 'x')$$, 'P0002', 'event_not_found',
  '(9) close of an unknown id raises P0002');
select throws_ok($$select public.stripe_event_close('evt_sns_open', ' ')$$, '22023', 'close_reason_required',
  '(10) a close needs a reason');

-- B. begin stamps last_attempt_at ----------------------------------------------------------------
select pg_temp.sns_ev('evt_sns_begin', 'checkout.session.completed', 'cs_sns_begin');
select ok((select last_attempt_at is null from public.stripe_events where id = 'evt_sns_begin'), '(11) a new event has no attempt yet');
select * from public.stripe_event_begin('evt_sns_begin', array['cs_sns_begin'], now());
select ok((select last_attempt_at is not null and attempts = 1 from public.stripe_events where id = 'evt_sns_begin'),
  '(12) begin stamps last_attempt_at and counts the attempt');

-- C. the sweep -----------------------------------------------------------------------------------
select pg_temp.sns_ev('evt_sw_old', 'checkout.session.completed', 'cs_sw_old', interval '40 minutes');
select pg_temp.sns_ev('evt_sw_fresh', 'checkout.session.completed', 'cs_sw_fresh', interval '2 minutes');
select pg_temp.sns_ev('evt_sw_done', 'checkout.session.completed', 'cs_sw_done', interval '40 minutes');
update public.stripe_events set processed_at = now() where id = 'evt_sw_done';
select pg_temp.sns_ev('evt_sw_noreq', 'checkout.session.completed', 'cs_sw_noreq', interval '40 minutes');
update public.stripe_events set last_error = 'no_request' where id = 'evt_sw_noreq';
select pg_temp.sns_ev('evt_sw_retrying', 'checkout.session.completed', 'cs_sw_retrying', interval '40 minutes');
update public.stripe_events set last_attempt_at = now() - interval '3 minutes', attempts = 2 where id = 'evt_sw_retrying';
select pg_temp.sns_ev('evt_sw_ancient', 'checkout.session.completed', 'cs_sw_ancient', interval '60 days');
select pg_temp.sns_ev('evt_sw_err', 'checkout.session.completed', 'cs_sw_err', interval '90 minutes');
update public.stripe_events set last_error = '40P01', attempts = 9 where id = 'evt_sw_err';

create temporary table sw1 as select * from public.stripe_events_sweep_claim();
select is((select count(*)::int from sw1 where action = 'requeue'), 2, '(13) W4-01: the sweep claims the two idle open events');
select ok((select array_agg(event_id order by event_id) = array['evt_sw_err', 'evt_sw_old'] from sw1 where action = 'requeue'),
  '(14) W4-01: the idle open events are evt_sw_old and evt_sw_err (oldest first)');
select ok(not exists (select 1 from sw1 where event_id in ('evt_sw_fresh', 'evt_sw_done', 'evt_sw_noreq', 'evt_sw_retrying', 'evt_sw_ancient', 'evt_sns_open')),
  '(15) W4-01: never a fresh, processed, benign-closed, recently attempted or ancient event');
select ok((select event_type = 'checkout.session.completed' and object_id = 'cs_sw_old' and last_error is null from sw1 where event_id = 'evt_sw_old'),
  '(16) the claim carries what the Worker needs to re-enqueue (type, object id)');
select ok((select last_error = '40P01' and attempts = 9 from sw1 where event_id = 'evt_sw_err'),
  '(17) the claim shows last_error and attempts for the log');
select is((select sweep_count from public.stripe_events where id = 'evt_sw_old'), 1, '(18) the claim bumps sweep_count');
select is((select count(*)::int from public.stripe_events_sweep_claim()), 0,
  '(19) a second claim right after returns nothing (idle window, no double enqueue)');

update public.stripe_events set sweep_last_at = now() - interval '11 minutes' where id in ('evt_sw_old', 'evt_sw_err');
select is((select count(*)::int from public.stripe_events_sweep_claim(interval '10 minutes', 2, 20) where action = 'requeue'), 2,
  '(20) after the idle window the second sweep claims them again');
update public.stripe_events set sweep_last_at = now() - interval '11 minutes' where id in ('evt_sw_old', 'evt_sw_err');
create temporary table sw3 as select * from public.stripe_events_sweep_claim(interval '10 minutes', 2, 20);
select is((select count(*)::int from sw3 where action = 'requeue'), 0, '(21) W4-01: past p_max_sweeps nothing is re-enqueued any more');
select ok((select array_agg(event_id order by event_id) = array['evt_sw_err', 'evt_sw_old'] from sw3 where action = 'abandon'),
  '(22) W4-01: the two that never settled are reported as abandon');
select is(public.stripe_events_sweep_abandoned(array['evt_sw_old']), 1, '(23) marking one reported event returns 1');
create temporary table sw4 as select * from public.stripe_events_sweep_claim(interval '10 minutes', 2, 20);
select ok((select array_agg(event_id) = array['evt_sw_err'] from sw4 where action = 'abandon'),
  '(24) W4-01: a reported event is not reported again; the one whose mail did not go out still is');
select is(public.stripe_events_sweep_abandoned(array['evt_sw_old', 'evt_sw_done']), 0,
  '(25) marking twice, or marking a processed event, marks nothing');
select ok((select processed_at is null and abandoned_at is not null from public.stripe_events where id = 'evt_sw_old'),
  '(26) an abandoned event stays unprocessed and findable');

select pg_temp.sns_ev('evt_sw_b1', 'checkout.session.completed', 'cs_sw_b1', interval '50 minutes');
select pg_temp.sns_ev('evt_sw_b2', 'checkout.session.completed', 'cs_sw_b2', interval '49 minutes');
select pg_temp.sns_ev('evt_sw_b3', 'checkout.session.completed', 'cs_sw_b3', interval '48 minutes');
select is((select count(*)::int from public.stripe_events_sweep_claim(interval '10 minutes', 6, 2) where action = 'requeue'), 2,
  '(27) W4-01: the batch is bounded by p_limit');
select throws_ok($$select * from public.stripe_events_sweep_claim(interval '10 minutes', 6, 0)$$, '22023', 'invalid_limit',
  '(28) a zero limit is refused');

-- D. W4-03: refund-required branches leave the event open until the Worker has refunded ----------------
-- D1 test booking: captured, never confirmed, refund required
select pg_temp.sns_ev('evt_sns_test', 'checkout.session.completed', 'cs_sns_test');
create temporary table d1 as select * from pg_temp.sns_settle('evt_sns_test', 'test');
select ok((select refund_required and refund_reason = 'test_booking' and not already_settled from d1), '(29) test_booking: refund required on the first delivery');
select ok((select processed_at is null and last_error = 'refund_required:test_booking' from public.stripe_events where id = 'evt_sns_test'),
  '(30) W4-03: the event is NOT stamped processed; it carries the refund_required marker');
select is((select status from public.booking_payments where stripe_checkout_session_id = 'cs_sns_test'), 'succeeded',
  '(31) the capture is recorded');
create temporary table d1b as select * from pg_temp.sns_settle('evt_sns_test', 'test');
select ok((select refund_required and refund_reason = 'test_booking' and already_settled from d1b),
  '(32) W4-03: the retry of the same event gets the refund order again (so a failed Stripe refund is retried)');
select is((select payment_id from d1b), (select payment_id from d1), '(33) the retry names the same payment (stable idempotency key)');
select is((select count(*)::int from public.booking_events e join public.bookings b on b.id = e.booking_id
            where b.contact_email = 'sns-test@example.test' and e.kind = 'payment.succeeded'),
  1, '(34) the retry writes no second payment event');
select public.stripe_event_settle('evt_sns_test', null);
select ok((select processed_at is not null from public.stripe_events where id = 'evt_sns_test'),
  '(35) the Worker stamps the event after the refund and its record succeeded');
select is((select count(*)::int from public.stripe_events_sweep_claim(interval '0 minutes') where event_id = 'evt_sns_test'), 0,
  '(36) a closed refund event is never swept');
create temporary table d1c as select * from pg_temp.sns_settle('evt_sns_test', 'test');
select ok((select not refund_required and already_settled from d1c),
  '(37) after the close a repeat is a plain already-settled: the refund is not ordered twice');

-- D2 duplicate charge: a second payment on the same snapshot
insert into public.booking_payments (booking_id, snapshot_id, stripe_payment_intent_id, stripe_checkout_session_id, charged_rappen, charged_currency, status)
select b.id, b.price_snapshot_id, 'cs_sns_dup2', 'cs_sns_dup2', 9, 'CHF', 'requires_payment'
  from public.bookings b where b.contact_email = 'sns-dup@example.test';
select pg_temp.sns_ev('evt_sns_dup1', 'checkout.session.completed', 'cs_sns_dup');
select pg_temp.sns_ev('evt_sns_dup2', 'checkout.session.completed', 'cs_sns_dup2');
select * from pg_temp.sns_settle('evt_sns_dup1', 'dup');
create temporary table d2 as
  select s.* from public.checkout_payment_settle('evt_sns_dup2', 'cs_sns_dup2', 'pi_sns_dup2', 'succeeded', 'CHF', null, null, null, null, null) s;
select ok((select duplicate and refund_required and refund_reason = 'duplicate_charge' from d2), '(38) duplicate: flagged, refund required');
select ok((select processed_at is null and last_error = 'refund_required:duplicate_charge' from public.stripe_events where id = 'evt_sns_dup2'),
  '(39) W4-03: the duplicate event stays open with its marker');
create temporary table d2b as
  select s.* from public.checkout_payment_settle('evt_sns_dup2', 'cs_sns_dup2', 'pi_sns_dup2', 'succeeded', 'CHF', null, null, null, null, null) s;
select ok((select duplicate and refund_required and refund_reason = 'duplicate_charge' and already_settled from d2b),
  '(40) W4-03: the retry of a duplicate event orders the refund again');
select is((select count(*)::int from public.booking_events e join public.bookings b on b.id = e.booking_id
            where b.contact_email = 'sns-dup@example.test' and e.kind = 'payment.duplicate'),
  2, '(41) a duplicate retry adds its own audit row (existing behaviour of the duplicate branch)');
update public.stripe_events set received_at = now() - interval '40 minutes', last_attempt_at = now() - interval '35 minutes' where id = 'evt_sns_dup2';
select ok(exists (select 1 from public.stripe_events_sweep_claim() where event_id = 'evt_sns_dup2' and action = 'requeue'),
  '(42) W4-03 + W4-01: an open refund_required event that nobody finished is swept (re-enqueued)');

-- E. W4-17 / W5-04: late failed / canceled events --------------------------------------------------
select pg_temp.sns_ev('evt_sns_late_paid', 'checkout.session.completed', 'cs_sns_late');
select pg_temp.sns_ev('evt_sns_late_fail', 'checkout.session.expired', 'cs_sns_late');
select pg_temp.sns_ev('evt_sns_late_cancel', 'payment_intent.canceled', 'pi_sns_late');
select * from pg_temp.sns_settle('evt_sns_late_paid', 'late');
create temporary table e_before as
  select count(*)::int n from public.booking_events e join public.bookings b on b.id = e.booking_id where b.contact_email = 'sns-late@example.test';
create temporary table e1 as select * from pg_temp.sns_settle('evt_sns_late_fail', 'late', 'failed');
select ok((select already_settled and not refund_required from e1), '(43) W5-04: a late failed event on a succeeded payment is answered already-settled, no raise');
select is((select status from public.booking_payments where stripe_checkout_session_id = 'cs_sns_late'), 'succeeded', '(44) the succeeded payment is not touched');
select is((select status::text from public.bookings where contact_email = 'sns-late@example.test'), 'confirmed', '(45) the booking stays confirmed');
select is((select count(*)::int from public.booking_events e join public.bookings b on b.id = e.booking_id where b.contact_email = 'sns-late@example.test'),
  (select n from e_before), '(46) W4-17: no payment.failed event is written');
select ok((select processed_at is not null from public.stripe_events where id = 'evt_sns_late_fail'), '(47) the late event is closed, not left to retry into the dead-letter queue');
select * from pg_temp.sns_settle('evt_sns_late_cancel', 'late', 'canceled');
select ok((select processed_at is not null from public.stripe_events where id = 'evt_sns_late_cancel')
          and (select status from public.booking_payments where stripe_checkout_session_id = 'cs_sns_late') = 'succeeded',
  '(48) the same for a late canceled event');

-- late failed on a duplicate row (refund still to be made)
insert into public.booking_payments (booking_id, snapshot_id, stripe_payment_intent_id, stripe_checkout_session_id, charged_rappen, charged_currency, status)
select b.id, b.price_snapshot_id, 'cs_sns_latedup2', 'cs_sns_latedup2', 9, 'CHF', 'requires_payment'
  from public.bookings b where b.contact_email = 'sns-latedup@example.test';
select pg_temp.sns_ev('evt_sns_ld1', 'checkout.session.completed', 'cs_sns_latedup');
select pg_temp.sns_ev('evt_sns_ld2', 'checkout.session.completed', 'cs_sns_latedup2');
select pg_temp.sns_ev('evt_sns_ld3', 'checkout.session.expired', 'cs_sns_latedup2');
select * from pg_temp.sns_settle('evt_sns_ld1', 'latedup');
select * from public.checkout_payment_settle('evt_sns_ld2', 'cs_sns_latedup2', 'pi_sns_latedup2', 'succeeded', 'CHF', null, null, null, null, null);
select ok((select status from public.booking_payments where stripe_checkout_session_id = 'cs_sns_latedup2') = 'duplicate', '(49) fixture: the second payment is a duplicate');
select * from public.checkout_payment_settle('evt_sns_ld3', 'cs_sns_latedup2', 'pi_sns_latedup2', 'failed', 'CHF', null, null, null, null, null);
select is((select status from public.booking_payments where stripe_checkout_session_id = 'cs_sns_latedup2'), 'duplicate',
  '(50) W5-04: a late failed event does not overwrite a duplicate payment');
select ok((select processed_at is not null from public.stripe_events where id = 'evt_sns_ld3'), '(51) and is closed');

-- A genuine failure on an open payment still marks it failed (unchanged)
select pg_temp.sns_mk('realfail');
select pg_temp.sns_ev('evt_sns_rf', 'checkout.session.expired', 'cs_sns_realfail');
select * from pg_temp.sns_settle('evt_sns_rf', 'realfail', 'failed');
select is((select status from public.booking_payments where stripe_checkout_session_id = 'cs_sns_realfail'), 'failed',
  '(52) a failed event on an open payment still fails it (unchanged)');
select ok((select processed_at is not null from public.stripe_events where id = 'evt_sns_rf'), '(53) and stamps the event (unchanged)');

-- F. W5-12: FX values the row cannot hold -----------------------------------------------------------
select pg_temp.sns_ev('evt_sns_fxg', 'checkout.session.completed', 'cs_sns_fxg');
select pg_temp.sns_ev('evt_sns_fxc', 'checkout.session.completed', 'cs_sns_fxc');
select pg_temp.sns_ev('evt_sns_fxe', 'checkout.session.completed', 'cs_sns_fxe');
select pg_temp.sns_ev('evt_sns_fxi', 'checkout.session.completed', 'cs_sns_fxi');
-- GBP is not an allowed currency
select lives_ok($$select * from pg_temp.sns_settle('evt_sns_fxg', 'fxg', 'succeeded', 'GBP', 1.1, 'stripe_adaptive_pricing', now(), 800, 'GBP')$$,
  '(54) W5-12: a GBP presentment does not raise after capture');
select ok((select p.status = 'succeeded' and p.charged_currency = 'CHF' and p.fx_rate is null and p.presentment_amount_minor is null
             from public.booking_payments p where p.stripe_checkout_session_id = 'cs_sns_fxg'),
  '(55) W5-12: the capture is recorded as CHF without FX detail');
select is((select status::text from public.bookings where contact_email = 'sns-fxg@example.test'), 'confirmed', '(56) W5-12: the booking is confirmed');
select ok((select e.payload ->> 'fx_not_recorded' = 'true' and e.payload ->> 'presentment_currency' = 'GBP' and e.payload ->> 'presentment_amount_minor' = '800'
             from public.booking_events e join public.bookings b on b.id = e.booking_id
            where b.contact_email = 'sns-fxg@example.test' and e.kind = 'payment.succeeded'),
  '(57) W5-12: the raw presentment facts are on the payment.succeeded event');
-- legacy currency_conversion shape: CHF with a rate
select lives_ok($$select * from pg_temp.sns_settle('evt_sns_fxc', 'fxc', 'succeeded', 'CHF', 1.1, 'stripe_adaptive_pricing', now(), 800, null)$$,
  '(58) W5-12: CHF with a rate (the legacy currency_conversion shape) does not raise after capture');
select ok((select p.status = 'succeeded' and p.charged_currency = 'CHF' and p.fx_rate is null
             from public.booking_payments p where p.stripe_checkout_session_id = 'cs_sns_fxc'), '(59) and is recorded without FX');
-- EUR with a complete tuple is stored as before
select lives_ok($$select * from pg_temp.sns_settle('evt_sns_fxe', 'fxe', 'succeeded', 'EUR', 1.05, 'stripe_adaptive_pricing', now(), 860, 'EUR')$$,
  '(60) a complete EUR tuple settles');
select ok((select p.charged_currency = 'EUR' and p.fx_rate = 1.05 and p.presentment_amount_minor = 860 and p.presentment_currency = 'EUR'
             from public.booking_payments p where p.stripe_checkout_session_id = 'cs_sns_fxe'),
  '(61) a complete EUR tuple is stored unchanged');
select ok((select e.payload = '{}'::jsonb from public.booking_events e join public.bookings b on b.id = e.booking_id
            where b.contact_email = 'sns-fxe@example.test' and e.kind = 'payment.succeeded'),
  '(62) no FX note when nothing was dropped');
-- EUR with an incomplete tuple
select lives_ok($$select * from pg_temp.sns_settle('evt_sns_fxi', 'fxi', 'succeeded', 'EUR', null, null, null, 860, 'EUR')$$,
  '(63) W5-12: an incomplete EUR tuple does not raise after capture');
select ok((select p.status = 'succeeded' and p.charged_currency = 'CHF' and p.fx_rate is null
             from public.booking_payments p where p.stripe_checkout_session_id = 'cs_sns_fxi'), '(64) and is recorded without FX');

-- W5-12 on the failure path: a bad FX tuple on a failed event does not raise either
select pg_temp.sns_mk('fxf');
select pg_temp.sns_ev('evt_sns_fxf', 'checkout.session.expired', 'cs_sns_fxf');
select lives_ok($$select * from pg_temp.sns_settle('evt_sns_fxf', 'fxf', 'failed', 'GBP', 1.1, 's', now(), 800, 'GBP')$$,
  '(65) a failed event with a GBP tuple does not raise');

-- G. grants -------------------------------------------------------------------------------------
select function_privs_are('public', 'stripe_event_close', '{text,text}'::text[], 'vamos_system', '{EXECUTE}'::text[], '(66) close: vamos_system holds EXECUTE');
select function_privs_are('public', 'stripe_events_sweep_claim', '{interval,int4,int4,interval}'::text[], 'vamos_system', '{EXECUTE}'::text[], '(67) sweep claim: vamos_system holds EXECUTE');
select function_privs_are('public', 'stripe_events_sweep_abandoned', '{text[]}'::text[], 'vamos_system', '{EXECUTE}'::text[], '(68) sweep abandoned: vamos_system holds EXECUTE');
select is(
  (select count(*)::int
     from unnest(array['anon', 'authenticated', 'vamos_checkout', 'vamos_guest', 'vamos_staff', 'vamos_edge', 'vamos_public']) r
     cross join unnest(array[
       'public.stripe_event_close(text,text)',
       'public.stripe_events_sweep_claim(interval,int4,int4,interval)',
       'public.stripe_events_sweep_abandoned(text[])',
       'public.stripe_event_settle(text,text)',
       'public.stripe_event_begin(text,text[],timestamptz)']) f
    where has_function_privilege(r, f, 'EXECUTE')),
  0, '(69) no API or Worker role but vamos_system can run the event functions');
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('stripe_event_close', 'stripe_events_sweep_claim', 'stripe_events_sweep_abandoned',
                        'stripe_event_settle', 'stripe_event_begin', 'checkout_payment_settle', 'checkout_extra_payment_settle')
      and p.prosecdef and p.proconfig @> array['search_path=""']),
  7, '(70) all seven are SECURITY DEFINER with search_path empty');
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'checkout_payment_settle'),
  1, '(71) the settle was replaced in place: one function, same signature');
select ok(has_function_privilege('vamos_system',
  'public.checkout_payment_settle(text,text,text,text,text,numeric,text,timestamptz,bigint,text,bigint,text,bigint,text)', 'EXECUTE'),
  '(72) vamos_system keeps EXECUTE on the settle');
select ok(
  (select position('from public.booking_payments' in p.prosrc) > 0
          and position('from public.booking_payments' in p.prosrc) < position('from public.bookings' in p.prosrc)
          and position('from public.bookings' in p.prosrc) < position('update public.stripe_events' in p.prosrc)
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'checkout_payment_settle'),
  '(73) lock order unchanged: payment row, then booking row, then the event row');
select ok(
  (select position('interval' in pg_get_function_arguments(p.oid)) > 0
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'stripe_events_sweep_claim'),
  '(74) the sweep takes its idle window as an interval');
select is((select count(*)::int from information_schema.columns
            where table_schema = 'public' and table_name = 'stripe_events'
              and column_name in ('last_attempt_at', 'sweep_count', 'sweep_last_at', 'abandoned_at')),
  4, '(75) stripe_events has the four new columns');
select ok((select sweep_count = 0 from public.stripe_events where id = 'evt_sns_open'), '(76) an ordinary event starts at sweep_count 0');
select ok((select obj_description(p.oid, 'pg_proc') like '%20261012100000%'
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'stripe_event_settle'), '(77) the comment names the migration');

select * from finish();
rollback;
