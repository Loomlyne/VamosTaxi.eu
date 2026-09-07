# Phase 7: Checkout & Payment - Context

**Gathered:** 2026-08-24; remainder 2026-09-07
**Status:** Ready for remainder planning (07-01…10 have SUMMARYs — not closed; live pay path still mock)
**Source:** Research express path (2026-08-24) + owner remainder discuss (2026-09-07)

<domain>
## Phase Boundary

A customer carrying a locked quote (Phase 4) becomes a paid, webhook-confirmed booking. Every
table this phase writes into is already designed (`price_snapshots`, `booking_payments`,
`booking_refunds`, `stripe_events`, `booking_notifications`, `coupon_redemptions` — Phase 2
`02-06-PLAN.md`'s `<interfaces>` block), but as of this research date only migrations
`20260823000001`–`…011` exist; the money tables (`…013`–`…015`, Phase 2 Wave 6) are not yet
executed. This phase plans against the designed shape and must coordinate landing order with
whoever executes Phase 2 Wave 6.

Requirements covered: PAY-01, PAY-02, PAY-03, PAY-04, PAY-05, PAY-06, PAY-07. Touches but does
not close: QUOTE-10 (the charge gate this phase's RPC writes through, unmodified), LIFE-03 (the
`booking_refunds` shape only — the cancellation-tier calculation is Phase 9), DATA-08 (this
phase's writes append `booking_events` rows into an already-designed timeline, it does not
design the timeline).

**Hard preconditions:** Phase 4 executed (the quote lock, `/api/checkout/intent`'s steps 1–5,
`price_snapshots`), Phase 5 executed (the booking-widget/account surfaces this checkout flow is
reached from), a Stripe account with test-mode API keys, a Resend account (or its sandbox send
mode). **Locally buildable regardless of those accounts existing:** the FX migration, the
`checkout_create_booking` RPC and its pgTAP, webhook signature verification and `stripe_events`
dedupe against Stripe CLI fixtures (no live account needed to construct and verify a signed test
event), and the confirmation email template's four-language render.

**In scope:**
- `booking_payments` FX additive migration (`fx_rate`, `fx_source`, `fx_quoted_at`,
  `presentment_amount_minor`, relaxed `charged_currency` CHECK) — resolves Phase 2's F-14
  hand-off, charge gate untouched.
- `public.checkout_create_booking(...)`, a single `SECURITY DEFINER` RPC: booking + legs +
  snapshot bind + coupon lock + payment-attempt row + manage-token mint, one transaction.
- `POST /api/checkout/intent`: Phase 4's quote re-check (steps 1–5, reused) + Stripe Checkout
  Session creation (Adaptive Pricing, Currency Selector, `automatic_payment_methods`) + the RPC
  call + `sessions.expire()` compensation on gate failure.
- `POST /api/stripe/webhook`: signature verification + `stripe_events` dedupe-insert + enqueue
  only. The Cloudflare Queues `queue()` consumer in `worker.ts` owns the entire
  `pending → paid → confirmed` state machine, `booking_events` writes, and ordering.
- `packages/emails`'s first real template: `ConfirmationEmail.tsx` (en/de/fr/ar), `.ics`
  calendar-invite generation, claim-then-send against `booking_notifications`.
- Checkout page port (`checkout.dc.html` → Client Component) and confirmation page port
  (`confirmation.dc.html` → SSR, polling/subscribing "processing" state).
- Stripe test-mode E2E proof, gated on an explicit owner sign-off (see decisions below).

**Out of scope:**
- Cancellation-tier refund math (LIFE-02/03) — Phase 9. This phase ships the `booking_refunds`
  row shape and the Stripe refund call contract only.
- Every `booking_notifications.kind` other than `confirmation` (`reminder_24h`, `assignment`,
  `review_request`, `cancellation`, `refund`, `manage_link_resend`) — Phase 8/9, same table
  shape.
- Ops board, dispatch, assignment — Phase 8.
- Live flight tracking / delay shift — Phase 9.
- The CHF price matrix. Do not invent CHF. Hosted live book is `rate_versions` id 4 (floors
  Economy 80 / Business 100 / First 130 / Van 150). Public `CHF 000` only before date+time+places
  or when pricing is not live. Staging test charges may use that live book. Phase 11 is live
  Stripe keys + `vamostaxi.eu` DNS.
- Full customer `/bookings` history and ops board / dispatch / `#support` — Phase 8 / 12.
  Remainder includes only **Finish payment** on account for an unpaid checkout.
- Invoice-on-account / pay later without Stripe — still out. Company billing + Stripe pay-link
  is in remainder (D-36); that is not an invoice.

### Remainder boundary (2026-09-07) — what is still not live

07-01…07-10 have SUMMARYs. That is paper. Live `vamostaxi.site/checkout` is still the DC mock
(PayPal + cash radios, `saveTrip`, `confirmation.dc.html`). Home already paints real class floors
after date+time+places. Home Continue is still `saveTrip` then `/checkout`.

**Remainder delivers:** Continue → Next `/checkout/trip` → `/checkout/details` → `/checkout/payment`
with their typed trip + Stripe Element → webhook booking + real `VT-` + confirmation page +
confirmation email. Deploy Worker **`vamos`** on `vamostaxi.site` from **this branch**, not a merge
to `main`, only after the owner says continue. Then `/gsd:verify-work 7` (existing `07-UAT.md`).

**Do not re-execute 07-01…10.** Gap/remainder plans only (07-11+). Do not discuss Phase 8 / 12 / 17.

</domain>

<decisions>
## Implementation Decisions

Every bullet cites the originating research decision (`research D-NN`), owner-blocker item, or
assumption in parentheses for traceability back to `07-RESEARCH.md`.

### The checkout write path is a single `SECURITY DEFINER` RPC (load-bearing finding a)
- **D-01:** (research D-05) `checkout_create_booking(...)` is the only writer of a checkout
  booking — never sequential `INSERT`s under `asAnon`/`asCustomer`. `02-SCHEMA-DRAFT.md` §14a
  states directly: "No INSERT policy on bookings for `authenticated`: a quote is created by a
  server-authoritative route, never by the browser." No grant path exists for a raw multi-table
  insert under a `withIdentity`-scoped role. Independently confirmed by Phase 3's own FC-04
  finding ("Phase 7 writer is definer inside `asAnon`/`asCustomer`"). — PAY-01, PAY-03.
- **D-02:** (research D-11) The `bookings` row is inserted with `status='pending'` explicitly
  inside the RPC, never left at the table's `'quote'` default — a checkout booking already
  carries contact details, a burned `VT-YY-####` reference and a payment-attempt row, so it is a
  purchase attempt, not a price check. Confirm no other phase assumes a different initial
  status. — PAY-01.
- **D-03:** (research D-12) The guest manage-token (`booking_access_tokens`) is minted **inside**
  the same RPC transaction that creates the booking, not lazily in the webhook consumer — mirrors
  `next_booking_reference()`'s "allocated at the moment of commitment" pattern. The raw token is
  never emailed until the confirmation send, so an unpaid/abandoned booking's unminted-but-unsent
  token row is inert; no security cost to eager minting. — PAY-03.

### Multi-currency charging is a Stripe Checkout Session with Adaptive Pricing — NOT the PaymentIntents API (load-bearing finding b)
- **D-04:** (research D-02, resolves F-14) Build checkout on a Stripe **Checkout Session**
  (never a bare `PaymentIntent`), Adaptive Pricing + Currency Selector Element enabled, rendered
  through Stripe's custom-Elements UI mode inside the existing brand chrome — not a redirect to a
  Stripe-hosted page. ADR-014 §1 ratifies "the customer may change currency again on the Stripe
  Checkout page"; Stripe's own docs (fetched live) confirm Adaptive Pricing is available **only**
  through Elements bound to a Checkout Session, never the bare Payment Intents API. — PAY-02.
- **D-05:** (research D-01) The route is `POST /api/checkout/intent` — the name
  `04-API-CONTRACT.md` §6 fixes, not the older `/api/checkout` naming in
  `quote-lock-expiry.md`. — PAY-01.
- **D-06:** (research D-06) The Stripe Checkout Session is created **outside** any DB
  transaction — a plain network call between the pre-flight quote read and the RPC call. Matches
  the project's own "one transaction per logical unit of work, never held open across a network
  call" rule. — PAY-02.
- **D-07:** (research D-07) Compensating rollback on charge-gate failure is
  `stripe.checkout.sessions.expire(session.id)`, **never** `stripe.paymentIntents.cancel()`.
  Stripe's own API reference: "You can't confirm or cancel the PaymentIntent for a Checkout
  Session. To cancel, expire the Checkout Session instead." — PAY-02.
- **D-08:** Doc-correction task. The illustrative `stripe.paymentIntents.create()`/`.cancel()`
  sketches in `04-API-CONTRACT.md` §6 and `research/quote-lock-expiry.md` §3.1 predate this
  reconciliation and say so explicitly ("Phase 7 owns the real handler") — they are superseded by
  D-04/D-07, not a spec to build against. The planner adds a task correcting both documents'
  object type (PaymentIntent → Checkout Session) and cancel call
  (`paymentIntents.cancel()` → `sessions.expire()`), keeping the sketches' sequencing and
  error-handling logic verbatim otherwise. — PAY-02.

### TWINT needs no custom code (load-bearing finding c)
- **D-09:** (research D-04) TWINT's automatic unavailability for a non-CHF presentment currency
  needs **no custom code** — Stripe's dynamic-payment-methods system plus Adaptive Pricing already
  filters payment methods by currency; it becomes available precisely when CHF is the resolved
  presentment currency, and only then. Do not hand-build a presentment-currency-to-payment-method
  map. — PAY-02.
- **D-10:** (research Pitfall 3) `settings.accepts_twint`/`accepts_card` are ops-editable
  **marketing copy only** ("we accept TWINT"), never the actual payment-method gate — the real
  gate is `automatic_payment_methods`/`adaptive_pricing` letting Stripe's own Element render
  whatever is actually available. Two sources of truth for "is TWINT available right now" is
  exactly the drift class this project's architecture avoids elsewhere. — PAY-02.

### F-14 resolves as additive-only FX columns (load-bearing finding d)
- **D-11:** (research D-03) `booking_payments` gains additive columns: `fx_rate numeric(18,8)`,
  `fx_source text`, `fx_quoted_at timestamptz`, `presentment_amount_minor bigint`; relax
  `charged_currency` CHECK from `= 'CHF'` to `in ('CHF','EUR','USD','AED')`; add
  `check ((charged_currency = 'CHF') = (fx_rate is null))`. `charged_rappen` and the charge-gate
  trigger's comparison to `s.total_rappen` are **unchanged** — they always mean CHF, regardless of
  what currency Stripe actually settled. Directly satisfies Phase 2's own `02-06-PLAN.md`
  `<deferred>` instruction ("must NOT resolve it by relaxing the amount comparison, which is the
  layer of QUOTE-10 with no off switch"). Coordinate whether this lands as its own migration or
  folds into whoever lands Phase 2 Wave 6's `…014_payments_refunds.sql`. — QUOTE-10, this phase.
- **D-12:** (research D-16) `booking_refunds` needs **no** multi-currency schema changes even
  under D-04's multi-currency charging. Stripe's own Adaptive Pricing docs: "You can issue a
  refund in your integration currency, and Stripe refunds your customer in the currency they used
  to make the payment. The refund uses the same exchange rate as the original transaction" —
  `basis_rappen`/`refund_rappen` stay CHF exactly as Phase 2 already designed. — LIFE-03 (schema
  boundary only; the cancellation-tier calculation itself is Phase 9).

### Webhook fast-ack, Queue-owned state machine (PAY-04, PAY-05)
- **D-13:** (research D-08) `POST /api/stripe/webhook` does signature verification
  (`constructEventAsync` + `createSubtleCryptoProvider`) + `stripe_events` dedupe-insert
  (`ON CONFLICT (id) DO NOTHING`) + `env.STRIPE_EVENTS.send()` only, returns 200 immediately. All
  state-machine work happens in the `queue()` consumer in `apps/web/worker.ts` — the
  `STRIPE_EVENTS` queue binding (producer+consumer) is already provisioned under both
  `env.staging` and `env.production` in `wrangler.jsonc`; this phase is its first real case. —
  PAY-04.
- **D-14:** (research D-09) The webhook consumer orders on `(object_id, stripe_created)`, never
  `received_at` — matches the `stripe_events` table's own comment and Stripe's documented
  recommendation. A `canceled` event delivered after `succeeded` must not un-confirm a
  booking. — PAY-05.
- **D-15:** (research D-10, MEDIUM confidence) Primary fulfillment signal is
  `checkout.session.completed` with an explicit `payment_status === 'paid'` check — covers both
  instant methods (card) and delayed/redirect methods (TWINT) uniformly — rather than branching
  directly on `payment_intent.succeeded`. Corroborate against `docs.stripe.com/checkout/fulfillment`
  at implementation time; if wrong, both events still fire and are idempotent against the same
  dedupe/ordering scheme (an efficiency risk, not a correctness one). — PAY-04.
- **D-16:** Confirming a booking from the browser's `return_url` handler is the anti-pattern this
  phase must not build — TWINT and any 3DS/redirect challenge leave the page entirely; the
  webhook is the only source of truth (project's own `PITFALLS.md` Pitfall 6, cited not
  re-derived). The confirmation page's initial render is always a "processing" state that polls
  or subscribes for the webhook-driven status flip. — PAY-04, PAY-07.
- **D-17:** (research Pitfall 4) `booking_notifications`'s claim-then-send pattern needs an
  explicit stuck-row sweep to guarantee "never zero-send," not only "never double-send." Build
  the sweep target list this phase (the `booking_notifications_pending` partial index already
  exists, Phase 2) — the daily cron wiring for `reminder_24h` stays Phase 9, but only
  `confirmation` needs to actually run here, and the sweep pattern should be written generically
  since Phase 9 reuses it. — PAY-05, PAY-06.

### Confirmation email and calendar invite (PAY-06)
- **D-18:** (research D-13) `packages/emails` ships exactly one template this phase:
  `confirmation` (`booking_notifications.kind = 'confirmation'`). The other `kind` values already
  exist in the Phase 2 schema's CHECK list for forward-compatibility only — PAY-06 names only the
  confirmation email. — PAY-06.
- **D-19:** (research D-14) `booking_notifications` supports the documented
  INSERT-then-UPDATE(`sent_at`) claim-then-send pattern because it is **not** one of the four
  append-only-enforced tables (verified by reading `0016_append_only.sql`'s actual trigger
  attachments directly — the append-only list is `price_snapshots`, `price_snapshot_legs`,
  `booking_events`, `booking_refunds`, `audit_log`, `consent_log`; `booking_notifications` is
  absent). Buildable as designed, no Phase-4-style contradiction to fix. — PAY-06.
- **D-20:** `ics` (`createEvent()`) generates the calendar attachment — never a hand-built `.ics`
  string. RFC 5545 line-folding, `VTIMEZONE`, and comma/semicolon escaping are exactly the
  "deceptively complex" class of problem this project's Don't-Hand-Roll principle targets. —
  PAY-06.

### Checkout page port (PAY-01)
- **D-21:** (research D-15) Port `checkout.dc.html` **without** its `Radio` payment-method group
  (Card/PayPal/Cash) and without `payLabelCash`/`payCashDesc` — replace with the mounted Stripe
  Element, which renders its own method picker. PayPal has no Swiss-merchant Stripe support
  (`OWNER-ANSWERS.md`); cash-to-driver is explicitly "No" (ADR-014 §6). Both post-date the mock —
  this is one of the rare cases where CLAUDE.md's "mocks are final" rule is explicitly superseded
  by a later, dated owner decision (the same pattern already applied to the mock's Van-7 capacity
  in Phase 4 D-38). — PAY-01.
- **D-22:** The checkout page's mock ships **English and German only** (direct read of
  `checkout.dc.html`'s `T` dictionary — no `fr`/`ar` block). The port adds French and Arabic in
  the same pass, including RTL layout (CLAUDE.md Law 03). The confirmation email template is new
  work with no mock precedent, so it carries no gap to inherit. — PAY-01, PAY-06.
- **D-23:** ADR-004's cost note is still binding: checkout must state the charge currency in
  words, not only imply it via the mark, in all four languages. ADR-014 §1 repeats this as an
  open item for Phase 7. Exact copy and placement (Stripe's own guidance: "near the order total")
  is `/gsd:ui-phase 7` / discuss-phase territory, not settled here — see Open Question 2 below
  under Claude's Discretion. — PAY-01, ADR-004.
- **D-24:** ADR-005's settings-driven cancellation string (the 24 h free-cancellation promise,
  already a `settings_versions` value per Phase 2 D-10/D-35) is read on the checkout page port,
  not re-hard-coded as prose — the same discipline the mock's hard-coded string was converted
  away from. — PAY-01.

### No two sources of truth (webhook/payment-method gating, kept close to its finding)
- **D-25:** (research Pitfall 2) The illustrative PaymentIntent code in `04-API-CONTRACT.md`/
  `quote-lock-expiry.md` is genuinely correct for a CHF-only design; it simply predates the
  ADR-014 §1 reconciliation. Keep its **sequencing and error-handling logic** verbatim (pre-flight
  read → Stripe call outside the DB transaction → one DB transaction → compensating cleanup on
  gate failure); swap only the object type (Checkout Session) and the cancel call
  (`sessions.expire()`) per D-04/D-07/D-08. — PAY-02.

### Execution-time check the plan must run (research uncertainty, with fallback)
- **D-26:** (Assumptions Log A3 / research UNCERTAIN U-01) The exact Stripe Checkout `ui_mode`
  value for the fully-custom Elements integration is unresolved between sources — `'custom'` in
  some docs, `'elements'` in Stripe's own Adaptive Pricing testing example. This research could
  not fully reconcile the two. **Confirm against Stripe's live API reference (or a first test-mode
  `sessions.create()` call, which fails fast on a wrong enum value) before writing the final
  handler** — cheap to discover, should not be found by trial and error against a live account
  once real work depends on it. Blocks P3 (the `/api/checkout/intent` route). — PAY-02.

### Owner blocker touching this phase's exit bar (Law 04 tension — not resolved here)
- **D-27:** Owner-gated, explicitly not resolved here. `pricing_live=false` means
  `/api/checkout/intent` 409s for every caller while no `rate_versions` row is `status='live'` —
  by design, no off switch (QUOTE-10). A genuine Stripe test-mode charge-to-webhook-to-confirmation
  E2E proof therefore needs **at least one `status='live'` `rate_versions` row** reachable by the
  test. Phase 2's own precedent (`charge_gate.test.sql`'s synthetic 1/2/3-rappen fixture,
  explicitly commented "rolled back, never a real CHF amount") and Phase 4's own P8 tier (staging
  `PRICING_PREVIEW`) both establish that a **staging-only, clearly-labeled, never-seeded,
  never-production synthetic test rate version** is the established pattern for this — but
  CLAUDE.md's Law 04 is written strictly enough ("never invent a CHF price anywhere — not in a
  migration, the seed, a fixture, or a screenshot") that this must not be assumed silently either
  way. **Options, not a decision:** (a) a sacrificial staging-only rate version carrying an
  absurd sentinel value that could never be mistaken for a real fare, or (b) the owner's real
  matrix, entered in test mode only. **This needs explicit owner sign-off before Phase 7's E2E
  proof plan (P8) is executed.** — Owner Blockers item 5, gates P8 only, not P1–P7.

