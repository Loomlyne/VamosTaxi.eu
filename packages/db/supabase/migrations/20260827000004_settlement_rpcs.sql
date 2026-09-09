-- 20260827000004_settlement_rpcs.sql
--
-- Plan 07-03. These are SECURITY DEFINER RPCs rather than direct Worker writes because
-- …023_rls_staff.sql revokes everything on stripe_events, booking_notifications,
-- booking_events and booking_payments from anon, authenticated, vamos_guest, vamos_edge,
-- vamos_public and vamos_staff (staff keep a column-scoped SELECT that excludes payload),
-- and …019_append_only.sql applies FORCE RLS. No role holds a write grant the webhook
-- fetch handler or Queue consumer could use.
--
-- 07-RESEARCH.md Pattern 3 (publicSql(env) insert into public.stripe_events) is
-- superseded: publicSql is branded to the five public-content tables.
--
-- EXECUTE is granted to vamos_system only. The Data API roles are not granted, and
-- vamos_checkout is a separate role so a bug in the public checkout route cannot
-- confirm a booking (T-07-17).
--
-- Ordering is Stripe's own created timestamp (stripe_created), never received_at —
-- quoting the stripe_events table comment: "Ordering is (object_id, stripe_created),
-- never received_at."

-- 1. stripe_event_record — webhook fetch handler's only database call (D-13).
--    Insert-first so the ledger records the delivery before anything downstream can
--    fail. The caller enqueues regardless of the return value — the return is
--    telemetry, not a gate, because the consumer re-checks processed_at anyway
--    (…014: a retry that hits the primary key must not be "discarded silently with
--    a 200" while the booking stays pending).

create function public.stripe_event_record(
  p_id pg_catalog.text,
  p_type pg_catalog.text,
  p_stripe_created pg_catalog.timestamptz,
  p_object_id pg_catalog.text,
  p_payload pg_catalog.jsonb
)
returns pg_catalog.bool
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inserted pg_catalog.bool;
begin
  insert into public.stripe_events (
    id, type, stripe_created, object_id, payload
  ) values (
    p_id, p_type, p_stripe_created, p_object_id, p_payload
  )
  on conflict (id) do nothing
  returning true into v_inserted;

  return coalesce(v_inserted, false);
end;
$$;

revoke all on function public.stripe_event_record(
  pg_catalog.text,
  pg_catalog.text,
  pg_catalog.timestamptz,
  pg_catalog.text,
  pg_catalog.jsonb
) from public;

grant execute on function public.stripe_event_record(
  pg_catalog.text,
  pg_catalog.text,
  pg_catalog.timestamptz,
  pg_catalog.text,
  pg_catalog.jsonb
) to vamos_system;

comment on function public.stripe_event_record(
  pg_catalog.text,
  pg_catalog.text,
  pg_catalog.timestamptz,
  pg_catalog.text,
  pg_catalog.jsonb
) is
  'D-13 (plan 07-03): insert-first stripe_events dedupe. Returns true when inserted, false on conflict. Caller enqueues regardless.';

-- 2. stripe_event_begin — consumer admission check (D-14).
--    Increment attempts, then decide. Ordering is stripe_created, never received_at.

create function public.stripe_event_begin(
  p_event_id pg_catalog.text,
  p_object_ids pg_catalog.text[],
  p_stripe_created pg_catalog.timestamptz
)
returns table (
  should_process pg_catalog.bool,
  reason pg_catalog.text
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_processed_at pg_catalog.timestamptz;
begin
  update public.stripe_events
     set attempts = attempts + 1
   where id = p_event_id
  returning processed_at into v_processed_at;

  if not found then
    raise exception 'event_not_found'
      using errcode = 'P0002';
  end if;

  if v_processed_at is not null then
    return query select false, 'already_processed'::pg_catalog.text;
    return;
  end if;

  -- Out-of-order rule as SQL: a canceled delivered after a succeeded for the same
  -- payment family is refused here, not in the Worker. p_object_ids spans cs_ and
  -- pi_ ids. The stripe_events_object (object_id, stripe_created) partial index
  -- serves this predicate.
  if exists (
    select 1
      from public.stripe_events as e
     where e.object_id = any (p_object_ids)
       and e.processed_at is not null
       and e.stripe_created > p_stripe_created
  ) then
    return query select false, 'superseded'::pg_catalog.text;
    return;
  end if;

  return query select true, 'ok'::pg_catalog.text;
  return;
end;
$$;

revoke all on function public.stripe_event_begin(
  pg_catalog.text,
  pg_catalog.text[],
  pg_catalog.timestamptz
) from public;

grant execute on function public.stripe_event_begin(
  pg_catalog.text,
  pg_catalog.text[],
  pg_catalog.timestamptz
) to vamos_system;

comment on function public.stripe_event_begin(
  pg_catalog.text,
  pg_catalog.text[],
  pg_catalog.timestamptz
) is
  'D-14 (plan 07-03): increment attempts, then already_processed / superseded / ok. Ordering is stripe_created, never received_at.';

-- 3. stripe_event_settle — success stamps processed_at; failure records last_error
--    and leaves processed_at null so the unprocessed sweep and Queue retry still see it.

create function public.stripe_event_settle(
  p_event_id pg_catalog.text,
  p_error pg_catalog.text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_error is null then
    update public.stripe_events
       set processed_at = pg_catalog.now()
     where id = p_event_id;
  else
    update public.stripe_events
       set last_error = p_error
     where id = p_event_id;
  end if;
end;
$$;

revoke all on function public.stripe_event_settle(
  pg_catalog.text,
  pg_catalog.text
) from public;

grant execute on function public.stripe_event_settle(
  pg_catalog.text,
  pg_catalog.text
) to vamos_system;

comment on function public.stripe_event_settle(
  pg_catalog.text,
  pg_catalog.text
) is
  'Plan 07-03: stamp processed_at on success, or last_error without processed_at on failure.';

-- 4. checkout_payment_settle — pending → paid → confirmed, one transaction (D-15).
--    processed_at is set in the same transaction as the state change so a retry
--    cannot 200 while the booking stays pending (the …014 gap).

create function public.checkout_payment_settle(
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
  already_settled pg_catalog.bool
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_pay public.booking_payments%rowtype;
  v_booking public.bookings%rowtype;
begin
  if p_outcome is distinct from 'succeeded'
     and p_outcome is distinct from 'failed'
     and p_outcome is distinct from 'canceled' then
    raise exception 'invalid_outcome'
      using errcode = 'check_violation';
  end if;

  if p_session_id is not null then
    select bp.*
      into v_pay
      from public.booking_payments as bp
     where bp.stripe_checkout_session_id = p_session_id
       for update;
  end if;

  if v_pay.id is null and p_payment_intent_id is not null then
    select bp.*
      into v_pay
      from public.booking_payments as bp
     where bp.stripe_payment_intent_id = p_payment_intent_id
       for update;
  end if;

  if v_pay.id is null then
    raise exception 'payment_not_found'
      using errcode = 'P0002';
  end if;

  select b.*
    into v_booking
    from public.bookings as b
   where b.id = v_pay.booking_id
     for update;

  if v_pay.status = 'succeeded' and p_outcome = 'succeeded' then
    return query
      select v_booking.id,
             v_booking.reference,
             v_booking.locale,
             v_booking.contact_email::pg_catalog.text,
             true;
    return;
  end if;

  update public.booking_payments
     set status = p_outcome,
         captured_at = case
                         when p_outcome = 'succeeded' then pg_catalog.now()
                         else captured_at
                       end,
         charged_currency = coalesce(p_charged_currency, charged_currency),
         fx_rate = case
                     when p_charged_currency is not null then p_fx_rate
                     else fx_rate
                   end,
         fx_source = case
                       when p_charged_currency is not null then p_fx_source
                       else fx_source
                     end,
         fx_quoted_at = case
                          when p_charged_currency is not null then p_fx_quoted_at
                          else fx_quoted_at
                        end,
         presentment_amount_minor = case
                                      when p_charged_currency is not null
                                      then p_presentment_amount_minor
                                      else presentment_amount_minor
                                    end
   where id = v_pay.id;

  if p_outcome = 'succeeded' then
    if v_booking.status = 'pending' then
      update public.bookings
         set status = 'paid'::public.booking_status,
             updated_at = pg_catalog.now()
       where id = v_booking.id;

      update public.booking_legs
         set status = 'paid'::public.booking_status
       where booking_id = v_booking.id
         and status = 'pending'::public.booking_status;

      insert into public.booking_events (
        booking_id, kind, actor_kind, actor_label, from_status, to_status, payment_id
      ) values (
        v_booking.id,
        'booking.status_changed',
        'stripe',
        'Stripe webhook',
        'pending'::public.booking_status,
        'paid'::public.booking_status,
        v_pay.id
      );

      v_booking.status := 'paid';
    end if;

    if v_booking.status = 'paid' then
      update public.bookings
         set status = 'confirmed'::public.booking_status,
             updated_at = pg_catalog.now()
       where id = v_booking.id;

      update public.booking_legs
         set status = 'confirmed'::public.booking_status
       where booking_id = v_booking.id
         and status = 'paid'::public.booking_status;

      insert into public.booking_events (
        booking_id, kind, actor_kind, actor_label, from_status, to_status, payment_id
      ) values (
        v_booking.id,
        'booking.status_changed',
        'stripe',
        'Stripe webhook',
        'paid'::public.booking_status,
        'confirmed'::public.booking_status,
        v_pay.id
      );

      v_booking.status := 'confirmed';
    end if;

    insert into public.booking_events (
      booking_id, kind, actor_kind, actor_label, payment_id
    ) values (
      v_booking.id,
      'payment.succeeded',
      'stripe',
      'Stripe webhook',
      v_pay.id
    );
  else
    insert into public.booking_events (
      booking_id, kind, actor_kind, actor_label, payment_id
    ) values (
      v_booking.id,
      'payment.failed',
      'stripe',
      'Stripe webhook',
      v_pay.id
    );
  end if;

  -- Processed and the effect of processing commit together. now() is Postgres's,
  -- never a Worker-computed timestamp.
  update public.stripe_events
     set processed_at = pg_catalog.now()
   where id = p_event_id;

  return query
    select v_booking.id,
           v_booking.reference,
           v_booking.locale,
           v_booking.contact_email::pg_catalog.text,
           false;
  return;
end;
$$;

revoke all on function public.checkout_payment_settle(
  pg_catalog.text,
  pg_catalog.text,
  pg_catalog.text,
  pg_catalog.text,
  pg_catalog.text,
  pg_catalog.numeric,
  pg_catalog.text,
  pg_catalog.timestamptz,
  pg_catalog.int8
) from public;

grant execute on function public.checkout_payment_settle(
  pg_catalog.text,
  pg_catalog.text,
  pg_catalog.text,
  pg_catalog.text,
  pg_catalog.text,
  pg_catalog.numeric,
  pg_catalog.text,
  pg_catalog.timestamptz,
  pg_catalog.int8
) to vamos_system;

comment on function public.checkout_payment_settle(
  pg_catalog.text,
  pg_catalog.text,
  pg_catalog.text,
  pg_catalog.text,
  pg_catalog.text,
  pg_catalog.numeric,
  pg_catalog.text,
  pg_catalog.timestamptz,
  pg_catalog.int8
) is
  'D-15 (plan 07-03): settle a checkout payment. pending→paid→confirmed on success; payment.failed on failure/cancel. EXECUTE: vamos_system only.';

-- 5. notification_claim — claim half of claim-then-send (D-19).
--    dedupe_key is built inside the function so no caller can produce a second
--    spelling. PAY-05's no-double-send clause rests on the unique index, not on
--    caller discipline. Returns NULL when the key was already claimed.

create function public.notification_claim(
  p_booking_id pg_catalog.uuid,
  p_kind pg_catalog.text,
  p_booking_leg_id pg_catalog.uuid,
  p_channel pg_catalog.text,
  p_locale pg_catalog.text,
  p_template_version pg_catalog.text
)
returns pg_catalog.int8
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id pg_catalog.int8;
  v_dedupe pg_catalog.text;
begin
  -- U18: the column default '' stays for rows written before this phase, but a
  -- real send always carries a dated, greppable version so "which template did
  -- this customer actually receive" is answerable from the ledger alone.
  if p_template_version is null
     or p_template_version !~ '^[a-z_]+@[0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9]+$' then
    raise exception 'invalid_template_version'
      using errcode = 'check_violation';
  end if;

  v_dedupe := p_booking_id::pg_catalog.text || ':' || p_kind || ':' ||
              coalesce(p_booking_leg_id::pg_catalog.text, '');

  insert into public.booking_notifications (
    booking_id,
    booking_leg_id,
    kind,
    channel,
    locale,
    template_version,
    dedupe_key
  ) values (
    p_booking_id,
    p_booking_leg_id,
    p_kind,
    p_channel,
    p_locale,
    p_template_version,
    v_dedupe
  )
  on conflict (dedupe_key) do nothing
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.notification_claim(
  pg_catalog.uuid,
  pg_catalog.text,
  pg_catalog.uuid,
  pg_catalog.text,
  pg_catalog.text,
  pg_catalog.text
) from public;

grant execute on function public.notification_claim(
  pg_catalog.uuid,
  pg_catalog.text,
  pg_catalog.uuid,
  pg_catalog.text,
  pg_catalog.text,
  pg_catalog.text
) to vamos_system;

comment on function public.notification_claim(
  pg_catalog.uuid,
  pg_catalog.text,
  pg_catalog.uuid,
  pg_catalog.text,
  pg_catalog.text,
  pg_catalog.text
) is
  'D-19 (plan 07-03): claim a send by inserting booking_notifications. dedupe_key is built inside. NULL means already claimed.';

-- 6. notification_settle — success stamps sent_at; failure stamps failed_at.
--    A second success on a claimed row raises restrict_violation rather than
--    overwriting the evidence of two emails.

create function public.notification_settle(
  p_id pg_catalog.int8,
  p_provider_message_id pg_catalog.text,
  p_error pg_catalog.text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sent_at pg_catalog.timestamptz;
begin
  select n.sent_at
    into v_sent_at
    from public.booking_notifications as n
   where n.id = p_id
     for update;

  if not found then
    raise exception 'notification_not_found'
      using errcode = 'P0002';
  end if;

  if v_sent_at is not null then
    raise exception 'notification_already_sent'
      using errcode = 'restrict_violation';
  end if;

  if p_error is null then
    update public.booking_notifications
       set sent_at = pg_catalog.now(),
           provider_message_id = p_provider_message_id
     where id = p_id;
  else
    update public.booking_notifications
       set failed_at = pg_catalog.now(),
           error = p_error
     where id = p_id;
  end if;
end;
$$;

revoke all on function public.notification_settle(
  pg_catalog.int8,
  pg_catalog.text,
  pg_catalog.text
) from public;

grant execute on function public.notification_settle(
  pg_catalog.int8,
  pg_catalog.text,
  pg_catalog.text
) to vamos_system;

comment on function public.notification_settle(
  pg_catalog.int8,
  pg_catalog.text,
  pg_catalog.text
) is
  'Plan 07-03: stamp sent_at+provider_message_id or failed_at+error. Second success raises restrict_violation.';

-- 7. notification_sweep — never-zero-send half of claim-then-send (D-17).
--    The claim succeeded, the Resend call threw, the isolate was evicted before
--    the failure was recorded, so the row sits claimed forever and a legitimate
--    retry sees a 23505 and silently no-ops — claim-then-send guarantees
--    "never double-send" and this sweep is what adds "never zero-send".
--    Threshold is the caller's argument, not a constant here. Phase 9 reuses
--    this unchanged for reminder_24h; this phase calls it with array['confirmation'].
--    Uses booking_notifications_pending.

create function public.notification_sweep(
  p_older_than pg_catalog.interval,
  p_kinds pg_catalog.text[] default null
)
returns table (
  id pg_catalog.int8,
  booking_id pg_catalog.uuid,
  booking_leg_id pg_catalog.uuid,
  kind pg_catalog.text,
  channel pg_catalog.text,
  locale pg_catalog.text,
  template_version pg_catalog.text,
  created_at pg_catalog.timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  return query
    select n.id,
           n.booking_id,
           n.booking_leg_id,
           n.kind,
           n.channel,
           n.locale,
           n.template_version,
           n.created_at
      from public.booking_notifications as n
     where n.sent_at is null
       and n.failed_at is null
       and n.created_at < pg_catalog.now() - p_older_than
       and (p_kinds is null or n.kind = any (p_kinds));
  return;
end;
$$;

revoke all on function public.notification_sweep(
  pg_catalog.interval,
  pg_catalog.text[]
) from public;

grant execute on function public.notification_sweep(
  pg_catalog.interval,
  pg_catalog.text[]
) to vamos_system;

comment on function public.notification_sweep(
  pg_catalog.interval,
  pg_catalog.text[]
) is
  'D-17 (plan 07-03): claimed-but-unsent rows older than p_older_than. Generic; Phase 9 reuses for reminder_24h.';

-- Phase 7 deliberately does not add a refund helper of any spelling.
-- Phase 8 ships app.calculate_refund_tier(policy jsonb, hours_before numeric)
-- and Phase 9 ships record_booking_refund() (Phase 9 CONTEXT D-06). Phase 7
-- owns only the Stripe refund call contract in apps/web/lib/checkout/stripe.ts
-- (plan 07-04). Anyone adding a third name here has broken the reconciliation.
