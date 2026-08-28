-- charge_gate.test.sql
--
-- Proves QUOTE-10's charge gate holds in every refusal case pgTAP can express: a draft rate
-- version, an expired snapshot, an amount mismatch, a snapshot whose OWN rate_version_is_live
-- was frozen false at insert time even after the version later publishes (D-09); the payments
-- UPDATE-column whitelist (D-18); F-06's wrong-snapshot and second-success refusals;
-- F-07's coupon-cap refusals. pgTAP runs one connection in one transaction, so cases (14)-(16)
-- prove the CAP itself; the `FOR UPDATE` that makes it race-safe under concurrent sessions is
-- asserted by this plan's migration-file acceptance grep (`where id = new.coupon_id for
-- update` in ...015_coupon_redemptions.sql), not by simulated concurrency here.
begin;
select plan(23);

-- Fixtures --------------------------------------------------------------------------------
insert into public.vehicle_classes (slug, passenger_capacity, luggage_capacity)
values ('first', 3, 3);

insert into public.rate_versions (slug, label) values ('charge-gate-rv', 'Charge gate fixture');

-- Synthetic figures, rolled back at the end of this file -- never a real CHF amount (D-34).
insert into public.distance_rates (rate_version_id, vehicle_class_id, max_pax, base_fare_rappen, per_km_rappen, min_fare_rappen)
select rv.id, vc.id, 3, 1, 2, 3
  from public.rate_versions rv, public.vehicle_classes vc
 where rv.slug = 'charge-gate-rv' and vc.slug = 'first';

insert into public.surcharges (rate_version_id, code, kind, percent, predicate)
select rv.id, 'night', 'percent', 10.00, '{"kind":"always"}'::jsonb
  from public.rate_versions rv where rv.slug = 'charge-gate-rv';

insert into public.settings_versions (slug, label) values ('charge-gate-policy', 'Charge gate policy fixture');

insert into public.customers (full_name, email) values ('Charge Gate Customer', 'cg@example.test');

insert into public.bookings (contact_name, contact_email, customer_id)
select 'Charge Gate Booking', 'cg-booking@example.test', c.id
  from public.customers c where c.email = 'cg@example.test';

insert into public.booking_legs (booking_id, leg_seq, direction, pickup_text, dropoff_text,
                                  scheduled_at, scheduled_local, vehicle_class_id)
select b.id, 1, 'outbound', 'ZRH', 'Zurich HB', now() + interval '3 days',
       to_char(now() + interval '3 days', 'YYYY-MM-DD"T"HH24:MI'), vc.id
  from public.bookings b, public.vehicle_classes vc
 where b.contact_email = 'cg-booking@example.test' and vc.slug = 'first';

create temporary table fx as
select vc.id as vehicle_class_id, rv.id as rate_version_id, sv.id as settings_version_id,
       b.id as booking_id
  from public.vehicle_classes vc, public.rate_versions rv, public.settings_versions sv,
       public.bookings b
 where vc.slug = 'first' and rv.slug = 'charge-gate-rv' and sv.slug = 'charge-gate-policy'
   and b.contact_email = 'cg-booking@example.test';

create temporary table pol as
select jsonb_build_object('cancellation_tiers', '[]'::jsonb, 'free_cancel_hours', 24,
                           'airport_waiting_minutes', 60, 'city_waiting_minutes', 15,
                           'settings_version_id', 1) as policy;

-- S1: inserted while charge-gate-rv is still 'draft'. rate_version_is_live is frozen false on
-- this row by tg_snapshot_rate_version_flag REGARDLESS of what the version does later (case 6).
insert into public.price_snapshots (
  quote_id, vehicle_class_id, rate_version_id, rate_version_is_live, settings_version_id,
  engine_version, pax, bags, lines, policy, booking_id,
  subtotal_rappen, surcharges_rappen, discount_rappen, total_rappen, expires_at
)
select gen_random_uuid(), fx.vehicle_class_id, fx.rate_version_id, false, fx.settings_version_id,
       'quote-engine@s1', 1, 0, '[]'::jsonb, pol.policy, fx.booking_id, 6, 0, 0, 6,
       now() + interval '30 minutes'
  from fx, pol;

-- (1) Payment against S1 while charge-gate-rv is draft: refused, not chargeable. --------------
select throws_ok(
  $$ insert into public.booking_payments (booking_id, snapshot_id, stripe_payment_intent_id, charged_rappen, status)
     select fx.booking_id, ps.id, 'pi_case1', 6, 'requires_payment'
       from fx, public.price_snapshots ps where ps.engine_version = 'quote-engine@s1' $$,
  '23001',
  null,
  '(1) payment against a draft-version snapshot raises restrict_violation (not chargeable)'
);

-- Publish charge-gate-rv -- passes because the distance_rates/surcharges fixtures above are
-- fully priced (tg_rate_version_transition's completeness gate).
update public.rate_versions set status = 'live' where slug = 'charge-gate-rv';

-- S2: inserted AFTER publish. tg_snapshot_rate_version_flag derives rate_version_is_live = true.
insert into public.price_snapshots (
  quote_id, vehicle_class_id, rate_version_id, rate_version_is_live, settings_version_id,
  engine_version, pax, bags, lines, policy, booking_id,
  subtotal_rappen, surcharges_rappen, discount_rappen, total_rappen, expires_at
)
select gen_random_uuid(), fx.vehicle_class_id, fx.rate_version_id, false, fx.settings_version_id,
       'quote-engine@s2', 1, 0, '[]'::jsonb, pol.policy, fx.booking_id, 6, 0, 0, 6,
       now() + interval '30 minutes'
  from fx, pol;

-- (2) S2 is chargeable: total is set and the version it cites is now live. --------------------
select is(
  (select is_chargeable from public.price_snapshots where engine_version = 'quote-engine@s2'),
  true,
  '(2) S2 is chargeable once charge-gate-rv is live'
);

-- The checkout endpoint binds the customer's chosen snapshot to the booking BEFORE creating the
-- PaymentIntent -- F-06's charge-gate check reads exactly this column.
update public.bookings set price_snapshot_id =
  (select id from public.price_snapshots where engine_version = 'quote-engine@s2')
  where id = (select booking_id from fx);

-- (3) A charge that does not match S2's total is refused. -------------------------------------
select throws_ok(
  $$ insert into public.booking_payments (booking_id, snapshot_id, stripe_payment_intent_id, charged_rappen, status)
     select fx.booking_id, ps.id, 'pi_case3', 7, 'requires_payment'
       from fx, public.price_snapshots ps where ps.engine_version = 'quote-engine@s2' $$,
  '23001',
  null,
  '(3) charged_rappen=7 against a total_rappen=6 snapshot raises restrict_violation (mismatch)'
);

-- (4) A correctly-matched charge against S2 succeeds. ------------------------------------------
select lives_ok(
  $$ insert into public.booking_payments (booking_id, snapshot_id, stripe_payment_intent_id, charged_rappen, status)
     select fx.booking_id, ps.id, 'pi_case4', 6, 'requires_payment'
       from fx, public.price_snapshots ps where ps.engine_version = 'quote-engine@s2' $$,
  '(4) charged_rappen=6 against S2 (total_rappen=6) succeeds'
);

-- S3: expires in the past.
insert into public.price_snapshots (
  quote_id, vehicle_class_id, rate_version_id, rate_version_is_live, settings_version_id,
  engine_version, pax, bags, lines, policy, booking_id,
  subtotal_rappen, surcharges_rappen, discount_rappen, total_rappen, expires_at
)
select gen_random_uuid(), fx.vehicle_class_id, fx.rate_version_id, true, fx.settings_version_id,
       'quote-engine@s3', 1, 0, '[]'::jsonb, pol.policy, fx.booking_id, 6, 0, 0, 6,
       now() - interval '1 second'
  from fx, pol;

-- (5) A payment against an already-expired snapshot is refused. --------------------------------
select throws_ok(
  $$ insert into public.booking_payments (booking_id, snapshot_id, stripe_payment_intent_id, charged_rappen, status)
     select fx.booking_id, ps.id, 'pi_case5', 6, 'requires_payment'
       from fx, public.price_snapshots ps where ps.engine_version = 'quote-engine@s3' $$,
  '23001',
  null,
  '(5) payment against an expired snapshot (S3) raises restrict_violation'
);

-- (6) S1, inserted while draft, still refuses after charge-gate-rv publishes: the flag was --
-- frozen at S1's own insert time, not re-derived live (proves §18 row 1's design). -------------
select throws_ok(
  $$ insert into public.booking_payments (booking_id, snapshot_id, stripe_payment_intent_id, charged_rappen, status)
     select fx.booking_id, ps.id, 'pi_case6', 6, 'requires_payment'
       from fx, public.price_snapshots ps where ps.engine_version = 'quote-engine@s1' $$,
  '23001',
  null,
  '(6) S1 (frozen not-live at insert time) still raises after charge-gate-rv is later published'
);

-- (7) Stripe's webhook is allowed to move status/captured_at (the D-18 whitelist exception). ---
select lives_ok(
  $$ update public.booking_payments set status = 'succeeded', captured_at = now()
       where stripe_payment_intent_id = 'pi_case4' $$,
  '(7) UPDATE status/captured_at on the case-4 payment succeeds (whitelist)'
);

-- (8) Rewriting charged_rappen after the fact is refused (D-18 whitelist). ---------------------
select throws_ok(
  $$ update public.booking_payments set charged_rappen = 5 where stripe_payment_intent_id = 'pi_case4' $$,
  '23001',
  null,
  '(8) UPDATE charged_rappen on an existing payment raises restrict_violation (whitelist)'
);

-- (9) Rewriting snapshot_id after the fact is refused (D-18 whitelist). ------------------------
select throws_ok(
  $$ update public.booking_payments set snapshot_id =
       (select id from public.price_snapshots where engine_version = 'quote-engine@s3')
       where stripe_payment_intent_id = 'pi_case4' $$,
  '23001',
  null,
  '(9) UPDATE snapshot_id on an existing payment raises restrict_violation (whitelist)'
);

-- (10) stripe_events: id is the Stripe event id, deduped by primary key. -----------------------
select lives_ok(
  $$ insert into public.stripe_events (id, type, stripe_created, payload)
     values ('evt_case10', 'payment_intent.succeeded', now(), '{}'::jsonb) $$,
  '(10a) first insert of stripe_events id evt_case10 succeeds'
);
select throws_ok(
  $$ insert into public.stripe_events (id, type, stripe_created, payload)
     values ('evt_case10', 'payment_intent.succeeded', now(), '{}'::jsonb) $$,
  '23505',
  null,
  '(10b) a second insert of the same stripe_events id raises 23505 (webhook replay dedupe)'
);

-- (11) booking_notifications: dedupe_key makes a retried send a no-op. -------------------------
select lives_ok(
  format($$ insert into public.booking_notifications (booking_id, kind, locale, dedupe_key)
             values (%L, 'confirmation', 'en', 'dk-case11') $$, (select booking_id from fx)),
  '(11a) first insert of booking_notifications dedupe_key dk-case11 succeeds'
);
select throws_ok(
  format($$ insert into public.booking_notifications (booking_id, kind, locale, dedupe_key)
             values (%L, 'confirmation', 'en', 'dk-case11') $$, (select booking_id from fx)),
  '23505',
  null,
  '(11b) a second insert with the same dedupe_key raises 23505 (double-send guard, PAY-05)'
);

-- S4: a second, equally valid, equally live snapshot for the SAME booking (the
-- price_snapshots_quote_class shape: the quote endpoint priced more than one class in one
-- call). bookings.price_snapshot_id still names S2, never S4.
insert into public.price_snapshots (
  quote_id, vehicle_class_id, rate_version_id, rate_version_is_live, settings_version_id,
  engine_version, pax, bags, lines, policy, booking_id,
  subtotal_rappen, surcharges_rappen, discount_rappen, total_rappen, expires_at
)
select gen_random_uuid(), fx.vehicle_class_id, fx.rate_version_id, true, fx.settings_version_id,
       'quote-engine@s4', 1, 0, '[]'::jsonb, pol.policy, fx.booking_id, 6, 0, 0, 6,
       now() + interval '30 minutes'
  from fx, pol;

-- (12) F-06: a payment citing S4 is refused even though S4 is itself perfectly valid, chargeable
-- and belongs to the right booking -- it is simply not the snapshot the booking is bound to. ---
select throws_ok(
  $$ insert into public.booking_payments (booking_id, snapshot_id, stripe_payment_intent_id, charged_rappen, status)
     select fx.booking_id, ps.id, 'pi_case12', 6, 'requires_payment'
       from fx, public.price_snapshots ps where ps.engine_version = 'quote-engine@s4' $$,
  '23001',
  null,
  '(12) F-06: payment citing S4 raises even though every other check passes -- the booking is bound to S2, not S4'
);

-- (13) F-06: a second booking_payments row for the same booking, citing the SAME (correct)
-- snapshot as case 4, is allowed to exist while 'requires_payment' -- but moving it to
-- 'succeeded' while the case-4 payment already holds that status for this booking is refused
-- by booking_payments_one_success. -------------------------------------------------------------
select lives_ok(
  $$ insert into public.booking_payments (booking_id, snapshot_id, stripe_payment_intent_id, charged_rappen, status)
     select fx.booking_id, ps.id, 'pi_case13', 6, 'requires_payment'
       from fx, public.price_snapshots ps where ps.engine_version = 'quote-engine@s2' $$,
  '(13a) a second booking_payments row for the same booking, still requires_payment, inserts fine'
);
select throws_ok(
  $$ update public.booking_payments set status = 'succeeded', captured_at = now()
       where stripe_payment_intent_id = 'pi_case13' $$,
  '23505',
  null,
  '(13b) F-06: moving the second payment to succeeded raises 23505 (booking_payments_one_success) -- one price, one Stripe charge'
);

-- F-07 fixtures: a reusable "booking + bound live snapshot + payment" builder, so cases (14)-(16)
-- do not each hand-roll booking/snapshot/payment plumbing. Session-scoped (pg_temp), dropped at
-- rollback.
create function pg_temp.mk_fixture_payment(p_label text, p_customer_id uuid default null)
returns table (booking_id uuid, payment_id bigint) language plpgsql as $mk$
declare v_booking_id uuid; v_snapshot_id bigint; v_payment_id bigint;
begin
  insert into public.bookings (contact_name, contact_email, customer_id)
  values ('Coupon Fixture ' || p_label, p_label || '@example.test', p_customer_id)
  returning id into v_booking_id;

  insert into public.price_snapshots (
    quote_id, vehicle_class_id, rate_version_id, rate_version_is_live, settings_version_id,
    engine_version, pax, bags, lines, policy, booking_id,
    subtotal_rappen, surcharges_rappen, discount_rappen, total_rappen, expires_at
  )
  select gen_random_uuid(), fx.vehicle_class_id, fx.rate_version_id, true, fx.settings_version_id,
         'quote-engine@' || p_label, 1, 0, '[]'::jsonb, pol.policy, v_booking_id, 6, 0, 0, 6,
         now() + interval '30 minutes'
    from fx, pol
  returning id into v_snapshot_id;

  update public.bookings set price_snapshot_id = v_snapshot_id where id = v_booking_id;

  insert into public.booking_payments (booking_id, snapshot_id, stripe_payment_intent_id, charged_rappen, status)
  values (v_booking_id, v_snapshot_id, 'pi_' || p_label, 6, 'requires_payment')
  returning id into v_payment_id;

  return query select v_booking_id, v_payment_id;
end $mk$;

insert into public.customers (full_name, email) values ('Coupon Cust A', 'coupon-a@example.test');
insert into public.customers (full_name, email) values ('Coupon Cust B', 'coupon-b@example.test');

create temporary table pay_b1 as select * from pg_temp.mk_fixture_payment('cpn-b1');
create temporary table pay_b2 as select * from pg_temp.mk_fixture_payment('cpn-b2');
create temporary table pay_b3 as select * from pg_temp.mk_fixture_payment('cpn-b3', (select id from public.customers where email = 'coupon-a@example.test'));
create temporary table pay_b4 as select * from pg_temp.mk_fixture_payment('cpn-b4', (select id from public.customers where email = 'coupon-a@example.test'));
create temporary table pay_b5 as select * from pg_temp.mk_fixture_payment('cpn-b5', (select id from public.customers where email = 'coupon-b@example.test'));
create temporary table pay_b6 as select * from pg_temp.mk_fixture_payment('cpn-b6');

insert into public.coupons (code, kind, percent, global_limit) values ('CG-GLOBAL1', 'percent', 10.00, 1);
insert into public.coupons (code, kind, percent, per_user_limit) values ('CG-PERUSER1', 'percent', 10.00, 1);
insert into public.coupons (code, kind, percent, active) values ('CG-INACTIVE', 'percent', 10.00, false);
insert into public.coupons (code, kind, percent, valid_from, valid_until)
  values ('CG-EXPIRED', 'percent', 10.00, now() - interval '2 days', now() - interval '1 day');

-- (14) F-07: coupon global_limit = 1 -- the first redemption succeeds, a second for a
-- DIFFERENT booking is refused once the cap is reached. ------------------------------------------
select lives_ok(
  format($$ insert into public.coupon_redemptions (coupon_id, booking_id, payment_id)
             select id, %L, %L from public.coupons where code = 'CG-GLOBAL1' $$,
         (select booking_id from pay_b1), (select payment_id from pay_b1)),
  '(14a) F-07: first redemption under global_limit=1 succeeds'
);
select throws_ok(
  format($$ insert into public.coupon_redemptions (coupon_id, booking_id, payment_id)
             select id, %L, %L from public.coupons where code = 'CG-GLOBAL1' $$,
         (select booking_id from pay_b2), (select payment_id from pay_b2)),
  '23001',
  null,
  '(14b) F-07: a second redemption of the same coupon for a different booking raises once global_limit=1 is reached'
);

-- (15) F-07: coupon per_user_limit = 1 -- capped per customer, not globally. ----------------------
select lives_ok(
  format($$ insert into public.coupon_redemptions (coupon_id, booking_id, payment_id, customer_id)
             select id, %L, %L, %L from public.coupons where code = 'CG-PERUSER1' $$,
         (select booking_id from pay_b3), (select payment_id from pay_b3),
         (select id from public.customers where email = 'coupon-a@example.test')),
  '(15a) F-07: first redemption under per_user_limit=1 (customer A) succeeds'
);
select throws_ok(
  format($$ insert into public.coupon_redemptions (coupon_id, booking_id, payment_id, customer_id)
             select id, %L, %L, %L from public.coupons where code = 'CG-PERUSER1' $$,
         (select booking_id from pay_b4), (select payment_id from pay_b4),
         (select id from public.customers where email = 'coupon-a@example.test')),
  '23001',
  null,
  '(15b) F-07: a second redemption by the SAME customer raises once per_user_limit=1 is reached'
);
select lives_ok(
  format($$ insert into public.coupon_redemptions (coupon_id, booking_id, payment_id, customer_id)
             select id, %L, %L, %L from public.coupons where code = 'CG-PERUSER1' $$,
         (select booking_id from pay_b5), (select payment_id from pay_b5),
         (select id from public.customers where email = 'coupon-b@example.test')),
  '(15c) F-07: a DIFFERENT customer redeeming the same coupon still succeeds -- the cap is per-user, not global'
);

-- (16) F-07: an inactive coupon, and a coupon past its valid_until, both refuse. ------------------
select throws_ok(
  format($$ insert into public.coupon_redemptions (coupon_id, booking_id, payment_id)
             select id, %L, %L from public.coupons where code = 'CG-INACTIVE' $$,
         (select booking_id from pay_b6), (select payment_id from pay_b6)),
  '23001',
  null,
  '(16a) F-07: an inactive coupon raises "coupon unavailable"'
);
select throws_ok(
  format($$ insert into public.coupon_redemptions (coupon_id, booking_id, payment_id)
             select id, %L, %L from public.coupons where code = 'CG-EXPIRED' $$,
         (select booking_id from pay_b6), (select payment_id from pay_b6)),
  '23001',
  null,
  '(16b) F-07: a coupon whose valid_until has passed raises "coupon outside its window"'
);

select * from finish();
rollback;