### Remainder (2026-09-07) — supersedes where it conflicts

D-01…D-26 stay. D-21 (no PayPal / cash radios, Stripe Element only) stays. D-16 (webhook
confirms, browser return does not) stays. **D-27 is resolved for remainder E2E:** hosted live
book is `rate_versions` id 4. Do not invent CHF. Do not seed a sentinel fare.

- **D-28:** Finish Phase 7 on `vamostaxi.site` via Worker **`vamos`**, branch **`phase-7`**, not
  a merge to `main`. Nothing in the pay path stays mock. Then UAT (`07-UAT.md`). Not Phase 8.
  Deploy only after the owner says continue. Printed Worker name must be `vamos`. Never recreate
  `vamos-web-staging`. Never `git pull origin/phase-7`. Never push `main`.
- **D-29:** Home Continue does the real quote lock (`POST /api/quote`), then checkout with
  `quote_id` + lock. Checkout **also** reads `vamosTrip` so pickup, destination, date/time, class,
  extras they already typed are not blank. Stripe charges the **lock**, never the localStorage
  price.
- **D-30:** Three unique URLs, four languages same pass:
  `/checkout/trip` — dedicated trip page (places, date/time, class cars), editable, **not** home.
  `/checkout/details` — passenger / contact; sign-in or guest (D-39).
  `/checkout/payment` — Individual vs Company (D-36) + Stripe Element and/or pay-link (D-37).
  StepIndicator maps to those URLs. Clicking Trip from details stays on `/checkout/trip`.
