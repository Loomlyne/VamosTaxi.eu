-- 20261007200000_settle_safety.sql
--
-- 261002 settle safety (quick job; plan .planning/quick/261002-settle-safety/PLAN.md, signed by the owner).
-- A difference paid on Stripe's page for a change (a dearer class, a new destination) is never lost and
-- never applied to a trip that was cancelled.
--
-- What went wrong (P6 follow-ups review, R4, and the P-1 / P-2 findings):
--   P-1  checkout_extra_payment_settle and booking_edit_request_accept locked the change request first and
--        the booking second (20261007140000). booking_edit_request_upsert, booking_change_withdraw,
--        booking_staff_change, booking_staff_trip_change, ops_cancel_booking, manage_booking_cancel and
--        customer_paid_cancel lock the booking first. Two transactions that take the same two rows in
--        opposite orders deadlock, and the database stops one of them with 40P01. When it stopped the
--        settle, the Worker took the error for final and acknowledged the Stripe event: the difference
--        was captured, nothing was recorded, no retry. Any other error inside the apply (a class that no
--        longer exists, a lost connection) did the same.
--   P-2  A cancel did not end a change that waits for its difference and did not close its Stripe page,
--        so a difference paid after the cancel was applied to the cancelled trip.
--   R4 warning 2  Accept pressed a second time on a request after the amount moved kept the first
--        difference record while the Worker's new link charged the new amount: the booking would record
--        the old one.
--
-- What changes (six functions; same signatures, same result columns, SECURITY DEFINER, search_path ''):
--   (1) checkout_extra_payment_settle  one lock order (the booking, then its request); a page shared by
--       two requests settles the one that waits; a booking that is cancelled, partly cancelled or refunded
--       never gets the change applied (the payment is recorded, a change that waited ends, Refund due: the
--       full refund the cancel owed grows by the difference, otherwise the owner decides); the apply runs
--       in its own block: a deadlock, serialization, lock, connection, resource, shutdown or timeout error
--       is raised again (the Worker retries the event), any other error rolls back the apply only, the
--       payment is recorded, the request ends and the paid difference shows as Refund due.
--   (2) booking_edit_request_accept    the booking is locked before the request (same refusal order); new
--       refusal price-changed (P0001, nothing written) when the request already has a difference record
--       whose total differs from the current difference.
--   (3) app.apply_customer_cancel      locks the booking first (callers already do); the cancel ends every
--       change request of the booking that still waits (superseded).
--   (4) ops_cancel_booking             the same, for the dashboard cancel.
--   (5) checkout_reference_for_session also finds the booking of a difference page, so the stuck-payment
--       mail names it.
--   (6) NEW booking_cancel_change_pages the Stripe pages of a cancelled booking's ended, unpaid change
--       requests whose difference record has not expired; the Worker closes them after the cancel.
--
-- Safe on real paid bookings: no row is inserted, updated or deleted by this file and there is no
-- backfill; only function bodies are replaced, plus one new function. Live holds 1 row in
-- booking_edit_requests (staff, accepted), nothing waits (read 2026-10-02). It can run twice: create or
-- replace, and revokes/grants that are no-ops the second time. No begin/commit: the CLI applies the file.
--
-- Grants are re-stated exactly as each function's own file has them (a create or replace keeps the old
-- ACL and this file does not trust what an older replay left behind): settle, accept, ops_cancel_booking
-- and checkout_reference_for_session EXECUTE vamos_system only; app.apply_customer_cancel no grant; the
-- new function EXECUTE vamos_system only.
--
-- Rollback = re-apply the previous bodies with create or replace, each with its comment, from their files:
--   checkout_extra_payment_settle      20261007140000_class_change_reprice.sql   lines 1007-1291
--   booking_edit_request_accept        20261007140000_class_change_reprice.sql   lines 478-643
--   app.apply_customer_cancel          20261005140000_refunds_by_hand.sql        lines 34-205
--   public.ops_cancel_booking          20261005140000_refunds_by_hand.sql        lines 212-383
--   checkout_reference_for_session     20260924193000_checkout_reference_for_session.sql
--   drop function public.booking_cancel_change_pages(pg_catalog.uuid);
-- Nothing else depends on this change (the Worker side treats a missing booking_cancel_change_pages as
-- "nothing to close" and never sees price-changed from the old Accept).

