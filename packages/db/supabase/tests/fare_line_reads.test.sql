-- fare_line_reads.test.sql
--
-- 261003 fare lines (migration 20261007230000). The pay-link page, Manage booking and My bookings read
-- the saved price lines through two read-only definers. A new price saves the airport pickup fee and the
-- route extra as their own fare lines, and a voucher as list_rappen on the lines it was taken from plus
-- a coupon line with amount_rappen null and params.discount_rappen. Both readers now also return
-- list_rappen, discount_rappen and, for the fixed_route line only, origin and destination.
-- Old one-line prices carry none of those params: the new fields are null and everything else reads as before.
-- Grants, SECURITY DEFINER and the fixed search_path are unchanged. Rolled back. Synthetic rappen only.
begin;
select plan(24);

insert into public.vehicle_classes (slug, passenger_capacity, luggage_capacity, name)
values ('flr-class', 4, 4, 'Business');
insert into public.rate_versions (slug, label) values ('flr-rv', 'FLR fixture');
update public.rate_versions set status = 'live' where slug = 'flr-rv';

-- N = new shape, paid (Manage booking). O = old one-line shape, paid. P = new shape, pending (pay link).
insert into public.bookings (reference, contact_name, contact_email, status, locale)
values
  (public.next_booking_reference(), 'FLR New', 'flr-n@vamostaxi.eu', 'confirmed', 'en'),
  (public.next_booking_reference(), 'FLR Old', 'flr-o@vamostaxi.eu', 'pending', 'en'),
  (public.next_booking_reference(), 'FLR Pay', 'flr-p@vamostaxi.eu', 'pending', 'en');

insert into public.booking_legs (
  booking_id, leg_seq, direction, pickup_text, dropoff_text,
  scheduled_at, scheduled_local, vehicle_class_id, estimated_duration_minutes, pax, bags
)
select b.id, 1, 'outbound', 'ZRH Airport', 'Geneva',
       now() + interval '48 hours', to_char(now() + interval '48 hours', 'YYYY-MM-DD"T"HH24:MI'),
       vc.id, 60, 2, 2
  from public.bookings b, public.vehicle_classes vc
 where b.contact_email like 'flr-%@vamostaxi.eu' and vc.slug = 'flr-class';

set local session_replication_role = replica;

-- New shape: fare 4000 (voucher 5000 folded in: list 4000, saved 0), airport fee 1500 (list 1500, saved 500),
-- route 2500 (untouched), child seat 1000, coupon (discount 5000), VAT 400. Saved amounts sum to 4400.
create function pg_temp.flr_new_lines() returns jsonb language sql immutable as $$
  select jsonb_build_array(
    jsonb_build_object('seq', 1, 'code', 'distance_fare', 'kind', 'fare', 'i18n_key', 'price.line.transfer',
      'amount_rappen', 0, 'params', jsonb_build_object('vehicleClass', 'flr-class', 'list_rappen', 4000)),
    jsonb_build_object('seq', 2, 'code', 'airport_fee', 'kind', 'fare', 'i18n_key', 'price.line.airport_fee',
      'amount_rappen', 500, 'params', jsonb_build_object('list_rappen', 1500)),
    jsonb_build_object('seq', 3, 'code', 'fixed_route', 'kind', 'fare', 'i18n_key', 'price.line.fixed_route',
      'amount_rappen', 2500, 'params', jsonb_build_object('origin', 'Zürich', 'destination', 'Genève')),
    jsonb_build_object('seq', 4, 'code', 'child-seat', 'kind', 'surcharge', 'i18n_key', 'price.surcharge.custom',
      'amount_rappen', 1000,
      'params', jsonb_build_object('names', jsonb_build_object('en', 'Child seat', 'de', 'Kindersitz', 'internal', 'do not leak'),
                                   'secret', 'x')),
    jsonb_build_object('seq', 5, 'code', 'WELCOME', 'kind', 'coupon', 'i18n_key', 'price.line.coupon',
      'amount_rappen', null, 'params', jsonb_build_object('discount_rappen', 5000, 'amountRappen', 5000)),
    jsonb_build_object('seq', 6, 'code', 'vat', 'kind', 'vat', 'i18n_key', 'price.line.vat',
      'amount_rappen', 400, 'params', jsonb_build_object('vatRateBps', 81))
  )
