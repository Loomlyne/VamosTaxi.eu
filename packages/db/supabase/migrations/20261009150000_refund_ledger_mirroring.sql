-- 20261009150000_refund_ledger_mirroring.sql
--
-- J7 (payments review 2026-10-09). Findings: W6-05, W6-06, W5-15, W5-05, W5-06, W6-07 (database half),
-- W6-09, W6-16.
--
--   (1)  booking_refund_reversals: a refund Stripe accepted (and the app or the dashboard recorded) that
--        Stripe later reports failed or canceled. booking_refunds is append-only, so the failure is a
--        separate insert-only row; every sum of refunds that decides what is still refundable ignores a
--        refund that has a reversal row. [W6-05]
--   (2)  booking_events.kind gains refund.failed. The constraint is read from the database and the kind
--        appended, so another migration's kinds are never dropped. [W6-05]
--   (3)  tg_refund_cap: refunded <= charged per payment, enforced by a trigger on every insert into
--        booking_refunds, so every writer (current and future) is capped. [W5-05]
--   (4)  app.booking_paid_net and ops_refund_plan read the refunds net of reversals. [W6-05]
--   (5)  stripe_refund_failed_record: mirrors refund.failed / refund.updated / charge.refund.updated. The
--        reversal is written, bookings.refunded_rappen goes back down, the intent of an app refund is
--        reopened (state failed, so Retry sends it again under a new idempotency key) and the booking
--        shows the refund as due again. [W6-05]
--   (6)  stripe_charge_refunded_record: refund_status becomes refunded only when the booking's refunds
--        reach the booking's captured total (all payments), not one payment's charge. [W6-06, W5-15]
--   (7)  stripe_dispute_upsert also returns the booking reference, the status and alert_pending (the status
--        stored has not been mailed to ops yet); stripe_dispute_alerted records the mail. A failed mail is
--        retried with the event, a sent one is never repeated. Same for a reversed refund
--        (stripe_refund_failed_record.alert_pending, stripe_refund_failure_alerted). [W6-07, W6-05]
--   (8)  staff_erase_unpaid_booking: staff erase of an unpaid booking re-checks "no captured payment"
--        under the payment and booking locks, in the same transaction as the erase. [W6-09]
--   (9)  manage_booking_cancel refuses a booking with no captured payment (unpaid_use_hard_delete), as the
--        signed-in route does. [W6-16]
--   (10) EXECUTE revoked from vamos_system on the three legacy refund writers no app code calls
--        (ops_refund_record, record_booking_refund, booking_edit_refund_record). [W5-06]
--
-- Lock order everywhere in this file: payment row, then booking row.
-- One transaction: apply it verbatim as a whole. Not applied to any hosted database by the builder.
begin;

-- ---------------------------------------------------------------------------
-- (1) booking_refund_reversals
-- ---------------------------------------------------------------------------
create table public.booking_refund_reversals (
  refund_id        pg_catalog.int8 primary key references public.booking_refunds(id) on delete restrict,
  booking_id       pg_catalog.uuid not null references public.bookings(id) on delete restrict,
  payment_id       pg_catalog.int8 not null references public.booking_payments(id) on delete restrict,
  stripe_refund_id pg_catalog.text not null unique,
  stripe_status    pg_catalog.text not null check (stripe_status in ('failed', 'canceled')),
  failure_reason   pg_catalog.text,
  reversed_rappen  public.rappen not null,
  stripe_created   pg_catalog.timestamptz not null,
  recorded_at      pg_catalog.timestamptz not null default pg_catalog.now(),
  alert_sent_at    pg_catalog.timestamptz
);

comment on table public.booking_refund_reversals is
  'J7 W6-05: a refund that was recorded in booking_refunds and that Stripe later reported failed or canceled. Insert-only, except that alert_sent_at may be set once (the ops mail went out). Sums that decide what is still refundable skip a refund with a row here. Written only by stripe_refund_failed_record (SECURITY DEFINER, vamos_system). Staff SELECT only.';

create index booking_refund_reversals_booking_idx
  on public.booking_refund_reversals (booking_id);
create index booking_refund_reversals_payment_idx
  on public.booking_refund_reversals (payment_id);

