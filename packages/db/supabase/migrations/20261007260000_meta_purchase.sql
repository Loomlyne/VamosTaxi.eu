-- 20261007260000_meta_purchase.sql
--
-- Phase 29 (META-10..14, D-01..D-07). One Purchase per booking from the settle queue. Additive:
-- one nullable column on bookings (no default), one empty table, one writer overload, the Phase 28
-- trigger function widened to the new column, four definer functions for the system role (claim, finish, clear_ids, sweep). No row
-- is inserted, updated or deleted by this file.
--
-- One transaction (IN-05): apply it verbatim as a whole (connector apply_migration, never execute_sql
-- statement by statement). A failure rolls everything back, so a re-run starts clean and no session
-- keeps a changed lock_timeout.
begin;

-- Brief ACCESS EXCLUSIVE locks on bookings and booking_payments (live holds real rows): give up
-- fast instead of queueing behind a long transaction. Held until the last lock-taking statement.
set local lock_timeout = '5s';

alter table public.bookings add column if not exists meta_consent_subject pg_catalog.uuid;

comment on column public.bookings.meta_consent_subject is
  'Phase 29 D-01: consent_subject cookie of the browser that pressed Pay with marketing on. Pending only; emptied when the Purchase is decided.';

-- Same rule as Phase 28, now over three columns: a column that ends non-NULL and changed is refused
-- unless the booking is pending; NULL is always allowed so an erasure or a wipe is never blocked.
create or replace function public.tg_bookings_meta_click_ids_pending_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (case when tg_op = 'UPDATE' then old.status else new.status end) <> 'pending'::public.booking_status
     and (
       (new.meta_fbp is not null and (tg_op = 'INSERT' or new.meta_fbp is distinct from old.meta_fbp))
       or (new.meta_fbc is not null and (tg_op = 'INSERT' or new.meta_fbc is distinct from old.meta_fbc))
       or (new.meta_consent_subject is not null
           and (tg_op = 'INSERT' or new.meta_consent_subject is distinct from old.meta_consent_subject))
     ) then
    raise exception 'meta click ids: booking is not pending' using errcode = '55000';
  end if;
  return new;
end
$$;

revoke all on function public.tg_bookings_meta_click_ids_pending_only() from public;

drop trigger if exists bookings_meta_click_ids_pending_only on public.bookings;
create trigger bookings_meta_click_ids_pending_only
  before insert or update of meta_fbp, meta_fbc, meta_consent_subject on public.bookings
  for each row execute function public.tg_bookings_meta_click_ids_pending_only();

