-- 20261013100000_single_leg_refund_own_subtotal.sql
--
-- Owner decision 2026-10-11 (.planning/decisions/2026-10-11-single-leg-refund-own-subtotal.md), closes
-- GAP-3 of phase 04 validation. Cancelling one leg of a two-leg booking refunds that leg's own amount.
-- Before this file app.apply_customer_cancel cancelled the leg and then called
-- compute_cancellation_refund(booking), which works at booking level (window from the earliest leg,
-- basis = everything captured): legs 4000 + 6000, 10000 captured, cancelling the 6000 leg owed 10000.
--
--   (1) app.leg_refund_basis: the leg's own price_snapshot_legs.leg_subtotal_rappen in the booking's
--       price snapshot, minus its pro-rata share of the snapshot's discount_rappen (shares rounded on the
--       running total, so the shares of all legs add up to the discount exactly). Null when the snapshot,
--       the leg row or any leg subtotal of that snapshot is missing. Stored rows only: a later rate book
--       does not change it. [rules 1, 4]
--   (2) app.compute_leg_cancellation_refund: compute_cancellation_refund for one leg. Hours run from that
--       leg's own original_scheduled_at; the window is the same free_cancel_hours. auto_full refunds the
--       leg basis, capped at what was captured (without duplicate payments) minus what the booking already
--       owes or has refunded, so the sum over all cancelled legs never exceeds the captured total. Inside
--       the window, or when the leg basis is unknown, pending_ops with the amount left to the admin; none
--       when nothing was captured. [rules 2, 3]
--   (3) app.apply_customer_cancel uses (2) only when one leg is named (p_leg_seq) AND the booking has more
--       than one leg. The owed amount adds to what was already owed; a leg cancel that adds nothing leaves
--       refund_status and refund_rappen as they were. The event payload gains refund_basis 'leg' and
--       leg_basis_rappen on that path only. A whole-booking cancel (p_leg_seq null), or a named leg of a
--       one-leg booking, runs the 20261007200000 body unchanged: same compute_cancellation_refund call,
--       same owed, same status, same event payload.
--   (4) public.ops_refund_plan: a booking that had a single-leg cancel (a booking.status_changed event
--       with refund_basis 'leg') pending_ops with owed > refunded refunds exactly what is due
--       (owed - refunded), spread over the payments: 100 % or no percentage, an exact amount up to what is
--       due; reason customer_cancel, tier full. Without it the Refund click took the full tier and
--       refunded every payment in full. Every other booking runs the 20261012160000 body unchanged.
--
-- compute_cancellation_refund itself is not changed (whole-booking cancels and ops_cancel_booking keep
-- calling it). Owners, SECURITY DEFINER, search_path '' and grants are those of the live definitions:
-- apply_customer_cancel no grant, ops_refund_plan EXECUTE vamos_system; the two new app functions no grant.
-- No data change. One transaction. Apply after 20261012190000.
begin;

-- ---------------------------------------------------------------------------
-- (1) app.leg_refund_basis
-- ---------------------------------------------------------------------------
create function app.leg_refund_basis(p_booking_id pg_catalog.uuid, p_leg_seq pg_catalog.int2)
returns public.rappen
language sql
stable
security definer
set search_path = ''
as $$
  with snap as (
    select s.id,
           greatest(coalesce(s.discount_rappen, 0), 0)::pg_catalog.numeric as discount
      from public.bookings as b
      join public.price_snapshots as s on s.id = b.price_snapshot_id
     where b.id = p_booking_id
  ),
  legs as (
    select l.leg_seq,
           l.leg_subtotal_rappen::pg_catalog.numeric as subtotal,
           pg_catalog.sum(l.leg_subtotal_rappen::pg_catalog.numeric)
             over (order by l.leg_seq rows between unbounded preceding and current row) as run_to,
           pg_catalog.sum(l.leg_subtotal_rappen::pg_catalog.numeric) over () as total,
           pg_catalog.count(*) over () as n,
           pg_catalog.count(l.leg_subtotal_rappen) over () as n_known
      from public.price_snapshot_legs as l
      join snap on snap.id = l.snapshot_id
  )
  select case
           when legs.n_known < legs.n then null
           when legs.total = 0 then 0
           else greatest(
                  legs.subtotal
                  - ( pg_catalog.round(snap.discount * legs.run_to / legs.total)
                    - pg_catalog.round(snap.discount * (legs.run_to - legs.subtotal) / legs.total)),
                  0)
         end::public.rappen
    from legs
    cross join snap
   where legs.leg_seq = p_leg_seq
