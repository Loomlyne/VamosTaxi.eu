-- 20260930110000_purge_unpaid_booking.sql
--
-- Plan 26.3-07 Task 1 (D-25, D-45): an unpaid web booking that never had a pay link may be
-- hard-deleted once its lock has expired. Every child table is append-only or restrict-FK,
-- so this needs (a) a third tg_append_only carve-out that is closed for every caller except
-- the one definer function below, (b) that function, (c) a candidate list for the cron, and
-- (d) checkout_expire_unpaid no longer cancelling a no-pay-link web booking (it must stay
-- pending until the purge removes it).
--
-- Eligible = status 'pending', pay_link_sent_at null, no booking_payments row that is
-- succeeded or captured, and no refund / dispute / notification / edit request / review.
-- The eligibility rule is written once (app.purge_eligible) and re-checked inside the trigger
-- for every row it lets through, so the GUC alone never opens the delete.
--
-- The audit line carries reference, created_at, deleted_at and reason only: no name, e-mail,
-- phone, address or amount (D-45).

-- ---------------------------------------------------------------------------
-- (1) app.purge_eligible -- the single eligibility predicate.
-- ---------------------------------------------------------------------------
create or replace function app.purge_eligible(p_booking_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
           select 1
             from public.bookings b
            where b.id = p_booking_id
              and b.status = 'pending'
              and b.pay_link_sent_at is null)
     and not exists (
           select 1 from public.booking_payments bp
            where bp.booking_id = p_booking_id
              and (bp.status = 'succeeded' or bp.captured_at is not null))
     and not exists (select 1 from public.booking_refunds x where x.booking_id = p_booking_id)
     and not exists (select 1 from public.booking_disputes x where x.booking_id = p_booking_id)
     and not exists (select 1 from public.booking_notifications x where x.booking_id = p_booking_id)
     and not exists (select 1 from public.booking_edit_requests x where x.booking_id = p_booking_id)
     and not exists (select 1 from public.reviews x where x.booking_id = p_booking_id)
$$;

revoke all on function app.purge_eligible(uuid) from public;

-- ---------------------------------------------------------------------------
-- (2) tg_append_only with carve-out 3. Carve-outs 1 and 2 are copied verbatim.
-- ---------------------------------------------------------------------------
create or replace function public.tg_append_only() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_booking uuid;
begin
  if tg_op = 'UPDATE' and tg_table_name = 'price_snapshots' then
    -- Carve-out 1: binding a pre-purchase quote snapshot to the booking it became.
    -- (See 20260823000019_append_only.sql for why is_chargeable is carried forward.)
    new.is_chargeable := old.is_chargeable;
    if old.booking_id is null and new.booking_id is not null
       and to_jsonb(new) - 'booking_id' = to_jsonb(old) - 'booking_id' then
      return new;
    end if;
  elsif tg_op = 'UPDATE' and tg_table_name = 'consent_log' then
    -- Carve-out 2 (F-10): erasure redaction, customer_id -> NULL.
    if old.customer_id is not null and new.customer_id is null
       and to_jsonb(new) - 'customer_id' = to_jsonb(old) - 'customer_id' then
      return new;
    end if;
  end if;

  -- Carve-out 3 (26.3-07, D-25): purge of an expired unpaid booking. Closed unless ALL hold:
  -- the transaction-local flag is on, the caller is the owner of purge_unpaid_booking (i.e. we
  -- are inside that definer function), the table is one of four, the operation is the exact
  -- one the purge performs, and the owning booking is still eligible right now.
  if current_setting('vamos.purge_unpaid', true) = 'on'
     and current_user = (select p.proowner::regrole::text
                           from pg_catalog.pg_proc p
                          where p.oid = 'public.purge_unpaid_booking(uuid,text)'::regprocedure) then
    if tg_table_name = 'price_snapshots' then
      if tg_op = 'DELETE' then v_booking := old.booking_id; end if;
    elsif tg_table_name = 'price_snapshot_legs' then
      if tg_op = 'DELETE' then
        select s.booking_id into v_booking from public.price_snapshots s where s.id = old.snapshot_id;
      end if;
    elsif tg_table_name = 'booking_events' then
      if tg_op = 'DELETE' then v_booking := old.booking_id; end if;
    elsif tg_table_name = 'consent_log' then
      -- The purge detaches consent rows from the booking (the consent row itself stays).
      if tg_op = 'UPDATE' then
        if old.booking_id is not null and new.booking_id is null
           and to_jsonb(new) - 'booking_id' = to_jsonb(old) - 'booking_id' then
          v_booking := old.booking_id;
        end if;
      end if;
    end if;
    if v_booking is not null and app.purge_eligible(v_booking) then
      if tg_op = 'DELETE' then
        return old;
      end if;
      return new;
    end if;
  end if;

  raise exception 'append-only table %.%: % is not permitted',
    tg_table_schema, tg_table_name, tg_op
    using errcode = 'restrict_violation',
          hint = 'Insert a superseding row; never mutate history.';
end $$;

revoke all on function public.tg_append_only() from public;

