-- 20261007220000_booking_reference_five_digits.sql
--
-- 26.2 audit (U05-U07, outside scope): `lpad(n::text, 4, '0')` CUTS a longer string down to 4
-- characters. The function allows n up to 99999 and the column check allows VT-YY-#### or
-- VT-YY-#####, but the 10,000th booking of a year got 'VT-26-1000' — booking 1,000's reference —
-- and its insert failed on the unique key. The serial is now padded to at least 4 digits and
-- never cut. Shape, counter, error and grants are unchanged (create or replace keeps the ACL:
-- postgres, service_role, vamos_staff). Live serial when written: 750 (2026-10-02).
create or replace function public.next_booking_reference() returns text
language plpgsql security definer set search_path = '' as $$
declare
  y smallint := (extract(year from (now() at time zone 'Europe/Zurich'))::int % 100);
  n integer;
begin
  insert into public.booking_reference_counters (year_2, last_serial)
  values (y, 1)
  on conflict (year_2) do update set last_serial = public.booking_reference_counters.last_serial + 1
  returning last_serial into n;

  if n > 99999 then
    raise exception 'booking reference space exhausted for year %', y
      using errcode = 'restrict_violation',
            hint = 'ADR-003 allows a wider serial within a year without changing the shape.';
  end if;
  return format('VT-%s-%s', lpad(y::text, 2, '0'), lpad(n::text, greatest(4, length(n::text)), '0'));
end $$;
