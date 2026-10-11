# Stripe and payment processing, A to Z review: PLAN

Owner (verbatim): "i want to check the stripe and payment processing from A to Z, do a detailed plan before going to build".
Status: PLAN, awaiting owner signature. No reviewer has run. No code changed.
Scope signed in the question form (2026-10-09): deep, 6 parallel reviewers, report only; live read-only checks allowed; findings are signed one by one before any fix job.

## Why not `/gsd-code-review <phase>`

There is no current phase (every phase ticked except 26.2). Payments cut across 26.1, 26.2, 27.1, 29 and the 2026-10-05 money job. So the review runs with `--files` (highest scoping precedence) per wave and writes one report: `.planning/audits/2026-10-09-stripe-payments-REVIEW.md`.

## Already reviewed (do not re-find; confirm or reopen with evidence)

26.1 payment-pricing-integrity (32 plans), 26.2 audits, 29-REVIEW, 2026-10-05 investigation. Known open and in scope only to confirm status: U3 (`rk_live_` refusals), U15 (webhook-first leaves the return row unprocessed), U19 (CHF 0 charge refused by Stripe), U6 (signed-in checkout after the `vt-auth` rename), U22 (28 DB money tests need a local port, manual only), migration `20261007320000` held.

## Size

`apps/web/lib/checkout` about 9k lines (settle 832, intent 730, stripe 473, notify 431), `lifecycle/paid-cancel` 285, `ops/refund` and change files, about 45 payment migrations, 109 pgTAP files, 45 payment unit/e2e/integration specs.

## Waves (run in parallel, deep, one reviewer each, then one verifier)

Order follows the money: price, intent, browser, webhook, settle, refund.

### W1. Configuration, secrets, mode safety (A)
Files: `apps/web/wrangler.jsonc`, `lib/checkout/stripe.ts`, `lib/env.d.ts`, `lib/security/headers.ts`, `lib/security/origin.ts`, `middleware.ts` (Stripe, CSP, `/api` matcher), `lib/health/probe.ts`, `scripts/stripe-*.mjs`, `lib/checkout/stripe-sandbox-only.test.ts`.
Questions:
1. Staging block carries `pk_live_…` (commit `6a5f274e`) while rules say test account and no live key without his word. Does the secret key mode match the publishable key? Can a live-mode key ever reach `stripe.ts` unguarded? Which guard refuses `sk_live_` and `rk_live_` and where does each one fail open?
2. Pinned API version, SDK fetch client on Workers, timeouts, retry policy, `Idempotency-Key` on every create.
3. CSP and `connect-src`/`frame-src` for js.stripe.com, Twint flag (`STRIPE_CHECKOUT_TWINT` off on staging, on in production block).
4. Production block placeholders (U23): queues, DLQ, secrets, webhook endpoint secret per environment.

### W2. Price to amount to intent (B, C)
Files: `lib/checkout/{intent,intent-limits,intent-schema,create-booking,reprice,currency,pay-idempotency,attach-payment,account-gate,load-open-payment,resume,step-forward,steps}.ts`, `app/api/checkout/{intent,price,extras,me,resume,status,lock-expire}/route.ts`, `lib/quote/*` (lock, lock-secret, engine money parts), `lib/pricing/*`.
Questions: amount computed server-side only? Rappen rounding, extras, coupon, VAT; quote-lock expiry vs intent; amount tamper; currency always CHF; concurrent Pay presses (S15), supersede of an old intent, idempotency key scope, reused PaymentIntent after price change, test flag, rate limits, unpaid-booking rules, who can read or attach a payment to which booking (IDOR).

### W3. Browser side, return, confirmation (D)
Files: `app/[locale]/checkout/**` (CheckoutForm, CheckoutPage, PaymentSection, pay/[token]/PayClient), `lib/checkout/{return-url,trip-url,pay-client-states,confirmation-phase,return-settle}.ts`, `app/api/checkout/return/route.ts`, `app/[locale]/confirmation/**`, `components/checkout/*`, `app/pages/{checkout,confirmation}.dc.html` and `vamos-manage-ticket.js` Stripe parts.
Questions: client never decides paid; return page trusts only server state; redirect and `return_url` allow-list; 3DS/Twint/Link redirect return; confirmation poll budget; double-submit; error states for card declined, expired session, other device; four languages and RTL on every payment string.

### W4. Webhook ingest, queue, settle (F, G)
Files: `app/api/stripe/webhook/route.ts`, `lib/checkout/{webhook,webhook-verify,stripe-event-record,settle,settle-errors,charge-gate,dlq,money-events,stripe-fee,notify}.ts`, `worker.ts` (queue, scheduled), `lib/meta/purchase.ts`, `lib/db/system-reads.ts`, `lib/db/identity.ts`.
Questions: raw body kept, signature tolerance, secret rotation; which event types are subscribed in Stripe vs handled in code; record-then-enqueue gap (200 only after both); consumer retry and `max_retries`, ack/retry semantics, DLQ consumer end of line and alerting; out-of-order (`superseded`), duplicate delivery, double settle (U15); capture vs auto-capture, partial failure after state change but before email; amount/currency/booking-id re-verified against DB before marking paid; stale Meta/email side effects replayed on retry; unprocessed-event sweep exists and runs.