$$;
create function pg_temp.flr_old_lines() returns jsonb language sql immutable as $$
  select jsonb_build_array(
    jsonb_build_object('seq', 1, 'code', 'distance_fare', 'kind', 'fare', 'i18n_key', 'price.line.transfer',
      'amount_rappen', 9000, 'params', jsonb_build_object('vehicleClass', 'flr-class')),
    jsonb_build_object('seq', 2, 'code', 'vat', 'kind', 'vat', 'i18n_key', 'price.line.vat',
      'amount_rappen', 729, 'params', jsonb_build_object('vatRateBps', 81))
  )
$$;

insert into public.price_snapshots (
  quote_id, vehicle_class_id, rate_version_id, rate_version_is_live, settings_version_id,
  engine_version, pax, bags, lines, policy,
  subtotal_rappen, surcharges_rappen, discount_rappen, total_rappen,
  expires_at, quote_lock_expires_at, booking_id, source
)
select
  gen_random_uuid(), vc.id, rv.id, true, sv.id, 'quote-engine@flr', 2, 2,
  case when b.contact_email = 'flr-o@vamostaxi.eu' then pg_temp.flr_old_lines() else pg_temp.flr_new_lines() end,
  jsonb_build_object('cancellation_tiers', '[]'::jsonb, 'free_cancel_hours', 24,
                     'airport_waiting_minutes', 60, 'city_waiting_minutes', 15,
                     'settings_version_id', sv.id, 'modification_deadline_hours', 24,
                     'min_advance_minutes', 180, 'policy_doc', 'test'),
  case when b.contact_email = 'flr-o@vamostaxi.eu' then 9729 else 4400 end, 0, 0,
  case when b.contact_email = 'flr-o@vamostaxi.eu' then 9729 else 4400 end,
  now() + interval '1 day', now() + interval '1 day', b.id, 'web'
from public.vehicle_classes vc
cross join public.bookings b
cross join lateral (select id from public.rate_versions where slug = 'flr-rv') rv
cross join lateral (select id from public.settings_versions order by id limit 1) sv
where vc.slug = 'flr-class' and b.contact_email like 'flr-%@vamostaxi.eu';

update public.bookings b
   set price_snapshot_id = s.id
  from public.price_snapshots s
 where s.booking_id = b.id and s.engine_version = 'quote-engine@flr';

insert into public.booking_payments (
  booking_id, snapshot_id, stripe_payment_intent_id, charged_rappen, charged_currency, status, captured_at
)
select b.id, b.price_snapshot_id, 'pi_flr_' || substr(b.contact_email, 5, 1),
       case when b.contact_email = 'flr-o@vamostaxi.eu' then 9729 else 4400 end, 'CHF', 'succeeded', now()
  from public.bookings b where b.contact_email in ('flr-n@vamostaxi.eu', 'flr-o@vamostaxi.eu');

set local session_replication_role = origin;

insert into public.booking_access_tokens (booking_id, token_hash, purpose, expires_at)
select b.id, extensions.digest('flr-pay', 'sha256'), 'pay', now() + interval '1 day'
  from public.bookings b where b.contact_email = 'flr-p@vamostaxi.eu';
insert into public.booking_access_tokens (booking_id, token_hash, purpose, expires_at)
select b.id, extensions.digest('flr-pay-old', 'sha256'), 'pay', now() + interval '1 day'
  from public.bookings b where b.contact_email = 'flr-o@vamostaxi.eu';

create temporary table flr as
select public.manage_money_for((select id from public.bookings where contact_email = 'flr-n@vamostaxi.eu')) as n,
       public.manage_money_for((select id from public.bookings where contact_email = 'flr-o@vamostaxi.eu')) as o;
grant select on flr to public;

