# Phase 29: Webhook Purchase - Research

**Researched:** 2026-10-03 (16:17 UTC)
**Domain:** Meta Conversions API (server Purchase) hung off the Stripe settle queue; consent re-check; once-only send
**Confidence:** HIGH on the code paths and the database design. MEDIUM on Graph accepting this exact payload (see Open Question 1).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Consent withdrawn between Pay and send (owner, 2026-10-03)
- **D-01:** Check the cookie choice again just before sending. If the customer chose Necessary only
  (or turned Marketing off) after the Pay press and before the Purchase leaves, **send nothing**.
  Example: Lena pays at 10:00 with cookies accepted and refuses at 10:01. Meta never hears about her booking.
  The privacy line "withdraw your consent at any time" stays true. A withdrawal after the Purchase
  was sent is not undone (nothing to recall). Accepting after payment never backfills (META-05).
  Research decides how the queue finds that browser's latest choice, for example by saving the
  consent subject on the booking at the Pay press, or by clearing `meta_fbp` / `meta_fbc` on that
  browser's bookings when the refusal is recorded. Pick the narrowest option that is safe on live rows.

#### Which payment counts (owner, 2026-10-03)
- **D-02:** One Purchase per booking, for the booking's first payment only. A later payment for an extra
  (`metadata.kind === "extra"`) sends nothing. Example: VT-26-0800 is paid CHF 120, then a child seat
  CHF 15. Meta sees one Purchase of CHF 120.
- **D-03:** No Purchase when settle refunds the payment at once (`refund_required`: a duplicate payment,
  or a payment after the booking was cancelled). Example: VT-26-0801 is paid twice. Only the first
  payment counts. A later refund by hand from the dashboard sends nothing to Meta either: no negative event.

#### Test or real (owner, 2026-10-03)
- **D-04:** Follow Stripe. A Stripe test-mode payment (`livemode = false`) sends its Purchase with
  Meta's test event code, so it appears only in Events Manager → Test events. A live-mode payment
  sends without the test code and counts in ad reports. No manual switch is needed when the live
  Stripe key goes in. Example: today's 4242 payment shows under Test events, not in ad results.
  The test event code is Worker config. The access token is a wrangler secret
  (`META_CAPI_ACCESS_TOKEN`): never read, print or log it. If the test event code is missing, a
  test-mode payment sends nothing.

#### Carried forward (locked, not re-asked)
- Payload: `event_name` Purchase, `action_source` website, `event_source_url`
  `https://vamostaxi.site` (no path), `custom_data` `{ currency: "CHF", value: <francs charged> }`,
  `user_data` with only `fbp` / `fbc` that were saved. If neither was saved, send nothing. No email,
  phone, name, route, flight, booking reference, IP or user-agent. No hashing of anything. CHF 000 or
  a zero or empty charge sends nothing (META-10, META-11, META-12).
- Event id: ours, one per booking, stable across queue retries, not the booking reference and not
  derivable from it (META-12).
- Meta failure: never unpays the booking, never changes the webhook response or the settle outcome,
  and never sends a second Purchase on retry. If Graph rejects the payload, stop and ask the owner.
  Do not widen it (META-13, META-14).
- Fail-closed gate: nothing is sent unless `metaMeasurementAllowed()` is true at send time.
- Must-nots: no `sk_live_`, no `vamostaxi.eu`, no invented legal copy or CHF, no browser Purchase,
  no middle events, no Graph call from the thank-you page. Quote, pay and confirmation unchanged.
- The owner's privacy line already says "one message with the amount paid and the two Meta cookie
  identifiers, if they exist". The build must keep that sentence true, word for word.

### Claude's Discretion
- Where the send runs: inside the settle consumer after the settle outcome is final, or as its own queue
  message. Either way it must not change `HandleResult` for the Stripe event.
- How "sent once" is recorded (a sent-at marker and event id on the booking or a small table) and
  the Graph API version pinned.
- Timeout and retry budget for the Graph call, and what is logged (never the token, never the cookie values).

### Deferred Ideas (OUT OF SCOPE)
- Finish-your-account step with optional phone (27 D-37) — after Phase 29 (owner, 2026-10-01).
- Telling Meta about refunds or cancellations — not in scope (D-03).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| META-10 | One Purchase from the settle queue after a real CHF charge. Value is the francs charged. `CHF 000` sends nothing. | Hook point after the expire loop in `handleStripeMessageWithDeps`, queue path only (Finding 1, 2); value = `booking_payments.charged_rappen` / 100, always the CHF figure (`stripe.ts:421-424`); claim refuses `charged_rappen <= 0` |
| META-11 | Payload is `_fbp`/`_fbc` only, only if saved. Neither saved, send nothing. No PII, IP, UA. | Pure payload builder with an exact-keys test; claim returns only `meta_fbp`/`meta_fbc` from the booking; skip `no_ids` |
| META-12 | URL `https://vamostaxi.site`, no path. Event id ours, one per booking, reused on retry, not the reference. | `extensions.gen_random_uuid()` stored once in `meta_purchase_events` (PK booking_id); random, not derived |
| META-13 | Meta failure never unpays and never changes the webhook response. Retry never sends twice. | Dep is wrapped in try/catch after every money step; `HandleResult` untouched; claim row written before the POST (at-most-once) because Meta does NOT dedupe two server events (Finding 6) |
| META-14 | Test event code on staging. Token is a wrangler secret. Graph rejects → stop and ask. | `session.livemode` decides; `META_TEST_EVENT_CODE` Worker var; token read only as `env.META_CAPI_ACCESS_TOKEN` binding; a 4xx is recorded `rejected`, never retried or widened; first live test send is a human checkpoint |
</phase_requirements>

## Project Constraints (from CLAUDE.md and CLAUDE.local.md)

- Job session: own branch `gsd/phase-29-purchase`, no commit on `main`, no push of `main`, no deploy, no write to any live database. Hand over with `HANDOVER.md`. The controller applies the migration and deploys.
- Only migration number allowed: `20261007260000` (one file, additive, safe on live paid rows). Next free after it is `20261007270000` (not ours).
- Never read, print or log `META_CAPI_ACCESS_TOKEN`. Reference the binding name only.
- Owner's three Meta texts (decision 2026-09-30) are verbatim; this phase adds no copy. The privacy sentence "one message with the amount paid and the two Meta cookie identifiers, if they exist" must stay true.
- No `sk_live_`, no `vamostaxi.eu`, no invented CHF in code, tests or fixtures (`check:numbers` blocks `CHF <digits>` literals outside its allow map).
- `vamos_system` (asSystem) is definer-only: any raw table SQL inside `asSystem` fails 42501 on live. Every DB step is a SECURITY DEFINER function with `search_path = ''` (guard: `apps/web/lib/db/system-reads.test.ts`).
- Lock order: booking row first, then anything else (memory settle-retry-not-ack).
- postgres.js `begin()` rethrows a caught error after the callback: map errors around `asSystem(...)`, never inside (memory postgres-begin-rethrows-caught-errors).
- Worker client runs `fetch_types:false`: no array params or results; int8 results come back as strings; use `sql.json` for jsonb (memory worker-pg-client-no-arrays).
- ACL pgTAP checks must leave out `service_role` (live has default EXECUTE; memory live-service-role-default-execute).
- `check:db-fences` bans module-scope `new Set`/`new Map` in `apps/web/lib` (use `Object.freeze([...])`).
- Run touched tests per agent; the lead runs the full gates once (memory parallel-agents-gate-load). Local Supabase without Docker (native stack). Kill only processes you started.
- Deploy is `--env staging` (Worker `vamos`), controller only. After a checkout-touching deploy: one 4242 payment and a read of `booking_payments`.
- No new UI. Four-language rule does not apply (no visible string is added).