$$;

revoke all on function app.leg_refund_basis(pg_catalog.uuid, pg_catalog.int2) from public;

comment on function app.leg_refund_basis(pg_catalog.uuid, pg_catalog.int2) is
  '20261013100000 (owner decision 2026-10-11): the refund basis of one leg = its price_snapshot_legs.leg_subtotal_rappen in the booking''s price snapshot minus its pro-rata share of the snapshot discount_rappen (shares rounded on the running total, so they add up to the discount). Null when the snapshot, the leg row or any leg subtotal of the snapshot is missing. Stored rows only. No grant.';

-- ---------------------------------------------------------------------------
-- (2) app.compute_leg_cancellation_refund
-- ---------------------------------------------------------------------------
create function app.compute_leg_cancellation_refund(
  p_booking_id pg_catalog.uuid,
  p_leg_seq pg_catalog.int2
)
returns table (
  refund_mode pg_catalog.text,
  refund_rappen public.rappen,
  basis_rappen public.rappen,
  hours_before pg_catalog.numeric,
  refund_percent pg_catalog.numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_original pg_catalog.timestamptz;
  v_hours pg_catalog.numeric(8,2);
  v_window pg_catalog.numeric;
  v_captured pg_catalog.int4;
  v_prior pg_catalog.int4;
  v_leg public.rappen;
  v_amt pg_catalog.int4;
begin
  select l.original_scheduled_at
    into v_original
    from public.booking_legs as l
   where l.booking_id = p_booking_id
     and l.leg_seq = p_leg_seq;

  if v_original is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  -- Rule 2: the clock runs from this leg's own original pickup (D-26, real elapsed time).
  v_hours := app.refund_hours_before(v_original, pg_catalog.now());
  v_window := app.refund_free_window_hours(p_booking_id);

  -- Same captured basis as compute_cancellation_refund: duplicate charges are refunded on their own.
  select coalesce(pg_catalog.sum(p.charged_rappen), 0)::pg_catalog.int4
    into v_captured
    from public.booking_payments as p
   where p.booking_id = p_booking_id
     and p.captured_at is not null
     and p.status is distinct from 'duplicate';

  -- Rule 3: what the booking already owes or has refunded (an earlier leg cancel, a change credit)
  -- comes off the room left for this leg.
  select greatest(coalesce(b.refund_owed_rappen, 0), coalesce(b.refunded_rappen, 0))::pg_catalog.int4
    into v_prior
    from public.bookings as b
   where b.id = p_booking_id;

  -- Rules 1 and 4: the leg's own stored amount.
  v_leg := app.leg_refund_basis(p_booking_id, p_leg_seq);

  hours_before := v_hours;
  basis_rappen := v_leg;

  if v_hours > v_window and v_leg is not null then
    v_amt := least(v_leg, greatest(v_captured - coalesce(v_prior, 0), 0));
    refund_mode := 'auto_full';
    refund_rappen := v_amt;
    refund_percent := case
                        when v_leg > 0 then pg_catalog.round(v_amt::pg_catalog.numeric * 100 / v_leg, 2)
                        else 100
                      end;
  elsif v_captured > 0 then
    -- Inside the window, inside 6 h, after pickup, or a leg with no stored amount: the admin decides.
    refund_mode := 'pending_ops';
    refund_rappen := null;
    refund_percent := null;
  else
    refund_mode := 'none';
    refund_rappen := 0;
    refund_percent := 0;
  end if;
  return next;
end;
$$;

revoke all on function app.compute_leg_cancellation_refund(pg_catalog.uuid, pg_catalog.int2) from public;

comment on function app.compute_leg_cancellation_refund(pg_catalog.uuid, pg_catalog.int2) is
  '20261013100000 (owner decision 2026-10-11): compute_cancellation_refund for one leg of a booking with more than one leg. hours = real elapsed time to that leg''s original_scheduled_at; window = app.refund_free_window_hours. auto_full: refund = app.leg_refund_basis, capped at captured (without duplicate payments) minus greatest(refund_owed_rappen, refunded_rappen), so all cancelled legs together never exceed the captured total; refund_percent = refund / basis. pending_ops (amount null) inside the window or when the leg basis is unknown; none when nothing was captured. No grant: called by app.apply_customer_cancel.';

-- ---------------------------------------------------------------------------
-- (3) app.apply_customer_cancel -- body of 20261007200000 with the leg path added.
-- ---------------------------------------------------------------------------
create or replace function app.apply_customer_cancel(
  p_booking_id pg_catalog.uuid,
  p_leg_seq pg_catalog.int2,
  p_actor_kind pg_catalog.text,
  p_actor_label pg_catalog.text,
  p_via pg_catalog.text
)
returns table (
  booking_id pg_catalog.uuid,
  refund_mode pg_catalog.text,
  refund_rappen public.rappen,
  basis_rappen public.rappen,
  hours_before pg_catalog.numeric,
  stripe_payment_intent_id pg_catalog.text,
  refund_percent pg_catalog.numeric
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v public.bookings%rowtype;
  v_cut pg_catalog.int4;
  v_leg_id pg_catalog.uuid;
  v_free_cancel_hours pg_catalog.numeric;
  v_tiers pg_catalog.jsonb;
  v_settings_version pg_catalog.int8;
  v_comp record;
  v_pi pg_catalog.text;
  v_to public.booking_status;
  v_owed public.rappen;
  v_rs pg_catalog.text;
  v_by_leg pg_catalog.bool;
begin
  -- 261002 settle safety (P-1): the booking first, as every writer of a booking's change requests; the
  -- callers (manage_booking_cancel, customer_paid_cancel) already hold the lock, this one is defensive.
  select b.*
    into v
    from public.bookings as b
   where b.id = p_booking_id
     for update;

  if v.id is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  if v.status in (
       'completed'::public.booking_status,
       'no_show'::public.booking_status,
       'cancelled'::public.booking_status,
       'refunded'::public.booking_status
     ) then
    raise exception 'not_cancellable' using errcode = 'P0001';
  end if;

  if v.status not in (
       'pending'::public.booking_status,
       'paid'::public.booking_status,
       'confirmed'::public.booking_status,
       'assigned'::public.booking_status,
       'partially_completed'::public.booking_status,
       'partially_cancelled'::public.booking_status
     ) then
    raise exception 'not_cancellable' using errcode = 'P0001';
  end if;

  update public.booking_legs as bl
     set status = 'cancelled'::public.booking_status,
         updated_at = pg_catalog.now()
   where bl.booking_id = v.id
     and bl.status not in (
       'completed'::public.booking_status,
       'no_show'::public.booking_status,
       'cancelled'::public.booking_status
     )
     and (p_leg_seq is null or bl.leg_seq = p_leg_seq);
  get diagnostics v_cut = row_count;
  if v_cut = 0 then
    raise exception 'not_cancellable' using errcode = 'P0001';
  end if;

  perform public.recompute_booking_status(v.id);

  select b.status
    into v_to
    from public.bookings as b
   where b.id = v.id;

  -- 20261013100000: one named leg of a booking with more than one leg refunds that leg's own amount.
  -- Everything else (whole booking, or the only leg) is the booking-level refund, as before.
  v_by_leg := p_leg_seq is not null
              and (select pg_catalog.count(*)
                     from public.booking_legs as l
                    where l.booking_id = v.id) > 1;

  if v_by_leg then
    select c.*
      into v_comp
      from app.compute_leg_cancellation_refund(v.id, p_leg_seq) as c;
  else
    select c.*
      into v_comp
      from public.compute_cancellation_refund(v.id) as c;
  end if;

  v_owed := v_comp.refund_rappen;
  -- 20-10: nothing goes to Stripe on a cancel. A paid booking cancelled more than 24 h
  -- ahead is left as "refund due": pending_ops with owed = captured; the team sends it.
  -- An unpaid one (auto_full with 0 captured) has nothing to refund and stays none.
  if v_comp.refund_mode = 'pending_ops'
     or (v_comp.refund_mode = 'auto_full' and coalesce(v_comp.refund_rappen, 0) > 0) then
    v_rs := 'pending_ops';
  else
    v_rs := 'none';
  end if;

  if v_by_leg then
    if v_comp.refund_mode = 'auto_full' and coalesce(v_comp.refund_rappen, 0) > 0 then
      -- Rule 3: this leg's amount adds to what the booking already owes or has refunded.
      v_owed := (greatest(coalesce(v.refund_owed_rappen, 0), coalesce(v.refunded_rappen, 0))
                 + v_comp.refund_rappen)::public.rappen;
    elsif v_comp.refund_mode <> 'pending_ops' then
      -- Nothing new is owed: the booking keeps the refund state it had.
      v_rs := v.refund_status;
      v_owed := v.refund_owed_rappen;
    end if;
  end if;

  update public.bookings
     set refund_status = v_rs,
         refund_owed_rappen = v_owed,
         updated_at = pg_catalog.now()
   where id = v.id;

  -- 261002 settle safety (P-2): a cancel ends any change that waits for its difference; the Worker closes
  -- its Stripe page (booking_cancel_change_pages). A payment that still lands is Refund due, never applied
  -- (checkout_extra_payment_settle).
  update public.booking_edit_requests
     set status = 'superseded'
   where booking_id = v.id
     and status = 'requested';

  select (s.policy ->> 'free_cancel_hours')::pg_catalog.numeric,
         s.policy -> 'cancellation_tiers',
         s.settings_version_id
    into v_free_cancel_hours, v_tiers, v_settings_version
    from public.price_snapshots as s
   where s.id = v.price_snapshot_id;

  if p_leg_seq is not null then
    select l.id
      into v_leg_id
      from public.booking_legs as l
     where l.booking_id = v.id
       and l.leg_seq = p_leg_seq;
  end if;

  select p.stripe_payment_intent_id
    into v_pi
    from public.booking_payments as p
   where p.booking_id = v.id
     and p.captured_at is not null
     and p.status = 'succeeded'
   order by p.captured_at
   limit 1;

  insert into public.booking_events (
    booking_id, booking_leg_id, kind, actor_kind, actor_label,
    from_status, to_status, payload
  ) values (
    v.id,
    v_leg_id,
    'booking.status_changed',
    p_actor_kind,
    p_actor_label,
    v.status,
    v_to,
    pg_catalog.jsonb_build_object(
      'via', p_via,
      'leg_seq', p_leg_seq,
      'free_cancel_hours', v_free_cancel_hours,
      'cancellation_tiers', v_tiers,
      'settings_version_id', v_settings_version,
      'hours_before', v_comp.hours_before,
      'refund_mode', v_comp.refund_mode,
      'refund_rappen', v_comp.refund_rappen
    )
    || case
         when v_by_leg then pg_catalog.jsonb_build_object(
           'refund_basis', 'leg',
           'leg_basis_rappen', v_comp.basis_rappen
         )
         else '{}'::pg_catalog.jsonb
       end
  );

  booking_id := v.id;
  refund_mode := v_comp.refund_mode;
  refund_rappen := v_comp.refund_rappen;
  basis_rappen := v_comp.basis_rappen;
  hours_before := v_comp.hours_before;
  stripe_payment_intent_id := v_pi;
  refund_percent := v_comp.refund_percent;
  return next;
end;
$$;

revoke all on function app.apply_customer_cancel(
  pg_catalog.uuid, pg_catalog.int2, pg_catalog.text, pg_catalog.text, pg_catalog.text
) from public;

comment on function app.apply_customer_cancel(
  pg_catalog.uuid, pg_catalog.int2, pg_catalog.text, pg_catalog.text, pg_catalog.text
) is
  '09-02 shared cancel body, changed by 20-10 refunds by hand: a paid booking cancelled more than 24 h ahead ends refund_status pending_ops with refund_owed_rappen = captured (nothing goes to Stripe; the team sends the refund); an unpaid one ends none; inside 24 h unchanged (pending_ops, owed null). 261002 settle safety: locks the booking first; the cancel ends every change request of the booking that still waits for its difference (superseded). 20261013100000: one named leg of a booking with more than one leg uses app.compute_leg_cancellation_refund (the leg''s own amount, window from its own pickup); owed = greatest(owed, refunded) + that amount; a leg cancel that owes nothing new keeps refund_status and owed; the event payload adds refund_basis leg and leg_basis_rappen. A whole-booking cancel is unchanged. No grant: called by the SECURITY DEFINER cancel functions only.';

-- ---------------------------------------------------------------------------
-- (4) public.ops_refund_plan -- body of 20261012160000 with the single-leg due added.
-- ---------------------------------------------------------------------------
create or replace function public.ops_refund_plan(
  p_booking_id pg_catalog.uuid,
  p_actor_id pg_catalog.uuid,
  p_payment_id pg_catalog.int8 default null,
  p_percent pg_catalog.numeric default null,
  p_reason pg_catalog.text default null,
  p_resume_only pg_catalog.bool default false,
  p_amount_rappen pg_catalog.int4 default null
)
returns table (
  intent_id pg_catalog.int8,
  payment_id pg_catalog.int8,
  stripe_payment_intent_id pg_catalog.text,
  amount_rappen pg_catalog.int4,
  idempotency_key pg_catalog.text,
  state pg_catalog.text,
  attempts pg_catalog.int4,
  resumed pg_catalog.bool
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_booking public.bookings%rowtype;
  v_reason pg_catalog.text;
  v_open pg_catalog.int4;
  v_captured pg_catalog.int4;
  v_full pg_catalog.bool;
  v_credit pg_catalog.bool;
  v_leg pg_catalog.bool;
  v_due_left pg_catalog.int4;
  v_tier pg_catalog.text;
  v_batch pg_catalog.uuid := pg_catalog.gen_random_uuid();
  v_pay public.booking_payments%rowtype;
  v_refunded pg_catalog.int4;
  v_left pg_catalog.int4;
  v_amt pg_catalog.int4;
  v_pct pg_catalog.numeric(5,2);
  v_planned pg_catalog.int4 := 0;
  v_rows pg_catalog.int4 := 0;
  v_any_left pg_catalog.bool := false;
  v_locked pg_catalog.int4;
begin
  if p_reason is not null
     and p_reason not in ('ops_cancel', 'customer_cancel', 'no_driver', 'no_show', 'post_trip', 'modification_credit') then
    raise exception 'invalid-reason' using errcode = '22023';
  end if;

  if p_percent is not null and p_amount_rappen is not null then
    raise exception 'invalid-amount' using errcode = '22023',
      detail = 'percent and exact amount are never sent together';
  end if;
  if p_percent is not null and (p_percent <= 0 or p_percent > 100) then
    raise exception 'invalid-amount' using errcode = '22023';
  end if;
  if p_amount_rappen is not null and p_amount_rappen <= 0 then
    raise exception 'invalid-amount' using errcode = '22023';
  end if;

  -- Lock order (20261007280000): the captured payments this plan may refund, then the booking, as settle does.
  select pg_catalog.count(*)::pg_catalog.int4
    into v_locked
    from (select p.id
            from public.booking_payments as p
           where p.booking_id = p_booking_id
             and p.captured_at is not null
             and (p_payment_id is null or p.id = p_payment_id)
           order by p.id
             for update) as l;

  select b.*
    into v_booking
    from public.bookings as b
   where b.id = p_booking_id
     and b.erased_at is null
   for update;

  if not found then
    raise exception 'not-found' using errcode = 'P0002';
  end if;

  select pg_catalog.count(*)::pg_catalog.int4
    into v_open
    from public.booking_refund_intents as i
   where i.booking_id = v_booking.id
     and i.state in ('intended', 'failed');

  if v_open > 0 then
    if v_booking.refund_status = 'failed' then
      update public.bookings
         set refund_status = 'processing',
             updated_at = pg_catalog.now()
       where id = v_booking.id;
    end if;
    return query
      select i.id,
             i.payment_id,
             p.stripe_payment_intent_id,
             i.amount_rappen::pg_catalog.int4,
             'refund-intent:' || i.id::pg_catalog.text,
             i.state,
             i.attempts,
             true
        from public.booking_refund_intents as i
        join public.booking_payments as p on p.id = i.payment_id
       where i.booking_id = v_booking.id
         and i.state in ('intended', 'failed')
       order by i.payment_id;
    return;
  end if;

  if p_resume_only then
    raise exception 'nothing-to-retry' using errcode = 'P0001';
  end if;

  select pg_catalog.count(*)::pg_catalog.int4
    into v_captured
    from public.booking_payments as p
   where p.booking_id = v_booking.id
     and p.captured_at is not null;

  if v_captured = 0 then
    raise exception 'not-paid' using errcode = 'P0001';
  end if;

  if p_payment_id is not null and not exists (
    select 1
      from public.booking_payments as p
     where p.id = p_payment_id
       and p.booking_id = v_booking.id
       and p.captured_at is not null
  ) then
    raise exception 'not-paid' using errcode = 'P0001';
  end if;

  if p_amount_rappen is not null and p_payment_id is null and v_captured <> 1 then
    raise exception 'invalid-amount' using errcode = '22023',
      detail = 'an exact amount needs one chosen payment';
  end if;

  -- 20261013100000: a single-leg cancel left that leg's own amount due (pending_ops, owed > refunded).
  v_leg := v_booking.refund_status = 'pending_ops'
           and coalesce(v_booking.refund_owed_rappen, 0) > coalesce(v_booking.refunded_rappen, 0)
           and exists (
             select 1
               from public.booking_events as e
              where e.booking_id = v_booking.id
                and e.kind = 'booking.status_changed'
                and e.payload ->> 'refund_basis' = 'leg'
           );

  -- 26.2 P1 credit: a change on a live booking left an amount due (pending_ops, owed > refunded).
  v_credit := not v_leg
              and v_booking.refund_status = 'pending_ops'
              and coalesce(v_booking.refund_owed_rappen, 0) > coalesce(v_booking.refunded_rappen, 0)
              and v_booking.status not in ('cancelled'::public.booking_status,
                                           'partially_cancelled'::public.booking_status,
                                           'refunded'::public.booking_status);
  v_due_left := case
                  when v_credit or v_leg then coalesce(v_booking.refund_owed_rappen, 0) - coalesce(v_booking.refunded_rappen, 0)
                  else 0
                end;

  if v_credit and p_percent is not null then
    raise exception 'invalid-amount' using errcode = '22023',
      detail = 'a refund due from a change is an exact amount';
  end if;

  -- 100 % of a single-leg due is the due itself; any other percentage would be of the whole payment.
  if v_leg and p_percent is not null and p_percent <> 100 then
    raise exception 'invalid-amount' using errcode = '22023',
      detail = 'a refund due from a single-leg cancel is an exact amount';
  end if;

  v_reason := coalesce(p_reason, case
                                   when v_credit then 'modification_credit'
                                   when v_leg then 'customer_cancel'
                                   else 'ops_cancel'
                                 end);

  -- Full tier: cancelled more than 24 h ahead, the whole refund is due, 100 % only.
  v_full := not v_credit
            and not v_leg
            and v_booking.refund_status = 'pending_ops' and coalesce(v_booking.refund_owed_rappen, 0) > 0;
  v_tier := case
              when v_credit then 'credit'
              when v_leg then 'full'
              when v_full or (p_percent is null and p_amount_rappen is null) then 'full'
              else 'decided'
            end;

  if (select pg_catalog.count(*)::pg_catalog.int4
        from public.booking_payments as p
       where p.booking_id = v_booking.id
         and p.captured_at is not null
         and (p_payment_id is null or p.id = p_payment_id)) <> v_locked then
    raise exception 'payment-changed' using errcode = '40001';
  end if;

  for v_pay in
    select p.*
      from public.booking_payments as p
     where p.booking_id = v_booking.id
       and p.captured_at is not null
       and (p_payment_id is null or p.id = p_payment_id)
     order by p.id
  loop
    select coalesce(pg_catalog.sum(r.refund_rappen), 0)::pg_catalog.int4
      into v_refunded
      from public.booking_refunds as r
     where r.payment_id = v_pay.id
       and not exists (select 1 from public.booking_refund_reversals as x where x.refund_id = r.id);

    v_left := v_pay.charged_rappen - v_refunded;
    if v_left <= 0 then
      continue;
    end if;
    v_any_left := true;

    if v_credit or v_leg then
      if v_due_left <= 0 then
        continue;
      end if;
      if p_amount_rappen is not null then
        if p_amount_rappen > v_left or p_amount_rappen > v_due_left then
          raise exception 'refund-exceeds-remaining' using errcode = 'P0001';
        end if;
        v_amt := p_amount_rappen;
      else
        v_amt := least(v_left, v_due_left);
      end if;
      v_due_left := v_due_left - v_amt;
    elsif p_amount_rappen is not null then
      if p_amount_rappen > v_left then
        raise exception 'refund-exceeds-remaining' using errcode = 'P0001';
      end if;
      v_amt := p_amount_rappen;
    elsif p_percent is not null then
      v_amt := least(
        v_left,
        pg_catalog.round(v_pay.charged_rappen::pg_catalog.numeric * p_percent / 100)::pg_catalog.int4
      );
    else
      v_amt := v_left;
    end if;

    if v_amt <= 0 then
      continue;
    end if;

    if v_full and v_amt < v_left then
      raise exception 'full-refund-only' using errcode = 'P0001',
        detail = 'cancelled more than 24 h ahead: each payment is refunded in full';
    end if;

    v_pct := case
               when v_credit then
                 pg_catalog.round(v_amt::pg_catalog.numeric * 100 / v_pay.charged_rappen, 2)
               when v_full or v_leg then null
               when p_percent is not null then p_percent
               when p_amount_rappen is not null then
                 pg_catalog.round(v_amt::pg_catalog.numeric * 100 / v_pay.charged_rappen, 2)
               else null
             end;

    insert into public.booking_refund_intents (
      booking_id, payment_id, batch_id, amount_rappen, reason,
      decided_percent, tier, actor_id
    ) values (
      v_booking.id, v_pay.id, v_batch, v_amt, v_reason,
      v_pct, v_tier, p_actor_id
    );
    v_planned := v_planned + v_amt;
    v_rows := v_rows + 1;
  end loop;

  if v_rows = 0 then
    if v_any_left then
      raise exception 'invalid-amount' using errcode = '22023';
    end if;
    raise exception 'already-refunded' using errcode = 'P0001';
  end if;

  -- Owed never shrinks by planning: a full-tier booking keeps owing 100 % while one payment
  -- is sent first; a decided amount becomes what is owed on top of what already went.
  update public.bookings
     set refund_status = 'processing',
         refund_owed_rappen = greatest(
           coalesce(refund_owed_rappen, 0),
           coalesce(refunded_rappen, 0) + v_planned
         )::public.rappen,
         updated_at = pg_catalog.now()
   where id = v_booking.id;

  return query
    select i.id,
           i.payment_id,
           p.stripe_payment_intent_id,
           i.amount_rappen::pg_catalog.int4,
           'refund-intent:' || i.id::pg_catalog.text,
           i.state,
           i.attempts,
           false
      from public.booking_refund_intents as i
      join public.booking_payments as p on p.id = i.payment_id
     where i.batch_id = v_batch
     order by i.payment_id;
  return;
end;
$$;

revoke all on function public.ops_refund_plan(
  pg_catalog.uuid, pg_catalog.uuid, pg_catalog.int8, pg_catalog.numeric, pg_catalog.text,
  pg_catalog.bool, pg_catalog.int4
) from public;

grant execute on function public.ops_refund_plan(
  pg_catalog.uuid, pg_catalog.uuid, pg_catalog.int8, pg_catalog.numeric, pg_catalog.text,
  pg_catalog.bool, pg_catalog.int4
) to vamos_system;


comment on function public.ops_refund_plan(
  pg_catalog.uuid, pg_catalog.uuid, pg_catalog.int8, pg_catalog.numeric, pg_catalog.text,
  pg_catalog.bool, pg_catalog.int4
) is
  '20-10 refunds by hand + 26.2 P1 credit tier + J7: plan a refund per captured payment (or one chosen payment) and write it as intended intents; no Stripe call. What is left of a payment is its charge minus its refunds that Stripe did not later fail (booking_refund_reversals). Open intents are returned as they are (resumed) and nothing new is created. p_percent = percent of each payment''s charged amount, capped at its remainder; p_amount_rappen = exact amount for one payment, capped at its remainder (more: refund-exceeds-remaining); never both (invalid-amount). Full-tier rule: a cancelled booking pending_ops with owed > 0 accepts only 100 % of each remainder (full-refund-only). Credit tier (26.2 P1): a live booking pending_ops with owed > refunded refunds exactly what is due (owed - refunded): no percentage (invalid-amount), an exact amount up to what is due, or what is due spread over the payments; reason modification_credit; tier credit. Single-leg due (20261013100000): a booking with a single-leg cancel (booking_events refund_basis leg) pending_ops with owed > refunded refunds exactly what is due, like the credit tier but with no percentage other than 100 (invalid-amount); reason customer_cancel; tier full. Sets refund_status processing and owed = greatest(owed, refunded + planned). Refusals: not-found, not-paid, already-refunded, invalid-amount, invalid-reason, nothing-to-retry, refund-exceeds-remaining, full-refund-only. EXECUTE vamos_system only.';

commit;
