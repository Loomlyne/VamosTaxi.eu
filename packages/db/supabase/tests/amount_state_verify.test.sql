-- amount_state_verify.test.sql
--
-- Stripe payments review 2026-10-09, job J3, migration 20261012110000 (W4-07, W4-08, W5-02, W5-03, W5-09,
-- W5-10). The difference (extra) payment side of W4-07 and W5-10 is in settle_safety.test.sql section J.
--   A  amount, currency and booking check at settle: a match settles; a mismatch records the capture and holds
--      the booking; a legitimate EUR presentment is not a mismatch; the old call without amounts is unchanged.
--   B  duplicate detection across the booking.
--   C  status transitions of booking_payments.
--   D  a duplicate payment does not inflate what a cancel owes.
--   E  grants and shape.
-- Rolled back. Synthetic integer rappen only.
begin;
select plan(60);

-- Fixtures --------------------------------------------------------------------------------
update public.rate_versions set status = 'retired' where status = 'live';
insert into public.vehicle_classes (slug, passenger_capacity, luggage_capacity)
values ('asv-eco', 3, 3);
insert into public.rate_versions (slug, label) values ('asv-rv', 'amount verify fixture');
insert into public.distance_rates (rate_version_id, vehicle_class_id, max_pax, base_fare_rappen, per_km_rappen, min_fare_rappen)
select rv.id, vc.id, 3, 1, 2, 3
  from public.rate_versions rv, public.vehicle_classes vc
 where rv.slug = 'asv-rv' and vc.slug = 'asv-eco';
update public.rate_versions set status = 'live' where slug = 'asv-rv';
insert into public.settings_versions (slug, label) values ('asv-policy', 'amount verify fixture');

-- One pending booking (one leg, one price record of 9, one open payment cs_asv_<tag>, pi_asv_<tag>).
create function pg_temp.asv_mk(p_tag text, p_status text default 'pending', p_is_test boolean default false)
returns uuid language plpgsql as $$
declare
  v_b uuid;
  v_snap bigint;
