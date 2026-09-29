-- booking_edit_requests.test.sql
--
-- 08-07: paid-edit requests, extra difference snapshot, extra settle does not
-- rewind pending→paid→confirmed. Charge gate unchanged. EXECUTE vamos_system
-- only. Rolled back. Synthetic 1-rappen figures only — never a product CHF.
--
-- Rows share created_at inside one transaction (now()), so "latest request"
-- filters out superseded rows instead of relying on created_at order.
begin;
select plan(27);

insert into public.vehicle_classes (slug, passenger_capacity, luggage_capacity)
values ('ber-class', 4, 4);

-- The seed's only rate version is a draft (D-34), so the extra snapshot that
-- booking_edit_request_accept inserts would be frozen rate_version_is_live=false
-- and the charge gate would refuse it. Publish a fixture version instead.
insert into public.rate_versions (slug, label) values ('ber-rv', 'BER fixture');
update public.rate_versions set status = 'live' where slug = 'ber-rv';

insert into auth.users (id, email, aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values (
  'a0807000-0000-4000-8000-000000000807',
  'ber-dispatcher@vamostaxi.eu',
  'authenticated',
  'authenticated',
  '{}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
);

insert into public.staff (user_id, role, active, full_name)
values ('a0807000-0000-4000-8000-000000000807', 'dispatcher', true, 'BER Dispatcher');

insert into public.bookings (reference, contact_name, contact_email, payer_email, status, locale)
values
  (public.next_booking_reference(), 'BER Unpaid', 'ber-unpaid@vamostaxi.eu', null, 'quote', 'en'),
  (public.next_booking_reference(), 'BER Paid', 'ber-paid@vamostaxi.eu', 'ber-company@vamostaxi.eu', 'confirmed', 'de'),
  (public.next_booking_reference(), 'BER Same', 'ber-same@vamostaxi.eu', null, 'confirmed', 'en');

insert into public.booking_legs (
  booking_id, leg_seq, direction, pickup_text, dropoff_text,
  scheduled_at, scheduled_local, vehicle_class_id, estimated_duration_minutes, pax, bags
)
select b.id, 1, 'outbound', 'ZRH Airport', 'Zurich HB',
       now() + interval '48 hours', to_char(now() + interval '48 hours', 'YYYY-MM-DD"T"HH24:MI'),
       vc.id, 60, 2, 2
  from public.bookings b, public.vehicle_classes vc
 where b.contact_email in (
         'ber-unpaid@vamostaxi.eu',
         'ber-paid@vamostaxi.eu',
         'ber-same@vamostaxi.eu'
       )
   and vc.slug = 'ber-class';

set local session_replication_role = replica;

insert into public.price_snapshots (
  quote_id, vehicle_class_id, rate_version_id, rate_version_is_live, settings_version_id,
  engine_version, pax, bags, lines, policy,
  subtotal_rappen, surcharges_rappen, discount_rappen, total_rappen,
  expires_at, quote_lock_expires_at, booking_id, source
)
select
  gen_random_uuid(),
  vc.id,
  rv.id,
  true,
  sv.id,
  'quote-engine@08-07',
  2, 2,
  jsonb_build_array(jsonb_build_object('seq', 1, 'code', 'distance_fare', 'kind', 'fare', 'i18n_key', 'price.line.transfer', 'amount_rappen', 8)),
  -- eight-key policy: price_snapshots_policy_shape (20260825000003)
  jsonb_build_object('cancellation_tiers', '[]'::jsonb, 'free_cancel_hours', 24,
                     'airport_waiting_minutes', 60, 'city_waiting_minutes', 15,
                     'settings_version_id', sv.id, 'modification_deadline_hours', 24,
                     'min_advance_minutes', 180, 'policy_doc', 'test'),
  8, 0, 0, 8,
  now() + interval '1 day',
  now() + interval '1 day',
  b.id,
  'web'
from public.vehicle_classes vc
cross join public.bookings b
cross join lateral (select id from public.rate_versions where slug = 'ber-rv') rv
cross join lateral (select id from public.settings_versions order by id limit 1) sv
where vc.slug = 'ber-class'
  and b.contact_email in ('ber-paid@vamostaxi.eu', 'ber-same@vamostaxi.eu');

update public.bookings b
   set price_snapshot_id = s.id
  from public.price_snapshots s
 where s.booking_id = b.id
   and s.engine_version = 'quote-engine@08-07';

insert into public.booking_payments (
  booking_id, snapshot_id, stripe_payment_intent_id, charged_rappen, status, captured_at
)
select b.id, b.price_snapshot_id, 'pi_ber_' || b.contact_email, 8, 'succeeded', now()
  from public.bookings b
 where b.contact_email in ('ber-paid@vamostaxi.eu', 'ber-same@vamostaxi.eu');

insert into public.price_snapshots (
  quote_id, vehicle_class_id, rate_version_id, rate_version_is_live, settings_version_id,
  engine_version, pax, bags, lines, policy,
  subtotal_rappen, surcharges_rappen, discount_rappen, total_rappen,
  expires_at, quote_lock_expires_at, booking_id, source
)
select
  gen_random_uuid(),
  vc.id,
  rv.id,
  true,
  sv.id,
  'quote-engine@08-07-new',
  2, 2,
  jsonb_build_array(jsonb_build_object('seq', 1, 'code', 'distance_fare', 'kind', 'fare', 'i18n_key', 'price.line.transfer', 'amount_rappen', 11)),
  -- eight-key policy: price_snapshots_policy_shape (20260825000003)
  jsonb_build_object('cancellation_tiers', '[]'::jsonb, 'free_cancel_hours', 24,
                     'airport_waiting_minutes', 60, 'city_waiting_minutes', 15,
                     'settings_version_id', sv.id, 'modification_deadline_hours', 24,
                     'min_advance_minutes', 180, 'policy_doc', 'test'),
  11, 0, 0, 11,
  now() + interval '1 day',
  now() + interval '1 day',
  b.id,
  'modification'
from public.vehicle_classes vc
cross join public.bookings b
cross join lateral (select id from public.rate_versions where slug = 'ber-rv') rv
cross join lateral (select id from public.settings_versions order by id limit 1) sv
where vc.slug = 'ber-class'
  and b.contact_email = 'ber-paid@vamostaxi.eu';

set local session_replication_role = origin;

create temporary table fx as
select
  (select id from public.bookings where contact_email = 'ber-unpaid@vamostaxi.eu') as unpaid,
  (select id from public.bookings where contact_email = 'ber-paid@vamostaxi.eu') as paid,
  (select id from public.bookings where contact_email = 'ber-same@vamostaxi.eu') as same_price,
  (select price_snapshot_id from public.bookings where contact_email = 'ber-same@vamostaxi.eu') as same_snap,
  (select id from public.price_snapshots where engine_version = 'quote-engine@08-07-new' limit 1) as new_snap,
  'a0807000-0000-4000-8000-000000000807'::uuid as actor;

select has_table('public', 'booking_edit_requests', 'booking_edit_requests exists');
select ok(
  (select c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'booking_edit_requests'),
  'RLS enabled on booking_edit_requests'
);

select table_privs_are('public', 'booking_edit_requests', 'anon', '{}'::text[], 'anon has no table grants');
select table_privs_are('public', 'booking_edit_requests', 'authenticated', '{}'::text[], 'authenticated has no table grants');
select table_privs_are('public', 'booking_edit_requests', 'vamos_staff', array['SELECT']::text[], 'vamos_staff holds SELECT');

select function_privs_are(
  'public', 'booking_edit_request_accept', '{uuid,uuid}'::text[], 'anon', '{}'::text[],
  'accept: anon holds no EXECUTE'
);
select function_privs_are(
  'public', 'booking_edit_request_accept', '{uuid,uuid}'::text[], 'authenticated', '{}'::text[],
  'accept: authenticated holds no EXECUTE'
);
select function_privs_are(
  'public', 'booking_edit_request_accept', '{uuid,uuid}'::text[], 'vamos_staff', '{}'::text[],
  'accept: vamos_staff holds no EXECUTE'
);
select function_privs_are(
  'public', 'booking_edit_request_accept', '{uuid,uuid}'::text[], 'vamos_system', '{EXECUTE}'::text[],
  'accept: vamos_system holds EXECUTE'
);

select function_privs_are(
  'public', 'checkout_extra_payment_settle',
  '{text,text,text,text,text,numeric,text,timestamptz,int8}'::text[],
  'anon', '{}'::text[],
  'extra settle: anon holds no EXECUTE'
);
select function_privs_are(
  'public', 'checkout_extra_payment_settle',
  '{text,text,text,text,text,numeric,text,timestamptz,int8}'::text[],
  'vamos_system', '{EXECUTE}'::text[],
  'extra settle: vamos_system holds EXECUTE'
);

select has_function('public', 'tg_payment_matches_snapshot', 'charge gate trigger function is unchanged');
select has_index(
  'public', 'booking_payments', 'booking_payments_one_success_per_snapshot',
  'one succeeded payment per snapshot'
);

select throws_ok(
  format(
    $f$select * from public.booking_edit_request_upsert(%L::uuid, 'staff', %L::uuid, '{}'::jsonb, 1)$f$,
    (select unpaid from fx), (select actor from fx)
  ),
  'P0001',
  'unpaid',
  'unpaid upsert refused'
);

select lives_ok(
  format(
    $f$select * from public.booking_edit_request_upsert(%L::uuid, 'staff', %L::uuid, '{"note":"n"}'::jsonb, %s)$f$,
    (select paid from fx), (select actor from fx), (select new_snap from fx)
  ),
  'paid higher-fare upsert'
);

select lives_ok(
  format(
    $f$select * from public.booking_edit_request_upsert(%L::uuid, 'staff', %L::uuid, '{"note":"n2"}'::jsonb, %s)$f$,
    (select paid from fx), (select actor from fx), (select new_snap from fx)
  ),
  'second upsert supersedes requested row'
);

select is(
  (select count(*)::int from public.booking_edit_requests
    where booking_id = (select paid from fx) and status = 'requested'),
  1,
  'one requested row after merge'
);

select lives_ok(
  format(
    $f$select * from public.booking_edit_request_accept(
      (select id from public.booking_edit_requests where booking_id = %L::uuid and status = 'requested' limit 1),
      %L::uuid
    )$f$,
    (select paid from fx), (select actor from fx)
  ),
  'accept higher fare → extra_required'
);

select is(
  (select extra.total_rappen::int from public.booking_edit_requests r
     join public.price_snapshots extra on extra.id = r.extra_snapshot_id
    where r.booking_id = (select paid from fx) and r.status <> 'superseded'
    order by r.created_at desc limit 1),
  3,
  'extra snapshot total_rappen is the difference (11-8)'
);

select is(
  (select outcome from public.booking_edit_request_accept(
     (select id from public.booking_edit_requests where booking_id = (select paid from fx) and status <> 'superseded' order by created_at desc limit 1),
     (select actor from fx)
   ) limit 1),
  'extra_required',
  're-accept still extra_required until captured'
);

select lives_ok(
  format(
    $f$select public.booking_edit_request_set_extra_session(
      (select id from public.booking_edit_requests where booking_id = %L::uuid and status <> 'superseded' order by created_at desc limit 1),
      'cs_ber_extra'
    )$f$,
    (select paid from fx)
  ),
  'set extra session'
);

select throws_ok(
  $$select * from public.checkout_extra_payment_settle(
      'evt_ber_blank', '', 'pi_ber_blank', 'succeeded', 'CHF', null, null, null, null
    )$$,
  'P0002',
  'payment_not_found',
  'blank extra session refused'
);

select lives_ok(
  $$select * from public.checkout_extra_payment_settle(
      'evt_ber_extra', 'cs_ber_extra', 'pi_ber_extra', 'succeeded', 'CHF', null, null, null, null
    )$$,
  'extra settle succeeds'
);

select is(
  (select status::text from public.bookings where id = (select paid from fx)),
  'confirmed',
  'extra settle does not rewind pending→paid→confirmed'
);

select ok(
  exists (
    select 1 from public.booking_payments p
    join public.booking_edit_requests r on r.extra_snapshot_id = p.snapshot_id
    where r.booking_id = (select paid from fx)
      and p.status = 'succeeded'
      and p.charged_rappen = 3
  ),
  'extra payment is against the difference snapshot'
);

select lives_ok(
  format(
    $f$select * from public.booking_edit_request_upsert(%L::uuid, 'staff', %L::uuid, '{"note":"same"}'::jsonb, %s)$f$,
    (select same_price from fx), (select actor from fx), (select same_snap from fx)
  ),
  'same-price upsert'
);

select is(
  (select outcome from public.booking_edit_request_accept(
     (select id from public.booking_edit_requests where booking_id = (select same_price from fx) and status = 'requested' limit 1),
     (select actor from fx)
   ) limit 1),
  'applied',
  'same-price accept applies with no extra pay'
);

select * from finish();
rollback;
