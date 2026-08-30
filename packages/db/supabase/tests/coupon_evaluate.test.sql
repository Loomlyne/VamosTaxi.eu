-- coupon_evaluate.test.sql
--
-- D-30 / D-31 / D-50: one assertion per named refusal in the seven-rule ladder, the
-- released-redemption pair that is why released_at exists, a per-user contact_email
-- case, stored-casing of the code, and the charge-gate / coupon-path ordering case
-- under authenticated and vamos_guest.
--
-- D-46: every priced fixture is a synthetic unit-free integer inside this rolled-back
-- transaction; no CHF figure.
begin;
select plan(16);

-- Fixtures -----------------------------------------------------------------------------
insert into public.vehicle_classes (slug, passenger_capacity, luggage_capacity)
values ('first', 3, 3);

insert into public.rate_versions (slug, label) values ('cev-rv', 'Coupon evaluate fixture');

insert into public.distance_rates (
  rate_version_id, vehicle_class_id, max_pax, base_fare_rappen, per_km_rappen, min_fare_rappen
)
select rv.id, vc.id, 3, 1, 2, 3
  from public.rate_versions rv, public.vehicle_classes vc
 where rv.slug = 'cev-rv' and vc.slug = 'first';

insert into public.surcharges (rate_version_id, code, kind, percent, predicate)
select rv.id, 'night', 'percent', 10.00, '{"kind":"always"}'::jsonb
  from public.rate_versions rv where rv.slug = 'cev-rv';

insert into public.settings_versions (slug, label)
values ('cev-policy', 'Coupon evaluate policy fixture');

insert into public.customers (full_name, email)
values ('CEV Customer', 'cev@example.test');

insert into public.bookings (contact_name, contact_email, customer_id)
select 'CEV Booking', 'cev-booking@example.test', c.id
  from public.customers c where c.email = 'cev@example.test';

insert into public.booking_legs (
  booking_id, leg_seq, direction, pickup_text, dropoff_text,
  scheduled_at, scheduled_local, vehicle_class_id
)
select b.id, 1, 'outbound', 'ZRH', 'Zurich HB', now() + interval '3 days',
       to_char(now() + interval '3 days', 'YYYY-MM-DD"T"HH24:MI'), vc.id
  from public.bookings b, public.vehicle_classes vc
 where b.contact_email = 'cev-booking@example.test' and vc.slug = 'first';

-- Eight-key policy + one priced line summing to total 6 (reconcile + charge gate).
create temporary table pol as
select jsonb_build_object(
         'cancellation_tiers', '[]'::jsonb,
         'free_cancel_hours', 24,
         'airport_waiting_minutes', 60,
         'city_waiting_minutes', 15,
         'settings_version_id', 1,
         'modification_deadline_hours', 24,
         'min_advance_minutes', 180,
         'policy_doc', 'cev'
       ) as policy,
       jsonb_build_array(jsonb_build_object(
         'seq', 1,
         'code', 'distance_fare',
         'kind', 'fare',
         'i18n_key', 'price.line.distance',
         'amount_rappen', 6
       )) as lines;

create temporary table fx as
select vc.id as vehicle_class_id, rv.id as rate_version_id, sv.id as settings_version_id,
       b.id as booking_id
  from public.vehicle_classes vc, public.rate_versions rv, public.settings_versions sv,
       public.bookings b
 where vc.slug = 'first' and rv.slug = 'cev-rv' and sv.slug = 'cev-policy'
   and b.contact_email = 'cev-booking@example.test';
grant select on fx to public;
grant select on pol to public;

-- D-50 unchargeable snapshot: inserted while cev-rv is still draft. Flag frozen false.
insert into public.price_snapshots (
  quote_id, vehicle_class_id, rate_version_id, rate_version_is_live, settings_version_id,
  engine_version, pax, bags, lines, policy, booking_id,
  subtotal_rappen, surcharges_rappen, discount_rappen, total_rappen,
  expires_at, quote_lock_expires_at
)
select gen_random_uuid(), fx.vehicle_class_id, fx.rate_version_id, true, fx.settings_version_id,
       'quote-engine@cev-d50', 1, 0, pol.lines, pol.policy, fx.booking_id,
       6, 0, 0, 6,
       now() + interval '30 minutes', now() + interval '30 minutes'
  from fx, pol;

