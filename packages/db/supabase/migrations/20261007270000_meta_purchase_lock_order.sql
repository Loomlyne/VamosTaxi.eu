-- 20261007270000_meta_purchase_lock_order.sql
--
-- Phase 29 review fix: lock order of meta_purchase_claim and meta_purchase_sweep. Both bodies are the
-- ones of 20261007260000_meta_purchase.sql with one change each: the payment row is locked before the
-- booking row, the order checkout_payment_settle uses (its booking_payments row FOR UPDATE, then the
-- booking FOR UPDATE). Before, both functions locked the booking first and reached the payment later
-- through the FK check of their insert into meta_purchase_events (FOR KEY SHARE on payment_id). A
-- repeated settle of the same payment (return route, second Stripe event) holding the payment and
-- waiting for the booking could then deadlock with them (40P01). Same signatures, same SECURITY
-- DEFINER, same search_path, lock_timeout and statement_timeout, same grants. No table, column, row
-- or other function changes.
--
-- Known trade-off, by design: functions that lock the booking first and then take FOR UPDATE on the
-- booking's first captured payment (ops_refund_plan, ops_refund_record, ops_refund_intent_sent,
-- record_booking_refund, booking_edit_request_accept, booking_edit_refund_record) now have the
-- opposite order to the claim. They only meet a claim when the owner or a customer acts on the
-- booking in the same instant its first payment settles; the settle repeat this fixes happens by
-- design (Stripe sends more than one event per payment).
--
-- One transaction: apply it verbatim as a whole (connector apply_migration).
begin;

-- The decision. The booking row is locked (right after the payment row), so two queue deliveries of
-- one booking take turns.
-- A row for the booking already exists -> 'already'. A payment that is not the booking's first
-- succeeded payment gets no row and clears nothing, so it can never block or steal the first
-- payment's Purchase (D-02, D-03). Every decision that writes a row empties the three cookie values
-- on the booking in the same transaction (D-05).
create or replace function public.meta_purchase_claim(
  p_booking_id pg_catalog.uuid,
  p_payment_id pg_catalog.int8,
  p_policy_version pg_catalog.text,
  p_test_event pg_catalog.bool,
  p_refund_required pg_catalog.bool,
  p_worker_skip pg_catalog.text
) returns table (
  decision pg_catalog.text,
  reason pg_catalog.text,
  event_id pg_catalog.uuid,
  fbp pg_catalog.text,
  fbc pg_catalog.text,
  charged_rappen pg_catalog.int4,
  captured_at pg_catalog.timestamptz
)
language plpgsql
security definer
set search_path = ''
set lock_timeout = '2s'
set statement_timeout = '5s'
as $$
#variable_conflict use_column
declare
  v_status    public.booking_status;
  v_is_test   pg_catalog.bool;
  v_erased    pg_catalog.timestamptz;
  v_fbp       pg_catalog.text;
  v_fbc       pg_catalog.text;
  v_subject   pg_catalog.uuid;
  v_charged   pg_catalog.int4;
  v_captured  pg_catalog.timestamptz;
  v_skip      pg_catalog.text;
  v_marketing pg_catalog.bool;
  v_event     pg_catalog.uuid;
