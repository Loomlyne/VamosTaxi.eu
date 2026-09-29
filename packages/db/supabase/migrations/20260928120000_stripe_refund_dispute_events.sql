-- 20260928120000_stripe_refund_dispute_events.sql
--
-- Plan 26.1-08. D-07: charge.refunded and charge.dispute.* reach the database.
-- Stripe stays the decision surface -- these two functions only mirror facts
-- Stripe already decided (a dashboard refund, a chargeback status) into
-- booking_refunds / a new booking_disputes table. An app-created refund
-- (26.1-05, metadata.vamos_source=app) is never recorded here -- it is
-- recorded by the app's own path (record_booking_refund / ops_refund_record /
-- checkout_duplicate_refund_record); this migration's stripe_charge_refunded_
-- record raises so the consumer retries until that row lands.
--
-- Owner applies this file in the SQL editor. No CHF amount, no `_rappen:
-- <number>` literal -- every value here is schema/logic, not money.

-- ---------------------------------------------------------------------------
-- (1) booking_refunds.reason: add stripe_dashboard.
-- ---------------------------------------------------------------------------
alter table public.booking_refunds
  drop constraint booking_refunds_reason_check;

alter table public.booking_refunds
  add constraint booking_refunds_reason_check
  check (reason in (
    'customer_cancel', 'ops_cancel', 'no_driver', 'modification_credit', 'no_show',
    'duplicate_charge', 'paid_after_cancel', 'test_booking', 'requote_superseded',
    'stripe_dashboard'
  ));

comment on constraint booking_refunds_reason_check on public.booking_refunds is
  '26.1-08 D-07: stripe_dashboard is additive -- a refund made in the Stripe dashboard (charge.refunded, not app-initiated) lands here.';

-- ---------------------------------------------------------------------------
-- (2) booking_disputes. Stripe is the decision surface; this row mirrors its
--     status (D-07). One row per stripe_dispute_id, updated in place as
--     Stripe's dispute status changes.
-- ---------------------------------------------------------------------------
create table public.booking_disputes (
  id bigint generated always as identity primary key,
  booking_id uuid not null references public.bookings(id) on delete restrict,
  payment_id bigint not null references public.booking_payments(id) on delete restrict,
  stripe_dispute_id text not null unique,
  status text not null,
  reason text,
  amount_rappen rappen,
  stripe_created timestamptz not null,
  updated_at timestamptz not null default now()
);

comment on table public.booking_disputes is
  '26.1-08 D-07: Stripe is the decision surface; this row mirrors its status. Written only by stripe_dispute_upsert (SECURITY DEFINER, vamos_system). Staff SELECT only -- no anon/customer access.';

create index booking_disputes_booking_idx
  on public.booking_disputes (booking_id, stripe_created desc);

alter table public.booking_disputes enable row level security;
alter table public.booking_disputes force row level security;

revoke all on table public.booking_disputes
  from public, anon, authenticated, vamos_guest, vamos_edge, vamos_public, vamos_checkout;

grant select on table public.booking_disputes to vamos_staff;

create policy booking_disputes_staff_gate on public.booking_disputes
  as restrictive for all to vamos_staff
  using ((select app.is_staff())) with check (false);

create policy booking_disputes_staff_read on public.booking_disputes
  for select to vamos_staff using (true);

