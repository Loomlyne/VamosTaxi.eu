# Stripe webhook — checkout settlement

For whoever is on the hook at 07:00 when a customer paid and the board still
shows pending.

Test mode until Phase 11. Never paste `sk_live_` / `whsec_` for live into
staging. Secrets go through `wrangler secret put`, never the chat, never
`wrangler.jsonc` `vars`.

## Is the webhook arriving?

Stripe Dashboard → Developers → Events. Filter `checkout.session.completed`.
Each delivery shows the HTTP status our Worker returned.

Then, as staff or through `psql` — never from the app:

```sql
select id, type, received_at, processed_at, attempts, last_error
  from public.stripe_events
 order by received_at desc
 limit 20;
```

A row with `processed_at` null and `attempts` climbing is still in the Queue
backoff. A missing row means the HTTP route never recorded the event (look at
the Dashboard delivery: 400 is a signature mismatch).

## An event arrived but the booking is still pending

Read `attempts` and `last_error`.

- `payment_not_found` (`P0002`) means the intent transaction had not committed
  when the consumer ran. Expected transiently. Alarming if it persists past
  Queue retries.
- A `booking_payments_one_success` violation means two distinct PaymentIntents
  both reached `succeeded` on one booking. That is a refund conversation, not
  a retry.

The consumer acks permanent errors so they do not loop. It retries only
`P0002`.

## A customer paid but got no email

Stuck rows:

```sql
select id, booking_id, kind, locale, created_at, sent_at, failed_at
  from public.booking_notifications
 where sent_at is null
   and failed_at is null
   and created_at < now() - interval '10 minutes';
```

The `0 3 * * *` cron runs `notification_sweep` over exactly this set, filtered
to `confirmation`. To force a sweep out of band, invoke the same RPC as
`vamos_system` with the 10-minute threshold and `kinds = '{confirmation}'`.

## Replaying an event

Stripe Dashboard → the event → Resend. That is the first thing to try. It
cannot double-charge.

Four independent nets:

1. `stripe_events` primary key at record time.
2. `stripe_event_begin`'s `processed_at` check at admission (`already_processed`).
3. `checkout_payment_settle`'s `already_settled` at settlement.
4. `notification_claim`'s `dedupe_key` at send.

## Local development

```
stripe listen --forward-to localhost:8787/api/stripe/webhook
```

It prints a **different** `STRIPE_WEBHOOK_SECRET` than the Dashboard endpoint.
Using the wrong one presents as a 400 on every event.

## The dead-letter queue

Names (declared in `apps/web/wrangler.jsonc`, not created by this plan):

- staging: `vamos-stripe-events-staging-dlq`
- production: `vamos-stripe-events-production-dlq`

Provision:

```
wrangler queues create vamos-stripe-events-staging-dlq
wrangler queues create vamos-stripe-events-production-dlq
```

Inspect with `wrangler queues consumer` / the Cloudflare dashboard Queues
view. An exhausted message is inspectable here instead of silently dropped.
`max_retries` is 8 — sized so the `P0002` window is covered, then exhausted.

## What this route never does

No booking is confirmed from a browser return.url. The confirmation page
shows a processing state until the webhook lands. Anyone who "fixes" a slow
confirmation by confirming on the return URL has reintroduced the bug this
architecture exists to prevent.

Cancellation windows and amounts live in `settings_versions`. Do not invent
them here.