### W5. Database settlement and money tables (H, J)
Files: migrations `20260823000010/14/16/19/20/23`, `20260827000001..004`, `20260907000002`, `20260909133000`, `20260910170935`, `20260911*`, `20260923*`, `20260924*`, `20260927*`, `20260928*`, `20260930*`, `20261005*`, `20261007140000..310000` (all payment, refund, dispute, fee, settle, pay-link, manage-token files), plus `packages/db/owner-sql/26.1-verify-*.sql`, `packages/db/supabase/tests/{settle*,settlement_rpcs,webhook_ordering,stripe_*,charge_gate,payment_fx,refund*,pay_link*}.test.sql`.
Questions: every `security definer` has `set search_path = ''` and schema-qualified calls; EXECUTE grants per role (held migration `…320000`; anon and authenticated on money RPCs today); RLS on `booking_payments`, `booking_refunds`, `booking_disputes`, `stripe_events`; append-only triggers and their carve-outs; lock order payment then booking in every function (settle, refund, change, Meta claim, sweep); unique constraints that make double settle and double refund impossible; state-machine transitions only forward; rappen vs numeric casts; FX columns; fee record; tests exist for each guarantee.

### W6. Refunds, cancellations, disputes, staff money (I, K, L)
Files: `lib/lifecycle/paid-cancel.ts`, `lib/ops/{refund,refund-map,booking-change,booking-trip-change,edit-request,phone-booking,bookings-write,must-fix-mail}.ts`, `lib/checkout/{manage-money,manage-token,cancel-unpaid,expire-unpaid,purge-unpaid,pay-link,pay-link-hosted-session,pay-link-lines,pay-link-open,pay-link-state}.ts`, `app/api/manage/cancel`, `app/api/account/bookings/paid-cancel`, `app/api/checkout/pay-link/*`, `app/[locale]/(ops)/api/staff/bookings/[id]/{refund,take-card,extra-pay,change/withdraw}/route.ts`, `staff/rate-book/test-unpaid`, `packages/emails/src/{ClassChangePay,TripChangePay}Email.tsx`.
Questions: refund tiers and window math vs terms and `cancellation_copy` settings; refund amount cap (never above captured minus refunded); refund idempotency; app-initiated refund vs `charge.refunded` webhook reconciliation (30 s delay); disputes recorded and visible to staff; refund by hand and take-card guarded by role, audit row and test flag; pay-link token entropy, hash, expiry, one-time use; staff cannot charge a card off-session without the customer (`extra-wait-no-offsession`); unpaid expiry cancels the Stripe session and does not race a late payment; purge cannot delete a paid or disputed booking.

## Live read-only checks (owner allowed)

Supabase connector, `SELECT` only on project `yaumjzvylngfjhtuffqs`; Stripe connector, test-mode objects only; no write, no key reading, no live-key call.
1. `stripe_events`: rows with `processed_at is null` older than 10 min, `attempts > 3`, non-null `last_error` grouped by cause; count of the 11 unprocessed return rows (U15).
2. `booking_payments`: status counts; any `pending` with a succeeded Stripe PI; any `paid` without a `processed` event; amount or currency mismatch vs `bookings`; double payments per booking.
3. Refund and dispute rows vs Stripe test objects: sum refunded never above captured.
4. Webhook endpoint in Stripe: subscribed event list vs handled list; failed deliveries in the last 7 days; API version.
5. `pg_proc` grants on every money RPC (who can EXECUTE) and RLS flags on money tables; compare with migration files.
6. Queue and DLQ state if the Cloudflare connector shows it.

## Cross-cutting checks (verifier runs after W1 to W6)

- Test gaps: map each guarantee to a test that actually runs; list the 31 skipped web tests and the manual DB money tests (U22). Run `pnpm` unit tests for checkout and the local pgTAP lab if the lab is up (`scripts/test-lab/lab.sh pgtap <name>`); never start Docker.
- Logs and PII: payment logs carry no card, no full email, no token (`lib/logger.ts`).
- Four-language and CHF 000 display rule on every payment string and email.
- Dead or unreachable payment code; placeholders that look live (his standing rule: a shown control must be live end to end).

## Output

`.planning/audits/2026-10-09-stripe-payments-REVIEW.md`: one table, columns id, severity (Critical / High / Medium / Low / Info), wave, file:line, finding, evidence (code or live read), proposed fix, owner decision needed. Critical and High marked "money loss", "double charge", "customer paid but not confirmed", "refund over-pay" or "data leak". Info lists what was checked and is clean, so the A-to-Z claim is auditable.

## After the report (gate)

1. He reads the report and signs each finding in the question form, one decision per question.
2. Signed money findings become fix jobs: one worktree and branch per job, cut from current `origin/main`, exact file list in each plan, migration number asked from the controller (next free `20261007330000`, check first).
3. A fresh reviewer reads every money change before it ships; ship is the controller's, with the standing order, except the live Stripe key, which stays his word.
4. After any checkout deploy: one 4242 payment, then read `booking_payments` by status.

## Not in scope

Meta CAPI beyond the settle hook, Stripe Connect (does not exist), live-key cutover, vamostaxi.eu cutover, price book content, UI polish unrelated to payments.

## Risks to the review itself

- Live-key question in W1 depends on Worker secrets that cannot be read; the reviewer can only compare the publishable key mode to what Stripe reports for the account and ask him for one numbered step if it is unclear.
- DB money tests need a local stack; if disk is under 20 GB (`df -h /System/Volumes/Data`) the pgTAP run is skipped and noted.