- **D-31:** **One 24-hour rule** for card and pay-link. The price they saw is held 24 hours.
  Same number for both. 15-minute and 30-minute checkout windows are removed for this remainder
  (supersedes ADR-014 §5 / Phase 4 D-43 30-minute clock). Clock starts when Continue mints or
  refreshes the quote lock. Editing trip and Continue again starts a new 24h lock. After 24h
  unpaid: lock dead, pay-link dead, they start the booking flow from home. Email must say the
  link dies after 24 hours.
- **D-32:** During the 24h window, if the live book moves, they still pay the locked price and
  see a notice that the live price changed. Never charge a price that is not on the lock.
- **D-33:** Signed-in customer who leaves for days: account shows **Finish payment**; trip is
  kept; if the 24h lock is dead, price is live (new lock). Guest without an unpaid `VT-` who
  leaves for days starts over. Full `/bookings` history stays Phase 8.
- **D-34:** Card self-pay: customer sees `VT-` **only after** webhook pay. Pay-link: `VT-` is
  minted when the pay-link email is sent; status is unpaid (“sent by link, not paid yet”) until
  webhook, then confirmed paid. Manage-by-reference shows that status. Rows: bookings + legs +
  snapshots + payments. Real `VT-` from `next_booking_reference()`.
- **D-35:** Whoever pays first wins (booker card or pay-link). One booking, one charge. The
  second pay is refused, not a second `VT-`.
