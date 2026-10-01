-- class_change_reprice.test.sql
--
-- 26.2 P1 (migration 20261007140000): a class change on a PAID trip is re-priced and works.
--   A  booking_staff_change refusals: unpaid, too late, customer request waiting, class too
--      small, same class, unknown class, price book no longer live, paid amount moved.
--   B  dearer: trip unchanged, new price record carries the new class and full lines, a
--      difference record for the extra; paid -> class changes, driver taken off (D6).
--   C  cheaper: class changes on confirm, "Refund due" with the difference; the refund plan
--      sends exactly what is due (credit tier); paid out -> the live trip reads none again.
--   D  same price: applied on confirm.
--   E  difference measured against everything paid minus refunds (second change).
--   F  difference not paid: the request ends, the booking is untouched (D4).
--   G  payload reader fix: a payload passed as a JSON string is read as the object it holds.
--   H  grants: EXECUTE vamos_system only.
-- Rolled back. Synthetic integer rappen only, never a product CHF.
begin;
select plan(69);

insert into public.vehicle_classes (slug, passenger_capacity, luggage_capacity)
values ('ccr-eco', 4, 4), ('ccr-biz', 7, 7), ('ccr-tiny', 1, 0);

insert into public.rate_versions (slug, label) values ('ccr-rv', 'CCR fixture'), ('ccr-old', 'CCR old');
update public.rate_versions set status = 'live' where slug = 'ccr-rv';