-- ---------------------------------------------------------------------------
-- (3) stripe_charge_refunded_record. Idempotent on stripe_refund_id. An
--     app-tagged refund (p_app_source) is never recorded here -- it raises
--     app_refund_pending (P0002) so the consumer retries until the app's own
--     recorder has written the row, then this call becomes a no-op ('already').
--     A dashboard refund (p_app_source = false) inserts reason
--     'stripe_dashboard' and, unless the payment row is 'duplicate', applies
--     booking effects (refund_status only once refunds reach the full charge).
-- ---------------------------------------------------------------------------
create function public.stripe_charge_refunded_record(
  p_payment_intent_id pg_catalog.text,
  p_session_id pg_catalog.text,
  p_stripe_refund_id pg_catalog.text,
  p_refund_rappen public.rappen,
  p_created pg_catalog.timestamptz,
  p_app_source pg_catalog.bool
)
returns table (
  booking_id pg_catalog.uuid,
  refund_id pg_catalog.int8,
  outcome pg_catalog.text
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_pay public.booking_payments%rowtype;
  v_booking public.bookings%rowtype;
  v_refund public.booking_refunds%rowtype;
  v_percent pg_catalog.numeric(5,2);
begin
  if p_stripe_refund_id is null or pg_catalog.btrim(p_stripe_refund_id) = '' then
    raise exception 'stripe-refund-id-required' using errcode = 'P0001';
  end if;

  -- Idempotent no-op: already recorded, by the app's own path or by a prior
  -- (possibly retried) call to this function. T-26.1-27.
  select r.*
    into v_refund
    from public.booking_refunds as r
   where r.stripe_refund_id = p_stripe_refund_id;

  if found then
    return query select v_refund.booking_id, v_refund.id, 'already'::pg_catalog.text;
    return;
  end if;

  -- Resolve the exact payment row: the charge's PaymentIntent id first (the
  -- real pi_ written back at settle, D-05), then the Checkout Session id the
  -- consumer looked up for a legacy row that still stores cs_ in
  -- stripe_payment_intent_id.
  if p_payment_intent_id is not null then
    select bp.*
      into v_pay
      from public.booking_payments as bp
     where bp.stripe_payment_intent_id = p_payment_intent_id
       for update;
  end if;

  if v_pay.id is null and p_session_id is not null then
    select bp.*
      into v_pay
      from public.booking_payments as bp
     where bp.stripe_checkout_session_id = p_session_id
       for update;
  end if;

  if v_pay.id is null then
    raise exception 'payment_not_found' using errcode = 'P0002';
  end if;

  if p_app_source then
    -- The app's own recorder owns this refund's row (record_booking_refund /
    -- ops_refund_record / checkout_duplicate_refund_record, 26.1-05). It has
    -- not landed yet -- the consumer retries (30s backoff) until it has, at
    -- which point the stripe_refund_id lookup above turns this into a no-op.
    raise exception 'app_refund_pending' using errcode = 'P0002';
  end if;

  select b.*
    into v_booking
    from public.bookings as b
   where b.id = v_pay.booking_id
     for update;

  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  v_percent := case
    when v_pay.charged_rappen > 0
    then least(100::pg_catalog.numeric, pg_catalog.round(
      (p_refund_rappen::pg_catalog.numeric / v_pay.charged_rappen::pg_catalog.numeric) * 100, 2
    ))
    else 0
  end;

  insert into public.booking_refunds (
    booking_id,
    snapshot_id,
    payment_id,
    reason,
    basis_rappen,
    refund_percent,
    refund_rappen,
    tier_applied,
    hours_before,
    stripe_refund_id,
    decided_at
  ) values (
    v_booking.id,
    v_pay.snapshot_id,
    v_pay.id,
    'stripe_dashboard',
    v_pay.charged_rappen,
    v_percent,
    p_refund_rappen,
    pg_catalog.jsonb_build_object('rule', 'stripe_dashboard'),
    0,
    p_stripe_refund_id,
    coalesce(p_created, pg_catalog.now())
  )
  returning * into v_refund;

  -- A refund against a duplicate payment row counts only against that row --
  -- never the booking's own refund ledger (the booking was never charged
  -- twice from its own point of view; see checkout_duplicate_refund_record).
  -- refund_status flips to 'refunded' only once the booking's refunds reach
  -- the full charge; a partial dashboard refund only adds to refunded_rappen.
  if v_pay.status is distinct from 'duplicate' then
    update public.bookings
       set refunded_rappen = coalesce(refunded_rappen, 0) + p_refund_rappen,
           refund_status = case
             when coalesce(refunded_rappen, 0) + p_refund_rappen >= v_pay.charged_rappen
             then 'refunded'
             else refund_status
           end,
           updated_at = pg_catalog.now()
     where id = v_booking.id;
  end if;

  insert into public.booking_events (
    booking_id, kind, actor_kind, actor_label, payment_id, refund_id, payload
  ) values (
    v_booking.id,
    'refund.issued',
    'stripe',
    'Stripe dashboard',
    v_pay.id,
    v_refund.id,
    pg_catalog.jsonb_build_object(
      'via', 'stripe_charge_refunded_record',
      'stripe_refund_id', p_stripe_refund_id
    )
  );

  return query select v_booking.id, v_refund.id, 'recorded'::pg_catalog.text;
end;
$$;

revoke all on function public.stripe_charge_refunded_record(
  pg_catalog.text, pg_catalog.text, pg_catalog.text, public.rappen, pg_catalog.timestamptz, pg_catalog.bool
) from public;