-- Insert-only, with one carve-out: alert_sent_at goes from null to a time, nothing else changes.
create function public.tg_refund_reversal_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and old.alert_sent_at is null
     and new.alert_sent_at is not null
     and pg_catalog.to_jsonb(new) - 'alert_sent_at' = pg_catalog.to_jsonb(old) - 'alert_sent_at' then
    return new;
  end if;
  raise exception 'booking_refund_reversals is append-only: % is not permitted', tg_op
    using errcode = 'restrict_violation';
end;
$$;

revoke all on function public.tg_refund_reversal_immutable() from public;

create trigger booking_refund_reversals_immutable
  before update or delete on public.booking_refund_reversals
  for each row execute function public.tg_refund_reversal_immutable();
create trigger booking_refund_reversals_no_truncate
  before truncate on public.booking_refund_reversals
  execute function public.tg_refund_reversal_immutable();

-- booking_disputes: the status the ops mail was last sent for (W6-07).
alter table public.booking_disputes add column alerted_status pg_catalog.text;
comment on column public.booking_disputes.alerted_status is
  'J7 W6-07: the dispute status ops was last mailed about (stripe_dispute_alerted). stripe_dispute_upsert reports alert_pending while it differs from status.';

alter table public.booking_refund_reversals enable row level security;
alter table public.booking_refund_reversals force row level security;

revoke all on table public.booking_refund_reversals
  from public, anon, authenticated, vamos_guest, vamos_edge, vamos_public, vamos_checkout;

grant select on table public.booking_refund_reversals to vamos_staff;

create policy booking_refund_reversals_staff_gate on public.booking_refund_reversals
  as restrictive for all to vamos_staff
  using ((select app.is_staff())) with check (false);

create policy booking_refund_reversals_staff_read on public.booking_refund_reversals
  for select to vamos_staff using (true);

-- ---------------------------------------------------------------------------
-- (2) booking_events.kind: add refund.failed to whatever the constraint holds now.
-- ---------------------------------------------------------------------------
do $$
declare
  v_def pg_catalog.text;
begin
  select pg_catalog.pg_get_constraintdef(c.oid)
    into v_def
    from pg_catalog.pg_constraint as c
   where c.conrelid = 'public.booking_events'::pg_catalog.regclass
     and c.conname = 'booking_events_kind_check';

  if v_def is null then
    raise exception 'booking_events_kind_check not found';
  end if;

  if v_def not like '%''refund.failed''%' then
    -- "CHECK ((kind = ANY (ARRAY['a'::text, ...])))": put the new kind first in the array.
    v_def := pg_catalog.replace(v_def, 'ARRAY[', 'ARRAY[''refund.failed''::text, ');
    execute 'alter table public.booking_events drop constraint booking_events_kind_check';
    execute 'alter table public.booking_events add constraint booking_events_kind_check ' || v_def;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- (3) tg_refund_cap: refunded <= charged per payment (W5-05). The payment row is locked first (the order
--     every writer already uses); a refund with a reversal row no longer counts.
-- ---------------------------------------------------------------------------
create function public.tg_refund_cap()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_charged pg_catalog.int8;
  v_sum pg_catalog.int8;
begin
  select p.charged_rappen::pg_catalog.int8
    into v_charged
    from public.booking_payments as p
   where p.id = new.payment_id
     for update;

  select coalesce(pg_catalog.sum(r.refund_rappen), 0)::pg_catalog.int8
    into v_sum
    from public.booking_refunds as r
   where r.payment_id = new.payment_id
     and not exists (select 1 from public.booking_refund_reversals as x where x.refund_id = r.id);

  if v_sum + new.refund_rappen::pg_catalog.int8 > v_charged then
    raise exception 'refund-exceeds-captured' using errcode = 'P0001',
      detail = 'refunded may never exceed what was charged on the payment';
  end if;
  return new;
end;
$$;

revoke all on function public.tg_refund_cap() from public;

comment on function public.tg_refund_cap() is
  'J7 W5-05: BEFORE INSERT on booking_refunds. Locks the payment row, then refuses a refund that would take the payment''s refunds (net of reversals) above its charged_rappen. Trigger function, no grant.';

create trigger booking_refunds_cap
  before insert on public.booking_refunds
  for each row execute function public.tg_refund_cap();