-- ---------------------------------------------------------------------------
-- (3) public.purge_unpaid_booking
-- ---------------------------------------------------------------------------
create or replace function public.purge_unpaid_booking(p_booking_id uuid, p_reason text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.bookings%rowtype;
begin
  if p_reason is null or p_reason not in ('unpaid_expired', 'superseded') then
    raise exception 'purge_unpaid_booking: reason must be unpaid_expired or superseded'
      using errcode = '22023';
  end if;

  select * into v from public.bookings b where b.id = p_booking_id for update;
  if not found or not app.purge_eligible(p_booking_id) then
    return false;
  end if;

  perform set_config('vamos.purge_unpaid', 'on', true);

  update public.bookings set price_snapshot_id = null where id = p_booking_id;
  update public.consent_log set booking_id = null where booking_id = p_booking_id;

  delete from public.coupon_redemptions where booking_id = p_booking_id;
  delete from public.booking_events where booking_id = p_booking_id;
  delete from public.booking_payments where booking_id = p_booking_id;
  delete from public.price_snapshot_legs
   where snapshot_id in (select s.id from public.price_snapshots s where s.booking_id = p_booking_id);
  delete from public.price_snapshots where booking_id = p_booking_id;
  delete from public.booking_access_tokens where booking_id = p_booking_id;
  delete from public.booking_legs where booking_id = p_booking_id;
  delete from public.bookings where id = p_booking_id;

  insert into public.audit_log (table_name, record_id, action, actor_kind, actor_id, before_value)
  values ('bookings', p_booking_id::text, 'delete', 'system', null,
          jsonb_build_object(
            'reference', v.reference,
            'created_at', v.created_at,
            'deleted_at', now(),
            'reason', p_reason));

  perform set_config('vamos.purge_unpaid', 'off', true);
  return true;
end
$$;

revoke all on function public.purge_unpaid_booking(uuid, text) from public;
grant execute on function public.purge_unpaid_booking(uuid, text) to vamos_system, vamos_checkout;

comment on function public.purge_unpaid_booking(uuid, text) is
  'D-25/D-45: hard-deletes one eligible unpaid booking (pending, no pay link, no paid/captured payment, no refund/dispute/notification/edit request/review) and writes one non-PII audit_log line. Returns false when not eligible. EXECUTE: vamos_system, vamos_checkout.';

-- ---------------------------------------------------------------------------
-- (4) public.purge_candidates
-- ---------------------------------------------------------------------------
create or replace function public.purge_candidates(p_older_than interval)
returns table (booking_id uuid, reference text, session_ids text[])
language sql
stable
security definer
set search_path = ''
as $$
  select b.id,
         b.reference,
         coalesce((select array_agg(bp.stripe_checkout_session_id order by bp.id)
                     from public.booking_payments bp
                    where bp.booking_id = b.id
                      and bp.stripe_checkout_session_id is not null), array[]::text[])
    from public.bookings b
   where b.created_at < now() - p_older_than
     and app.purge_eligible(b.id)
   order by b.created_at
$$;

revoke all on function public.purge_candidates(interval) from public;
grant execute on function public.purge_candidates(interval) to vamos_system;

comment on function public.purge_candidates(interval) is
  'D-25: eligible unpaid bookings older than the interval, with their Stripe Checkout Session ids so the cron can verify each session is expired before purging. EXECUTE: vamos_system only.';

-- ---------------------------------------------------------------------------
-- (5) checkout_expire_unpaid: same body as 20260928140000, plus the pay-link filter. A pending
-- booking without a pay link is never cancelled here; the purge deletes it.
-- ---------------------------------------------------------------------------
create or replace function public.checkout_expire_unpaid()
returns table (booking_id uuid, reference text, stripe_checkout_session_ids text[])
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.bookings%rowtype;
  v_cut integer;
  v_sessions text[];
begin
  for v in
    select b.*
      from public.bookings as b
      inner join public.price_snapshots as ps on ps.id = b.price_snapshot_id
     where b.status = 'pending'
       and b.pay_link_sent_at is not null
       and greatest(ps.quote_lock_expires_at, coalesce(b.hold_until, ps.quote_lock_expires_at)) <= now()
     order by greatest(ps.quote_lock_expires_at, coalesce(b.hold_until, ps.quote_lock_expires_at)), b.created_at
     for update of b skip locked
  loop
    update public.booking_legs bl
       set status = 'cancelled'
     where bl.booking_id = v.id
       and bl.status not in ('completed', 'no_show', 'cancelled');
    get diagnostics v_cut = row_count;
    if v_cut = 0 then
      continue;
    end if;

    update public.bookings
       set status = 'cancelled'
     where id = v.id;

    select coalesce(array_agg(bp.stripe_checkout_session_id), array[]::text[])
      into v_sessions
      from public.booking_payments bp
     where bp.booking_id = v.id
       and bp.status = 'requires_payment'
       and bp.stripe_checkout_session_id is not null;

    perform app.release_unpaid_coupon(v.id, 'unpaid_cancelled');

    insert into public.booking_events (
      booking_id, booking_leg_id, kind, actor_kind, actor_label,
      from_status, to_status, payload
    ) values (
      v.id, null, 'booking.status_changed', 'cron', 'unpaid lock',
      v.status, 'cancelled',
      jsonb_build_object('via', 'expire_unpaid')
    );

    booking_id := v.id;
    reference := v.reference;
    stripe_checkout_session_ids := v_sessions;
    return next;
  end loop;
end
$$;

revoke all on function public.checkout_expire_unpaid() from public;
grant execute on function public.checkout_expire_unpaid() to vamos_system;

comment on function public.checkout_expire_unpaid() is
  'Hourly cron: cancel every pending booking WITH a pay link whose 24-hour hold is past (26.1-15 D-20). A pending booking with no pay link is left for purge_unpaid_booking (26.3-07 D-25). Returns each cancelled booking''s open Stripe Checkout Session ids and releases its coupon redemption. EXECUTE: vamos_system only.';