-- manage_money_for: new shape -----------------------------------------------------------
select is((select jsonb_array_length(n -> 'lines') from flr), 6, 'manage: the six saved lines come back');
select is((select array_agg(l ->> 'code' order by ord) from flr, jsonb_array_elements(n -> 'lines') with ordinality t(l, ord)),
  array['distance_fare', 'airport_fee', 'fixed_route', 'child-seat', 'WELCOME', 'vat'], 'manage: line order kept');
select is((select (n -> 'lines' -> 0 ->> 'list_rappen')::int from flr), 4000, 'manage: the fare line carries its list figure');
select is((select (n -> 'lines' -> 1 ->> 'list_rappen')::int from flr), 1500, 'manage: the airport fee carries its list figure');
select ok((select n -> 'lines' -> 2 -> 'list_rappen' = 'null'::jsonb from flr), 'manage: an untouched piece has no list figure');
select is((select n -> 'lines' -> 2 ->> 'origin' from flr), 'Zürich', 'manage: the route line names the origin town');
select is((select n -> 'lines' -> 2 ->> 'destination' from flr), 'Genève', 'manage: the route line names the destination town');
select ok((select n -> 'lines' -> 0 -> 'origin' = 'null'::jsonb and n -> 'lines' -> 1 -> 'origin' = 'null'::jsonb from flr),
  'manage: no other line leaks place names');
select is((select (n -> 'lines' -> 4 ->> 'discount_rappen')::int from flr), 5000, 'manage: the voucher line carries its discount');
select ok((select n -> 'lines' -> 4 -> 'amount_rappen' = 'null'::jsonb from flr), 'manage: the voucher line amount stays null as saved');
select ok(not (select n -> 'lines' -> 3 -> 'names' ? 'internal' from flr), 'manage: only the four locale names leave');
select ok(not (select (n -> 'lines' -> 3)::text like '%secret%' from flr), 'manage: no other param leaves');
select is((select array_agg(k order by k) from flr, jsonb_object_keys(n -> 'lines' -> 0) k),
  array['amount_rappen', 'code', 'destination', 'discount_rappen', 'kind', 'list_rappen', 'names', 'origin', 'vat_rate_bps'],
  'manage: each line has exactly the nine keys');
select is((select sum((l ->> 'amount_rappen')::int)::int from flr, jsonb_array_elements(n -> 'lines') l), 4400,
  'manage: saved amounts still sum to the charged total');

-- manage_money_for: old one-line shape --------------------------------------------------
select is((select jsonb_array_length(o -> 'lines') from flr), 2, 'old: two saved lines');
select ok((select o -> 'lines' -> 0 -> 'list_rappen' = 'null'::jsonb and o -> 'lines' -> 0 -> 'origin' = 'null'::jsonb
                   and o -> 'lines' -> 0 -> 'discount_rappen' = 'null'::jsonb from flr), 'old: the new fields are null');
select is((select (o -> 'lines' -> 0 ->> 'amount_rappen')::int from flr), 9000, 'old: the Fare amount is as saved');

-- checkout_pay_link_lines ---------------------------------------------------------------
set local role vamos_checkout;
create temporary table flr_pay as select * from public.checkout_pay_link_lines(extensions.digest('flr-pay', 'sha256'));
create temporary table flr_pay_old as select * from public.checkout_pay_link_lines(extensions.digest('flr-pay-old', 'sha256'));
reset role;

select is((select count(*)::int from flr_pay), 6, 'pay link: the six saved lines come back');
select is((select list_rappen::int from flr_pay where code = 'airport_fee'), 1500, 'pay link: airport fee list figure');
select is((select discount_rappen::int from flr_pay where kind = 'coupon'), 5000, 'pay link: voucher discount');
select is((select origin || ' > ' || destination from flr_pay where code = 'fixed_route'), 'Zürich > Genève',
  'pay link: the route line names both towns');
select is((select count(*)::int from flr_pay where origin is not null), 1, 'pay link: only the route line carries names');
select is((select sum(amount_rappen)::int from flr_pay), 4400, 'pay link: saved amounts still sum to the total');
select is((select count(*)::int from flr_pay_old where list_rappen is null and discount_rappen is null and origin is null), 2,
  'pay link, old shape: new columns null on both lines');

select * from finish();
rollback;