## Summary

The settle queue already has one clean "first booking payment succeeded" point: the `outcome === "succeeded"` block of `handleStripeMessageWithDeps` (`apps/web/lib/checkout/settle.ts:410-524`), with `extra` (`:411`), `row.refund_required` (`:413`) and `row.already_settled` (`:477`) known. Two facts change where the send may hang. First, `handleStripeMessage` is also called synchronously by the Stripe **return route** (`apps/web/lib/checkout/return-settle.ts:102`), which runs in the customer's redirect to the confirmation page; when the browser returns before the webhook is consumed (the common case) the return path settles first and the later queue delivery sees `already_settled = true`. So the Meta dep must be supplied **only by the queue consumer** and must fire for `already_settled` too, with the database deciding "once per booking". Second, `already_settled = true` is also what a replay of a paid-after-cancel refund returns (the payment row is `succeeded`), so the "is this a real first payment" check must live in SQL, not in the Worker's flags.

Meta's own documentation says it does **not** de-duplicate two server events with the same `event_id` ("If you send us two consecutive server events with the same information, we do not discard either"). The once-only guarantee therefore has to be ours: a claim row with a random `event_id` is committed before the single POST; a crash between claim and POST loses that one event rather than ever sending two. For D-01, the narrowest safe mechanism is to save the browser's `consent_subject` on the booking at the Pay press next to `_fbp`/`_fbc` (same Phase 28 writer, same pending-only trigger), and have the claim function read the latest choice for that subject through the existing `public.consent_choice` reader inside the same transaction that writes the claim. The alternative (clear ids on refusal) needs the same booking-to-subject link and adds a trigger on the append-only consent ledger, so it is strictly wider.

The one real external risk: Meta documents `client_user_agent` as "required for website events", and the locked payload forbids a user-agent. `fbp`/`fbc` alone is not on Meta's list of invalid combinations, so matching is valid, but whether Graph answers HTTP 200 (with a diagnostic) or a 400 for `action_source: website` without `client_user_agent` cannot be proven offline. The plan must treat the first test-event send after deploy as a checkpoint: a rejection is recorded, never retried, never widened, and goes to the owner (META-14).

**Primary recommendation:** Add an optional `sendMetaPurchase` dep to `SettleDeps`, wired only from `worker.ts`'s queue path, called after the expire loop for `succeeded && !extra && !refund_required`; it checks the gate, token and mode, then calls one definer function `meta_purchase_claim` (locks booking, verifies first real payment, reads consent via `consent_choice`, inserts the event row) and, only on `send`, does one form-encoded POST to `https://graph.facebook.com/v26.0/1595596972063765/events` with a 5 s timeout, then `meta_purchase_finish`. Store the consent subject on `bookings` at the Pay press.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Decide "first real CHF payment of this booking" | Database (definer `meta_purchase_claim`) | API/Worker (branch filter `!extra && !refund_required`) | Worker flags lie on replays (`already_settled` hides a refunded paid-after-cancel); booking/payment/refund rows are the truth |
| Consent re-check at send time (D-01) | Database (claim reads `consent_choice` for the subject saved on the booking) | — | Queue has no cookie; the consent ledger is DB-only (anon has no table grant) |
| Save consent subject at Pay press | API/Worker (intent route `ctx.waitUntil`) | Database (writer + pending-only trigger) | Only the Pay request sees the `consent_subject` cookie |
| Once-only + stable event id | Database (`meta_purchase_events` PK booking_id, `gen_random_uuid()`) | — | Survives retries, duplicate queue delivery, concurrent consumers |
| Fail-closed gate, mode, token presence | API/Worker (queue consumer) | — | `metaMeasurementAllowed()` is code; `livemode` comes from the retrieved Stripe session |
| Graph POST | API/Worker (queue consumer only) | — | Must never run on the return route or the thank-you page |
| Browser | none | — | No browser Purchase; no client change |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Workers `fetch` + `AbortSignal.timeout` | runtime (compat date 2026-08-20) | One POST to Graph | Already used in production code (`lib/geo/mapbox.ts:326`, `lib/turnstile.ts:93`, `lib/flight/aerodatabox.ts:296`) [VERIFIED: codebase grep] |
| `URLSearchParams` body | runtime | `data`, `access_token`, `test_event_code` as form fields | Matches Meta's documented curl form (`-F data=... -F access_token=...`); keeps the token out of the URL [CITED: developers.facebook.com/docs/marketing-api/conversions-api/using-the-api] |
| Meta Graph API | **v26.0** (released 2026-07-29) | `POST /{pixel_id}/events` | Latest version per changelog; docs examples still show v25.0, both live [CITED: developers.facebook.com/docs/graph-api/changelog] |
| Existing `asSystem` / definer-function pattern | repo | claim and finish | Required on live (vamos_system definer-only) [VERIFIED: memory customer-column-grants, `lib/db/system-reads.test.ts`] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `withRequestContext` emit (`lib/logger.ts`) | repo | structured logs | every Meta outcome, scalar fields only |
| vitest | repo pin | unit + `*.local.test.ts` | settle deps, payload builder, orchestrator, local DB through Worker client options |
| pgTAP (`supabase test db`) | Supabase CLI 2.119.0 native | migration contract | new `meta_purchase.test.sql` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Inline await in the queue consumer | `ctx.waitUntil` in `queue(batch, env, _ctx)` | Needs `ctx` plumbed through `handleStripeMessage`; consumer wall time is 15 min [CITED: developers.cloudflare.com/queues/platform/limits], `max_batch_size: 1`, so the ≤5 s inline cost is harmless and inline is deterministic in tests. Choose inline. |
| Inline | A second queue (`vamos-meta-purchase-staging`) | New binding, consumer, DLQ, `wrangler queues create` by the controller, and a second retry surface that must not re-send. Retries are exactly what we must not do (Finding 6). Not worth it. |
| Small table `meta_purchase_events` | Columns on `bookings` | `bookings` holds real rows, has column grants for `authenticated` and audit/trigger load; a separate table keeps the hot table untouched except one nullable column, gives PK-enforced once-only, and holds no personal data |

**Installation:** none. No new package.

## Package Legitimacy Audit

No external package is installed by this phase (only the Workers runtime `fetch`). slopcheck not run: nothing to check.

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
Stripe ──webhook──> /api/stripe/webhook ──enqueue──> STRIPE_EVENTS queue
                                                          │
Browser return ──> /api/checkout/return ──> settlePaidReturn ──> handleStripeMessage(env, msg)        (NO meta dep)
                                                          │
                              worker.ts queue() ──> handleStripeMessage(env, msg, { metaPurchase: true })
                                                          │
                                   handleStripeMessageWithDeps (unchanged up to the expire loop)
                                                          │
                       outcome succeeded? ─no─> unchanged return
                                │yes
                     extra? / refund_required? ─yes─> unchanged return (D-02, D-03)
                                │no  (already_settled may be true: return route won the race)
                    try { deps.sendMetaPurchase({bookingId, paymentId, livemode}) } catch { emit }
                                │
            metaMeasurementAllowed()? token bound? (test mode ⇒ META_TEST_EVENT_CODE set?) ─no─> log reason, stop
                                │yes
         asSystem: meta_purchase_claim(booking, payment, CONSENT_POLICY_VERSION, test)
            lock booking ─> existing row? ─> 'already'
                         ─> payment first+succeeded, booking paid/confirmed/assigned, not is_test,
                            no refund row, charged_rappen > 0, captured ≤ 7 days ─fail─> row 'skipped'
                         ─> fbp/fbc both null ─> row 'skipped' (no_ids)
                         ─> subject null / consent_choice(version, now).marketing ≠ true ─> row 'skipped'
                         ─> insert row 'sending' (event_id = gen_random_uuid()), clear subject, return ids
                                │send
         one POST graph.facebook.com/v26.0/<pixel>/events (form body, 5 s timeout, no retry)
                                │
         asSystem: meta_purchase_finish(booking, event_id, sent|rejected|failed, http, code, subcode)
                                │
                     HandleResult returned exactly as before ──> applyHandleResult ack/retry