- **D-36:** Payment step: **Individual** or **Company**. Individual: personal details, card.
  Company: name, address, VAT required; then card **or** send pay-link. Not an invoice, not
  PayPal, not cash. Company billing is stored on the booking and shown on the voucher.
- **D-37:** Pay-link: extra payer email on payment, prefilled from the passenger email, they
  can change it to finance@. We **email first** (required). Then they may copy / WhatsApp
  (`wa.me/41796267082` is public contact, not the pay-link channel). Pay-link mail goes to
  passenger **and** payer so both can pay. Resend allowed, same `VT-`, 24h does **not** restart.
  Payer opens a **Vamos** page (trip summary + Stripe Element), never Stripe-hosted chrome.
- **D-38:** After money: confirmation email to passenger + payer if different. Voucher, manage
  link, `.ics`. Booking locale en/de/fr/ar. Arabic RTL. Replay does not send a second mail.
- **D-39:** Guest on details fills name / email / phone like sign-up **without a password**.
  Saved as a customer row, not an account. Later sign-up with the same email + password claims
  those bookings. Thin AUTH-06 folded into this remainder.
- **D-40:** Unmock `/confirmation/{ref}` in the same remainder (`middleware.ts` still maps
  `/confirmation` → DC mock on this branch). Dummy-card E2E and confirmation email arriving are
  in remainder. Ops board / dispatch / `#support` are not.

