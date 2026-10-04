-- 261004 ops-dash-numbers: lab-only rows shaped like live on 2026-10-04 (read-only reads, ~21:25 +04).
-- Same capture times, amounts, statuses, classes, pickups and booked times as live; names and
-- references are made up. Lab stack only (scripts/test-lab, never live, never a hosted database).
-- 16 captured payments (one an extra on a class change), 1 refund, one erased paid booking,
-- 8 unpaid cancelled, 3 unpaid pending, 1 chauffeur without a shift.
set session_replication_role = replica;

create temporary table fx (
  n int, status text, erased boolean, cap_zrh text, charged int, klass text, snap int,
  pickup_local text, created_zrh text, pay_link boolean
) on commit preserve rows;

insert into fx values
 ( 1,'cancelled', true ,'2026-09-09 18:42',10000,'business',10000,'2026-09-23T21:05','2026-09-09 18:02',false),
 ( 2,'cancelled', false,'2026-09-09 23:03',12000,'business',12000,'2026-09-10T01:30','2026-09-09 22:27',false),
 ( 3,'cancelled', false,'2026-09-09 23:45',12000,'business',12000,'2026-09-10T02:45','2026-09-09 23:43',false),
 ( 4,'completed', false,'2026-09-10 21:53',10810,'business',10810,'2026-09-11T00:55','2026-09-10 21:52',false),
 ( 5,'confirmed', false,'2026-09-28 21:23', 8776,'business', 8776,'2026-09-29T01:25','2026-09-28 21:23',false),
 ( 6,'confirmed', false,'2026-09-28 21:42', 8658,'economy', 8658,'2026-09-29T00:40','2026-09-28 21:42',false),
 ( 7,'confirmed', false,'2026-09-29 12:36', 6190,'economy', 6190,'2026-09-30T16:35','2026-09-29 12:36',false),
 ( 8,'confirmed', false,'2026-09-29 14:10',12837,'van',     12837,'2026-09-30T16:00','2026-09-29 14:05',false),
 ( 9,'confirmed', false,'2026-09-29 14:22', 2554,'economy', 2554,'2026-09-30T15:25','2026-09-29 14:22',false),
 (10,'confirmed', false,'2026-09-29 15:15', 9294,'economy', 9294,'2026-09-29T20:15','2026-09-29 15:15',false),
 (11,'cancelled', false,'2026-09-30 12:24', 3556,'economy', 3556,'2026-10-16T17:25','2026-09-30 12:24',false),
 (12,'confirmed', false,'2026-09-30 14:29', 3408,'economy', 3408,'2026-09-30T19:30','2026-09-30 14:29',false),
 (13,'confirmed', false,'2026-10-02 01:09', 9447,'van',     9447,'2026-10-05T04:10','2026-10-02 01:09',false),
 (14,'confirmed', false,'2026-10-03 19:19', 9979,'business', 9979,'2026-10-16T19:20','2026-10-03 19:19',false),
 (15,'confirmed', false,'2026-10-04 18:34',10039,'business',10039,'2026-10-15T21:35','2026-10-04 18:34',false),
 (16,'cancelled', false,null,null,'business',9000,'2026-09-11T16:50','2026-09-10 13:52',false),
 (17,'cancelled', false,null,null,'business',9000,'2026-09-11T23:35','2026-09-10 20:33',false),
 (18,'cancelled', false,null,null,'business',9000,'2026-09-11T15:35','2026-09-11 12:41',false),
 (19,'cancelled', false,null,null,'business',9000,'2026-09-23T18:45','2026-09-23 22:28',true ),
 (20,'cancelled', false,null,null,'business',9000,'2026-09-24T02:00','2026-09-23 23:03',false),
 (21,'cancelled', false,null,null,'business',9000,'2026-09-24T02:20','2026-09-23 23:16',false),
 (22,'cancelled', false,null,null,'business',9000,'2026-09-24T03:45','2026-09-24 00:43',true ),
 (23,'cancelled', false,null,null,'business',9000,'2026-09-30T01:15','2026-09-28 21:12',false),
 (24,'pending',   false,null,null,'economy', 5000,'2026-10-28T16:40','2026-10-01 10:39',false),
 (25,'pending',   false,null,null,'economy', 5000,'2026-10-02T15:05','2026-10-01 12:04',false),
 (26,'pending',   false,null,null,'economy', 5000,'2026-10-05T15:50','2026-10-02 20:47',false);

