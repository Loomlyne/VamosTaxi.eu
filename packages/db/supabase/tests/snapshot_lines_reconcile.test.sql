-- snapshot_lines_reconcile.test.sql
--
-- Proves tg_snapshot_lines_reconcile (D-07 / QUOTE-05): every refusal path the BEFORE INSERT
-- trigger names, plus lives_ok for a well-formed priced snapshot and a well-formed fully-
-- unpriced snapshot (launch state — all amounts null, total_rappen null).
--
-- D-46: synthetic unit-free integers only; no CHF figure. Rolled back at end.
begin;
select plan(8);

insert into public.vehicle_classes (slug, passenger_capacity, luggage_capacity)
values ('first', 3, 3);

insert into public.rate_versions (slug, label) values ('slr-rv', 'Lines reconcile fixture');

insert into public.settings_versions (slug, label)
values ('slr-policy', 'Lines reconcile policy fixture');

create temporary table fx as
select vc.id as vehicle_class_id, rv.id as rate_version_id, sv.id as settings_version_id
  from public.vehicle_classes vc, public.rate_versions rv, public.settings_versions sv
 where vc.slug = 'first' and rv.slug = 'slr-rv' and sv.slug = 'slr-policy';

create temporary table pol as
select jsonb_build_object(
         'cancellation_tiers', '[]'::jsonb,
         'free_cancel_hours', 24,
         'airport_waiting_minutes', 60,
         'city_waiting_minutes', 15,
         'settings_version_id', 1,
         'modification_deadline_hours', 24,
         'min_advance_minutes', 180,
         'policy_doc', 'slr'
       ) as policy;

-- (1) Missing i18n_key -------------------------------------------------------------------
select throws_ok(
  $$ insert into public.price_snapshots (
       quote_id, vehicle_class_id, rate_version_id, rate_version_is_live, settings_version_id,
       engine_version, pax, bags, lines, policy,
       subtotal_rappen, surcharges_rappen, discount_rappen, total_rappen,
       expires_at, quote_lock_expires_at
     )
     select gen_random_uuid(), fx.vehicle_class_id, fx.rate_version_id, false, fx.settings_version_id,
            'quote-engine@slr-missing-i18n', 1, 0,
            jsonb_build_array(jsonb_build_object(
              'seq', 1, 'code', 'distance_fare', 'kind', 'fare', 'amount_rappen', 6
            )),
            pol.policy, 6, 0, 0, 6,
            now() + interval '30 minutes', now() + interval '30 minutes'
       from fx, pol $$,
  '23001',
  null,
  '(1) line missing i18n_key raises restrict_violation'
);

-- (2) Non-integer amount_rappen ----------------------------------------------------------
select throws_ok(
  $$ insert into public.price_snapshots (
       quote_id, vehicle_class_id, rate_version_id, rate_version_is_live, settings_version_id,
       engine_version, pax, bags, lines, policy,
       subtotal_rappen, surcharges_rappen, discount_rappen, total_rappen,
       expires_at, quote_lock_expires_at
     )
     select gen_random_uuid(), fx.vehicle_class_id, fx.rate_version_id, false, fx.settings_version_id,
            'quote-engine@slr-nonint', 1, 0,
            jsonb_build_array(jsonb_build_object(
              'seq', 1, 'code', 'distance_fare', 'kind', 'fare',
              'i18n_key', 'price.line.distance', 'amount_rappen', 6.5
            )),
            pol.policy, 6, 0, 0, 6,
            now() + interval '30 minutes', now() + interval '30 minutes'
       from fx, pol $$,
  '23001',
  null,
  '(2) non-integer amount_rappen raises restrict_violation'
);

-- (3) total_rappen off by one from lines sum ---------------------------------------------
select throws_ok(
  $$ insert into public.price_snapshots (
       quote_id, vehicle_class_id, rate_version_id, rate_version_is_live, settings_version_id,
       engine_version, pax, bags, lines, policy,
       subtotal_rappen, surcharges_rappen, discount_rappen, total_rappen,
       expires_at, quote_lock_expires_at
     )
     select gen_random_uuid(), fx.vehicle_class_id, fx.rate_version_id, false, fx.settings_version_id,
            'quote-engine@slr-offbyone', 1, 0,
            jsonb_build_array(jsonb_build_object(
              'seq', 1, 'code', 'distance_fare', 'kind', 'fare',
              'i18n_key', 'price.line.distance', 'amount_rappen', 6
            )),
            pol.policy, 7, 0, 0, 7,
            now() + interval '30 minutes', now() + interval '30 minutes'
       from fx, pol $$,
  '23001',
  null,
  '(3) total_rappen off by one from lines sum raises restrict_violation'
);

-- (4) total_rappen null with a priced line -----------------------------------------------
select throws_ok(
  $$ insert into public.price_snapshots (
       quote_id, vehicle_class_id, rate_version_id, rate_version_is_live, settings_version_id,
       engine_version, pax, bags, lines, policy,
       expires_at, quote_lock_expires_at
     )
     select gen_random_uuid(), fx.vehicle_class_id, fx.rate_version_id, false, fx.settings_version_id,
            'quote-engine@slr-mixed', 1, 0,
            jsonb_build_array(jsonb_build_object(
              'seq', 1, 'code', 'distance_fare', 'kind', 'fare',
              'i18n_key', 'price.line.distance', 'amount_rappen', 6
            )),
            pol.policy,
            now() + interval '30 minutes', now() + interval '30 minutes'
       from fx, pol $$,
  '23001',
  null,
  '(4) unpriced total with a priced line raises restrict_violation'
);

