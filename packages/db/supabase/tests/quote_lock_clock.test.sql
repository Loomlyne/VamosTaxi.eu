-- quote_lock_clock.test.sql
--
-- QUOTE-04 proof: after D-42 moved the snapshot INSERT into the booking transaction,
-- expires_at alone could never fail a held, expired token (the payment window is written on
-- the same insert). quote_lock_expires_at is the second clock the charge gate reads, so a
-- past lock refuses a payment even when the payment window is still open — with no Worker and
-- no browser in the picture.
--
-- D-46: synthetic unit-free integers only; no CHF figure. Rolled back at end.
begin;
select plan(11);

-- Fixtures --------------------------------------------------------------------------------
insert into public.vehicle_classes (slug, passenger_capacity, luggage_capacity)
values ('first', 3, 3);

insert into public.rate_versions (slug, label) values ('qlc-rv', 'Quote lock clock fixture');

insert into public.distance_rates (rate_version_id, vehicle_class_id, max_pax, base_fare_rappen, per_km_rappen, min_fare_rappen)
select rv.id, vc.id, 3, 1, 2, 3
  from public.rate_versions rv, public.vehicle_classes vc
 where rv.slug = 'qlc-rv' and vc.slug = 'first';

insert into public.surcharges (rate_version_id, code, kind, percent, predicate)
select rv.id, 'night', 'percent', 10.00, '{"kind":"always"}'::jsonb
  from public.rate_versions rv where rv.slug = 'qlc-rv';

insert into public.settings_versions (slug, label)
values ('qlc-policy', 'Quote lock clock policy fixture');

insert into public.customers (full_name, email)
values ('QLC Customer', 'qlc@example.test');

insert into public.bookings (contact_name, contact_email, customer_id)
select 'QLC Booking', 'qlc-booking@example.test', c.id
  from public.customers c where c.email = 'qlc@example.test';

insert into public.booking_legs (booking_id, leg_seq, direction, pickup_text, dropoff_text,
                                  scheduled_at, scheduled_local, vehicle_class_id)
select b.id, 1, 'outbound', 'ZRH', 'Zurich HB', now() + interval '3 days',
       to_char(now() + interval '3 days', 'YYYY-MM-DD"T"HH24:MI'), vc.id
  from public.bookings b, public.vehicle_classes vc
 where b.contact_email = 'qlc-booking@example.test' and vc.slug = 'first';

update public.rate_versions set status = 'live' where slug = 'qlc-rv';

create temporary table fx as
select vc.id as vehicle_class_id, rv.id as rate_version_id, sv.id as settings_version_id,
       b.id as booking_id
  from public.vehicle_classes vc, public.rate_versions rv, public.settings_versions sv,
       public.bookings b
 where vc.slug = 'first' and rv.slug = 'qlc-rv' and sv.slug = 'qlc-policy'
   and b.contact_email = 'qlc-booking@example.test';
-- Temp tables default to owner-only; D-50 role switches need to read fx.
grant select on fx to public;

-- Eight-key policy (plan 04-05 extended CHECK) + one priced line summing to total 6.
create temporary table pol as
select jsonb_build_object(
         'cancellation_tiers', '[]'::jsonb,
         'free_cancel_hours', 24,
         'airport_waiting_minutes', 60,
         'city_waiting_minutes', 15,
         'settings_version_id', 1,
         'modification_deadline_hours', 24,
         'min_advance_minutes', 180,
         'policy_doc', 'qlc'
       ) as policy,
       jsonb_build_array(jsonb_build_object(
         'seq', 1,
         'code', 'distance_fare',
         'kind', 'fare',
         'i18n_key', 'price.line.distance',
         'amount_rappen', 6
       )) as lines;

-- S-lock-past: lock expired, payment window still open — the case this plan exists for.
insert into public.price_snapshots (
  quote_id, vehicle_class_id, rate_version_id, rate_version_is_live, settings_version_id,
  engine_version, pax, bags, lines, policy, booking_id,
  subtotal_rappen, surcharges_rappen, discount_rappen, total_rappen,
  expires_at, quote_lock_expires_at
)
select gen_random_uuid(), fx.vehicle_class_id, fx.rate_version_id, true, fx.settings_version_id,
       'quote-engine@qlc-past', 1, 0, pol.lines, pol.policy, fx.booking_id,
       6, 0, 0, 6,
       now() + interval '30 minutes',
       now() - interval '1 second'
  from fx, pol;

