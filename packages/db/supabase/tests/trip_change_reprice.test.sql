-- trip_change_reprice.test.sql
--
-- 26.2 P6 (migration 20261007150000): a place and time change on a PAID trip is re-priced and
-- works. Owner decisions D1-D16 (.planning/decisions/2026-10-01-p6-paid-trip-edit.md).
--   H  grants: the new functions are SECURITY DEFINER, search_path '', EXECUTE vamos_system only.
--   A  booking_staff_trip_change refusals: unpaid, too late, customer request waiting, a time that
--      has passed, nothing to change, a malformed change, a price on a no-price change, no price on
--      a place change, a party the class cannot take, price book not live, paid amount moved.
--   B  dearer place change: the trip keeps its places until paid; the new price record carries the
--      new distance and duration; paid -> text, place id, coordinates and duration are written, the
--      driver stays (D7).
--   C  cheaper place change: written on confirm, "Refund due" with the full difference (D3).
--   D  date or time only: no new price (D1), written on confirm, recorded, driver stays.
--   E  passengers and bags inside the class: no new price (D5), leg and price record carry them.
--   F  more passengers than the class takes + a larger class: one price, the class changes, the
--      driver comes off (P1 D6).
--   G  a new time that clashes with another trip of the assigned driver: the owner must choose. Keep
--      (D11, D17) keeps him on both: this trip is stamped and left out of the overlap rule; an
--      ordinary Assign onto it, or onto any other trip of his, is still refused; a party change keeps
--      the stamp; a second move without Keep asks again; unassign clears it and a reassign is
--      refused again. Take off works.
--   I  an overlap that appears between confirm and payment: the driver comes off, the payment is
--      recorded (the webhook never fails on it).
--   J  a customer's time-change payload keeps the old rule: an overlap is refused (23P01).
--   K  booking_staff_contact_update: name, e-mail, phone, note and flight saved at once and recorded
--      (D6, D8); a flight change names the assigned driver.
--   L  manage_money_for.last_change: 'trip' after a trip change, 'class' after a class-only change.
--   M  booking_change_request_facts: what a paid change changed (for the driver's e-mail).
-- Rolled back. Synthetic integer rappen only, never a product CHF.
begin;
select plan(131);

insert into public.vehicle_classes (slug, passenger_capacity, luggage_capacity)
values ('tcr-eco', 4, 4), ('tcr-biz', 7, 7);

insert into public.rate_versions (slug, label) values ('tcr-rv', 'TCR fixture'), ('tcr-old', 'TCR old');
update public.rate_versions set status = 'retired' where status = 'live';
update public.rate_versions set status = 'live' where slug = 'tcr-rv';

insert into auth.users (id, email, aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('26060001-0000-4000-a000-000000000001', 'tcr-admin@vamostaxi.eu', 'authenticated', 'authenticated',
        '{}'::jsonb, '{}'::jsonb, now(), now());
insert into public.staff (user_id, role, active, accepted_at, full_name)
values ('26060001-0000-4000-a000-000000000001', 'admin', true, now(), 'TCR Admin');

insert into public.chauffeurs (full_name, phone, email, licence_number, languages, vehicle_class_id)
select 'TCR Driver ' || d, '+41 79 260 06 0' || d, 'tcr-driver-' || d || '@vamostaxi.eu', 'LIC-TCR-' || d,
       array['de', 'en'], vc.id
  from unnest(array['a', 'b', 'c', 'd', 'e', 'f']) as d
  cross join lateral (select id from public.vehicle_classes where slug = 'tcr-eco') vc;

create temporary table fx (k text primary key, id uuid not null);

-- One paid booking: one leg with a place id and coordinates, one price record with a fare and a
-- VAT line (distance 31.40 km, 40 min), one captured payment.
create function pg_temp.tcr_mk(p_key text, p_class text, p_offs interval, p_amount int, p_paid boolean default true)
returns uuid language plpgsql as $$
declare
  v_b uuid;
  v_snap bigint;
begin
  insert into public.bookings (reference, contact_name, contact_email, contact_phone, status, locale)
  values (public.next_booking_reference(), 'TCR ' || p_key, 'tcr-' || p_key || '@vamostaxi.eu', '+41 79 000 00 01',
          case when p_paid then 'confirmed' else 'quote' end::public.booking_status, 'de')
  returning id into v_b;

  insert into public.booking_legs (
    booking_id, leg_seq, direction, pickup_text, pickup_place_id, pickup_lat, pickup_lng,
    dropoff_text, dropoff_place_id, dropoff_lat, dropoff_lng,
    scheduled_at, scheduled_local, vehicle_class_id, status, pax, bags, estimated_duration_minutes
  )
  select v_b, 1, 'outbound', 'Zurich Oerlikon', 'mb-oerlikon', 47.411500, 8.544200,
         'Zurich Airport', 'mb-zrh', 47.450400, 8.562400,
         date_trunc('minute', now() + p_offs),
         to_char(date_trunc('minute', now() + p_offs) at time zone 'Europe/Zurich', 'YYYY-MM-DD"T"HH24:MI'), vc.id,
         case when p_paid then 'confirmed' else 'quote' end::public.booking_status, 2, 1, 40
    from public.vehicle_classes vc where vc.slug = p_class;

  if p_paid then
    set local session_replication_role = replica;
    insert into public.price_snapshots (
      quote_id, vehicle_class_id, rate_version_id, rate_version_is_live, settings_version_id,
      engine_version, pax, bags, lines, policy,
      subtotal_rappen, surcharges_rappen, discount_rappen, total_rappen,
      expires_at, quote_lock_expires_at, booking_id, source, distance_km, duration_min, shown_alternatives
    )
    select gen_random_uuid(), vc.id, rv.id, true, sv.id, 'quote-engine@tcr', 2, 1,
           pg_temp.tcr_lines(p_amount),
           jsonb_build_object('cancellation_tiers', '[]'::jsonb, 'free_cancel_hours', 24,
                              'airport_waiting_minutes', 60, 'city_waiting_minutes', 15,
                              'settings_version_id', sv.id, 'modification_deadline_hours', 24,
                              'min_advance_minutes', 180, 'policy_doc', 'test', 'extras', '[]'::jsonb),
           p_amount, 0, 0, p_amount, now() + interval '1 day', now() + interval '1 day', v_b, 'web', 31.4, 40,
           jsonb_build_array(jsonb_build_object('slug', 'tcr-eco', 'total_rappen', 9))
      from public.vehicle_classes vc
      cross join lateral (select id from public.rate_versions where slug = 'tcr-rv') rv
      cross join lateral (select id from public.settings_versions order by id limit 1) sv
     where vc.slug = p_class
    returning id into v_snap;
    update public.bookings set price_snapshot_id = v_snap where id = v_b;
    insert into public.booking_payments (booking_id, snapshot_id, stripe_payment_intent_id, charged_rappen, status, captured_at)
    values (v_b, v_snap, 'pi_tcr_' || p_key, p_amount, 'succeeded', now());
    set local session_replication_role = origin;
  end if;

  insert into pg_temp.fx values (p_key, v_b);
  return v_b;
end $$;

create function pg_temp.tcr_lines(p_total int) returns jsonb language sql as $$
  select jsonb_build_array(
    jsonb_build_object('seq', 1, 'leg_seq', 1, 'code', 'distance_fare', 'kind', 'fare',
                       'i18n_key', 'price.line.transfer', 'params', jsonb_build_object('vehicleClass', 'x'),
                       'amount_rappen', p_total - 1),
    jsonb_build_object('seq', 2, 'leg_seq', 1, 'code', 'vat', 'kind', 'vat',
                       'i18n_key', 'price.line.vat', 'params', jsonb_build_object('vatRateBps', 81),
                       'amount_rappen', 1))
$$;

create function pg_temp.tcr_drive(p_key text, p_driver text) returns void language sql as $$
  update public.booking_legs l
     set assigned_chauffeur_id = c.id, status = 'assigned'
    from public.chauffeurs c
   where c.email = 'tcr-driver-' || p_driver || '@vamostaxi.eu'
     and l.booking_id = (select f.id from pg_temp.fx as f where f.k = p_key);
  update public.bookings set status = 'assigned' where id = (select f.id from pg_temp.fx as f where f.k = p_key);
$$;

create function pg_temp.tcr_driver_id(p_driver text) returns uuid language sql as $$
  select id from public.chauffeurs where email = 'tcr-driver-' || p_driver || '@vamostaxi.eu'
$$;

-- An ordinary Assign, as the dashboard calls it; the overlap check is made at once (the RPC defers
-- it to COMMIT, which a rolled-back test never reaches).
create function pg_temp.tcr_assign(p_key text, p_driver text) returns void language plpgsql as $$
begin
  perform * from public.ops_assign_leg((select f.id from pg_temp.fx as f where f.k = p_key),
                                       pg_temp.tcr_driver_id(p_driver), '26060001-0000-4000-a000-000000000001'::uuid);
  set constraints public.booking_legs_chauffeur_no_overlap immediate;
end $$;

create function pg_temp.tcr_local(p_offs interval) returns text language sql as $$
  select to_char(date_trunc('minute', now() + p_offs) at time zone 'Europe/Zurich', 'YYYY-MM-DD"T"HH24:MI')
$$;

-- A new place from the address search, as the Worker's verified trip facts write it.
create function pg_temp.tcr_zug() returns jsonb language sql as $$
  select jsonb_build_object('pickup_text', 'Zug', 'pickup_place_id', 'mb-zug', 'pickup_lat', 47.1724,
                            'pickup_lng', 8.5174, 'estimated_duration_minutes', 55)
$$;

create function pg_temp.tcr_change(
  p_key text, p_class text, p_trip jsonb, p_total int, p_expected int default null, p_driver text default null,
  p_rv text default 'tcr-rv', p_km numeric default null, p_min int default null
)
returns table (request_id uuid, booking_id uuid, outcome text, difference_rappen int, new_total_rappen int,
               paid_rappen int, quote_snapshot_id bigint, extra_snapshot_id bigint, old_extra_session_id text,
               old_extra_snapshot_id bigint, unassigned_chauffeur_id uuid, kept_chauffeur_id uuid)
language sql as $$
  select * from public.booking_staff_trip_change(
    (select f.id from pg_temp.fx as f where f.k = p_key),
    '26060001-0000-4000-a000-000000000001'::uuid,
    p_class,
    p_trip,
    case when p_total is null then null else (select rv.id from public.rate_versions as rv where rv.slug = p_rv) end,
    p_total,
    case when p_total is null then null else pg_temp.tcr_lines(p_total) end,
    'quote-engine@tcr-test',
    p_km,
    p_min,
    case when p_km is null then null
         else jsonb_build_array(jsonb_build_object('slug', 'tcr-eco', 'total_rappen', p_total - 1)) end,
    p_expected,
    p_driver
  )
$$;

select pg_temp.tcr_mk('same', 'tcr-eco', interval '48 hours', 10);
select pg_temp.tcr_mk('unpaid', 'tcr-eco', interval '48 hours', 10, false);
select pg_temp.tcr_mk('late', 'tcr-eco', interval '-1 hour', 10);
select pg_temp.tcr_mk('waiting', 'tcr-eco', interval '48 hours', 10);
select pg_temp.tcr_mk('dear', 'tcr-eco', interval '48 hours', 10);
select pg_temp.tcr_mk('cheap', 'tcr-biz', interval '48 hours', 10);
select pg_temp.tcr_mk('time', 'tcr-eco', interval '30 hours', 10);
select pg_temp.tcr_mk('party', 'tcr-eco', interval '48 hours', 10);
select pg_temp.tcr_mk('grow', 'tcr-eco', interval '48 hours', 10);
select pg_temp.tcr_mk('busy', 'tcr-eco', interval '200 hours', 10);
select pg_temp.tcr_mk('clash', 'tcr-eco', interval '196 hours', 10);
select pg_temp.tcr_mk('busy2', 'tcr-eco', interval '250 hours', 10);
select pg_temp.tcr_mk('clash2', 'tcr-eco', interval '246 hours', 10);
select pg_temp.tcr_mk('third', 'tcr-eco', interval '500 hours', 10);
select pg_temp.tcr_mk('third3', 'tcr-eco', interval '250 hours', 10);
select pg_temp.tcr_mk('lateov', 'tcr-eco', interval '300 hours', 10);
select pg_temp.tcr_mk('contact', 'tcr-eco', interval '48 hours', 10);
select pg_temp.tcr_mk('classonly', 'tcr-eco', interval '48 hours', 10);

select pg_temp.tcr_drive('dear', 'b');
select pg_temp.tcr_drive('time', 'b');
select pg_temp.tcr_drive('grow', 'e');
select pg_temp.tcr_drive('busy', 'a');
select pg_temp.tcr_drive('clash', 'a');
select pg_temp.tcr_drive('busy2', 'f');
select pg_temp.tcr_drive('clash2', 'f');
select pg_temp.tcr_drive('lateov', 'c');
select pg_temp.tcr_drive('contact', 'd');

-- A customer's own time-change request waits on one booking.
select public.booking_edit_request_upsert(
  (select id from fx where k = 'waiting'), 'customer', null, '{"scheduled_local":"2030-01-01T10:00"}'::jsonb,
  (select price_snapshot_id from public.bookings where id = (select id from fx where k = 'waiting')));

-- ---------------------------------------------------------------------------
-- H. Grants
-- ---------------------------------------------------------------------------
select has_function('public', 'booking_staff_trip_change', 'booking_staff_trip_change exists');
select function_privs_are('public', 'booking_staff_trip_change',
  '{uuid,uuid,text,jsonb,int8,int4,jsonb,text,numeric,int4,jsonb,int4,text}'::text[], 'vamos_system', '{EXECUTE}'::text[],
  'booking_staff_trip_change: vamos_system holds EXECUTE');
select function_privs_are('public', 'booking_staff_trip_change',
  '{uuid,uuid,text,jsonb,int8,int4,jsonb,text,numeric,int4,jsonb,int4,text}'::text[], 'vamos_staff', '{}'::text[],
  'booking_staff_trip_change: vamos_staff holds no EXECUTE');
select function_privs_are('public', 'booking_staff_trip_change',
  '{uuid,uuid,text,jsonb,int8,int4,jsonb,text,numeric,int4,jsonb,int4,text}'::text[], 'anon', '{}'::text[],
  'booking_staff_trip_change: anon holds no EXECUTE');
select function_privs_are('public', 'booking_staff_trip_change',
  '{uuid,uuid,text,jsonb,int8,int4,jsonb,text,numeric,int4,jsonb,int4,text}'::text[], 'authenticated', '{}'::text[],
  'booking_staff_trip_change: authenticated holds no EXECUTE');
select is(
  (select bool_and(p.prosecdef and p.proconfig @> array['search_path=""'])
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where (n.nspname, p.proname) in (('public', 'booking_staff_trip_change'), ('public', 'booking_change_request_facts'),
                                     ('public', 'booking_staff_contact_update'), ('public', 'booking_edit_apply_payload'),
                                     ('app', 'booking_change_mint_trip_snapshot'), ('public', 'manage_money_for'),
                                     ('app', 'tg_leg_kept_clear'), ('app', 'tg_leg_kept_guard'))),
  true, 'every P6 function is SECURITY DEFINER with search_path empty');
select function_privs_are('public', 'booking_change_request_facts', '{uuid}'::text[], 'vamos_system', '{EXECUTE}'::text[],
  'booking_change_request_facts: vamos_system holds EXECUTE');
select function_privs_are('public', 'booking_change_request_facts', '{uuid}'::text[], 'anon', '{}'::text[],
  'booking_change_request_facts: anon holds no EXECUTE');
select function_privs_are('public', 'booking_staff_contact_update',
  '{uuid,uuid,text,text,text,text,text}'::text[], 'vamos_system', '{EXECUTE}'::text[],
  'booking_staff_contact_update: vamos_system holds EXECUTE');
select function_privs_are('public', 'booking_staff_contact_update',
  '{uuid,uuid,text,text,text,text,text}'::text[], 'vamos_staff', '{}'::text[],
  'booking_staff_contact_update: vamos_staff holds no EXECUTE');
select function_privs_are('public', 'booking_staff_contact_update',
  '{uuid,uuid,text,text,text,text,text}'::text[], 'anon', '{}'::text[],
  'booking_staff_contact_update: anon holds no EXECUTE');
select function_privs_are('public', 'booking_edit_apply_payload',
  '{uuid,int8,jsonb,uuid,text,text}'::text[], 'anon', '{}'::text[],
  'booking_edit_apply_payload (replaced): anon still holds no EXECUTE');
select function_privs_are('public', 'manage_money_for', '{uuid}'::text[], 'anon', '{}'::text[],
  'manage_money_for (replaced): anon still holds no EXECUTE');

-- ---------------------------------------------------------------------------
-- A. Refusals
-- ---------------------------------------------------------------------------
select throws_ok($$select * from pg_temp.tcr_change('unpaid', null, '{"pax":3}'::jsonb, null)$$, 'P0001', 'unpaid',
  'unpaid booking refused');
select throws_ok($$select * from pg_temp.tcr_change('late', null, '{"pax":3}'::jsonb, null)$$, 'P0001', 'too-late',
  'pickup time passed refused (D8)');
select throws_ok($$select * from pg_temp.tcr_change('waiting', null, '{"pax":3}'::jsonb, null)$$, 'P0001',
  'customer-request-waiting', 'a waiting customer request blocks the change');
select throws_ok(
  format($f$select * from pg_temp.tcr_change('same', null, jsonb_build_object('scheduled_local', %L), null)$f$,
         pg_temp.tcr_local(interval '-2 hours')),
  'P0001', 'past-time', 'a new time that has passed is refused');
select throws_ok($$select * from pg_temp.tcr_change('same', null, '{}'::jsonb, null)$$, 'P0001', 'no-change',
  'nothing to change is refused');
select throws_ok(
  format($f$select * from pg_temp.tcr_change('same', null, jsonb_build_object('scheduled_local', %L), null)$f$,
         (select scheduled_local from public.booking_legs where booking_id = (select id from fx where k = 'same'))),
  'P0001', 'no-change', 'the same time again is not a change');
select throws_ok($$select * from pg_temp.tcr_change('same', null, '{"price_rappen":1}'::jsonb, null)$$, 'P0001',
  'invalid-change', 'an unknown trip field is refused');
select throws_ok($$select * from pg_temp.tcr_change('same', null, '{"pickup_text":"Zug"}'::jsonb, 13, 10, null, 'tcr-rv', 40, 50)$$,
  'P0001', 'invalid-change', 'a new place without coordinates is refused (typed text is never priced)');
select throws_ok($$select * from pg_temp.tcr_change('same', null, '{"pax":3}'::jsonb, 13, 10)$$, 'P0001',
  'invalid-change', 'a price on a no-price change is refused (D1, D5)');
select throws_ok($$select * from pg_temp.tcr_change('same', null, pg_temp.tcr_zug(), null)$$, 'P0001',
  'invalid-change', 'a place change without a price is refused');
select throws_ok($$select * from pg_temp.tcr_change('same', null, '{"pax":6}'::jsonb, null)$$, 'P0001',
  'class-too-small', 'more passengers than the class takes is refused without a larger class (D4)');
select throws_ok($$select * from pg_temp.tcr_change('same', null, pg_temp.tcr_zug(), 13, 10, null, 'tcr-old', 42.5, 55)$$,
  'P0001', 'price-book-changed', 'a price book that is not live is refused');
select throws_ok($$select * from pg_temp.tcr_change('same', null, pg_temp.tcr_zug(), 13, 9, null, 'tcr-rv', 42.5, 55)$$,
  'P0001', 'paid-changed', 'a preview whose paid-so-far moved is refused');
select throws_ok($$select * from pg_temp.tcr_change('same', null, '{"pax":3}'::jsonb, null, null, 'maybe')$$, 'P0001',
  'invalid-change', 'a driver choice other than keep / unassign is refused');
select is(
  (select count(*)::int from public.booking_edit_requests
    where booking_id in (select id from fx where k in ('same', 'late', 'unpaid'))),
  0, 'no request row is left by a refusal');

-- ---------------------------------------------------------------------------
-- B. Dearer place change: Oerlikon -> Zug, new total 13, paid 10, driver b stays
-- ---------------------------------------------------------------------------
create temporary table dear as
  select * from pg_temp.tcr_change('dear', null, pg_temp.tcr_zug(), 13, 10, null, 'tcr-rv', 42.5, 55);

select is((select outcome from dear), 'extra_required', 'dearer: extra_required');
select is((select difference_rappen from dear), 3, 'dearer: difference = new total - paid');
select is(
  (select pickup_text || '|' || pickup_place_id || '|' || pickup_lat::text || '|' || estimated_duration_minutes
     from public.booking_legs where booking_id = (select id from fx where k = 'dear')),
  'Zurich Oerlikon|mb-oerlikon|47.411500|40', 'dearer: the trip keeps its old place, coordinates and duration until paid (D1)');
select is(
  (select s.distance_km::text || '|' || s.duration_min || '|' || s.total_rappen::int || '|' || s.source
     from public.price_snapshots s where s.id = (select quote_snapshot_id from dear)),
  '42.50|55|13|modification', 'the new price record carries the NEW distance and duration');
select is(
  (select s.shown_alternatives from public.price_snapshots s where s.id = (select quote_snapshot_id from dear)),
  jsonb_build_array(jsonb_build_object('slug', 'tcr-eco', 'total_rappen', 12)),
  'the new price record keeps the class totals of the NEW trip, not the old ones');
select is(
  (select r.actor || ':' || r.status || ':' || jsonb_typeof(r.payload) || ':' || (r.payload ->> 'pickup_place_id') || ':'
          || (r.payload ->> 'driver')
     from public.booking_edit_requests r where r.id = (select request_id from dear)),
  'staff:requested:object:mb-zug:keep', 'dearer: a staff request waits, payload an object with the place and driver keep');
select is((select kept_chauffeur_id from dear), null::uuid, 'dearer: nothing applied yet, no driver named');

select is(
  (select places_changed::text || ':' || time_changed::text || ':' || party_changed::text || ':' || class_changed::text
     from public.booking_change_request_facts((select request_id from dear))),
  'true:false:false:false', 'M: request facts of a place change');

select lives_ok(
  format($f$select public.booking_edit_request_set_extra_session(%L::uuid, 'cs_tcr_dear')$f$, (select request_id from dear)),
  'the Stripe page id is stored on the request');

create temporary table dear_paid as
  select * from public.checkout_extra_payment_settle('evt_tcr_dear', 'cs_tcr_dear', 'pi_tcr_dear_x', 'succeeded',
                                                     'CHF', null, null, null, null);
select is((select applied from dear_paid), true, 'paid: the change is applied');
select is((select class_changed from dear_paid), false, 'paid: the class did not change');
select is((select unassigned_chauffeur_id from dear_paid), null::uuid, 'paid: no driver taken off');
select is(
  (select pickup_text || '|' || pickup_place_id || '|' || pickup_lat::text || '|' || pickup_lng::text || '|'
          || estimated_duration_minutes
     from public.booking_legs where booking_id = (select id from fx where k = 'dear')),
  'Zug|mb-zug|47.172400|8.517400|55', 'paid: the new place, its id, coordinates and the new duration are written');
select is(
  (select dropoff_text || '|' || dropoff_place_id || '|' || dropoff_lat::text
     from public.booking_legs where booking_id = (select id from fx where k = 'dear')),
  'Zurich Airport|mb-zrh|47.450400', 'paid: the destination that did not change stays as booked');
select is(
  (select assigned_chauffeur_id from public.booking_legs where booking_id = (select id from fx where k = 'dear')),
  pg_temp.tcr_driver_id('b'), 'paid: the driver stays on the trip (D7)');
select is(
  (select b.price_snapshot_id from public.bookings b where b.id = (select id from fx where k = 'dear')),
  (select quote_snapshot_id from dear), 'paid: the booking is bound to the new price record');
select ok(
  exists (select 1 from public.booking_events e where e.booking_id = (select id from fx where k = 'dear')
            and e.kind = 'booking.modified' and e.payload ->> 'pickup_text' = 'Zug'),
  'paid: booking.modified records the new place');
select is(
  (select b.refund_status from public.bookings b where b.id = (select id from fx where k = 'dear')),
  'none', 'paid: nothing owed after an exact payment');

-- ---------------------------------------------------------------------------
-- C. Cheaper place change: destination closer, new total 7, paid 10
-- ---------------------------------------------------------------------------
create temporary table cheap as
  select * from pg_temp.tcr_change('cheap', null,
    '{"dropoff_text":"Kloten","dropoff_place_id":"mb-kloten","dropoff_lat":47.4515,"dropoff_lng":8.5849,"estimated_duration_minutes":20}'::jsonb,
    7, 10, null, 'tcr-rv', 12.3, 20);
select is((select outcome from cheap), 'refund_due', 'cheaper: refund_due');
select is((select difference_rappen from cheap), -3, 'cheaper: difference -3');
select is(
  (select dropoff_text || '|' || dropoff_place_id || '|' || dropoff_lng::text || '|' || estimated_duration_minutes
     from public.booking_legs where booking_id = (select id from fx where k = 'cheap')),
  'Kloten|mb-kloten|8.584900|20', 'cheaper: the new destination is written on confirm');
select is(
  (select b.refund_status || ':' || b.refund_owed_rappen::int from public.bookings b where b.id = (select id from fx where k = 'cheap')),
  'pending_ops:3', 'cheaper: Refund due with the full difference (D3)');
select ok(
  not exists (select 1 from public.booking_refunds r where r.booking_id = (select id from fx where k = 'cheap')),
  'cheaper: nothing is refunded without the admin (refunds by hand)');

-- ---------------------------------------------------------------------------
-- D. Date or time only: 30 h ahead -> 34 h ahead, no new price, driver b stays
-- ---------------------------------------------------------------------------
create temporary table timed as
  select * from pg_temp.tcr_change('time', null,
    jsonb_build_object('scheduled_local', pg_temp.tcr_local(interval '34 hours')), null);
select is((select outcome from timed), 'applied', 'time only: applied on confirm');
select is((select difference_rappen from timed), 0, 'time only: no difference (D1)');
select is(
  (select scheduled_local from public.booking_legs where booking_id = (select id from fx where k = 'time')),
  pg_temp.tcr_local(interval '34 hours'), 'time only: the new wall clock is written');
select is(
  (select scheduled_at from public.booking_legs where booking_id = (select id from fx where k = 'time')),
  (pg_temp.tcr_local(interval '34 hours')::timestamp at time zone 'Europe/Zurich'), 'time only: the instant follows the Zurich wall clock');
select is(
  (select s.total_rappen::int || '|' || jsonb_array_length(s.lines) || '|' || (s.rate_version_id = (select id from public.rate_versions where slug = 'tcr-rv'))::text
          || '|' || s.distance_km::text || '|' || s.source
     from public.price_snapshots s where s.id = (select quote_snapshot_id from timed)),
  '10|2|true|31.40|modification', 'time only: the price record keeps the price, lines, book and distance');
select is(
  (select b.price_snapshot_id from public.bookings b where b.id = (select id from fx where k = 'time')),
  (select quote_snapshot_id from timed), 'time only: the booking is bound to the copy');
select is((select kept_chauffeur_id from timed), pg_temp.tcr_driver_id('b'), 'time only: the driver stays and is named for his e-mail');
select is((select unassigned_chauffeur_id from timed), null::uuid, 'time only: nobody taken off');
select is(
  (select r.status from public.booking_edit_requests r where r.id = (select request_id from timed)),
  'accepted', 'time only: the request is recorded as accepted');
select ok(
  exists (select 1 from public.booking_events e where e.booking_id = (select id from fx where k = 'time')
            and e.kind = 'booking.modified' and e.payload ? 'scheduled_local'),
  'time only: booking.modified records the new time');
select is(
  (select b.refund_status from public.bookings b where b.id = (select id from fx where k = 'time')),
  'none', 'time only: no money owed either way');
select is(
  (select places_changed::text || ':' || time_changed::text from public.booking_change_request_facts((select request_id from timed))),
  'false:true', 'M: request facts of a time change');

-- ---------------------------------------------------------------------------
-- E. Passengers and bags inside the class: 2/1 -> 3/2 in Economy (takes 4/4)
-- ---------------------------------------------------------------------------
create temporary table party as select * from pg_temp.tcr_change('party', null, '{"pax":3,"bags":2}'::jsonb, null);
select is((select outcome from party), 'applied', 'party: applied on confirm (D5)');
select is(
  (select pax || '/' || bags from public.booking_legs where booking_id = (select id from fx where k = 'party')),
  '3/2', 'party: the leg carries the new party');
select is(
  (select s.pax || '/' || s.bags || '/' || s.total_rappen::int from public.price_snapshots s where s.id = (select quote_snapshot_id from party)),
  '3/2/10', 'party: the price record carries the party, the price stays');

-- ---------------------------------------------------------------------------
-- F. Party too big + a larger class: 2 -> 6 in Economy, Business at 15, driver e comes off
-- ---------------------------------------------------------------------------
create temporary table grow as select * from pg_temp.tcr_change('grow', 'tcr-biz', '{"pax":6}'::jsonb, 15, 10);
select is((select outcome from grow), 'extra_required', 'party + class: one price, the difference to pay');
select is((select difference_rappen from grow), 5, 'party + class: difference 5');
select is(
  (select r.payload ->> 'vehicle_class_slug' || ':' || (r.payload ->> 'pax') || ':' || coalesce(r.payload ->> 'driver', 'none')
     from public.booking_edit_requests r where r.id = (select request_id from grow)),
  'tcr-biz:6:none', 'party + class: one request with the class and the party; no keep (a class change takes him off)');
select lives_ok(
  format($f$select public.booking_edit_request_set_extra_session(%L::uuid, 'cs_tcr_grow')$f$, (select request_id from grow)),
  'party + class: the Stripe page id is stored');
create temporary table grow_paid as
  select * from public.checkout_extra_payment_settle('evt_tcr_grow', 'cs_tcr_grow', 'pi_tcr_grow_x', 'succeeded',
                                                     'CHF', null, null, null, null);
select is(
  (select applied::text || ':' || class_changed::text || ':' || (unassigned_chauffeur_id = pg_temp.tcr_driver_id('e'))::text from grow_paid),
  'true:true:true', 'party + class paid: applied, class changed, driver e taken off');
select is(
  (select vc.slug || ':' || l.pax from public.booking_legs l join public.vehicle_classes vc on vc.id = l.vehicle_class_id
    where l.booking_id = (select id from fx where k = 'grow')),
  'tcr-biz:6', 'party + class paid: Business for six');
select ok(
  exists (select 1 from public.booking_events e where e.booking_id = (select id from fx where k = 'grow')
            and e.kind = 'assignment.cleared' and e.payload ->> 'reason' = 'class_change'),
  'party + class paid: assignment.cleared reason class_change');

-- ---------------------------------------------------------------------------
-- G. A clash with another trip of driver a (busy at +200 h; clash moves from +196 h to +200 h 10 min)
-- ---------------------------------------------------------------------------
select is(
  (select pg_get_constraintdef(c.oid) like '%overlap_kept_range IS DISTINCT FROM scheduled_range%DEFERRABLE%'
     from pg_constraint c where c.conname = 'booking_legs_chauffeur_no_overlap'),
  true, 'D17: the overlap rule leaves out a kept trip only, still deferrable');
select throws_ok(
  format($f$select * from pg_temp.tcr_change('clash', null, jsonb_build_object('scheduled_local', %L), null)$f$,
         pg_temp.tcr_local(interval '200 hours 10 minutes')),
  'P0001', 'driver-choice-needed', 'clash: the owner must choose keep or take off (D7)');
select is(
  (select scheduled_local from public.booking_legs where booking_id = (select id from fx where k = 'clash')),
  pg_temp.tcr_local(interval '196 hours'), 'clash without a choice: the trip did not move');
create temporary table clash as
  select * from pg_temp.tcr_change('clash', null,
    jsonb_build_object('scheduled_local', pg_temp.tcr_local(interval '200 hours 10 minutes')), null, null, 'keep');
select is(
  (select outcome || ':' || coalesce(unassigned_chauffeur_id::text, 'none') || ':' || (kept_chauffeur_id = pg_temp.tcr_driver_id('a'))::text from clash),
  'applied:none:true', 'Keep on a clash (D11, D17): applied, driver a stays and is named for his e-mail');
select is(
  (select scheduled_local || ':' || (assigned_chauffeur_id = pg_temp.tcr_driver_id('a'))::text || ':' || (overlap_kept_range = scheduled_range)::text
     from public.booking_legs where booking_id = (select id from fx where k = 'clash')),
  pg_temp.tcr_local(interval '200 hours 10 minutes') || ':true:true', 'Keep: the trip moved, driver a on it, kept for exactly its new window');
select is(
  (select (assigned_chauffeur_id = pg_temp.tcr_driver_id('a'))::text || ':' || coalesce(overlap_kept_range::text, 'null')
     from public.booking_legs where booking_id = (select id from fx where k = 'busy')),
  'true:null', 'Keep: his other trip keeps him and is not kept itself');
select is(
  (select (payload ->> 'driver') || ':' || (payload ->> 'overlap_kept') from public.booking_edit_requests
    where id = (select request_id from clash)),
  'keep:true', 'Keep: the request records the owner''s choice');
-- An ordinary Assign onto the kept trip's window (not onto busy) is refused.
update public.booking_legs as l
   set scheduled_at = x.at, scheduled_local = to_char(x.at at time zone 'Europe/Zurich', 'YYYY-MM-DD"T"HH24:MI')
  from (select upper(scheduled_range) + interval '1 minute' as at from public.booking_legs
         where booking_id = (select id from fx where k = 'busy')) as x
 where l.booking_id = (select id from fx where k = 'third');
select is(
  (select (t.scheduled_range && c.scheduled_range)::text || ':' || (t.scheduled_range && b.scheduled_range)::text
     from public.booking_legs t, public.booking_legs c, public.booking_legs b
    where t.booking_id = (select id from fx where k = 'third') and c.booking_id = (select id from fx where k = 'clash')
      and b.booking_id = (select id from fx where k = 'busy')),
  'true:false', 'fixture: third overlaps the kept trip only');
select throws_ok($$select pg_temp.tcr_assign('third', 'a')$$, '23P01', null,
  'D17: an ordinary Assign onto a kept trip is refused (the overlap rule, raised by booking_legs_kept_guard)');
select throws_ok($$select pg_temp.tcr_assign('third3', 'f')$$, '23P01', null,
  'D17: an ordinary Assign onto a trip that is not kept is refused as before');
select lives_ok(
  format($f$update public.booking_legs set flight_no = 'LX 1' where booking_id = %L$f$, (select id from fx where k = 'busy')),
  'the trip the other was kept against stays editable');
-- Its status still moves (the owner marks it done; a payment confirms it): nothing about its window changed.
create temporary table busy_was as
  select status from public.booking_legs where booking_id = (select id from fx where k = 'busy');
select lives_ok(
  format($f$update public.booking_legs set status = 'completed' where booking_id = %L$f$, (select id from fx where k = 'busy')),
  'the trip the other was kept against can be marked completed');
select lives_ok(
  format($f$update public.booking_legs set status = %L::public.booking_status where booking_id = %L$f$,
         (select status from busy_was), (select id from fx where k = 'busy')),
  'and its status can move back (any status between counted ones)');
create temporary table clash_party as select * from pg_temp.tcr_change('clash', null, '{"pax":3}'::jsonb, null);
select is(
  (select c.outcome || ':' || (l.overlap_kept_range = l.scheduled_range)::text
     from clash_party c, public.booking_legs l where l.booking_id = (select id from fx where k = 'clash')),
  'applied:true', 'a party change on the kept trip asks nothing and keeps it kept');
select throws_ok(
  format($f$select * from pg_temp.tcr_change('clash', null, jsonb_build_object('scheduled_local', %L), null)$f$,
         pg_temp.tcr_local(interval '200 hours 15 minutes')),
  'P0001', 'driver-choice-needed', 'a second move of the kept trip without Keep asks again');
select throws_ok(
  format($f$select public.booking_edit_apply_payload(%L::uuid, %s, jsonb_build_object('scheduled_local', %L), null, 'customer', 'c')$f$,
         (select id from fx where k = 'clash'),
         (select price_snapshot_id from public.bookings where id = (select id from fx where k = 'clash')),
         pg_temp.tcr_local(interval '200 hours 15 minutes')),
  '23P01', null, 'a move of the kept trip without Keep (a customer''s time change) is refused: the stamp no longer matches');
select lives_ok(
  format($f$select * from public.ops_unassign_leg(%L::uuid, '26060001-0000-4000-a000-000000000001'::uuid)$f$,
         (select id from fx where k = 'clash')),
  'unassign the kept trip');
select is(
  (select coalesce(overlap_kept_range::text, 'null') from public.booking_legs where booking_id = (select id from fx where k = 'clash')),
  'null', 'unassign clears the stamp');
select throws_ok($$select pg_temp.tcr_assign('clash', 'a')$$, '23P01', null,
  'a reassign of the same driver onto the overlap is refused again (not kept any more)');

create temporary table clash2 as
  select * from pg_temp.tcr_change('clash2', null,
    jsonb_build_object('scheduled_local', pg_temp.tcr_local(interval '250 hours 10 minutes')), null, null, 'unassign');
select is((select outcome from clash2), 'applied', 'clash, take off: applied');
select is((select unassigned_chauffeur_id from clash2), pg_temp.tcr_driver_id('f'), 'clash, take off: driver f named for his e-mail');
select is(
  (select coalesce(assigned_chauffeur_id::text, 'none') || ':' || status from public.booking_legs
    where booking_id = (select id from fx where k = 'clash2')),
  'none:confirmed', 'clash, take off: the trip is unassigned (assigned -> confirmed)');
select ok(
  exists (select 1 from public.booking_events e where e.booking_id = (select id from fx where k = 'clash2')
            and e.kind = 'assignment.cleared' and e.payload ->> 'reason' = 'trip_change'),
  'clash, take off: assignment.cleared reason trip_change');
select is(
  (select assigned_chauffeur_id from public.booking_legs where booking_id = (select id from fx where k = 'busy2')),
  pg_temp.tcr_driver_id('f'), 'clash, take off: his other trip keeps him');

-- ---------------------------------------------------------------------------
-- I. An overlap that appears between confirm and payment (keep): driver c comes off, payment recorded
-- ---------------------------------------------------------------------------
create temporary table lateov as
  select * from pg_temp.tcr_change('lateov', null,
    jsonb_build_object('dropoff_text', 'Chur', 'dropoff_place_id', 'mb-chur', 'dropoff_lat', 46.8508,
                       'dropoff_lng', 9.5320, 'estimated_duration_minutes', 120),
    14, 10, null, 'tcr-rv', 118.2, 120);
select is((select outcome from lateov), 'extra_required', 'late overlap: confirm waits for the difference');
-- Another trip of driver c, starting right after the old trip ends (no overlap then), inside the new one.
select pg_temp.tcr_mk('intruder', 'tcr-eco', interval '300 hours', 10);
update public.booking_legs as l
   set scheduled_at = x.at,
       scheduled_local = to_char(x.at at time zone 'Europe/Zurich', 'YYYY-MM-DD"T"HH24:MI')
  from (select upper(scheduled_range) + interval '5 minutes' as at from public.booking_legs
         where booking_id = (select id from fx where k = 'lateov')) as x
 where l.booking_id = (select id from fx where k = 'intruder');
select lives_ok($$select pg_temp.tcr_drive('intruder', 'c')$$, 'late overlap: driver c takes the next trip (no overlap yet)');
select lives_ok(
  format($f$select public.booking_edit_request_set_extra_session(%L::uuid, 'cs_tcr_lateov')$f$, (select request_id from lateov)),
  'late overlap: the Stripe page id is stored');
create temporary table lateov_paid as
  select * from public.checkout_extra_payment_settle('evt_tcr_lateov', 'cs_tcr_lateov', 'pi_tcr_lateov_x', 'succeeded',
                                                     'CHF', null, null, null, null);
select is(
  (select applied::text || ':' || (unassigned_chauffeur_id = pg_temp.tcr_driver_id('c'))::text from lateov_paid),
  'true:true', 'late overlap: the payment applies the change and names driver c taken off');
select ok(
  exists (select 1 from public.booking_events e where e.booking_id = (select id from fx where k = 'lateov')
            and e.kind = 'assignment.cleared' and e.payload ->> 'reason' = 'overlap'),
  'late overlap: assignment.cleared reason overlap');
select is(
  (select count(*)::int from public.booking_payments p where p.booking_id = (select id from fx where k = 'lateov')
      and p.captured_at is not null),
  2, 'late overlap: both payments are recorded');
select is(
  (select assigned_chauffeur_id from public.booking_legs where booking_id = (select id from fx where k = 'intruder')),
  pg_temp.tcr_driver_id('c'), 'late overlap: his other trip keeps him');

-- ---------------------------------------------------------------------------
-- J. A customer's time-change payload (no driver choice) keeps the old rule: overlap refused
-- ---------------------------------------------------------------------------
select pg_temp.tcr_mk('cust', 'tcr-eco', interval '400 hours', 10);
select pg_temp.tcr_mk('cust2', 'tcr-eco', interval '404 hours', 10);
select pg_temp.tcr_drive('cust', 'a');
select pg_temp.tcr_drive('cust2', 'a');
select throws_ok(
  format($f$select public.booking_edit_apply_payload(%L::uuid, %s, jsonb_build_object('scheduled_local', %L), null, 'customer', 'c')$f$,
         (select id from fx where k = 'cust'),
         (select price_snapshot_id from public.bookings where id = (select id from fx where k = 'cust')),
         pg_temp.tcr_local(interval '404 hours')),
  '23P01', null, 'a customer time change onto another trip of the driver is still refused (must-fix path)');

-- ---------------------------------------------------------------------------
-- K. Contact, note and flight saved at once (D6, D8)
-- ---------------------------------------------------------------------------
select throws_ok(
  format($f$select * from public.booking_staff_contact_update(%L::uuid, '26060001-0000-4000-a000-000000000001'::uuid,
           'X', null, null, null, null)$f$, (select id from fx where k = 'unpaid')),
  'P0001', 'unpaid', 'contact: unpaid booking refused');
create temporary table c1 as
  select * from public.booking_staff_contact_update((select id from fx where k = 'contact'),
    '26060001-0000-4000-a000-000000000001'::uuid, '  ', null, '+41 79 111 22 33', 'Gate B', null);
select is((select changed_fields from c1), 'contact_phone,note', 'contact: phone and note changed; an empty name keeps the stored one');
select is((select flight_changed from c1), false, 'contact: no flight change');
select is(
  (select contact_name || '|' || contact_phone || '|' || note from public.bookings where id = (select id from fx where k = 'contact')),
  'TCR contact|+41 79 111 22 33|Gate B', 'contact: values written');
select ok(
  exists (select 1 from public.booking_events e where e.booking_id = (select id from fx where k = 'contact')
            and e.kind = 'booking.modified' and e.actor_kind = 'staff'
            and e.payload -> 'fields' = '["contact_phone", "note"]'::jsonb and e.payload ->> 'via' = 'staff_edit'),
  'contact: booking.modified records the fields that changed (D6)');
create temporary table c2 as
  select * from public.booking_staff_contact_update((select id from fx where k = 'contact'),
    '26060001-0000-4000-a000-000000000001'::uuid, null, null, null, null, ' lx 320 ');
select is(
  (select changed_fields || ':' || flight_changed::text || ':' || (assigned_chauffeur_id = pg_temp.tcr_driver_id('d'))::text from c2),
  'flight_no:true:true', 'flight: changed and the assigned driver is named for the flight e-mail (D8)');
select is(
  (select flight_no from public.booking_legs where booking_id = (select id from fx where k = 'contact')),
  'LX 320', 'flight: written trimmed and upper case');
select ok(
  exists (select 1 from public.booking_events e where e.booking_id = (select id from fx where k = 'contact')
            and e.kind = 'booking.modified' and e.payload ->> 'flight_no' = 'LX 320'),
  'flight: booking.modified records the flight number');
create temporary table c3 as
  select * from public.booking_staff_contact_update((select id from fx where k = 'contact'),
    '26060001-0000-4000-a000-000000000001'::uuid, 'TCR contact', null, '+41 79 111 22 33', 'Gate B', 'LX 320');
select is((select changed_fields || ':' || flight_changed::text from c3), ':false', 'contact: nothing changed answers nothing');
select is(
  (select count(*)::int from public.booking_events e where e.booking_id = (select id from fx where k = 'contact')
      and e.kind = 'booking.modified'),
  2, 'contact: nothing changed records nothing');
select is(
  (select pickup_text || '|' || pax from public.booking_legs where booking_id = (select id from fx where k = 'contact')),
  'Zurich Oerlikon|2', 'contact: the trip is not touched');

-- ---------------------------------------------------------------------------
-- L. The customer page knows which change left a refund due
-- ---------------------------------------------------------------------------
select is(public.manage_money_for((select id from fx where k = 'cheap')) ->> 'last_change', 'trip',
  'last_change is trip after a place change');
select is(public.manage_money_for((select id from fx where k = 'same')) ->> 'last_change', null,
  'last_change is empty when nothing was changed');
select lives_ok(
  $$select * from public.booking_staff_change((select id from fx where k = 'classonly'),
      '26060001-0000-4000-a000-000000000001'::uuid, 'tcr-biz',
      (select id from public.rate_versions where slug = 'tcr-rv'), 7, pg_temp.tcr_lines(7), 'x', 10)$$,
  'a class-only change (P1)');
select is(public.manage_money_for((select id from fx where k = 'classonly')) ->> 'last_change', 'class',
  'last_change is class after a class-only change');
select is(
  (select (public.manage_money_for((select id from fx where k = 'cheap')) ? 'lines')::text),
  'true', 'manage_money_for keeps its other keys');

-- ---------------------------------------------------------------------------
-- More refusals that need a driver or a class
-- ---------------------------------------------------------------------------
select throws_ok($$select * from pg_temp.tcr_change('same', 'tcr-nope', '{"pax":3}'::jsonb, 11, 10)$$, 'P0001',
  'unknown-class', 'an unknown class is refused');
select is(
  (select outcome from pg_temp.tcr_change('same', 'tcr-eco', '{"pax":3}'::jsonb, null)),
  'applied', 'naming the current class is not a class change (party only, no price)');

-- ---------------------------------------------------------------------------
-- M. D20 (owner, 2026-10-02): the customer's Resend on a cancelled trip sends the cancellation
--    e-mail again, with the refund line its cancellation recorded. A definer read for vamos_system.
-- ---------------------------------------------------------------------------
select pg_temp.tcr_mk('can_paid', 'tcr-eco', interval '300 hours', 5000);
select pg_temp.tcr_mk('can_unpaid', 'tcr-eco', interval '301 hours', 5000, false);
update public.bookings set status = 'cancelled' where id in (select id from fx where k in ('can_paid', 'can_unpaid'));
insert into public.booking_events (booking_id, kind, actor_kind, actor_label, from_status, to_status, payload)
select id, 'booking.status_changed', 'customer', '', 'confirmed', 'cancelled',
       jsonb_build_object('via', 'manage', 'refund_mode', 'pending_ops', 'refund_rappen', null)
  from fx where k = 'can_paid';
select has_function('public', 'booking_cancel_resend_facts', array['uuid'], 'D20: booking_cancel_resend_facts exists');
select function_privs_are('public', 'booking_cancel_resend_facts', '{uuid}'::text[], 'vamos_system', '{EXECUTE}'::text[],
  'D20: vamos_system holds EXECUTE');
select function_privs_are('public', 'booking_cancel_resend_facts', '{uuid}'::text[], 'anon', '{}'::text[],
  'D20: anon holds no EXECUTE');
select function_privs_are('public', 'booking_cancel_resend_facts', '{uuid}'::text[], 'authenticated', '{}'::text[],
  'D20: authenticated holds no EXECUTE');
select is(
  (select p.prosecdef and p.proconfig @> array['search_path=""'] from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'booking_cancel_resend_facts'),
  true, 'D20: SECURITY DEFINER with search_path empty');
select is(
  (select reference || '|' || locale || '|' || contact_email || '|' || pickup_text || '|' || dropoff_text || '|'
          || coalesce(refund_mode, 'null') || '|' || coalesce(refund_rappen::text, 'null')
     from public.booking_cancel_resend_facts((select id from fx where k = 'can_paid'))),
  (select reference from public.bookings where id = (select id from fx where k = 'can_paid'))
    || '|de|tcr-can_paid@vamostaxi.eu|Zurich Oerlikon|Zurich Airport|pending_ops|null',
  'D20: a paid cancelled trip: its mail facts and the refund line its cancellation recorded');
select is(
  (select count(*)::int from public.booking_cancel_resend_facts((select id from fx where k = 'can_unpaid'))),
  0, 'D20: a trip cancelled before it was paid has no cancellation mail to send again');
select is(
  (select count(*)::int from public.booking_cancel_resend_facts((select id from fx where k = 'same'))),
  0, 'D20: a trip that is not cancelled gets nothing from this read');

select * from finish();
rollback;