create temporary table made (n int, booking uuid, snap bigint, pay bigint) on commit preserve rows;

do $$
declare
  r record; b uuid; s bigint; p bigint; q uuid; rv bigint; sv bigint; pol jsonb;
begin
  select id into rv from public.rate_versions where status = 'live' order by id desc limit 1;
  select id into sv from public.settings_versions order by id desc limit 1;
  pol := jsonb_build_object('cancellation_tiers', '[]'::jsonb, 'free_cancel_hours', 24, 'airport_waiting_minutes', 60,
    'city_waiting_minutes', 15, 'settings_version_id', sv, 'modification_deadline_hours', 24, 'min_advance_minutes', 180, 'policy_doc', 'lab');
  for r in select * from fx order by n loop
    q := gen_random_uuid();
    insert into public.bookings (reference, contact_name, contact_email, status, locale, quote_id,
                                 created_at, erased_at, pay_link_sent_at)
    values ('VT-26-' || lpad((9000 + r.n)::text, 4, '0'), 'Lab Rider ' || r.n, 'lab-rider-' || r.n || '@example.com',
            r.status::public.booking_status, 'en', q,
            r.created_zrh::timestamp at time zone 'Europe/Zurich',
            case when r.erased then now() else null end,
            case when r.pay_link then (r.created_zrh::timestamp at time zone 'Europe/Zurich') + interval '5 minutes' else null end)
    returning id into b;
    insert into public.booking_legs (booking_id, leg_seq, direction, pickup_text, dropoff_text,
      scheduled_at, original_scheduled_at, scheduled_local, vehicle_class_id, estimated_duration_minutes, pax, bags)
    select b, 1, 'outbound', 'Zurich Airport (ZRH)', 'Zurich HB',
           r.pickup_local::timestamp at time zone 'Europe/Zurich', r.pickup_local::timestamp at time zone 'Europe/Zurich',
           r.pickup_local, vc.id, 40, 2, 2
      from public.vehicle_classes vc where vc.slug = r.klass;
    insert into public.price_snapshots (booking_id, quote_id, vehicle_class_id, rate_version_id, rate_version_is_live,
      settings_version_id, engine_version, pax, bags, lines, policy, subtotal_rappen, surcharges_rappen, discount_rappen,
      total_rappen, expires_at, quote_lock_expires_at, computed_at)
    select b, q, vc.id, rv, true, sv, 'lab-fixture', 2, 2, '[]'::jsonb, pol, r.snap, 0, 0, r.snap,
           now() + interval '1 day', now() + interval '1 day',
           r.created_zrh::timestamp at time zone 'Europe/Zurich'
      from public.vehicle_classes vc where vc.slug = r.klass
    returning id into s;
    p := null;
    if r.cap_zrh is not null then
      insert into public.booking_payments (booking_id, snapshot_id, stripe_payment_intent_id, charged_rappen, status,
                                           captured_at, created_at)
      values (b, s, 'pi_lab_dash_' || r.n, r.charged, 'succeeded',
              r.cap_zrh::timestamp at time zone 'Europe/Zurich', r.cap_zrh::timestamp at time zone 'Europe/Zurich')
      returning id into p;
    end if;
    insert into made values (r.n, b, s, p);
  end loop;
end $$;