-- Pay press writer with the consent subject (D-01). The 3-argument writer stays for the deploy gap
-- (this migration ships before the Worker that calls the 4-argument one).
create or replace function public.checkout_set_meta_click_ids(
  p_booking_id pg_catalog.uuid,
  p_fbp pg_catalog.text,
  p_fbc pg_catalog.text,
  p_consent_subject pg_catalog.uuid
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.booking_status;
begin
  select b.status into v_status from public.bookings b where b.id = p_booking_id for update;
  if not found then
    raise exception 'checkout_set_meta_click_ids: booking not found' using errcode = 'P0002';
  end if;
  if v_status <> 'pending'::public.booking_status then
    raise exception 'checkout_set_meta_click_ids: booking is not pending' using errcode = '55000';
  end if;
  if (p_fbp is not null or p_fbc is not null) and p_consent_subject is null then
    raise exception 'checkout_set_meta_click_ids: ids need a consent subject' using errcode = '22023';
  end if;

  -- All three every time, NULLs included: a later Pay press without consent clears earlier values.
  update public.bookings
     set meta_fbp = p_fbp, meta_fbc = p_fbc, meta_consent_subject = p_consent_subject
   where id = p_booking_id;
end
$$;

revoke all on function public.checkout_set_meta_click_ids(pg_catalog.uuid, pg_catalog.text, pg_catalog.text, pg_catalog.uuid) from public, anon, authenticated;
grant execute on function public.checkout_set_meta_click_ids(pg_catalog.uuid, pg_catalog.text, pg_catalog.text, pg_catalog.uuid) to vamos_checkout;

comment on function public.checkout_set_meta_click_ids(pg_catalog.uuid, pg_catalog.text, pg_catalog.text, pg_catalog.uuid) is
  'Phase 29 D-01: stores _fbp/_fbc and the consent subject on a PENDING booking (55000 otherwise; 22023 ids without subject); all NULL clears. EXECUTE: vamos_checkout only.';

-- WR-03: the Phase 28 3-argument writer, replaced. After a Worker rollback the old Worker still calls
-- it; it must not leave a consent subject saved by the new Worker behind (the subject would then
-- belong to ids it never vouched for). It now clears the subject on every call, so ids written by
-- the old Worker have no subject and the claim skips them as 'no_subject' (fail closed). Same
-- signature, same pending-only rule, same grant: vamos_checkout only.
create or replace function public.checkout_set_meta_click_ids(
  p_booking_id uuid,
  p_fbp text,
  p_fbc text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.booking_status;
begin
  select b.status into v_status from public.bookings b where b.id = p_booking_id for update;
  if not found then
    raise exception 'checkout_set_meta_click_ids: booking not found' using errcode = 'P0002';
  end if;
  if v_status <> 'pending'::public.booking_status then
    raise exception 'checkout_set_meta_click_ids: booking is not pending' using errcode = '55000';
  end if;

  update public.bookings
     set meta_fbp = p_fbp, meta_fbc = p_fbc, meta_consent_subject = null
   where id = p_booking_id;
end
$$;

revoke all on function public.checkout_set_meta_click_ids(uuid, text, text) from public, anon, authenticated;
grant execute on function public.checkout_set_meta_click_ids(uuid, text, text) to vamos_checkout;

comment on function public.checkout_set_meta_click_ids(uuid, text, text) is
  'Phase 28 D-09/D-10, widened in Phase 29: stores _fbp/_fbc on a PENDING booking and clears the consent subject (55000 otherwise); NULLs clear. EXECUTE: vamos_checkout only.';

-- One row per booking, written only by the claim and finish functions below. Never holds personal
-- data: no ids, no subject, no email. No policies and no grants on purpose.
create table public.meta_purchase_events (
  booking_id    pg_catalog.uuid primary key references public.bookings (id) on delete cascade,
  event_id      pg_catalog.uuid not null unique default extensions.gen_random_uuid(),
  payment_id    pg_catalog.int8 not null references public.booking_payments (id) on delete cascade,
  state         pg_catalog.text not null check (state in ('sending', 'sent', 'rejected', 'failed', 'skipped')),
  skip_reason   pg_catalog.text check (skip_reason in
                  ('not_paid', 'erased', 'is_test', 'refunded', 'zero_charge', 'too_old',
                   'gate_closed', 'no_token', 'no_test_code', 'no_ids', 'no_subject', 'consent_off',
                   'interrupted')),
  test_event    pg_catalog.bool not null,
  http_status   pg_catalog.int4,
  graph_code    pg_catalog.int4,
  graph_subcode pg_catalog.int4,
  claimed_at    pg_catalog.timestamptz not null default pg_catalog.now(),
  finished_at   pg_catalog.timestamptz,
  constraint meta_purchase_events_skip_reason check ((state = 'skipped') = (skip_reason is not null))
);

alter table public.meta_purchase_events enable row level security;
alter table public.meta_purchase_events force row level security;
revoke all on table public.meta_purchase_events
  from public, anon, authenticated, vamos_guest, vamos_edge, vamos_public, vamos_checkout, vamos_system;

comment on table public.meta_purchase_events is
  'Phase 29: the once-only record of the Meta Purchase per booking (event id, state, skip reason). Written only by meta_purchase_claim / meta_purchase_finish.';

reset lock_timeout;

-- WR-01: the three functions below run inside the serial queue loop, so each gives up on a lock after
-- 2 s and on a statement after 5 s (function-level SET: applies to every lock wait inside; the Worker
-- also sets statement_timeout before the call, because a function-level value cannot re-arm the timer
-- of the call that is already running). A refusal (55P03, 57014) goes down the Worker's claim_failed path.
--
-- The decision. The booking row is locked first, so two queue deliveries of one booking take turns.
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

-- Records the Graph answer. Only the row with this booking and event id that is still 'sending'
-- changes; anything else is a quiet no-op, so a replay cannot rewrite history.
create or replace function public.meta_purchase_finish(
  p_booking_id pg_catalog.uuid,
  p_event_id pg_catalog.uuid,
  p_state pg_catalog.text,
  p_http_status pg_catalog.int4,
  p_graph_code pg_catalog.int4,
  p_graph_subcode pg_catalog.int4
) returns void
language plpgsql
security definer
set search_path = ''
set lock_timeout = '2s'
set statement_timeout = '5s'
as $$
begin
  if p_state is null or p_state not in ('sent', 'rejected', 'failed') then
    raise exception 'meta_purchase_finish: state must be sent, rejected or failed' using errcode = '22023';
  end if;
  update public.meta_purchase_events
     set state = p_state, http_status = p_http_status, graph_code = p_graph_code,
         graph_subcode = p_graph_subcode, finished_at = pg_catalog.now()
   where booking_id = p_booking_id and event_id = p_event_id and state = 'sending';
end
$$;

-- Best-effort wipe for the Worker's claim-failure path (D-05). No error when nothing matches.
create or replace function public.meta_purchase_clear_ids(p_booking_id pg_catalog.uuid)
returns void
language plpgsql
security definer
set search_path = ''
set lock_timeout = '2s'
set statement_timeout = '5s'
as $$
begin
  update public.bookings
     set meta_fbp = null, meta_fbc = null, meta_consent_subject = null
   where id = p_booking_id
     and (meta_fbp is not null or meta_fbc is not null or meta_consent_subject is not null);
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
  v_count pg_catalog.int4 := 0;
begin
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
       for update of b skip locked
  loop
    select p.id into v_pay
      from public.booking_payments p
     where p.booking_id = v_id and p.status = 'succeeded'
     order by coalesce(p.captured_at, p.created_at), p.id
     limit 1;
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
revoke all on function public.meta_purchase_finish(pg_catalog.uuid, pg_catalog.uuid, pg_catalog.text, pg_catalog.int4, pg_catalog.int4, pg_catalog.int4) from public, anon, authenticated;
revoke all on function public.meta_purchase_clear_ids(pg_catalog.uuid) from public, anon, authenticated;
revoke all on function public.meta_purchase_sweep() from public, anon, authenticated;
grant execute on function public.meta_purchase_claim(pg_catalog.uuid, pg_catalog.int8, pg_catalog.text, pg_catalog.bool, pg_catalog.bool, pg_catalog.text) to vamos_system;
grant execute on function public.meta_purchase_finish(pg_catalog.uuid, pg_catalog.uuid, pg_catalog.text, pg_catalog.int4, pg_catalog.int4, pg_catalog.int4) to vamos_system;
grant execute on function public.meta_purchase_clear_ids(pg_catalog.uuid) to vamos_system;
grant execute on function public.meta_purchase_sweep() to vamos_system;

comment on function public.meta_purchase_claim(pg_catalog.uuid, pg_catalog.int8, pg_catalog.text, pg_catalog.bool, pg_catalog.bool, pg_catalog.text) is
  'Phase 29: decide send / skip / already for the first succeeded payment of a booking, once. EXECUTE: vamos_system only.';
comment on function public.meta_purchase_finish(pg_catalog.uuid, pg_catalog.uuid, pg_catalog.text, pg_catalog.int4, pg_catalog.int4, pg_catalog.int4) is
  'Phase 29: record the Graph answer on the sending row. EXECUTE: vamos_system only.';
comment on function public.meta_purchase_clear_ids(pg_catalog.uuid) is
  'Phase 29 D-05: best-effort wipe of fbp, fbc and consent subject on one booking. EXECUTE: vamos_system only.';
comment on function public.meta_purchase_sweep() is
  'Phase 29 D-05: daily wipe of fbp, fbc and consent subject on non-pending bookings whose Purchase was decided or interrupted; records skipped/interrupted when no row exists; returns the count. EXECUTE: vamos_system only.';

commit;