begin
  insert into public.bookings (contact_name, contact_email, contact_phone, quote_id, status, is_test)
  values ('ASV ' || p_tag, 'asv-' || p_tag || '@example.test', '+41000000099', gen_random_uuid(),
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
   where vc.slug = 'asv-eco' and rv.slug = 'asv-rv' and sv.slug = 'asv-policy'
  returning id into v_snap;

  update public.bookings set price_snapshot_id = v_snap, price_total_rappen = 9 where id = v_b;

  insert into public.booking_legs (
    booking_id, leg_seq, direction, pickup_text, dropoff_text,
    scheduled_at, scheduled_local, vehicle_class_id, status
  )
  select v_b, 1, 'outbound', 'ZRH Airport', 'Zurich HB',
         now() + interval '3 days', to_char(now() + interval '3 days', 'YYYY-MM-DD"T"HH24:MI'),
         vc.id, p_status::public.booking_status
    from public.vehicle_classes vc where vc.slug = 'asv-eco';

  insert into public.booking_payments (
    booking_id, snapshot_id, stripe_payment_intent_id, stripe_checkout_session_id,
    charged_rappen, charged_currency, status
  ) values (v_b, v_snap, 'cs_asv_' || p_tag, 'cs_asv_' || p_tag, 9, 'CHF', 'requires_payment');
  return v_b;
end $$;

create function pg_temp.asv_ev(p_id text, p_type text, p_object text, p_age interval default interval '0 minutes')
returns void language sql as $$
  insert into public.stripe_events (id, type, stripe_created, object_id, payload, received_at)
  values (p_id, p_type, now() - p_age, p_object, '{}'::jsonb, now() - p_age)
$$;

create function pg_temp.asv_settle(p_event text, p_tag text, p_total int8 default null, p_cur text default null,
                                    p_recv int8 default null, p_meta text default null)
returns table (already_settled bool, revived bool, duplicate bool, refund_required bool, refund_reason text,
               payment_id int8, other_open_session_ids text[], amount_mismatch bool)
language sql as $$
  select s.already_settled, s.revived, s.duplicate, s.refund_required, s.refund_reason, s.payment_id,
         s.other_open_session_ids, s.amount_mismatch
    from public.checkout_payment_settle(p_event, 'cs_asv_' || p_tag, 'pi_asv_' || p_tag, 'succeeded',
                                        'CHF', null, null, null, null, null,
                                        p_total, p_cur, p_recv, p_meta) as s
$$;


insert into auth.users (id, email, aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('26100910-0000-4000-a000-000000000001', 'asv-admin@vamostaxi.eu', 'authenticated', 'authenticated',
        '{}'::jsonb, '{}'::jsonb, now(), now());
insert into public.staff (user_id, role, active, accepted_at, full_name)
values ('26100910-0000-4000-a000-000000000001', 'admin', true, now(), 'ASV Admin');

select pg_temp.asv_mk('ok');
select pg_temp.asv_mk('okid');
select pg_temp.asv_mk('okfx');
select pg_temp.asv_mk('old');
select pg_temp.asv_mk('mtot');
select pg_temp.asv_mk('mrecv');
select pg_temp.asv_mk('mcur');
select pg_temp.asv_mk('mbk');
select pg_temp.asv_mk('mcan', 'cancelled');
select pg_temp.asv_mk('mtest', 'pending', true);
select pg_temp.asv_mk('dupb');
select pg_temp.asv_mk('dupx');
select pg_temp.asv_mk('trn');
select pg_temp.asv_mk('cxl');

create function pg_temp.asv_quote(p_tag text) returns text language sql as $$
  select b.quote_id::text from public.bookings b where b.contact_email = 'asv-' || p_tag || '@example.test'
$$;
create function pg_temp.asv_bid(p_tag text) returns uuid language sql as $$
  select b.id from public.bookings b where b.contact_email = 'asv-' || p_tag || '@example.test'
$$;

-- A second price record for a booking (a staff change rebound it), 30 minutes live.
create function pg_temp.asv_snap2(p_tag text) returns bigint language plpgsql as $$
declare v_id bigint;
begin
  insert into public.price_snapshots (
    quote_id, vehicle_class_id, rate_version_id, rate_version_is_live, settings_version_id,
    engine_version, pax, bags, lines, policy, booking_id, expires_at, quote_lock_expires_at,
    subtotal_rappen, surcharges_rappen, discount_rappen, total_rappen
  )
  select gen_random_uuid(), s.vehicle_class_id, s.rate_version_id, true, s.settings_version_id, s.engine_version, 1, 0, s.lines, s.policy,
         s.booking_id, now() + interval '30 minutes', now() + interval '30 minutes', 9, 0, 0, 9
    from public.price_snapshots s where s.booking_id = pg_temp.asv_bid(p_tag) order by s.id limit 1
  returning id into v_id;
  return v_id;
end $$;

-- A. W4-07 / W5-02: the amount, currency and booking check -----------------------------------------
-- A1 a matching payment confirms as before (metadata = the quote id, as the checkout route sets it)
select pg_temp.asv_ev('evt_asv_ok', 'checkout.session.completed', 'cs_asv_ok');
create temporary table a1 as select * from pg_temp.asv_settle('evt_asv_ok', 'ok', 9, 'CHF', 9, pg_temp.asv_quote('ok'));
select ok((select not amount_mismatch and not already_settled and not refund_required from a1), '(1) a payment that matches is settled normally');
select is((select status::text from public.bookings where contact_email = 'asv-ok@example.test'), 'confirmed', '(2) the booking is confirmed');
select ok((select processed_at is not null from public.stripe_events where id = 'evt_asv_ok'), '(3) the event is processed');
-- A2 metadata may name the booking id itself (pay-link sessions)
select pg_temp.asv_ev('evt_asv_okid', 'checkout.session.completed', 'cs_asv_okid');
select ok((select not amount_mismatch from pg_temp.asv_settle('evt_asv_okid', 'okid', 9, 'chf', 9, pg_temp.asv_bid('okid')::text)),
  '(4) the metadata may name the booking id (pay link) and a lower-case currency');
-- A3 an adaptive-pricing presentment in EUR of the same CHF charge is not a mismatch
select pg_temp.asv_ev('evt_asv_okfx', 'checkout.session.completed', 'cs_asv_okfx');
select ok((select not s.amount_mismatch
             from public.checkout_payment_settle('evt_asv_okfx', 'cs_asv_okfx', 'pi_asv_okfx', 'succeeded',
                                                 'EUR', 1.05, 'stripe_adaptive_pricing', now(), 860, 'EUR',
                                                 9, 'chf', 9, pg_temp.asv_quote('okfx')) s),
  '(5) a legitimate EUR presentment of the same CHF charge (session in CHF, FX columns filled) is not a mismatch');
select ok((select p.charged_currency = 'EUR' and p.presentment_amount_minor = 860 from public.booking_payments p where p.stripe_checkout_session_id = 'cs_asv_okfx'),
  '(6) and the presentment facts are stored as before');
select is((select status::text from public.bookings where contact_email = 'asv-okfx@example.test'), 'confirmed', '(7) and the booking is confirmed');
-- A4 the old ten-argument call (no amounts) is unchanged
select pg_temp.asv_ev('evt_asv_old', 'checkout.session.completed', 'cs_asv_old');
select ok((select not s.amount_mismatch and not s.already_settled
             from public.checkout_payment_settle('evt_asv_old', 'cs_asv_old', 'pi_asv_old', 'succeeded', 'CHF', null, null, null, null) s),
  '(8) a call without the amount arguments behaves as before');
select is((select status::text from public.bookings where contact_email = 'asv-old@example.test'), 'confirmed', '(9) and confirms');

-- A5 mismatches: amount_total, amount_received, currency, booking
select pg_temp.asv_ev('evt_asv_mtot', 'checkout.session.completed', 'cs_asv_mtot');
create temporary table m1 as select * from pg_temp.asv_settle('evt_asv_mtot', 'mtot', 8, 'CHF', 9, pg_temp.asv_quote('mtot'));
select ok((select amount_mismatch and already_settled and not refund_required and not duplicate and not revived from m1),
  '(10) amount_total differs: mismatch, no confirmation order, no auto-refund');
select is((select status::text from public.bookings where contact_email = 'asv-mtot@example.test'), 'pending', '(11) the booking is NOT confirmed: it stays pending');
select ok((select p.status = 'succeeded' and p.captured_at is not null from public.booking_payments p where p.stripe_checkout_session_id = 'cs_asv_mtot'),
  '(12) the capture is recorded (the money is real)');
select ok((select processed_at is null and last_error = 'amount_mismatch' from public.stripe_events where id = 'evt_asv_mtot'),
  '(13) the event stays open with last_error amount_mismatch until ops is mailed');
select ok((select e.payload ->> 'amount_mismatch' = 'true'
              and e.payload -> 'reasons' = '["amount_total"]'::jsonb
              and (e.payload ->> 'expected_rappen')::int = 9
              and (e.payload ->> 'amount_total_minor')::int = 8
             from public.booking_events e
            where e.booking_id = pg_temp.asv_bid('mtot') and e.kind = 'payment.succeeded'),
  '(14) the payment event carries the reason, the expected and the received amounts (ids and numbers only)');
select is((select count(*)::int from public.booking_events e where e.booking_id = pg_temp.asv_bid('mtot') and e.kind = 'booking.status_changed'), 0,
  '(15) no status event: the booking never moved');
create temporary table m1b as select * from pg_temp.asv_settle('evt_asv_mtot', 'mtot', 8, 'CHF', 9, pg_temp.asv_quote('mtot'));
select ok((select amount_mismatch and already_settled from m1b), '(16) a retry of the open event answers the same (so a failed ops mail is sent again)');
select is((select count(*)::int from public.booking_events e where e.booking_id = pg_temp.asv_bid('mtot') and e.kind = 'payment.succeeded'), 1,
  '(17) the retry writes no second event');
select public.stripe_event_close('evt_asv_mtot', 'amount_mismatch');
select ok((select processed_at is not null and last_error = 'amount_mismatch' from public.stripe_events where id = 'evt_asv_mtot'),
  '(18) the Worker closes it after the mail: processed, reason kept');

select pg_temp.asv_ev('evt_asv_mrecv', 'checkout.session.completed', 'cs_asv_mrecv');
select ok((select amount_mismatch from pg_temp.asv_settle('evt_asv_mrecv', 'mrecv', 9, 'CHF', 5, pg_temp.asv_quote('mrecv'))),
  '(19) amount_received differs: mismatch');
select is((select status::text from public.bookings where contact_email = 'asv-mrecv@example.test'), 'pending', '(20) and the booking stays pending');
select pg_temp.asv_ev('evt_asv_mcur', 'checkout.session.completed', 'cs_asv_mcur');
select ok((select amount_mismatch from pg_temp.asv_settle('evt_asv_mcur', 'mcur', 9, 'EUR', 9, pg_temp.asv_quote('mcur'))),
  '(21) a session not in CHF is a mismatch');
select pg_temp.asv_ev('evt_asv_mbk', 'checkout.session.completed', 'cs_asv_mbk');
select ok((select amount_mismatch from pg_temp.asv_settle('evt_asv_mbk', 'mbk', 9, 'CHF', 9, gen_random_uuid()::text)),
  '(22) metadata naming another booking is a mismatch');
select is((select status::text from public.bookings where contact_email = 'asv-mbk@example.test'), 'pending', '(23) and the booking stays pending');
select ok((select e.payload -> 'reasons' = '["booking_id"]'::jsonb from public.booking_events e where e.booking_id = pg_temp.asv_bid('mbk') and e.kind = 'payment.succeeded'),
  '(24) the reason names the booking id check only');

-- a mismatch on a cancelled booking is held too: not revived, not refunded
select pg_temp.asv_ev('evt_asv_mcan', 'checkout.session.completed', 'cs_asv_mcan');
select ok((select amount_mismatch and not revived and not refund_required from pg_temp.asv_settle('evt_asv_mcan', 'mcan', 7, 'CHF', 7, pg_temp.asv_quote('mcan'))),
  '(25) a mismatch on a cancelled booking is held: no revive, no refund order');
select is((select status::text from public.bookings where contact_email = 'asv-mcan@example.test'), 'cancelled', '(26) it stays cancelled');
select pg_temp.asv_ev('evt_asv_mtest', 'checkout.session.completed', 'cs_asv_mtest');
select ok((select amount_mismatch and not refund_required from pg_temp.asv_settle('evt_asv_mtest', 'mtest', 7, 'CHF', 7, pg_temp.asv_quote('mtest'))),
  '(27) a mismatch on a test booking is held too (no automatic refund of a guessed amount)');

-- the cron never cancels a pending booking that holds a captured payment
update public.bookings set pay_link_sent_at = now() - interval '2 days', hold_until = now() - interval '1 day'
 where contact_email in ('asv-mtot@example.test', 'asv-mrecv@example.test');
select pg_temp.asv_mk('unpaid');
update public.bookings set pay_link_sent_at = now() - interval '2 days', hold_until = now() - interval '1 day'
 where contact_email = 'asv-unpaid@example.test';
set local session_replication_role = replica;
update public.price_snapshots set quote_lock_expires_at = now() - interval '1 day'
 where booking_id in (pg_temp.asv_bid('mtot'), pg_temp.asv_bid('mrecv'), pg_temp.asv_bid('unpaid'));
set local session_replication_role = origin;
create temporary table cron1 as select * from public.checkout_expire_unpaid();
select ok(exists (select 1 from cron1 where booking_id = pg_temp.asv_bid('unpaid')), '(28) fixture: the cron still cancels an expired unpaid pay-link booking');
select ok(not exists (select 1 from cron1 where booking_id in (pg_temp.asv_bid('mtot'), pg_temp.asv_bid('mrecv'))),
  '(29) W4-07: it never cancels a pending booking that holds a captured payment held for review');

-- B. W4-08: a second main-session payment on one booking, another snapshot -------------------------------
select pg_temp.asv_ev('evt_asv_dupb1', 'checkout.session.completed', 'cs_asv_dupb');
select pg_temp.asv_ev('evt_asv_dupb2', 'checkout.session.completed', 'cs_asv_dupb2');
select * from pg_temp.asv_settle('evt_asv_dupb1', 'dupb', 9, 'CHF', 9, pg_temp.asv_quote('dupb'));
-- a staff change rebound the booking to a new price record, an older page paid nothing, a new page is paid
create temporary table dupb_snap as select pg_temp.asv_snap2('dupb') as id;
update public.bookings set price_snapshot_id = (select id from dupb_snap) where id = pg_temp.asv_bid('dupb');
insert into public.booking_payments (booking_id, snapshot_id, stripe_payment_intent_id, stripe_checkout_session_id, charged_rappen, charged_currency, status)
values (pg_temp.asv_bid('dupb'), (select id from dupb_snap), 'cs_asv_dupb2', 'cs_asv_dupb2', 9, 'CHF', 'requires_payment');
create temporary table b1 as
  select s.* from public.checkout_payment_settle('evt_asv_dupb2', 'cs_asv_dupb2', 'pi_asv_dupb2', 'succeeded', 'CHF', null, null, null, null, null, 9, 'CHF', 9, pg_temp.asv_quote('dupb')) s;
select ok((select duplicate and refund_required and refund_reason = 'duplicate_charge' from b1),
  '(30) W4-08: a second main payment on the booking with ANOTHER snapshot is flagged duplicate and refunded');
select is((select status from public.booking_payments where stripe_checkout_session_id = 'cs_asv_dupb2'), 'duplicate', '(31) and recorded as duplicate');
select is((select status::text from public.bookings where contact_email = 'asv-dupb@example.test'), 'confirmed', '(32) the booking stays confirmed once');

-- a difference payment (extra) is not the first payment
select pg_temp.asv_ev('evt_asv_dupx1', 'checkout.session.completed', 'cs_asv_dupx');
create temporary table dupx_snap as select pg_temp.asv_snap2('dupx') as id;
create temporary table dupx_orig as select b.price_snapshot_id as id from public.bookings b where b.id = pg_temp.asv_bid('dupx');
-- an extra payment: succeeded on its own price record (the booking is bound to it while it is recorded, as
-- the settle does), named by a change request; then the booking is bound to its own record again
update public.bookings set price_snapshot_id = (select id from dupx_snap) where id = pg_temp.asv_bid('dupx');
insert into public.booking_payments (booking_id, snapshot_id, stripe_payment_intent_id, stripe_checkout_session_id, charged_rappen, charged_currency, status, captured_at)
values (pg_temp.asv_bid('dupx'), (select id from dupx_snap), 'pi_asv_dupx_extra', 'cs_asv_dupx_extra', 9, 'CHF', 'succeeded', now());
insert into public.booking_edit_requests (booking_id, actor, quote_snapshot_id, status, extra_payment_id)
select pg_temp.asv_bid('dupx'), 'staff', (select id from dupx_snap), 'accepted', p.id
  from public.booking_payments p where p.stripe_checkout_session_id = 'cs_asv_dupx_extra';
update public.bookings set price_snapshot_id = (select id from dupx_orig) where id = pg_temp.asv_bid('dupx');
create temporary table x1 as select * from pg_temp.asv_settle('evt_asv_dupx1', 'dupx', 9, 'CHF', 9, pg_temp.asv_quote('dupx'));
select ok((select not duplicate and not refund_required from x1),
  '(33) W4-08: a difference payment of the booking does not make the main payment a duplicate');
select is((select status::text from public.bookings where contact_email = 'asv-dupx@example.test'), 'confirmed', '(34) and the main payment confirms');

-- C. W5-03: status transitions --------------------------------------------------------------------
select pg_temp.asv_mk('trn2');
create temporary table trn as select p.id from public.booking_payments p where p.stripe_checkout_session_id in ('cs_asv_trn', 'cs_asv_trn2') order by p.id;
select throws_ok($$update public.booking_payments set status = 'succeeded' where stripe_checkout_session_id = 'cs_asv_trn'$$, '23001',
  'booking_payments: a succeeded row needs captured_at', '(35) a row cannot reach succeeded without captured_at');
select lives_ok($$update public.booking_payments set status = 'succeeded', captured_at = now() where stripe_checkout_session_id = 'cs_asv_trn'$$,
  '(36) requires_payment to succeeded (with captured_at) is allowed');
select throws_ok($$update public.booking_payments set status = 'failed', captured_at = null where stripe_checkout_session_id = 'cs_asv_trn'$$, '23001',
  'booking_payments: a succeeded row is terminal', '(37) succeeded stays terminal (unchanged rule)');
select lives_ok($$update public.booking_payments set status = 'failed' where stripe_checkout_session_id = 'cs_asv_trn2'$$, '(38) requires_payment to failed is allowed');
select lives_ok($$update public.booking_payments set status = 'canceled' where stripe_checkout_session_id = 'cs_asv_trn2'$$, '(39) failed to canceled is allowed (expired page, then canceled intent)');
select lives_ok($$update public.booking_payments set status = 'failed' where stripe_checkout_session_id = 'cs_asv_trn2'$$, '(40) and back to failed (the same two events in the other order)');
select throws_ok($$update public.booking_payments set status = 'requires_payment' where stripe_checkout_session_id = 'cs_asv_trn2'$$, '23001', null,
  '(41) nothing returns to requires_payment');
select throws_ok($$update public.booking_payments set status = 'duplicate' where stripe_checkout_session_id = 'cs_asv_trn2'$$, '23001', null,
  '(42) a duplicate needs captured_at');
select lives_ok($$update public.booking_payments set status = 'succeeded', captured_at = now() where stripe_checkout_session_id = 'cs_asv_trn2'$$,
  '(43) a late payment on a failed row may succeed');
-- duplicate is terminal
select pg_temp.asv_mk('trn3');
update public.booking_payments set status = 'duplicate', captured_at = now() where stripe_checkout_session_id = 'cs_asv_trn3';
select throws_ok($$update public.booking_payments set status = 'succeeded' where stripe_checkout_session_id = 'cs_asv_trn3'$$, '23001',
  'booking_payments: a duplicate row is terminal', '(44) duplicate to succeeded is refused: a duplicate stays terminal');
select throws_ok($$update public.booking_payments set status = 'canceled', captured_at = null where stripe_checkout_session_id = 'cs_asv_trn3'$$, '23001',
  'booking_payments: a duplicate row is terminal', '(45) a late canceled cannot overwrite a duplicate');
select pg_temp.asv_mk('trn4');
select throws_ok($$update public.booking_payments set status = 'failed', captured_at = now() where stripe_checkout_session_id = 'cs_asv_trn4'$$, '23001',
  'booking_payments: a failed row has no captured_at', '(46) a failed row carries no captured_at');

-- D. W5-09: a duplicate does not inflate what a cancel owes ----------------------------------------------
select pg_temp.asv_ev('evt_asv_cxl1', 'checkout.session.completed', 'cs_asv_cxl');
select * from pg_temp.asv_settle('evt_asv_cxl1', 'cxl', 9, 'CHF', 9, pg_temp.asv_quote('cxl'));
insert into public.booking_payments (booking_id, snapshot_id, stripe_payment_intent_id, stripe_checkout_session_id, charged_rappen, charged_currency, status)
select b.id, b.price_snapshot_id, 'cs_asv_cxl2', 'cs_asv_cxl2', 9, 'CHF', 'requires_payment' from public.bookings b where b.contact_email = 'asv-cxl@example.test';
select pg_temp.asv_ev('evt_asv_cxl2', 'checkout.session.completed', 'cs_asv_cxl2');
select * from public.checkout_payment_settle('evt_asv_cxl2', 'cs_asv_cxl2', 'pi_asv_cxl2', 'succeeded', 'CHF', null, null, null, null, null, 9, 'CHF', 9, pg_temp.asv_quote('cxl'));
select is((select status from public.booking_payments where stripe_checkout_session_id = 'cs_asv_cxl2'), 'duplicate', '(47) fixture: the second payment is a duplicate');
select is(app.booking_paid_net(pg_temp.asv_bid('cxl')), 9, '(48) W5-09: paid net counts the booking''s own payment only, before the duplicate is refunded');
select is((select basis_rappen::int from public.compute_cancellation_refund(pg_temp.asv_bid('cxl'))), 9,
  '(49) W5-09: the cancellation basis counts the booking''s own payment only');
-- the duplicate refund lands (checkout_duplicate_refund_record) and does not disturb either number
select public.checkout_duplicate_refund_record((select id from public.booking_payments where stripe_checkout_session_id = 'cs_asv_cxl2'), 're_asv_cxl2', 9, 'duplicate_charge');
select is(app.booking_paid_net(pg_temp.asv_bid('cxl')), 9, '(50) after the duplicate refund the paid net is still the booking''s own payment');
create temporary table cxl as select * from public.ops_cancel_booking(pg_temp.asv_bid('cxl'), '26100910-0000-4000-a000-000000000001'::uuid);
select is((select b.refund_owed_rappen::int from public.bookings b where b.id = pg_temp.asv_bid('cxl')), 9,
  '(51) W5-09: a cancel more than 24 h ahead owes the booking''s own payment, not that plus the duplicate');
select is((select b.refund_status from public.bookings b where b.id = pg_temp.asv_bid('cxl')), 'pending_ops', '(52) and ends as refund due');

-- E. grants and shape -----------------------------------------------------------------------------
select function_privs_are('public', 'checkout_payment_settle', '{text,text,text,text,text,numeric,text,timestamptz,int8,text,int8,text,int8,text}'::text[], 'vamos_system', '{EXECUTE}'::text[], '(53) settle: vamos_system holds EXECUTE');
select function_privs_are('public', 'checkout_extra_payment_settle', '{text,text,text,text,text,numeric,text,timestamptz,int8,int8,text,int8,text}'::text[], 'vamos_system', '{EXECUTE}'::text[], '(54) extra settle: vamos_system holds EXECUTE');
select is(
  (select count(*)::int
     from unnest(array['anon', 'authenticated', 'vamos_checkout', 'vamos_guest', 'vamos_staff', 'vamos_edge', 'vamos_public']) r
     cross join unnest(array[
       'public.checkout_payment_settle(text,text,text,text,text,numeric,text,timestamptz,int8,text,int8,text,int8,text)',
       'public.checkout_extra_payment_settle(text,text,text,text,text,numeric,text,timestamptz,int8,int8,text,int8,text)']) f
    where has_function_privilege(r, f, 'EXECUTE')),
  0, '(55) no API or Worker role but vamos_system can settle');
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('checkout_payment_settle', 'checkout_extra_payment_settle')),
  2, '(56) the old argument lists are gone: one function each (no ambiguous overload)');
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('checkout_payment_settle', 'checkout_extra_payment_settle', 'checkout_expire_unpaid',
                                                 'compute_cancellation_refund', 'tg_payment_matches_snapshot')
      and p.prosecdef and p.proconfig @> array['search_path=""']),
  5, '(57) the replaced functions stay SECURITY DEFINER with search_path empty');
select ok(
  (select position('from public.booking_payments' in p.prosrc) > 0
          and position('from public.booking_payments' in p.prosrc) < position('from public.bookings' in p.prosrc)
          and position('from public.bookings' in p.prosrc) < position('update public.stripe_events' in p.prosrc)
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'checkout_payment_settle'),
  '(58) lock order unchanged: payment row, then booking row, then the event row');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname = 'checkout_payment_settle'
              and obj_description(p.oid, 'pg_proc') like '%20261012110000%'), 1, '(59) the settle comment names this migration');
select ok(has_function_privilege('vamos_system', 'public.compute_cancellation_refund(uuid)', 'EXECUTE'), '(60) compute_cancellation_refund keeps its grant');

select * from finish();
rollback;