</decisions>

### Claude's Discretion
- Open Question 1 (research, "Open Questions" §1): whether the checkout page should suppress
  `SiteHeader`'s own "Book a transfer" CTA while a payment is in progress. The mock does not set
  `cta="{{ no }}"` on either checkout or confirmation. Recommendation from research: leave the CTA
  visible unless `/gsd:ui-phase 7` (if run) flags it as a real risk — this is UX polish, not a
  correctness question, and the planner may decide either way.
- Open Question 2 (research, "Open Questions" §2): the exact copy and placement for the
  charge-currency-in-words string (D-23) is `/gsd:ui-phase 7` / discuss-phase territory — write
  the string in the same pass as the rest of the page's copy, in all four languages, placed near
  the order total per Stripe's own guidance, and treat the exact wording as the planner's or the
  UI phase's call.
- Whether Resend's native `react:` send parameter or `@react-email/render` + `html:` is used to
  render the confirmation template (Assumptions Log A1) — both work; pick either at
  implementation time.
- File/module granularity inside `apps/web/lib/checkout/` and `packages/emails/src/` beyond what
  the research's "Recommended Project Structure" names.
- Exact stuck-row sweep threshold for D-17 (research suggests "e.g., 5 minutes" — illustrative,
  not a locked number).
- Whether the FX migration (D-11) lands as its own file or folds into whoever executes Phase 2
  Wave 6's `…014_payments_refunds.sql` — a landing-order/coordination call, not a design one.
- Deep-link to a later checkout step without earlier data: bounce to the first incomplete step.
- Company VAT/address: store on the booking and show on the voucher. Not a Swiss QR-bill / e-invoice.
- Exact four-language copy for the “live price changed, your locked price still holds” notice
  and the 24h-dead pay-link email line. No invented CHF in source; format at runtime.
- `quote_lock_deadline` / `checkout_window_minutes` become 24 hours via settings, not a
  hardcoded Worker clock. Do not invent other policy numbers.

### Proposed plan split `[informational]`
Reproduced from 07-RESEARCH.md's "Proposed Phase 7 plan split" — a recommendation the planner may
adopt, adapt or replace; not a locked decision. The coverage gate should not treat this table or
the wave diagram as D-NN items.

| # | Plan | Goal (one line) | File scope | Depends on | Parallel with |
|---|---|---|---|---|---|
| **P1** | **FX schema addition** | `booking_payments` gets FX columns, relaxed CHECK, unchanged charge gate (D-11) + pgTAP proving the gate is unmodified | `<ts>_payment_fx.sql`, `tests/charge_gate_fx.test.sql` | Phase 2 Wave 6 landing (coordinate timing) | nothing (schema gate) |
| **P2** | **Checkout-creation RPC** | `public.checkout_create_booking(...)` (D-01): booking + legs + snapshot bind + coupon lock + payment-attempt row + manage-token mint, one transaction; pgTAP proving the RLS-grant model | `<ts>_checkout_rpc.sql`, `tests/checkout_rpc.test.sql` | P1 | nothing |
| **P3** | **`/api/checkout/intent` Worker route** | Phase 4's quote re-check + Stripe Checkout Session creation (Adaptive Pricing, `automatic_payment_methods`, `expand: payment_intent`) + call P2's RPC + `sessions.expire()` compensation | `app/api/checkout/intent/route.ts`, `lib/checkout/stripe.ts` | P2 | nothing |
| **P4** | **Checkout page port** | `checkout.dc.html` → Client Component; drop PayPal/Cash (D-21); mount Stripe Elements inside existing chrome; four-language pass; RTL check | `app/(public)/checkout/page.tsx`, i18n additions | P3 | P5 |
| **P5** | **Webhook route + Queue consumer** | `POST /api/stripe/webhook` (D-13); `queue()` consumer state machine, ordering (D-14) | `app/api/stripe/webhook/route.ts`, `worker.ts`, `lib/checkout/webhook-verify.ts` | P1 | P4 |
| **P6** | **Confirmation email + calendar invite** | `ConfirmationEmail.tsx` (4 languages), `ics` generation, claim-then-send (D-19) | `packages/emails/src/*` | P2, P5 | P7 |
| **P7** | **Confirmation page** | `/confirmation/[ref]` SSR: "processing" state polls/subscribes (D-16), then renders reference/route/time/vehicle/amount paid | `app/(public)/confirmation/[ref]/page.tsx` | P3, P5 | P6 |
| **P8** | **E2E proof + owner-blocker-aware test fixture** | Stripe CLI local webhook forwarding; the staging-only synthetic test rate version (**pending explicit sign-off**, D-27); full test-mode E2E; TWINT sandbox pass; out-of-order/duplicate webhook simulation | test harness scripts, staging seed fixture (gated) | P1–P7 | nothing (phase gate) |

```
P1 ── P2 ── P3 ──┬── P4 ──┐
                  ├── P5 ──┼── P6 ── P8
                  │        └── P7 ──┘
                  └────────────────┘
```
Wave 1: **P1**. Wave 2: **P2**. Wave 3: **P3**. Wave 4: **P4** and **P5** in parallel
(file-disjoint). Wave 5: **P6** and **P7** in parallel (file-disjoint). Wave 6: **P8**, the phase
gate, blocked on the owner sign-off in D-27.