-- (5) Well-formed priced snapshot --------------------------------------------------------
select lives_ok(
  $$ insert into public.price_snapshots (
       quote_id, vehicle_class_id, rate_version_id, rate_version_is_live, settings_version_id,
       engine_version, pax, bags, lines, policy,
       subtotal_rappen, surcharges_rappen, discount_rappen, total_rappen,
       expires_at, quote_lock_expires_at
     )
     select gen_random_uuid(), fx.vehicle_class_id, fx.rate_version_id, false, fx.settings_version_id,
            'quote-engine@slr-priced', 1, 0,
            jsonb_build_array(jsonb_build_object(
              'seq', 1, 'code', 'distance_fare', 'kind', 'fare',
              'i18n_key', 'price.line.distance', 'amount_rappen', 6
            )),
            pol.policy, 6, 0, 0, 6,
            now() + interval '30 minutes', now() + interval '30 minutes'
       from fx, pol $$,
  '(5) well-formed priced snapshot inserts'
);

-- (6) Well-formed fully-unpriced snapshot (launch state) ---------------------------------
select lives_ok(
  $$ insert into public.price_snapshots (
       quote_id, vehicle_class_id, rate_version_id, rate_version_is_live, settings_version_id,
       engine_version, pax, bags, lines, policy,
       expires_at, quote_lock_expires_at
     )
     select gen_random_uuid(), fx.vehicle_class_id, fx.rate_version_id, false, fx.settings_version_id,
            'quote-engine@slr-unpriced', 1, 0, '[]'::jsonb, pol.policy,
            now() + interval '30 minutes', now() + interval '30 minutes'
       from fx, pol $$,
  '(6) well-formed fully-unpriced snapshot inserts (launch state)'
);

-- (7) 261003: the fare saved as three fare lines (distance_fare, airport_fee, fixed_route) -
select lives_ok(
  $$ insert into public.price_snapshots (
       quote_id, vehicle_class_id, rate_version_id, rate_version_is_live, settings_version_id,
       engine_version, pax, bags, lines, policy,
       subtotal_rappen, surcharges_rappen, discount_rappen, total_rappen,
       expires_at, quote_lock_expires_at
     )
     select gen_random_uuid(), fx.vehicle_class_id, fx.rate_version_id, false, fx.settings_version_id,
            'quote-engine@slr-three-fare', 1, 0,
            jsonb_build_array(
              jsonb_build_object('seq', 1, 'code', 'distance_fare', 'kind', 'fare',
                'i18n_key', 'price.line.transfer', 'amount_rappen', 4),
              jsonb_build_object('seq', 2, 'code', 'airport_fee', 'kind', 'fare',
                'i18n_key', 'price.line.airport_fee', 'amount_rappen', 3),
              jsonb_build_object('seq', 3, 'code', 'fixed_route', 'kind', 'fare',
                'i18n_key', 'price.line.fixed_route', 'amount_rappen', 2,
                'params', jsonb_build_object('origin', 'A', 'destination', 'B')),
              jsonb_build_object('seq', 4, 'code', 'vat', 'kind', 'vat',
                'i18n_key', 'price.line.vat', 'amount_rappen', 1)
            ),
            pol.policy, 10, 0, 0, 10,
            now() + interval '30 minutes', now() + interval '30 minutes'
       from fx, pol $$,
  '(7) three fare lines (fare, airport fee, route) plus VAT insert when they sum to the total'
);

-- (8) 261003: the same with a voucher folded into the pieces (coupon line amount null) ----
select lives_ok(
  $$ insert into public.price_snapshots (
       quote_id, vehicle_class_id, rate_version_id, rate_version_is_live, settings_version_id,
       engine_version, pax, bags, lines, policy,
       subtotal_rappen, surcharges_rappen, discount_rappen, total_rappen,
       expires_at, quote_lock_expires_at
     )
     select gen_random_uuid(), fx.vehicle_class_id, fx.rate_version_id, false, fx.settings_version_id,
            'quote-engine@slr-three-fare-coupon', 1, 0,
            jsonb_build_array(
              jsonb_build_object('seq', 1, 'code', 'distance_fare', 'kind', 'fare',
                'i18n_key', 'price.line.transfer', 'amount_rappen', 0,
                'params', jsonb_build_object('list_rappen', 4)),
              jsonb_build_object('seq', 2, 'code', 'airport_fee', 'kind', 'fare',
                'i18n_key', 'price.line.airport_fee', 'amount_rappen', 1,
                'params', jsonb_build_object('list_rappen', 3)),
              jsonb_build_object('seq', 3, 'code', 'fixed_route', 'kind', 'fare',
                'i18n_key', 'price.line.fixed_route', 'amount_rappen', 2),
              jsonb_build_object('seq', 4, 'code', 'WELCOME', 'kind', 'coupon',
                'i18n_key', 'price.line.coupon', 'amount_rappen', null,
                'params', jsonb_build_object('discount_rappen', 6)),
              jsonb_build_object('seq', 5, 'code', 'vat', 'kind', 'vat',
                'i18n_key', 'price.line.vat', 'amount_rappen', 1)
            ),
            pol.policy, 4, 0, 0, 4,
            now() + interval '30 minutes', now() + interval '30 minutes'
       from fx, pol $$,
  '(8) three fare lines with a voucher taken off them (coupon amount null) insert when they sum to the total'
);

select * from finish();
rollback;