update public.bookings set price_snapshot_id =
  (select id from public.price_snapshots where engine_version = 'quote-engine@qlc-past')
  where id = (select booking_id from fx);

-- (1) Past lock + future payment window → restrict_violation ----------------------------
select throws_ok(
  $$ insert into public.booking_payments (booking_id, snapshot_id, stripe_payment_intent_id, charged_rappen, status)
     select fx.booking_id, ps.id, 'pi_qlc_past', 6, 'requires_payment'
       from fx, public.price_snapshots ps where ps.engine_version = 'quote-engine@qlc-past' $$,
  '23001',
  null,
  '(1) past quote_lock_expires_at with future expires_at raises restrict_violation'
);

-- S-lock-future: both clocks open.
insert into public.price_snapshots (
  quote_id, vehicle_class_id, rate_version_id, rate_version_is_live, settings_version_id,
  engine_version, pax, bags, lines, policy, booking_id,
  subtotal_rappen, surcharges_rappen, discount_rappen, total_rappen,
  expires_at, quote_lock_expires_at
)
select gen_random_uuid(), fx.vehicle_class_id, fx.rate_version_id, true, fx.settings_version_id,
       'quote-engine@qlc-future', 1, 0, pol.lines, pol.policy, fx.booking_id,
       6, 0, 0, 6,
       now() + interval '30 minutes',
       now() + interval '30 minutes'
  from fx, pol;

update public.bookings set price_snapshot_id =
  (select id from public.price_snapshots where engine_version = 'quote-engine@qlc-future')
  where id = (select booking_id from fx);

-- (2) Future lock inserts successfully ---------------------------------------------------
select lives_ok(
  $$ insert into public.booking_payments (booking_id, snapshot_id, stripe_payment_intent_id, charged_rappen, status)
     select fx.booking_id, ps.id, 'pi_qlc_future', 6, 'requires_payment'
       from fx, public.price_snapshots ps where ps.engine_version = 'quote-engine@qlc-future' $$,
  '(2) future quote_lock_expires_at payment inserts successfully'
);

-- (3) Column is NOT NULL -----------------------------------------------------------------
select col_not_null(
  'public', 'price_snapshots', 'quote_lock_expires_at',
  '(3) price_snapshots.quote_lock_expires_at is NOT NULL'
);

-- (4) Lock clock cannot be extended (tg_append_only) -------------------------------------
select throws_ok(
  $$ update public.price_snapshots
        set quote_lock_expires_at = now() + interval '1 hour'
      where engine_version = 'quote-engine@qlc-future' $$,
  '23001',
  null,
  '(4) UPDATE quote_lock_expires_at raises restrict_violation (append-only)'
);

-- (5) PUBLIC holds no EXECUTE after create or replace ------------------------------------
select function_privs_are(
  'public', 'tg_payment_matches_snapshot', '{}'::text[],
  'public', '{}'::text[],
  '(5) PUBLIC holds no EXECUTE on tg_payment_matches_snapshot'
);

-- (6) D-32: prosecdef asserted from the catalog ------------------------------------------
select is(
  (select p.prosecdef
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'tg_payment_matches_snapshot'),
  true,
  '(6) tg_payment_matches_snapshot is security definer (prosecdef)'
);

-- (7)/(8) D-50: same 23001 under authenticated and vamos_guest ---------------------------
-- Temporary grants so the INSERT reaches the trigger (roles hold no booking_payments INSERT
-- in production; the gate must not depend on who is calling once the write is allowed).
grant insert on public.booking_payments to authenticated, vamos_guest;
grant select on public.price_snapshots to authenticated, vamos_guest;
create policy qlc_d50_insert on public.booking_payments
  as permissive for insert to authenticated, vamos_guest
  with check (true);
