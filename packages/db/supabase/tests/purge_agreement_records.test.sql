-- purge_agreement_records.test.sql
--
-- 20261007300000. An eligible unpaid booking that has account choice records (every checkout PAY
-- since 26.5 writes one) can be purged again, by the customer path (superseded, vamos_checkout) and by
-- the hourly sweep (unpaid_expired, vamos_system). The records survive with booking_id NULL and every
-- other column unchanged. Still refused: an UPDATE of any other column, a detach together with another
-- column, re-pointing to another booking, a DELETE, a TRUNCATE, a detach outside the purge (flag off),
-- the purge of a non-eligible booking, and a booking delete that skips the detach (the ON DELETE SET
-- NULL cascade arrives after the booking is gone and is refused). Synthetic rows, rolled back.
begin;
select plan(25);

insert into public.vehicle_classes (slug, passenger_capacity, luggage_capacity)
values ('par-first', 3, 3);

insert into public.rate_versions (slug, label)
values ('par-rv', 'Purge agreement fixture');

insert into public.distance_rates (
  rate_version_id, vehicle_class_id, max_pax, base_fare_rappen, per_km_rappen, min_fare_rappen
)
select rv.id, vc.id, 3, 1, 2, 3
  from public.rate_versions rv, public.vehicle_classes vc
 where rv.slug = 'par-rv'
   and vc.slug = 'par-first';

update public.rate_versions set status = 'live' where slug = 'par-rv';
update public.settings set guest_accounts_live = true where id = 1;

create temporary table par_fx as
select
  vc.id as vehicle_class_id,
  rv.id as rate_version_id,
  sv.id as settings_version_id,
  now() + interval '45 minutes' as lock_exp,
  now() + interval '30 days' as token_expires_at
from public.vehicle_classes vc
join public.rate_versions rv on rv.slug = 'par-rv'
join public.settings_versions sv on sv.slug = 'launch-baseline'
where vc.slug = 'par-first';
grant select on par_fx to public;

create function pg_temp.par_snapshot()
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'vehicle_class_id', fx.vehicle_class_id,
    'rate_version_id', fx.rate_version_id,
    'settings_version_id', fx.settings_version_id,
    'engine_version', 'quote-engine@purge-agreement',
    'lock_exp', fx.lock_exp,
    'pax', 1,
    'bags', 0,
    'lines', jsonb_build_array(jsonb_build_object(
      'seq', 1, 'code', 'distance_fare', 'kind', 'fare',
      'i18n_key', 'price.line.distance', 'amount_rappen', 6
    )),
    'policy', jsonb_build_object(
      'cancellation_tiers', '[]'::jsonb,
      'free_cancel_hours', 24,
      'airport_waiting_minutes', 60,
      'city_waiting_minutes', 15,
      'settings_version_id', fx.settings_version_id,
      'modification_deadline_hours', 24,
      'min_advance_minutes', 180,
      'policy_doc', 'purge-agreement'
    ),
    'shown_alternatives', '[]'::jsonb,
    'display_currency', 'CHF',
    'source', 'web',
    'subtotal_rappen', 6,
    'surcharges_rappen', 0,
    'discount_rappen', 0,
    'total_rappen', 6,
    'distance_km', 12.5,
    'duration_min', 25
  )
  from par_fx fx
$$;
grant execute on function pg_temp.par_snapshot() to public;

create function pg_temp.par_legs(p_scheduled_at timestamptz)
returns jsonb
language sql
stable
as $$
  select jsonb_build_array(jsonb_build_object(
    'leg_seq', 1,
    'direction', 'outbound',
    'pickup_text', 'ZRH Airport',
    'pickup_place_id', null,
    'pickup_lat', 47.458056,
    'pickup_lng', 8.549167,
    'dropoff_text', 'Zurich HB',
    'dropoff_place_id', null,
    'dropoff_lat', 47.378177,
    'dropoff_lng', 8.540192,
    'scheduled_at', p_scheduled_at::text,
    'scheduled_local', to_char(p_scheduled_at, 'YYYY-MM-DD"T"HH24:MI'),
    'flight_no', null,
    'vehicle_class_id', fx.vehicle_class_id,
    'pax', 1,
    'bags', 0,
    'estimated_duration_minutes', 25,
    'duration_min', 25,
    'distance_km', 12.5,
    'leg_subtotal_rappen', 6,
    'booking_leg_id', null
  ))
  from par_fx fx
$$;
grant execute on function pg_temp.par_legs(timestamptz) to public;

create function pg_temp.par_book(p_quote_id uuid, p_key text, p_cs text, p_hash bytea, p_email text)
returns table (booking_id uuid, reference text, snapshot_id bigint, payment_id bigint, replayed boolean)
language sql
volatile
as $$
  select *
    from public.checkout_create_booking(
      p_quote_id => p_quote_id,
      p_idempotency_key => p_key,
      p_contact => jsonb_build_object(
        'contact_name', 'Purge Agreement Guest',
        'contact_email', p_email,
        'contact_phone', '+417****7082'
      ),
      p_locale => 'en',
      p_display_currency => 'CHF',
      p_snapshot => pg_temp.par_snapshot(),
      p_legs => pg_temp.par_legs(now() + interval '3 days'),
      p_coupon_id => null,
      p_coupon_code => null,
      p_manage_token_hash => p_hash,
      p_manage_token_expires_at => (select token_expires_at from par_fx),
      p_stripe_payment_intent_id => p_cs,
      p_stripe_checkout_session_id => p_cs,
      p_charged_rappen => 6,
      p_actor_customer_id => null
    )