P1–P8 landed as **07-01…07-10** (paper SUMMARYs). **Do not re-plan or re-execute them.**

### Remainder plan split `[informational]` (planner may adapt; 07-11+)

| # | Goal (one line) | Notes |
|---|-----------------|-------|
| **R1** | 24h quote lock + price-changed notice + expire → start over | Settings `checkout_window_minutes` / `quote_lock_deadline`; supersedes 30 min |
| **R2** | Three routes `/checkout/trip` `/details` `/payment` + `vamosTrip` + lock | Pixel-faithful DC; four languages |
| **R3** | Home Continue = real `/api/quote` lock then checkout | `app/home/home.dc.html` mock seam |
| **R4** | Guest details without password + later email claim | D-39 |
| **R5** | Individual vs Company billing (name/address/VAT) | D-36; not an invoice |
| **R6** | Pay-link email + whoever-pays-first + 24h dead link | D-34 D-35 D-37; Vamos payer page |
| **R7** | Account Finish payment for signed-in unpaid checkout | D-33; not full `/bookings` |
| **R8** | Unmock `/confirmation/{ref}` (drop DC_PAGES map) | D-40 |
| **R9** | Staging deploy Worker `vamos` + dummy-card E2E + confirmation email | Owner-gated deploy; then UAT |

Wave order is the planner's job. R9 is last and owner-gated. File-disjoint waves may run parallel.

<code_context>
## Existing Code Insights

### Reusable Assets
- `apps/web/app/[locale]/checkout/{page.tsx,CheckoutClient.tsx,PaymentPanel.tsx,checkout.css}` — single Next checkout + StepIndicator + Stripe Payment Element. Remainder splits this into three routes. Already drops PayPal/cash. Reads `checkoutWindowMinutes` from `quote_settings_version()`.
- `apps/web/app/[locale]/confirmation/[ref]/{page.tsx,ConfirmationClient.tsx}` — Next confirmation exists on this branch; live URL still DC because middleware maps `/confirmation`.
- `apps/web/lib/quote/lock.ts` — HMAC quote lock. Comments still say 30-minute lock; remainder is 24h via Postgres `quote_lock_deadline()`, not a Worker wall clock.
- `apps/web/lib/booking-draft.ts` — draft + `idempotencyKey` minted once per quote.
- `public.checkout_create_booking(...)` — already on `phase-7` (07-02). Do not duplicate snapshot SQL.
- Stripe test keys / `STRIPE_WEBHOOK_SECRET` already on Worker `vamos`. Do not echo secrets.

### Established Patterns
- Stripe Checkout Session `ui_mode` = `elements` (07-04). Charge CHF. Adaptive Pricing. No `payment_method_types`.
- Webhook fast-ack + Queue consumer confirms. Browser `return_url` never confirms.
- `asCheckout` / `asSystem` only in Route Handlers (`export const dynamic = "force-dynamic"`). Ban #5.
- Amounts `CHF 000` in source; format at runtime. No invented fares.
- Four languages + RTL in the same pass. Design tokens `--vt-*` only. No glow. No tinted yellow.

### Integration Points
- `apps/web/middleware.ts` — `/checkout` already removed from `DC_PAGES` on this branch; `/confirmation` still maps to `/app/pages/confirmation.html`. `origin/main` still maps `/checkout` to the DC mock (live Worker tracks `origin/main`).
- `app/home/home.dc.html` — Continue is `saveTrip` then `location.href = '/checkout'`. Remainder must lock via `/api/quote` then go to `/checkout/trip`.
- `app/pages/account.html` / `/bookings` — DC. Remainder adds Finish payment only, not the Phase 8 board.
- `app/pages/manage-booking.html` — guest lookup by reference; must show unpaid pay-link vs confirmed.
- Live host: `https://vamostaxi.site`. Ops: `https://dashboard.vamostaxi.site`. Public phone/WhatsApp `+41 79 626 70 82`.

</code_context>

<specifics>
## Specific Ideas

- The RPC, by name and shape: `public.checkout_create_booking(p_quote_id, p_vehicle_class_id,
  p_contact, p_locale, p_idempotency_key, p_coupon_code, p_stripe_payment_intent_id,
  p_charged_rappen, p_charged_currency, p_fx_rate, p_fx_source, p_presentment_amount_minor)
  returns table (booking_id, reference, manage_token)` — `security definer set search_path = ''`,
  `revoke all ... from public`, `grant execute ... to anon, authenticated`. On an
  `bookings_idempotency` unique violation, SELECT and return the existing row instead of raising
  (the U20 retry-safety contract Phase 4 named and left for this phase to answer).
- The two Hyperdrive-adjacent Stripe helper modules, by name: `lib/checkout/stripe.ts` (client
  construction via `Stripe.createFetchHttpClient()`), `lib/checkout/webhook-verify.ts`
  (`constructEventAsync` + `createSubtleCryptoProvider` wrapper).
- Standard stack, version-verified 2026-08-24: `stripe@22.5.0`, `@stripe/stripe-js@9.14.0`,
  `@stripe/react-stripe-js@6.8.2`, `resend@6.22.0`, `@react-email/components@1.0.12`,
  `@react-email/render@2.1.0`, `ics@3.12.0`. All eight packages (including `react-email` dev
  tooling) passed both `slopcheck` and direct npm-registry legitimacy checks — no `[SLOP]`/`[SUS]`
  verdicts. `@react-email/render` and `ics` are tagged `[ASSUMED]` provenance (training-knowledge
  discovery, not a fetched official doc this session) — gate their first install behind a
  lightweight human-verify checkpoint per the project's provenance rule, even though the practical
  risk reads as low.
- Install commands: `pnpm add --filter web stripe @stripe/stripe-js @stripe/react-stripe-js`;
  `pnpm add --filter @vamos/emails resend @react-email/components @react-email/render ics`.
  Re-run `npm view <pkg> version` at Wave 0 rather than trusting these numbers if more than a few
  days have passed — Stripe's Adaptive Pricing/Checkout Elements APIs are actively evolving.