-- ---------------------------------------------------------------------------
-- (4) app.booking_paid_net and ops_refund_plan: refunds net of reversals.
-- ---------------------------------------------------------------------------
create or replace function app.booking_paid_net(p_booking_id pg_catalog.uuid)
returns pg_catalog.int4
language sql
stable
security definer
set search_path = ''
as $$
  select (
    coalesce((select pg_catalog.sum(p.charged_rappen)
                from public.booking_payments as p
               where p.booking_id = p_booking_id
                 and p.captured_at is not null), 0)
    - coalesce((select pg_catalog.sum(r.refund_rappen)
                  from public.booking_refunds as r
                 where r.booking_id = p_booking_id
                   and not exists (select 1 from public.booking_refund_reversals as x where x.refund_id = r.id)), 0)
  )::pg_catalog.int4
$$;

revoke all on function app.booking_paid_net(pg_catalog.uuid) from public;

comment on function app.booking_paid_net(pg_catalog.uuid) is
  '26.2 P1 + J7: sum of captured charged_rappen minus sum of booking_refunds.refund_rappen (refunds with a reversal row do not count) for one booking. No grant.';

-- ops_refund_plan v3: body of 20261007280000 (payment locks first, then the booking); the only change is the
-- refunded sum, which skips a refund that has a reversal row.
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

  -- 26.2 P1 credit: a change on a live booking left an amount due (pending_ops, owed > refunded).
  v_credit := v_booking.refund_status = 'pending_ops'
              and coalesce(v_booking.refund_owed_rappen, 0) > coalesce(v_booking.refunded_rappen, 0)
              and v_booking.status not in ('cancelled'::public.booking_status,
                                           'partially_cancelled'::public.booking_status,
                                           'refunded'::public.booking_status);
  v_due_left := case
                  when v_credit then coalesce(v_booking.refund_owed_rappen, 0) - coalesce(v_booking.refunded_rappen, 0)
                  else 0
                end;

  if v_credit and p_percent is not null then
    raise exception 'invalid-amount' using errcode = '22023',
      detail = 'a refund due from a change is an exact amount';
  end if;

  v_reason := coalesce(p_reason, case when v_credit then 'modification_credit' else 'ops_cancel' end);

  -- Full tier: cancelled more than 24 h ahead, the whole refund is due, 100 % only.
  v_full := not v_credit
            and v_booking.refund_status = 'pending_ops' and coalesce(v_booking.refund_owed_rappen, 0) > 0;
  v_tier := case
              when v_credit then 'credit'
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

    if v_credit then
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
  '20-10 refunds by hand + 26.2 P1 credit tier + J7: plan a refund per captured payment (or one chosen payment) and write it as intended intents; no Stripe call. What is left of a payment is its charge minus its refunds that Stripe did not later fail (booking_refund_reversals). Open intents are returned as they are (resumed) and nothing new is created. p_percent = percent of each payment''s charged amount, capped at its remainder; p_amount_rappen = exact amount for one payment, capped at its remainder (more: refund-exceeds-remaining); never both (invalid-amount). Full-tier rule: a cancelled booking pending_ops with owed > 0 accepts only 100 % of each remainder (full-refund-only). Credit tier (26.2 P1): a live booking pending_ops with owed > refunded refunds exactly what is due (owed - refunded): no percentage (invalid-amount), an exact amount up to what is due, or what is due spread over the payments; reason modification_credit; tier credit. Sets refund_status processing and owed = greatest(owed, refunded + planned). Refusals: not-found, not-paid, already-refunded, invalid-amount, invalid-reason, nothing-to-retry, refund-exceeds-remaining, full-refund-only. EXECUTE vamos_system only.';