$$;
grant execute on function pg_temp.par_book(uuid, text, text, bytea, text) to public;

-- A booking delete that skips the agreement detach: every other step of the purge, in its order.
create function pg_temp.par_delete_without_detach(p_booking_id uuid)
returns void
language plpgsql
as $$
begin
  perform set_config('vamos.purge_unpaid', 'on', true);
  update public.bookings set price_snapshot_id = null where id = p_booking_id;
  update public.consent_log set booking_id = null where booking_id = p_booking_id;
  delete from public.coupon_redemptions where booking_id = p_booking_id;
  delete from public.booking_events where booking_id = p_booking_id;
  delete from public.booking_payments where booking_id = p_booking_id;
  delete from public.price_snapshot_legs
   where snapshot_id in (select s.id from public.price_snapshots s where s.booking_id = p_booking_id);
  delete from public.price_snapshots where booking_id = p_booking_id;
  delete from public.booking_access_tokens where booking_id = p_booking_id;
  delete from public.booking_legs where booking_id = p_booking_id;
  delete from public.bookings where id = p_booking_id;
end
$$;

-- Bookings and their records, written the way the Worker writes them (vamos_checkout) ------------
set local role vamos_checkout;
create temporary table par_sup as select * from pg_temp.par_book('41000000-0000-4000-8000-000000000001'::uuid,'par-sup','cs_par_sup',decode(repeat('c1',32),'hex'),'par-sup@example.test');
create temporary table par_exp as select * from pg_temp.par_book('41000000-0000-4000-8000-000000000002'::uuid,'par-exp','cs_par_exp',decode(repeat('c2',32),'hex'),'par-exp@example.test');
create temporary table par_open as select * from pg_temp.par_book('41000000-0000-4000-8000-000000000003'::uuid,'par-open','cs_par_open',decode(repeat('c3',32),'hex'),'par-open@example.test');
create temporary table par_other as select * from pg_temp.par_book('41000000-0000-4000-8000-000000000004'::uuid,'par-other','cs_par_other',decode(repeat('c4',32),'hex'),'par-other@example.test');
create temporary table par_paid as select * from pg_temp.par_book('41000000-0000-4000-8000-000000000005'::uuid,'par-paid','cs_par_paid',decode(repeat('c5',32),'hex'),'par-paid@example.test');
-- Two PAY presses on the superseded booking: two records (guest, then create).
select public.record_account_agreement('checkout', (select booking_id from par_sup), null, 'guest', 'par-v1', 'en', 'pgtap', '203.0.113.0');
select public.record_account_agreement('checkout', (select booking_id from par_sup), null, 'create', 'par-v1', 'de', 'pgtap', null);
select public.record_account_agreement('checkout', (select booking_id from par_exp), null, 'guest', 'par-v1', 'fr', null, null);
select public.record_account_agreement('checkout', (select booking_id from par_open), null, 'guest', 'par-v1', 'ar', null, null);
select public.record_account_agreement('checkout', (select booking_id from par_other), null, 'create', 'par-v1', 'en', null, null);
select public.record_account_agreement('checkout', (select booking_id from par_paid), null, 'guest', 'par-v1', 'en', null, null);
-- Granted by their owner, so the vamos_system call below can read the ids.
grant select on par_sup, par_exp, par_open, par_other, par_paid to public;
reset role;

-- The paid booking is not eligible (replica role skips the payment guard trigger).
set local session_replication_role = replica;
update public.booking_payments set status = 'succeeded', captured_at = now()
 where booking_id = (select booking_id from par_paid);
set local session_replication_role = origin;

create temporary table par_before as
select r.id, r.booking_id, to_jsonb(r) - 'booking_id' as rest
  from public.account_agreement_records r
 where r.booking_id in (select booking_id from par_sup union all select booking_id from par_exp
                        union all select booking_id from par_open union all select booking_id from par_paid);

select is((select count(*)::int from par_before), 5, 'fixture: five records on four bookings');
select ok(app.purge_eligible((select booking_id from par_sup)) and app.purge_eligible((select booking_id from par_exp))
          and app.purge_eligible((select booking_id from par_open)) and not app.purge_eligible((select booking_id from par_paid)),
  'fixture: three eligible bookings, the paid one is not');

-- Customer path: Pay -> back -> change -> Pay purges the first booking (superseded, vamos_checkout) ----
set local role vamos_checkout;
select is(public.purge_unpaid_booking((select booking_id from par_sup), 'superseded'), true,
  'superseded: a booking with two account records is purged (was 23001)');
reset role;
select is((select count(*)::int from public.bookings where id = (select booking_id from par_sup)), 0,
  'superseded: booking row gone');