-- ---------------------------------------------------------------------------
-- (1) checkout_extra_payment_settle -- body of 20261007140000 (P1), changed as listed above.
-- ---------------------------------------------------------------------------
create or replace function public.checkout_extra_payment_settle(
  p_event_id pg_catalog.text,
  p_session_id pg_catalog.text,
  p_payment_intent_id pg_catalog.text,
  p_outcome pg_catalog.text,
  p_charged_currency pg_catalog.text,
  p_fx_rate pg_catalog.numeric,
  p_fx_source pg_catalog.text,
  p_fx_quoted_at pg_catalog.timestamptz,
  p_presentment_amount_minor pg_catalog.int8
)
returns table (
  booking_id pg_catalog.uuid,
  reference pg_catalog.text,
  locale pg_catalog.text,
  contact_email pg_catalog.text,
  already_settled pg_catalog.bool,
  request_id pg_catalog.uuid,
  applied pg_catalog.bool,
  class_changed pg_catalog.bool,
  unassigned_chauffeur_id pg_catalog.uuid
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_req public.booking_edit_requests%rowtype;
  v_booking public.bookings%rowtype;
  v_extra public.price_snapshots%rowtype;
  v_pay public.booking_payments%rowtype;
  v_orig pg_catalog.int8;
  v_actor_label pg_catalog.text;
  v_before public.booking_legs%rowtype;
  v_after public.booking_legs%rowtype;
  v_applied pg_catalog.bool := false;
  v_class_changed pg_catalog.bool := false;
  v_unassigned pg_catalog.uuid;
  -- 261002 settle safety
  v_booking_id pg_catalog.uuid;
  v_ended pg_catalog.bool := false;
  v_err_state pg_catalog.text;
  v_err_text pg_catalog.text;
begin
  if p_outcome is distinct from 'succeeded'
     and p_outcome is distinct from 'failed'
     and p_outcome is distinct from 'canceled' then
    raise exception 'invalid_outcome' using errcode = 'check_violation';
  end if;

  if p_session_id is null or pg_catalog.btrim(p_session_id) = '' then
    raise exception 'payment_not_found' using errcode = 'P0002';
  end if;

  -- 261002 settle safety (P-1): one lock order, the booking and then its request, like every other writer
  -- of a booking's change requests (upsert, withdraw, staff changes, cancels). The request is first read
  -- without a lock only to learn which booking it belongs to.
  -- The pick is deterministic: a Stripe page shared by two requests of one booking settles the one that
  -- waits (a request that still waits is the one the customer paid for), else the newest.
  select r.booking_id
    into v_booking_id
    from public.booking_edit_requests as r
   where r.extra_session_id = p_session_id
   order by (r.status = 'requested') desc, r.created_at desc
   limit 1;

  if not found then
    raise exception 'payment_not_found' using errcode = 'P0002';
  end if;

  select b.*
    into v_booking
    from public.bookings as b
   where b.id = v_booking_id
     for update;

  select r.*
    into v_req
    from public.booking_edit_requests as r
   where r.extra_session_id = p_session_id
     and r.booking_id = v_booking_id
   order by (r.status = 'requested') desc, r.created_at desc
   limit 1
     for update;

  if not found then
    raise exception 'payment_not_found' using errcode = 'P0002';
  end if;

  if v_req.extra_payment_id is not null then
    select p.*
      into v_pay
      from public.booking_payments as p
     where p.id = v_req.extra_payment_id
       for update;
    if v_pay.status = 'succeeded' and p_outcome = 'succeeded' then
      update public.stripe_events
         set processed_at = pg_catalog.now()
       where id = p_event_id;
      return query
        select v_booking.id,
               v_booking.reference,
               v_booking.locale,
               v_booking.contact_email::pg_catalog.text,
               true,
               v_req.id,
               false,
               false,
               null::pg_catalog.uuid;
      return;
    end if;
  end if;

  if p_outcome is distinct from 'succeeded' then
    insert into public.booking_events (
      booking_id, kind, actor_kind, actor_label, payload
    ) values (
      v_booking.id,
      'payment.failed',
      'stripe',
      'Stripe webhook',
      pg_catalog.jsonb_build_object('kind', 'extra', 'extra_id', v_req.id)
    );
    -- D4: the difference was not paid (the page expired or the payment failed): the request
    -- ends; the booking is untouched; the admin can start again.
    if v_req.status = 'requested' then
      update public.booking_edit_requests
         set status = 'superseded'
       where id = v_req.id;
    end if;
    update public.stripe_events
       set processed_at = pg_catalog.now()
     where id = p_event_id;
    return query
      select v_booking.id,
             v_booking.reference,
             v_booking.locale,
             v_booking.contact_email::pg_catalog.text,
             false,
             v_req.id,
             false,
             false,
             null::pg_catalog.uuid;
    return;
  end if;

  select s.*
    into v_extra
    from public.price_snapshots as s
   where s.id = v_req.extra_snapshot_id;

  if not found then
    raise exception 'not-found' using errcode = 'P0002';
  end if;

  v_orig := v_booking.price_snapshot_id;

  -- Charge gate requires bookings.price_snapshot_id = extra snapshot. Restored below: by
  -- apply_payload (the new full price record) or to the original when nothing is applied.
  update public.bookings
     set price_snapshot_id = v_extra.id
   where id = v_booking.id;

  if v_pay.id is null then
    insert into public.booking_payments (
      booking_id,
      snapshot_id,
      stripe_payment_intent_id,
      stripe_checkout_session_id,
      charged_rappen,
      charged_currency,
      status,
      captured_at,
      fx_rate,
      fx_source,
      fx_quoted_at,
      presentment_amount_minor
    ) values (
      v_booking.id,
      v_extra.id,
      coalesce(p_payment_intent_id, p_session_id),
      p_session_id,
      v_extra.total_rappen,
      coalesce(p_charged_currency, 'CHF'),
      'succeeded',
      pg_catalog.now(),
      p_fx_rate,
      p_fx_source,
      p_fx_quoted_at,
      p_presentment_amount_minor
    )
    returning * into v_pay;
  else
    update public.booking_payments
       set status = 'succeeded',
           captured_at = pg_catalog.now(),
           charged_currency = coalesce(p_charged_currency, charged_currency),
           fx_rate = coalesce(p_fx_rate, fx_rate),
           fx_source = coalesce(p_fx_source, fx_source),
           fx_quoted_at = coalesce(p_fx_quoted_at, fx_quoted_at),
           presentment_amount_minor = coalesce(p_presentment_amount_minor, presentment_amount_minor)
     where id = v_pay.id
    returning * into v_pay;
  end if;

  select coalesce(s.full_name, v_req.actor)
    into v_actor_label
    from public.staff as s
   where s.user_id = v_req.actor_id;

  if v_actor_label is null then
    v_actor_label := coalesce(v_req.actor, '');
  end if;

  -- 261002 settle safety (P-2): a booking that was cancelled (all of it or a leg), or refunded, since the
  -- change was asked never gets the change applied, whatever the request says. The money is recorded
  -- below and shows as Refund due.
  v_ended := v_booking.status in ('cancelled'::public.booking_status,
                                  'partially_cancelled'::public.booking_status,
                                  'refunded'::public.booking_status);

  -- A request that still waits is applied. So is one the admin withdrew when the customer paid
  -- in the same second (owner sign-off 2026-10-01: she gets what she paid for), as long as no
  -- newer change was asked since and the trip still runs.
  if not v_ended
     and (v_req.status = 'requested'
          or (v_req.status = 'withdrawn'
              and v_booking.status not in ('cancelled'::public.booking_status,
                                           'partially_cancelled'::public.booking_status,
                                           'refunded'::public.booking_status)
              -- nothing newer: no other change waits, and the booking is still bound to the price
              -- record this change was built on (no other change was applied since)
              and not exists (
                select 1 from public.booking_edit_requests as x
                 where x.booking_id = v_req.booking_id
                   and x.id <> v_req.id
                   and x.status = 'requested'
              )
              and v_orig is not distinct from (
                select q.supersedes_id from public.price_snapshots as q where q.id = v_req.quote_snapshot_id
              ))) then
    -- 261002 settle safety (P-1): the apply runs in its own block (a sub-transaction). A database hiccup
    -- (deadlock, serialization, lock, connection, resource, shutdown, timeout) is raised again: the whole
    -- settle rolls back and the Worker retries the event. Any other error (the class is gone, too many
    -- travellers for the class, a refused place) rolls back the apply only: the payment below is still
    -- recorded and the paid difference shows as Refund due. Never acknowledge a captured payment unrecorded.
    begin
      select l.* into v_before
        from public.booking_legs as l
       where l.booking_id = v_booking.id
       order by l.leg_seq
       limit 1;

      perform public.booking_edit_apply_payload(
        v_booking.id,
        v_req.quote_snapshot_id,
        v_req.payload,
        v_req.actor_id,
        case when v_req.actor = 'staff' then 'staff' else 'customer' end,
        v_actor_label
      );

      select l.* into v_after from public.booking_legs as l where l.id = v_before.id;
      v_applied := true;
      v_class_changed := v_after.vehicle_class_id is distinct from v_before.vehicle_class_id;
      if v_before.assigned_chauffeur_id is not null and v_after.assigned_chauffeur_id is null then
        v_unassigned := v_before.assigned_chauffeur_id;
      end if;

      update public.booking_edit_requests
         set status = 'accepted',
             accepted_at = pg_catalog.now(),
             extra_payment_id = v_pay.id
       where id = v_req.id;
    exception when others then
      get stacked diagnostics v_err_state = returned_sqlstate, v_err_text = message_text;
      -- A database hiccup is not final: the Worker retries the event.
      if v_err_state in ('40001', '40P01', '55P03', '57014', '57P01', '57P02', '57P03')
         or pg_catalog.left(v_err_state, 2) in ('08', '53', '58') then
        raise;
      end if;
      v_applied := false;
      v_class_changed := false;
      v_unassigned := null;
    end;
  end if;

  if not v_applied then
    -- The request had ended (replaced by a newer change, its time ran out, or withdrawn and overtaken
    -- by a newer change), the trip was cancelled, or the change could not be applied (see above) before
    -- this payment arrived. The money is recorded; the trip is not changed; what was paid above the price
    -- shows as Refund due for the admin.
    update public.bookings
       set price_snapshot_id = v_orig
     where id = v_booking.id;
    -- A change that still waited ends here, naming its payment (nothing will apply it later).
    update public.booking_edit_requests
       set extra_payment_id = v_pay.id,
           status = case when status = 'requested' then 'superseded' else status end
     where id = v_req.id;

    if v_err_state is not null then
      -- 261002 settle safety (P-1): the apply failed for a reason of its own; the owner can see why.
      insert into public.booking_events (
        booking_id, kind, actor_kind, actor_label, payload
      ) values (
        v_booking.id,
        'refund.requested',
        'stripe',
        'Stripe webhook',
        pg_catalog.jsonb_build_object(
          'via', 'difference_not_applied',
          'request_id', v_req.id,
          'sqlstate', v_err_state,
          'reason', v_err_text,
          'due_rappen', v_pay.charged_rappen::pg_catalog.int4
        )
      );
    end if;

    if v_ended then
      -- 261002 settle safety (P-2): paid after the cancel. Refund due on the cancelled booking.
      if coalesce(v_booking.refund_owed_rappen, 0) > 0
         and v_booking.refund_status in ('pending_ops', 'processing', 'failed') then
        -- The cancel already owed a full refund (or one is being sent): the difference is added to it.
        update public.bookings
           set refund_owed_rappen = (v_booking.refund_owed_rappen + v_pay.charged_rappen)::public.rappen,
               updated_at = pg_catalog.now()
         where id = v_booking.id;
      elsif v_booking.refund_status is distinct from 'processing'
            and v_booking.refund_status is distinct from 'failed' then
        -- Otherwise Refund due for the owner to decide, as for any cancelled paid booking.
        update public.bookings
           set refund_status = 'pending_ops',
               refund_owed_rappen = null,
               updated_at = pg_catalog.now()
         where id = v_booking.id;
      end if;
      insert into public.booking_events (
        booking_id, kind, actor_kind, actor_label, payload
      ) values (
        v_booking.id,
        'refund.requested',
        'stripe',
        'Stripe webhook',
        pg_catalog.jsonb_build_object(
          'via', 'difference_after_cancel',
          'request_id', v_req.id,
          'due_rappen', v_pay.charged_rappen::pg_catalog.int4
        )
      );
    end if;
  end if;

  perform app.booking_change_settle_credit(v_booking.id, null, 'stripe', 'Stripe webhook');

  -- Booking status is intentionally untouched (no pending->paid->confirmed).

  update public.stripe_events
     set processed_at = pg_catalog.now()
   where id = p_event_id;

  return query
    select v_booking.id,
           v_booking.reference,
           v_booking.locale,
           v_booking.contact_email::pg_catalog.text,
           false,
           v_req.id,
           v_applied,
           v_class_changed,
           v_unassigned;
end;
$$;

revoke all on function public.checkout_extra_payment_settle(
  pg_catalog.text, pg_catalog.text, pg_catalog.text, pg_catalog.text, pg_catalog.text,
  pg_catalog.numeric, pg_catalog.text, pg_catalog.timestamptz, pg_catalog.int8
) from public;

grant execute on function public.checkout_extra_payment_settle(
  pg_catalog.text, pg_catalog.text, pg_catalog.text, pg_catalog.text, pg_catalog.text,
  pg_catalog.numeric, pg_catalog.text, pg_catalog.timestamptz, pg_catalog.int8
) to vamos_system;

comment on function public.checkout_extra_payment_settle(
  pg_catalog.text, pg_catalog.text, pg_catalog.text, pg_catalog.text, pg_catalog.text,
  pg_catalog.numeric, pg_catalog.text, pg_catalog.timestamptz, pg_catalog.int8
) is
  '08-07 D-67/D-69 + 26.2 P1: insert the extra payment against the difference snapshot. A request that still waits is applied (applied, class_changed, unassigned_chauffeur_id returned; D6), so is one withdrawn in the same second when nothing newer was asked and the trip still runs; a request that has ended otherwise is not applied and the overpayment shows as Refund due. Not paid (failed / canceled / expired): the request ends (D4), the booking is untouched. Never rewinds confirmed to pending. 261002 settle safety: one lock order (the booking, then its request) like every other writer, so a deadlock with a customer request cannot happen; a Stripe page shared by two requests settles the one that waits; a booking that is cancelled, partly cancelled or refunded never gets the change applied: the payment is recorded, a change that waited ends (superseded), and Refund due is the full refund the cancel owed plus the difference, otherwise pending_ops for the owner to decide (event refund.requested via difference_after_cancel); the apply runs in its own block: a deadlock, serialization, lock, connection, resource, shutdown or timeout error is raised again so the Worker retries, any other error rolls back the apply only, the payment is recorded, the request ends (superseded) and the paid difference shows as Refund due (event refund.requested via difference_not_applied with sqlstate and reason). EXECUTE vamos_system only.';

-- ---------------------------------------------------------------------------
-- (2) booking_edit_request_accept -- body of 20261007140000 (P1), changed as listed above.
-- ---------------------------------------------------------------------------
create or replace function public.booking_edit_request_accept(
  p_request_id pg_catalog.uuid,
  p_actor_id pg_catalog.uuid
)
returns table (
  request_id pg_catalog.uuid,
  booking_id pg_catalog.uuid,
  outcome pg_catalog.text,
  difference_rappen pg_catalog.int4,
  extra_snapshot_id pg_catalog.int8,
  extra_session_id pg_catalog.text,
  hours_before pg_catalog.numeric,
  original_payment_id pg_catalog.int8,
  original_intent_id pg_catalog.text
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_req public.booking_edit_requests%rowtype;
  v_booking public.bookings%rowtype;
  v_quote public.price_snapshots%rowtype;
  v_pay public.booking_payments%rowtype;
  v_actor_label pg_catalog.text;
  v_hours pg_catalog.numeric(8,2);
  v_diff pg_catalog.int4;
  v_extra pg_catalog.int8;
  v_outcome pg_catalog.text;
  -- 261002 settle safety
  v_booking_id pg_catalog.uuid;
  v_extra_total pg_catalog.int4;
begin
  -- 261002 settle safety (P-1): one lock order, the booking and then its request, like every other writer
  -- of a booking's change requests. The request is first read without a lock only to learn its booking.
  select r.booking_id
    into v_booking_id
    from public.booking_edit_requests as r
   where r.id = p_request_id;

  if not found then
    raise exception 'not-found' using errcode = 'P0002';
  end if;

  select b.*
    into v_booking
    from public.bookings as b
   where b.id = v_booking_id
     for update;

  select r.*
    into v_req
    from public.booking_edit_requests as r
   where r.id = p_request_id
     and r.booking_id = v_booking_id
     for update;

  if not found then
    raise exception 'not-found' using errcode = 'P0002';
  end if;

  if v_req.status is distinct from 'requested' then
    raise exception 'not-requested' using errcode = 'P0001';
  end if;

  -- The refusal order is as before: not-found, not-requested, then an erased booking is not-found.
  if v_booking.id is null or v_booking.erased_at is not null then
    raise exception 'not-found' using errcode = 'P0002';
  end if;

  if v_booking.refund_status in ('processing', 'failed') then
    raise exception 'refund-open' using errcode = 'P0001';
  end if;

  if v_req.extra_snapshot_id is not null and exists (
    select 1 from public.price_snapshots as x
     where x.id = v_req.extra_snapshot_id and x.expires_at <= pg_catalog.now()
  ) then
    raise exception 'expired' using errcode = 'P0001';
  end if;

  select p.*
    into v_pay
    from public.booking_payments as p
   where p.booking_id = v_booking.id
     and p.captured_at is not null
   order by p.captured_at
   limit 1
     for update;

  if not found then
    raise exception 'unpaid' using errcode = 'P0001';
  end if;

  select s.*
    into v_quote
    from public.price_snapshots as s
   where s.id = v_req.quote_snapshot_id;

  if not found or v_quote.total_rappen is null then
    raise exception 'not-found' using errcode = 'P0002';
  end if;

  -- W2: everything paid so far minus refunds, not the first payment.
  v_diff := v_quote.total_rappen - app.booking_paid_net(v_booking.id);

  -- 261002 settle safety (P6 follow-ups review R4, warning 2): a difference that is already priced (the
  -- request has its difference record, and maybe a Stripe page) is accepted again only at that same
  -- amount. If what is paid moved since (a refund, a payment), a new link would charge the new amount
  -- while the booking recorded the old one: refused, nothing is written, the first link stays valid
  -- (its amount matches the booking's record).
  if v_req.extra_snapshot_id is not null then
    select s.total_rappen
      into v_extra_total
      from public.price_snapshots as s
     where s.id = v_req.extra_snapshot_id;

    if v_extra_total is distinct from v_diff then
      raise exception 'price-changed' using errcode = 'P0001';
    end if;
  end if;

  select coalesce(s.full_name, '')
    into v_actor_label
    from public.staff as s
   where s.user_id = p_actor_id;

  if v_actor_label is null then
    v_actor_label := '';
  end if;

  select coalesce(
           pg_catalog.round(
             (
               pg_catalog.date_part('epoch', pg_catalog.min(l.scheduled_at) - pg_catalog.now())
               / 3600
             )::pg_catalog.numeric,
             2
           ),
           0
         )
    into v_hours
    from public.booking_legs as l
   where l.booking_id = v_booking.id;

  if v_diff > 0 then
    if v_req.extra_snapshot_id is null then
      v_extra := public.booking_edit_mint_extra_snapshot(
        v_booking.id,
        v_req.quote_snapshot_id,
        v_pay.snapshot_id,
        v_diff::public.rappen
      );
      update public.booking_edit_requests
         set extra_snapshot_id = v_extra
       where id = v_req.id;
    else
      v_extra := v_req.extra_snapshot_id;
    end if;
    v_outcome := 'extra_required';
  else
    -- Same price or cheaper: applied now. Cheaper leaves "Refund due"; the admin presses Refund
    -- (refunds by hand, decision 1). Nothing goes to Stripe here.
    perform public.booking_edit_apply_payload(
      v_booking.id,
      v_req.quote_snapshot_id,
      v_req.payload,
      p_actor_id,
      'staff',
      v_actor_label
    );
    update public.booking_edit_requests
       set status = 'accepted',
           accepted_at = pg_catalog.now()
     where id = v_req.id;
    perform app.booking_change_settle_credit(v_booking.id, p_actor_id, 'staff', v_actor_label);
    v_outcome := case when v_diff = 0 then 'applied' else 'refund_due' end;
  end if;

  return query
    select v_req.id,
           v_booking.id,
           v_outcome,
           v_diff,
           coalesce(v_extra, v_req.extra_snapshot_id),
           v_req.extra_session_id,
           v_hours,
           v_pay.id,
           v_pay.stripe_payment_intent_id;
end;
$$;

revoke all on function public.booking_edit_request_accept(
  pg_catalog.uuid, pg_catalog.uuid
) from public;

grant execute on function public.booking_edit_request_accept(
  pg_catalog.uuid, pg_catalog.uuid
) to vamos_system;

comment on function public.booking_edit_request_accept(
  pg_catalog.uuid, pg_catalog.uuid
) is
  '08-07 + 26.2 P1: ops accept. difference = new total - (captured - refunds). 0: applied. Higher: extra_required, trip unchanged until the difference is paid. Lower: applied at once, Refund due (refund_status pending_ops) for the admin''s Refund click; outcome refund_due. Refusals: not-found, not-requested, unpaid, refund-open, expired, price-changed (P0001, nothing written: the request already has a difference record whose total differs from the current difference). 261002 settle safety: the booking is locked before the request (one lock order with the settle and the cancels). EXECUTE vamos_system only.';

-- ---------------------------------------------------------------------------
-- (3) app.apply_customer_cancel -- body of 20261005140000 (shared by manage_booking_cancel and
--     customer_paid_cancel), changed as listed above.
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
  '09-02 shared cancel body, changed by 20-10 refunds by hand: a paid booking cancelled more than 24 h ahead ends refund_status pending_ops with refund_owed_rappen = captured (nothing goes to Stripe; the team sends the refund); an unpaid one ends none; inside 24 h unchanged (pending_ops, owed null). 261002 settle safety: locks the booking first; the cancel ends every change request of the booking that still waits for its difference (superseded). No grant: called by the SECURITY DEFINER cancel functions only.';

-- ---------------------------------------------------------------------------
-- (4) public.ops_cancel_booking -- body of 20261005140000, changed as listed above (that file dropped
--     and created it; this one replaces it in place: same signature, same result columns).
-- ---------------------------------------------------------------------------
create or replace function public.ops_cancel_booking(
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

  -- 261002 settle safety (P-2): a cancel ends any change that waits for its difference; the Worker closes
  -- its Stripe page (booking_cancel_change_pages). A payment that still lands is Refund due, never applied
  -- (checkout_extra_payment_settle).
  update public.booking_edit_requests
     set status = 'superseded'
   where booking_id = v_booking.id
     and status = 'requested';

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
  '08-05 + 09-02 D-13, extended by plan 26.1-06 (D-04/D-11a): ops cancel without Stripe. Calls compute_cancellation_refund (same D-02 windows), returns refund_mode + refund_rappen + the booking''s open Stripe Checkout Session ids (empty for an already-paid booking), and releases its unreleased coupon redemption when it was unpaid. 20-10: a paid booking cancelled more than 24 h ahead ends pending_ops with owed = captured (refund due, nothing goes to Stripe); an unpaid one ends none. 261002 settle safety: the cancel ends every change request of the booking that still waits for its difference (superseded); the Worker closes its Stripe page (booking_cancel_change_pages). EXECUTE vamos_system only.';

-- ---------------------------------------------------------------------------
-- (5) checkout_reference_for_session -- body of 20260924193000, also finds a difference page.
-- ---------------------------------------------------------------------------
create or replace function public.checkout_reference_for_session(
  p_session_id pg_catalog.text
)
returns pg_catalog.text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select b.reference
       from public.booking_payments as bp
       join public.bookings as b on b.id = bp.booking_id
      where bp.stripe_checkout_session_id = p_session_id
      limit 1),
    -- 261002 settle safety: a page for a change's difference has no payment row until it is paid.
    (select b.reference
       from public.booking_edit_requests as r
       join public.bookings as b on b.id = r.booking_id
      where r.extra_session_id = p_session_id
      order by r.created_at desc
      limit 1)
  )
$$;

revoke all on function public.checkout_reference_for_session(pg_catalog.text) from public;
revoke all on function public.checkout_reference_for_session(pg_catalog.text) from anon;
revoke all on function public.checkout_reference_for_session(pg_catalog.text) from authenticated;
grant execute on function public.checkout_reference_for_session(pg_catalog.text) to vamos_system;

comment on function public.checkout_reference_for_session(pg_catalog.text) is
  'Booking reference for a Checkout Session. vamos_system EXECUTE only. No table SELECT. 261002 settle safety: also the booking of a change''s difference page (booking_edit_requests.extra_session_id), which has no payment row until it is paid, so the stuck-payment mail names the booking.';

-- ---------------------------------------------------------------------------
-- (6) booking_cancel_change_pages -- new.
-- ---------------------------------------------------------------------------
create or replace function public.booking_cancel_change_pages(p_booking_id pg_catalog.uuid)
returns table (extra_session_id pg_catalog.text)
language sql
stable
security definer
set search_path = ''
as $$
  -- One row per Stripe page, oldest first (two requests may share a page).
  select r.extra_session_id
    from public.booking_edit_requests as r
    join public.bookings as b on b.id = r.booking_id
    join public.price_snapshots as x on x.id = r.extra_snapshot_id
   where r.booking_id = p_booking_id
     and b.status in ('cancelled'::public.booking_status,
                      'partially_cancelled'::public.booking_status,
                      'refunded'::public.booking_status)
     and r.extra_session_id is not null
     and r.extra_payment_id is null
     and r.status <> 'accepted'
     and x.expires_at > pg_catalog.now()
   group by r.extra_session_id
   order by pg_catalog.min(r.created_at), r.extra_session_id
$$;

revoke all on function public.booking_cancel_change_pages(pg_catalog.uuid) from public, anon, authenticated;
grant execute on function public.booking_cancel_change_pages(pg_catalog.uuid) to vamos_system;

comment on function public.booking_cancel_change_pages(pg_catalog.uuid) is
  '261002 settle safety: for a cancelled (or partly cancelled, or refunded) booking only, the Stripe pages of its change requests that the cancel ended and that may still be open: a page was stored, no payment is recorded for it, the request is not accepted and its difference record has not expired. The Worker closes each page after the cancel (best effort). Nothing for a live booking. EXECUTE vamos_system only.';
