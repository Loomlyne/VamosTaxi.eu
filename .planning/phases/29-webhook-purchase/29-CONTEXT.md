# Phase 29: Webhook Purchase - Context

**Gathered:** 2026-10-03
**Status:** Discuss signed by the owner (question form, 2026-10-03). Plan not written.
**Branch:** `gsd/phase-29-purchase`, worktree `/Users/koss/.t3/worktrees/VamosTaxi.eu/gsd-phase-29-purchase`, cut from origin/main `a8e78ec2`
**Builds on:** Phase 28, live on main since 2026-10-03 20:00 (`da25c7d5`, Worker `d937114f`). Merged into this branch.
**Migrations:** `20261007260000` (reserved by the controller 2026-10-03 20:05, board `1554b16d`). One file, additive.

<domain>
## Phase Boundary

After a booking's first payment settles as a real CHF charge, the settle queue sends **one**
Meta Conversions API `Purchase` for that booking. The value is the francs Stripe charged. The
payload carries only the `_fbp` / `_fbc` saved on the booking at the Pay press (Phase 28). Quote,
pay and confirmation do not change. No new screen. No browser Purchase.

Requirements: META-10, META-11, META-12, META-13, META-14 (all locked by ROADMAP Phase 29
success criteria 1–5; not repeated here).
</domain>

<findings>
## What is true today (read-only, 2026-10-03)

- Phase 28 (`fix/phase-28-review-2`) adds `bookings.meta_fbp` / `bookings.meta_fbc` (migration
  `20261007240000_booking_meta_click_ids.sql`). They are written only while the booking is `pending`, through
  `public.checkout_set_meta_click_ids` (definer, `vamos_checkout` only). That runs at the Pay press in
  `POST /api/checkout/intent` via `ctx.waitUntil`, and only when `metaMeasurementAllowed()` is true and the
  server read of consent says marketing is on. Clearing a value (to NULL) is allowed in any booking status.
- `apps/web/lib/meta/legal-gate.ts` on the 28 branch: `META_LEGAL_GATE_OPEN = true`,
  `META_EVENTS_MANAGER_SWITCHES_OFF = true`, `metaMeasurementAllowed()`. On main both are still `false`
  until 28 ships.
- Settle: `apps/web/lib/checkout/settle.ts` (`handleStripeMessageWithDeps`, `SettleDeps`, `HandleResult`,
  `applyHandleResult`). Queue consumer in the Worker entry. The success branch knows `row.charged_rappen`,
  `row.refund_required`, `row.duplicate`, `session.metadata.kind === "extra"`. A transient failure is
  retried, and a paid error goes to the dead-letter queue (memory: settle-retry-not-ack).
- Consent reader: `apps/web/lib/consent/read.ts` `readConsentChoice(tx, subject, asOf?)` reads the latest choice
  for a consent subject (browser cookie) under `CONSENT_POLICY_VERSION`. The settle queue has no browser
  cookie. The booking does not store the consent subject today. `consent_log` has a `booking_id` column
  (migration `20260823000018_consent_log.sql`).
- vamostaxi.site (Worker `vamos`, `--env staging`) is the live site and still takes **Stripe test-mode**
  payments. A live-mode charge cannot happen until the `sk_live_` key goes in.
</findings>

<decisions>
## Implementation Decisions

### Consent withdrawn between Pay and send (owner, 2026-10-03)
- **D-01:** Check the cookie choice again just before sending. If the customer chose Necessary only
  (or turned Marketing off) after the Pay press and before the Purchase leaves, **send nothing**.
  Example: Lena pays at 10:00 with cookies accepted and refuses at 10:01. Meta never hears about her booking.
  The privacy line "withdraw your consent at any time" stays true. A withdrawal after the Purchase
  was sent is not undone (nothing to recall). Accepting after payment never backfills (META-05).
  Research decides how the queue finds that browser's latest choice, for example by saving the
  consent subject on the booking at the Pay press, or by clearing `meta_fbp` / `meta_fbc` on that
  browser's bookings when the refusal is recorded. Pick the narrowest option that is safe on live rows.

### Which payment counts (owner, 2026-10-03)
- **D-02:** One Purchase per booking, for the booking's first payment only. A later payment for an extra
  (`metadata.kind === "extra"`) sends nothing. Example: VT-26-0800 is paid CHF 120, then a child seat
  CHF 15. Meta sees one Purchase of CHF 120.