```

### Recommended Project Structure
```
apps/web/lib/meta/
├── capi.ts              # pure: buildPurchasePayload(), postPurchase(fetchFn, ...) → outcome; pixel id + Graph host live here only
├── capi.test.ts
├── purchase.ts          # orchestrator: gate → token/mode → claim → post → finish; deps injected
├── purchase.test.ts
└── purchase.local.test.ts   # real asSystem against own local stack, stubbed fetch (optional but recommended)
apps/web/lib/checkout/settle.ts   # + optional dep, + options arg on handleStripeMessage
apps/web/worker.ts                # queue path passes { metaPurchase: true }
apps/web/lib/meta/click-ids.ts    # decision also returns the consent subject
apps/web/app/api/checkout/intent/route.ts  # write passes the subject (4-arg writer)
apps/web/lib/env.d.ts             # META_CAPI_ACCESS_TOKEN?: string; META_TEST_EVENT_CODE?: string
apps/web/wrangler.jsonc           # env.staging.vars.META_TEST_EVENT_CODE (value from the owner)
packages/db/supabase/migrations/20261007260000_meta_purchase.sql
packages/db/supabase/tests/meta_purchase.test.sql
packages/db/test/local/meta-purchase.test.ts
```

### Finding 1: Where the send hangs (question 1) [VERIFIED: codebase]

- `HandleResult` (`settle.ts:60-62`) and `applyHandleResult` (`settle.ts:753-764`) stay byte-identical.
- The succeeded block: `extra` at `:411`, `refund_required` branch `:413-476`, first-payment confirmation branch `else if (!row.already_settled && !extra)` at `:477`, extra branches after, then the expire loop `:512-522`, then the final returns `:527-530`.
- Insert the Meta call **after the expire loop** (so a second payer is blocked first) and before the returns, guarded by `outcome === "succeeded" && !extra && !row.refund_required && session`. Do **not** require `!row.already_settled`.
- Wrap it: `try { await deps.sendMetaPurchase?.({ bookingId: row.booking_id, paymentId: row.payment_id, livemode: session.livemode === true }) } catch { deps.emit("error", "meta_purchase_failed", { bookingId: row.booking_id }) }`. Nothing from it reaches `duplicateRefunded` or the return value.
- Wire the dep only in the queue: change `handleStripeMessage(env, message)` (`:550`) to `handleStripeMessage(env, message, options?: { metaPurchase?: boolean })`; `worker.ts:204` passes `{ metaPurchase: true }`; `return-settle.ts:102` passes nothing. The return route (`/api/checkout/return`) is the redirect in front of the confirmation page: calling Graph there would slow the customer's redirect and is the "Graph call from the thank-you page" the roadmap forbids (ROADMAP Phase 29 criterion 5).
- Race proof: the return route records event `return_<cs_id>` with `stripeCreated = session.created`; the real webhook event is created later, so `stripe_event_begin` returns `ok`, not `superseded` (`20260827000004_settlement_rpcs.sql`, the `e.stripe_created > p_stripe_created` rule), and `checkout_payment_settle` returns its already-settled row (`20261005130000_pay_link_erased_booking.sql:294-302`, `already_settled = true, refund_required = false`). The queue then reaches the Meta call. [VERIFIED: codebase]
- Why the DB must re-check: the already-settled branch returns `refund_required = false` for **any** payment row whose status is `succeeded`, including a paid-after-cancel / requote-superseded / is_test payment that the first pass refunded (`:419-453`, `:486-522` set `status = 'succeeded'` then return `refund_required = true`; a replay returns `false`). So `meta_purchase_claim` must check booking status, `is_test`, and the absence of a `booking_refunds` row for the payment.
- Duplicate queue delivery or two consumers at once: the claim locks the booking row (`for update`) and the PK on `meta_purchase_events.booking_id` makes the second caller see `already`.

### Finding 2: Charged CHF and "first payment" (question 2) [VERIFIED: codebase]

- `row.charged_rappen` comes from `booking_payments.charged_rappen` (`checkout_payment_settle` returns `v_pay.charged_rappen`). `fxFromSession` comment: "charged_rappen stays the CHF figure" even when the customer paid in EUR/USD/AED (`apps/web/lib/checkout/stripe.ts:421-424`). So value = `charged_rappen / 100`, currency always `"CHF"`.
- Extras / differences (26.2 P1/P6) are **also** `booking_payments` rows (inserted by `checkout_extra_payment_settle`, `20261007200000_settle_safety.sql:229-250`) and their sessions always carry `metadata.kind = "extra"` (`stripe.ts:159`, created in `lib/ops/edit-request.ts:213-235`). Pay-link sessions (`lib/checkout/pay-link-hosted-session.ts:65`) are main payments without `kind`; their bookings never get click ids (pay link is not the intent route, Phase 28 META-04), so they skip as `no_ids`.
- DB rule for "first": the payment `p_payment_id` belongs to the booking, has `status = 'succeeded'`, and no other payment of the booking reached `succeeded` with an earlier `captured_at` (or lower id on a tie). Combined with the PK, a booking can never get two Purchases even if an extra were ever settled through the main branch.
- Worker never passes the amount; the claim reads it from the payment row and returns it. Value `<= 0` → `skipped` (`zero_charge`).

### Finding 3: livemode (question 3) [VERIFIED: Stripe API docs + codebase]

- The queue message has no mode (`StripeQueueMessage` = `eventId, type, objectId, stripeCreated`, `webhook.ts:11-16`).
- The settle always retrieves the session from Stripe (`settle.ts:270-276`), and the Checkout Session object has `livemode: boolean` [CITED: docs.stripe.com/api/checkout/sessions/object]. A test key can only retrieve test sessions, so `session.livemode === true` is authoritative. Treat anything but `true` as test.
- Config: add `META_TEST_EVENT_CODE` to `env.staging.vars` in `apps/web/wrangler.jsonc` (a Meta test code is not a credential; the token is). The value must come from the owner (Events Manager → Test events); do not invent it. Absent under `env.production` on purpose. Rules: `livemode=false` and no code → send nothing (log `no_test_code`); `livemode=false` with code → send with `test_event_code`; `livemode=true` → never add the code even if the var is set.
- Token: `env.META_CAPI_ACCESS_TOKEN` (already stored on Worker `vamos` by the owner, per 26-CONTEXT line 107 and 26-DISCUSSION-LOG line 92; not in `env.d.ts` today). Missing or empty → send nothing (log `no_token`). The executor must never run `wrangler secret list`/`get` or print `env`.

### Finding 4: D-01 consent at send time (question 4)

What exists [VERIFIED: codebase]:
- `consent_log` (`20260823000018_consent_log.sql`) has `booking_id`, but the only writer (`record_consent`, called from `POST /api/consent` via `lib/consent/bind.ts`) never passes it: `route.ts` calls `recordConsent` without `bookingId`. So `consent_log.booking_id` is always NULL in practice and cannot link a booking to a browser.
- `public.consent_choice(p_policy_version, p_as_of)` (`20261002100000_consent_choice_reader.sql`) reads the latest row for the subject bound in GUC `request.vamos.consent_subject`; EXECUTE anon only; its comment already says "Phase 29 adds its own role grant".
- The Pay press (`app/api/checkout/intent/route.ts:191-207`) reads the subject from the cookie (`lib/meta/click-ids.ts:76`) to check marketing, then discards it. The booking stores no subject.

Options compared:

| | A: save subject on booking at Pay press, re-check in claim | B: on refusal, clear `meta_fbp/fbc` on that subject's bookings |
|---|---|---|
| Needs booking↔subject link | yes (new nullable column) | yes, the same link (no other link exists) |
| New moving parts | 1 column, 4-arg writer, trigger covers the column, claim reads `consent_choice` | all of A's link, plus a trigger or a second write in `POST /api/consent` touching `bookings` from the anon consent path (anon has no bookings grant; needs a definer bridge from the consent route into bookings) |
| Race | claim reads the latest choice in the same transaction that writes the claim row; a refusal committed before the claim wins; one committed after is "after the Purchase left" (D-01 allows) | refusal clears ids; a claim already past its read still sends; same window as A |
| Privacy footprint | one random UUID per booking that had consent, cleared at the decision (recommend) | same UUID kept until refusal, plus writes into bookings from a public endpoint |
| Behaviour on old rows | Phase 28 rows (no subject) skip `no_subject`: fail-closed | old rows unaffected until refusal: would send for rows with no proof of current consent |

**Recommendation: A.** Narrowest and fail-closed. Details:
- Column `bookings.meta_consent_subject uuid` (nullable, no default). Not granted to `authenticated` or `vamos_guest` (column-grant list; new columns are not readable by them).
- New overload `checkout_set_meta_click_ids(uuid, text, text, uuid)` (EXECUTE `vamos_checkout` only): writes all three; if `p_fbp` or `p_fbc` is non-null, `p_consent_subject` must be non-null (else 22023); both ids null clears all three. Keep the 3-arg function as is for the deploy gap (migration before Worker): an old Worker writes ids without a subject, which then skip `no_subject`.
- Replace the trigger function and re-create the trigger as `before insert or update of meta_fbp, meta_fbc, meta_consent_subject` so the subject is pending-only too; clearing stays allowed in any status (claim clears it).
- `metaClickIdsToSave` returns `{ skip:false, fbp, fbc, subject }`; the intent route writes `checkout_set_meta_click_ids(${bookingId}::uuid, ${fbp}, ${fbc}, ${subject}::uuid)`. The Pay answer is unchanged (still `ctx.waitUntil`).
- Claim reads consent with `perform pg_catalog.set_config('request.vamos.consent_subject', v_subject::text, true)` then `select ... from public.consent_choice(p_policy_version, null)` (as of now, not as of payment: D-01 is "check again just before sending"; META-05's no-backfill holds because ids can only exist if marketing was on at the Pay press and the trigger forbids adding them after payment). A policy-version change between Pay and send means the old Accept no longer counts → skip (consistent with META-02).
- Privacy minimisation: the claim clears `meta_consent_subject` on the booking in every decision branch. Clearing `meta_fbp/fbc` too after the decision is recommended but is a retention choice for the owner (Assumption A3).

### Finding 5: Migration `20261007260000` (question 5) — proposed contents

File: `packages/db/supabase/migrations/20261007260000_meta_purchase.sql`. Additive. No row inserted, updated or deleted by the file. No backfill. No `begin/commit` (the CLI wraps it).

```sql
-- 20261007260000_meta_purchase.sql
-- Phase 29 (META-10..14, D-01..D-04). One Purchase per booking from the settle queue.
-- Additive: one nullable column on bookings (no default: metadata-only), one table, one writer overload,
-- trigger function replaced to cover the new column, two definer functions for vamos_system.

