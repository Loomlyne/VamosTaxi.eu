-- 20261012230000_notification_kinds.sql
--
-- Fix notification kinds (found by the Phase 31 thread 2026-10-13, checked on live). The mail ledger's
-- booking_notifications_kind_check allowed confirmation, reminder_24h, assignment, cancellation, refund,
-- review_request and manage_link_resend. notification_claim inserts the kind it is given, so the
-- lifecycle mails the code sends under other kinds raised 23514 at the claim and never went out:
--
--   time_change  (edit-request.ts notifyTimeChangeOutcome)  -> allowed here
--   flight_no    (edit-request.ts writeCustomerFlightNo)    -> allowed here
--   assignment_customer (assign.ts)  -> not allowed: the code now claims the existing kind 'assignment'
--                                       (unused until now; chauffeur mails never use the ledger, so
--                                       'assignment' is the customer's driver-assigned notice)
--   refund_failed -> not allowed: no caller; the dead notifier is removed from the code
--
-- The constraint is read from the database and the two kinds appended only when missing (same pattern
-- as 20261012160000 (2)), so another migration's kinds are never dropped and a second run changes
-- nothing. One DO block: all of it or none of it. No rows are touched; existing rows all pass.

do $$
declare
  v_def pg_catalog.text;
  v_new pg_catalog.text;
  v_kind pg_catalog.text;
begin
  select pg_catalog.pg_get_constraintdef(c.oid)
    into v_def
    from pg_catalog.pg_constraint as c
   where c.conrelid = 'public.booking_notifications'::pg_catalog.regclass
     and c.conname = 'booking_notifications_kind_check';

  if v_def is null then
    raise exception 'booking_notifications_kind_check not found';
  end if;

  if v_def not like '%ARRAY[%' then
    raise exception 'booking_notifications_kind_check has an unexpected shape: %', v_def;
  end if;

  v_new := v_def;
  foreach v_kind in array array['time_change', 'flight_no'] loop
    if v_new not like '%''' || v_kind || '''%' then
      -- "CHECK ((kind = ANY (ARRAY['a'::text, ...])))": put the new kind first in the array.
      v_new := pg_catalog.replace(v_new, 'ARRAY[', 'ARRAY[''' || v_kind || '''::text, ');
    end if;
  end loop;

  if v_new <> v_def then
    execute 'alter table public.booking_notifications drop constraint booking_notifications_kind_check';
    execute 'alter table public.booking_notifications add constraint booking_notifications_kind_check ' || v_new;
  end if;
end;
$$;

comment on constraint booking_notifications_kind_check on public.booking_notifications is
  'Kinds notification_claim may write. Every kind the code claims must be listed here (20261012230000).';
