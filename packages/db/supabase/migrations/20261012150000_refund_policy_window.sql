-- 20261012150000_refund_policy_window.sql
--
-- J7 (payments review 2026-10-09), findings W6-01, W6-02, W6-03.
--
-- W6-01  compute_cancellation_refund read the literal 24 for the full-refund window. The owner can publish
--        another `free_cancel_hours` in Settings and the customer pages print that value, so a customer was
--        promised one window and refunded under another. The window now comes from the `free_cancel_hours`
--        of the settings version the customer bought under: the policy copied into the booking's FIRST
--        price snapshot (price_snapshots.policy, written at checkout, never updated). A later re-price
--        (class or trip change) inserts a newer snapshot under whatever policy is live then; it does not
--        move the promise made at purchase. A booking with no snapshot, or a snapshot whose value is not
--        a number, keeps 24 (the value the function used before), so a published 24 behaves exactly as
--        before. Signed decision 2026-10-09: the refund window follows the published setting.
--
-- W6-02  hours_before was computed from two `AT TIME ZONE 'Europe/Zurich'` values, which are timestamps
--        WITHOUT time zone: wall-clock arithmetic, wrong by one hour across a DST change (Sun 2026-10-25
--        clocks back: a cancel Sat 10:00 for Sun 10:00 pickup has 25 real hours but read 24.00 and went
--        to pending_ops; in spring the error ran the other way). It is now timestamptz minus timestamptz
--        (real elapsed time); the zone adds nothing and is gone. The arithmetic is its own immutable
--        function, app.refund_hours_before(pickup, now), so a test can give it both instants.
--
-- W6-03  Which pickup time starts the window? Decision D-26 (phase 09, owner) says the clock "stays on the
--        original pickup even after a confirmed shift"; the cancellation page says "Measured from the
--        pickup time in your confirmation, not from the time you booked", which does not name a moved
--        pickup either way. The published copy does not contradict D-26, so the rule is KEPT:
--        min(booking_legs.original_scheduled_at). Nothing changes here for W6-03 beyond this comment.
--
-- Same signature and return type as 20260928150000. Revoke, grant and comment restated. One transaction.
begin;

-- ---------------------------------------------------------------------------
-- (1) app.refund_hours_before: real hours from p_now until the pickup (negative after it), 2 decimals.
-- ---------------------------------------------------------------------------
create function app.refund_hours_before(
  p_pickup pg_catalog.timestamptz,
  p_now pg_catalog.timestamptz
)
returns pg_catalog.numeric
language sql
immutable
set search_path = ''
as $$
  select pg_catalog.round(
    (pg_catalog.date_part('epoch', p_pickup - p_now) / 3600)::pg_catalog.numeric,
    2
  )
$$;

revoke all on function app.refund_hours_before(pg_catalog.timestamptz, pg_catalog.timestamptz) from public;

comment on function app.refund_hours_before(pg_catalog.timestamptz, pg_catalog.timestamptz) is
  'J7 W6-02: real elapsed hours from p_now to p_pickup (timestamptz minus timestamptz, so a DST change counts as it happened). Negative after pickup. No grant.';

-- ---------------------------------------------------------------------------
-- (2) app.refund_free_window_hours: the full-refund window a booking was sold under.
-- ---------------------------------------------------------------------------
create function app.refund_free_window_hours(p_booking_id pg_catalog.uuid)
returns pg_catalog.numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select case
               when pg_catalog.jsonb_typeof(s.policy -> 'free_cancel_hours') = 'number'
               then greatest((s.policy ->> 'free_cancel_hours')::pg_catalog.numeric, 0)
             end
        from public.price_snapshots as s
       where s.booking_id = p_booking_id
       order by s.id
       limit 1
    ),
    24
  )
$$;

revoke all on function app.refund_free_window_hours(pg_catalog.uuid) from public;

comment on function app.refund_free_window_hours(pg_catalog.uuid) is
  'J7 W6-01: free_cancel_hours of the first price snapshot of the booking (the policy it was sold under); 24 when there is no snapshot or the value is not a number. No grant.';

-- ---------------------------------------------------------------------------
-- (3) compute_cancellation_refund v3. Body of 20260928150000 with the two changes above.
-- ---------------------------------------------------------------------------
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
     and p.captured_at is not null;

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
  'J7 (26.1-17 D-23/D-24, W6-01/02/03): hours = real elapsed time from now to the earliest original_scheduled_at (D-26, timestamptz, DST-safe). auto_full when hours exceed the free_cancel_hours the booking was sold under (first price snapshot policy; 24 when unknown) at 100 % of captured charged_rappen; pending_ops inside that window, inside 6 h and after pickup with refund_rappen/refund_percent null (the admin sets the percentage); none only when nothing was captured. EXECUTE vamos_system.';

commit;