set lock_timeout = '5s';
alter table public.bookings add column if not exists meta_consent_subject pg_catalog.uuid;
reset lock_timeout;
comment on column public.bookings.meta_consent_subject is
  'Phase 29 D-01: consent_subject cookie of the browser that pressed Pay with marketing on. Pending only; cleared when the Purchase is decided.';

-- Trigger function: same rule, now three columns (body = 20261007240000's + meta_consent_subject).
create or replace function public.tg_bookings_meta_click_ids_pending_only() returns trigger
language plpgsql set search_path = '' as $$ ... $$;
revoke all on function public.tg_bookings_meta_click_ids_pending_only() from public;
drop trigger if exists bookings_meta_click_ids_pending_only on public.bookings;
create trigger bookings_meta_click_ids_pending_only
  before insert or update of meta_fbp, meta_fbc, meta_consent_subject on public.bookings
  for each row execute function public.tg_bookings_meta_click_ids_pending_only();

-- Writer overload (vamos_checkout only). 3-arg stays for the deploy gap.
create or replace function public.checkout_set_meta_click_ids(
  p_booking_id pg_catalog.uuid, p_fbp pg_catalog.text, p_fbc pg_catalog.text, p_consent_subject pg_catalog.uuid)
returns void language plpgsql security definer set search_path = '' as $$ ... $$;
revoke all on function public.checkout_set_meta_click_ids(uuid, text, text, uuid) from public;
grant execute on function public.checkout_set_meta_click_ids(uuid, text, text, uuid) to vamos_checkout;

create table public.meta_purchase_events (
  booking_id   pg_catalog.uuid primary key references public.bookings(id) on delete cascade,
  event_id     pg_catalog.uuid not null unique default extensions.gen_random_uuid(),
  payment_id   pg_catalog.int8 not null references public.booking_payments(id) on delete cascade,
  state        pg_catalog.text not null check (state in ('sending','sent','rejected','failed','skipped')),
  skip_reason  pg_catalog.text check (skip_reason in
                 ('not_first_payment','not_paid','is_test','refunded','zero_charge','too_old',
                  'no_ids','no_subject','consent_off')),
  test_event   pg_catalog.bool not null,
  http_status  pg_catalog.int4,
  graph_code   pg_catalog.int4,
  graph_subcode pg_catalog.int4,
  claimed_at   pg_catalog.timestamptz not null default pg_catalog.now(),
  finished_at  pg_catalog.timestamptz,
  constraint meta_purchase_events_skip_reason check ((state = 'skipped') = (skip_reason is not null))
);
alter table public.meta_purchase_events enable row level security;
alter table public.meta_purchase_events force row level security;
revoke all on table public.meta_purchase_events
  from public, anon, authenticated, vamos_guest, vamos_edge, vamos_public, vamos_checkout;
-- No policies, no grants: written and read only by the two definer functions below.

-- meta_purchase_claim: lock booking FOR UPDATE first; existing row ⇒ decision 'already' (no ids);
-- validate payment (belongs, succeeded, first), booking (status in paid/confirmed/assigned, not is_test,
-- erased_at null), no booking_refunds row for the payment, charged_rappen > 0, captured_at ≥ now()-7 days;
-- ids both null ⇒ skipped no_ids; subject null ⇒ skipped no_subject; consent_choice(...).marketing
-- is not true ⇒ skipped consent_off; else insert 'sending'. Every branch that inserts also sets
-- bookings.meta_consent_subject = null. Returns one row:
--   decision text ('send'|'skip'|'already'), event_id uuid, fbp text, fbc text,
--   charged_rappen int4, captured_at timestamptz. No arrays. No int8 in the result.
create or replace function public.meta_purchase_claim(
  p_booking_id pg_catalog.uuid, p_payment_id pg_catalog.int8,
  p_policy_version pg_catalog.text, p_test_event pg_catalog.bool)
returns table (decision pg_catalog.text, event_id pg_catalog.uuid, fbp pg_catalog.text, fbc pg_catalog.text,
               charged_rappen pg_catalog.int4, captured_at pg_catalog.timestamptz)
language plpgsql security definer set search_path = '' as $$ ... $$;

-- meta_purchase_finish: update only the row whose booking_id and event_id match and state = 'sending';
-- p_state in ('sent','rejected','failed'); sets http_status, graph_code, graph_subcode, finished_at.
create or replace function public.meta_purchase_finish(
  p_booking_id pg_catalog.uuid, p_event_id pg_catalog.uuid, p_state pg_catalog.text,
  p_http_status pg_catalog.int4, p_graph_code pg_catalog.int4, p_graph_subcode pg_catalog.int4)
returns void language plpgsql security definer set search_path = '' as $$ ... $$;

revoke all on function public.meta_purchase_claim(uuid, int8, text, bool) from public;
revoke all on function public.meta_purchase_finish(uuid, uuid, text, int4, int4, int4) from public;
grant execute on function public.meta_purchase_claim(uuid, int8, text, bool) to vamos_system;
grant execute on function public.meta_purchase_finish(uuid, uuid, text, int4, int4, int4) to vamos_system;
```

Notes for the planner:
- `on delete cascade` on both FKs so no existing delete path (purge of unpaid bookings, payment cleanup) can ever be blocked by this table. Paid bookings are not purged, so in practice no row is ever cascaded.
- `bookings` ADD COLUMN nullable without default is a catalog-only change but takes a brief ACCESS EXCLUSIVE lock: keep `lock_timeout = '5s'` as Phase 28 did.
- Calling `consent_choice` from inside the claim (definer owned by the migration owner) reuses the reader that already works on live with `consent_log`'s forced RLS. No new grant on `consent_choice` is needed.
- Regenerate `packages/db/database.types.ts` against the own stack (types must match; Phase 28 did this because `db:types:check` targets 54322).
- Live read-only checks after the controller applies it: `bookings` count unchanged; `count(*) where meta_consent_subject is not null` = 0; `meta_purchase_events` empty; `has_function_privilege` true only for `vamos_system` on claim/finish and `vamos_checkout` on the 4-arg writer (note `service_role` may be true on hosted); trigger exists, enabled, covers three columns; md5 of `pg_get_functiondef` for the five functions equals local.
- `db-access-fence-allowlist.json`: add `packages/db/test/local/meta-purchase.test.ts` to `allowed_postgres_importers` with a named comment (same as `meta-click-ids.test.ts`), and any `apps/web/lib/meta/purchase.local.test.ts` that opens a raw superuser connection to seed fixtures.

### Finding 6: Meta Conversions API facts (question 6)

| Fact | Value | Source |
|---|---|---|
| Endpoint | `POST https://graph.facebook.com/{version}/{PIXEL_ID}/events` | [CITED: developers.facebook.com/docs/marketing-api/conversions-api/using-the-api] |
| Version | v26.0 latest (2026-07-29); v25.0 (2026-02-18) | [CITED: developers.facebook.com/docs/graph-api/changelog] |
| Token placement | `access_token` query parameter or body form field → use the body | [CITED: using-the-api] |
| `event_time` | Unix seconds; any event older than 7 days fails the **whole** request | [CITED: using-the-api] |
| `event_source_url` | required for website events | [CITED: .../parameters/server-event] |
| `client_user_agent` | "required for website events shared using the Conversions API"; best-practices table lists it as required for all website events | [CITED: .../parameters/customer-information-parameters; .../conversions-api/best-practices] |
| Invalid user_data combos (since v13.0) | only `ct+country+st+zp+ge+client_user_agent`, `db+client_user_agent`, `fn+ge`, `ln+ge` or subsets are invalid; `fbp`/`fbc` alone is not on the list | [CITED: .../conversions-api/best-practices] |
| fbp / fbc | send as is, "Do not hash" | [CITED: customer-information-parameters] |
| `test_event_code` | routes to Events Manager Test events; "remove it when sending your production payload" | [CITED: using-the-api] |
| `data_processing_options` | only value `LDU` (US Limited Data Use) | [CITED: server-event] — do not send (not applicable, and "do not widen") |
| Dedup | by `event_id`+`event_name` between **browser and server**; "If you send us two consecutive server events with the same information, we do not discard either" | [CITED: .../conversions-api/deduplicate-pixel-and-server-events] |
| Success shape | `{"events_received":1,"messages":[],"fbtrace_id":"..."}` | [ASSUMED: training; the using-the-api page did not render the sample] |
| Error shape | `{"error":{"message","type","code","error_subcode","error_user_title","error_user_msg","fbtrace_id"}}` | [CITED: developers.facebook.com/docs/graph-api/guides/error-handling] |
| Transient codes | 1, 2, 4, 17, 341, 368 | [CITED: error-handling] |
| Permanent | 3, 10, 190 (token), 200-299 (permission), 100 (invalid parameter) | [CITED: error-handling; 100 from training ASSUMED] |

The exact request (one event):

```ts
// Source: Meta CAPI using-the-api (form fields data / access_token / test_event_code)
const url = `https://graph.facebook.com/${GRAPH_VERSION}/${PIXEL_ID}/events`; // no token in the URL
const event = {
  event_name: "Purchase",
  event_time: Math.floor(capturedAt.getTime() / 1000),
  action_source: "website",
  event_source_url: "https://vamostaxi.site",
  event_id: eventId,                                   // uuid from the claim
  user_data: { ...(fbp ? { fbp } : {}), ...(fbc ? { fbc } : {}) },
  custom_data: { currency: "CHF", value: chargedRappen / 100 },
};
const body = new URLSearchParams({ data: JSON.stringify([event]), access_token: token });
if (testEventCode) body.set("test_event_code", testEventCode);
const res = await fetchFn(url, { method: "POST", body, signal: AbortSignal.timeout(5_000) });
```

Outcome classification (no retry in any case, because Meta will not dedupe a second server send):
- 2xx and `events_received === 1` → `sent`.
- 4xx with an `error` object → `rejected` (log `http`, `code`, `subcode`, `fbtrace_id`; never `message`/`error_user_msg`, which may echo values). A `rejected` in the first test send is the META-14 "stop and ask".
- 5xx, network error, timeout, 2xx without `events_received === 1` → `failed` (the event may or may not have arrived; never re-sent).

### Finding 7: Gate and needle scan (question 7) [VERIFIED: codebase]

- `metaMeasurementAllowed()` (`apps/web/lib/meta/legal-gate.ts:21-23`) is true on main since 28 ships. Call it inside the orchestrator at send time, before the claim (gate closed ⇒ no DB write, no fetch). Do not change `legal-gate.ts` (its test forbids `fetch(` and the pixel id in it).
- `legal-gate.test.ts:134-158` allow map today: pixel id only in the loader; `graph.facebook.com` nowhere; `META_CAPI_ACCESS_TOKEN` nowhere. The plan must change exactly three entries: `[PIXEL_ID]: [...LOADER, "apps/web/lib/meta/capi.ts"]`, `"graph.facebook.com": ["apps/web/lib/meta/capi.ts"]`, `META_CAPI_ACCESS_TOKEN: ["apps/web/lib/meta/purchase.ts", "apps/web/lib/env.d.ts"]` (whichever file reads `env.META_CAPI_ACCESS_TOKEN`). The scan covers `apps/web/{app,components,lib,public}`, `middleware.ts`, `worker.ts` and root `app/`; tests (`*.test.ts` under lib are scanned too: keep the token name and Graph host out of test files except via the constant import, or add them to the allow list by name).
- Update the test header comment (it still says Meta strings are only in the loader and headers file).
- Also add a test that `capi.ts` has no `em`, `ph`, `client_ip_address`, `client_user_agent`, `external_id`, `sha256`/`crypto.subtle` and no `reference`.

### Finding 8: Test harnesses (question 8) [VERIFIED: codebase]

- Settle unit tests: `apps/web/lib/checkout/settle.test.ts`, `deps(patch)` factory at `:125-180` with `vi.fn` for every dep; add `sendMetaPurchase: vi.fn()` cases.
- Return path: `apps/web/lib/checkout/return-settle.test.ts` exists; add a pin that `settlePaidReturn` never supplies the Meta dep.
- Local DB through Worker client options: `packages/db/test/local/meta-click-ids.test.ts` pattern (`withIdentity(SUPER, role, …)`, `workerSql`, rolled-back transaction, port from `VAMOS_LOCAL_DB_PORT`). Copy for `meta-purchase.test.ts` as role `system`.
- App-level local test with real `asSystem`: `apps/web/lib/ops/settle-safety.local.test.ts` shape (skipped without `VAMOS_LOCAL_DB_PORT`) to run the real orchestrator with a stubbed `fetch` against a seeded stack, including two concurrent calls ⇒ one fetch.
- pgTAP: `packages/db/supabase/tests/booking_meta_click_ids.test.sql` pattern (`plan(n)`, `function_privs_are`, `has_column_privilege`, `prosecdef`/`proconfig` checks, fixtures, `set local role`). The Phase 28 file pins the 3-arg writer and the trigger columns; it must still pass (3-arg kept) and its trigger-column assertions, if any, extended.
- Test lab (`scripts/test-lab/lab.sh`): the fetch patch maps only Stripe/Turnstile/Mapbox/Resend (`lab.sh:200`) and the e2e config keeps only queue **producers** (`tests/e2e-worker/mkcfg.mjs:9`), so the local Worker never consumes the queue. An end-to-end lab run of this phase would need a consumer and a Graph stand-in; not worth it. Prove offline with unit + local DB tests; prove live with the 4242 payment and Events Manager Test events (human).
- Graph offline: inject `fetchFn` into `capi.ts`; assert URL, method, body fields, absent token in URL, `test_event_code` presence/absence, one call only.

### Anti-Patterns to Avoid
- **Sending from `already_settled === false` only:** loses every Purchase where the return route settled first (the usual order).
- **Supplying the dep on the return route:** Graph call in the customer's redirect to the confirmation page.
- **Trusting `refund_required === false` on a replay:** a refunded paid-after-cancel replays as already settled with `refund_required = false`.
- **Retrying a Graph failure, or claiming after the POST:** Meta does not dedupe server-to-server; a retry can double-count.
- **Token in the query string:** URLs appear in logs and traces.
- **Raw `select … from bookings` inside `asSystem`:** 42501 on live.
- **Returning int8 or arrays from the claim:** `fetch_types:false` gives strings / unparsed literals.
- **Logging Graph `message`/`error_user_msg`, the request body, fbp, fbc or the subject.**

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Latest consent for a subject | a second consent query in TS or SQL | `public.consent_choice` called inside the claim | one reader, already proven on live with forced RLS and the policy-version rule |
| Once-only send | KV flag, in-memory Set, Stripe metadata | PK row in `meta_purchase_events` under the booking lock | survives isolates, retries, duplicate delivery |
| Event id | hash of reference/booking id | `extensions.gen_random_uuid()` | must not be derivable (META-12) |
| Mode detection | env var or key prefix sniffing | `session.livemode` from the retrieved session | D-04 "follow Stripe" |
| Timeout | custom timer race | `AbortSignal.timeout(5_000)` | already used in 5 Worker modules |
| SDK | `facebook-nodejs-business-sdk` | plain `fetch` | Node-oriented, large, no Workers support guarantee; one POST does not need it |

## Runtime State Inventory

Not a rename/refactor phase. One related item: Phase 28 has been live since 2026-10-03 20:00 (+04); any booking that got `meta_fbp`/`meta_fbc` before Phase 29 deploys has no `meta_consent_subject` and will skip `no_subject` if its webhook is ever replayed. Nothing to migrate (fail-closed by design). The Worker secret `META_CAPI_ACCESS_TOKEN` exists on Worker `vamos` (owner, Phase 26 discussion log); the new var `META_TEST_EVENT_CODE` does not exist yet and needs the owner's value.

## Common Pitfalls

### Pitfall 1: Graph refuses a website event without `client_user_agent`
**What goes wrong:** first send returns 400 (or 200 with a diagnostic) because Meta documents UA as required for website events.
**Why:** locked payload forbids UA (META-11) and the privacy line names only the amount and two cookie ids.
**How to avoid:** do not add UA or change `action_source`. Record `rejected` with code/subcode, never retry, stop and ask the owner (META-14).
**Warning signs:** `meta_purchase_events.state = 'rejected'`, log `meta_purchase` `outcome=rejected`.

### Pitfall 2: The return route wins the race
**What goes wrong:** queue sees `already_settled = true`; a guard `!row.already_settled` sends nothing ever.
**How to avoid:** guard on `!extra && !refund_required` only; the claim decides.

### Pitfall 3: Replayed refunded payment looks clean
**What goes wrong:** paid-after-cancel replay returns `refund_required = false`.
**How to avoid:** claim checks booking status (paid/confirmed/assigned), `is_test`, `erased_at`, and `booking_refunds` for the payment.

### Pitfall 4: Double send
**What goes wrong:** retry or duplicate delivery posts twice; Meta keeps both.
**How to avoid:** claim row committed before the POST; zero retries; finish only from `sending`.

### Pitfall 5: Secrets or cookie values in logs
**How to avoid:** emit scalar fields only: `bookingId`, `outcome`, `reason`, `http`, `code`, `subcode`, `fbtraceId`, `test` (boolean). Never `env`, the body, the URL with query, fbp, fbc, subject, Graph `message`. Add a unit test that spies on `emit` and `console.*` and asserts none of the fixture fbp/fbc/token strings appear.

### Pitfall 6: Value formatting
`charged_rappen / 100` as a JSON number (12000 → 120, 12050 → 120.5). Do not send a string, do not round to francs. Zero or negative → skip. Tests must not contain literal `CHF <digits>` strings (`check:numbers`); use rappen integers.

### Pitfall 7: event_time in milliseconds or too old
Seconds from `captured_at`. Claim skips `too_old` past 7 days (otherwise Graph fails the whole request).

### Pitfall 8: Worker client types
Claim result must avoid int8 and arrays; `captured_at` arrives as a JS `Date` under `fetch_types:false` (`lib/consent/read.ts` comment). Pass `paymentId` (number) to an int8 param; fine.

### Pitfall 9: Error caught inside `asSystem`
Wrap `asSystem(...)` in try/catch outside the callback; a refusal inside is rethrown at commit.

### Pitfall 10: Deploy order
Migration first, then Worker (controller). Old Worker + new DB: 3-arg writer still works, claims never happen. New Worker + old DB: 4-arg writer 42883 (logged, Pay unaffected) and claim 42883 (caught, settle unaffected). Both are safe; migration-first is still the rule.

### Pitfall 11: Test Events tab
Test events show in Events Manager → Test events for that code; the owner should open the tab before the 4242 payment [ASSUMED].

## Code Examples

### Settle hook (shape only)
```ts
// settle.ts, after the expire loop (:512-522), before the returns (:527)
if (outcome === "succeeded" && session && !extra && !row.refund_required && deps.sendMetaPurchase) {
  try {
    await deps.sendMetaPurchase({ bookingId: row.booking_id, paymentId: row.payment_id, livemode: session.livemode === true });
  } catch {
    deps.emit("error", "meta_purchase_failed", { bookingId: row.booking_id });
  }
}
```
(`extra` is declared inside the `if (outcome === "succeeded")` block at `:411`; place the call inside that block.)

### Orchestrator order
```ts
// purchase.ts
if (!deps.measurementAllowed()) return log("skip", "gate");
const token = deps.token(); if (!token) return log("skip", "no_token");
const testCode = input.livemode ? null : deps.testEventCode();
if (!input.livemode && !testCode) return log("skip", "no_test_code");
let claim; try { claim = await deps.claim(input.bookingId, input.paymentId, CONSENT_POLICY_VERSION, !input.livemode); }
catch (err) { return log("error", "claim_failed", sqlStateOf(err)); }
if (claim.decision !== "send") return log("skip", claim.decision);
const result = await postPurchase(deps.fetch, { ...claim, token, testCode });   // never throws
try { await deps.finish(input.bookingId, claim.eventId, result.state, result.http, result.code, result.subcode); }
catch { log("error", "finish_failed"); }
log(result.state === "sent" ? "info" : "error", result.state, { http: result.http, code: result.code });
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Graph v25.0 in Meta examples | v26.0 latest | 2026-07-29 | pin v26.0 as a constant in `capi.ts` |
| Any single customer param accepted | v13.0+ invalid-combination list | Graph v13.0 | fbp/fbc-only is not on the invalid list |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Graph answers 200 (perhaps with a diagnostic) for a website Purchase with only fbp/fbc and no `client_user_agent` | Finding 6, Pitfall 1 | Every send is `rejected`; phase stops for an owner decision (no widening) |
| A2 | Success body is `{"events_received":1,...}` | Finding 6 | Classifier marks real sends `failed`; fix: treat any 2xx without `error` as sent, decide with the first test send |
| A3 | Clearing `meta_fbp`/`meta_fbc` after the decision is acceptable to the owner (retention) | Finding 4 | If he wants them kept, the claim only clears the subject |
| A4 | `META_TEST_EVENT_CODE` as a plaintext `vars` entry is acceptable (it is not a credential) | Finding 3 | If he prefers a secret, same name via `wrangler secret put`; code unchanged |
| A5 | Test events appear in the Test events tab for that code during the owner's check | Pitfall 11 | UAT confusion only |
| A6 | Code 100 is "invalid parameter" (permanent) | Finding 6 | Classification of logs only; no behaviour depends on it (no retries anyway) |
| A7 | Owner accepts losing one Purchase if the Worker dies between claim and POST, or the webhook never reaches the queue | Finding 1, 6 | Alternative is at-least-once, which META-13 forbids |

## Open Questions (RESOLVED)

1. **Does Graph accept the locked payload?**
   - Known: UA is documented "required" for website events; fbp/fbc-only is not an invalid combination.
   - Unclear: hard 400 vs accepted with diagnostic.
   - Recommendation: the plan's last task is a human checkpoint: controller deploys, owner opens Test events, one 4242 payment with Accept, read `meta_purchase_events` (state, http, code, test_event) read-only. `rejected` ⇒ stop and ask with the code/subcode.
   - RESOLVED: by the HANDOVER live check (plan 29-07 Task 3, item 7): state `rejected` ⇒ stop and ask the owner with the code/subcode; the payload is never widened (META-14).
2. **The test event code value.** Owner copies it from Events Manager → Test events. Planner adds a `checkpoint:human-action` (one numbered step) before the config line is written.
   - RESOLVED: by the 29-07 test-code checkpoint (Task 1, D-07); the value goes into `env.staging.vars` only; missing ⇒ a test-mode payment sends nothing.
3. **Clear fbp/fbc after the decision?** (A3) Ask in the plan sign-off; default recommendation: clear subject always, clear ids too.
   - RESOLVED: by D-05 (owner, 2026-10-03): every decision row wipes meta_fbp, meta_fbc and meta_consent_subject (plan 29-02); the claim-failure path wipes best-effort through `meta_purchase_clear_ids` (plan 29-05).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node | tests | ✓ | v26.7.0 | — |
| pnpm | install, gates | ✓ | 11.7.0 | — |
| Supabase CLI (Homebrew, native stack) | pgTAP, local DB tests | ✓ | 2.119.0 | — |
| Repo-pinned `supabase` (node_modules) | `db:types` | ✗ (worktree has no `node_modules`) | — | `pnpm install --frozen-lockfile` first |
| `lab.sh pgtap` / native runtime | full pgTAP via lab | ✗ on this branch (`lab.sh` has no `pgtap`/native) | — | manual: `[experimental] stack = true` in own `config.toml`, `supabase start --runtime native --eager --workdir <own>`, `supabase test db --workdir <own>` (memory test-lab-sonnet-tester). No Docker. |
| Meta token on Worker `vamos` | live send | ✓ per owner (not read) | — | none needed |
| `META_TEST_EVENT_CODE` | test-mode send | ✗ | — | owner value (blocking only for the live proof, not for build) |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest (apps/web, packages/db), pgTAP via `supabase test db` |
| Config file | `apps/web/vitest.config.ts`; `packages/db/supabase/tests/*.test.sql` |
| Quick run command | `pnpm --filter web exec vitest run lib/meta lib/checkout/settle.test.ts lib/checkout/return-settle.test.ts lib/db/system-reads.test.ts` |
| Full suite command | `pnpm test:unit`, then own native stack `reset` + `supabase test db`, then `VAMOS_LOCAL_DB_PORT=<own> pnpm --filter @vamos/db exec vitest run test/local/meta-purchase.test.ts test/local/meta-click-ids.test.ts test/local/consent-reader.test.ts`, plus `typecheck`, `lint`, `check:numbers`, `check:legal-claims`, `check:db-fences`, `check:public-env`, `i18n:check` |

### Phase Requirements → Test Map
| Req / Decision | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| META-10 | dep called once for a first non-extra, non-refund success, from the queue only | unit | `vitest run lib/checkout/settle.test.ts -t meta` | ❌ Wave 0 (add cases) |
| META-10 | value = charged_rappen/100, currency CHF; `charged_rappen <= 0` ⇒ skip `zero_charge` | unit + pgTAP | `vitest run lib/meta/capi.test.ts`; `meta_purchase.test.sql` | ❌ |
| META-10 | return route never sends | unit | `vitest run lib/checkout/return-settle.test.ts -t meta` | ❌ (add case) |
| META-11 | payload keys exactly `event_name,event_time,action_source,event_source_url,event_id,user_data{fbp?,fbc?},custom_data{currency,value}`; no em/ph/ip/ua/reference/hash | unit | `vitest run lib/meta/capi.test.ts` | ❌ |
| META-11 | neither id saved ⇒ `skipped no_ids`, no fetch | pgTAP + unit | `meta_purchase.test.sql`; `purchase.test.ts` | ❌ |
| META-12 | `event_source_url === "https://vamostaxi.site"` | unit | `capi.test.ts` | ❌ |
| META-12 | event_id uuid, unique per booking, ≠ reference, same on second claim (returns `already`, no new id) | pgTAP + local | `meta_purchase.test.sql`; `test/local/meta-purchase.test.ts` | ❌ |
| META-13 | dep throws/rejects/hangs ⇒ `HandleResult` identical to no-dep run (ack, settled.duplicate) for every succeeded case; retry results unchanged | unit | `settle.test.ts -t meta` | ❌ |
| META-13 | second claim / concurrent claims ⇒ one `send`; fetch called once; Graph 5xx/timeout ⇒ `failed`, no second fetch | local + unit | `purchase.local.test.ts` (optional) ; `purchase.test.ts` | ❌ |
| META-14 | livemode=false + code ⇒ `test_event_code` in body; livemode=true ⇒ absent even if var set; livemode=false + no code ⇒ no claim, no fetch | unit | `purchase.test.ts` | ❌ |
| META-14 | token only in body, never in URL; missing token ⇒ nothing; logs never contain token/fbp/fbc/subject | unit | `capi.test.ts`, `purchase.test.ts` | ❌ |
| META-14 | 4xx ⇒ `rejected` recorded, no retry, no payload change | unit | `capi.test.ts` | ❌ |
| META-14 | Graph accepts the payload / rejection stops the phase | manual | 4242 payment + Events Manager Test events + read-only `meta_purchase_events` | manual-only (needs real token and Meta) |
| Gate | `metaMeasurementAllowed()` false ⇒ no claim, no fetch | unit | `purchase.test.ts` (inject the gate) | ❌ |
| Gate | needle scan: pixel id, Graph host, token name only in named files | unit | `vitest run lib/meta/legal-gate.test.ts` | ✅ (update allow map) |
| D-01 | refusal after Pay ⇒ `skipped consent_off`; accept→refuse→accept ⇒ send (latest wins); old policy version ⇒ skip; no subject ⇒ skip | pgTAP | `meta_purchase.test.sql` | ❌ |
| D-01 | Pay press saves subject with ids; non-public Origin / no consent ⇒ all three null; subject pending-only (trigger 55000 on paid), clearing allowed | unit + pgTAP + local | `click-ids.test.ts`, `click-ids-route.test.ts`, `booking_meta_click_ids.test.sql`, new pgTAP, `test/local/meta-click-ids.test.ts` | ✅ update / ❌ new |
| D-02 | `kind=extra` success ⇒ no dep call; claim with a non-first payment ⇒ `skipped not_first_payment` | unit + pgTAP | `settle.test.ts`, `meta_purchase.test.sql` | ❌ |
| D-03 | duplicate / paid_after_cancel / test_booking / requote_superseded ⇒ no dep call; replay of those (already_settled, refund_required false) ⇒ claim `skipped` (refunded / not_paid / is_test) | unit + pgTAP | same | ❌ |
| D-04 | as META-14 rows | unit | `purchase.test.ts` | ❌ |
| DB contract | grants (claim/finish `vamos_system` only, 4-arg writer `vamos_checkout` only, service_role excluded), table RLS forced and no table grants, definer + `search_path=''`, trigger function revoked from public | pgTAP | `meta_purchase.test.sql` | ❌ |
| DB through Worker client | claim/finish via `withIdentity(..., "system")` with `fetch_types:false`: uuid/text/int4/timestamptz come back typed, no arrays | local | `test/local/meta-purchase.test.ts` | ❌ |
| asSystem guard | no raw table SQL in new asSystem blocks | unit | `vitest run lib/db/system-reads.test.ts` | ✅ |

### Sampling Rate
- **Per task commit:** the quick run command (touched tests only).
- **Per wave merge:** `pnpm test:unit` + pgTAP on the own native stack + the three `test/local` files.
- **Phase gate:** full suite green, `typecheck`, `lint`, all `check:*`, `opennextjs-cloudflare build` exit 0, must-not greps on added lines (`sk_live_` 0; `vamostaxi.eu` 0; `graph.facebook.com`, pixel id, `META_CAPI_ACCESS_TOKEN` only in the allowed files and tests that ban them), then the manual live checkpoint after the controller deploys.

### Wave 0 Gaps
- [ ] `apps/web/lib/meta/capi.test.ts`, `apps/web/lib/meta/purchase.test.ts`
- [ ] `settle.test.ts` and `return-settle.test.ts` new cases
- [ ] `packages/db/supabase/tests/meta_purchase.test.sql`
- [ ] `packages/db/test/local/meta-purchase.test.ts` (+ fence allowlist entry)
- [ ] `pnpm install --frozen-lockfile` in this worktree
- [ ] Own native Supabase stack (port block not used by another session)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | — |
| V3 Session Management | no | — |
| V4 Access Control | yes | definer functions with EXECUTE `vamos_system` / `vamos_checkout` only; table with forced RLS and no grants; subject column not granted to `authenticated`/`vamos_guest` |
| V5 Input Validation | yes | fbp/fbc already format-checked by Phase 28 CHECKs; subject is a UUID (cookie reader rejects non-UUID); claim validates every row it trusts |
| V6 Cryptography | no | no hashing by decision; TLS by `fetch` |
| V7 Logging | yes | scalar outcome fields only; never token, body, ids, Graph message |
| V8 Data Protection | yes | data minimisation: three values per booking, cleared at decision; no PII sent |
| V14 Config | yes | token as wrangler secret only, test code as non-secret var; production env has no test code |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Token leak via URL/log | Information disclosure | body field, logging allow-list, unit test on emitted fields |
| Consent bypass after withdrawal | Repudiation / privacy | claim re-reads `consent_choice` at decision time under current policy |
| Forged subject linking another browser's consent | Spoofing | subject only from the HttpOnly cookie at Pay press via server; writer is `vamos_checkout` only; pending-only trigger |
| Double counting / replay | Tampering | PK once-only row before the POST; no retries |
| Backfill on paid booking | Tampering | Phase 28 trigger extended to the subject column |
| Purchase from return route | — (must-not) | dep supplied only by `worker.ts` queue path; unit pin |

## Sources

### Primary (HIGH confidence)
- Codebase: `apps/web/lib/checkout/settle.ts`, `return-settle.ts`, `webhook.ts`, `stripe.ts`; `apps/web/worker.ts`; `apps/web/wrangler.jsonc`; `apps/web/lib/meta/{legal-gate,click-ids}.ts` and `legal-gate.test.ts`; `apps/web/lib/consent/{read,cookie,bind}.ts`; `apps/web/app/api/{consent,checkout/intent}/route.ts`; migrations `20260823000018`, `20260827000004`, `20261002100000`, `20261005130000`, `20261005140000`, `20261007200000`, `20261007240000`; pgTAP `booking_meta_click_ids.test.sql`; `packages/db/test/local/meta-click-ids.test.ts`; `scripts/check-db-access-fences.mjs`; `scripts/test-lab/lab.sh`; `docs/runbook/test-lab.md`
- https://developers.facebook.com/docs/marketing-api/conversions-api/using-the-api
- https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/customer-information-parameters
- https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/server-event
- https://developers.facebook.com/docs/marketing-api/conversions-api/best-practices
- https://developers.facebook.com/docs/marketing-api/conversions-api/deduplicate-pixel-and-server-events
- https://developers.facebook.com/docs/graph-api/changelog
- https://developers.facebook.com/docs/graph-api/guides/error-handling
- https://docs.stripe.com/api/checkout/sessions/object (`livemode`)
- https://developers.cloudflare.com/queues/platform/limits/ (15 min consumer wall time)

### Secondary (MEDIUM confidence)
- Segment / Freshpaint CAPI destination docs (UA + event_source_url required for website; non-compliant events "might not be available for optimization") — consistent with Meta's own wording, not authoritative on HTTP behaviour.

### Tertiary (LOW confidence)
- Graph success body shape and Test events tab behaviour (training knowledge).

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH (no packages; runtime APIs already used in repo; Graph version from changelog)
- Architecture: HIGH (code paths read line by line; return-route race and replay flags verified in SQL)
- Pitfalls: HIGH for repo-specific ones; MEDIUM for Graph acceptance of the payload

**Research date:** 2026-10-03
**Valid until:** 2026-11-02 (Graph versions and CAPI requirements move; re-check v26.0 and the UA rule before ship)
