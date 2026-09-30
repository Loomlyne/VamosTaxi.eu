-- 20261005140000_refunds_by_hand.sql
--
-- Phase 20 plan 20-10, package P1 (database). Refunds by hand: the site never sends a
-- cancel refund to Stripe on its own. Owner decisions: .planning/decisions/2026-09-30-refunds-by-hand.md
-- and 20-10-BUILD-SPEC.md sections B.1, B.2 and E.
--
--   (1) app.apply_customer_cancel  a paid booking cancelled more than 24 h ahead ends
--                                  refund_status pending_ops with refund_owed_rappen =
--                                  captured ("refund due"); an unpaid one ends none.
--                                  Inside 24 h nothing changes.
--   (2) ops_cancel_booking         the same rule for a staff cancel.
--   (3) booking_refund_intents     what the team decided to send, per payment.
--   (4) app.refund_intents_settle  internal: intents + amounts -> refund_status.
--   (5) ops_refund_plan            plan a refund across payments; percent OR exact amount;
--                                  full-tier rule (pending_ops with owed > 0: 100 % only).
--   (6) ops_refund_intent_sent     Stripe accepted: record the refund, settle the status.
--   (7) ops_refund_intent_failed   Stripe refused: keep it open for Retry, or void it.
--   (8) ops_refund_decide          a full-tier booking cannot be declined.
--
-- Replaced bodies are the newest definitions, changed only as listed. Every function is
-- SECURITY DEFINER with search_path ''. Grants are as they were (ops_cancel_booking:
-- vamos_system; ops_refund_decide: vamos_staff, admin check inside; new functions:
-- vamos_system only). Bookings already cancelled keep their state; there is no backfill.
-- One transaction: a failed apply rolls back whole.
--
-- No CHF amount enters this file.

begin;

-- ---------------------------------------------------------------------------
-- (1) app.apply_customer_cancel -- shared body of manage_booking_cancel and
--     customer_paid_cancel. Body of 20260911234758 unchanged except the refund_status rule.
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
begin
  select b.*
    into v
    from public.bookings as b
   where b.id = p_booking_id;

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

  select c.*
    into v_comp
    from public.compute_cancellation_refund(v.id) as c;

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

  update public.bookings
     set refund_status = v_rs,
         refund_owed_rappen = v_owed,
         updated_at = pg_catalog.now()
   where id = v.id;

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
  '09-02 shared cancel body, changed by 20-10 refunds by hand: a paid booking cancelled more than 24 h ahead ends refund_status pending_ops with refund_owed_rappen = captured (nothing goes to Stripe; the team sends the refund); an unpaid one ends none; inside 24 h unchanged (pending_ops, owed null). No grant: called by the SECURITY DEFINER cancel functions only.';

-- ---------------------------------------------------------------------------
-- (2) ops_cancel_booking -- body of 20260928110000 unchanged except the refund_status rule.
-- ---------------------------------------------------------------------------
drop function if exists public.ops_cancel_booking(pg_catalog.uuid, pg_catalog.uuid);

