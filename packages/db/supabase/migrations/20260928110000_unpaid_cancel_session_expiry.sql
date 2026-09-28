-- 20260928110000_unpaid_cancel_session_expiry.sql
--
-- Plan 26.1-06 (D-04/D-11/D-11a). Closes audit X9: account cancel and the
-- cron unpaid-lock expiry cancelled the DB row but left the Stripe Checkout
-- Session payable -- a customer could still pay a cancelled booking through
-- a stale tab. Every unpaid cancel path now returns the booking's open
-- ('requires_payment') Checkout Session ids so the Worker can expire them,
-- and gives the booking's coupon use back so caps count paid uses only.
--
-- Owner applies in the SQL editor (backward compatible with the live
-- Worker, which today selects only booking_id/reference from these RPCs --
-- a caller naming its own columns is unaffected by an appended one).
-- Same fallback rule as 26.1-02: if a partial apply is suspected, rerun the
-- whole file -- every statement is `drop function` + `create function` or
-- `create or replace function`, so a rerun is safe.
--
-- No CHF amount enters this file (D-13/D-34).

begin;

-- ---------------------------------------------------------------------------
-- (1) app.release_unpaid_coupon -- SECURITY DEFINER helper shared by every
-- unpaid cancel path below. Sets released_at/released_reason on the
-- booking's unreleased coupon_redemptions row only (a paid booking's
-- redemption is never touched by this helper -- callers gate on `not
-- v_paid` where a booking can be paid, e.g. ops_cancel_booking). Idempotent:
-- a row that is already released (released_at is not null) is left alone,
-- so calling this twice for the same booking (e.g. checkout_requote_cancel's
-- already-cancelled branch, reached after some other path already
-- cancelled and released) is always safe.
-- ---------------------------------------------------------------------------

create or replace function app.release_unpaid_coupon(
  p_booking_id pg_catalog.uuid,
  p_reason pg_catalog.text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.coupon_redemptions
     set released_at = now(),
         released_reason = p_reason
   where booking_id = p_booking_id
     and released_at is null;
end
$$;

revoke all on function app.release_unpaid_coupon(pg_catalog.uuid, pg_catalog.text) from public;

comment on function app.release_unpaid_coupon(pg_catalog.uuid, pg_catalog.text) is
  'Plan 26.1-06 (D-11/D-11a): gives back a booking''s unreleased coupon_redemptions use on an unpaid cancel/expire, so tg_coupon_redemption_caps (released_at is null) counts paid uses only. Idempotent. Called only from other SECURITY DEFINER cancel/expire RPCs in this file -- never granted beyond that.';

-- ---------------------------------------------------------------------------
-- (2) checkout_cancel_unpaid -- account cancel by reference (D-01/D-02 era).
-- Same body, plus the booking's open Stripe Checkout Session ids and the
-- coupon release. Backward compatible: a caller that still does
-- `select booking_id, reference from ...` is unaffected by the appended
-- column.
-- ---------------------------------------------------------------------------

drop function if exists public.checkout_cancel_unpaid(text);

create function public.checkout_cancel_unpaid(p_reference text)
returns table (
  booking_id uuid,
  reference text,
  stripe_checkout_session_ids text[]
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.bookings%rowtype;
  v_email text;
  v_cut integer;
  v_sessions text[];
begin
  v_email := lower(nullif(btrim(coalesce(app.jwt() ->> 'email', '')), ''));
  if v_email is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  select b.* into v
    from public.bookings b
   where b.reference = p_reference
   for update of b;

  if v.id is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if v.status is distinct from 'pending' then
    raise exception 'not_cancellable' using errcode = 'P0001';
  end if;
  if lower(v.contact_email::text) is distinct from v_email then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  update public.booking_legs bl
     set status = 'cancelled'
   where bl.booking_id = v.id
     and bl.status not in ('completed', 'no_show', 'cancelled');
  get diagnostics v_cut = row_count;
  if v_cut = 0 then
    raise exception 'not_cancellable' using errcode = 'P0001';
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
    v.id, null, 'booking.status_changed', 'customer', 'account cancel',
    v.status, 'cancelled',
    jsonb_build_object('via', 'account_cancel')
  );

  return query select v.id, v.reference::text, v_sessions;
end
$$;

revoke all on function public.checkout_cancel_unpaid(text) from public;
grant execute on function public.checkout_cancel_unpaid(text) to authenticated;

comment on function public.checkout_cancel_unpaid(text) is
  'Signed-in customer cancel of their own unpaid pending booking by reference. Plan 26.1-06 (D-04/D-11a): also returns the booking''s open Stripe Checkout Session ids to expire, and releases its unreleased coupon redemption. EXECUTE: authenticated only.';

-- ---------------------------------------------------------------------------
-- (3) checkout_expire_unpaid -- hourly cron sweep (D-22 body: keys off
-- price_snapshots.quote_lock_expires_at). Same addition: open session ids
-- per cancelled booking, plus the coupon release.
-- ---------------------------------------------------------------------------

drop function if exists public.checkout_expire_unpaid();

create function public.checkout_expire_unpaid()
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
       and ps.quote_lock_expires_at <= now()
     order by ps.quote_lock_expires_at, b.created_at
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
  'Hourly cron: cancel every pending booking whose price_snapshots.quote_lock_expires_at is past. Plan 26.1-06 (D-04/D-11a/D-22): also returns each cancelled booking''s open Stripe Checkout Session ids to expire, and releases its unreleased coupon redemption. EXECUTE: vamos_system only.';

-- ---------------------------------------------------------------------------
-- (4) ops_cancel_booking -- staff cancel. Same arguments and existing
-- return columns, plus the booking's open Stripe Checkout Session ids
-- (naturally empty for an already-paid booking -- a captured trip has no
-- 'requires_payment' row). The coupon release only fires when the booking
-- being cancelled was unpaid; a paid booking's redemption stands (it is
-- a real consumed use, not given back by a plain ops cancel -- Phase 9's
-- refund path is what would release it, and stays out of this plan).
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

  if v_comp.refund_mode = 'pending_ops' then
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
  '08-05 + 09-02 D-13, extended by plan 26.1-06 (D-04/D-11a): ops cancel without Stripe. Calls compute_cancellation_refund (same D-02 windows), returns refund_mode + refund_rappen + the booking''s open Stripe Checkout Session ids (empty for an already-paid booking), and releases its unreleased coupon redemption when it was unpaid. EXECUTE vamos_system only.';