-- SELECT policies so the INSERT's FROM price_snapshots resolves under RLS.
create policy qlc_d50_snap_select on public.price_snapshots
  as permissive for select to authenticated, vamos_guest
  using (true);

set local role authenticated;
select throws_ok(
  $$ insert into public.booking_payments (booking_id, snapshot_id, stripe_payment_intent_id, charged_rappen, status)
     select fx.booking_id, ps.id, 'pi_qlc_auth', 6, 'requires_payment'
       from fx, public.price_snapshots ps where ps.engine_version = 'quote-engine@qlc-past' $$,
  '23001',
  null,
  '(7) D-50: past lock raises 23001 under authenticated'
);
reset role;

set local role vamos_guest;
select throws_ok(
  $$ insert into public.booking_payments (booking_id, snapshot_id, stripe_payment_intent_id, charged_rappen, status)
     select fx.booking_id, ps.id, 'pi_qlc_guest', 6, 'requires_payment'
       from fx, public.price_snapshots ps where ps.engine_version = 'quote-engine@qlc-past' $$,
  '23001',
  null,
  '(8) D-50: past lock raises 23001 under vamos_guest'
);
reset role;

-- (9)/(10) D-26: retired → flag true; draft → flag false ---------------------------------
-- Only one live version at a time (rate_versions_one_live). Retire the fixture live first.
update public.rate_versions set status = 'retired' where slug = 'qlc-rv';

insert into public.rate_versions (slug, label, status)
values ('qlc-retired', 'Retired fixture', 'draft');

insert into public.distance_rates (rate_version_id, vehicle_class_id, max_pax, base_fare_rappen, per_km_rappen, min_fare_rappen)
select rv.id, vc.id, 3, 1, 2, 3
  from public.rate_versions rv, public.vehicle_classes vc
 where rv.slug = 'qlc-retired' and vc.slug = 'first';

insert into public.surcharges (rate_version_id, code, kind, percent, predicate)
select rv.id, 'night', 'percent', 10.00, '{"kind":"always"}'::jsonb
  from public.rate_versions rv where rv.slug = 'qlc-retired';

update public.rate_versions set status = 'live' where slug = 'qlc-retired';
update public.rate_versions set status = 'retired' where slug = 'qlc-retired';

insert into public.price_snapshots (
  quote_id, vehicle_class_id, rate_version_id, rate_version_is_live, settings_version_id,
  engine_version, pax, bags, lines, policy,
  expires_at, quote_lock_expires_at
)
select gen_random_uuid(), fx.vehicle_class_id, rv.id, false, fx.settings_version_id,
       'quote-engine@qlc-retired', 1, 0, '[]'::jsonb, pol.policy,
       now() + interval '30 minutes', now() + interval '30 minutes'
  from fx, pol, public.rate_versions rv where rv.slug = 'qlc-retired';

select is(
  (select rate_version_is_live from public.price_snapshots where engine_version = 'quote-engine@qlc-retired'),
  true,
  '(9) D-26: snapshot against retired version records rate_version_is_live = true'
);

insert into public.rate_versions (slug, label) values ('qlc-draft', 'Draft fixture');

insert into public.price_snapshots (
  quote_id, vehicle_class_id, rate_version_id, rate_version_is_live, settings_version_id,
  engine_version, pax, bags, lines, policy,
  expires_at, quote_lock_expires_at
)
select gen_random_uuid(), fx.vehicle_class_id, rv.id, true, fx.settings_version_id,
       'quote-engine@qlc-draft', 1, 0, '[]'::jsonb, pol.policy,
       now() + interval '30 minutes', now() + interval '30 minutes'
  from fx, pol, public.rate_versions rv where rv.slug = 'qlc-draft';

select is(
  (select rate_version_is_live from public.price_snapshots where engine_version = 'quote-engine@qlc-draft'),
  false,
  '(10) D-26: snapshot against draft version records rate_version_is_live = false'
);

-- (11) shown_alternatives column present (board shape landed with the clock) -------------
select has_column(
  'public', 'price_snapshots', 'shown_alternatives',
  '(11) price_snapshots.shown_alternatives exists'
);

select * from finish();
rollback;
