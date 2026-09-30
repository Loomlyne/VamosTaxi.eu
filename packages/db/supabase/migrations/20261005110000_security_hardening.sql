-- 20261005110000_security_hardening.sql
--
-- Phase 20 plan 20-07/20-08, findings F5, F10 and the database part of F14.
--
-- F5  customer_confirmation_read trusted the caller-supplied p_customer_id, so any signed-in
--     customer who knew a reference and another customer's id read that booking. The customer is
--     now derived from the session (auth.uid() -> customers.user_id). The two-argument signature
--     stays (type file and grants unchanged); p_customer_id is only an assertion about the caller:
--     null, the caller's own customers.id, or the caller's own auth user id (what the Worker
--     passes today, claims.sub) are accepted; any other id returns null.
-- F10 notification_confirmation_missing had no date cut-off and no test filter. Test bookings are
--     skipped and only payments captured in the last 7 days are candidates.
-- F14 staff_extra_label_upsert (20260930140000) already starts with the app.is_admin() guard
--     (errcode 42501). Nothing changes here; the pgTAP file asserts it.
--
-- Bodies are the newest definitions, changed only as listed. SECURITY DEFINER, search_path,
-- volatility and grants are as they are today.

begin;

-- ---------------------------------------------------------------------------
-- F5
-- ---------------------------------------------------------------------------
create or replace function public.customer_confirmation_read(
  p_reference pg_catalog.text,
  p_customer_id pg_catalog.uuid
)
returns pg_catalog.jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_id pg_catalog.uuid;
  v_customer pg_catalog.uuid;
begin
  -- Phase 20 F5: the customer comes from the session, never from the argument.
  v_customer := (
    select c.id
      from public.customers as c
     where c.user_id = auth.uid()
       and c.erased_at is null
  );

  if v_customer is null then
    return null;
  end if;

  if p_customer_id is not null
     and p_customer_id is distinct from v_customer
     and p_customer_id is distinct from auth.uid() then
    return null;
  end if;

  select b.id
    into v_id
    from public.bookings as b
   where b.reference = p_reference
     and b.customer_id = v_customer
   limit 1;

  if v_id is null then
    return null;
  end if;

  return public.confirmation_payload(v_id);
end;
$$;

revoke all on function public.customer_confirmation_read(pg_catalog.text, pg_catalog.uuid) from public;
revoke all on function public.customer_confirmation_read(pg_catalog.text, pg_catalog.uuid) from anon;
revoke all on function public.customer_confirmation_read(pg_catalog.text, pg_catalog.uuid) from vamos_guest;
grant execute on function public.customer_confirmation_read(pg_catalog.text, pg_catalog.uuid) to authenticated;

comment on function public.customer_confirmation_read(pg_catalog.text, pg_catalog.uuid) is
  'Confirmation page for the signed-in customer who owns the booking. The customer is derived from the session (Phase 20 F5); p_customer_id is only checked against it. authenticated EXECUTE only.';

-- ---------------------------------------------------------------------------
-- F10
-- ---------------------------------------------------------------------------
create or replace function public.notification_confirmation_missing(p_older_than pg_catalog.interval)
returns table (
  booking_id pg_catalog.uuid,
  locale pg_catalog.text
)
language sql
stable
security definer
set search_path = ''
as $$
  select b.id, b.locale
    from public.bookings as b
   where b.status in ('confirmed'::public.booking_status, 'assigned'::public.booking_status)
     and not b.is_test
     and exists (
       select 1
         from public.booking_payments as bp
        where bp.booking_id = b.id
          and bp.captured_at is not null
          and bp.captured_at < pg_catalog.now() - p_older_than
          -- Phase 20 F10: only payments captured in the last 7 days are resent.
          and bp.captured_at > pg_catalog.now() - interval '7 days'
     )
     and not exists (
       select 1
         from public.booking_notifications as n
        where n.booking_id = b.id
          and n.kind = 'confirmation'
     )
   order by b.created_at
   limit 200
$$;

revoke all on function public.notification_confirmation_missing(pg_catalog.interval) from public;
grant execute on function public.notification_confirmation_missing(pg_catalog.interval) to vamos_system;

comment on function public.notification_confirmation_missing(pg_catalog.interval) is
  '26.3-01 D-39: confirmed/assigned non-test bookings with a captured payment older than p_older_than but newer than 7 days (Phase 20 F10) and no confirmation claim row. Max 200 per call. EXECUTE: vamos_system only.';

commit;