- Test commands: `pnpm --filter @vamos/db run test:db supabase/tests/checkout_rpc.test.sql`
  (pgTAP), `pnpm --filter web exec vitest run lib/checkout` (Vitest), `pnpm test:visual --
  checkout-guest.spec.ts` / `confirmation.spec.ts` (Playwright, 4 breakpoints × en/de minimum per
  CLAUDE.md).
- Security posture already established and reused unchanged: manage-token hash-before-Postgres
  (Phase 2), webhook HMAC via the SDK never hand-rolled, zod boundary rejecting any
  client-supplied `distance_m`/`total_rappen`/`rate_version_id`/`lines`, `STRIPE_SECRET_KEY`/
  `STRIPE_WEBHOOK_SECRET` via `wrangler secret put` only (never `NEXT_PUBLIC_*`, enforced by the
  existing Phase 1 CI gate), PCI scope never touching `apps/web`'s JS or the Worker (Stripe's
  iframe boundary, SAQ A-eligible by construction).
- The threat register already covers: retried/double-submitted checkout POST (idempotency key +
  two partial unique indexes, Phase 2), forged webhook payload (signature verification), replay
  of a legitimate past webhook (`stripe_events` PK + `processed_at`), client-supplied price
  smuggled into the intent body (zod + server-side re-derivation regardless), manage-token leak
  via logs (hash-before-Postgres, never log the raw token).

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase research (primary source for this CONTEXT)
- `.planning/phases/07-checkout-payment/07-RESEARCH.md` — the full synthesis: Architectural
  Responsibility Map (~line 52), Standard Stack + Package Legitimacy Audit (~112–181), Patterns
  1–3 (~266–437), Anti-Patterns and Don't Hand-Roll (~403–442), Common Pitfalls 1–5 (~444–513),
  the Decisions table D-01…D-16 (~577–594), the Assumptions Log incl. A3/UNCERTAIN U-01
  (~602–612), Open Questions 1–2 (~614–632), Validation Architecture (~656–692), Security Domain
  (~693–716), Owner Blockers 1–5 (~718–753), the 8-plan/6-wave split (~754–778).

### Phase 2 artifacts this phase binds to
- `.planning/phases/02-data-schema-rls-staff-auth-foundations/02-06-PLAN.md` `<interfaces>`
  (the exact `price_snapshots`/`booking_payments`/`booking_refunds`/`stripe_events`/
  `booking_notifications`/`coupon_redemptions` column contract this phase writes against) and
  `<deferred>` (the explicit F-14 hand-off this phase resolves via D-11).
- `.planning/phases/02-data-schema-rls-staff-auth-foundations/02-CONTEXT.md` — D-06 (rappen
  domain), D-07/D-08 (snapshot shape, i18n line labels), D-09 (`pricing_live` as a row with no off
  switch), D-10 (`settings`/`settings_versions` split — the ADR-005 cancellation string), D-11
  (one snapshot per booking, per-leg subtotals), D-12 (booking reference format), D-18 (append-only
  layers and the `booking_payments` whitelist exception), D-19 (redact-in-place, never delete).
- `.planning/phases/02-data-schema-rls-staff-auth-foundations/02-SCHEMA-DRAFT.md` §9 (the price/
  policy snapshot, payments/refunds, charge gate), §14a (no INSERT policy on `bookings` for
  `authenticated` — the reason D-01 exists).
- `packages/db/supabase/migrations/20260823000004_settings.sql` — direct read of the actually
  executed `settings_versions` columns (ground truth over stale schema-draft prose).

### Phase 3 artifacts this phase binds to
- `.planning/phases/03-hyperdrive-data-access-wiring/03-CONTEXT.md` — the `withIdentity`/
  `asAnon`/`asCustomer`/`asQuote` wrappers this phase's Worker code must call through (never a
  raw `postgres` import); the FC-04 hand-off explicitly named at the bottom of its `<deferred>`
  block ("the checkout INSERT that uses a definer RPC inside `asAnon`/`asCustomer` is Phase 7").

### Phase 4 artifacts this phase binds to
- `.planning/phases/04-quote-pricing-engine/04-CONTEXT.md` — D-23 (the two clocks: quote-lock
  expiry vs. payment-window `expires_at`, never extended), D-24/D-27/D-28 (the HMAC quote lock,
  pinned extras/coupon, `kid.payload.mac` rotation), D-43 (payment/checkout window is the same
  30-minute clock as the quote lock, ADR-014 §5), D-57 (`idempotency_key` is required on
  `/api/checkout/intent`, forwarded, not derived from `quote_id` — this phase answers the U20
  retry-safety question), D-21/D-22 (one snapshot row per booking, for the chosen class, written
  inside the booking transaction — `/api/quote` itself writes nothing).
- `.planning/phases/04-quote-pricing-engine/04-API-CONTRACT.md` §6 — the checkout-intent quote
  re-check steps 1–5 this phase reuses verbatim; its illustrative PaymentIntent object-type sketch
  is corrected by D-08.

### Architecture decisions that bind this phase
- `.planning/ADR-004-currency-display-only.md` — **partially superseded by ADR-014 §1**: the
  display/charge rule replaced by Stripe FX conversion; the schema half (one CHF amount, no
  per-currency columns) still stands. Its cost note ("the charge currency must be stated in words")
  is still binding on this phase's checkout copy (D-23).
- `.planning/ADR-005-cancellation-copy-settings-driven.md` — the 24 h cancellation promise reads
  from `settings_versions`, not hard-coded prose, on every site that quotes it including checkout
  (D-24).
