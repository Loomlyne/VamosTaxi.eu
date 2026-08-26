-- 20260823000014_payments_refunds.sql
--
-- D-09 layer 2: `pricing_live` holds against a stale Worker deploy, an ops SQL session, or a
-- replayed webhook -- not merely a checklist item, a trigger with no off switch. D-18: this is
-- the one table with an UPDATE-column whitelist instead of append-only, because Stripe
-- legitimately moves `status`.

create table public.booking_payments (
  id                       bigint generated always as identity primary key,
  booking_id               uuid   not null references public.bookings(id) on delete restrict,
  snapshot_id              bigint not null references public.price_snapshots(id) on delete restrict,
  stripe_payment_intent_id text   not null unique,      -- PAY-05 idempotency
  charged_rappen           rappen not null check (charged_rappen > 0),
  -- ADR-014 §1 lets Stripe charge in the customer's chosen currency via FX -- the locked amount
  -- and this row stay CHF rappen; the Stripe-side presentment currency is Phase 7's column to
  -- add if that wiring needs one (F-14, deferred; see this plan's <deferred> block).
  charged_currency         char(3) not null default 'CHF' check (charged_currency = 'CHF'),
  status                   text not null check (status in
                             ('requires_payment','succeeded','failed','canceled')),
  captured_at              timestamptz,
  created_at               timestamptz not null default now()
);
comment on table public.booking_payments is 'Stripe settlement facts. The charged amount is read from the snapshot, never from a request body.';

/**
 * The server-authoritative charge gate. A CHECK cannot reach another table, so this is a
 * trigger -- and it holds even if a Worker deploy is stale, an ops user runs raw SQL, or the
 * checkout route is bypassed entirely. This is the layer of QUOTE-10 with no off switch.
 *
 * WHERE IN THE FLOW THIS FIRES, and why it matters: the `booking_payments` row is inserted when
 * the PaymentIntent is CREATED, with `status='requires_payment'`. The webhook does not insert; it
 * only UPDATEs `status`/`captured_at` under the column whitelist below. That ordering is what
 * makes the `expires_at` check safe. If the gate ran on the webhook path instead, a customer who
 * sat in the 3-D Secure / TWINT sheet for 31 minutes would be charged by Stripe and then have the
 * settlement row refused by our own trigger -- money taken, booking stuck 'pending' forever, and
 * every Stripe retry failing the same way.
 *
 * The snapshot's `expires_at` is extended to cover the payment window at intent creation, in the
 * same transaction as this insert; QUOTE-04 is enforced at the moment the customer commits to pay,
 * which is the moment it means something.
 *
 * F-20: this function declares an empty search_path -- every name below is schema-qualified, including the enum type
 * in the DECLARE block (`public.rate_version_status`), which an empty search_path does not
 * resolve unqualified any more than it would an unqualified table or function name.
 */
create or replace function public.tg_payment_matches_snapshot()
returns trigger language plpgsql set search_path = '' as $$
declare s public.price_snapshots%rowtype; v_status public.rate_version_status;
begin
  select * into s from public.price_snapshots where id = new.snapshot_id;

  if not s.is_chargeable then
    raise exception 'snapshot % is not chargeable (total=%, rate_version_is_live=%)',
      s.id, s.total_rappen, s.rate_version_is_live
      using errcode = 'restrict_violation',
            hint = 'QUOTE-10: no rate_version is live, or this class has no priced matrix row.';
  end if;
  -- Re-read the version at charge time, not only the flag copied at quote time. A quote priced
  -- under a version that has since been RETIRED is still honoured (the customer was shown that
  -- price minutes ago and the version's rows are frozen); a version that never left DRAFT can
  -- never be charged against, whatever any copied flag says.
  select status into v_status from public.rate_versions where id = s.rate_version_id;
  if v_status = 'draft' then
    raise exception 'snapshot % cites rate_version % which is still draft', s.id, s.rate_version_id
      using errcode = 'restrict_violation';
  end if;
  -- QUOTE-04: an expired quote is refused when the customer commits to pay, by the server, not
  -- merely hidden in the UI.
  if s.expires_at <= now() then
    raise exception 'quote % expired at %', s.id, s.expires_at using errcode = 'restrict_violation';
  end if;
  if new.charged_rappen is distinct from s.total_rappen then
    raise exception 'charge % does not match snapshot % total %',
      new.charged_rappen, s.id, s.total_rappen using errcode = 'restrict_violation';
  end if;
  if s.booking_id is null or new.booking_id is distinct from s.booking_id then
    raise exception 'snapshot % belongs to booking %, not %', s.id, s.booking_id, new.booking_id
      using errcode = 'restrict_violation';
  end if;
  -- F-06 / T-02-46: the check above only proves the snapshot's OWN booking_id points back at
  -- this booking -- and `price_snapshots_quote_class` gives one row per (quote_id,
  -- vehicle_class_id) because the quote endpoint prices EVERY eligible class in one call. Every
  -- one of those sibling rows can legitimately carry the same booking_id once the customer's
  -- pick sets it (a re-price/modification can also leave more than one bound snapshot in
  -- history, by design -- see ...013's comment on why no one-per-booking index exists). Without
  -- this second check, a stale Worker deploy, an ops SQL session, or a Queue consumer replaying
  -- an old request could bind the booking's payment to the Economy row of a quote whose legs
  -- ended up a Van, and every check above would still pass -- the Economy total is a real,
  -- chargeable, correctly-priced amount, just for the wrong class. `bookings.price_snapshot_id`
  -- is the one column that names the snapshot the customer actually chose; a payment must cite
  -- exactly that row, not merely a row that happens to share its booking_id.
  if new.snapshot_id is distinct from (select b.price_snapshot_id from public.bookings b where b.id = new.booking_id) then
    raise exception 'payment cites snapshot %, but booking % is bound to %',
      new.snapshot_id, new.booking_id, (select b.price_snapshot_id from public.bookings b where b.id = new.booking_id)
      using errcode = 'restrict_violation';
  end if;
  return new;
end $$;

revoke all on function public.tg_payment_matches_snapshot() from public;

create trigger booking_payments_match_snapshot
  before insert on public.booking_payments
  for each row execute function public.tg_payment_matches_snapshot();

-- F-06 / T-02-47: PAY-05's "cannot double-charge" otherwise rested on `bookings.idempotency_key`,
-- which is nullable and protects booking CREATION, not settlement -- two distinct PaymentIntents
-- both reaching `succeeded` violated `bookings`'s own "one price, one Stripe charge" comment and
-- nothing noticed. If Phase 9's modification flow ever needs a second settlement on a booking, it
-- models that explicitly (an amendment row, or a new booking) -- it does not relax this index.
create unique index booking_payments_one_success on public.booking_payments (booking_id)
  where status = 'succeeded';

/**
 * The UPDATE-column whitelist §10 promises. Without it, the only gate on this table is INSERT-only,
 * so a staff session (or a stolen staff JWT) can `update booking_payments set
 * charged_rappen = <attacker-chosen figure>, status='succeeded'` and the amount/snapshot
 * reconciliation the design advertises never runs on
 * the mutated row -- day revenue and Stripe dispute evidence then disagree with Stripe itself.
 *
 * F-20: this function also declares an empty search_path -- no unqualified name appears in its body, but the declaration
 * keeps this function honest with every other trigger in this migration set.
 */
create or replace function public.tg_payment_update_whitelist()
returns trigger language plpgsql set search_path = '' as $$
begin
  if to_jsonb(new) - 'status' - 'captured_at'
     is distinct from to_jsonb(old) - 'status' - 'captured_at' then
    raise exception 'booking_payments: only status and captured_at may be updated'
      using errcode = 'restrict_violation',
            hint = 'A corrected settlement is a new row plus a compensating booking_event.';
  end if;
  return new;
end $$;

revoke all on function public.tg_payment_update_whitelist() from public;

create trigger booking_payments_column_whitelist
  before update on public.booking_payments
  for each row execute function public.tg_payment_update_whitelist();

create table public.booking_refunds (
  id               bigint generated always as identity primary key,
  booking_id       uuid   not null references public.bookings(id) on delete restrict,
  snapshot_id      bigint not null references public.price_snapshots(id) on delete restrict,
  payment_id       bigint not null references public.booking_payments(id) on delete restrict,
  booking_leg_id   uuid   references public.booking_legs(id) on delete restrict,  -- null = whole booking
  reason           text   not null check (reason in
                     ('customer_cancel','ops_cancel','no_driver','modification_credit','no_show')),
  basis_rappen     rappen not null check (basis_rappen >= 0),
  refund_percent   numeric(5,2) not null check (refund_percent between 0 and 100),
  refund_rappen    rappen not null check (refund_rappen >= 0),
  -- LIFE-03 made self-evident: the exact tier object copied out of snapshot.policy at decision
  -- time, plus the hours-before that selected it. This one row answers "why 75 % of CHF 000?".
  tier_applied     jsonb  not null,
  hours_before     numeric(8,2) not null,
  stripe_refund_id text unique,
  decided_by       uuid references auth.users(id) on delete set null,
  decided_at       timestamptz not null default now(),
  constraint booking_refunds_not_more_than_basis check (refund_rappen <= basis_rappen)
);
comment on table public.booking_refunds is 'One row per refund decision, carrying the tier it was calculated from -- not the tier in force today (LIFE-03).';

/**
 * Stripe webhook deduplication (Phase 5). "Insert, and discard a duplicate" is only idempotent if
 * the insert is the last thing that can fail -- and it is not. Real sequence: Stripe delivers
 * `payment_intent.succeeded`, we insert the ledger row, then the Queue publish or the
 * `booking_payments` update throws (or the isolate is evicted). Stripe retries; the retry hits the
 * primary key, is "discarded silently" with a 200, and the customer has been charged while the
 * booking stays 'pending' forever with nothing recording that the event was never processed.
 *
 * So the ledger records ATTEMPTED and PROCESSED separately: dedupe on `insert ... on conflict (id)
 * do nothing`, but skip the handler only when the existing row has `processed_at is not null`.
 * `stripe_created` + `object_id` are what let PAY-05's out-of-order case be detected at all -- a
 * `payment_intent.canceled` delivered after `succeeded` is only visible as out-of-order if the
 * handler orders on Stripe's own timestamp per object, never on our `received_at` (U19, owned by
 * Phase 5/7).
 *
 * F-11: `payload` is the raw Stripe event object -- cardholder name, billing address, email, card
 * brand and last four, and for `customer.*` events the whole customer object. Its staff exposure
 * is column-scoped to exclude `payload` in `...23_rls_staff.sql` (Plan 02-08); `service_role`'s
 * DELETE is revoked with FORCE RLS applied in `...19_append_only.sql` (Plan 02-07), because DELETE
 * here is the idempotency-drop that lets a replayed webhook re-run. This file grants `payload`,
 * or any column of this table, to nobody.
 */
create table public.stripe_events (
  id             text primary key,           -- Stripe's own event id
  type           text not null,
  stripe_created timestamptz not null,       -- Stripe's `created`, the ordering key
  object_id      text,                       -- pi_... / re_... -- the object the event is about
  received_at    timestamptz not null default now(),
  processed_at   timestamptz,
  attempts       integer not null default 0,
  last_error     text,
  payload        jsonb not null
);
comment on table public.stripe_events is 'Webhook ledger: dedupe by event id, but a replay re-runs the handler unless processed_at is set. Ordering is (object_id, stripe_created), never received_at.';
comment on column public.stripe_events.payload is 'The raw Stripe event object: cardholder name, billing address, email, card brand and last four, and for customer.* events the whole customer object. Column-scoped out of the staff SELECT grant (Plan 02-08); DELETE revoked from service_role with FORCE RLS applied (Plan 02-07). Never granted to anyone in this file.';

-- The cron sweep that finds events accepted but never finished.
create index stripe_events_unprocessed on public.stripe_events (received_at)
  where processed_at is null;
create index stripe_events_object      on public.stripe_events (object_id, stripe_created)
  where object_id is not null;

/**
 * PAY-05 is "cannot double-charge, double-confirm OR double-send an email". Webhook dedupe covers
 * the first two and nothing covers the third: a Resend call that times out but actually delivered
 * and is then retried sends the confirmation twice, and the Phase 9 reminder cron has nothing to
 * consult to know whether leg X's 24-hour reminder already went out, so every tick re-sends it.
 * Ship the ledger now -- it is a plain additive table today and a live-data reconciliation later
 * (U18, owned by Phase 7's claim-then-send discipline and template-version vocabulary).
 */
create table public.booking_notifications (
  id                  bigint generated always as identity primary key,
  booking_id          uuid not null references public.bookings(id) on delete restrict,
  booking_leg_id      uuid references public.booking_legs(id) on delete restrict,
  kind                text not null check (kind in ('confirmation','reminder_24h','assignment',
                        'cancellation','refund','review_request','manage_link_resend')),
  channel             text not null default 'email' check (channel in ('email','sms')),
  locale              text not null check (locale in ('en','de','fr','ar')),
  template_version    text not null default '',
  provider_message_id text unique,
  -- booking_id || ':' || kind || ':' || coalesce(booking_leg_id::text,'') -- the send is claimed by
  -- inserting this row, so two workers racing the same reminder produce one email.
  dedupe_key          text not null unique,
  sent_at             timestamptz,
  failed_at           timestamptz,
  error               text,
  created_at          timestamptz not null default now()
);
comment on table public.booking_notifications is 'One row per outbound message, claimed before sending. dedupe_key makes a retried send a no-op (PAY-05, LIFE-05).';

create index booking_notifications_pending on public.booking_notifications (created_at)
  where sent_at is null and failed_at is null;
create index booking_notifications_booking on public.booking_notifications (booking_id, created_at desc);
