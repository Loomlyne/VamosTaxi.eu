-- reminder_24h_paid_only.test.sql
--
-- Phase 26.5 plan 11, D-18. The 24 h reminder read returns legs of PAID bookings only
-- (confirmed, assigned). pending, paid and quote are out; grants and definer settings are
-- unchanged. Synthetic rows, rolled back.
begin;
select plan(11);

insert into public.vehicle_classes (slug, name, passenger_capacity, luggage_capacity)
values ('rpo-first', 'Paid-only class', 3, 3);

insert into public.bookings (contact_name, contact_email, status)
values ('rpo pending', 'rpo-pending@example.test', 'pending'),
       ('rpo confirmed', 'rpo-confirmed@example.test', 'confirmed'),
       ('rpo assigned', 'rpo-assigned@example.test', 'confirmed'),
       ('rpo paid', 'rpo-paid@example.test', 'confirmed'),
       ('rpo quote', 'rpo-quote@example.test', 'confirmed');

insert into public.booking_legs (booking_id, leg_seq, direction, pickup_text, dropoff_text,
                                  scheduled_at, scheduled_local, vehicle_class_id)
select b.id, 1, 'outbound', 'ZRH', 'Zurich HB', now() + interval '24 hours 30 minutes', '2030-01-01T10:00', vc.id
  from public.bookings b, public.vehicle_classes vc
 where b.contact_email like 'rpo-%@example.test' and vc.slug = 'rpo-first';

set local session_replication_role = replica;
update public.bookings set status = 'assigned' where contact_email = 'rpo-assigned@example.test';
update public.bookings set status = 'paid' where contact_email = 'rpo-paid@example.test';
update public.bookings set status = 'quote' where contact_email = 'rpo-quote@example.test';
set local session_replication_role = origin;

select function_privs_are('public','reminder_24h_candidates','{timestamptz,timestamptz}'::text[],'vamos_system','{EXECUTE}'::text[],'vamos_system has EXECUTE');
select function_privs_are('public','reminder_24h_candidates','{timestamptz,timestamptz}'::text[],'anon','{}'::text[],'anon has no EXECUTE');
select function_privs_are('public','reminder_24h_candidates','{timestamptz,timestamptz}'::text[],'authenticated','{}'::text[],'authenticated has no EXECUTE');
select ok((select prosecdef and proconfig = array['search_path=""'] from pg_proc where oid = 'public.reminder_24h_candidates(timestamptz,timestamptz)'::regprocedure),
  'still SECURITY DEFINER with an empty search_path');

set local role vamos_system;
create temporary table rpo_rows as
  select * from public.reminder_24h_candidates(now() + interval '24 hours', now() + interval '25 hours');
grant select on rpo_rows to public;
reset role;

select is((select count(*)::int from rpo_rows where contact_email like 'rpo-%@example.test'), 2, 'exactly two bookings in the window are reminded');
select is((select count(*)::int from rpo_rows where contact_email = 'rpo-pending@example.test'), 0, 'pending is not reminded');
select is((select count(*)::int from rpo_rows where contact_email = 'rpo-confirmed@example.test'), 1, 'confirmed is reminded');
select is((select count(*)::int from rpo_rows where contact_email = 'rpo-assigned@example.test'), 1, 'assigned is reminded');
select is((select count(*)::int from rpo_rows where contact_email = 'rpo-paid@example.test'), 0, 'paid (transient) is not reminded');
select is((select count(*)::int from rpo_rows where contact_email = 'rpo-quote@example.test'), 0, 'quote is not reminded');
select is((select count(*)::int from public.reminder_24h_candidates(now() + interval '48 hours', now() + interval '49 hours') where contact_email like 'rpo-%@example.test'), 0,
  'nothing outside the requested window');

select * from finish();
rollback;