- `.planning/ADR-014-owner-sitting-2026-08-22.md` — **the most recent binding source for Phase 7.**
  §1 currency (Stripe Checkout page, FX conversion, "Not decided here (Phase 7)": exact Stripe
  wiring, mid-Checkout currency change vs. locked CHF total, the four language strings — all
  addressed by this CONTEXT's decisions), §4 accounts (Stripe/Resend created when asked, test-mode
  keys available immediately), §5 policy numbers (manage-link validity 30 days, payment/checkout
  window 30 minutes — same clock as the quote lock), §6 product (cash-to-driver "No", abandoned
  coupon does not burn — consumed at payment).

### Requirements and roadmap
- `.planning/ROADMAP.md` § Phase 7 — goal, four success criteria, `PAY-01…07`, `UI hint: yes`.
- `.planning/REQUIREMENTS.md` — PAY-01…PAY-07 in full (lines 75–81); QUOTE-10 (line 70), LIFE-03
  (line 87), DATA-08 (line 48) — the requirements this phase touches without closing; status table
  lines 205, 221, 223–229, 232.

### Runtime contract this phase ports
- `app/pages/checkout.dc.html` — the field lists, `Radio` payment-method group (to be dropped,
  D-21), and the price-line renderer the snapshot shape maps onto with no UI change.
- `app/pages/confirmation.dc.html` — the reference/route/time/vehicle/amount-paid layout this
  phase's SSR page ports, plus the 24h cancellation-promise sites ADR-005 names.
- `packages/emails/` — the empty scaffold (`main: index.ts` pointing at a non-existent file) this
  phase fills with its first real template.

### Project rules
- `CLAUDE.md` — Law 03 (four languages, same pass, ICU, Arabic first-class RTL) — applies to the
  checkout page port (D-22) and the confirmation email template equally; Law 04 (a pending value
  is a labelled gap — the `pricing_live` boundary this phase must stay buildable and testable
  behind, D-27).
- `.claude/CLAUDE.md` — the fixed stack (Stripe standard not Connect, Resend, Cloudflare Queues),
  the security posture (Stripe webhook signature verification, idempotent booking/payment
  creation, audit trail on booking/price/payment changes) this phase is the primary implementer
  of.

### Remainder (2026-09-07) — extra refs
- `.planning/phases/07-checkout-payment/07-01-SUMMARY.md` … `07-10-SUMMARY.md` — landed paper; do not re-execute.
- `.planning/phases/07-checkout-payment/07-UAT.md` — `status: partial`; Test 1 blocker (live checkout is mock). Resume after staging cutover, not before.
- `apps/web/middleware.ts` — DC_PAGES; `/confirmation` still mock.
- `apps/web/app/[locale]/checkout/` — Next port to split into three routes.
- `apps/web/lib/quote/lock.ts` — HMAC lock; 24h via `quote_lock_deadline()`.
- `~/.hermes/profiles/vamos/skills/software-development/vamos-gsd-execute/references/phase-07.md` — Stripe test wiring, Worker `vamos`, no Stripe Projects.
- Public phone/WhatsApp: `+41 79 626 70 82` (`wa.me/41796267082`).

</canonical_refs>

<deferred>
## Deferred Ideas

Owner/counsel-only or later-phase items the research raised that are not trackable Phase 7
engineering decisions — each needs a person or a later phase, not a plan task, to answer. None of
these block P1–P7; only D-27 (above, tracked as a decision because it gates P8's execution) needs
resolution before this phase's own E2E proof runs.

- **Owner Blocker 1 — the Stripe account does not exist yet.** Owner creates when asked (ADR-014
  §4). De-risked: test-mode API keys are issued immediately on signup, before full CH-entity
  business verification completes, so this phase's build and most of its testing can proceed
  before verification finishes. Live keys/webhook endpoint are a Phase 11 launch-checklist item.
- **Owner Blocker 2 — Stripe Adaptive Pricing enablement is unverifiable until the account
  exists.** Confirm in Settings → Adaptive Pricing once created. CH is not in Stripe's documented
  exclusion list (only India is named) — a "must confirm" step, not an expected problem.
- **Owner Blocker 3 — TWINT enablement** requires the account to exist and a CH entity to receive
  TWINT payouts — toggle in Settings → Payment methods once available.
- **Owner Blocker 4 — the Resend account does not exist yet.** Owner creates when asked (ADR-014
  §4). Production sending-domain DNS verification is needed before real `@vamostaxi.eu` email;
  Resend's own sandbox mode should unblock Wave 0 development — confirm at Wave 0 rather than
  assuming.
- **Open Question 2's exact copy** for the charge-currency-in-words string is `/gsd:ui-phase 7`
  territory (see Claude's Discretion above) — noted here again because it is also an ADR-004
  compliance item, not purely a cosmetic one.
- **Cancellation-tier refund math (LIFE-02/03).** This phase ships only the `booking_refunds` row
  shape and the Stripe refund call contract (D-12 confirms no FX columns are needed there); the
  actual tier calculation from the policy snapshot is Phase 9.
- **`checkout_abandon_release_minutes`.** Phase 4's D-55 flagged this as "Phase 5/7" work (how
  long to wait before releasing a soft coupon reservation); 07-RESEARCH.md does not address it.
  Still open — the planner should either resolve it in this phase or explicitly re-defer it to
  Phase 9, but should not invent a number.
- **The other five `booking_notifications.kind` templates** (`reminder_24h`, `assignment`,
  `review_request`, `cancellation`, `refund`, `manage_link_resend`) — Phase 8/9, same table shape
  this phase's `confirmation` template establishes the pattern for.
- **The guest-booking → account claim UI/email flow.** Thin path is **in remainder** (D-39):
  guest details without password; later signup with same email claims bookings. Full account
  bookings list stays Phase 8 except Finish payment (D-33).
- **The CHF price matrix.** Remainder E2E uses hosted `rate_versions` id 4. Do not invent CHF.
  Public still `CHF 000` until a published quote paints. Phase 11 is live Stripe keys + DNS.

</deferred>

---

*Phase: 07-checkout-payment*
*Context gathered: 2026-08-24 via research express path; remainder 2026-09-07*