insert into auth.users (id, email, aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('26020001-0000-4000-a000-000000000001', 'ccr-admin@vamostaxi.eu', 'authenticated', 'authenticated',
        '{}'::jsonb, '{}'::jsonb, now(), now());
insert into public.staff (user_id, role, active, accepted_at, full_name)
values ('26020001-0000-4000-a000-000000000001', 'admin', true, now(), 'CCR Admin');

insert into public.vehicles (vehicle_class_id, model, plate, seats, bags)
select vc.id, 'CCR Car', 'ZH-CCR-01', 4, 4 from public.vehicle_classes vc where vc.slug = 'ccr-eco';
insert into public.chauffeurs (full_name, phone, email, licence_number, default_vehicle_id, languages)
select 'CCR Driver', '+41 79 260 00 01', 'ccr-driver@vamostaxi.eu', 'LIC-CCR', v.id, array['de', 'en']
  from public.vehicles v where v.plate = 'ZH-CCR-01';

create temporary table fx (k text primary key, id uuid not null);

-- One paid booking: one leg, one price record with a fare and a VAT line, one captured payment.
create function pg_temp.ccr_mk(p_key text, p_class text, p_offs interval, p_amount int, p_paid boolean default true)
returns uuid language plpgsql as $$
declare
  v_b uuid;
  v_snap bigint;
begin
  insert into public.bookings (reference, contact_name, contact_email, status, locale)
  values (public.next_booking_reference(), 'CCR ' || p_key, 'ccr-' || p_key || '@vamostaxi.eu',
          case when p_paid then 'confirmed' else 'quote' end::public.booking_status, 'de')
  returning id into v_b;

  insert into public.booking_legs (
    booking_id, leg_seq, direction, pickup_text, dropoff_text,
    scheduled_at, scheduled_local, vehicle_class_id, status, pax, bags, estimated_duration_minutes
  )
  select v_b, 1, 'outbound', 'ZRH Airport', 'Zug',
         now() + p_offs, to_char(now() + p_offs, 'YYYY-MM-DD"T"HH24:MI'), vc.id,
         case when p_paid then 'confirmed' else 'quote' end::public.booking_status, 2, 1, 40
    from public.vehicle_classes vc where vc.slug = p_class;

  if p_paid then
    set local session_replication_role = replica;
    insert into public.price_snapshots (
      quote_id, vehicle_class_id, rate_version_id, rate_version_is_live, settings_version_id,
      engine_version, pax, bags, lines, policy,
      subtotal_rappen, surcharges_rappen, discount_rappen, total_rappen,
      expires_at, quote_lock_expires_at, booking_id, source, distance_km, duration_min
    )
    select gen_random_uuid(), vc.id, rv.id, true, sv.id, 'quote-engine@ccr', 2, 1,
           jsonb_build_array(
             jsonb_build_object('seq', 1, 'leg_seq', 1, 'code', 'distance_fare', 'kind', 'fare',
                                'i18n_key', 'price.line.transfer', 'amount_rappen', p_amount - 1),
             jsonb_build_object('seq', 2, 'leg_seq', 1, 'code', 'vat', 'kind', 'vat',
                                'i18n_key', 'price.line.vat', 'params', jsonb_build_object('vatRateBps', 81),
                                'amount_rappen', 1)),
           jsonb_build_object('cancellation_tiers', '[]'::jsonb, 'free_cancel_hours', 24,
                              'airport_waiting_minutes', 60, 'city_waiting_minutes', 15,
                              'settings_version_id', sv.id, 'modification_deadline_hours', 24,
                              'min_advance_minutes', 180, 'policy_doc', 'test', 'extras', '[]'::jsonb),
           p_amount, 0, 0, p_amount, now() + interval '1 day', now() + interval '1 day', v_b, 'web', 31.4, 40
      from public.vehicle_classes vc
      cross join lateral (select id from public.rate_versions where slug = 'ccr-rv') rv
      cross join lateral (select id from public.settings_versions order by id limit 1) sv
     where vc.slug = p_class
    returning id into v_snap;
    update public.bookings set price_snapshot_id = v_snap where id = v_b;
    insert into public.booking_payments (booking_id, snapshot_id, stripe_payment_intent_id, charged_rappen, status, captured_at)
    values (v_b, v_snap, 'pi_ccr_' || p_key, p_amount, 'succeeded', now());
    set local session_replication_role = origin;
  end if;

  insert into pg_temp.fx values (p_key, v_b);
  return v_b;
end $$;

select pg_temp.ccr_mk('dear', 'ccr-eco', interval '48 hours', 10);
select pg_temp.ccr_mk('cheap', 'ccr-biz', interval '48 hours', 10);
select pg_temp.ccr_mk('same', 'ccr-eco', interval '48 hours', 10);
select pg_temp.ccr_mk('unpaid', 'ccr-eco', interval '48 hours', 10, false);
select pg_temp.ccr_mk('late', 'ccr-eco', interval '-1 hour', 10);
select pg_temp.ccr_mk('waiting', 'ccr-eco', interval '48 hours', 10);
select pg_temp.ccr_mk('lapse', 'ccr-eco', interval '48 hours', 10);
select pg_temp.ccr_mk('legacy', 'ccr-eco', interval '48 hours', 10);

-- The dearer booking has a driver and his car on it.
update public.booking_legs l
   set assigned_chauffeur_id = c.id, assigned_vehicle_id = c.default_vehicle_id, status = 'assigned'
  from public.chauffeurs c
 where c.email = 'ccr-driver@vamostaxi.eu'
   and l.booking_id = (select id from fx where k = 'dear');

-- A customer's own time-change request waits on one booking.
select public.booking_edit_request_upsert(
  (select id from fx where k = 'waiting'), 'customer', null, '{"scheduled_local":"2030-01-01T10:00"}'::jsonb,
  (select price_snapshot_id from public.bookings where id = (select id from fx where k = 'waiting')));

create function pg_temp.ccr_lines(p_total int) returns jsonb language sql as $$
  select jsonb_build_array(
    jsonb_build_object('seq', 1, 'leg_seq', 1, 'code', 'distance_fare', 'kind', 'fare',
                       'i18n_key', 'price.line.transfer', 'params', jsonb_build_object('vehicleClass', 'x'),
                       'amount_rappen', p_total - 1),
    jsonb_build_object('seq', 2, 'leg_seq', 1, 'code', 'vat', 'kind', 'vat',
                       'i18n_key', 'price.line.vat', 'params', jsonb_build_object('vatRateBps', 81),
                       'amount_rappen', 1))
$$;

create function pg_temp.ccr_change(p_key text, p_class text, p_total int, p_expected int default null, p_rv text default 'ccr-rv')
returns table (request_id uuid, booking_id uuid, outcome text, difference_rappen int, new_total_rappen int,
               paid_rappen int, quote_snapshot_id bigint, extra_snapshot_id bigint, old_extra_session_id text,
               old_extra_snapshot_id bigint, unassigned_chauffeur_id uuid)
language sql as $$
  select * from public.booking_staff_change(
    (select f.id from pg_temp.fx as f where f.k = p_key),
    '26020001-0000-4000-a000-000000000001'::uuid,
    p_class,
    (select rv.id from public.rate_versions as rv where rv.slug = p_rv),
    p_total,
    pg_temp.ccr_lines(p_total),
    'quote-engine@ccr-test',
    p_expected
  )
$$;

-- ---------------------------------------------------------------------------
-- H. Grants
-- ---------------------------------------------------------------------------
select has_function('public', 'booking_staff_change', 'booking_staff_change exists');
select function_privs_are('public', 'booking_staff_change',
  '{uuid,uuid,text,int8,int4,jsonb,text,int4}'::text[], 'vamos_system', '{EXECUTE}'::text[],
  'booking_staff_change: vamos_system holds EXECUTE');
select function_privs_are('public', 'booking_staff_change',
  '{uuid,uuid,text,int8,int4,jsonb,text,int4}'::text[], 'vamos_staff', '{}'::text[],
  'booking_staff_change: vamos_staff holds no EXECUTE');
select function_privs_are('public', 'booking_staff_change',
  '{uuid,uuid,text,int8,int4,jsonb,text,int4}'::text[], 'anon', '{}'::text[],
  'booking_staff_change: anon holds no EXECUTE');
select function_privs_are('public', 'booking_staff_change',
  '{uuid,uuid,text,int8,int4,jsonb,text,int4}'::text[], 'authenticated', '{}'::text[],
  'booking_staff_change: authenticated holds no EXECUTE');
select function_privs_are('public', 'booking_change_mail_facts', '{uuid,uuid}'::text[], 'vamos_system', '{EXECUTE}'::text[],
  'booking_change_mail_facts: vamos_system holds EXECUTE');
select function_privs_are('public', 'booking_change_mail_facts', '{uuid,uuid}'::text[], 'anon', '{}'::text[],
  'booking_change_mail_facts: anon holds no EXECUTE');
select function_privs_are('public', 'checkout_extra_payment_settle',
  '{text,text,text,text,text,numeric,text,timestamptz,int8}'::text[], 'vamos_system', '{EXECUTE}'::text[],
  'extra settle (recreated): vamos_system holds EXECUTE');
select function_privs_are('public', 'checkout_extra_payment_settle',
  '{text,text,text,text,text,numeric,text,timestamptz,int8}'::text[], 'anon', '{}'::text[],
  'extra settle (recreated): anon holds no EXECUTE');
select is(
  (select p.prosecdef and p.proconfig @> array['search_path=""']
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'booking_staff_change'),
  true, 'booking_staff_change is SECURITY DEFINER with search_path empty');

-- ---------------------------------------------------------------------------
-- A. Refusals
-- ---------------------------------------------------------------------------
select throws_ok($$select * from pg_temp.ccr_change('unpaid', 'ccr-biz', 13)$$, 'P0001', 'unpaid', 'unpaid booking refused');
select throws_ok($$select * from pg_temp.ccr_change('late', 'ccr-biz', 13)$$, 'P0001', 'too-late', 'pickup time passed refused (D8)');
select throws_ok($$select * from pg_temp.ccr_change('waiting', 'ccr-biz', 13)$$, 'P0001', 'customer-request-waiting',
  'a waiting customer request blocks the class change');
select throws_ok($$select * from pg_temp.ccr_change('same', 'ccr-tiny', 5)$$, 'P0001', 'class-too-small',
  'a class that cannot take the passengers or bags is refused');
select throws_ok($$select * from pg_temp.ccr_change('same', 'ccr-eco', 10)$$, 'P0001', 'same-class', 'same class refused');
select throws_ok($$select * from pg_temp.ccr_change('same', 'ccr-nope', 10)$$, 'P0001', 'unknown-class', 'unknown class refused');
select throws_ok($$select * from pg_temp.ccr_change('same', 'ccr-biz', 13, null, 'ccr-old')$$, 'P0001', 'price-book-changed',
  'a price book that is not live is refused');
select throws_ok($$select * from pg_temp.ccr_change('same', 'ccr-biz', 13, 9)$$, 'P0001', 'paid-changed',
  'a preview whose paid-so-far moved is refused');
select throws_ok(
  format($f$select * from public.booking_staff_change(%L::uuid, %L::uuid, 'ccr-biz',
           (select id from public.rate_versions where slug = 'ccr-rv'), 13, pg_temp.ccr_lines(12), 'x', null)$f$,
         (select id from fx where k = 'same'), '26020001-0000-4000-a000-000000000001'),
  '23001', null, 'lines that do not sum to the total are refused by the reconcile trigger');
select is(
  (select count(*)::int from public.booking_edit_requests where booking_id in (select id from fx where k in ('same', 'late', 'unpaid'))),
  0, 'no request row is left by a refusal');

-- ---------------------------------------------------------------------------
-- B. Dearer: Economy -> Business, new total 13, paid 10
-- ---------------------------------------------------------------------------
create temporary table dear as select * from pg_temp.ccr_change('dear', 'ccr-biz', 13, 10);

select is((select outcome from dear), 'extra_required', 'dearer: extra_required');
select is((select difference_rappen from dear), 3, 'dearer: difference = new total - paid');
select is((select paid_rappen from dear), 10, 'dearer: paid so far returned');
select is(
  (select vc.slug from public.booking_legs l join public.vehicle_classes vc on vc.id = l.vehicle_class_id
    where l.booking_id = (select id from fx where k = 'dear')),
  'ccr-eco', 'dearer: the booking keeps its class until the difference is paid (D1)');
select is(
  (select vc.slug from public.price_snapshots s join public.vehicle_classes vc on vc.id = s.vehicle_class_id
    where s.id = (select quote_snapshot_id from dear)),
  'ccr-biz', 'the new price record carries the NEW class');
select is(
  (select jsonb_array_length(s.lines) from public.price_snapshots s where s.id = (select quote_snapshot_id from dear)),
  2, 'the new price record keeps the full lines (fare and VAT)');
select is(
  (select s.total_rappen::int from public.price_snapshots s where s.id = (select quote_snapshot_id from dear)),
  13, 'the new price record total is the new total');
select is(
  (select s.rate_version_is_live from public.price_snapshots s where s.id = (select quote_snapshot_id from dear)),
  true, 'the new price record is from the live price book');
select is(
  (select s.total_rappen::int from public.price_snapshots s where s.id = (select extra_snapshot_id from dear)),
  3, 'the difference record total is the difference');
select isnt(
  (select l.assigned_chauffeur_id from public.booking_legs l where l.booking_id = (select id from fx where k = 'dear')),
  null, 'dearer: the driver stays on until the difference is paid');
select is(
  (select r.actor || ':' || r.status || ':' || (r.payload ->> 'vehicle_class_slug') from public.booking_edit_requests r
    where r.id = (select request_id from dear)),
  'staff:requested:ccr-biz', 'dearer: a staff request waits for the payment, payload stored as an object');

select lives_ok(
  format($f$select public.booking_edit_request_set_extra_session(%L::uuid, 'cs_ccr_dear')$f$, (select request_id from dear)),
  'the Stripe page id is stored on the request');

create temporary table dear_paid as
  select * from public.checkout_extra_payment_settle('evt_ccr_dear', 'cs_ccr_dear', 'pi_ccr_dear_x', 'succeeded',
                                                     'CHF', null, null, null, null);

select is((select applied from dear_paid), true, 'paid: the change is applied');
select is((select class_changed from dear_paid), true, 'paid: the settle reports the class changed');
select is(
  (select unassigned_chauffeur_id from dear_paid),
  (select id from public.chauffeurs where email = 'ccr-driver@vamostaxi.eu'),
  'paid: the settle names the driver taken off (D6)');
select is(
  (select vc.slug from public.booking_legs l join public.vehicle_classes vc on vc.id = l.vehicle_class_id
    where l.booking_id = (select id from fx where k = 'dear')),
  'ccr-biz', 'paid: the class changes by itself');
select is(
  (select l.assigned_chauffeur_id from public.booking_legs l where l.booking_id = (select id from fx where k = 'dear')),
  null, 'paid: the driver is taken off the trip');
select is(
  (select l.assigned_vehicle_id from public.booking_legs l where l.booking_id = (select id from fx where k = 'dear')),
  null, 'paid: the car is taken off the trip');
select ok(
  exists (select 1 from public.booking_events e
           where e.booking_id = (select id from fx where k = 'dear') and e.kind = 'assignment.cleared'
             and e.payload ->> 'reason' = 'class_change'),
  'paid: assignment.cleared event with reason class_change');
select is(
  (select b.price_snapshot_id from public.bookings b where b.id = (select id from fx where k = 'dear')),
  (select quote_snapshot_id from dear), 'paid: the booking is bound to the new price record');
select is(
  (select b.refund_status from public.bookings b where b.id = (select id from fx where k = 'dear')),
  'none', 'paid: nothing is owed after an exact payment');
select is(
  (select r.status from public.booking_edit_requests r where r.id = (select request_id from dear)),
  'accepted', 'paid: the request is accepted');

select is(
  (select email || '|' || languages_csv || '|' || reference
     from public.booking_change_mail_facts((select id from fx where k = 'dear'),
                                           (select id from public.chauffeurs where email = 'ccr-driver@vamostaxi.eu'))),
  'ccr-driver@vamostaxi.eu|de,en|' || (select reference from public.bookings where id = (select id from fx where k = 'dear')),
  'mail facts name the driver taken off, languages as plain text');

-- ---------------------------------------------------------------------------
-- E. A second change on the same booking: Business -> Economy at 10, paid 13 -> Refund due 3
-- ---------------------------------------------------------------------------
create temporary table dear_back as select * from pg_temp.ccr_change('dear', 'ccr-eco', 10, 13);
select is((select outcome from dear_back), 'refund_due', 'second change: measured against everything paid (13)');
select is((select difference_rappen from dear_back), -3, 'second change: difference -3');

-- ---------------------------------------------------------------------------
-- C. Cheaper: Business -> Economy, new total 7, paid 10
-- ---------------------------------------------------------------------------
create temporary table cheap as select * from pg_temp.ccr_change('cheap', 'ccr-eco', 7, 10);
select is((select outcome from cheap), 'refund_due', 'cheaper: refund_due');
select is((select difference_rappen from cheap), -3, 'cheaper: difference -3');
select is(
  (select vc.slug from public.booking_legs l join public.vehicle_classes vc on vc.id = l.vehicle_class_id
    where l.booking_id = (select id from fx where k = 'cheap')),
  'ccr-eco', 'cheaper: the class changes on confirm');
select is(
  (select b.refund_status || ':' || b.refund_owed_rappen::int from public.bookings b where b.id = (select id from fx where k = 'cheap')),
  'pending_ops:3', 'cheaper: Refund due with the difference');
select ok(
  not exists (select 1 from public.booking_refunds r where r.booking_id = (select id from fx where k = 'cheap')),
  'cheaper: nothing is refunded without the admin (refunds by hand)');
select ok(
  exists (select 1 from public.booking_events e where e.booking_id = (select id from fx where k = 'cheap')
            and e.kind = 'refund.requested' and (e.payload ->> 'due_rappen')::int = 3),
  'cheaper: refund.requested event with the amount due');

select throws_ok(
  format($f$select * from public.ops_refund_plan(%L::uuid, '26020001-0000-4000-a000-000000000001'::uuid, null, 50)$f$,
         (select id from fx where k = 'cheap')),
  '22023', 'invalid-amount', 'credit tier: a percentage is refused (the amount due is exact)');
select throws_ok(
  format($f$select * from public.ops_refund_plan(%L::uuid, '26020001-0000-4000-a000-000000000001'::uuid, null, null, null, false, 4)$f$,
         (select id from fx where k = 'cheap')),
  'P0001', 'refund-exceeds-remaining', 'credit tier: more than is due is refused');

create temporary table cheap_plan as
  select * from public.ops_refund_plan((select id from fx where k = 'cheap'), '26020001-0000-4000-a000-000000000001'::uuid);
select is((select sum(amount_rappen)::int from cheap_plan), 3, 'credit tier: the plan sends exactly what is due');
select is(
  (select i.tier || ':' || i.reason from public.booking_refund_intents i where i.id = (select intent_id from cheap_plan)),
  'credit:modification_credit', 'credit tier: intent tier credit, reason modification_credit');

select lives_ok(
  format($f$select * from public.ops_refund_intent_sent(%s, 're_ccr_cheap')$f$, (select intent_id from cheap_plan)),
  'the admin''s refund is recorded');
select is(
  (select b.refund_status || ':' || b.refunded_rappen::int from public.bookings b where b.id = (select id from fx where k = 'cheap')),
  'none:3', 'credit paid out: the live trip reads none again, the refund is kept');

-- ---------------------------------------------------------------------------
-- D. Same price: Economy -> Business at 10
-- ---------------------------------------------------------------------------
create temporary table same as select * from pg_temp.ccr_change('same', 'ccr-biz', 10, 10);
select is((select outcome from same), 'applied', 'same price: applied on confirm');
select is(
  (select vc.slug from public.booking_legs l join public.vehicle_classes vc on vc.id = l.vehicle_class_id
    where l.booking_id = (select id from fx where k = 'same')),
  'ccr-biz', 'same price: the class changes on confirm');

-- ---------------------------------------------------------------------------
-- F. Difference not paid: the Stripe page expires, the request ends, the booking is untouched
-- ---------------------------------------------------------------------------
create temporary table lapse as select * from pg_temp.ccr_change('lapse', 'ccr-biz', 13, 10);
select lives_ok(
  format($f$select public.booking_edit_request_set_extra_session(%L::uuid, 'cs_ccr_lapse')$f$, (select request_id from lapse)),
  'lapse: Stripe page stored');
create temporary table lapse_settle as
  select * from public.checkout_extra_payment_settle('evt_ccr_lapse', 'cs_ccr_lapse', null, 'failed',
                                                     'CHF', null, null, null, null);
select is((select applied from lapse_settle), false, 'lapse: nothing applied');
select is(
  (select r.status from public.booking_edit_requests r where r.id = (select request_id from lapse)),
  'superseded', 'lapse: the request ends (D4)');
select is(
  (select vc.slug from public.booking_legs l join public.vehicle_classes vc on vc.id = l.vehicle_class_id
    where l.booking_id = (select id from fx where k = 'lapse')),
  'ccr-eco', 'lapse: the booking is untouched');
create temporary table lapse_again as select * from pg_temp.ccr_change('lapse', 'ccr-biz', 13, 10);
select is((select outcome from lapse_again), 'extra_required', 'lapse: staff can start again');

-- ---------------------------------------------------------------------------
-- G. Payload reader fix: a payload passed as a JSON string
-- ---------------------------------------------------------------------------
create temporary table legacy_up as
  select * from public.booking_edit_request_upsert(
    (select id from fx where k = 'legacy'), 'staff', '26020001-0000-4000-a000-000000000001'::uuid,
    to_jsonb('{"note":"legacy note"}'::text),
    (select price_snapshot_id from public.bookings where id = (select id from fx where k = 'legacy')));
select is(
  (select jsonb_typeof(r.payload) || ':' || (r.payload ->> 'note') from public.booking_edit_requests r
    where r.id = (select request_id from legacy_up)),
  'object:legacy note', 'upsert stores a string payload as the object it holds');

select lives_ok(
  format($f$select public.booking_edit_apply_payload(%L::uuid, %s, to_jsonb('{"vehicle_class_slug":"ccr-biz"}'::text),
           '26020001-0000-4000-a000-000000000001'::uuid, 'staff', 'CCR Admin')$f$,
         (select id from fx where k = 'legacy'),
         (select price_snapshot_id from public.bookings where id = (select id from fx where k = 'legacy'))),
  'apply takes a string payload');
select is(
  (select vc.slug from public.booking_legs l join public.vehicle_classes vc on vc.id = l.vehicle_class_id
    where l.booking_id = (select id from fx where k = 'legacy')),
  'ccr-biz', 'apply reads the class out of a legacy string payload');
select throws_ok(
  format($f$select public.booking_edit_apply_payload(%L::uuid, %s, '{"vehicle_class_slug":"ccr-nope"}'::jsonb,
           null, 'staff', '')$f$,
         (select id from fx where k = 'legacy'),
         (select price_snapshot_id from public.bookings where id = (select id from fx where k = 'legacy'))),
  'P0001', 'unknown-class', 'apply refuses an unknown class instead of keeping the old one silently');
select throws_ok(
  format($f$select * from public.booking_edit_request_upsert(%L::uuid, 'customer', null, '{"vehicle_class_slug":"ccr-biz"}'::jsonb, %s)$f$,
         (select id from fx where k = 'legacy'),
         (select price_snapshot_id from public.bookings where id = (select id from fx where k = 'legacy'))),
  'P0001', 'class-change-staff-only', 'a customer request cannot carry a class');

select * from finish();
rollback;