select is((select count(*)::int from public.account_agreement_records r join par_before b on b.id = r.id
            where b.booking_id = (select booking_id from par_sup) and r.booking_id is null), 2,
  'superseded: both records kept, booking_id NULL');
select is((select count(*)::int from public.account_agreement_records r join par_before b on b.id = r.id
            where b.booking_id = (select booking_id from par_sup) and to_jsonb(r) - 'booking_id' = b.rest), 2,
  'superseded: every other column of both records unchanged');
select is((select before_value ->> 'reason' from public.audit_log
            where table_name = 'bookings' and action = 'delete' and record_id = (select booking_id::text from par_sup)), 'superseded',
  'superseded: one audit line with the reason');

-- Hourly sweep: unpaid_expired, vamos_system --------------------------------------------------------
set local role vamos_system;
select is(public.purge_unpaid_booking((select booking_id from par_exp), 'unpaid_expired'), true,
  'sweep: an expired unpaid booking with a record is purged (was 23001)');
reset role;
select is((select count(*)::int from public.bookings where id = (select booking_id from par_exp)), 0,
  'sweep: booking row gone');
select is((select count(*)::int from public.account_agreement_records r join par_before b on b.id = r.id
            where b.booking_id = (select booking_id from par_exp) and r.booking_id is null and to_jsonb(r) - 'booking_id' = b.rest), 1,
  'sweep: record kept, only booking_id NULL');

-- A non-eligible booking: refused, its record untouched ---------------------------------------------
set local role vamos_system;
select is(public.purge_unpaid_booking((select booking_id from par_paid), 'unpaid_expired'), false,
  'paid: purge refused');
reset role;
select is((select r.booking_id from public.account_agreement_records r join par_before b on b.id = r.id
            where b.booking_id = (select booking_id from par_paid)), (select booking_id from par_paid),
  'paid: its record still points at the booking');

-- Carve-out stays closed for everything but the detach ----------------------------------------------
-- The test runs as the owner of purge_unpaid_booking, so with the flag on it stands where the purge stands.
select set_config('vamos.purge_unpaid', 'on', true);
select throws_ok(format($$ update public.account_agreement_records set email = 'x@example.test' where booking_id = %L $$, (select booking_id from par_open)),
  '23001', null, 'closed: flag on, eligible booking, another column cannot change');
select throws_ok(format($$ update public.account_agreement_records set booking_id = null, locale = 'en' where booking_id = %L $$, (select booking_id from par_open)),
  '23001', null, 'closed: flag on, a detach that also changes another column is refused');
select throws_ok(format($$ update public.account_agreement_records set booking_id = %L where booking_id = %L $$, (select booking_id from par_other), (select booking_id from par_open)),
  '23001', null, 'closed: flag on, a record cannot be moved to another booking');
select throws_ok(format($$ delete from public.account_agreement_records where booking_id = %L $$, (select booking_id from par_open)),
  '23001', null, 'closed: flag on, eligible booking, a record cannot be deleted');
select throws_ok($$ truncate public.account_agreement_records $$,
  '23001', null, 'closed: flag on, truncate refused');
select throws_ok(format($$ update public.account_agreement_records set booking_id = null where booking_id = %L $$, (select booking_id from par_paid)),
  '23001', null, 'closed: flag on, the record of a non-eligible booking cannot be detached');
select throws_ok(format($$ select pg_temp.par_delete_without_detach(%L) $$, (select booking_id from par_open)),
  '23001', null, 'closed: a booking delete that skips the detach is refused by the SET NULL cascade');
select is((select r.booking_id from public.account_agreement_records r join par_before b on b.id = r.id
            where b.booking_id = (select booking_id from par_open)), (select booking_id from par_open),
  'closed: after those refusals the record still points at its booking');
select is((select count(*)::int from public.bookings where id = (select booking_id from par_open)), 1,
  'closed: and the booking is still there');
select set_config('vamos.purge_unpaid', 'off', true);
select throws_ok(format($$ update public.account_agreement_records set booking_id = null where booking_id = %L $$, (select booking_id from par_open)),
  '23001', null, 'closed: flag off (outside the purge), even an eligible booking''s record cannot be detached');

-- Another carve-out-3 table keeps its rules -----------------------------------------------------
select set_config('vamos.purge_unpaid', 'on', true);
select throws_ok(format($$ delete from public.price_snapshots where booking_id = %L $$, (select booking_id from par_paid)),
  '23001', null, 'price_snapshots: paid booking snapshot delete still refused');
select set_config('vamos.purge_unpaid', 'off', true);

-- The purge itself still works on the remaining eligible booking -------------------------------------
select is(public.purge_unpaid_booking((select booking_id from par_open), 'unpaid_expired'), true,
  'purge: the booking that survived the refusals is purged');
select is((select count(*)::int from public.account_agreement_records r join par_before b on b.id = r.id
            where r.booking_id is null and to_jsonb(r) - 'booking_id' = b.rest), 4,
  'end: four of five records detached with nothing else changed; the paid one is attached');

select * from finish();
rollback;
