-- hold_follows_settings_version.test.sql
--
-- Decision 2026-10-13 item 17 (D1, quick 261015-6om): Publish writes the "Price stays valid for" minutes
-- into both clock columns of a NEW settings_versions row. No SQL changes with it; this file pins why that
-- is safe: quote_lock_deadline and create_quote_snapshot read the quote's OWN settings row, never the
-- newest one, so a Publish cannot move a deadline that is already baked.
--   A  per-row clocks: an older 1440/1440 row still gives 24 hours while a newer 2880/2880 row is current.
--   B  (A1.2) charge gate on a 2880/2880 row: the payment window never ends before the lock, and a matching
--      payment passes tg_payment_matches_snapshot.
--   C  (A1.5) policy_publish_draft carries checkout_window_minutes = quote_lock_minutes forward (2880/2880).
-- Rolled back. Synthetic integer rappen only; no CHF figure.
begin;
select plan(18);

-- Fixtures ------------------------------------------------------------------------------------------
-- Own class and live price book (the pgTAP database carries no live book; the lab seed differs from
-- seed.sql). Same shape as amount_state_verify.test.sql.
update public.rate_versions set status = 'retired' where status = 'live';
insert into public.vehicle_classes (slug, passenger_capacity, luggage_capacity)
values ('hold-17-eco', 3, 3);
insert into public.rate_versions (slug, label) values ('hold-17-rv', 'hold follows settings fixture');
insert into public.distance_rates (rate_version_id, vehicle_class_id, max_pax, base_fare_rappen, per_km_rappen, min_fare_rappen)
select rv.id, vc.id, 3, 1, 2, 3
  from public.rate_versions rv, public.vehicle_classes vc
 where rv.slug = 'hold-17-rv' and vc.slug = 'hold-17-eco';
update public.rate_versions set status = 'live' where slug = 'hold-17-rv';

insert into public.settings_versions
  (slug, label, quote_lock_minutes, checkout_window_minutes, city_waiting_minutes, effective_from)
values
  ('hold-17-old', 'hold 17 old fixture', 1440, 1440, 15, now() - interval '1 hour'),
  ('hold-17-new', 'hold 17 new fixture', 2880, 2880, 15, now());

create temporary table hfx as
select now() + interval '45 minutes' as lock_exp;

-- One snapshot through the real write door, as the owner (20261007180000 G10: no role holds EXECUTE).
create function pg_temp.hold_snap(p_slug text, p_tag text, p_lock timestamptz, p_booking uuid default null)
returns bigint language plpgsql as $$
declare
  v_sv bigint := (select id from public.settings_versions where slug = p_slug);
  v_priced boolean := p_booking is not null;
begin
  return public.create_quote_snapshot(
    p_quote_id => coalesce((select b.quote_id from public.bookings b where b.id = p_booking), gen_random_uuid()),
    p_vehicle_class_id => (select id from public.vehicle_classes where slug = 'hold-17-eco'),
    p_rate_version_id => (select id from public.rate_versions where slug = 'hold-17-rv'),
    p_settings_version_id => v_sv,
    p_engine_version => 'quote-engine@hold-17-' || p_tag,
    p_lock_exp => p_lock,
    p_pax => 1::smallint,
    p_bags => 0::smallint,
    p_lines => case when v_priced
      then '[{"seq":1,"leg_seq":1,"kind":"fare","code":"distance_fare","i18n_key":"price.line.transfer","amount_rappen":9}]'::jsonb
      else '[]'::jsonb end,
    p_policy => jsonb_build_object(
      'cancellation_tiers', '[]'::jsonb, 'free_cancel_hours', 24, 'airport_waiting_minutes', 60,
      'city_waiting_minutes', 15, 'settings_version_id', v_sv, 'modification_deadline_hours', 24,
      'min_advance_minutes', 180, 'policy_doc', 'hold-17'),
    p_shown_alternatives => '[]'::jsonb,
    p_legs => jsonb_build_array(jsonb_build_object(
      'leg_seq', 1, 'distance_km', null, 'duration_min', null, 'leg_subtotal_rappen', null, 'booking_leg_id', null)),
    p_subtotal_rappen => case when v_priced then 9 end::public.rappen,
    p_surcharges_rappen => case when v_priced then 0 end::public.rappen,
    p_discount_rappen => case when v_priced then 0 end::public.rappen,
    p_total_rappen => case when v_priced then 9 end::public.rappen,
    p_booking_id => p_booking
  );
end $$;

create function pg_temp.hold_row(p_tag text) returns public.price_snapshots language sql as $$
  select * from public.price_snapshots where engine_version = 'quote-engine@hold-17-' || p_tag
$$;

-- A. per-row clocks ---------------------------------------------------------------------------------
select is(
  (select slug from public.settings_versions
    where effective_from <= now() order by effective_from desc, id desc limit 1),
  'hold-17-new',
  '(1) fixture: the 2880/2880 row is the newest settings row');