update public.bookings set price_snapshot_id =
  (select id from public.price_snapshots where engine_version = 'quote-engine@cev-d50')
 where id = (select booking_id from fx);

-- Publish so later redemption fixtures can insert booking_payments.
update public.rate_versions set status = 'live' where slug = 'cev-rv';

-- Builder: booking + bound live snapshot + payment, so coupon_redemptions has a payment_id.
create function pg_temp.mk_fixture_payment(p_label text, p_email text, p_customer_id uuid default null)
returns table (booking_id uuid, payment_id bigint) language plpgsql as $mk$
declare v_booking_id uuid; v_snapshot_id bigint; v_payment_id bigint;
begin
  insert into public.bookings (contact_name, contact_email, customer_id)
  values ('CEV ' || p_label, p_email, p_customer_id)
  returning id into v_booking_id;

  insert into public.price_snapshots (
    quote_id, vehicle_class_id, rate_version_id, rate_version_is_live, settings_version_id,
    engine_version, pax, bags, lines, policy, booking_id,
    subtotal_rappen, surcharges_rappen, discount_rappen, total_rappen,
    expires_at, quote_lock_expires_at
  )
  select gen_random_uuid(), fx.vehicle_class_id, fx.rate_version_id, true, fx.settings_version_id,
         'quote-engine@' || p_label, 1, 0, pol.lines, pol.policy, v_booking_id,
         6, 0, 0, 6,
         now() + interval '30 minutes', now() + interval '30 minutes'
    from fx, pol
  returning id into v_snapshot_id;

  update public.bookings set price_snapshot_id = v_snapshot_id where id = v_booking_id;

  insert into public.booking_payments (
    booking_id, snapshot_id, stripe_payment_intent_id, charged_rappen, status
  )
  values (v_booking_id, v_snapshot_id, 'pi_' || p_label, 6, 'requires_payment')
  returning id into v_payment_id;

  return query select v_booking_id, v_payment_id;
end $mk$;

create temporary table pay_cap as
  select * from pg_temp.mk_fixture_payment('cap', 'cev-cap@example.test');
create temporary table pay_user as
  select * from pg_temp.mk_fixture_payment('user', 'cev-guest@example.test');

-- One fixture coupon per rule. Codes are stored uppercase (coupons.code = upper(code)).
insert into public.coupons (code, kind, percent, active)
  values ('EV-INACTIVE', 'percent', 10.00, false);
insert into public.coupons (code, kind, percent, valid_from)
  values ('EV-FUTURE', 'percent', 10.00, now() + interval '1 day');
insert into public.coupons (code, kind, percent, valid_from, valid_until)
  values ('EV-EXPIRED', 'percent', 10.00, now() - interval '2 days', now() - interval '1 day');
insert into public.coupons (code, kind, percent, amount_rappen)
  values ('EV-UNPRICED', 'percent', null, null);
insert into public.coupons (code, kind, percent, global_limit)
  values ('EV-CAP', 'percent', 10.00, 1);
insert into public.coupons (code, kind, percent, per_user_limit)
  values ('EV-PERUSER', 'percent', 10.00, 1);
insert into public.coupons (code, kind, percent)
  values ('EV-OK', 'percent', 10.00);

-- Unreleased redemption that fills EV-CAP's global_limit.
insert into public.coupon_redemptions (coupon_id, booking_id, payment_id)
select c.id, pay_cap.booking_id, pay_cap.payment_id
  from public.coupons c, pay_cap
 where c.code = 'EV-CAP';

-- Per-user redemption keyed by the guest booking's contact_email.
insert into public.coupon_redemptions (coupon_id, booking_id, payment_id)
select c.id, pay_user.booking_id, pay_user.payment_id
  from public.coupons c, pay_user
 where c.code = 'EV-PERUSER';

create temporary table cev_counts as
select count(*)::integer as n from public.coupon_redemptions;
grant select on cev_counts to public;

-- Seven-rule ladder + ok path + stored casing (quote identity) -------------------------
set local role anon;