-- Row 13: the class-change difference CHF 11.84, paid 2026-10-02 10:38 Zurich (an extra payment, as on live).
do $$
declare b uuid; s0 bigint; s1 bigint; rv bigint; sv bigint; pol jsonb;
begin
  select booking, snap into b, s0 from made where n = 13;
  select id into rv from public.rate_versions where status = 'live' order by id desc limit 1;
  select id into sv from public.settings_versions order by id desc limit 1;
  pol := jsonb_build_object('cancellation_tiers', '[]'::jsonb, 'free_cancel_hours', 24, 'airport_waiting_minutes', 60,
    'city_waiting_minutes', 15, 'settings_version_id', sv, 'modification_deadline_hours', 24, 'min_advance_minutes', 180, 'policy_doc', 'lab');
  insert into public.price_snapshots (booking_id, quote_id, vehicle_class_id, rate_version_id, rate_version_is_live,
    settings_version_id, engine_version, pax, bags, lines, policy, subtotal_rappen, surcharges_rappen, discount_rappen,
    total_rappen, expires_at, quote_lock_expires_at, computed_at)
  select b, gen_random_uuid(), vc.id, rv, true, sv, 'lab-fixture', 2, 2, '[]'::jsonb, pol, 1184, 0, 0, 1184,
         now() + interval '1 day', now() + interval '1 day', '2026-10-02 10:30'::timestamp at time zone 'Europe/Zurich'
    from public.vehicle_classes vc where vc.slug = 'van'
  returning id into s1;
  -- The booking's latest snapshot reads the whole new total, like live (10631).
  insert into public.price_snapshots (booking_id, quote_id, vehicle_class_id, rate_version_id, rate_version_is_live,
    settings_version_id, engine_version, pax, bags, lines, policy, subtotal_rappen, surcharges_rappen, discount_rappen,
    total_rappen, expires_at, quote_lock_expires_at, computed_at)
  select b, gen_random_uuid(), vc.id, rv, true, sv, 'lab-fixture', 2, 2, '[]'::jsonb, pol, 10631, 0, 0, 10631,
         now() + interval '1 day', now() + interval '1 day', '2026-10-02 10:31'::timestamp at time zone 'Europe/Zurich'
    from public.vehicle_classes vc where vc.slug = 'van';
  insert into public.booking_edit_requests (booking_id, actor, payload, quote_snapshot_id, extra_snapshot_id, status, created_at, accepted_at)
  values (b, 'customer', '{}'::jsonb, s1, s1, 'accepted',
          '2026-10-02 10:30'::timestamp at time zone 'Europe/Zurich', '2026-10-02 10:38'::timestamp at time zone 'Europe/Zurich');
  insert into public.booking_payments (booking_id, snapshot_id, stripe_payment_intent_id, charged_rappen, status, captured_at, created_at)
  values (b, s1, 'pi_lab_dash_13x', 1184, 'succeeded',
          '2026-10-02 10:38'::timestamp at time zone 'Europe/Zurich', '2026-10-02 10:38'::timestamp at time zone 'Europe/Zurich');
end $$;

-- Row 11: the one refund, CHF 35.56, decided 2026-10-02 08:36 UTC.
insert into public.booking_refunds (booking_id, snapshot_id, payment_id, reason, basis_rappen, refund_percent,
                                    refund_rappen, tier_applied, hours_before, decided_at)
select m.booking, m.snap, m.pay, 'customer_cancel', 3556, 100, 3556, '{"hours": 48, "percent": 100}'::jsonb, 48, '2026-10-02 08:36:00+00'
  from made m where m.n = 11;

-- One chauffeur, active, no shift set (live has the same).
insert into public.chauffeurs (full_name, phone, email, licence_number, vehicle_class_id, plate)
select 'Lab Driver', '+41 79 000 00 01', 'lab-driver@example.com', 'LIC-LAB-1', vc.id, 'ZH 000 001'
  from public.vehicle_classes vc where vc.slug = 'business';

set session_replication_role = origin;
select 'payments', count(*), sum(charged_rappen) from public.booking_payments where captured_at is not null;
