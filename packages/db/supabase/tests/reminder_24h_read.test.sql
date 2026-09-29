-- reminder_24h_read.test.sql
--
-- Quick 260929-pga. The 24 h reminder read runs as vamos_system through a SECURITY DEFINER
-- function; vamos_system (and vamos_edge, the login) still have NO table SELECT. Grants,
-- window, status and erase filters, returned columns. Synthetic rows, rolled back.
begin;
select plan(14);

insert into public.vehicle_classes (slug, name, passenger_capacity, luggage_capacity)
values ('rem-first', 'Reminder class', 3, 3);

insert into public.bookings (contact_name, contact_email, status)
values ('rem in window', 'rem-in@example.test', 'confirmed'),
       ('rem cancelled', 'rem-cancelled@example.test', 'confirmed'),
       ('rem outside', 'rem-out@example.test', 'confirmed'),
       ('rem erased', 'rem-erased@example.test', 'confirmed');

insert into public.booking_legs (booking_id, leg_seq, direction, pickup_text, dropoff_text,
                                  scheduled_at, scheduled_local, vehicle_class_id)
select b.id, 1, 'outbound', 'ZRH', 'Zurich HB',
       case b.contact_name when 'rem outside' then now() + interval '3 days' else now() + interval '24 hours 30 minutes' end,
       '2030-01-01T10:00', vc.id
  from public.bookings b, public.vehicle_classes vc
 where b.contact_email like 'rem-%@example.test' and vc.slug = 'rem-first';

set local session_replication_role = replica;
update public.bookings set status = 'cancelled' where contact_email = 'rem-cancelled@example.test';
update public.bookings set erased_at = now() where contact_email = 'rem-erased@example.test';
set local session_replication_role = origin;

-- Grants: the role that runs the job, and nobody else --------------------------------------
select function_privs_are('public','reminder_24h_candidates','{timestamptz,timestamptz}'::text[],'vamos_system','{EXECUTE}'::text[],'reminder read: vamos_system has EXECUTE');
select function_privs_are('public','reminder_24h_candidates','{timestamptz,timestamptz}'::text[],'vamos_edge','{}'::text[],'reminder read: vamos_edge has no EXECUTE');
select function_privs_are('public','reminder_24h_candidates','{timestamptz,timestamptz}'::text[],'anon','{}'::text[],'reminder read: anon has no EXECUTE');
select function_privs_are('public','reminder_24h_candidates','{timestamptz,timestamptz}'::text[],'authenticated','{}'::text[],'reminder read: authenticated has no EXECUTE');
select function_privs_are('public','reminder_24h_candidates','{timestamptz,timestamptz}'::text[],'vamos_checkout','{}'::text[],'reminder read: vamos_checkout has no EXECUTE');
select ok(not has_table_privilege('vamos_system','public.booking_legs','select'), 'vamos_system still has no SELECT on booking_legs');
select ok(not has_table_privilege('vamos_edge','public.booking_legs','select'), 'vamos_edge still has no SELECT on booking_legs');
select ok((select prosecdef and proconfig = array['search_path=""'] from pg_proc where oid = 'public.reminder_24h_candidates(timestamptz,timestamptz)'::regprocedure),
  'reminder read is SECURITY DEFINER with an empty search_path');

-- As the job role -------------------------------------------------------------------------
set local role vamos_system;
select throws_ok($$select 1 from public.booking_legs limit 1$$, '42501', null, 'the raw table read is still refused to vamos_system');
create temporary table rem_rows as
  select * from public.reminder_24h_candidates(now() + interval '24 hours', now() + interval '25 hours');
grant select on rem_rows to public;
select is((select count(*)::int from rem_rows where contact_email like 'rem-%@example.test'), 1, 'window read: exactly the confirmed, in-window, unerased booking');
select is((select contact_email from rem_rows where contact_email like 'rem-%@example.test'), 'rem-in@example.test', 'window read: it is the in-window booking');
select is((select reference is not null and pickup_text = 'ZRH' and dropoff_text = 'Zurich HB' and scheduled_local = '2030-01-01T10:00' and assigned_chauffeur_id is null from rem_rows where contact_email = 'rem-in@example.test'),
  true, 'window read: reference, pickup, drop-off, local time; no chauffeur assigned');
select is((select count(*)::int from public.reminder_24h_candidates(now() + interval '48 hours', now() + interval '49 hours') where contact_email like 'rem-%@example.test'), 0,
  'window read: nothing outside the requested window');
reset role;
select is((select count(*)::int from rem_rows where contact_email in ('rem-cancelled@example.test','rem-erased@example.test')), 0,
  'window read: cancelled and erased bookings never returned');

select * from finish();
rollback;
