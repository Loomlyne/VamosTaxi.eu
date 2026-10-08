-- 20261009160000_db_privilege_hardening.sql
--
-- J9 (payments review 2026-10-09). Findings W5-07, W5-08, W5-16, W5-18, W5-19, W5-23.
-- Independent of 20261007320000 (REST function revoke): it neither needs that migration applied nor
-- changes what it grants; applying them in either order gives the same result.
--
--   (1) W5-07  Staff (vamos_staff) held table-wide INSERT/UPDATE/DELETE on bookings and booking_legs, so a
--              dispatcher could set status = 'confirmed' or reset refunded_rappen without touching the
--              ledger. Those grants are replaced by column grants on exactly the columns the Worker writes
--              directly today (found by reading every write in apps/web): bookings.customer_id,
--              contact_name, contact_email, contact_phone, is_test, updated_at (customer save and test
--              unpaid booking) and booking_legs.arrived_at, updated_at (mark arrival). Everything else
--              (status, refund_status, refund_owed_rappen, refunded_rappen, price_total_rappen,
--              price_snapshot_id, erased_at, legs' status and times, inserts, deletes) changes only
--              through the SECURITY DEFINER functions. is_test may not change once a payment is captured.
--   (2) W5-08  service_role (the Supabase server key, BYPASSRLS, EXECUTE on every function and ALL on
--              every table by Supabase's default privileges) is not used by the app for money: the Worker
--              uses it for Auth admin calls, one insert into public.staff (staff invite) and the five
--              staff_digest_* functions. So: every privilege on the money ledger tables goes, EXECUTE on
--              every public function goes except those five, and the default privileges stop granting
--              EXECUTE on new functions to service_role. booking_payments rows can no longer be deleted
--              except by the purge of an expired unpaid booking.
--   (3) W5-18  checkout_abandon_unpaid, checkout_requote_cancel and purge_unpaid_booking lock the
--              booking's payment rows first, then the booking (settle's order), so they cannot deadlock
--              with a settle that holds the payment.
--   (4) W5-19  checkout_attach_payment refuses an erased or test booking; checkout_set_pay_link revokes
--              the booking's earlier pay tokens when it stores the new one.
--   (5) W5-23  checkout_cancel_unpaid no longer trusts the JWT e-mail claim: the caller must own the
--              booking (customers.user_id) or hold a CONFIRMED e-mail equal to the booking's. The owner
--              check now comes before the status check, so a stranger learns nothing about a reference.
--   (6) W5-16  stripe_dispute_upsert: an event from the same second as a terminal status (won, lost,
--              warning_closed, charge_refunded) cannot move the dispute back to an open status.
--
-- Not done: W5-21 (SQLSTATE mapping), see the hand-over. One transaction: apply it verbatim as a whole.
begin;

-- ---------------------------------------------------------------------------
-- (1) W5-07: column grants for staff on bookings and booking_legs.
-- ---------------------------------------------------------------------------
revoke insert, update, delete on public.bookings from vamos_staff;
revoke insert, update, delete on public.booking_legs from vamos_staff;

grant update (customer_id, contact_name, contact_email, contact_phone, is_test, updated_at)
  on public.bookings to vamos_staff;
grant update (arrived_at, updated_at)
  on public.booking_legs to vamos_staff;

-- is_test hides a booking from payments and from the money figures: it may not be flipped on a booking
-- that already has a captured payment, by anyone but the owner role (maintenance).
create function public.tg_bookings_is_test_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.is_test is distinct from old.is_test
     and current_user not in ('postgres', 'supabase_admin')
     and exists (
       select 1
         from public.booking_payments as p
        where p.booking_id = new.id
          and p.captured_at is not null
     ) then
    raise exception 'is_test cannot change on a booking with a captured payment'
      using errcode = 'restrict_violation';
  end if;
  return new;
end;
$$;

revoke all on function public.tg_bookings_is_test_guard() from public;

create trigger bookings_is_test_guard
  before update of is_test on public.bookings
  for each row execute function public.tg_bookings_is_test_guard();

-- ---------------------------------------------------------------------------
-- (2) W5-08: service_role off the money ledger and the money functions.
-- ---------------------------------------------------------------------------
revoke all on table
  public.booking_payments,
  public.booking_refunds,
  public.booking_refund_intents,
  public.booking_refund_reversals,
  public.booking_disputes,
  public.stripe_events
from service_role;

do $$
declare
  r record;
begin
  for r in
    select p.oid::pg_catalog.regprocedure as sig
      from pg_catalog.pg_proc as p
     where p.pronamespace = 'public'::pg_catalog.regnamespace
       and p.prokind = 'f'
       and not exists (
         select 1 from pg_catalog.pg_depend as d
          where d.objid = p.oid and d.deptype = 'e'
       )
       and p.proname not in (
         'staff_digest_recipients', 'staff_digest_legs', 'staff_digest_claim',
         'staff_digest_mark_sent', 'staff_digest_mark_failed'
       )
  loop
    execute pg_catalog.format('revoke all on function %s from service_role', r.sig);
  end loop;
end;
$$;

-- A function created by a later migration no longer reaches service_role by default.
alter default privileges for role postgres in schema public revoke all on functions from service_role;

-- booking_payments rows are never deleted, except by the purge of an expired unpaid booking
-- (tg_append_only carve-out 3 uses the same test: the purge flag, the purge function's owner, and the
-- booking still eligible). A succeeded row can no longer be deleted by the owner role or by mistake.
create function public.tg_payment_no_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_setting('vamos.purge_unpaid', true) = 'on'
     and current_user = (select p.proowner::pg_catalog.regrole::pg_catalog.text
                           from pg_catalog.pg_proc as p
                          where p.oid = 'public.purge_unpaid_booking(uuid,text)'::pg_catalog.regprocedure)
     and app.purge_eligible(old.booking_id) then
    return old;
  end if;
  raise exception 'booking_payments rows are never deleted'
    using errcode = 'restrict_violation',
          hint = 'Only the purge of an expired unpaid booking removes payment rows.';
end;
$$;

revoke all on function public.tg_payment_no_delete() from public;

create trigger booking_payments_no_delete
  before delete on public.booking_payments
  for each row execute function public.tg_payment_no_delete();

-- ---------------------------------------------------------------------------
-- (3) W5-18: payment rows first, then the booking.
-- ---------------------------------------------------------------------------
-- checkout_abandon_unpaid: body of 20260928110000 with the lock order changed.
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
  v_id pg_catalog.uuid;
  v_cut pg_catalog.int4;
begin
  -- J9 W5-18: lock order is the payments of the booking, THEN the booking, as settle does. The
  -- booking is first found without a lock; a settle that holds a payment row and waits for the booking
  -- can no longer deadlock with this function (40P01).
  select b.id
    into v_id
    from public.bookings as b
   where b.quote_id = p_quote_id;

  if not found then
    return;
  end if;

  perform 1
     from public.booking_payments as bp
    where bp.booking_id = v_id
    order by bp.id
      for update;

  select b.*
    into v
    from public.bookings as b
   where b.id = v_id
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

-- checkout_requote_cancel: body of 20260928110000 with the lock order changed.
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
  v_id pg_catalog.uuid;
  v_cut pg_catalog.int4;
begin
  -- J9 W5-18: lock order is the payments of the booking, THEN the booking, as settle does. The
  -- booking is first found without a lock; a settle that holds a payment row and waits for the booking
  -- can no longer deadlock with this function (40P01).
  select b.id
    into v_id
    from public.bookings as b
   where b.quote_id = p_quote_id;

  if not found then
    return;
  end if;

  perform 1
     from public.booking_payments as bp
    where bp.booking_id = v_id
    order by bp.id
      for update;

  select b.*
    into v
    from public.bookings as b
   where b.id = v_id
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

-- purge_unpaid_booking: body of 20261007300000 with the lock order changed.
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

  -- J9 W5-18: payments of the booking first, then the booking (settle's order).
  perform 1 from public.bookings as b where b.id = p_booking_id;
  if not found then
    return false;
  end if;

  perform 1
     from public.booking_payments as bp
    where bp.booking_id = p_booking_id
    order by bp.id
      for update;

  select * into v from public.bookings b where b.id = p_booking_id for update;
  if not found or not app.purge_eligible(p_booking_id) then
    return false;
  end if;

  perform set_config('vamos.purge_unpaid', 'on', true);

  update public.bookings set price_snapshot_id = null where id = p_booking_id;
  update public.consent_log set booking_id = null where booking_id = p_booking_id;
  update public.account_agreement_records set booking_id = null where booking_id = p_booking_id;

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
  'D-25/D-45: hard-deletes one eligible unpaid booking (pending, no pay link, no paid/captured payment, no refund/dispute/notification/edit request/review) and writes one non-PII audit_log line. Its consent_log rows and account_agreement_records rows are detached (booking_id -> NULL), never deleted (20261007300000). Returns false when not eligible. EXECUTE: vamos_system, vamos_checkout.';

-- ---------------------------------------------------------------------------
-- (4) W5-19: checkout_attach_payment refuses an erased or test booking; checkout_set_pay_link revokes the
--     earlier pay tokens. Bodies of 20260907000002 and 20260928140000 with those additions only.
-- ---------------------------------------------------------------------------
create or replace function public.checkout_attach_payment(
  p_quote_id pg_catalog.uuid,
  p_stripe_payment_intent_id pg_catalog.text,
  p_stripe_checkout_session_id pg_catalog.text,
  p_charged_rappen public.rappen
)
returns table (
  booking_id pg_catalog.uuid,
  reference pg_catalog.text,
  snapshot_id pg_catalog.int8,
  payment_id pg_catalog.int8
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking public.bookings%rowtype;
  v_payment_id pg_catalog.int8;
begin
  select b.*
    into v_booking
    from public.bookings as b
   where b.quote_id = p_quote_id
   for update;

  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  -- J9 W5-19: an erased booking and a test booking never take a payment row.
  if v_booking.erased_at is not null or v_booking.is_test then
    raise exception 'booking_not_payable' using errcode = 'restrict_violation';
  end if;

  if v_booking.status not in ('pending', 'quote') then
    raise exception 'quote_already_booked' using errcode = 'restrict_violation';
  end if;

  if exists (
    select 1
      from public.booking_payments as bp
     where bp.booking_id = v_booking.id
       and bp.status = 'succeeded'
  ) then
    raise exception 'quote_already_booked' using errcode = 'restrict_violation';
  end if;

  -- Charge gate (tg_payment_matches_snapshot) still runs on this INSERT. Unchanged.
  insert into public.booking_payments (
    booking_id,
    snapshot_id,
    stripe_payment_intent_id,
    stripe_checkout_session_id,
    charged_rappen,
    charged_currency,
    status
  ) values (
    v_booking.id,
    v_booking.price_snapshot_id,
    p_stripe_payment_intent_id,
    p_stripe_checkout_session_id,
    p_charged_rappen,
    'CHF',
    'requires_payment'
  )
  returning id into v_payment_id;

  return query
    select v_booking.id, v_booking.reference, v_booking.price_snapshot_id, v_payment_id;
end;
$$;

revoke all on function public.checkout_attach_payment(
  pg_catalog.uuid, pg_catalog.text, pg_catalog.text, public.rappen
) from public;

grant execute on function public.checkout_attach_payment(
  pg_catalog.uuid, pg_catalog.text, pg_catalog.text, public.rappen
) to vamos_checkout;

create or replace function public.checkout_set_pay_link(
  p_booking_id pg_catalog.uuid,
  p_billing_kind pg_catalog.text,
  p_company_name pg_catalog.text,
  p_company_address pg_catalog.text,
  p_company_vat pg_catalog.text,
  p_payer_email pg_catalog.text,
  p_token_hash pg_catalog.bytea,
  p_token_expires_at pg_catalog.timestamptz
)
returns pg_catalog.timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sent pg_catalog.timestamptz;
  v_hold pg_catalog.timestamptz;
  v_status public.booking_status;
begin
  if p_billing_kind not in ('individual', 'company') then
    raise exception 'invalid_request' using errcode = 'check_violation';
  end if;
  if p_billing_kind = 'company'
     and (
       coalesce(btrim(p_company_name), '') = ''
       or coalesce(btrim(p_company_address), '') = ''
       or coalesce(btrim(p_company_vat), '') = ''
     ) then
    raise exception 'invalid_request' using errcode = 'check_violation';
  end if;
  if coalesce(btrim(p_payer_email), '') = '' then
    raise exception 'invalid_request' using errcode = 'check_violation';
  end if;

  select b.status, b.pay_link_sent_at
    into v_status, v_sent
    from public.bookings as b
   where b.id = p_booking_id
   for update;

  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  if v_status not in ('pending', 'quote') then
    raise exception 'quote_already_booked' using errcode = 'restrict_violation';
  end if;

  -- D-37: resend allowed; 24h clock does not restart.
  v_sent := coalesce(v_sent, now());

  -- D-20/D-20a: one 24-hour hold from the first send.
  v_hold := least(p_token_expires_at, v_sent + interval '24 hours');

  update public.bookings
     set billing_kind = p_billing_kind,
         company_name = coalesce(p_company_name, ''),
         company_address = coalesce(p_company_address, ''),
         company_vat = coalesce(p_company_vat, ''),
         payer_email = p_payer_email::extensions.citext,
         pay_link_sent_at = v_sent,
         hold_until = v_hold,
         updated_at = now()
   where id = p_booking_id;

  -- J9 W5-19: a resend replaces the link: the earlier pay tokens of this booking stop working.
  update public.booking_access_tokens
     set revoked_at = now()
   where booking_id = p_booking_id
     and purpose = 'pay'
     and revoked_at is null
     and token_hash <> p_token_hash;

  insert into public.booking_access_tokens (
    booking_id, purpose, token_hash, expires_at
  ) values (
    p_booking_id, 'pay', p_token_hash, v_hold
  )
  on conflict (token_hash) do nothing;

  return v_sent;
end;
$$;

revoke all on function public.checkout_set_pay_link(
  pg_catalog.uuid, pg_catalog.text, pg_catalog.text, pg_catalog.text,
  pg_catalog.text, pg_catalog.text, pg_catalog.bytea, pg_catalog.timestamptz
) from public, anon, authenticated;

grant execute on function public.checkout_set_pay_link(
  pg_catalog.uuid, pg_catalog.text, pg_catalog.text, pg_catalog.text,
  pg_catalog.text, pg_catalog.text, pg_catalog.bytea, pg_catalog.timestamptz
) to vamos_checkout;

-- ---------------------------------------------------------------------------
-- (5) W5-23: checkout_cancel_unpaid. Body of 20260928110000; the caller must own the booking
--     (customers.user_id) or hold a confirmed e-mail equal to its contact e-mail, read from auth.users and
--     not from the JWT claim. Owner check first, then the status.
-- ---------------------------------------------------------------------------
create or replace function public.checkout_cancel_unpaid(p_reference text)
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
  v_uid uuid;
  v_email text;
  v_owner boolean;
  v_cut integer;
  v_sessions text[];
begin
  v_uid := app.uid();
  if v_uid is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  -- The confirmed e-mail of the signed-in user, from auth.users (null while unconfirmed).
  select lower(nullif(btrim(coalesce(u.email, '')), ''))
    into v_email
    from auth.users as u
   where u.id = v_uid
     and u.email_confirmed_at is not null;

  select b.* into v
    from public.bookings b
   where b.reference = p_reference
   for update of b;

  if v.id is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  v_owner := (
    v.customer_id is not null
    and exists (
      select 1
        from public.customers as c
       where c.id = v.customer_id
         and c.user_id = v_uid
         and c.erased_at is null
    )
  ) or (
    v_email is not null
    and lower(v.contact_email::text) = v_email
  );
  if not v_owner then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  if v.status is distinct from 'pending' then
    raise exception 'not_cancellable' using errcode = 'P0001';
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
  'Signed-in customer cancel of their own unpaid pending booking by reference. Plan 26.1-06 (D-04/D-11a): also returns the booking''s open Stripe Checkout Session ids to expire, and releases its unreleased coupon redemption. J9 W5-23: the caller must own the booking (customers.user_id) or hold a CONFIRMED e-mail equal to its contact e-mail (read from auth.users, not the JWT claim); anything else is not_found, before the status is looked at. EXECUTE: authenticated only.';

-- ---------------------------------------------------------------------------
-- (6) W5-16: stripe_dispute_upsert (J7 body). Same second as a terminal status: no step back to an open one.
-- ---------------------------------------------------------------------------
create or replace function public.stripe_dispute_upsert(
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
  v_terminal pg_catalog.text[] := array['won', 'lost', 'warning_closed', 'charge_refunded'];
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

    -- Out-of-order delivery: an older status never overwrites a newer one. Stripe's `created` has a
    -- one-second resolution, so two events can share it: then an open status never replaces a terminal
    -- one (J9 W5-16); between two open or two terminal statuses the later arrival wins, as before.
    if p_stripe_created < v_existing.stripe_created
       or (p_stripe_created = v_existing.stripe_created
           and v_existing.status = any (v_terminal)
           and not (p_status = any (v_terminal))) then
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
  '26.1-08 D-07 + J7 + J9 W5-16: inserts then updates one row per stripe_dispute_id; an older p_stripe_created never overwrites a newer status, and an event of the same second never moves a terminal status (won, lost, warning_closed, charge_refunded) back to an open one. Returns the booking reference, the stored status and alert_pending (the stored status is not the one ops was last mailed about). EXECUTE: vamos_system only.';

commit;