select ok(
  public.quote_lock_deadline((select id from public.settings_versions where slug = 'hold-17-old'))
    between now() + interval '23 hours' and now() + interval '25 hours',
  '(2) quote_lock_deadline(old row) is about 24 hours even though a newer 48-hour row is current');
select ok(
  public.quote_lock_deadline((select id from public.settings_versions where slug = 'hold-17-new'))
    between now() + interval '47 hours' and now() + interval '49 hours',
  '(3) quote_lock_deadline(new row) is about 48 hours');

select lives_ok(
  $$ select pg_temp.hold_snap('hold-17-old', 'old', (select lock_exp from hfx)) $$,
  '(4) create_quote_snapshot with the old settings row lives');
select lives_ok(
  $$ select pg_temp.hold_snap('hold-17-new', 'new', (select lock_exp from hfx)) $$,
  '(5) create_quote_snapshot with the new settings row lives');

select ok(
  (select expires_at from pg_temp.hold_row('old'))
    between now() + interval '23 hours' and now() + interval '25 hours',
  '(6) a snapshot on the old row keeps the old 24-hour payment window');
select ok(
  (select expires_at from pg_temp.hold_row('new'))
    between now() + interval '47 hours' and now() + interval '49 hours',
  '(7) a snapshot on the new row gets the 48-hour payment window');
select is(
  (select quote_lock_expires_at from pg_temp.hold_row('old')),
  (select lock_exp from hfx),
  '(8) old-row snapshot: quote_lock_expires_at is the p_lock_exp passed');
select is(
  (select quote_lock_expires_at from pg_temp.hold_row('new')),
  (select lock_exp from hfx),
  '(9) new-row snapshot: quote_lock_expires_at is the p_lock_exp passed');

-- B. A1.2: the charge gate on a 2880/2880 row ---------------------------------------------------------
insert into public.bookings (contact_name, contact_email, contact_phone, quote_id, status)
values ('Hold 17', 'hold-17@example.test', '+41000000099', gen_random_uuid(), 'pending');

create temporary table hgate as
select public.quote_lock_deadline((select id from public.settings_versions where slug = 'hold-17-new')) as lock_exp,
       (select id from public.bookings where contact_email = 'hold-17@example.test') as booking_id;

select lives_ok(
  $$ select pg_temp.hold_snap('hold-17-new', 'gate', (select lock_exp from hgate), (select booking_id from hgate)) $$,
  '(10) a priced snapshot written right after the 48-hour lock, bound to the booking, lives');
update public.bookings
   set price_snapshot_id = (select id from pg_temp.hold_row('gate')), price_total_rappen = 9
 where id = (select booking_id from hgate);

select is(
  (select is_chargeable from pg_temp.hold_row('gate')),
  true,
  '(11) fixture: the snapshot is chargeable (priced, live book)');
select ok(
  (select expires_at >= quote_lock_expires_at from pg_temp.hold_row('gate')),
  '(12) on a 2880/2880 row the payment window never ends before the quote lock');
select lives_ok(
  $$ insert into public.booking_payments (
       booking_id, snapshot_id, stripe_payment_intent_id, stripe_checkout_session_id,
       charged_rappen, charged_currency, status)
     select h.booking_id, s.id, 'cs_hold17', 'cs_hold17', s.total_rappen, 'CHF', 'requires_payment'
       from hgate h, pg_temp.hold_row('gate') s $$,
  '(13) a matching payment passes tg_payment_matches_snapshot');
select is(
  (select count(*)::int from public.booking_payments where booking_id = (select booking_id from hgate)),
  1,
  '(14) and is recorded once');

-- C. A1.5: policy_publish_draft keeps the two clocks equal ------------------------------------------------
update public.settings_policy_draft set city_waiting_minutes = 45 where id = 1;
select lives_ok(
  $$ select public.policy_publish_draft(null) $$,
  '(15) a changed policy draft publishes on top of the 2880/2880 row');
select alike(
  (select slug from public.settings_versions
    where effective_from <= now() order by effective_from desc, id desc limit 1),
  'policy-publish-%',
  '(16) the newest row is the policy publish');
select is(
  (select quote_lock_minutes from public.settings_versions
    where effective_from <= now() order by effective_from desc, id desc limit 1),
  2880,
  '(17) the policy publish carries quote_lock_minutes 2880 forward');
select is(
  (select checkout_window_minutes from public.settings_versions
    where effective_from <= now() order by effective_from desc, id desc limit 1),
  (select quote_lock_minutes from public.settings_versions
    where effective_from <= now() order by effective_from desc, id desc limit 1),
  '(18) and checkout_window_minutes stays equal to quote_lock_minutes');

select * from finish();
rollback;
