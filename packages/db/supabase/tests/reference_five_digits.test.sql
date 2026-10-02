-- reference_five_digits.test.sql
--
-- 26.2 audit, migration 20261007220000: the yearly serial is padded to 4 digits and never cut,
-- so serial 10000 is VT-YY-10000 (not booking 1,000's VT-YY-1000). Run as `postgres`, which owns
-- the function; the counter row is changed inside this transaction only and rolled back.
begin;
select plan(5);

create temporary table ref5 (id int generated always as identity primary key, ref text);

update public.booking_reference_counters
   set last_serial = 9998
 where year_2 = (extract(year from (now() at time zone 'Europe/Zurich'))::int % 100);
insert into public.booking_reference_counters (year_2, last_serial)
select (extract(year from (now() at time zone 'Europe/Zurich'))::int % 100), 9998
where not exists (
  select 1 from public.booking_reference_counters
   where year_2 = (extract(year from (now() at time zone 'Europe/Zurich'))::int % 100)
);

insert into ref5 (ref) select public.next_booking_reference();
insert into ref5 (ref) select public.next_booking_reference();

select is(
  (select substring(ref from 7) from ref5 where id = 1), '9999',
  'serial 9999 keeps four digits'
);
select is(
  (select substring(ref from 7) from ref5 where id = 2), '10000',
  'serial 10000 is five digits, not cut to 1000'
);
select matches(
  (select ref from ref5 where id = 2), '^VT-[0-9]{2}-[0-9]{4,5}$',
  'the five-digit reference passes the bookings.reference shape'
);
select function_privs_are(
  'public', 'next_booking_reference', array[]::text[], 'vamos_staff', array['EXECUTE'],
  'vamos_staff still executes next_booking_reference()'
);
select function_privs_are(
  'public', 'next_booking_reference', array[]::text[], 'authenticated', array[]::text[],
  'authenticated still cannot execute next_booking_reference()'
);

select * from finish();
rollback;