select is(
  public.evaluate_coupon('no-such-code') ->> 'i18n_key',
  'quote.coupon.error.not_found',
  '(1) rule 1: missing code → not_found'
);
select is(
  public.evaluate_coupon('EV-INACTIVE') ->> 'i18n_key',
  'quote.coupon.error.inactive',
  '(2) rule 2: inactive → inactive'
);
select is(
  public.evaluate_coupon('EV-FUTURE') ->> 'i18n_key',
  'quote.coupon.error.not_yet_valid',
  '(3) rule 3: valid_from in the future → not_yet_valid'
);
select is(
  public.evaluate_coupon('EV-EXPIRED') ->> 'i18n_key',
  'quote.coupon.error.expired',
  '(4) rule 4: valid_until in the past → expired'
);
select is(
  public.evaluate_coupon('EV-UNPRICED') ->> 'i18n_key',
  'quote.coupon.error.unpriced',
  '(5) rule 5: percent and amount_rappen both null → unpriced'
);
select is(
  public.evaluate_coupon('EV-CAP') ->> 'i18n_key',
  'quote.coupon.error.usage_cap',
  '(6) rule 6: unreleased redemption at global_limit → usage_cap'
);

reset role;

-- D-31: SET released_at (never DELETE); the same code must now return ok.
update public.coupon_redemptions
   set released_at = now(), released_reason = 'test-release'
 where coupon_id = (select id from public.coupons where code = 'EV-CAP');

set local role anon;

select is(
  public.evaluate_coupon('EV-CAP') -> 'ok',
  'true'::jsonb,
  '(7) D-31: released redemption no longer counts; EV-CAP returns ok'
);
select is(
  public.evaluate_coupon('EV-PERUSER', null, 'cev-guest@example.test') ->> 'i18n_key',
  'quote.coupon.error.per_user_cap',
  '(8) rule 7: per-user cap by contact_email → per_user_cap'
);
select is(
  public.evaluate_coupon('EV-OK') -> 'ok',
  'true'::jsonb,
  '(9) ok path: priced active coupon with no redemptions'
);
select is(
  public.evaluate_coupon('ev-ok') ->> 'code',
  'EV-OK',
  '(10) returned code is stored uppercase even when p_code is typed lower'
);

reset role;

-- PUBLIC EXECUTE restored by create or replace must stay revoked (T-04-22) -------------
select function_privs_are(
  'public', 'tg_coupon_redemption_caps', '{}'::text[],
  'public', '{}'::text[],
  '(11) PUBLIC holds no EXECUTE on tg_coupon_redemption_caps'
);
select function_privs_are(
  'public', 'evaluate_coupon', '{text,uuid,citext}'::text[],
  'public', '{}'::text[],
  '(12) PUBLIC holds no EXECUTE on evaluate_coupon'
);

-- D-50: payment gate first, zero coupon side effect. Temporary grants so the INSERT
-- reaches the trigger (roles hold no booking_payments INSERT in production).
grant insert on public.booking_payments to authenticated, vamos_guest;
grant select on public.price_snapshots to authenticated, vamos_guest;
create policy cev_d50_insert on public.booking_payments
  as permissive for insert to authenticated, vamos_guest
  with check (true);
create policy cev_d50_snap_select on public.price_snapshots
  as permissive for select to authenticated, vamos_guest
  using (true);

set local role authenticated;
select throws_ok(
  $$ insert into public.booking_payments (booking_id, snapshot_id, stripe_payment_intent_id, charged_rappen, status)
     select fx.booking_id, ps.id, 'pi_cev_d50_auth', 6, 'requires_payment'
       from fx, public.price_snapshots ps where ps.engine_version = 'quote-engine@cev-d50' $$,
  '23001',
  null,
  '(13) D-50: unchargeable snapshot raises restrict_violation under authenticated'
);
reset role;

select is(
  (select count(*)::integer from public.coupon_redemptions),
  (select n from cev_counts),
  '(14) D-50: coupon_redemptions count unchanged after authenticated payment refusal'
);

set local role vamos_guest;
select throws_ok(
  $$ insert into public.booking_payments (booking_id, snapshot_id, stripe_payment_intent_id, charged_rappen, status)
     select fx.booking_id, ps.id, 'pi_cev_d50_guest', 6, 'requires_payment'
       from fx, public.price_snapshots ps where ps.engine_version = 'quote-engine@cev-d50' $$,
  '23001',
  null,
  '(15) D-50: unchargeable snapshot raises restrict_violation under vamos_guest'
);
reset role;

select is(
  (select count(*)::integer from public.coupon_redemptions),
  (select n from cev_counts),
  '(16) D-50: coupon_redemptions count unchanged after vamos_guest payment refusal'
);

select * from finish();
rollback;
