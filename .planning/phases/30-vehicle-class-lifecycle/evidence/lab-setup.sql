-- Phase 30 test brief setup. Lab p30 ONLY: refuses to run on anything but a throwaway lab stack. Never live.
-- Safe to run twice: every insert skips rows it already made.
-- Adds: class "Lab old class" (slug lab-old, retired at the end), one chauffeur each in economy, business
-- and lab-old, and two paid upcoming trips with no chauffeur (one in business, one in lab-old).
-- Amounts are 1-rappen stand-ins, never a Vamos price. Pattern copied from
-- packages/db/supabase/tests/assign_retired_class.test.sql.
begin;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'vamos_throwaway_test_stack') then
    raise exception 'p30 lab setup: not a throwaway lab stack, nothing done';
  end if;
end $$;

insert into public.vehicle_classes (slug, name, passenger_capacity, luggage_capacity, active)
select 'lab-old', 'Lab old class', 3, 3, true
 where not exists (select 1 from public.vehicle_classes where slug = 'lab-old');

insert into public.chauffeurs (full_name, phone, email, licence_number, vehicle_class_id, plate)
select v.full_name, v.phone, v.email, v.lic, vc.id, v.plate
  from (values ('Lab Eco Driver', '+41 79 840 00 01', 'lab-eco@example.test', 'LIC-P30-1', 'economy',  'ZH 840 001'),
               ('Lab Biz Driver', '+41 79 840 00 02', 'lab-biz@example.test', 'LIC-P30-2', 'business', 'ZH 840 002'),
               ('Lab Old Driver', '+41 79 840 00 03', 'lab-old@example.test', 'LIC-P30-3', 'lab-old',  'ZH 840 003'))
       as v (full_name, phone, email, lic, cls, plate)
  join public.vehicle_classes vc on vc.slug = v.cls
 where not exists (select 1 from public.chauffeurs c where c.licence_number = v.lic);

insert into public.bookings (reference, contact_name, contact_email, status, locale)
select public.next_booking_reference(), v.name, v.email, 'confirmed', 'en'
  from (values ('P30 Biz Rider', 'p30-biz@example.test'),
               ('P30 Old Rider', 'p30-old@example.test')) as v (name, email)
 where not exists (select 1 from public.bookings b where b.contact_email = v.email);

insert into public.booking_legs (
  booking_id, leg_seq, direction, pickup_text, dropoff_text,
  scheduled_at, scheduled_local, vehicle_class_id, estimated_duration_minutes, pax, bags
)
select b.id, 1, 'outbound', 'Zurich Airport', 'Zug',
       now() + make_interval(days => v.days), to_char(now() + make_interval(days => v.days), 'YYYY-MM-DD"T"HH24:MI'),
       vc.id, 45, 2, 1
  from (values ('p30-biz@example.test', 'business', 5),
               ('p30-old@example.test', 'lab-old',  6)) as v (email, cls, days)
  join public.bookings b on b.contact_email = v.email
  join public.vehicle_classes vc on vc.slug = v.cls
 where not exists (select 1 from public.booking_legs l where l.booking_id = b.id);

set local session_replication_role = replica;
with need as (
  select b.id as booking_id, l.vehicle_class_id
    from public.bookings b
    join public.booking_legs l on l.booking_id = b.id
   where b.contact_email in ('p30-biz@example.test', 'p30-old@example.test')
     and not exists (select 1 from public.booking_payments p where p.booking_id = b.id)
), snap as (
  insert into public.price_snapshots (
    quote_id, vehicle_class_id, rate_version_id, rate_version_is_live, settings_version_id,
    engine_version, pax, bags, lines, policy,
    subtotal_rappen, surcharges_rappen, discount_rappen, total_rappen,
    expires_at, quote_lock_expires_at
  )
  select gen_random_uuid(), n.vehicle_class_id, rv.id, false, sv.id, 'quote-engine@p30-lab', 2, 1, '[]'::jsonb,
         jsonb_build_object('cancellation_tiers', '[]'::jsonb, 'free_cancel_hours', 24,
                            'airport_waiting_minutes', 60, 'city_waiting_minutes', 15,
                            'settings_version_id', sv.id, 'modification_deadline_hours', 24,
                            'min_advance_minutes', 180, 'policy_doc', 'lab'),
         1, 0, 0, 1, now() + interval '1 day', now() + interval '1 day'
    from need n
    cross join lateral (select id from public.rate_versions order by id limit 1) rv
    cross join lateral (select id from public.settings_versions order by id limit 1) sv
  returning id, vehicle_class_id
)
insert into public.booking_payments (booking_id, snapshot_id, stripe_payment_intent_id, charged_rappen, status, captured_at)
select n.booking_id, s.id, 'pi_p30_lab_' || left(n.booking_id::text, 8), 1, 'succeeded', now()
  from need n
  join snap s on s.vehicle_class_id = n.vehicle_class_id;
set local session_replication_role = origin;

update public.vehicle_classes
   set active = false, hidden_at = now(), hidden_reason = 'Lab: retired before the run'
 where slug = 'lab-old' and hidden_at is null;

commit;

-- Read-back (the tester pastes this output into the run):
select slug, name, active, hidden_at is not null as retired, passenger_capacity, luggage_capacity
  from public.vehicle_classes order by sort_order, slug;
select b.reference, b.contact_email, vc.slug as class, l.assigned_chauffeur_id is null as no_chauffeur, p.status as payment
  from public.bookings b
  join public.booking_legs l on l.booking_id = b.id
  join public.vehicle_classes vc on vc.id = l.vehicle_class_id
  left join public.booking_payments p on p.booking_id = b.id
 where b.contact_email like 'p30-%@example.test';
select count(*) filter (where vc.active and vc.hidden_at is null) as with_live_class, count(*) as total
  from public.chauffeurs c
  left join public.vehicle_classes vc on vc.id = c.vehicle_class_id
 where c.deleted_at is null;