begin
  if p_worker_skip is not null and p_worker_skip not in ('gate_closed', 'no_token', 'no_test_code') then
    raise exception 'meta_purchase_claim: unknown worker skip' using errcode = '22023';
  end if;

  -- Lock order (20261007270000): the payment row before the booking row, as checkout_payment_settle
  -- does. FOR KEY SHARE is the lock the insert's FK check on payment_id takes anyway, now taken first.
  -- It conflicts only with FOR UPDATE (settle's lock on this row, a delete, a change of a unique key),
  -- so the claim waits here for a settle that holds the payment and still needs the booking, and a
  -- settle that comes later waits at the payment while the claim finishes. A plain UPDATE of other
  -- payment columns (FOR NO KEY UPDATE) is not blocked. No row (unknown id) locks nothing; the checks
  -- below answer for it as before.
  perform 1 from public.booking_payments p where p.id = p_payment_id for key share;

  select b.status, b.is_test, b.erased_at, b.meta_fbp, b.meta_fbc, b.meta_consent_subject
    into v_status, v_is_test, v_erased, v_fbp, v_fbc, v_subject
    from public.bookings b where b.id = p_booking_id for update;
  if not found then
    raise exception 'meta_purchase_claim: booking not found' using errcode = 'P0002';
  end if;

  if exists (select 1 from public.meta_purchase_events e where e.booking_id = p_booking_id) then
    return query select 'already'::pg_catalog.text, null::pg_catalog.text, null::pg_catalog.uuid,
      null::pg_catalog.text, null::pg_catalog.text, null::pg_catalog.int4, null::pg_catalog.timestamptz;
    return;
  end if;

  select p.charged_rappen::pg_catalog.int4, coalesce(p.captured_at, p.created_at)
    into v_charged, v_captured
    from public.booking_payments p
   where p.id = p_payment_id and p.booking_id = p_booking_id and p.status = 'succeeded';
  -- A payment that is not the booking's first succeeded one writes no row and wipes nothing (WR-02).
  -- Reasoned: the first payment's claim still needs fbp, fbc and the subject for its own Purchase, so a
  -- later payment must never empty them. Every branch that is allowed to wipe has just written a row
  -- (below), and a booking that already has a row never reaches this point (the 'already' answer above),
  -- so this branch has no terminal row to justify a wipe. Values that an interrupted first payment left
  -- behind are emptied by meta_purchase_sweep() instead.
  if not found or exists (
    select 1
      from public.booking_payments o
      join public.booking_payments me on me.id = p_payment_id
     where o.booking_id = p_booking_id and o.status = 'succeeded' and o.id <> p_payment_id
       and (coalesce(o.captured_at, o.created_at), o.id) < (coalesce(me.captured_at, me.created_at), me.id)
  ) then
    return query select 'skip'::pg_catalog.text, 'not_first_payment'::pg_catalog.text, null::pg_catalog.uuid,
      null::pg_catalog.text, null::pg_catalog.text, null::pg_catalog.int4, null::pg_catalog.timestamptz;
    return;
  end if;

  if p_refund_required then
    v_skip := 'refunded';
  elsif v_erased is not null then
    v_skip := 'erased';
  elsif v_status not in ('paid'::public.booking_status, 'confirmed'::public.booking_status,
                         'assigned'::public.booking_status, 'completed'::public.booking_status) then
    v_skip := 'not_paid';
  elsif v_is_test then
    v_skip := 'is_test';
  elsif exists (select 1 from public.booking_refunds r where r.payment_id = p_payment_id) then
    v_skip := 'refunded';
  elsif v_charged is null or v_charged <= 0 then
    v_skip := 'zero_charge';
  elsif v_captured < pg_catalog.now() - interval '7 days' then
    v_skip := 'too_old';
  elsif p_worker_skip is not null then
    v_skip := p_worker_skip;
  elsif v_fbp is null and v_fbc is null then
    v_skip := 'no_ids';
  elsif v_subject is null then
    v_skip := 'no_subject';
  else
    perform pg_catalog.set_config('request.vamos.consent_subject', v_subject::pg_catalog.text, true);
    select c.marketing into v_marketing from public.consent_choice(p_policy_version, null) c;
    perform pg_catalog.set_config('request.vamos.consent_subject', '', true);
    if v_marketing is not true then
      v_skip := 'consent_off';
    end if;
  end if;

  if v_skip is not null then
    insert into public.meta_purchase_events (booking_id, payment_id, state, skip_reason, test_event)
    values (p_booking_id, p_payment_id, 'skipped', v_skip, coalesce(p_test_event, false));
  else
    insert into public.meta_purchase_events (booking_id, payment_id, state, test_event)
    values (p_booking_id, p_payment_id, 'sending', coalesce(p_test_event, false))
    returning meta_purchase_events.event_id into v_event;
  end if;

  update public.bookings
     set meta_fbp = null, meta_fbc = null, meta_consent_subject = null
   where id = p_booking_id;

  if v_skip is not null then
    return query select 'skip'::pg_catalog.text, v_skip, null::pg_catalog.uuid,
      null::pg_catalog.text, null::pg_catalog.text, null::pg_catalog.int4, null::pg_catalog.timestamptz;
  else
    return query select 'send'::pg_catalog.text, null::pg_catalog.text, v_event, v_fbp, v_fbc, v_charged, v_captured;
  end if;
end
$$;

-- WR-02: the daily clean-up. A queue message that is interrupted between the settle commit and the claim
-- commit is never redelivered into the claim (stripe_event_begin answers already_processed), so the
-- three values would stay on a paid booking for good (D-05). The sweep finds non-pending bookings that
-- still hold any of them and either already have a row, or whose first succeeded payment is older than
-- the claim's seven-day limit, or which have not been touched for an hour (long past any queue run).
-- It wipes the three values and, when no row exists and a succeeded payment exists, records the decision
-- as skipped / 'interrupted' (no Purchase, D-06) so a late claim answers 'already'. Rows other sessions
-- hold are skipped and caught the next day. Returns how many bookings it cleaned: one int4, no arrays.
create or replace function public.meta_purchase_sweep()
returns pg_catalog.int4
language plpgsql
security definer
set search_path = ''
set lock_timeout = '2s'
set statement_timeout = '5s'
as $$
declare
  v_id    pg_catalog.uuid;
  v_pay   pg_catalog.int8;
  v_first pg_catalog.int8;
  v_count pg_catalog.int4 := 0;
begin
  -- Lock order (20261007270000): the candidates are read without a lock. Per booking, its first
  -- succeeded payment is locked FOR KEY SHARE (the lock the insert's FK check takes anyway) before the
  -- booking FOR UPDATE, the order of checkout_payment_settle. Both locks skip a row another session
  -- holds, so the sweep never waits on a row; that booking is caught the next day. The booking lock
  -- re-checks the same conditions, and the first succeeded payment is read again under it: a booking
  -- that changed in between is left for the next day.
  for v_id in
    select b.id
      from public.bookings b
     where b.status <> 'pending'::public.booking_status
       and (b.meta_fbp is not null or b.meta_fbc is not null or b.meta_consent_subject is not null)
       and (
         exists (select 1 from public.meta_purchase_events e where e.booking_id = b.id)
         or exists (select 1 from public.booking_payments p
                     where p.booking_id = b.id and p.status = 'succeeded'
                       and coalesce(p.captured_at, p.created_at) < pg_catalog.now() - interval '7 days')
         or b.updated_at < pg_catalog.now() - interval '1 hour'
       )
     order by b.id
     limit 500
  loop
    select p.id into v_pay
      from public.booking_payments p
     where p.booking_id = v_id and p.status = 'succeeded'
     order by coalesce(p.captured_at, p.created_at), p.id
     limit 1;
    if v_pay is not null then
      perform 1 from public.booking_payments p where p.id = v_pay for key share skip locked;
      continue when not found;
    end if;

    perform 1
      from public.bookings b
     where b.id = v_id
       and b.status <> 'pending'::public.booking_status
       and (b.meta_fbp is not null or b.meta_fbc is not null or b.meta_consent_subject is not null)
       and (
         exists (select 1 from public.meta_purchase_events e where e.booking_id = b.id)
         or exists (select 1 from public.booking_payments p
                     where p.booking_id = b.id and p.status = 'succeeded'
                       and coalesce(p.captured_at, p.created_at) < pg_catalog.now() - interval '7 days')
         or b.updated_at < pg_catalog.now() - interval '1 hour'
       )
       for update of b skip locked;
    continue when not found;

    select p.id into v_first
      from public.booking_payments p
     where p.booking_id = v_id and p.status = 'succeeded'
     order by coalesce(p.captured_at, p.created_at), p.id
     limit 1;
    continue when v_first is distinct from v_pay;

    if v_pay is not null then
      insert into public.meta_purchase_events (booking_id, payment_id, state, skip_reason, test_event)
      values (v_id, v_pay, 'skipped', 'interrupted', false)
      on conflict (booking_id) do nothing;
    end if;

    update public.bookings
       set meta_fbp = null, meta_fbc = null, meta_consent_subject = null
     where id = v_id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end
$$;

revoke all on function public.meta_purchase_claim(pg_catalog.uuid, pg_catalog.int8, pg_catalog.text, pg_catalog.bool, pg_catalog.bool, pg_catalog.text) from public, anon, authenticated;
revoke all on function public.meta_purchase_sweep() from public, anon, authenticated;
grant execute on function public.meta_purchase_claim(pg_catalog.uuid, pg_catalog.int8, pg_catalog.text, pg_catalog.bool, pg_catalog.bool, pg_catalog.text) to vamos_system;
grant execute on function public.meta_purchase_sweep() to vamos_system;

commit;