grant execute on function public.stripe_charge_refunded_record(
  pg_catalog.text, pg_catalog.text, pg_catalog.text, public.rappen, pg_catalog.timestamptz, pg_catalog.bool
) to vamos_system;

comment on function public.stripe_charge_refunded_record(
  pg_catalog.text, pg_catalog.text, pg_catalog.text, public.rappen, pg_catalog.timestamptz, pg_catalog.bool
) is
  '26.1-08 D-07: idempotent on stripe_refund_id. p_app_source refuses with app_refund_pending (P0002) so the consumer retries until the app''s own recorder has written the row. Otherwise inserts reason stripe_dashboard and applies booking refund effects unless the payment is duplicate. EXECUTE: vamos_system only.';

-- ---------------------------------------------------------------------------
-- (4) stripe_dispute_upsert. Inserts then updates the same row keyed by
--     stripe_dispute_id; an older p_stripe_created never overwrites a newer
--     status (T-26.1-29).
-- ---------------------------------------------------------------------------
create function public.stripe_dispute_upsert(
  p_stripe_dispute_id pg_catalog.text,
  p_payment_intent_id pg_catalog.text,
  p_session_id pg_catalog.text,
  p_status pg_catalog.text,
  p_reason pg_catalog.text,
  p_amount_rappen public.rappen,
  p_stripe_created pg_catalog.timestamptz
)
returns table (
  booking_id pg_catalog.uuid,
  dispute_id pg_catalog.int8
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_pay public.booking_payments%rowtype;
  v_existing public.booking_disputes%rowtype;
  v_row public.booking_disputes%rowtype;
begin
  if p_stripe_dispute_id is null or pg_catalog.btrim(p_stripe_dispute_id) = '' then
    raise exception 'stripe-dispute-id-required' using errcode = 'P0001';
  end if;

  select d.*
    into v_existing
    from public.booking_disputes as d
   where d.stripe_dispute_id = p_stripe_dispute_id
     for update;

  if found then
    if p_stripe_created < v_existing.stripe_created then
      -- Out-of-order delivery: an older status never overwrites a newer one.
      return query select v_existing.booking_id, v_existing.id;
      return;
    end if;

    update public.booking_disputes
       set status = p_status,
           reason = coalesce(p_reason, reason),
           amount_rappen = coalesce(p_amount_rappen, amount_rappen),
           stripe_created = p_stripe_created,
           updated_at = pg_catalog.now()
     where id = v_existing.id
    returning * into v_row;

    return query select v_row.booking_id, v_row.id;
    return;
  end if;

  if p_payment_intent_id is not null then
    select bp.*
      into v_pay
      from public.booking_payments as bp
     where bp.stripe_payment_intent_id = p_payment_intent_id
       for update;
  end if;

  if v_pay.id is null and p_session_id is not null then
    select bp.*
      into v_pay
      from public.booking_payments as bp
     where bp.stripe_checkout_session_id = p_session_id
       for update;
  end if;

  if v_pay.id is null then
    raise exception 'payment_not_found' using errcode = 'P0002';
  end if;

  insert into public.booking_disputes (
    booking_id, payment_id, stripe_dispute_id, status, reason, amount_rappen, stripe_created
  ) values (
    v_pay.booking_id, v_pay.id, p_stripe_dispute_id, p_status, p_reason, p_amount_rappen, p_stripe_created
  )
  returning * into v_row;

  return query select v_row.booking_id, v_row.id;
end;
$$;

revoke all on function public.stripe_dispute_upsert(
  pg_catalog.text, pg_catalog.text, pg_catalog.text, pg_catalog.text, pg_catalog.text, public.rappen, pg_catalog.timestamptz
) from public;

grant execute on function public.stripe_dispute_upsert(
  pg_catalog.text, pg_catalog.text, pg_catalog.text, pg_catalog.text, pg_catalog.text, public.rappen, pg_catalog.timestamptz
) to vamos_system;

comment on function public.stripe_dispute_upsert(
  pg_catalog.text, pg_catalog.text, pg_catalog.text, pg_catalog.text, pg_catalog.text, public.rappen, pg_catalog.timestamptz
) is
  '26.1-08 D-07: inserts then updates one row per stripe_dispute_id; an older p_stripe_created never overwrites a newer status. EXECUTE: vamos_system only.';
