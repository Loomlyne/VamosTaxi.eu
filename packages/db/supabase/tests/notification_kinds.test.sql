-- notification_kinds.test.sql
--
-- 20261012230000: every kind the code claims through notification_claim is allowed by
-- booking_notifications_kind_check, and the two names the code no longer sends stay refused.
-- Code kinds: confirmation (checkout/notify.ts), and from lifecycle/notify-lifecycle.ts:
-- cancellation, reminder_24h, assignment, time_change, flight_no, review_request.
-- Phase 31 claims 'refund' through its own function; it is checked here too.
begin;
select plan(13);

insert into public.vehicle_classes (slug, passenger_capacity, luggage_capacity)
values ('nk-first', 3, 3);

insert into public.bookings (contact_name, contact_email)
values ('Notification Kinds Booking', 'nk-booking@example.test');

insert into public.booking_legs (booking_id, leg_seq, direction, pickup_text, dropoff_text,
                                  scheduled_at, scheduled_local, vehicle_class_id)
select b.id, 1, 'outbound', 'ZRH', 'Zurich HB', now() + interval '3 days',
       to_char(now() + interval '3 days', 'YYYY-MM-DD"T"HH24:MI'), vc.id
  from public.bookings b, public.vehicle_classes vc
 where b.contact_email = 'nk-booking@example.test' and vc.slug = 'nk-first';

create temporary table nk as
select b.id as booking_id, l.id as leg_id
  from public.bookings b
  join public.booking_legs l on l.booking_id = b.id
 where b.contact_email = 'nk-booking@example.test';
grant select on nk to public;

set local role vamos_system;

-- (1-8) each kind the code sends can be claimed (leg kinds carry the leg, as the code does).
select ok(public.notification_claim((select booking_id from nk), k.kind,
            case when k.with_leg then (select leg_id from nk) end,
            'email', 'en', 'nk_test@2026-10-12-1') is not null,
          'notification_claim accepts kind ' || k.kind)
  from (values ('confirmation', false), ('cancellation', false), ('reminder_24h', true),
               ('assignment', false), ('time_change', true), ('flight_no', false),
               ('review_request', false), ('refund', false)) as k(kind, with_leg);

-- (9-10) the names the code used to send are still refused.
select throws_ok(
  $$ select public.notification_claim((select booking_id from nk), 'assignment_customer', null,
       'email', 'en', 'assignment_customer@2026-09-12-1') $$,
  '23514', null, 'assignment_customer stays refused (the code claims assignment)');
select throws_ok(
  $$ select public.notification_claim((select booking_id from nk), 'refund_failed', null,
       'email', 'en', 'refund_failed@2026-09-12-1') $$,
  '23514', null, 'refund_failed stays refused (no caller)');

-- (11) a second claim of the same kind and leg is still a no-op.
select is(public.notification_claim((select booking_id from nk), 'time_change', (select leg_id from nk),
            'email', 'en', 'time_change@2026-09-12-1'), null,
          'time_change: second claim on the same leg returns NULL');

reset role;

-- (12) the constraint holds exactly the seven earlier kinds plus the two added.
select is(
  (select array_agg(k order by k)
     from regexp_matches(pg_get_constraintdef(c.oid), '''([a-z_0-9]+)''', 'g') as m(a),
          lateral (select m.a[1] as k) x),
  array['assignment','cancellation','confirmation','flight_no','manage_link_resend','refund',
        'reminder_24h','review_request','time_change']::text[],
  'booking_notifications_kind_check lists the nine kinds')
  from pg_constraint c
 where c.conrelid = 'public.booking_notifications'::regclass
   and c.conname = 'booking_notifications_kind_check';

-- (13) one kind check on the table, no stray copy.
select is((select count(*)::int from pg_constraint
            where conrelid = 'public.booking_notifications'::regclass
              and contype = 'c' and pg_get_constraintdef(oid) like '%kind%'), 1,
          'one kind check constraint on booking_notifications');

select * from finish();
rollback;