- **D-03:** No Purchase when settle refunds the payment at once (`refund_required`: a duplicate payment,
  or a payment after the booking was cancelled). Example: VT-26-0801 is paid twice. Only the first
  payment counts. A later refund by hand from the dashboard sends nothing to Meta either: no negative event.

### Test or real (owner, 2026-10-03)
- **D-04:** Follow Stripe. A Stripe test-mode payment (`livemode = false`) sends its Purchase with
  Meta's test event code, so it appears only in Events Manager → Test events. A live-mode payment
  sends without the test code and counts in ad reports. No manual switch is needed when the live
  Stripe key goes in. Example: today's 4242 payment shows under Test events, not in ad results.
  The test event code is Worker config. The access token is a wrangler secret
  (`META_CAPI_ACCESS_TOKEN`): never read, print or log it. If the test event code is missing, a
  test-mode payment sends nothing.

### After the decision (owner, 2026-10-03, question form)
- **D-05:** Once the Purchase for a booking is sent or decided against, the saved `meta_fbp`, `meta_fbc` (and the saved consent subject, if research adds one) are wiped from the booking. Example: VT-26-0800 is paid and Meta is told, so its two cookie values become empty.
- **D-06:** One try only. If Meta times out or returns an error, the Purchase is not sent again. Missing one sale beats counting it twice. The failure is recorded on the database row and in the Worker log (status and Graph error code only). There is **no new dashboard screen**: an earlier question wording said "the dashboard log shows", and that was wrong.
- **D-07:** The test event code is a Worker var `META_TEST_EVENT_CODE`. The owner copies it from Events Manager → Test events before the deploy. Not a secret, but never invented. If it is missing, a test-mode payment sends nothing.

### Carried forward (locked, not re-asked)
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
</decisions>

<open_items>
## Open for the controller (before the plan is written)

- **Migration number.** Settled: `20261007260000` (controller, 2026-10-03 20:05). The 1004 block is withdrawn.
- **Order.** Settled: Phase 28 is live (`da25c7d5`). The 4242 payment after its deploy is still owed by the controller.
</open_items>

<canonical_refs>
## Canonical References

- `.planning/ROADMAP.md` — Phase 29 goal and success criteria 1–5
- `.planning/REQUIREMENTS.md` — META-05, META-09, META-10…META-14
- `.planning/decisions/2026-09-30-meta-wording.md` — the owner's privacy line on what the Purchase carries (verbatim, never reworded)
- `.planning/decisions/2026-10-01-meta-events-manager-switches.md` — switches-off flag
- `.planning/CONTROL-BOARD.md` — migration reservations, ship rules
- Phase 28 on `fix/phase-28-review-2`: `.planning/phases/28-pixel-pageview/28-CONTEXT.md`, `HANDOVER.md`,
  `packages/db/supabase/migrations/20261007240000_booking_meta_click_ids.sql`, `apps/web/lib/meta/legal-gate.ts`,
  `apps/web/lib/meta/click-ids.ts`, `apps/web/app/api/checkout/intent/route.ts`
- `apps/web/lib/checkout/settle.ts`, `settle-errors.ts`, `webhook.ts`, `return-settle.ts`, `dlq.ts`, `money-events.ts`
- `apps/web/lib/consent/read.ts`, `packages/db/supabase/migrations/20260823000018_consent_log.sql`
- `CLAUDE.local.md` (token rule, legal gate, migration numbers), memory: settle-retry-not-ack,
  worker-pg-client-no-arrays, postgres-begin-rethrows-caught-errors, customer-column-grants
</canonical_refs>

<code_context>
## Reusable assets

- `metaMeasurementAllowed()` (28) is the single gate. `readConsentChoice` is the single consent reader.
- `SettleDeps` injection pattern: add a `sendMetaPurchase` dep so unit tests run without the network.
- `ctx.waitUntil` + log-SQLSTATE-only pattern from `scheduleMetaClickIdSave` (28).
</code_context>

<deferred>
## Deferred

- Finish-your-account step with optional phone (27 D-37) — after Phase 29 (owner, 2026-10-01).
- Telling Meta about refunds or cancellations — not in scope (D-03).
</deferred>

---
*Phase: 29-Webhook Purchase · Context gathered 2026-10-03*