-- ---------------------------------------------------------------------------
-- (5) stripe_refund_failed_record: Stripe says a refund failed or was canceled.
--     Idempotent: a refund that already has a reversal row answers 'already'. A refund the database
--     never recorded answers 'unknown' (nothing to undo), except an app-made one (p_app_source), which
--     raises app_refund_pending (P0002) so the consumer retries until the app's own row has landed.
--     Effects, for a refund that counted against the booking (not a duplicate-charge refund, not on a
--     duplicate payment row): refunded_rappen goes back down; an app refund's intent is reopened (state
--     failed, attempts + 1, last_error 'stripe:...' so the retry uses a new idempotency key) and
--     refund_status is recomputed by app.refund_intents_settle (failed while an intent is open); a refund
--     without an intent (dashboard) that had closed the booking as refunded puts it back to pending_ops
--     with the amount owed again. A booking_events row refund.failed is written either way.
--     EXECUTE vamos_system only.
-- ---------------------------------------------------------------------------
create function public.stripe_refund_failed_record(
  p_stripe_refund_id pg_catalog.text,
  p_status pg_catalog.text,
  p_failure_reason pg_catalog.text,
  p_app_source pg_catalog.bool,
  p_created pg_catalog.timestamptz
)
returns table (
  booking_id pg_catalog.uuid,
  refund_id pg_catalog.int8,
  outcome pg_catalog.text,
  reference pg_catalog.text,
  alert_pending pg_catalog.bool
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_refund public.booking_refunds%rowtype;
  v_pay public.booking_payments%rowtype;
  v_booking public.bookings%rowtype;
  v_int public.booking_refund_intents%rowtype;
  v_rev public.booking_refund_reversals%rowtype;
  v_counted pg_catalog.bool;
  v_before pg_catalog.int4;
  v_other_open pg_catalog.bool;
begin
  if p_stripe_refund_id is null or pg_catalog.btrim(p_stripe_refund_id) = '' then
    raise exception 'stripe-refund-id-required' using errcode = 'P0001';
  end if;
  if p_status is null or p_status not in ('failed', 'canceled') then
    raise exception 'invalid-status' using errcode = 'P0001';
  end if;

  select r.*
    into v_refund
    from public.booking_refunds as r
   where r.stripe_refund_id = p_stripe_refund_id;

  if not found then
    if p_app_source then
      raise exception 'app_refund_pending' using errcode = 'P0002';
    end if;
    return query select null::pg_catalog.uuid, null::pg_catalog.int8, 'unknown'::pg_catalog.text, null::pg_catalog.text, false;
    return;
  end if;

  -- Lock order: the payment, then the booking.
  select p.* into v_pay from public.booking_payments as p where p.id = v_refund.payment_id for update;
  select b.* into v_booking from public.bookings as b where b.id = v_refund.booking_id for update;

  select x.* into v_rev from public.booking_refund_reversals as x where x.refund_id = v_refund.id;
  if found then
    return query select v_booking.id, v_refund.id, 'already'::pg_catalog.text, v_booking.reference, (v_rev.alert_sent_at is null);
    return;
  end if;

  insert into public.booking_refund_reversals (
    refund_id, booking_id, payment_id, stripe_refund_id, stripe_status, failure_reason,
    reversed_rappen, stripe_created
  ) values (
    v_refund.id, v_booking.id, v_pay.id, p_stripe_refund_id, p_status,
    pg_catalog.left(p_failure_reason, 200), v_refund.refund_rappen,
    coalesce(p_created, pg_catalog.now())
  );

  -- Did this refund raise bookings.refunded_rappen when it was recorded? A duplicate-charge refund and
  -- anything on a duplicate payment row never did (checkout_duplicate_refund_record,
  -- stripe_charge_refunded_record).
  v_counted := v_refund.reason is distinct from 'duplicate_charge' and v_pay.status is distinct from 'duplicate';

  if v_counted then
    v_before := coalesce(v_booking.refunded_rappen, 0);
    update public.bookings
       set refunded_rappen = greatest(v_before - v_refund.refund_rappen, 0)::public.rappen,
           updated_at = pg_catalog.now()
     where id = v_booking.id;

    select i.*
      into v_int
      from public.booking_refund_intents as i
     where i.refund_id = v_refund.id
        or i.stripe_refund_id = p_stripe_refund_id
     order by i.id desc
     limit 1
       for update;

    if found then
      select exists (
        select 1
          from public.booking_refund_intents as o
         where o.payment_id = v_int.payment_id
           and o.id <> v_int.id
           and o.state in ('intended', 'failed')
      ) into v_other_open;

      update public.booking_refund_intents
         set state = case when v_other_open then 'void' else 'failed' end,
             attempts = attempts + 1,
             last_error = 'stripe:refund_' || p_status || coalesce(': ' || pg_catalog.left(p_failure_reason, 120), ''),
             refund_id = null,
             stripe_refund_id = null,
             updated_at = pg_catalog.now()
       where id = v_int.id;
      perform app.refund_intents_settle(v_booking.id);
    elsif v_booking.refund_status = 'refunded' then
      -- A refund made without an intent (dashboard) had closed the booking: it is owed again.
      update public.bookings
         set refund_status = 'pending_ops',
             refund_owed_rappen = v_before::public.rappen,
             updated_at = pg_catalog.now()
       where id = v_booking.id;
    end if;
  end if;

  insert into public.booking_events (
    booking_id, kind, actor_kind, actor_label, payment_id, refund_id, payload
  ) values (
    v_booking.id,
    'refund.failed',
    'stripe',
    'Stripe',
    v_pay.id,
    v_refund.id,
    pg_catalog.jsonb_build_object(
      'via', 'stripe_refund_failed_record',
      'stripe_refund_id', p_stripe_refund_id,
      'stripe_status', p_status,
      'counted', v_counted
    )
  );

  return query select v_booking.id, v_refund.id, 'reversed'::pg_catalog.text, v_booking.reference, true;
end;
$$;

revoke all on function public.stripe_refund_failed_record(
  pg_catalog.text, pg_catalog.text, pg_catalog.text, pg_catalog.bool, pg_catalog.timestamptz
) from public;

grant execute on function public.stripe_refund_failed_record(
  pg_catalog.text, pg_catalog.text, pg_catalog.text, pg_catalog.bool, pg_catalog.timestamptz
) to vamos_system;

comment on function public.stripe_refund_failed_record(
  pg_catalog.text, pg_catalog.text, pg_catalog.text, pg_catalog.bool, pg_catalog.timestamptz
) is
  'J7 W6-05: Stripe reports a recorded refund failed or canceled. Writes booking_refund_reversals (idempotent, outcome already), lowers bookings.refunded_rappen when the refund had raised it, reopens the refund intent of an app refund (state failed, Retry sends it again) or puts a dashboard-refunded booking back to pending_ops, and writes booking_events refund.failed. An unknown refund answers unknown; an app-made unknown one raises app_refund_pending (P0002). EXECUTE vamos_system only.';

-- stripe_refund_failure_alerted: the ops mail about a reversed refund went out (once).
create function public.stripe_refund_failure_alerted(p_stripe_refund_id pg_catalog.text)
returns pg_catalog.void
language sql
security definer
set search_path = ''
as $$
  update public.booking_refund_reversals
     set alert_sent_at = pg_catalog.now()
   where stripe_refund_id = p_stripe_refund_id
     and alert_sent_at is null;
$$;

revoke all on function public.stripe_refund_failure_alerted(pg_catalog.text) from public;
grant execute on function public.stripe_refund_failure_alerted(pg_catalog.text) to vamos_system;

comment on function public.stripe_refund_failure_alerted(pg_catalog.text) is
  'J7 W6-05: marks the ops mail for a reversed refund as sent (once). EXECUTE vamos_system only.';

-- ---------------------------------------------------------------------------
-- (6) stripe_charge_refunded_record v2 (W6-06, W5-15). Body of 20260928120000; the only change is what
--     refund_status is compared with: the booking's captured total over all its (non-duplicate)
--     payments, not the one payment's charge.
-- ---------------------------------------------------------------------------
create or replace function public.stripe_charge_refunded_record(
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
  v_total pg_catalog.int8;
begin
  if p_stripe_refund_id is null or pg_catalog.btrim(p_stripe_refund_id) = '' then
    raise exception 'stripe-refund-id-required' using errcode = 'P0001';
  end if;

  select r.*
    into v_refund
    from public.booking_refunds as r
   where r.stripe_refund_id = p_stripe_refund_id;

  if found then
    return query select v_refund.booking_id, v_refund.id, 'already'::pg_catalog.text;
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

  if p_app_source then
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

  -- A refund against a duplicate payment row counts only against that row. For every other payment the
  -- booking reads refunded once its refunds reach everything it captured, over ALL its payments (W6-06):
  -- a refund of one payment of a trip-plus-difference booking never closes the whole booking.
  if v_pay.status is distinct from 'duplicate' then
    select coalesce(pg_catalog.sum(p.charged_rappen), 0)::pg_catalog.int8
      into v_total
      from public.booking_payments as p
     where p.booking_id = v_booking.id
       and p.captured_at is not null
       and p.status is distinct from 'duplicate';

    update public.bookings
       set refunded_rappen = coalesce(refunded_rappen, 0) + p_refund_rappen,
           refund_status = case
             when v_total > 0
              and coalesce(refunded_rappen, 0)::pg_catalog.int8 + p_refund_rappen::pg_catalog.int8 >= v_total
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
  '26.1-08 D-07 + J7: idempotent on stripe_refund_id. p_app_source refuses with app_refund_pending (P0002) so the consumer retries until the app''s own recorder has written the row. Otherwise inserts reason stripe_dashboard (the refund cap trigger applies) and, unless the payment is duplicate, raises bookings.refunded_rappen; refund_status becomes refunded only when the booking''s refunds reach its captured total over all its non-duplicate payments. EXECUTE: vamos_system only.';

-- ---------------------------------------------------------------------------
-- (7) stripe_dispute_upsert v2 (W6-07): same arguments and rules as 20260928120000 (an older
--     p_stripe_created never overwrites a newer status), but it also returns the booking reference,
--     the status now stored and `alert_pending`: true while the stored status is not the one ops was last
--     mailed about (a new dispute, or a status that moved). The Worker mails ops, then calls
--     stripe_dispute_alerted; a failed mail leaves it pending, so the event is retried and the mail with it.
--     The return type differs, so the function is dropped first.
-- ---------------------------------------------------------------------------
drop function public.stripe_dispute_upsert(
  pg_catalog.text, pg_catalog.text, pg_catalog.text, pg_catalog.text, pg_catalog.text, public.rappen, pg_catalog.timestamptz
);

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
  dispute_id pg_catalog.int8,
  reference pg_catalog.text,
  status pg_catalog.text,
  alert_pending pg_catalog.bool
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
  v_reference pg_catalog.text;
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
    select b.reference into v_reference from public.bookings as b where b.id = v_existing.booking_id;

    if p_stripe_created < v_existing.stripe_created then
      -- Out-of-order delivery: an older status never overwrites a newer one.
      return query select v_existing.booking_id, v_existing.id, v_reference, v_existing.status,
                          (v_existing.alerted_status is distinct from v_existing.status);
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

    return query select v_row.booking_id, v_row.id, v_reference, v_row.status,
                        (v_row.alerted_status is distinct from v_row.status);
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

  select b.reference into v_reference from public.bookings as b where b.id = v_row.booking_id;

  return query select v_row.booking_id, v_row.id, v_reference, v_row.status, true;
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
  '26.1-08 D-07 + J7: inserts then updates one row per stripe_dispute_id; an older p_stripe_created never overwrites a newer status. Returns the booking reference, the stored status and alert_pending (the stored status is not the one ops was last mailed about). EXECUTE: vamos_system only.';

-- stripe_dispute_alerted: the ops mail for this dispute status went out.
create function public.stripe_dispute_alerted(
  p_stripe_dispute_id pg_catalog.text,
  p_status pg_catalog.text
)
returns pg_catalog.void
language sql
security definer
set search_path = ''
as $$
  update public.booking_disputes
     set alerted_status = p_status
   where stripe_dispute_id = p_stripe_dispute_id
     and status = p_status;
$$;

revoke all on function public.stripe_dispute_alerted(pg_catalog.text, pg_catalog.text) from public;
grant execute on function public.stripe_dispute_alerted(pg_catalog.text, pg_catalog.text) to vamos_system;

comment on function public.stripe_dispute_alerted(pg_catalog.text, pg_catalog.text) is
  'J7 W6-07: records that ops was mailed about this dispute status (only while it is still the stored status). EXECUTE vamos_system only.';

-- ---------------------------------------------------------------------------
-- (8) staff_erase_unpaid_booking (W6-09): erase a booking only while it has no captured payment, and
--     look under the locks. Payments of the booking first (settle's order), then the booking; a Stripe
--     settle that commits while this waits is seen by the re-check, so a paid booking is never erased.
--     Outcomes: erased / paid (a payment is captured: nothing changed) / not_found. Staff only.
-- ---------------------------------------------------------------------------
create function public.staff_erase_unpaid_booking(p_key pg_catalog.text)
returns table (
  booking_id pg_catalog.uuid,
  outcome pg_catalog.text
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_id pg_catalog.uuid;
  v_locked pg_catalog.int4;
begin
  if not app.is_staff() then
    raise exception 'staff-only' using errcode = '42501';
  end if;

  select b.id
    into v_id
    from public.bookings as b
   where b.erased_at is null
     and (b.id::pg_catalog.text = p_key or b.reference = p_key)
   limit 1;

  if v_id is null then
    return query select null::pg_catalog.uuid, 'not_found'::pg_catalog.text;
    return;
  end if;

  select pg_catalog.count(*)::pg_catalog.int4
    into v_locked
    from (select p.id
            from public.booking_payments as p
           where p.booking_id = v_id
           order by p.id
             for update) as l;

  perform 1
     from public.bookings as b
    where b.id = v_id
      and b.erased_at is null
      for update;

  if not found then
    return query select null::pg_catalog.uuid, 'not_found'::pg_catalog.text;
    return;
  end if;

  if exists (
    select 1
      from public.booking_payments as p
     where p.booking_id = v_id
       and p.captured_at is not null
  ) then
    return query select v_id, 'paid'::pg_catalog.text;
    return;
  end if;

  update public.bookings
     set erased_at = pg_catalog.now(),
         updated_at = pg_catalog.now()
   where id = v_id;

  return query select v_id, 'erased'::pg_catalog.text;
end;
$$;

revoke all on function public.staff_erase_unpaid_booking(pg_catalog.text) from public;
grant execute on function public.staff_erase_unpaid_booking(pg_catalog.text) to vamos_staff;

comment on function public.staff_erase_unpaid_booking(pg_catalog.text) is
  'J7 W6-09: soft-erase a booking (by id or reference) only while no payment of it is captured, re-checked under the payment and booking locks in the same transaction. Outcomes erased, paid, not_found. app.is_staff() required. EXECUTE vamos_staff.';

-- ---------------------------------------------------------------------------
-- (9) manage_booking_cancel v2 (W6-16): body of 20261005100000. A booking with no captured payment is
--     refused (unpaid_use_hard_delete), as customer_paid_cancel does: the guest route used to cancel it
--     without closing its Stripe session or releasing its coupon. Only a booking still quote or pending is
--     refused (a paid booking is confirmed in the same transaction as its capture).
-- ---------------------------------------------------------------------------
create or replace function public.manage_booking_cancel(
  p_token_hash bytea,
  p_leg_seq smallint default null
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
begin
  select b.*
    into v
    from public.bookings as b
    join public.booking_access_tokens as t on t.booking_id = b.id
   where t.token_hash = p_token_hash
     and t.purpose = 'manage'
     and t.revoked_at is null
     and t.expires_at > pg_catalog.now()
   for update of b;

  if v.id is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  -- W6-16: an unpaid booking (quote or pending, nothing captured) is not cancelled here.
  if v.status in ('quote'::public.booking_status, 'pending'::public.booking_status)
     and not exists (
       select 1
         from public.booking_payments as p
        where p.booking_id = v.id
          and p.captured_at is not null
     ) then
    raise exception 'unpaid_use_hard_delete' using errcode = 'P0001';
  end if;

  return query
    select *
      from app.apply_customer_cancel(
        v.id,
        p_leg_seq,
        'guest',
        'manage link',
        'manage_link'
      );

  update public.booking_access_tokens
     set last_used_at = pg_catalog.now(),
         use_count = use_count + 1
   where token_hash = p_token_hash;
end;
$$;

revoke all on function public.manage_booking_cancel(bytea, smallint) from public;
grant execute on function public.manage_booking_cancel(bytea, smallint) to vamos_guest;

comment on function public.manage_booking_cancel(bytea, smallint) is
  '09-02 D-02 + J7 W6-16: guest cancel. After pickup allowed. Completed/no_show not_cancellable. A booking still quote or pending with no captured payment is refused (unpaid_use_hard_delete, P0001). Returns PI; never INSERT booking_refunds. auto_full refund_status stays none until Worker processing.';

-- ---------------------------------------------------------------------------
-- (10) The three legacy refund writers no application code calls (checked: apps/ and packages/ hold
--      only tests that assert they are NOT called). Their EXECUTE goes; the live refund path is
--      ops_refund_plan -> ops_refund_intent_sent / ops_refund_intent_failed, the Stripe mirrors, and
--      checkout_duplicate_refund_record. The functions stay in place (owner and tests can still run
--      them); only the Worker's role loses the right to call them.
-- ---------------------------------------------------------------------------
revoke all on function public.ops_refund_record(
  pg_catalog.uuid, pg_catalog.int8, pg_catalog.text, pg_catalog.uuid, public.rappen, pg_catalog.text, public.rappen
) from vamos_system;

revoke all on function public.record_booking_refund(
  pg_catalog.uuid, pg_catalog.text, pg_catalog.text, pg_catalog.timestamptz, public.rappen
) from vamos_system;

revoke all on function public.booking_edit_refund_record(
  pg_catalog.uuid, pg_catalog.text, pg_catalog.uuid, public.rappen
) from vamos_system;

commit;
