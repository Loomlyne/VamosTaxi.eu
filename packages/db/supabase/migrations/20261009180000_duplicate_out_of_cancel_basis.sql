-- 20261009180000_duplicate_out_of_cancel_basis.sql
--
-- Integration of the 2026-10-09 payments chains. 20261009110000 (J3, W5-09) left a duplicate
-- charge out of app.booking_paid_net and out of compute_cancellation_refund's basis: that charge
-- is refunded to its payer by checkout_duplicate_refund_record, and a cancel must not owe it as
-- well. 20261009140000 replaced compute_cancellation_refund from the pre-J3 body (plus the
-- published free_cancel_hours window and real elapsed hours) and dropped the exclusion.
-- 20261009150000 replaced app.booking_paid_net to skip reversed refunds and dropped it too.
-- A later CREATE OR REPLACE is the definition that runs, so without this file a cancel of a
-- booking that also has a duplicate charge owes both amounts.
--
-- This file is those two J7 bodies with the exclusion put back. Nothing else changes: the window
-- is still free_cancel_hours, the hours are still app.refund_hours_before, and a reversed refund
-- still does not reduce the paid net. Same grants. No data change. One transaction.
-- Apply after 20261009170000.
begin;

create or replace function public.compute_cancellation_refund(p_booking_id pg_catalog.uuid)
returns table (
  refund_mode pg_catalog.text,
  refund_rappen public.rappen,
  basis_rappen public.rappen,
  hours_before pg_catalog.numeric,
  refund_percent pg_catalog.numeric
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_original pg_catalog.timestamptz;
  v_hours pg_catalog.numeric(8,2);
  v_window pg_catalog.numeric;
  v_basis public.rappen;
  v_mode pg_catalog.text;
begin
  select pg_catalog.min(l.original_scheduled_at)
    into v_original
    from public.booking_legs as l
   where l.booking_id = p_booking_id;

  if v_original is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  -- W6-03 / D-26: the clock runs from the ORIGINAL pickup. W6-02: real elapsed time.
  v_hours := app.refund_hours_before(v_original, pg_catalog.now());

  -- W6-01: the window the booking was sold under (24 when unknown).
  v_window := app.refund_free_window_hours(p_booking_id);

  select coalesce(pg_catalog.sum(p.charged_rappen), 0)::pg_catalog.int4
    into v_basis
    from public.booking_payments as p
   where p.booking_id = p_booking_id
     and p.captured_at is not null
     -- 20261009110000 (W5-09), restored here: a duplicate charge is refunded to its payer by
     -- checkout_duplicate_refund_record and is never part of what the booking owes on a cancel.
     and p.status is distinct from 'duplicate';

  if v_basis is null then
    v_basis := 0;
  end if;

  v_mode := case
    when v_hours > v_window then 'auto_full'   -- D-23, window = published free_cancel_hours
    when v_basis > 0 then 'pending_ops'        -- D-24: inside the window, inside 6 h, after pickup
    else 'none'                                -- nothing captured, nothing to review
  end;

  refund_mode := v_mode;
  basis_rappen := v_basis;
  hours_before := v_hours;
  if v_mode = 'auto_full' then
    refund_rappen := v_basis;
    refund_percent := 100;
  elsif v_mode = 'pending_ops' then
    -- D-24: the admin sets the percentage; nothing is owed until then.
    refund_rappen := null;
    refund_percent := null;
  else
    refund_rappen := 0;
    refund_percent := 0;
  end if;
  return next;
end;
$$;

revoke all on function public.compute_cancellation_refund(pg_catalog.uuid) from public;
grant execute on function public.compute_cancellation_refund(pg_catalog.uuid) to vamos_system, postgres;

comment on function public.compute_cancellation_refund(pg_catalog.uuid) is
  'J7 (26.1-17 D-23/D-24, W6-01/02/03) plus J3 W5-09 restored by 20261009180000: hours = real elapsed time from now to the earliest original_scheduled_at (D-26, timestamptz, DST-safe). auto_full when hours exceed the free_cancel_hours the booking was sold under (first price snapshot policy; 24 when unknown) at 100 % of captured charged_rappen, excluding duplicate payments; pending_ops inside that window, inside 6 h and after pickup with refund_rappen/refund_percent null (the admin sets the percentage); none only when nothing was captured. EXECUTE vamos_system.';

create or replace function app.booking_paid_net(p_booking_id pg_catalog.uuid)
returns pg_catalog.int4
language sql
stable
security definer
set search_path = ''
as $$
  -- J7: a refund that has a reversal row does not reduce the net.
  -- J3 W5-09, restored here: a duplicate charge and the refund of that charge are not part of
  -- what the booking itself has paid.
  select (
    coalesce((select pg_catalog.sum(p.charged_rappen)
                from public.booking_payments as p
               where p.booking_id = p_booking_id
                 and p.captured_at is not null
                 and p.status is distinct from 'duplicate'), 0)
    - coalesce((select pg_catalog.sum(r.refund_rappen)
                  from public.booking_refunds as r
                 where r.booking_id = p_booking_id
                   and not exists (select 1 from public.booking_refund_reversals as x where x.refund_id = r.id)
                   and not exists (
                     select 1
                       from public.booking_payments as pd
                      where pd.id = r.payment_id
                        and pd.status = 'duplicate'
                   )), 0)
  )::pg_catalog.int4
$$;

revoke all on function app.booking_paid_net(pg_catalog.uuid) from public;

comment on function app.booking_paid_net(pg_catalog.uuid) is
  '26.2 P1 + J7, with J3 W5-09 restored by 20261009180000: sum of captured charged_rappen minus sum of booking_refunds.refund_rappen for one booking. Duplicate payments and their refunds are left out. A refund with a reversal row does not count. No grant.';

commit;