create function public.ops_cancel_booking(
  p_booking_id pg_catalog.uuid,
  p_actor_id pg_catalog.uuid
)
returns table (
  booking_id pg_catalog.uuid,
  reference pg_catalog.text,
  email pg_catalog.text,
  name pg_catalog.text,
  locale pg_catalog.text,
  paid pg_catalog.bool,
  refund_mode pg_catalog.text,
  refund_rappen pg_catalog.int4,
  stripe_checkout_session_ids pg_catalog.text[]
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_booking public.bookings%rowtype;
  v_actor_label pg_catalog.text;
  v_from public.booking_status;
  v_paid pg_catalog.bool;
  v_to public.booking_status;
  v_comp record;
  v_rs pg_catalog.text;
  v_sessions pg_catalog.text[];
begin
  select b.*
    into v_booking
    from public.bookings as b
   where b.id = p_booking_id
     and b.erased_at is null
   for update;

  if not found then
    raise exception 'not-found' using errcode = 'P0002';
  end if;

  if v_booking.status in (
       'completed'::public.booking_status,
       'cancelled'::public.booking_status,
       'refunded'::public.booking_status,
       'no_show'::public.booking_status,
       'partially_cancelled'::public.booking_status,
       'partially_completed'::public.booking_status
     ) then
    raise exception 'frozen' using errcode = 'P0001';
  end if;

  select exists (
    select 1
      from public.booking_payments as p
     where p.booking_id = v_booking.id
       and p.captured_at is not null
  ) into v_paid;

  select coalesce(s.full_name, '')
    into v_actor_label
    from public.staff as s
   where s.user_id = p_actor_id;

  if v_actor_label is null then
    v_actor_label := '';
  end if;

  v_from := v_booking.status;

  update public.booking_legs
     set status = 'cancelled'::public.booking_status,
         updated_at = pg_catalog.now()
   where booking_id = v_booking.id
     and status not in (
       'completed'::public.booking_status,
       'no_show'::public.booking_status,
       'cancelled'::public.booking_status
     );

  perform public.recompute_booking_status(v_booking.id);

  select b.status
    into v_to
    from public.bookings as b
   where b.id = v_booking.id;

  select c.*
    into v_comp
    from public.compute_cancellation_refund(v_booking.id) as c;

  -- 20-10: nothing goes to Stripe on a cancel. A paid booking cancelled more than 24 h
  -- ahead is left as "refund due": pending_ops with owed = captured; the team sends it.
  -- An unpaid one (auto_full with 0 captured) has nothing to refund and stays none.
  if v_comp.refund_mode = 'pending_ops'
     or (v_comp.refund_mode = 'auto_full' and coalesce(v_comp.refund_rappen, 0) > 0) then
    v_rs := 'pending_ops';
  else
    v_rs := 'none';
  end if;

  update public.bookings
     set refund_status = v_rs,
         refund_owed_rappen = v_comp.refund_rappen,
         updated_at = pg_catalog.now()
   where id = v_booking.id;

  select coalesce(pg_catalog.array_agg(bp.stripe_checkout_session_id), array[]::pg_catalog.text[])
    into v_sessions
    from public.booking_payments as bp
   where bp.booking_id = v_booking.id
     and bp.status = 'requires_payment'
     and bp.stripe_checkout_session_id is not null;

  if not v_paid then
    perform app.release_unpaid_coupon(v_booking.id, 'unpaid_cancelled');
  end if;

  insert into public.booking_events (
    booking_id,
    kind,
    actor_kind,
    actor_id,
    actor_label,
    from_status,
    to_status,
    payload
  ) values (
    v_booking.id,
    'booking.status_changed',
    'staff',
    p_actor_id,
    v_actor_label,
    v_from,
    v_to,
    pg_catalog.jsonb_build_object(
      'via', 'ops',
      'paid', v_paid,
      'refund_mode', v_comp.refund_mode,
      'refund_rappen', v_comp.refund_rappen
    )
  );

  return query
    select v_booking.id,
           v_booking.reference,
           v_booking.contact_email::pg_catalog.text,
           v_booking.contact_name,
           coalesce(v_booking.locale, 'en'),
           v_paid,
           v_comp.refund_mode,
           v_comp.refund_rappen::pg_catalog.int4,
           v_sessions;
  return;
end
$$;

revoke all on function public.ops_cancel_booking(
  pg_catalog.uuid,
  pg_catalog.uuid
) from public;

grant execute on function public.ops_cancel_booking(
  pg_catalog.uuid,
  pg_catalog.uuid
) to vamos_system;

comment on function public.ops_cancel_booking(
  pg_catalog.uuid,
  pg_catalog.uuid
) is
  '08-05 + 09-02 D-13, extended by plan 26.1-06 (D-04/D-11a): ops cancel without Stripe. Calls compute_cancellation_refund (same D-02 windows), returns refund_mode + refund_rappen + the booking''s open Stripe Checkout Session ids (empty for an already-paid booking), and releases its unreleased coupon redemption when it was unpaid. 20-10: a paid booking cancelled more than 24 h ahead ends pending_ops with owed = captured (refund due, nothing goes to Stripe); an unpaid one ends none. EXECUTE vamos_system only.';

-- ---------------------------------------------------------------------------
-- (3) booking_refund_intents: what the team decided to send, one row per payment
--     per click. booking_refunds is append-only, so "write it down, then call
--     Stripe, then mark it sent" needs a table that can change state. Written only
--     by the three functions below (SECURITY DEFINER). Staff may read; nobody else.
-- ---------------------------------------------------------------------------
create table public.booking_refund_intents (
  id                bigint generated always as identity primary key,
  booking_id        pg_catalog.uuid not null references public.bookings(id) on delete restrict,
  payment_id        pg_catalog.int8 not null references public.booking_payments(id) on delete restrict,
  batch_id          pg_catalog.uuid not null,
  amount_rappen     public.rappen not null check (amount_rappen > 0),
  reason            pg_catalog.text not null check (reason in
                      ('ops_cancel', 'customer_cancel', 'no_driver', 'no_show', 'post_trip')),
  decided_percent   pg_catalog.numeric(5,2) check (decided_percent is null or decided_percent between 0 and 100),
  tier              pg_catalog.text not null check (tier in ('full', 'decided')),
  state             pg_catalog.text not null default 'intended'
                      check (state in ('intended', 'sent', 'failed', 'void')),
  attempts          pg_catalog.int4 not null default 0 check (attempts >= 0),
  last_error        pg_catalog.text,
  stripe_refund_id  pg_catalog.text unique,
  refund_id         pg_catalog.int8 references public.booking_refunds(id) on delete restrict,
  actor_id          pg_catalog.uuid references auth.users(id) on delete set null,
  created_at        pg_catalog.timestamptz not null default pg_catalog.now(),
  updated_at        pg_catalog.timestamptz not null default pg_catalog.now()
);

comment on table public.booking_refund_intents is
  '20-10: one row per payment per refund click. intended = written down, nothing sent; sent = Stripe accepted and booking_refunds has the row; failed = Stripe refused (retry); void = given up. tier full = the whole remainder (the booking keeps owing the rest); decided = an amount or percentage the admin chose. Written only by ops_refund_plan / ops_refund_intent_sent / ops_refund_intent_failed. Staff SELECT only.';

-- One open intent per payment: a second click can never plan the same money twice.
create unique index booking_refund_intents_open_payment_uq
  on public.booking_refund_intents (payment_id)
  where state in ('intended', 'failed');

create index booking_refund_intents_booking_idx
  on public.booking_refund_intents (booking_id, id);

alter table public.booking_refund_intents enable row level security;
alter table public.booking_refund_intents force row level security;

revoke all on table public.booking_refund_intents
  from public, anon, authenticated, vamos_guest, vamos_edge, vamos_public, vamos_checkout;

grant select on table public.booking_refund_intents to vamos_staff;

create policy booking_refund_intents_staff_gate on public.booking_refund_intents
  as restrictive for all to vamos_staff
  using ((select app.is_staff())) with check (false);

create policy booking_refund_intents_staff_read on public.booking_refund_intents
  for select to vamos_staff using (true);

-- ---------------------------------------------------------------------------
-- (4) app.refund_intents_settle: the one rule that turns "what is open, what
--     went, what is owed" into bookings.refund_status. Internal helper: no grant
--     to any role; only the SECURITY DEFINER functions below call it.
--       open intents          -> failed if any failed, else processing
--       nothing open, refunded >= owed -> refunded
--       nothing open, decided batch    -> refunded (owed := refunded) if any
--                                         of it went, else back to pending_ops
--                                         with owed null (the team decides again)
--       nothing open, full batch       -> pending_ops, owed stays (still due)
-- ---------------------------------------------------------------------------
create function app.refund_intents_settle(p_booking_id pg_catalog.uuid)
returns pg_catalog.text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_b public.bookings%rowtype;
  v_open pg_catalog.int4;
  v_failed pg_catalog.int4;
  v_last_tier pg_catalog.text;
  v_last_batch pg_catalog.uuid;
  v_batch_sent pg_catalog.bool;
  v_owed pg_catalog.int4;
  v_refunded pg_catalog.int4;
  v_status pg_catalog.text;
begin
  select b.* into v_b from public.bookings as b where b.id = p_booking_id;

  select pg_catalog.count(*) filter (where i.state in ('intended', 'failed')),
         pg_catalog.count(*) filter (where i.state = 'failed')
    into v_open, v_failed
    from public.booking_refund_intents as i
   where i.booking_id = p_booking_id;

  v_owed := coalesce(v_b.refund_owed_rappen, 0);
  v_refunded := coalesce(v_b.refunded_rappen, 0);

  if v_open > 0 then
    v_status := case when v_failed > 0 then 'failed' else 'processing' end;
  elsif v_owed > 0 and v_refunded >= v_owed then
    v_status := 'refunded';
  else
    select i.tier, i.batch_id
      into v_last_tier, v_last_batch
      from public.booking_refund_intents as i
     where i.booking_id = p_booking_id
     order by i.id desc
     limit 1;

    if v_last_tier = 'decided' then
      select exists (
        select 1
          from public.booking_refund_intents as i
         where i.booking_id = p_booking_id
           and i.batch_id = v_last_batch
           and i.state = 'sent'
      ) into v_batch_sent;
      if v_batch_sent then
        v_status := 'refunded';
        update public.bookings
           set refund_owed_rappen = v_refunded::public.rappen
         where id = p_booking_id;
      else
        v_status := 'pending_ops';
        update public.bookings
           set refund_owed_rappen = null
         where id = p_booking_id;
      end if;
    elsif v_owed > 0 then
      v_status := 'pending_ops';
    else
      v_status := case when v_refunded > 0 then 'refunded' else v_b.refund_status end;
    end if;
  end if;

  update public.bookings
     set refund_status = v_status,
         updated_at = pg_catalog.now()
   where id = p_booking_id;

  return v_status;
end;
$$;

revoke all on function app.refund_intents_settle(pg_catalog.uuid) from public;

comment on function app.refund_intents_settle(pg_catalog.uuid) is
  '20-10: internal. Sets bookings.refund_status from the open intents, refunded_rappen and refund_owed_rappen. No caller outside ops_refund_intent_sent / ops_refund_intent_failed. No grant.';

-- ---------------------------------------------------------------------------
-- (5) ops_refund_plan: write down what will be sent, per payment. Nothing goes to
--     Stripe here. Open intents (intended / failed) are returned as they are and
--     nothing new is created, so a second press or a Retry never plans the same
--     money twice. p_percent = percent of each payment's CHARGED amount, capped at
--     what is left of it. p_amount_rappen = an exact amount for ONE payment (chosen,
--     or the only captured one), capped at what is left. Never both.
--     Full-tier rule: a booking that is pending_ops with something owed (cancelled
--     more than 24 h ahead) can only be refunded at 100 % of a payment's remainder.
--     EXECUTE vamos_system only (the route is withAdmin and passes claims.sub).
-- ---------------------------------------------------------------------------
create function public.ops_refund_plan(
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
begin
  v_reason := coalesce(p_reason, 'ops_cancel');
  if v_reason not in ('ops_cancel', 'customer_cancel', 'no_driver', 'no_show', 'post_trip') then
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

  -- Full tier: cancelled more than 24 h ahead, the whole refund is due, 100 % only.
  v_full := v_booking.refund_status = 'pending_ops' and coalesce(v_booking.refund_owed_rappen, 0) > 0;
  v_tier := case
              when v_full or (p_percent is null and p_amount_rappen is null) then 'full'
              else 'decided'
            end;

  for v_pay in
    select p.*
      from public.booking_payments as p
     where p.booking_id = v_booking.id
       and p.captured_at is not null
       and (p_payment_id is null or p.id = p_payment_id)
     order by p.id
       for update
  loop
    select coalesce(pg_catalog.sum(r.refund_rappen), 0)::pg_catalog.int4
      into v_refunded
      from public.booking_refunds as r
     where r.payment_id = v_pay.id;

    v_left := v_pay.charged_rappen - v_refunded;
    if v_left <= 0 then
      continue;
    end if;
    v_any_left := true;

    if p_amount_rappen is not null then
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
               when v_full then null
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
  '20-10 refunds by hand: plan a refund per captured payment (or one chosen payment) and write it as intended intents; no Stripe call. Open intents are returned as they are (resumed) and nothing new is created. p_percent = percent of each payment''s charged amount, capped at its remainder; p_amount_rappen = exact amount for one payment, capped at its remainder (more: refund-exceeds-remaining); never both (invalid-amount). Full-tier rule: pending_ops with owed > 0 accepts only 100 % of each remainder (full-refund-only). Sets refund_status processing and owed = greatest(owed, refunded + planned). Refusals: not-found, not-paid, already-refunded, invalid-amount, invalid-reason, nothing-to-retry, refund-exceeds-remaining, full-refund-only. EXECUTE vamos_system only.';

-- ---------------------------------------------------------------------------
-- (6) ops_refund_intent_sent: Stripe accepted the refund. Writes the booking_refunds
--     row, the event and the fee, marks the intent sent, settles the booking status.
--     Never refuses for "exceeds remaining": the money has left, the row must land.
--     Idempotent on the intent and on stripe_refund_id. EXECUTE vamos_system only.
-- ---------------------------------------------------------------------------
create function public.ops_refund_intent_sent(
  p_intent_id pg_catalog.int8,
  p_stripe_refund_id pg_catalog.text,
  p_stripe_fee_rappen public.rappen default null,
  p_payout_country pg_catalog.text default null,
  p_available_on pg_catalog.timestamptz default null
)
returns table (
  booking_id pg_catalog.uuid,
  refund_id pg_catalog.int8,
  payment_id pg_catalog.int8,
  refund_rappen pg_catalog.int4,
  contact_email pg_catalog.text,
  payer_email pg_catalog.text,
  contact_name pg_catalog.text,
  locale pg_catalog.text,
  reference pg_catalog.text,
  open_intents pg_catalog.int4,
  refunded_rappen pg_catalog.int4,
  due_rappen pg_catalog.int4,
  refund_status pg_catalog.text
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_int public.booking_refund_intents%rowtype;
  v_booking public.bookings%rowtype;
  v_pay public.booking_payments%rowtype;
  v_refund public.booking_refunds%rowtype;
  v_actor_label pg_catalog.text;
  v_hours pg_catalog.numeric(8,2);
  v_percent pg_catalog.numeric(5,2);
  v_status pg_catalog.text;
  v_open pg_catalog.int4;
begin
  if p_stripe_refund_id is null or pg_catalog.btrim(p_stripe_refund_id) = '' then
    raise exception 'stripe-refund-id-required' using errcode = 'P0001';
  end if;

  select i.* into v_int from public.booking_refund_intents as i where i.id = p_intent_id;
  if not found then
    raise exception 'not-found' using errcode = 'P0002';
  end if;

  select b.*
    into v_booking
    from public.bookings as b
   where b.id = v_int.booking_id
   for update;

  -- Re-read under the booking lock.
  select i.* into v_int from public.booking_refund_intents as i where i.id = p_intent_id for update;

  select p.* into v_pay from public.booking_payments as p where p.id = v_int.payment_id for update;

  select r.*
    into v_refund
    from public.booking_refunds as r
   where r.stripe_refund_id = p_stripe_refund_id;

  if not found and v_int.state = 'sent' and v_int.refund_id is not null then
    select r.* into v_refund from public.booking_refunds as r where r.id = v_int.refund_id;
  end if;

  if v_refund.id is null then
    v_percent := pg_catalog.round((v_int.amount_rappen::pg_catalog.numeric * 100) / v_pay.charged_rappen, 2);

    select coalesce(s.full_name, '')
      into v_actor_label
      from public.staff as s
     where s.user_id = v_int.actor_id;
    if v_actor_label is null then
      v_actor_label := '';
    end if;

    select coalesce(
             pg_catalog.round(
               (
                 pg_catalog.date_part('epoch', pg_catalog.min(l.original_scheduled_at) - pg_catalog.now())
                 / 3600
               )::pg_catalog.numeric,
               2
             ),
             0
           )
      into v_hours
      from public.booking_legs as l
     where l.booking_id = v_booking.id;

    insert into public.booking_refunds (
      booking_id, snapshot_id, payment_id, reason, basis_rappen, refund_percent,
      refund_rappen, tier_applied, hours_before, stripe_refund_id, decided_by,
      payout_country, available_on
    ) values (
      v_booking.id,
      v_pay.snapshot_id,
      v_pay.id,
      v_int.reason,
      v_pay.charged_rappen,
      v_percent,
      v_int.amount_rappen,
      case
        when v_int.decided_percent is null then
          pg_catalog.jsonb_build_object('source', 'ops_full', 'percent', 100, 'reason', v_int.reason)
        else
          pg_catalog.jsonb_build_object('source', 'ops_decided', 'percent', v_int.decided_percent, 'reason', v_int.reason)
      end,
      coalesce(v_hours, 0),
      p_stripe_refund_id,
      v_int.actor_id,
      p_payout_country,
      p_available_on
    )
    returning * into v_refund;

    if p_stripe_fee_rappen is not null and v_pay.stripe_fee_rappen is null then
      update public.booking_payments
         set stripe_fee_rappen = p_stripe_fee_rappen
       where id = v_pay.id
         and stripe_fee_rappen is null;
    end if;

    insert into public.booking_events (
      booking_id, kind, actor_kind, actor_id, actor_label, payment_id, refund_id, payload
    ) values (
      v_booking.id,
      'refund.issued',
      'staff',
      v_int.actor_id,
      v_actor_label,
      v_pay.id,
      v_refund.id,
      pg_catalog.jsonb_build_object(
        'via', 'ops',
        'stripe_refund_id', p_stripe_refund_id,
        'reason', v_int.reason,
        'refund_percent', v_percent,
        'intent_id', v_int.id
      )
    );

    update public.bookings
       set refunded_rappen = coalesce(refunded_rappen, 0) + v_refund.refund_rappen,
           updated_at = pg_catalog.now()
     where id = v_booking.id;
  end if;

  if v_int.state <> 'sent' or v_int.refund_id is distinct from v_refund.id then
    update public.booking_refund_intents
       set state = 'sent',
           stripe_refund_id = coalesce(stripe_refund_id, p_stripe_refund_id),
           refund_id = v_refund.id,
           updated_at = pg_catalog.now()
     where id = v_int.id;
    v_status := app.refund_intents_settle(v_booking.id);
  else
    select b.refund_status into v_status from public.bookings as b where b.id = v_booking.id;
  end if;

  select b.* into v_booking from public.bookings as b where b.id = v_booking.id;
  select pg_catalog.count(*)::pg_catalog.int4
    into v_open
    from public.booking_refund_intents as i
   where i.booking_id = v_booking.id
     and i.state in ('intended', 'failed');

  return query
    select v_booking.id,
           v_refund.id,
           v_refund.payment_id,
           v_refund.refund_rappen::pg_catalog.int4,
           v_booking.contact_email::pg_catalog.text,
           v_booking.payer_email::pg_catalog.text,
           v_booking.contact_name,
           v_booking.locale,
           v_booking.reference,
           v_open,
           coalesce(v_booking.refunded_rappen, 0)::pg_catalog.int4,
           greatest(
             coalesce(v_booking.refund_owed_rappen, 0) - coalesce(v_booking.refunded_rappen, 0), 0
           )::pg_catalog.int4,
           v_booking.refund_status;
  return;
end;
$$;

revoke all on function public.ops_refund_intent_sent(
  pg_catalog.int8, pg_catalog.text, public.rappen, pg_catalog.text, pg_catalog.timestamptz
) from public;

grant execute on function public.ops_refund_intent_sent(
  pg_catalog.int8, pg_catalog.text, public.rappen, pg_catalog.text, pg_catalog.timestamptz
) to vamos_system;

comment on function public.ops_refund_intent_sent(
  pg_catalog.int8, pg_catalog.text, public.rappen, pg_catalog.text, pg_catalog.timestamptz
) is
  '20-10 refunds by hand: Stripe accepted the refund of this intent. Inserts the booking_refunds row (with payout facts), the refund.issued event and the fee, adds to refunded_rappen, marks the intent sent, settles refund_status (processing / failed while intents are open; refunded when nothing is due; else pending_ops with the rest still due). Idempotent on the intent and on stripe_refund_id. Never refuses for an amount above the remainder: the money has left. EXECUTE vamos_system only.';

-- ---------------------------------------------------------------------------
-- (7) ops_refund_intent_failed: Stripe refused (or the call failed before it
--     answered). The intent stays open as 'failed' so Retry finds it; p_void gives
--     it up (Stripe says the charge is already refunded). No-op on a sent intent.
--     EXECUTE vamos_system only.
-- ---------------------------------------------------------------------------
create function public.ops_refund_intent_failed(
  p_intent_id pg_catalog.int8,
  p_error pg_catalog.text,
  p_void pg_catalog.bool default false
)
returns table (
  booking_id pg_catalog.uuid,
  intent_id pg_catalog.int8,
  state pg_catalog.text,
  attempts pg_catalog.int4,
  open_intents pg_catalog.int4,
  refunded_rappen pg_catalog.int4,
  due_rappen pg_catalog.int4,
  refund_status pg_catalog.text
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_int public.booking_refund_intents%rowtype;
  v_booking public.bookings%rowtype;
  v_open pg_catalog.int4;
begin
  select i.* into v_int from public.booking_refund_intents as i where i.id = p_intent_id;
  if not found then
    raise exception 'not-found' using errcode = 'P0002';
  end if;

  select b.* into v_booking from public.bookings as b where b.id = v_int.booking_id for update;
  select i.* into v_int from public.booking_refund_intents as i where i.id = p_intent_id for update;

  if v_int.state <> 'sent' then
    update public.booking_refund_intents
       set attempts = attempts + 1,
           last_error = p_error,
           state = case when coalesce(p_void, false) then 'void' else 'failed' end,
           updated_at = pg_catalog.now()
     where id = v_int.id
    returning * into v_int;
    perform app.refund_intents_settle(v_booking.id);
    select b.* into v_booking from public.bookings as b where b.id = v_booking.id;
  end if;

  select pg_catalog.count(*)::pg_catalog.int4
    into v_open
    from public.booking_refund_intents as i
   where i.booking_id = v_booking.id
     and i.state in ('intended', 'failed');

  return query
    select v_booking.id,
           v_int.id,
           v_int.state,
           v_int.attempts,
           v_open,
           coalesce(v_booking.refunded_rappen, 0)::pg_catalog.int4,
           greatest(
             coalesce(v_booking.refund_owed_rappen, 0) - coalesce(v_booking.refunded_rappen, 0), 0
           )::pg_catalog.int4,
           v_booking.refund_status;
  return;
end;
$$;

revoke all on function public.ops_refund_intent_failed(
  pg_catalog.int8, pg_catalog.text, pg_catalog.bool
) from public;

grant execute on function public.ops_refund_intent_failed(
  pg_catalog.int8, pg_catalog.text, pg_catalog.bool
) to vamos_system;

comment on function public.ops_refund_intent_failed(
  pg_catalog.int8, pg_catalog.text, pg_catalog.bool
) is
  '20-10 refunds by hand: Stripe did not send this intent. attempts + 1, last_error, state failed (open, Retry finds it) or void when p_void (closed, a new plan is possible); refund_status failed while a failed intent is open. No change on an intent already sent. EXECUTE vamos_system only.';


-- ---------------------------------------------------------------------------
-- (8) ops_refund_decide -- body of 20260928150000 unchanged except the full-tier refusal.
-- ---------------------------------------------------------------------------
drop function if exists public.ops_refund_decide(pg_catalog.uuid, pg_catalog.text);

create function public.ops_refund_decide(
  p_booking_id pg_catalog.uuid,
  p_decision pg_catalog.text
)
returns table (
  booking_id pg_catalog.uuid,
  refund_status pg_catalog.text,
  reference pg_catalog.text
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_booking public.bookings%rowtype;
  v_actor pg_catalog.uuid;
  v_actor_label pg_catalog.text;
  v_kind pg_catalog.text;
begin
  if not app.is_admin() then
    raise exception 'admin-only' using errcode = '42501';
  end if;

  if p_decision is null or p_decision not in ('decline', 'reject') then
    raise exception 'invalid-decision' using errcode = '22023';
  end if;

  select b.*
    into v_booking
    from public.bookings as b
   where b.id = p_booking_id
     and b.erased_at is null
   for update;

  if not found then
    raise exception 'not-found' using errcode = 'P0002';
  end if;

  if p_decision = 'decline' then
    if v_booking.refund_status <> 'pending_ops' then
      raise exception 'not-pending' using errcode = 'P0001';
    end if;
    -- 20-10 (owner answer): a booking cancelled more than 24 h ahead (pending_ops with
    -- something owed) is refunded in full. It cannot be declined.
    if coalesce(v_booking.refund_owed_rappen, 0) > 0 then
      raise exception 'full-refund-only' using errcode = 'P0001';
    end if;
    v_kind := 'refund.declined';
  else
    if v_booking.status not in (
         'completed'::public.booking_status,
         'partially_completed'::public.booking_status,
         'no_show'::public.booking_status
       ) then
      raise exception 'not-post-trip' using errcode = 'P0001';
    end if;
    if v_booking.refund_status <> 'none' then
      raise exception 'not-open' using errcode = 'P0001';
    end if;
    if not exists (
      select 1
        from public.booking_payments as p
       where p.booking_id = v_booking.id
         and p.captured_at is not null
    ) then
      raise exception 'not-paid' using errcode = 'P0001';
    end if;
    v_kind := 'refund.rejected';
  end if;

  v_actor := app.uid();
  select coalesce(s.full_name, '')
    into v_actor_label
    from public.staff as s
   where s.user_id = v_actor;
  if v_actor_label is null then
    v_actor_label := '';
  end if;

  update public.bookings
     set refund_status = 'declined',
         refund_owed_rappen = 0,
         updated_at = pg_catalog.now()
   where id = v_booking.id;

  insert into public.booking_events (
    booking_id,
    kind,
    actor_kind,
    actor_id,
    actor_label,
    payload
  ) values (
    v_booking.id,
    v_kind,
    'staff',
    v_actor,
    v_actor_label,
    pg_catalog.jsonb_build_object(
      'via', 'ops',
      'decision', p_decision,
      'previous_refund_status', v_booking.refund_status
    )
  );

  booking_id := v_booking.id;
  refund_status := 'declined';
  reference := v_booking.reference;
  return next;
end;
$$;

revoke all on function public.ops_refund_decide(pg_catalog.uuid, pg_catalog.text) from public;
grant execute on function public.ops_refund_decide(pg_catalog.uuid, pg_catalog.text) to vamos_staff;

comment on function public.ops_refund_decide(pg_catalog.uuid, pg_catalog.text) is
  '26.1-17 D-24/D-25: decline (a pending_ops refund) or reject (a post-trip request on a completed/partially_completed/no_show paid booking with refund_status none). Sets refund_status declined, refund_owed_rappen 0, writes refund.declined / refund.rejected with the admin as actor. No money moves. Requires app.is_admin() (42501 otherwise). 20-10: a pending_ops booking with refund_owed_rappen > 0 (cancelled more than 24 h ahead) cannot be declined (full-refund-only). EXECUTE: vamos_staff.';

commit;
