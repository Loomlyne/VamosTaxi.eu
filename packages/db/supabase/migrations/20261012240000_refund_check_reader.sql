-- 20261012240000_refund_check_reader.sql
--
-- Phase 31, refunds in Stripe (.planning/decisions/2026-10-12-refunds-in-stripe.md; 31-CONTEXT D-09, D-10,
-- D-11, D-12, C-02; number given by the owner through the controller, S-10, 2026-10-13).
--
-- The owner now refunds in the Stripe Dashboard; the site keeps recording what Stripe did. The Worker's cron
-- and queue consumer run as vamos_system, which has no SELECT on bookings, booking_payments or
-- booking_refunds: SECURITY DEFINER functions are the only door (apps/web/lib/db/system-reads.ts rule).
--
--   (1) refund_check_read(p_refunds jsonb): the nightly refund check (D-09). The Worker passes the refunds
--       Stripe made in the last 48 hours as a JSON array of {"id": "re_...", "payment_intent": "pi_..." | null}
--       and gets one row per element, in input order: the payment and booking facts the site holds for it, by
--       reference only (never a name or an e-mail, D-12). Reads only (STABLE: Postgres refuses a write inside
--       it). More than 500 elements raise too_many_refunds; a null or non-array argument returns no rows; an
--       element that is not an object, or whose id is not a string, returns a row of nulls.
--   (2) notification_claim_refund(booking, stripe_refund_id, template_version): claims the customer's refund
--       mail for one Stripe refund (D-10, S-03, S-06), one booking_notifications row kind 'refund' with
--       dedupe_key 'booking:refund:<re_id>'. NULL when that refund is already claimed. Refused unless that
--       refund is recorded on that booking. The locale is the booking's own (en/de/fr/ar, else 'en'), so the
--       Worker claims first and reads after, as the confirmation mail does.
--   (3) notification_refund_read(claim id): what the send and the retry sweep need for a refund claim: the
--       booking, the Stripe refund id and the refund_rappen recorded from the Stripe event (D-11: the mail
--       states Stripe's amount, never a computed one). Zero rows when the claim is not a refund claim, is
--       already sent, or its refund row is missing.
--
-- Additive: three functions, no table DDL, no rows, no constraint changed ('refund' is already an allowed
-- notification kind). EXECUTE: vamos_system only.
-- One transaction: apply it verbatim as a whole.
begin;

-- ---------------------------------------------------------------------------
-- (1) the nightly refund check reader
-- ---------------------------------------------------------------------------
create or replace function public.refund_check_read(
  p_refunds pg_catalog.jsonb
)
returns table (
  stripe_refund_id        pg_catalog.text,
  payment_intent_id       pg_catalog.text,
  payment_found           pg_catalog.bool,
  payment_status          pg_catalog.text,
  booking_reference       pg_catalog.text,
  site_refund_rappen      pg_catalog.int8,
  site_reason             pg_catalog.text,
  site_reversed           pg_catalog.bool,
  booking_refunded_rappen pg_catalog.int8,
  booking_rows_sum_rappen pg_catalog.int8,
  booking_refund_status   pg_catalog.text
)
language plpgsql
stable
security definer
set search_path = ''
set lock_timeout = '2s'
set statement_timeout = '5s'
as $$
#variable_conflict use_column
begin
  if p_refunds is null or pg_catalog.jsonb_typeof(p_refunds) <> 'array' then
    return;
  end if;
  if pg_catalog.jsonb_array_length(p_refunds) > 500 then
    raise exception 'too_many_refunds'
      using errcode = 'check_violation';
  end if;

  return query
  with inp as (
    select e.ord,
           case when pg_catalog.jsonb_typeof(e.elem) = 'object'
                 and pg_catalog.jsonb_typeof(e.elem -> 'id') = 'string'
                then e.elem ->> 'id' end as re_id,
           case when pg_catalog.jsonb_typeof(e.elem) = 'object'
                 and pg_catalog.jsonb_typeof(e.elem -> 'id') = 'string'
                 and pg_catalog.jsonb_typeof(e.elem -> 'payment_intent') = 'string'
                then e.elem ->> 'payment_intent' end as pi_id
      from pg_catalog.jsonb_array_elements(p_refunds) with ordinality as e(elem, ord)
  )
  select i.re_id,
         i.pi_id,
         case when i.re_id is null then null else bp.id is not null end,
         bp.status,
         b.reference,
         br.refund_rappen::pg_catalog.int8,
         br.reason,
         case when i.re_id is null then null
              else br.id is not null
                   and exists (select 1 from public.booking_refund_reversals as rv where rv.refund_id = br.id)
         end,
         b.refunded_rappen::pg_catalog.int8,
         case when b.id is null then null
              else coalesce((
                select pg_catalog.sum(r2.refund_rappen)
                  from public.booking_refunds as r2
                  join public.booking_payments as p2 on p2.id = r2.payment_id
                 where r2.booking_id = b.id
                   and p2.status <> 'duplicate'
                   and not exists (select 1 from public.booking_refund_reversals as rv2 where rv2.refund_id = r2.id)
              ), 0)::pg_catalog.int8
         end,
         b.refund_status
    from inp as i
    left join public.booking_payments as bp on bp.stripe_payment_intent_id = i.pi_id
    left join public.bookings as b on b.id = bp.booking_id
    left join public.booking_refunds as br on br.stripe_refund_id = i.re_id
   order by i.ord;
end;
$$;

comment on function public.refund_check_read(pg_catalog.jsonb) is
  'Phase 31 D-09/D-12: nightly refund check. Input: JSON array of {"id": "re_...", "payment_intent": "pi_..." | null} from Stripe''s own refund list. One row per element, in input order: payment found and its status, booking reference, the site''s refund row for that Stripe refund (amount, reason, reversed), the booking''s refunded_rappen, the sum of its refund rows (reversed rows and rows on duplicate payments left out) and refund_status. Reads only, reference never name or e-mail. More than 500 elements raise too_many_refunds. EXECUTE: vamos_system only.';

-- ---------------------------------------------------------------------------
-- (2) claim the customer's refund mail for one Stripe refund
-- ---------------------------------------------------------------------------
create or replace function public.notification_claim_refund(
  p_booking_id pg_catalog.uuid,
  p_stripe_refund_id pg_catalog.text,
  p_template_version pg_catalog.text
)
returns pg_catalog.int8
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id pg_catalog.int8;
  v_locale pg_catalog.text;
begin
  if p_template_version is null
     or p_template_version !~ '^[a-z_]+@[0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9]+$' then
    raise exception 'invalid_template_version'
      using errcode = 'check_violation';
  end if;

  if p_stripe_refund_id is null
     or p_stripe_refund_id !~ '^re_[A-Za-z0-9_]{1,250}$' then
    raise exception 'invalid_refund_id'
      using errcode = 'check_violation';
  end if;

  if not exists (
    select 1
      from public.booking_refunds as r
     where r.stripe_refund_id = p_stripe_refund_id
       and r.booking_id = p_booking_id
  ) then
    raise exception 'refund_not_recorded'
      using errcode = 'P0002';
  end if;

  select case when b.locale in ('en', 'de', 'fr', 'ar') then b.locale else 'en' end
    into v_locale
    from public.bookings as b
   where b.id = p_booking_id;

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
    null,
    'refund',
    'email',
    coalesce(v_locale, 'en'),
    p_template_version,
    'booking:refund:' || p_stripe_refund_id
  )
  on conflict (dedupe_key) do nothing
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.notification_claim_refund(pg_catalog.uuid, pg_catalog.text, pg_catalog.text) is
  'Phase 31 D-10: claim the customer refund mail for one Stripe refund: one booking_notifications row kind refund, dedupe_key booking:refund:<re_id>, locale from the booking (en/de/fr/ar, else en). NULL when already claimed. Raises refund_not_recorded unless that refund is recorded on that booking. EXECUTE: vamos_system only.';