-- ---------------------------------------------------------------------------
-- (5) checkout_abandon_unpaid -- guest leaves payment (D-19). Identical
-- signature and return shape; only the coupon release is added, in both the
-- already-cancelled early-return branch (idempotent: released_at is null
-- guards a double release) and the normal cancel path.
-- ---------------------------------------------------------------------------

create or replace function public.checkout_abandon_unpaid(
  p_quote_id pg_catalog.uuid
)
returns table (
  booking_id pg_catalog.uuid,
  reference pg_catalog.text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.bookings%rowtype;
  v_cut pg_catalog.int4;
begin
  select b.*
    into v
    from public.bookings as b
   where b.quote_id = p_quote_id
   for update of b;

  if not found then
    return;
  end if;

  if v.pay_link_sent_at is not null then
    return;
  end if;

  if exists (
    select 1
      from public.booking_payments as bp
     where bp.booking_id = v.id
       and bp.status = 'succeeded'
  ) then
    return;
  end if;

  if v.status = 'cancelled'::public.booking_status then
    update public.booking_payments as bp
       set status = 'canceled'
     where bp.booking_id = v.id
       and bp.status = 'requires_payment';
    perform app.release_unpaid_coupon(v.id, 'unpaid_cancelled');
    return;
  end if;

  if v.status not in (
    'pending'::public.booking_status,
    'quote'::public.booking_status
  ) then
    return;
  end if;

  update public.booking_legs as bl
     set status = 'cancelled'
   where bl.booking_id = v.id
     and bl.status not in (
       'completed'::public.booking_status,
       'no_show'::public.booking_status,
       'cancelled'::public.booking_status
     );
  get diagnostics v_cut = row_count;
  if v_cut = 0 then
    return;
  end if;

  update public.booking_payments as bp
     set status = 'canceled'
   where bp.booking_id = v.id
     and bp.status = 'requires_payment';

  update public.bookings
     set status = 'cancelled',
         updated_at = pg_catalog.now()
   where id = v.id;

  perform app.release_unpaid_coupon(v.id, 'unpaid_cancelled');

  insert into public.booking_events (
    booking_id, booking_leg_id, kind, actor_kind, actor_label,
    from_status, to_status, payload
  ) values (
    v.id,
    null,
    'booking.status_changed',
    'guest',
    'left payment',
    v.status,
    'cancelled',
    pg_catalog.jsonb_build_object('via', 'leave_payment')
  );

  return query
    select v.id, v.reference::pg_catalog.text;
  return;
end
$$;

revoke all on function public.checkout_abandon_unpaid(pg_catalog.uuid) from public;
revoke all on function public.checkout_abandon_unpaid(pg_catalog.uuid) from anon;
revoke all on function public.checkout_abandon_unpaid(pg_catalog.uuid) from authenticated;
grant execute on function public.checkout_abandon_unpaid(pg_catalog.uuid) to vamos_checkout;

comment on function public.checkout_abandon_unpaid(pg_catalog.uuid) is
  'Cancel an unpaid pending booking when the customer leaves payment and no pay-link was sent. Plan 26.1-06 (D-11a): releases the booking''s unreleased coupon redemption. EXECUTE: vamos_checkout only.';

-- ---------------------------------------------------------------------------
-- (6) checkout_requote_cancel -- guest Requote cancel (D-03b). Identical
-- signature and return shape; only the coupon release is added.
-- ---------------------------------------------------------------------------

create or replace function public.checkout_requote_cancel(
  p_quote_id pg_catalog.uuid
)
returns table (
  booking_id pg_catalog.uuid,
  reference pg_catalog.text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.bookings%rowtype;
  v_cut pg_catalog.int4;
begin
  select b.*
    into v
    from public.bookings as b
   where b.quote_id = p_quote_id
   for update of b;

  if not found then
    return;
  end if;

  if exists (
    select 1
      from public.booking_payments as bp
     where bp.booking_id = v.id
       and bp.status = 'succeeded'
  ) then
    raise exception 'quote_already_booked' using errcode = 'restrict_violation';
  end if;

  if v.status = 'cancelled'::public.booking_status then
    update public.booking_payments as bp
       set status = 'canceled'
     where bp.booking_id = v.id
       and bp.status = 'requires_payment';
    perform app.release_unpaid_coupon(v.id, 'unpaid_cancelled');
    return query
      select v.id, v.reference::pg_catalog.text;
    return;
  end if;

  if v.status not in (
    'pending'::public.booking_status,
    'quote'::public.booking_status
  ) then
    raise exception 'not_cancellable' using errcode = 'P0001';
  end if;

  update public.booking_legs as bl
     set status = 'cancelled'
   where bl.booking_id = v.id
     and bl.status not in (
       'completed'::public.booking_status,
       'no_show'::public.booking_status,
       'cancelled'::public.booking_status
     );
  get diagnostics v_cut = row_count;
  if v_cut = 0 then
    raise exception 'not_cancellable' using errcode = 'P0001';
  end if;

  update public.booking_payments as bp
     set status = 'canceled'
   where bp.booking_id = v.id
     and bp.status = 'requires_payment';

  update public.bookings
     set status = 'cancelled',
         updated_at = pg_catalog.now()
   where id = v.id;

  perform app.release_unpaid_coupon(v.id, 'unpaid_cancelled');

  insert into public.booking_events (
    booking_id, booking_leg_id, kind, actor_kind, actor_label,
    from_status, to_status, payload
  ) values (
    v.id,
    null,
    'booking.status_changed',
    'guest',
    'guest requote',
    v.status,
    'cancelled',
    pg_catalog.jsonb_build_object('via', 'requote_cancel')
  );

  return query
    select v.id, v.reference::pg_catalog.text;
  return;
end
$$;

revoke all on function public.checkout_requote_cancel(pg_catalog.uuid) from public;
revoke all on function public.checkout_requote_cancel(pg_catalog.uuid) from anon;
revoke all on function public.checkout_requote_cancel(pg_catalog.uuid) from authenticated;
grant execute on function public.checkout_requote_cancel(pg_catalog.uuid) to vamos_checkout;

comment on function public.checkout_requote_cancel(pg_catalog.uuid) is
  'Guest Requote cancel of an unpaid pending or quote booking by quote_id. Plan 26.1-06 (D-11a): releases the booking''s unreleased coupon redemption. EXECUTE: vamos_checkout only.';

commit;