-- ---------------------------------------------------------------------------
-- (3) read a refund claim for the send and the retry sweep
-- ---------------------------------------------------------------------------
create or replace function public.notification_refund_read(
  p_claim_id pg_catalog.int8
)
returns table (
  booking_id       pg_catalog.uuid,
  stripe_refund_id pg_catalog.text,
  refund_rappen    pg_catalog.int8,
  locale           pg_catalog.text
)
language sql
stable
security definer
set search_path = ''
as $$
  select n.booking_id,
         r.stripe_refund_id,
         r.refund_rappen::pg_catalog.int8,
         n.locale
    from public.booking_notifications as n
    join public.booking_refunds as r
      on r.stripe_refund_id = pg_catalog.substr(n.dedupe_key, pg_catalog.length('booking:refund:') + 1)
     and r.booking_id = n.booking_id
   where n.id = p_claim_id
     and n.kind = 'refund'
     and n.sent_at is null
     and n.dedupe_key like 'booking:refund:re\_%';
$$;

comment on function public.notification_refund_read(pg_catalog.int8) is
  'Phase 31 D-10/D-11: for a refund claim (kind refund, not sent yet): the booking, the Stripe refund id and the refund_rappen recorded from the Stripe event, and the claim locale, so a retry mails Stripe''s amount, never a computed one. Zero rows otherwise. Reads only. EXECUTE: vamos_system only.';

-- ---------------------------------------------------------------------------
-- grants
-- ---------------------------------------------------------------------------
revoke all on function public.refund_check_read(pg_catalog.jsonb) from public, anon, authenticated, service_role;
revoke all on function public.notification_claim_refund(pg_catalog.uuid, pg_catalog.text, pg_catalog.text) from public, anon, authenticated, service_role;
revoke all on function public.notification_refund_read(pg_catalog.int8) from public, anon, authenticated, service_role;
grant execute on function public.refund_check_read(pg_catalog.jsonb) to vamos_system;
grant execute on function public.notification_claim_refund(pg_catalog.uuid, pg_catalog.text, pg_catalog.text) to vamos_system;
grant execute on function public.notification_refund_read(pg_catalog.int8) to vamos_system;

commit;
